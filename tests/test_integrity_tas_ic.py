"""tas_ic adapter: a known access gap (Cloudflare refuses the identifying agent). No network."""
import pytest

from parli.ingest.integrity import common, tas_ic


def test_body_fields():
    assert tas_ic.BODY.code == "tas_ic" and tas_ic.BODY.jurisdiction == "Tas"
    assert tas_ic.BODY.interval >= 3 and tas_ic.BODY.licence["url"] == "https://www.tas.gov.au/codi"


def test_known_gap_is_declared_with_reasons():
    assert tas_ic.KNOWN_GAP is True
    assert any("403" in g for g in tas_ic.GAPS)
    assert any("webarchive.nla.gov.au" in g for g in tas_ic.GAPS)


def test_offline_collect_is_held_not_empty():
    client = common.Client(tas_ic.BODY, offline=True)
    with pytest.raises(common.Held):
        tas_ic.collect(client)
