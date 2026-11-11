"""Integrity Commission (Tasmania): source access gap.

On 11 November 2026 www.integrity.tas.gov.au (Cloudflare) answered the pipeline's identifying
client with HTTP 403 for /robots.txt and for /. A probe a few minutes earlier from a different
Python TLS stack had received HTTP 200 for the same paths, so the refusal is Cloudflare's bot
scoring of the client, not a page that is missing. OPAX does not pick a client, identity or
route to pass that scoring, so no records are loaded from the Commission's site. robots.txt
(read on the earlier probe) disallows /site-resources.

The Commission's reports to Parliament are also tabled in the Parliament of Tasmania. The
Parliament's site answers the agent, but its tabled papers lists
(/house-of-assembly/tabled-papers/<year>, /legislative-council/tabled-papers/<year>) are
rendered by a script from a separate data service, and that route is not built yet.

Each run asks for robots.txt once. A refusal pauses the source (exit 4, reported by the runner
as a known gap). If the host answers, the run stops with exit 3 so a maintainer can write the
listing parser against what the Commission actually publishes.
"""
from __future__ import annotations

import requests

from parli.ingest.integrity import common

BODY = common.Body(
    code="tas_ic", name="Integrity Commission", short="Tas Integrity Commission", jurisdiction="Tas",
    site="https://www.integrity.tas.gov.au", interval=3.0, max_requests=5,
    licence={"status": "copyright (Integrity Commission); reuse under the Tasmanian Government terms",
             "url": "https://www.tas.gov.au/codi",
             "attribution": "Integrity Commission (Tasmania)"},
)
GAPS = [
    "www.integrity.tas.gov.au (Cloudflare) answered the identifying OPAXBot client with HTTP 403 on 11 November 2026, "
    "so the Commission's reports are not collected automatically.",
    "The Karamu report (No. 1 of 2025) and the 2025-26 annual report are included from a manual publisher download "
    "supplied by the OPAX maintainer on 11 November 2026. Earlier tabled investigation reports are not included.",
    "Parliament of Tasmania tabled papers answer the agent, but the lists are rendered by a script from a separate data "
    "service; that official route is not built yet.",
    "webarchive.nla.gov.au (the official archive) answered the identifying agent with HTTP 403, so archived copies are not used either.",
]
MIN_RECORDS = 1
KNOWN_GAP = True  # reported as a gap by the runner; does not hold the other bodies


def collect(client: common.Client):
    if client.offline:
        raise common.Held("tas_ic: no cached source (known gap)")
    try:
        status, _, _ = client._raw(BODY.site + "/robots.txt")
    except (requests.Timeout, requests.ConnectionError) as exc:
        raise common.Held(f"tas_ic: no response to the identifying agent ({type(exc).__name__})") from None
    raise common.Held(f"tas_ic: host answered HTTP {status}; the listing parser is not written yet")
