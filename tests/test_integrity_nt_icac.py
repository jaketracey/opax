"""nt_icac adapter: a known access gap (Cloudflare refuses the identifying agent). No network."""
import pytest

from parli.ingest.integrity import common, nt_icac


def test_body_fields():
    assert nt_icac.BODY.code == "nt_icac" and nt_icac.BODY.jurisdiction == "NT"
    assert nt_icac.BODY.interval >= 3 and nt_icac.BODY.licence["url"].startswith("https://lant.nt.gov.au/")


def test_known_gap_is_declared_with_reasons():
    assert nt_icac.KNOWN_GAP is True
    assert any("403" in g for g in nt_icac.GAPS)
    assert any("webarchive.nla.gov.au" in g for g in nt_icac.GAPS)


def test_offline_collect_is_held_not_empty():
    client = common.Client(nt_icac.BODY, offline=True)
    with pytest.raises(common.Held):
        nt_icac.collect(client)
