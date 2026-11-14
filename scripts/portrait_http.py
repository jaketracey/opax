"""Serial, budgeted Wikimedia requests for the portrait pipeline.

Keep the shared source transport's identity and refusal checks. Portrait work
also stops at the first 429, rather than using its general retry policy.
The ignored request ledger counts requests across matcher/fetch/recrop runs.
"""
import json
import os
import time
from pathlib import Path
from urllib.parse import urlsplit

from parli.ingest import http as source_http

USER_AGENT = source_http.USER_AGENT
LEDGER = Path(__file__).resolve().parent / "_photos_work" / "requests.jsonl"
HOSTS = {"query.wikidata.org", "www.wikidata.org", "commons.wikimedia.org", "upload.wikimedia.org", "thumb.wikimedia.org"}
_last = 0.0


class Session(source_http.Session):
    def __init__(self):
        super().__init__()
        self.hooks["response"].insert(0, self._stop_throttled)

    @staticmethod
    def _stop_throttled(response, **kwargs):
        if response.status_code == 429:
            raise source_http.SourceRefused(response.url, "HTTP 429; portrait run stopped without retry")
        return response

    def send(self, request, **kwargs):
        global _last
        host = urlsplit(request.url).hostname
        if host not in HOSTS:
            raise ValueError(f"Portrait source outside Wikidata/Commons: {host}")
        rows = [json.loads(line) for line in LEDGER.read_text().splitlines()] if LEDGER.exists() else []
        if any(row.get("refused") for row in rows):
            raise SystemExit("Portrait run already refused; no further source requests")
        commons = host in {"commons.wikimedia.org", "upload.wikimedia.org", "thumb.wikimedia.org"}
        if commons and sum(row["commons"] for row in rows) >= int(os.environ.get("PHOTOS_COMMONS_BUDGET", "300")):
            raise SystemExit("Portrait Commons request budget exhausted")
        # Persist wall time across processes and reboots; use the monotonic
        # clock for the interval within this process.
        previous_wall = rows[-1].get("wall_time", 0) if rows else 0
        time.sleep(max(0, 1.0 - (time.monotonic() - _last), 1.0 - (time.time() - previous_wall)))
        _last = time.monotonic()
        row = {"url": request.url, "commons": commons, "at": _last, "wall_time": time.time()}
        try:
            response = super().send(request, **kwargs)
            row["status"] = response.status_code
            return response
        except source_http.SourceRefused as exc:
            row.update(refused=True, reason=exc.reason)
            raise
        finally:
            LEDGER.parent.mkdir(exist_ok=True)
            with LEDGER.open("a") as out:
                out.write(json.dumps(row) + "\n")


def get(url, **kwargs):
    with Session() as session:
        return session.get(url, **kwargs)
