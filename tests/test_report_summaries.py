"""Mechanical checks for generated report summaries (scripts/report_summaries/summarise.py)."""
from __future__ import annotations

import importlib.util
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "summarise", Path(__file__).resolve().parents[1] / "scripts" / "report_summaries" / "summarise.py")
s = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(s)

PAGES = [
    "Operation Example\nInvestigation report\nJune 2026\n",
    "Executive summary\nThe Commission investigated whether a council officer awarded contracts to a company\n"
    "owned by a relative. It was alleged that Mr Smith received payments from the company.\n",
    "Findings\nThe Commission found that Ms Jones engaged in serious corrupt conduct by awarding the con-\n"
    "tracts to her brother's company. The Commission did not find that Mr Smith engaged in corrupt conduct.\n"
    "The Commission makes four recommendations to the council about procurement.\n",
]
REC = {"slug": "integrity-report-x", "type": "integrity_report", "title": "Operation Example", "url": "https://example.gov.au/r.pdf",
       "body": "Example Commission", "document": "Operation Example report"}
SENT = [1, 2, 3]


def run(overview=None, findings=None, own=None):
    return s.check({"overview": overview or [], "findings": findings or [], "own_summary": own or {"present": False}},
                   PAGES, SENT, REC)


def sentence(text, pages, support, people=()):
    return {"text": text, "pages": pages, "support": support, "people": list(people)}


def test_contains_tolerates_line_breaks_and_hyphenation():
    assert s.contains(PAGES[2], "engaged in serious corrupt conduct by awarding the contracts to her brother's company")
    assert not s.contains(PAGES[2], "engaged in serious corrupt conduct by awarding grants")


def test_supported_sentence_is_kept():
    out = run([sentence("The Commission made four recommendations to the council about how it buys goods.", [3],
                        "The Commission makes four recommendations to the council about procurement.")])
    assert len(out["overview"]) == 1 and not out["dropped"]


def test_support_found_on_another_page_corrects_the_citation():
    out = run([sentence("The Commission made four recommendations to the council on how it buys goods.", [2],
                        "The Commission makes four recommendations to the council about procurement.")])
    assert out["overview"][0]["pages"][0] == 3
    assert out["overview"][0]["page_corrected"] == {"from": [2], "to": [3]}


def test_support_missing_everywhere_is_dropped():
    out = run([sentence("The council sacked the officer after the report.", [3], "the council dismissed the officer in July")])
    assert not out["overview"] and "not found" in out["dropped"][0]["why"][0]


def test_allegation_stated_as_fact_is_dropped():
    out = run([sentence("Mr Smith took payments from the company.", [2],
                        "It was alleged that Mr Smith received payments from the company.", ["Mr Smith"])])
    assert not out["overview"]
    assert any("allegation" in w or "adverse" in w for w in out["dropped"][0]["why"])


def test_allegation_described_as_allegation_is_kept():
    out = run([sentence("The Commission examined an allegation that a person received payments from the company.", [2],
                        "It was alleged that Mr Smith received payments from the company.")])
    assert len(out["overview"]) == 1


def test_adverse_statement_about_named_person_needs_a_stated_finding():
    bad = run([sentence("Ms Jones engaged in corrupt conduct.", [2], "The Commission investigated whether a council officer awarded contracts",
                        ["Ms Jones"])])
    assert not bad["overview"]
    good = run([sentence("The Commission found that Ms Jones engaged in serious corrupt conduct in awarding the work.", [3],
                         "The Commission found that Ms Jones engaged in serious corrupt conduct", ["Ms Jones"])])
    assert len(good["overview"]) == 1


def test_name_not_on_cited_page_is_dropped():
    out = run([sentence("The Commission found that Mr Brown engaged in serious corrupt conduct.", [3],
                        "The Commission found that Ms Jones engaged in serious corrupt conduct", ["Mr Brown"])])
    assert any("Mr Brown" in w for w in out["dropped"][0]["why"])


def test_long_copied_run_is_dropped_but_quoted_body_wording_is_allowed():
    copied = run([sentence("The Commission did not find that Mr Smith engaged in corrupt conduct in this matter at all, it said.", [3],
                           "The Commission did not find that Mr Smith engaged in corrupt conduct.", ["Mr Smith"])])
    s.SHINGLE, old = 10, s.SHINGLE
    try:
        copied = run([sentence("The Commission did not find that Mr Smith engaged in corrupt conduct in this matter.", [3],
                               "The Commission did not find that Mr Smith engaged in corrupt conduct.", ["Mr Smith"])])
        assert any("copies a run" in w for w in copied["dropped"][0]["why"])
        quoted = run([sentence('The Commission said it "did not find that Mr Smith engaged in corrupt conduct".', [3],
                               "The Commission did not find that Mr Smith engaged in corrupt conduct.", ["Mr Smith"])])
        assert len(quoted["overview"]) == 1
    finally:
        s.SHINGLE = old


def test_style_rules():
    for text in ("The Commission made four recommendations — all about procurement.",
                 "We note the Commission made four recommendations about procurement.",
                 "The damning report made four recommendations about procurement.",
                 "The supplied pages show four recommendations about procurement."):
        out = run([sentence(text, [3], "The Commission makes four recommendations to the council about procurement.")])
        assert not out["overview"], text


def test_findings_quotes_must_be_verbatim_complete_and_located():
    out = run(findings=[
        {"quote": "The Commission did not find that Mr Smith engaged in corrupt conduct.", "page": 2, "kind": "finding"},
        {"quote": "The Commission found that Ms Jones engaged in serious corrupt conduct by awarding", "page": 3, "kind": "finding"},
        {"quote": "The Commission found that Ms Jones was dishonest.", "page": 3, "kind": "finding"},
    ])
    assert [f["page"] for f in out["findings"]] == [3]  # relocated from page 2
    whys = [w for d in out["dropped"] for w in d["why"]]
    assert any("complete statement" in w for w in whys) and any("not found" in w for w in whys)


def test_own_summary_heading_must_be_on_its_page():
    assert run(own={"present": True, "heading": "Executive summary", "first_page": 2, "last_page": 2})["own_summary"]
    out = run(own={"present": True, "heading": "Executive summary", "first_page": 3})
    assert out["own_summary"] is None


def test_existing_findings_on_the_page_are_not_replaced():
    checked = run([sentence("The Commission made four recommendations to the council about how it buys goods.", [3],
                            "The Commission makes four recommendations to the council about procurement.")],
                  findings=[{"quote": "The Commission did not find that Mr Smith engaged in corrupt conduct.", "page": 3,
                             "kind": "finding"}])
    usage = {"model": "m", "prompt_tokens": 1, "completion_tokens": 1, "cost_usd": 0.0}
    with_existing = s.build({**REC, "opax_findings": 2}, PAGES, SENT, checked, usage)
    assert with_existing["findings"]["items"] == [] and with_existing["findings"]["source"] == "already on the report page"
    fresh = s.build(REC, PAGES, SENT, checked, usage)
    assert len(fresh["findings"]["items"]) == 1
    assert fresh["summary"]["label"].startswith("Generated summary")
    assert fresh["summary"]["status"] == "withheld"  # one sentence is not enough to publish


def test_page_selection_keeps_front_matter_and_summary_sections_within_budget():
    pages = [f"page {i} " + "x" * 5000 for i in range(1, 201)]
    pages[119] = "Summary of findings\n" + "y" * 5000
    sel = s.select_pages(pages, budget=200_000)
    assert sel[:30] == list(range(1, 31)) and 120 in sel
    assert sum(len(pages[n - 1]) for n in sel) <= 200_000


def test_slug_matches_the_report_catalogue():
    assert s.slug_part("cth-robodebt") == "cth-robodebt"
    assert s.slug_part("vic-ibac-2022-07-20-tp6536 Operation Watts!") == "vic-ibac-2022-07-20-tp6536-operation-watts"
