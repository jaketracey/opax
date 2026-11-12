"""Quality gate for drafted report summaries (scripts/report_summaries/gate.py)."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

GATE = Path(__file__).resolve().parents[1] / "scripts" / "report_summaries" / "gate.py"
SPEC = importlib.util.spec_from_file_location("gate", GATE)
g = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(g)

PAGES = [
    "Operation Example\nInvestigation report\nJune 2026\n",
    "Executive summary\nThe Commission investigated whether a council officer awarded contracts to a company\n"
    "owned by a relative. It was alleged that Mr Smith received payments from the company.\n",
    "Findings\nThe Commission found that Ms Jones engaged in serious corrupt conduct by awarding the con-\n"
    "tracts to her brother's company. The Commission did not find that Mr Smith engaged in corrupt conduct.\n"
    "The Commission makes four recommendations to the council about procurement.\n",
]
META = {"slug": "integrity-report-x", "type": "integrity_report", "subtype": "investigation_report",
        "title": "Operation Example", "body": "Example Commission", "document": "Operation Example report",
        "url": "https://example.gov.au/r.pdf", "pages": 3, "opax_findings": 0}
GOOD = [
    {"text": "The Commission examined an allegation that a council officer awarded contracts to a relative's company.",
     "pages": [2], "support": "The Commission investigated whether a council officer awarded contracts to a company", "people": []},
    {"text": "The Commission found that Ms Jones engaged in serious corrupt conduct in awarding the contracts.",
     "pages": [3], "support": "The Commission found that Ms Jones engaged in serious corrupt conduct", "people": ["Ms Jones"]},
    {"text": "The Commission made four recommendations to the council about how it buys goods and services.",
     "pages": [3], "support": "The Commission makes four recommendations to the council about procurement.", "people": []},
]


def draft(sentences=None, findings=None, own=None, **kw):
    return {"slug": "integrity-report-x", "engine": "test", "own_summary": own,
            "sentences": GOOD if sentences is None else sentences, "findings": findings or [], **kw}


def whys(res):
    return [w for s in res["sentences"] for w in s["why"]] + [w for f in res["findings"] for w in f["why"]] + res["report"]


def one(sentence):
    return g.check(draft(GOOD[:2] + [sentence]), PAGES, META)["sentences"][2]["why"]


def test_clean_draft_passes():
    res = g.check(draft(), PAGES, META)
    assert res["clean"], whys(res)


def test_contains_tolerates_line_breaks_and_hyphenation():
    assert g.contains(PAGES[2], "engaged in serious corrupt conduct by awarding the contracts to her brother's company")
    assert not g.contains(PAGES[2], "engaged in serious corrupt conduct by awarding grants")


def test_every_sentence_needs_a_page_citation():
    assert "no page citation" in one({**GOOD[2], "pages": []})
    assert any("outside the report" in w for w in one({**GOOD[2], "pages": [9]}))


def test_support_must_be_verbatim_on_the_cited_page():
    assert any("found on page 3" in w for w in one({**GOOD[2], "pages": [2]}))
    assert any("anywhere" in w for w in one({**GOOD[2], "support": "the council adopted all four recommendations in July"}))


def test_quoted_phrases_must_be_verbatim_on_the_cited_page():
    ok = {**GOOD[2], "text": 'The Commission made "four recommendations to the council about procurement".'}
    assert one(ok) == []
    bad = {**GOOD[2], "text": 'The Commission made "four urgent recommendations" to the council.'}
    assert any("quoted phrase" in w for w in one(bad))


def test_allegation_stated_as_fact_fails():
    s = {"text": "Mr Smith took payments from the company.", "pages": [2],
         "support": "It was alleged that Mr Smith received payments from the company.", "people": ["Mr Smith"]}
    assert any("allegation" in x for x in one(s))


def test_adverse_statement_about_a_named_person_needs_a_stated_finding():
    s = {"text": "Ms Jones engaged in corrupt conduct.", "pages": [2],
         "support": "The Commission investigated whether a council officer awarded contracts", "people": ["Ms Jones"]}
    assert any("adverse" in x for x in one(s))


def test_names_must_be_on_the_cited_pages():
    s = {**GOOD[1], "text": "The Commission found that Mr Brown engaged in serious corrupt conduct.", "people": ["Mr Brown"]}
    assert any("Mr Brown" in x for x in one(s))


def test_long_copied_run_outside_quotes_fails():
    old, g.SHINGLE = g.SHINGLE, 10
    try:
        s = {"text": "The Commission did not find that Mr Smith engaged in corrupt conduct in this matter.", "pages": [3],
             "support": "The Commission did not find that Mr Smith engaged in corrupt conduct.", "people": ["Mr Smith"]}
        assert any("copies a run" in x for x in one(s))
        q = {**s, "text": 'The Commission said it "did not find that Mr Smith engaged in corrupt conduct".'}
        assert one(q) == []
    finally:
        g.SHINGLE = old


def test_style_rules():
    for text in ("The Commission made four recommendations — all about procurement.",
                 "We note the Commission made four recommendations about procurement.",
                 "The damning report made four recommendations about procurement.",
                 "The supplied pages show four recommendations about procurement."):
        assert one({**GOOD[2], "text": text}), text


def test_findings_quotes_verbatim_complete_and_on_their_page():
    res = g.check(draft(findings=[
        {"quote": "The Commission did not find that Mr Smith engaged in corrupt conduct.", "page": 3, "kind": "finding"},
        {"quote": "The Commission did not find that Mr Smith engaged in corrupt conduct.", "page": 2, "kind": "finding"},
        {"quote": "The Commission found that Ms Jones engaged in serious corrupt conduct by awarding", "page": 3, "kind": "finding"},
        {"quote": "The Commission found that Ms Jones was dishonest.", "page": 3, "kind": "finding"},
        {"quote": "The Commission makes four recommendations to the council about procurement.", "page": 3, "kind": "advice"},
    ]), PAGES, META)
    w = [f["why"] for f in res["findings"]]
    assert w[0] == []
    assert any("found on page 3" in x for x in w[1])
    assert any("complete statement" in x for x in w[2])
    assert any("anywhere" in x for x in w[3])
    assert any("kind" in x for x in w[4])


def test_findings_must_be_empty_where_the_page_already_lists_them():
    res = g.check(draft(findings=[{"quote": "The Commission did not find that Mr Smith engaged in corrupt conduct.",
                                    "page": 3, "kind": "finding"}]), PAGES, {**META, "opax_findings": 2})
    assert not res["clean"] and any("already lists" in w for w in res["report"])


def test_sentence_count_and_own_summary():
    assert any("sentences drafted" in w for w in g.check(draft(GOOD[:2]), PAGES, META)["report"])
    assert g.check(draft(own={"heading": "Executive summary", "first_page": 2, "last_page": 2}), PAGES, META)["clean"]
    assert not g.check(draft(own={"heading": "Executive summary", "first_page": 3}), PAGES, META)["clean"]


def test_publish_keeps_only_passing_items_and_withholds_thin_summaries():
    sents = GOOD[:2] + [{**GOOD[2], "pages": [2]}]
    res = g.check(draft(sents), PAGES, META)
    out = g.publish(draft(sents), res, META, "rs-test")
    assert [s["text"] for s in out["summary"]["sentences"]] == [GOOD[0]["text"], GOOD[1]["text"]]
    assert out["summary"]["status"] == "ready" and out["summary"]["label"].startswith("Generated summary")
    assert len(out["gate"]["dropped"]) == 1
    thin = g.publish(draft(sents), g.check(draft(GOOD[:1] + [{**GOOD[2], "pages": [2]}]), PAGES, META), META, None)
    assert thin["summary"]["status"] == "withheld"


def test_cli_logs_history_and_exits_nonzero_on_failure(tmp_path):
    packs, drafts = tmp_path / "packs", tmp_path / "data" / "drafts"
    (packs / META["slug"]).mkdir(parents=True)
    (packs / META["slug"] / "meta.json").write_text(json.dumps(META))
    (packs / META["slug"] / "pages.json").write_text(json.dumps(PAGES))
    drafts.mkdir(parents=True)
    (drafts / f"{META['slug']}.json").write_text(json.dumps(draft()))
    ok = subprocess.run([sys.executable, "-I", str(GATE), "--packs", str(packs), "--drafts", str(drafts), "--apply",
                         "--out", str(tmp_path / "data")], capture_output=True, text=True)
    assert ok.returncode == 0, ok.stdout
    assert json.loads((tmp_path / "data" / f"{META['slug']}.json").read_text())["summary"]["status"] == "ready"
    (drafts / f"{META['slug']}.json").write_text(json.dumps(draft(GOOD[:2] + [{**GOOD[2], "pages": []}])))
    bad = subprocess.run([sys.executable, "-I", str(GATE), "--packs", str(packs), "--drafts", str(drafts)],
                         capture_output=True, text=True)
    assert bad.returncode == 1 and "no page citation" in bad.stdout
    hist = (tmp_path / "data" / "gate" / "history.jsonl").read_text().splitlines()
    assert [json.loads(h)["clean"] for h in hist] == [True, False]


def test_figures_must_appear_on_the_cited_pages():
    assert one({**GOOD[2], "text": "The Commission made 5 recommendations to the council about how it buys goods."}) != []
    page = PAGES[2] + "It made 4 recommendations in total, costing $1,200,000.\n"
    res = g.check(draft(GOOD[:2] + [{**GOOD[2], "text": "The Commission made 4 recommendations costing $1,200,000 to implement."}]),
                  PAGES[:2] + [page], META)
    assert res["sentences"][2]["why"] == []


def test_published_quotes_lose_pdf_line_breaks():
    assert g.tidy("the con-\ntracts to her\n brother") == "the contracts to her brother"


def test_spelled_numbers_on_the_page_count():
    assert g.spelled("It made twenty-five recommendations and nine findings") >= {"25", "9"}


def test_ocr_text_is_marked_on_the_published_source():
    res = g.check(draft(), PAGES, META)
    assert "text" not in g.publish(draft(), res, META, None)["source"]
    out = g.publish(draft(), res, {**META, "text_source": "ocr"}, None)
    assert out["source"]["text"] == "ocr"


def test_packs_prefer_on_device_ocr_text_for_the_same_file(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("prepare", GATE.parent / "prepare.py")
    prep = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(prep)
    monkeypatch.setattr(prep, "PACKS", tmp_path / "packs")
    monkeypatch.setattr(prep, "OCR_TEXT", tmp_path / "ocr")
    (tmp_path / "ocr").mkdir()
    layer = tmp_path / "layer.json"
    layer.write_text(json.dumps({"pages": ["", " "]}))
    r = {"slug": "integrity-report-scan", "type": "integrity_report", "title": "Scan", "url": "https://example.gov.au/s.pdf",
         "sha256": "ab" * 32, "text": str(layer)}
    meta = json.loads((prep.write_pack(r) / "meta.json").read_text())
    assert meta["text_source"] == "pdf" and meta["chars"] == 1
    (tmp_path / "ocr" / f"{'ab' * 32}.json").write_text(json.dumps({"sha256": "ab" * 32, "pages": ["Scanned page one", "two"]}))
    d = prep.write_pack(r)
    meta = json.loads((d / "meta.json").read_text())
    assert meta["text_source"] == "ocr" and meta["pages"] == 2
    assert json.loads((d / "pages.json").read_text()) == ["Scanned page one", "two"]
