"""National Anti-Corruption Commission (Commonwealth): source access gap.

On 11 November 2026 www.nacc.gov.au (Akamai) gave the identifying agent no response:
HTTP/1.1 requests for /robots.txt and / timed out after 90 seconds and HTTP/2 streams
were reset (INTERNAL_ERROR), while the TCP and TLS handshakes completed. The National
Library's web archive (webarchive.nla.gov.au) answered the same agent with HTTP 403.
OPAX does not work around either, so no NACC records are loaded.

Each run asks for robots.txt once. If the host answers, the run stops with exit 3 so a
maintainer can write the listing parser against what NACC actually publishes (it
publishes few full investigation reports and many statements; the adapter must label
statements as statements). Until then the body appears in the public index as a gap.
"""
from __future__ import annotations

import requests

from parli.ingest.integrity import common

BODY = common.Body(
    code="nacc", name="National Anti-Corruption Commission", short="NACC", jurisdiction="Cth",
    site="https://www.nacc.gov.au", interval=5.0, max_requests=5,
    licence={"status": "CC BY 4.0 (stated in each report)", "url": "https://creativecommons.org/licenses/by/4.0/",
             "attribution": "National Anti-Corruption Commission",
             "note": "Page 2 of each report licenses the material under CC BY 4.0, except the Commonwealth Coat of Arms, "
                     "the Commission's logo, third-party material, trade marks and images."},
)
GAPS = [
    "www.nacc.gov.au gave the identifying OPAXBot agent no response on 11 November 2026 (HTTP/1.1 timeouts, "
    "HTTP/2 stream resets), so its investigation reports and statements are not collected automatically.",
    "Eight investigation reports are included from a manual publisher download supplied by the OPAX maintainer on "
    "11 November 2026 (cited to their nacc.gov.au URLs). Later reports and NACC statements are not included.",
    "webarchive.nla.gov.au answered the identifying agent with HTTP 403, so the official archive copy is not used either.",
]
MIN_RECORDS = 1
KNOWN_GAP = True  # reported as a gap by the runner; does not hold the other bodies


def collect(client: common.Client):
    if client.offline:
        raise common.Held("nacc: no cached source (known gap)")
    try:
        status, _, _ = client._raw(BODY.site + "/robots.txt")
    except (requests.Timeout, requests.ConnectionError) as exc:
        raise common.Held(f"nacc: no response to the identifying agent ({type(exc).__name__})") from None
    raise common.Held(f"nacc: host answered HTTP {status}; the listing parser is not written yet")
