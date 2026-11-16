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

# Every run of five consecutive words in the five extracts, as the SHA-256 of the run, so that a
# partial lift fails as well as an exact match. The two runs wholly inside the commissioner's name
# are left out: the name is a fact the record keeps.
SHINGLES = {
    "01a5e596da9e323528f562c48b9248f319fb742255023e3aada1fe27fa97423b",
    "06a9d2c15a06d0c3fbaa00069013537aa5095090229a0dd5fd73d992145de3c5",
    "13e9bdad348ec847036d0a2494971d95f4c9e4e1c4a21f3504315adb0b61b49e",
    "252d86390e7fbee5959fc6068e5e154474ac2d8740875167fbf3cd5d8cafbfc1",
    "3015202ecef160d74f66253de6b080e2725241a2226fca806af29710e39c05da",
    "33e9d75b9828b5367ff6e77e7189689c7b40e7296d49ebd17c238b69e8666457",
    "3add48563464f1021b34ff307012a18dc4d8e135ee7bff741a6a6df9601781f4",
    "3bb3bf3c77b7d86d09ba38604b6c1db64c70a7c22f85f5074deddbc49287a7d4",
    "574c8f04d282674159d848eb46da755bf1bcdee4195d79bd578145079f4f612b",
    "5ce3727f39b4ff5b97c9ded842297d48eddd3f6f810c74bd5abff1e742b1da94",
    "829f8ea97090834dab0f6f8023c36879d569ed62c278e0440818b95d076c21d3",
    "84c0224329f8483fff9be089456c3a54f3060f8909c92e980e983ecfa99d605f",
    "941ea44030e399d07f512865cd97f9ed8a8a4eec49350e263908ced62da9c62c",
    "96a404f148969a814475b93dfba69e7e3164b69ded269a3438732eb09fb22ffd",
    "9ddf3715d17d829ac069ab7ef814b4833e26a1912843f8710575d701aee8fe96",
    "b2dce763f49e13044821c21006103e36aea64df5bac77e97951cf3c52128da89",
    "bd6024916799f7062a53ce72aee70ca17b39307bcdb30c8a13a4e2fbebd2cc5e",
    "c080ae7ea1d425694e288a5f8b88783edfa62ef15cc59c9705be00bd93cb9bad",
    "cef63464ebcca2926b4107086d834b8cc11f6f14056639adb244f862919b934c",
    "d526465722e142908af1a5035ca6bc1bd55fa3ed8c4aff41509fa74f99e19aef",
    "f0e24ab5670ec975d7bdb76b7040240027da0416ed684d592d401550dccbfb78",
    "f6d9ae396bd6fa12abbef59b3c77814493fb6e38d16f86402fa7ae8b357807de",
}


def lifted_runs(text, pinned=None, size=5):
    """The pinned five-word runs found anywhere in text."""
    words = re.sub(r"[^a-z0-9]+", " ", text.lower()).split()
    runs = {hashlib.sha256(" ".join(words[i:i + size]).encode()).hexdigest() for i in range(len(words) - size + 1)}
    return runs & (SHINGLES if pinned is None else pinned)


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
        assert not lifted_runs(json.dumps(record, ensure_ascii=False)), name
        assert not list(text_fields(record)), name
        assert not rc.quotation(record.get("notes", []) + record.get("gaps", [])), name
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
    assert "Its final report is due on or before 20 August 2027" in notes and "(transcript page 33: https://" in notes


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
    {"notes": ["The transcript says \u201corders may be made\u201d."]},
    {"notes": ["The transcript says 'orders may be made'."]},             # single quotation marks
    {"notes": ["The transcript says \u2018orders may be made\u2019."]},
    {"notes": ["The transcript says \u00aborders may be made\u00bb."]},
    {"gaps": ['A gap that says "orders may be made".']},
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
    # Text keys are stripped at any depth, not only at the top of a row.
    deep = {**old, "transcripts": [{**old["transcripts"][0], "files": [{"url": "https://publisher.example.gov.au/t1.pdf", "excerpt": "Orders about publication",
                                                                       "pages": 2, "meta": [{"quote": "may be made", "page": 2}]}]}],
            "established": {"date": "2026-01-05", "cite": {"url": "https://publisher.example.gov.au/t1.pdf", "page": 1, "quote": "Presiding"}}}
    (tmp_path / "snapshot.json").write_text(json.dumps({"commissions": [deep]}))
    out = rc.carried(entry("0" * 64), tmp_path)
    assert not list(text_fields(out)) and "Orders about" not in json.dumps(out) and "may be made" not in json.dumps(out)
    assert out["transcripts"][0]["files"][0] == {"url": "https://publisher.example.gov.au/t1.pdf", "pages": 2, "meta": [{"page": 2}]}
    assert out["established"] == {"date": "2026-01-05", "cite": {"url": "https://publisher.example.gov.au/t1.pdf", "page": 1}}
    # A commission that is not documents only is carried unchanged, as before.
    plain = entry("0" * 64)
    del plain["use"]
    assert rc.carried(plain, tmp_path) == deep


def test_quotation_reads_single_and_typographic_marks_but_not_apostrophes():
    for text, quoted in (("the commission's letters patent", False), ("the commissioners' names", False), ("OPAX\u2019s own words", False),
                         ("said 'orders may be made'", True), ("said \u2018orders\u2019", True), ("\u201corders\u201d", True),
                         ("\u201eorders\u201c", True), ("\u00aborders\u00bb", True), ('a "b"', True)):
        assert rc.quotation([text]) is quoted, text


def test_a_partial_lift_of_five_words_is_found():
    line = "An example line that nobody said"
    words = line.lower().split()
    runs = {hashlib.sha256(" ".join(words[i:i + 5]).encode()).hexdigest() for i in range(len(words) - 4)}
    assert len(SHINGLES) == 22 and len(runs) == 2
    assert len(lifted_runs("It was, he wrote, an example line that nobody could place.", runs)) == 1
    assert not lifted_runs("It was an example line that few could place.", runs)


def load_export():
    spec = importlib.util.spec_from_file_location("export_royal_commissions", ROOT / "scripts" / "export_royal_commissions.py")
    export = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(export)
    return export


def test_export_follows_the_registry_not_the_snapshot(tmp_path):
    """A snapshot built before the registry marked the commission documents only (it may still hold
    extracts) stops the export: nothing is written."""
    export = load_export()
    published = [json.loads(p.read_text()) for p in sorted(PUBLIC.glob("commission-*.json"))]
    commissions = [p["commission"] for p in published]
    out = tmp_path / "out"
    snap = {"schema": rc.SCHEMA, "built_at": published[0]["snapshot_at"], "fetched_at": None, "gaps": [], "commissions": commissions}
    (tmp_path / "good.json").write_text(json.dumps(snap))
    export.main(["--snapshot", str(tmp_path / "good.json"), "--out", str(out)])
    assert (out / f"commission-{ID}.json").read_text() == (PUBLIC / f"commission-{ID}.json").read_text()
    before = {p.name: p.read_bytes() for p in out.iterdir()}
    # The shape of a snapshot from before this rule: no use, a quoted fact, a date line and a quoted note.
    stale = [c if c["id"] != ID else {**{k: v for k, v in c.items() if k != "use"},
                                      "commissioners": [{**c["commissioners"][0], "quote": "Presiding: an example line"}],
                                      "transcripts": [{**t, "date_quote": "An example date line"} for t in c["transcripts"]],
                                      "notes": ['The transcript says "an example line".']} for c in commissions]
    (tmp_path / "stale.json").write_text(json.dumps({**snap, "commissions": stale}))
    with pytest.raises(SystemExit) as e:
        export.main(["--snapshot", str(tmp_path / "stale.json"), "--out", str(out)])
    assert e.value.code == 3 and {p.name: p.read_bytes() for p in out.iterdir()} == before
    # A snapshot that claims documents only for a commission the registry does not mark stops it too.
    other = [c if c["id"] != "cth-robodebt" else {**c, "use": "documents_only"} for c in commissions]
    (tmp_path / "other.json").write_text(json.dumps({**snap, "commissions": other}))
    with pytest.raises(SystemExit) as e:
        export.main(["--snapshot", str(tmp_path / "other.json"), "--out", str(out)])
    assert e.value.code == 3 and {p.name: p.read_bytes() for p in out.iterdir()} == before


def test_export_holds_a_documents_only_record_that_carries_text():
    export = load_export()
    good = json.loads((PUBLIC / f"commission-{ID}.json").read_text())["commission"]
    export.check(good, rc.DOCUMENTS_ONLY)
    with pytest.raises(SystemExit):
        export.check(good)  # the registry does not mark it: the snapshot disagrees
    for change in ({"commissioners": [{**good["commissioners"][0], "quote": "x"}]},
                   {"transcripts": [{**good["transcripts"][0], "date_quote": "x"}]},
                   {"transcripts": [{**good["transcripts"][0], "full_text": {"url": "/transcripts/x.json"}}]},
                   {"transcripts": [{**good["transcripts"][0], "files": [{**good["transcripts"][0]["files"][0], "excerpt": "x"}]}]},
                   {"commissioners": [{**good["commissioners"][0], "cite": {**good["commissioners"][0]["cite"], "quote": "x"}}]},
                   {"notes": ['A note with "a quotation".']}, {"notes": ["A note with 'a quotation'."]},
                   {"gaps": ["A gap with \u2018a quotation\u2019."]}):
        with pytest.raises(SystemExit) as e:
            export.check({**good, **change}, rc.DOCUMENTS_ONLY)
        assert e.value.code == 3
