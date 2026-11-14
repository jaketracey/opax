"""Serial, robots-aware HTTP for the federal feeds. Never bypass a refusal."""
from datetime import datetime, timezone
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from . import http as source_http

USER_AGENT = source_http.USER_AGENT
MAX_REDIRECTS = 5


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Close the response before the client checks robots and follows it.
        return None


class Refused(RuntimeError):
    def __init__(self, message, url=None):
        self.url = url
        super().__init__(message)


class Unavailable(RuntimeError):
    pass


class BudgetSpent(RuntimeError):
    """A caller's stage deadline was reached; no further request is allowed."""


def retry_seconds(value):
    return source_http.retry_after(value, now=datetime.now(timezone.utc).timestamp())


class HonestHTTP:
    def __init__(self, *, deadline=None, user_agent=None, allowed_origin=None):
        self.opener = source_http.build_opener(_NoRedirect())
        self.robots = {}
        self.last = 0
        self.delay = 1.0
        self.deadline = deadline
        self.user_agent = user_agent or USER_AGENT
        if self.user_agent not in (USER_AGENT, source_http.AUDIT_USER_AGENT):
            raise ValueError('unsupported source user agent')
        self.allowed_origin = allowed_origin

    def pause(self, seconds):
        if self.deadline is not None and time.monotonic() + seconds >= self.deadline:
            raise BudgetSpent('source request would exceed stage time budget')
        time.sleep(seconds)

    def remaining(self):
        seconds = 120 if self.deadline is None else min(120, self.deadline - time.monotonic())
        if seconds <= 0:
            raise BudgetSpent('stage time budget spent')
        return seconds

    def _request(self, url, *, expected_json=False, _redirects=None):
        source_http.ensure_allowed(url)
        for attempt in range(3):
            self.pause(max(0, self.delay - (time.monotonic() - self.last)))
            self.last = time.monotonic()
            try:
                headers = {"Accept": "application/json"} if expected_json else {}
                req = source_http.Request(url, headers=headers,
                                          audit=self.user_agent == source_http.AUDIT_USER_AGENT)
                with self.opener.open(req, timeout=self.remaining()) as response:
                    body = response.read()
                    source_http.check_response(response.geturl(), response.getcode(), body,
                                               response.headers, expected_json)
                    return body
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403, 429):
                    # Respect Retry-After before returning; do not probe again.
                    if self.deadline is None:
                        self.pause(retry_seconds(exc.headers.get("Retry-After")))
                    raise Refused(f"source refused the honest agent: HTTP {exc.code}", url) from None
                source_http.check_response(url, exc.code, exc.read(), exc.headers)
                if exc.code in (301, 302, 303, 307, 308) and exc.headers.get('Location'):
                    destination = urllib.parse.urljoin(url, exc.headers['Location'])
                    exc.close()
                    if _redirects is None:
                        raise Refused('robots.txt redirect refused: destination policy is unknown', destination)
                    if _redirects >= MAX_REDIRECTS:
                        raise Refused('source exceeded the redirect limit', destination)
                    # get() applies the same pause, robots and pacing policy to
                    # every hop, including another origin's cached robots rules.
                    return self.get(destination, expected_json=expected_json, _redirects=_redirects + 1)
                if exc.code == 404:
                    return None
                if exc.code not in (500, 502, 503, 504):
                    raise Unavailable(f"source returned HTTP {exc.code}") from None
                self.pause(max(2 ** attempt, retry_seconds(exc.headers.get("Retry-After"))))
            except (urllib.error.URLError, TimeoutError):
                self.pause(2 ** attempt)
        raise Unavailable("source unavailable after three serial attempts")

    def get(self, url, *, expected_json=False, _redirects=0):
        source_http.ensure_allowed(url)
        parts = urllib.parse.urlsplit(url)
        if self.allowed_origin and f'{parts.scheme}://{parts.netloc}' != self.allowed_origin:
            raise Refused('redirect outside the permitted source origin', url)
        if parts.scheme not in ('http', 'https'):
            raise Refused('source URL must use HTTP or HTTPS', url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self.robots:
            body = self._request(origin + "/robots.txt")
            robot = urllib.robotparser.RobotFileParser()
            robot.parse((body or b"User-agent: *\nAllow: /").decode().splitlines())
            self.robots[origin] = robot
        robot = self.robots[origin]
        if not robot.can_fetch(self.user_agent, url):
            raise Refused("robots.txt disallows the honest agent", url)
        self.delay = max(1.0, robot.crawl_delay(self.user_agent) or 0)
        rate = robot.request_rate(self.user_agent)
        if rate:
            self.delay = max(self.delay, rate.seconds / rate.requests)
        return self._request(url, expected_json=expected_json, _redirects=_redirects)
