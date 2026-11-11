"""Integrity commission hearing transcripts: date checks, neutral titles and the committed registry (no network)."""
from __future__ import annotations

import json

from parli.ingest.integrity import transcripts as tx


def test_find_date_reads_the_forms_transcripts_print():
    assert tx.find_date("2026-07-29", ["AT SYDNEY ON WEDNESDAY 29 JULY, 2026 AT 10.30AM"]) == ("29 JULY, 2026", 1)
    assert tx.find_date("2005-09-13", ["", "Transcript 13/09/2005"]) == ("13/09/2005", 2)
    assert tx.find_date("2024-02-13", ["13.02.24 FIELD, C.J."]) == ("13.02.24", 1)
    assert tx.find_date("2019-02-04", ["HEARD ON 4 FEBRUARY 2019"]) == ("4 FEBRUARY 2019", 1)
    assert tx.find_date("2019-02-04", ["14 FEBRUARY 2019"]) == (None, None)


def test_a_cover_date_near_the_listing_wins_and_is_noted():
    assert tx.nearby_date("2025-10-31", ["ON THURSDAY 30 OCTOBER, 2025 AT 2.00PM"]) == ("2025-10-30", "30 OCTOBER, 2025")
    assert tx.nearby_date("2025-10-31", ["ON 30 OCTOBER, 2024"]) == (None, None)


def test_titles_are_neutral_and_never_the_publishers_witness_label():
    d = {"publisher": "Crime and Corruption Commission", "case": "Operation Belcarra: Reforming local government in Queensland",
         "hearing_date": "2017-04-18", "title_as_listed": "A Witness Name", "source_url": "https://x.example/a.pdf"}
    case = tx.case_name(d)
    assert tx.title_of(d, case, d["hearing_date"]) == "Operation Belcarra: Reforming local government in Queensland hearing transcript, 18 April 2017"
    assert tx.listed_label(d) == "A Witness Name"
    icac = {"publisher": "NSW Independent Commission Against Corruption", "case": "Navarra", "published_page_range": "02438-02469"}
    assert tx.title_of(icac, tx.case_name(icac), "2026-07-29") == "Operation Navarra public inquiry transcript, 29 July 2026, transcript pages 02438-02469"


def test_registry_is_complete_and_cited():
    reg = tx.load()
    t = reg["transcripts"]
    assert len(t) == 486 and reg["label"] == "Hearing transcript: evidence, not findings"
    assert reg["counts"] == {"act_ic": 17, "nsw_icac": 256, "nsw_lecc": 24, "qld_ccc": 160, "sa_icac": 3, "vic_ibac": 17, "wa_ccc": 9}
    assert len({r["id"] for r in t}) == len(t) and len({r["title"] for r in t}) == len(t)
    for r in t:
        assert r["url"].startswith("https://") and len(r["sha256"]) == 64 and r["pages"] >= 1 and r["rights"]
        assert r["acquisition"] == tx.ACQUISITION and r["kind"] == "hearing_transcript"
        assert (r["date_basis"] == "stated") == ("date_quote" in r)
    assert sum(r["date_basis"] == "stated" for r in t) >= 480
    assert all(r.get("orders") for r in t if r["body"] == "vic_ibac")
    assert len(reg["publisher_view_only"]) == 21 and all(v["availability"] == "publisher_view_only" for v in reg["publisher_view_only"])
    json.dumps(reg)
