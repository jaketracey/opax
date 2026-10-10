"""Source HTTP policy: identify OPAX, respect throttling, preserve data on refusal.

SourceRefused deliberately exits through broad per-record Exception handlers.
Exit 4 is a preserved source, recognised by the refresh runners, never a success
that permits a staged/empty register to be applied.
"""
from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from functools import wraps
from html.parser import HTMLParser
import io
import json
import os
from pathlib import Path
import re
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

import requests

USER_AGENT = json.loads(Path(__file__).with_name("user-agent.json").read_text())["user_agent"]
PAUSED_HOSTS = {
    "www.aph.gov.au": "APH indexes, Senate interests and member list",
    "parlinfo.aph.gov.au": "ParlInfo committees, witnesses, bills and documents",
    "data.parliament.qld.gov.au": "Queensland Parliament data API",
    "hansardsearch.parliament.sa.gov.au": "South Australian Hansard",
}
PAUSE_MESSAGE = "source paused: honest agent refused (awaiting permission)"
class _ChallengeHTML(HTMLParser):
    """Recognise challenge markup, never a phrase inside ordinary source data."""
    def __init__(self):
        super().__init__()
        self.found = False
        self.in_title = False
        self.title = ""

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        self.in_title = self.in_title or tag == "title"
        marker = " ".join(values.get(k, "") or "" for k in ("id", "class"))
        if re.search(r"(?:^|\s)(?:cf-chl-[\w-]*|challenge-form|challenge-running)(?:\s|$)", marker, re.I):
            self.found = True
        if tag in ("script", "iframe") and re.search(r"/cdn-cgi/challenge-platform/|/_Incapsula_Resource", values.get("src", ""), re.I):
            self.found = True

    def handle_data(self, data):
        if self.in_title:
            self.title += data

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
            if re.match(r"\s*(?:just a moment|access denied|request (?:blocked|rejected)|attention required|robot check)", self.title, re.I):
                self.found = True


def is_challenge(body):
    sample = body[:131072]
    if isinstance(sample, bytes):
        sample = sample.decode("utf-8", "replace")
    # JSON/CSV descriptions may mention firewalls or include quoted markup.
    if not re.match(r"\s*(?:<!doctype\s+html|<html|<head|<title|<body|<form|<div)", sample, re.I):
        return False
    parser = _ChallengeHTML()
    parser.feed(sample)
    return parser.found


def expects_json(headers):
    accept = next((str(v).lower() for k, v in (headers or {}).items() if k.lower() == "accept"), "")
    return "json" in accept and not any(kind in accept for kind in ("html", "*/*"))


_lock = threading.Lock()
_next_at: dict[str, float] = {}
_logged: set[str] = set()
_status_lock = threading.Lock()


class SourceRefused(SystemExit):
    def __init__(self, url, reason):
        self.source = os.environ.get("OPAX_SOURCE_NAME") or urlsplit(url).hostname or "unknown"
        self.reason = reason
        path = Path(os.environ.get("OPAX_SOURCE_STATUS_FILE", "~/.cache/autoresearch/pipeline/source-access.json")).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)
        with _status_lock:
            try:
                state = json.loads(path.read_text())
            except (OSError, ValueError):
                state = {}
            state[self.source] = {"status": "paused", "reason": reason,
                                  "host": urlsplit(url).hostname,
                                  "checked_at": datetime.now(timezone.utc).isoformat(),
                                  "message": PAUSE_MESSAGE, "permission": "permission requested"}
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(state, indent=2) + "\n")
            tmp.replace(path)
            if self.source not in _logged:
                print(f"{PAUSE_MESSAGE}; source={self.source}; reason={reason}; existing data kept", flush=True)
                _logged.add(self.source)
        super().__init__(4)


def ensure_allowed(url):
    host = urlsplit(url).hostname
    if host in PAUSED_HOSTS:
        raise SourceRefused(url, "HTTP 403 verified 2026-10-10; permission requested")
    if host == "api.firecrawl.dev":
        raise SourceRefused(url, "honest identity without proxies is unverified; permission requested")


def check_response(url, status, body=b"", headers=None, expected_json=False):
    headers = {k.lower(): str(v).lower() for k, v in (headers or {}).items()}
    if status in (401, 403):
        raise SourceRefused(url, f"HTTP {status}")
    if headers.get("cf-mitigated") == "challenge" or "x-sucuri-block" in headers:
        raise SourceRefused(url, "challenge response header")
    if is_challenge(body):
        raise SourceRefused(url, "challenge/WAF page")
    content_type = headers.get("content-type", "").split(";", 1)[0].strip()
    if expected_json and status == 200 and content_type and not (content_type == "application/json" or content_type.endswith("+json")):
        raise SourceRefused(url, "expected JSON but source returned a different content type")


def retry_after(value, now=None):
    """Seconds or HTTP date, without truncating the site's requested wait."""
    if not value:
        return 0.0
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        try:
            date = parsedate_to_datetime(value)
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
            return max(0.0, date.timestamp() - (time.time() if now is None else now))
        except (TypeError, ValueError, OverflowError):
            return 0.0


def pace(url, interval=0.7):
    host = urlsplit(url).hostname or "unknown"
    with _lock:
        wait = _next_at.get(host, 0) - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _next_at[host] = time.monotonic() + interval


def honest_headers(headers=None):
    result = {k: v for k, v in (headers or {}).items() if k.lower() != "user-agent"}
    result["User-Agent"] = USER_AGENT
    return result


class Session(requests.Session):
    def __init__(self):
        super().__init__()
        self.trust_env = False  # no environment proxy or implicit credentials
        self.headers["User-Agent"] = USER_AGENT
        # Validate before callers see bytes, including redirects and streams.
        self.hooks["response"].append(self._check)

    @staticmethod
    def _check(response, **kwargs):
        ensure_allowed(response.url)
        check_response(response.url, response.status_code, response.content, response.headers,
                       expects_json(response.request.headers))
        return response

    def send(self, request, **kwargs):
        ensure_allowed(request.url)
        request.headers["User-Agent"] = USER_AGENT
        kwargs["proxies"] = {}
        return super().send(request, **kwargs)

    def request(self, method, url, **kwargs):
        ensure_allowed(url)
        self.headers["User-Agent"] = USER_AGENT
        kwargs["headers"] = honest_headers(kwargs.get("headers"))
        if kwargs.pop("expected_json", False):
            kwargs["headers"]["Accept"] = "application/json"
        kwargs["proxies"] = {}
        kwargs.setdefault("timeout", 60)
        for attempt in range(3):
            pace(url)
            response = super().request(method, url, **kwargs)
            if response.status_code not in (429, 503):
                return response
            delay = retry_after(response.headers.get("Retry-After"))
            if attempt == 2:
                response.close()
                raise SourceRefused(url, f"HTTP {response.status_code}; throttled, retry next run")
            response.close()
            time.sleep(max(delay, 2 ** attempt))


def request(method, url, **kwargs):
    with Session() as session:
        return session.request(method, url, **kwargs)


def get(url, **kwargs):
    return request("GET", url, **kwargs)


def post(url, **kwargs):
    return request("POST", url, **kwargs)


class Request(urllib.request.Request):
    def __init__(self, url, *args, **kwargs):
        super().__init__(url, *args, **kwargs)
        for key in list(self.headers) + list(self.unredirected_hdrs):
            if key.lower() == "user-agent":
                self.remove_header(key)
        self.add_header("User-Agent", USER_AGENT)


class _Response(io.BytesIO):
    def __init__(self, response, body):
        super().__init__(body)
        self.status = self.code = response.getcode()
        self.headers = response.headers
        self.url = response.geturl()

    def getcode(self): return self.status
    def geturl(self): return self.url
    def info(self): return self.headers


def open_url(opener, req, *args, **kwargs):
    if isinstance(req, str):
        req = Request(req)
    req.remove_header("User-agent")
    req.add_header("User-Agent", USER_AGENT)
    url = req.full_url
    ensure_allowed(url)
    for attempt in range(3):
        pace(url)
        try:
            with opener.open(req, *args, **kwargs) as response:
                body = response.read()
                check_response(response.geturl(), response.getcode(), body, response.headers,
                               expects_json(dict(req.header_items())))
                return _Response(response, body)
        except urllib.error.HTTPError as error:
            check_response(url, error.code, error.read(), error.headers)
            if error.code not in (429, 503):
                raise
            delay = retry_after(error.headers.get("Retry-After"))
            error.close()
            if attempt == 2:
                raise SourceRefused(url, f"HTTP {error.code}; throttled, retry next run") from None
            time.sleep(max(delay, 2 ** attempt))


class _Redirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        ensure_allowed(newurl)
        result = super().redirect_request(req, fp, code, msg, headers, newurl)
        if result is not None:
            result.add_header("User-Agent", USER_AGENT)
        return result


def build_opener(*handlers):
    # A caller's no-redirect handler must retain control (bill acquisition uses
    # redirect terminals as completeness evidence and never follows downloads).
    custom_redirect = any(
        isinstance(handler, urllib.request.HTTPRedirectHandler) or
        isinstance(handler, type) and issubclass(handler, urllib.request.HTTPRedirectHandler)
        for handler in handlers
    )
    redirects = () if custom_redirect else (_Redirect(),)
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), *redirects, *handlers)


def urlopen(req, *args, **kwargs):
    return open_url(build_opener(), req, *args, **kwargs)


def aiohttp_trace():
    """Force identity on async requests/redirects; validate before data is used."""
    import asyncio
    import aiohttp
    trace = aiohttp.TraceConfig()

    async def start(session, context, params):
        ensure_allowed(str(params.url))
        params.headers["User-Agent"] = USER_AGENT

    async def end(session, context, params):
        url = str(params.url)
        body = await params.response.read()
        check_response(url, params.response.status, body, params.response.headers,
                       expects_json(params.headers))
        if params.response.status in (429, 503):
            await asyncio.sleep(retry_after(params.response.headers.get("Retry-After")))
            raise SourceRefused(url, f"HTTP {params.response.status}; retry next run")

    async def redirect(session, context, params):
        target = params.response.headers.get("Location", "")
        from urllib.parse import urljoin
        ensure_allowed(urljoin(str(params.url), target))
        params.headers["User-Agent"] = USER_AGENT

    trace.on_request_start.append(start)
    trace.on_request_end.append(end)
    trace.on_request_redirect.append(redirect)
    return trace


def preserve_on_refusal(fetcher):
    """Keep a destructive register replacement atomic across source requests."""
    @wraps(fetcher)
    def guarded(db, *args, **kwargs):
        class StagedConnection:
            def __getattr__(self, name): return getattr(db, name)
            def commit(self): pass

        db.execute("SAVEPOINT source_access")
        try:
            result = fetcher(StagedConnection(), *args, **kwargs)
        except BaseException:
            db.execute("ROLLBACK TO source_access")
            db.execute("RELEASE source_access")
            raise
        db.execute("RELEASE source_access")
        return result
    return guarded
