"""Offline regressions for fetched names and source URL classification."""
import time

from bs4 import BeautifulSoup

from parli.ingest.qao_reports import licence_review
from scripts.export_expenses import clean_name
from scripts.state_bills.stage import act_bill_id


def test_expense_postnominals_consume_long_failing_and_matching_runs():
    for value in ("Avery Example " + "OAM " * 25_000 + "!",
                  "Avery Example " + "OAM " * 25_000):
        start = time.perf_counter()
        cleaned = clean_name(value)
        assert (time.perf_counter() - start) * 1000 < 50
        assert cleaned.startswith("avery example")
    assert clean_name("The Hon Avery EXAMPLE MP OAM") == "avery example"
    assert clean_name("Avery Example OAM!") == "avery example oam!"
    assert clean_name("MP") == "mp"


def test_act_bill_identifiers_require_the_exact_register_host():
    for url in (
        "https://legislationXact.gov.au/b/db_12345",
        "https://legislation.act.gov.au.outside.test/b/db_12345",
        "https://outside.test/legislation.act.gov.au/b/db_12345",
        "https://outside.test/?next=https://legislation.act.gov.au/b/db_12345",
        "https://name@legislation.act.gov.au/b/db_12345",
        "https://legislation.act.gov.au:8443/b/db_12345",
        "https://[invalid/b/db_12345",
    ):
        assert act_bill_id(url) is None
    assert act_bill_id("https://www.legislation.act.gov.au/b/db_12345") == "db_12345"
    assert act_bill_id("https://legislation.act.gov.au/View/b/db_12345/1/html") == "db_12345"


def test_qao_footer_exemption_requires_the_exact_copyright_url():
    def review(url):
        return licence_review(BeautifulSoup(
            f'<main><p class="copyright"><a href="{url}">Copyright ©</a></p></main>',
            "html.parser").main)

    for url in ("https://www.qaoXqld.gov.au/copyright",
                "https://www.qao.qld.gov.au.outside.test/copyright",
                "https://outside.test/https://www.qao.qld.gov.au/copyright",
                "https://name@www.qao.qld.gov.au/copyright",
                "https://www.qao.qld.gov.au/copyright?other=1"):
        assert review(url)["body_skipped"]
    for url in ("/copyright", "https://www.qao.qld.gov.au/copyright"):
        assert not review(url)["body_skipped"]
