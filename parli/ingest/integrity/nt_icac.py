"""Independent Commissioner Against Corruption (Northern Territory): source access gap.

On 11 November 2026 icac.nt.gov.au (Cloudflare) answered the pipeline's identifying client
with a Cloudflare challenge (HTTP 403, cf-mitigated: challenge). A probe minutes earlier from a
different Python TLS stack had received HTTP 200, so the refusal is Cloudflare's bot scoring of
the client. OPAX does not pick a client, identity or route to pass that scoring.

The official alternatives refuse too: parliament.nt.gov.au (tabled papers) answered the agent
with the same Cloudflare challenge, and Territory Stories (the NT Library archive of tabled
papers) disallows PDFs and search in its robots.txt. No NT ICAC records are loaded.

Each run asks for robots.txt once. A refusal pauses the source (exit 4, reported by the runner
as a known gap). If the host answers, the run stops with exit 3 so a maintainer can write the
listing parser against what the Commissioner actually publishes (investigation reports, public
statements and reports to the Legislative Assembly, each labelled as published).
"""
from __future__ import annotations

import requests

from parli.ingest.integrity import common

BODY = common.Body(
    code="nt_icac", name="Independent Commissioner Against Corruption", short="NT ICAC", jurisdiction="NT",
    site="https://icac.nt.gov.au", interval=3.0, max_requests=5,
    licence={"status": "copyright reserved except as copyright law permits (report imprint)",
             "url": "https://lant.nt.gov.au/copyright-and-northern-territory-library-content",
             "attribution": "Independent Commissioner Against Corruption (NT)"},
)
GAPS = [
    "icac.nt.gov.au (Cloudflare) answered the identifying OPAXBot client with a challenge (HTTP 403) on "
    "11 November 2026, so the Commissioner's reports and statements are not collected automatically.",
    "The 2025-26 annual report (Tabled Paper 877, a scan) is included from a manual download from Territory Stories "
    "supplied by the OPAX maintainer on 11 November 2026. Investigation reports and public statements are not included; "
    "Tabled Papers 875 and 876 are still to be supplied.",
    "parliament.nt.gov.au answered with the same challenge, and Territory Stories (NT Library) disallows PDFs in "
    "robots.txt, so no official copy is reachable either.",
    "webarchive.nla.gov.au (the official archive) answered the identifying agent with HTTP 403, so archived copies are not used either.",
]
MIN_RECORDS = 1
KNOWN_GAP = True  # reported as a gap by the runner; does not hold the other bodies


def collect(client: common.Client):
    if client.offline:
        raise common.Held("nt_icac: no cached source (known gap)")
    try:
        status, _, _ = client._raw(BODY.site + "/robots.txt")
    except (requests.Timeout, requests.ConnectionError) as exc:
        raise common.Held(f"nt_icac: no response to the identifying agent ({type(exc).__name__})") from None
    raise common.Held(f"nt_icac: host answered HTTP {status}; the listing parser is not written yet")
