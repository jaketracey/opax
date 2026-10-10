"""Serial, robots-aware HTTP for the federal feeds. Never bypass a refusal."""
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

USER_AGENT = "OPAXBot/1.0 (+https://opax.com.au/about; corrections@opax.com.au)"


class Refused(RuntimeError):
    pass


class Unavailable(RuntimeError):
    pass


def retry_seconds(value):
    if not value:
        return 0
    try:
        return max(0, float(value))
    except ValueError:
        return max(0, (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds())


class HonestHTTP:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        self.robots = {}
        self.last = 0
        self.delay = 1.0

    def _request(self, url):
        for attempt in range(3):
            time.sleep(max(0, self.delay - (time.monotonic() - self.last)))
            self.last = time.monotonic()
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with self.opener.open(req, timeout=120) as response:
                    body = response.read()
                    # A 200 challenge is also a refusal. Passive Cloudflare scripts
                    # on a usable Apache index do not constitute a challenge.
                    if response.headers.get("cf-mitigated") == "challenge" or \
                            b"<title>Just a moment" in body or b"cf-chl-widget" in body:
                        raise Refused("source challenged the honest agent")
                    return body
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403, 429):
                    # Respect Retry-After before returning; do not probe again.
                    time.sleep(retry_seconds(exc.headers.get("Retry-After")))
                    raise Refused(f"source refused the honest agent: HTTP {exc.code}") from None
                if exc.code == 404:
                    return None
                if exc.code not in (500, 502, 503, 504):
                    raise Unavailable(f"source returned HTTP {exc.code}") from None
                time.sleep(max(2 ** attempt, retry_seconds(exc.headers.get("Retry-After"))))
            except (urllib.error.URLError, TimeoutError):
                time.sleep(2 ** attempt)
        raise Unavailable("source unavailable after three serial attempts")

    def get(self, url):
        parts = urllib.parse.urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self.robots:
            body = self._request(origin + "/robots.txt")
            robot = urllib.robotparser.RobotFileParser()
            robot.parse((body or b"User-agent: *\nAllow: /").decode().splitlines())
            self.robots[origin] = robot
        robot = self.robots[origin]
        if not robot.can_fetch(USER_AGENT, url):
            raise Refused("robots.txt disallows the honest agent")
        self.delay = max(1.0, robot.crawl_delay(USER_AGENT) or 0)
        rate = robot.request_rate(USER_AGENT)
        if rate:
            self.delay = max(self.delay, rate.seconds / rate.requests)
        return self._request(url)
