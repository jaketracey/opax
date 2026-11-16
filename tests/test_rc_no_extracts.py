"""A documents-only commission holds no extract from its documents (no network).

The Victorian major infrastructure royal commission is listed by its hearing transcripts alone.
Five short extracts from those transcripts were once held in its record; they are pinned here by
the SHA-256 of their normalised words, never as text, so this file does not republish them.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import re

import pytest

from parli.ingest import royal_commissions as rc
from tests.test_royal_commissions import BODY, make_pdf

ROOT = Path(__file__).resolve().parents[1]
ID = "vic-major-infrastructure"
PUBLIC = ROOT / "portal" / "public" / "royal-commissions"
# (number of words, SHA-256 of the words joined by single spaces) for each extract once held.
PINNED = {
    (7, "75c44b047d33e6c8834ecf9a630a75a0195b1208440801587ce4ce3bdf6da5d0"),
    (9, "f29b53401df0607d07055ca5744dc3829a3178d3e35d19fccf841d563ecae01d"),
    (9, "ecec8e5686f6b6ba3eccdaa0d08aa6a25220be983bb89e26038efca7f5555cfc"),
    (6, "20192459eb70be07ed07277fa4a0c2f129ad108cd85addc7c30ed5ff12510282"),
    (15, "12b90efdb2d5059b5630a23478ccb3356d38377a1d6872ea3862b13c5454a288"),
}


def held_extracts(text):
    """The pinned extracts found anywhere in text: every run of n words is hashed and compared."""
    words = re.sub(r"[^a-z0-9]+", " ", text.lower()).split()
    found = set()
    for n, sha in PINNED:
        for i in range(len(words) - n + 1):
            if hashlib.sha256(" ".join(words[i:i + n]).encode()).hexdigest() == sha:
                found.add(sha)
    return found


def text_fields(value, path=""):
    """Paths of every field, at any depth, whose name says it holds a document's wording and that has a value."""
    if isinstance(value, dict):
        for k, v in value.items():
            if k in rc.TEXT_KEYS and v:
                yield f"{path}/{k}"
            yield from text_fields(v, f"{path}/{k}")
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from text_fields(v, f"{path}[{i}]")


def test_the_detector_finds_an_extract_inside_other_text():
    # Not one of the five: a made-up line, pinned the same way, proves the window search works.
    line = "An example line that nobody said"
    words = re.sub(r"[^a-z0-9]+", " ", line.lower()).split()
    PINNED.add((len(words), hashlib.sha256(" ".join(words).encode()).hexdigest()))
    try:
        assert len(held_extracts(f'{{"note":"Before. AN EXAMPLE line, that nobody   said; after."}}')) == 1
        assert not held_extracts("An example line that nobody heard")
    finally:
        PINNED.discard((len(words), hashlib.sha256(" ".join(words).encode()).hexdigest()))


def test_registry_and_published_record_hold_no_extract():
    reg = next(c for c in json.loads(rc.REGISTRY.read_text())["commissions"] if c["id"] == ID)
    assert rc.documents_only(reg)
    published = json.loads((PUBLIC / f"commission-{ID}.json").read_text())["commission"]
    row = next(c for c in json.loads((PUBLIC / "index.json").read_text())["commissions"] if c["id"] == ID)
    assert published["use"] == row["use"] == rc.DOCUMENTS_ONLY
    for name, record in (("registry", reg), ("published", published), ("index", row)):
        assert not held_extracts(json.dumps(record, ensure_ascii=False)), name
        assert not list(text_fields(record)), name
        assert not [n for n in record.get("notes", []) + record.get("gaps", []) if any(ch in n for ch in rc.QUOTE_MARKS)], name
    assert not any("full_text" in t or "date_quote" in t for t in published["transcripts"])
    assert published["recommendations"] == [] and published["court_context"] == []
    # The facts stay, in OPAX's own words, each with its page reference and link.
    assert [(t["date"], t["date_basis"], t["date_cite"]["page"]) for t in published["transcripts"]] == [
        ("2026-11-09", "stated", 1), ("2026-11-10", "stated", 1)]
    person = published["commissioners"][0]
    assert person["name"] == "The Honourable Chris Kourakis AC SC" and person["cite"]["page"] == 1
    assert person["cite"]["url"].startswith("https://www.rcimcp.vic.gov.au/")
    notes = " ".join(published["notes"])
    assert "may make non-publication orders (transcript of 9 November 2026, page 30: https://" in notes
    assert "final report by 20 August 2027" in notes and "(transcript page 33: https://" in notes


def test_no_published_royal_commission_file_holds_an_extract():
    for path in sorted(PUBLIC.glob("*.json")):
        assert not held_extracts(path.read_text()), path.name


TRANSCRIPT = [[("TRANSCRIPT OF PROCEEDINGS", 14), ("Presiding: The Honourable Jo Example KC", BODY),
               ("At the hearing room on Monday, 2 March 2026 at 10.00 am", BODY)],
              [("MS EXAMPLE: Orders about publication may be made.", BODY)]]


def entry(sha, **change):
    doc = {"key": "transcript-2026-03-02", "kind": "hearing_transcript", "source": "manual",
           "url": "https://publisher.example.gov.au/t1.pdf", "sha256": sha, "title": "Public hearing transcript, 2 March 2026",
           "document_kind": "public hearing transcript", "acquisition": "manual publisher download supplied by the OPAX maintainer, 11 Nov 2026",
           "rights": "No notice.", "date": "2026-03-02", "date_page": 1}
    return {"id": "test-sitting", "name": "Royal Commission into Examples", "inquiry_type": "royal_commission", "jurisdiction": "Vic",
            "use": "documents_only", "documents": [{**doc, **change.pop("doc", {})}],
            "facts": [{"field": "commissioner", "value": "The Honourable Jo Example KC", "doc": doc["key"], "page": 1, **change.pop("fact", {})}],
            "notes": ["The commission has said that it may make orders about publication (transcript page 2)."], **change}


def supplied(tmp_path):
    data = make_pdf(TRANSCRIPT)
    sha = hashlib.sha256(data).hexdigest()
    (tmp_path / "manual").mkdir()
    (tmp_path / "manual" / (sha + ".pdf")).write_bytes(data)
    run = tmp_path / "raw" / "r"
    run.mkdir(parents=True)
    return sha, run


def test_documents_only_build_checks_the_pages_and_stores_no_text(tmp_path):
    sha, run = supplied(tmp_path)
    # Text an earlier build cached for the document is removed as well.
    (tmp_path / "text").mkdir()
    (tmp_path / "text" / (sha + ".json")).write_text(json.dumps(rc.pr.page_texts((tmp_path / "manual" / (sha + ".pdf")).read_bytes())))
    out = rc.build_commission(entry(sha), run, rc.Texts(tmp_path), {})
    t = out["transcripts"][0]
    assert out["use"] == "documents_only" and not list(text_fields(out))
    assert (t["date"], t["date_basis"], t["date_cite"]["page"], t["files"][0]["pages"]) == ("2026-03-02", "stated", 1, 2)
    assert out["commissioners"] == [{"name": "The Honourable Jo Example KC", "role": "Commissioner",
                                     "cite": {"url": "https://publisher.example.gov.au/t1.pdf", "document": t["title"], "page": 1}}]
    # The page text was read to check the date and the name, and none of it was written to the cache.
    assert not list((tmp_path / "text").iterdir())
    for words in ("Presiding", "hearing room", "Orders about publication may be made"):
        assert words not in json.dumps(out)


@pytest.mark.parametrize("change", [
    {"doc": {"date_quote": "Monday, 2 March 2026"}},            # a date line
    {"fact": {"quote": "Presiding: The Honourable Jo Example KC"}},  # a quoted fact
    {"notes": ['The transcript says "Orders about publication may be made".']},  # a quotation in a note
    {"notes": ["The transcript says “orders may be made”."]},
    {"doc": {"date": "2026-03-03"}},                            # a date the page does not print
    {"fact": {"value": "The Honourable Sam Other KC"}},         # a name the page does not print
    {"use": "anything_else"},
])
def test_documents_only_build_holds_on_an_extract_or_an_unprinted_fact(tmp_path, change):
    sha, run = supplied(tmp_path)
    with pytest.raises(SystemExit) as e:
        rc.build_commission(entry(sha, **change), run, rc.Texts(tmp_path), {})
    assert e.value.code == 3


def test_a_quotable_commission_still_needs_its_quotes(tmp_path):
    sha, run = supplied(tmp_path)
    plain = entry(sha)
    del plain["use"]
    with pytest.raises(SystemExit):
        rc.build_commission(plain, run, rc.Texts(tmp_path), {})


def test_carry_forward_drops_extracts_an_earlier_build_held(tmp_path):
    """Where the supplied PDFs are absent (the weekly refresh), the last record is carried without its extracts."""
    old = {"id": "test-sitting", "established": None, "recommendations": [], "court_context": [],
           "commissioners": [{"name": "The Honourable Jo Example KC", "role": "Commissioner", "quote": "Presiding: The Honourable Jo Example KC",
                              "cite": {"url": "https://publisher.example.gov.au/t1.pdf", "document": "T", "page": 1}}],
           "reports": [], "responses": [],
           "transcripts": [{"key": "transcript-2026-03-02", "date": "2026-03-02", "date_basis": "stated", "date_quote": "Monday, 2 March 2026",
                            "date_cite": {"url": "https://publisher.example.gov.au/t1.pdf", "document": "T", "page": 1},
                            "full_text": {"url": "/transcripts/x.json"}}],
           "notes": ['The transcript says "Orders about publication may be made".'], "gaps": []}
    (tmp_path / "snapshot.json").write_text(json.dumps({"commissions": [old]}))
    out = rc.carried(entry("0" * 64), tmp_path)
    assert out["use"] == "documents_only" and not list(text_fields(out))
    assert out["notes"] == ["The commission has said that it may make orders about publication (transcript page 2)."]
    assert out["transcripts"][0]["date_cite"]["page"] == 1 and out["commissioners"][0]["cite"]["page"] == 1
    assert "Presiding" not in json.dumps(out) and "Orders about" not in json.dumps(out)
    # A commission that is not documents only is carried unchanged, as before.
    plain = entry("0" * 64)
    del plain["use"]
    assert rc.carried(plain, tmp_path) == old


def test_export_holds_a_documents_only_record_that_carries_text():
    spec = importlib.util.spec_from_file_location("export_royal_commissions", ROOT / "scripts" / "export_royal_commissions.py")
    export = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(export)
    good = json.loads((PUBLIC / f"commission-{ID}.json").read_text())["commission"]
    export.check(good)
    for change in ({"commissioners": [{**good["commissioners"][0], "quote": "x"}]},
                   {"transcripts": [{**good["transcripts"][0], "date_quote": "x"}]},
                   {"transcripts": [{**good["transcripts"][0], "full_text": {"url": "/transcripts/x.json"}}]},
                   {"notes": ['A note with "a quotation".']}):
        with pytest.raises(SystemExit) as e:
            export.check({**good, **change})
        assert e.value.code == 3
