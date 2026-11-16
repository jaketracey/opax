"""parli/ingest/source_policy.json holds the code to its stated values."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

import pytest

from parli.ingest import frl_instruments as frl
from parli.ingest import http
from parli.ingest import words_parlinfo as W

ROOT = Path(__file__).resolve().parents[1]
POLICY = json.loads((ROOT / "parli/ingest/source_policy.json").read_text())
FRL = POLICY["frl_acts"]


def test_frl_acts_host_paths_identity_and_spacing_match_the_code():
    url = urlsplit(W.FRL_TITLES)
    assert (url.hostname, url.path) == (FRL["host"], FRL["paths"][0])
    assert json.loads((ROOT / FRL["identity"]).read_text())["user_agent"] == http.USER_AGENT == frl.UA
    assert frl.MIN_SPACING == FRL["rate"]["min_spacing_seconds"] == 10
    assert W.RECENT_ACTS == 100 and FRL["budget"]["nightly_requests"] == 1
    assert not any(path in W.FRL_TITLES for path in FRL["never"])


@pytest.mark.parametrize("hour,busy", [(7, False), (8, True), (12, True), (19, True), (20, False), (3, False)])
def test_frl_busy_hours_are_the_policy_window(hour, busy):
    start, end = FRL["window"]["busy_hours"]
    assert (start, end) == (8, 20)
    aest = timezone(timedelta(hours=10))
    moment = datetime(2026, 7, 15, hour, 30, tzinfo=aest)  # winter: Melbourne is also UTC+10
    if busy:
        with pytest.raises(frl.Held, match="busy hours"):
            frl.quiet_window(moment)
    else:
        frl.quiet_window(moment)


def test_frl_attribution_wording_is_the_portal_wording():
    portal = (ROOT / "portal/public/frl-attribution.js").read_text()
    head, _, tail = FRL["attribution"].partition("{full date of download}")
    assert head in portal and tail.strip() in portal
    assert FRL["licence"] == "CC BY 4.0"
    assert re.search(r"Based on content from the Federal Register of Legislation at", portal)


def test_every_entry_names_its_host():
    for name, entry in POLICY.items():
        if name.startswith("_"):
            continue
        assert re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", entry["host"]), name
