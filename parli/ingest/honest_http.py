"""Serial, robots-aware HTTP for the federal feeds. Never bypass a refusal."""
from datetime import datetime, timezone
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from . import http as source_http

USER_AGENT = source_http.USER_AGENT


class Refused(RuntimeError):
    def __init__(self, message, url=None):
        self.url = url
        super().__init__(message)


class Unavailable(RuntimeError):
    pass


def retry_seconds(value):
    return source_http.retry_after(value, now=datetime.now(timezone.utc).timestamp())


class HonestHTTP:
    def __init__(self):
        self.opener = source_http.build_opener()
        self.robots = {}
        self.last = 0
        self.delay = 1.0

    def _request(self, url, *, expected_json=False):
        source_http.ensure_allowed(url)
        for attempt in range(3):
            time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
            self.last = time.monotonic()
            try:
                headers = {"Accept": "application/json"} if expected_json else {}
                req = source_http.Request(url, headers=headers)
                with self.opener.open(req, timeout=120) as response:
                    body = response.read()
                    source_http.check_response(response.geturl(), response.getcode(), body,
                                               response.headers, expected_json)
                    return body
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403, 429):
                    # Respect Retry-After before returning; do not probe again.
                    time.sleep(retry_seconds(exc.headers.get("Retry-After")))
                    raise Refused(f"source refused the honest agent: HTTP {exc.code}", url) from None
                source_http.check_response(url, exc.code, exc.read(), exc.headers)
                if exc.code == 404:
                    return None
                if exc.code not in (500, 502, 503, 504):
                    raise Unavailable(f"source returned HTTP {exc.code}") from None
                time.sleep(max(2 ** attempt, retry_seconds(exc.headers.get("Retry-After"))))
            except (urllib.error.URLError, TimeoutError):
                time.sleep(2 ** attempt)
        raise Unavailable("source unavailable after three serial attempts")

    def get(self, url, *, expected_json=False):
        parts = urllib.parse.urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self.robots:
            body = self._request(origin + "/robots.txt")
            robot = urllib.robotparser.RobotFileParser()
            robot.parse((body or b"User-agent: *\nAllow: /").decode().splitlines())
            self.robots[origin] = robot
        robot = self.robots[origin]
        if not robot.can_fetch(USER_AGENT, url):
            raise Refused("robots.txt disallows the honest agent", url)
        self.delay = max(1.0, robot.crawl_delay(USER_AGENT) or 0)
        rate = robot.request_rate(USER_AGENT)
        if rate:
            self.delay = max(self.delay, rate.seconds / rate.requests)
        return self._request(url, expected_json=expected_json)
