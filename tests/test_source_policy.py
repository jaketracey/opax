"""The source policy: one file, honoured by every Python consumer.

Each consumer is given a policy with an entry added and must let nothing through. The published file itself
holds no withheld entry.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from parli import arag, source_policy as sp
from parli.ingest import arag_sync, royal_commissions as rc
from scripts import build_transcript_fulltext as ft, export_royal_commissions as export
from tests.test_royal_commissions import make_pdf

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "portal" / "public"
VIC = "vic-major-infrastructure"


def policy(use=None, withheld=()):
    return sp.Policy({"schema": 1, "use": use or {}, "withheld": list(withheld)})


def entry(reason="publisher_request", **ident):
    return {**ident, "reason": reason, "date": "2026-11-16"}


# ---- the file and its loader

def test_published_policy_holds_no_withheld_entry_and_lists_the_commission_as_documents_only():
    data = json.loads(sp.PATH.read_text())
    assert data["withheld"] == []
    p = sp.load()
    assert p.use(VIC) == "documents_only" and p.listed(VIC)
    assert not p.text_allowed(documents=[f"{VIC}/transcript-2026-11-09"])
    assert {k for k, v in data["use"].items() if v == "quotable"} == set(ft.COMMISSIONS)


@pytest.mark.parametrize("bad", [
    {"schema": 1, "use": {}},  # no withheld list
    {"schema": 1, "use": {}, "withheld": [], "notes": "free text"},
    {"schema": 1, "use": {"a-source": "summarise"}, "withheld": []},
    {"schema": 1, "use": {}, "withheld": [{"source": "a-source", "reason": "publisher_request", "date": "2026-11-16", "note": "why"}]},
    {"schema": 1, "use": {}, "withheld": [{"source": "a-source", "reason": "because", "date": "2026-11-16"}]},
    {"schema": 1, "use": {}, "withheld": [{"source": "a-source", "reason": "legal_order", "date": "16 November 2026"}]},
    {"schema": 1, "use": {}, "withheld": [{"source": "a-source", "reason": "legal_order", "date": "2026-02-30"}]},
    {"schema": 1, "use": {}, "withheld": [{"source": "A source with words", "reason": "legal_order", "date": "2026-11-16"}]},
    {"schema": 1, "use": {}, "withheld": [{"source": "a", "document": "b", "reason": "legal_order", "date": "2026-11-16"}]},
    {"schema": 1, "use": {}, "withheld": [entry(source="a-source"), entry(source="a-source")]},
])
def test_a_malformed_policy_is_refused(bad):
    with pytest.raises(sp.PolicyError):
        sp.Policy(bad)


def test_an_entry_is_only_an_id_a_reason_class_and_a_date_and_carries_its_label():
    p = policy(withheld=[entry("legal_order", source="a-source"), entry(document="speech-12")])
    assert p.withheld(sources=["a-source"]) == {"reason": "legal_order", "date": "2026-11-16", "label": "Withheld: subject to a legal order"}
    assert p.withheld(documents=["speech-12"])["label"] == "Withheld at the publisher's request"
    assert p.withheld(documents=["a-source/any-key"])["reason"] == "legal_order"  # a source covers its documents
    assert p.withheld(sources=["other"], documents=["speech-13"]) is None
    assert set(sp.LABELS) == set(sp.REASONS)


def test_a_document_use_overrides_its_source():
    p = policy(use={"a-source": "documents_only", "a-source/final": "quotable"})
    assert p.use("a-source", "a-source/final") == "quotable" and p.use("a-source", "a-source/day-1") == "documents_only"
    assert p.text_allowed(documents=["a-source/final"]) and not p.text_allowed(documents=["a-source/day-1"])
    assert policy(use={"a-source": "search_only"}).text_allowed(sources=["a-source"]) is False


# ---- the knowledge base: refuse to push, delete if present

class FakeKb:
    def __init__(self, catalog=()):
        self.pushed, self.deleted, self.pages = [], [], list(catalog)

    def create_resource(self, body, max_retries=0):
        self.pushed.append(body["slug"])

    def catalog_post(self, body):
        self.asked = body
        return self.pages.pop(0) if self.pages else {"resources": {}, "fulltext": {"next_page": False}}

    def delete_resource_by_slug(self, slug):
        if slug == "speech-gone":
            raise arag.AragError(404, "url", "not found")
        self.deleted.append(slug)


def body(slug, source="openaustralia", origin="opax-parli"):
    return {"slug": slug, "title": "t", "texts": {"body": {"body": "words", "format": "PLAIN"}}, "origin": {"source_id": origin},
            "usermetadata": {"classifications": [{"labelset": "kind", "label": "speech"}, {"labelset": "source", "label": source}]}}


def kb_client(p, monkeypatch):
    sent = []
    monkeypatch.setattr(arag, "_request", lambda method, url, headers, body=None, **kw: sent.append((method, url)) or {})
    kb = arag.KbClient(arag.AragConfig(zone="z", account="a", nua_key="n", kb_id="k", kb_token="t"))
    kb._source_policy = p
    return kb, sent


@pytest.mark.parametrize("p, refused", [
    (policy(withheld=[entry(source="openaustralia")]), body("speech-1")),
    (policy(withheld=[entry(source="opax-parli")]), body("speech-1")),
    (policy(withheld=[entry("withdrawn", document="speech-1")]), body("speech-1")),
    (policy(use={"openaustralia": "search_only"}), body("speech-1")),
    (policy(use={"openaustralia": "documents_only"}), body("speech-1")),
])
def test_the_client_every_push_path_uses_refuses_a_closed_source_or_document(p, refused, monkeypatch):
    kb, sent = kb_client(p, monkeypatch)
    with pytest.raises(sp.Withheld):
        kb.create_resource(refused)
    with pytest.raises(sp.Withheld):
        kb.patch_resource_by_slug(refused["slug"], {k: v for k, v in refused.items() if k != "slug"})
    assert sent == []
    kb.create_resource(body("speech-2", source="nsw_hansard", origin="other"))
    assert [m for m, _ in sent] == ["POST"]


def test_every_push_path_goes_through_the_guarded_client():
    """No script posts resources to the knowledge base except through KbClient."""
    offenders = []
    for path in [*ROOT.glob("parli/**/*.py"), *ROOT.glob("scripts/**/*.py")]:
        text = path.read_text(encoding="utf-8", errors="ignore")
        if path.name != "arag.py" and '"/resources"' in text and "_request(" in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_sync_does_not_push_or_queue_a_closed_resource():
    p = policy(withheld=[entry(document="speech-1")], use={"committee_x": "search_only"})
    kb, state = FakeKb(), {"pushed": 0, "failed": {"speech-1": "500: earlier"}}
    arag_sync._push_batch(kb, [body("speech-1"), body("speech-2"), body("speech-3", source="committee_x")], state, policy=p)
    assert kb.pushed == ["speech-2"] and state["failed"] == {} and state["pushed"] == 1


def test_purge_deletes_withheld_documents_and_every_resource_of_a_withheld_source():
    p = policy(withheld=[entry(document="speech-1"), entry(document="speech-gone"), entry(document="a-commission/day-1"), entry("legal_order", source="a-source")])
    kb = FakeKb(catalog=[{"resources": {"r1": {"slug": "speech-7"}, "r2": {"slug": "speech-8"}}, "fulltext": {"next_page": True}},
                         {"resources": {"r3": {"slug": "speech-9"}}, "fulltext": {"next_page": False}}])
    assert arag_sync.purge_withheld(kb, p) == {"deleted": 4, "absent": 1}
    assert kb.deleted == ["speech-1", "speech-7", "speech-8", "speech-9"]
    assert kb.asked["filter_expression"]["resource"]["or"] == [{"prop": "label", "labelset": "source", "label": "a-source"}, {"prop": "origin_source", "id": "a-source"}]
    assert arag_sync.purge_withheld(FakeKb(), policy()) == {"deleted": 0, "absent": 0}


# ---- transcript full text

REG = {"commissions": [{"id": "cth-robodebt", "name": "R", "documents": [
    {"key": "day-1", "kind": "hearing_transcript"}, {"key": "day-2", "kind": "hearing_transcript"}, {"key": "final", "kind": "final_report"}]},
    {"id": VIC, "name": "V", "documents": [{"key": "day-1", "kind": "hearing_transcript"}]}]}


def keys(p):
    return [(c["id"], d["key"]) for c, d in ft.transcripts(REG, p)]


def test_transcript_text_is_built_only_for_a_listed_quotable_source_and_never_for_a_withheld_one():
    quotable = {"cth-robodebt": "quotable"}
    assert keys(policy(use=quotable)) == [("cth-robodebt", "day-1"), ("cth-robodebt", "day-2")]
    assert keys(policy(use=quotable, withheld=[entry(document="cth-robodebt/day-2")])) == [("cth-robodebt", "day-1")]
    assert keys(policy(use=quotable, withheld=[entry("legal_order", source="cth-robodebt")])) == []
    assert keys(policy(use={"cth-robodebt": "search_only"})) == [] and keys(policy(use={"cth-robodebt": "documents_only"})) == []
    assert keys(policy()) == []  # not listed: no text
    assert all(c["id"] != VIC for c, _ in ft.transcripts(json.loads(ft.REGISTRY.read_text()), sp.load()))


# ---- the public commission record

def commission():
    pdf, held = "https://publisher.example/final.pdf", "https://publisher.example/day-1.pdf"
    doc = lambda key, kind, url: {"key": key, "kind": kind, "title": f"Title {key}", "date": "2026-11-09", "date_basis": "stated",  # noqa: E731
                                  "page_url": "https://publisher.example/hearings", "files": [{"url": url, "pages": 9, "sha256": "a" * 64}],
                                  "cite": {"url": "https://publisher.example/hearings", "document": f"Title {key}"}, "acquisition": "fetched by OPAXBot",
                                  "rights": "No notice.", "date_quote": "On Monday", "full_text": {"url": "/transcripts/x.json"}, "hearing": "Block 1"}
    return {"id": "a-commission", "name": "A Commission", "site": "https://publisher.example/",
            "established": {"date": "2020-01-01", "quote": "Letters Patent dated 1 January 2020", "cite": {"url": pdf, "document": "Final", "page": 2}},
            "commissioners": [{"name": "A Person", "role": "Commissioner", "quote": "Commissioner: A Person", "cite": {"url": held, "document": "Day 1", "page": 1}}],
            "reports": [doc("final", "final_report", pdf)], "responses": [], "transcripts": [doc("day-1", "hearing_transcript", held)],
            "recommendations": [{"number": "1", "report": "final", "text": "Do the thing.", "cite": {"url": pdf, "document": "Final", "page": 3}}],
            "court_context": [{"text": "The Court ruled.", "applies_to": "final", "cite": {"url": "https://court.example/", "document": "Page"}}],
            "notes": ["An OPAX note."], "gaps": []}


LISTING = {"key", "kind", "title", "date", "date_basis", "page_url", "files", "cite", "acquisition", "withheld"}


def test_a_withheld_document_is_a_listing_row_with_its_label_and_the_publishers_page_only():
    out = sp.redact_commission(commission(), policy(withheld=[entry("legal_order", document="a-commission/day-1")]))
    row = out["transcripts"][0]
    assert set(row) == LISTING and row["files"] == [] and row["page_url"] == "https://publisher.example/hearings"
    assert row["withheld"] == {"reason": "legal_order", "date": "2026-11-16", "label": "Withheld: subject to a legal order"}
    assert out["commissioners"] == []  # the fact was read from the withheld transcript
    assert "day-1.pdf" not in json.dumps(out)
    # the report beside it is untouched
    assert out["reports"][0] == commission()["reports"][0] and len(out["recommendations"]) == 1 and out["established"]["quote"]


def test_a_withheld_source_keeps_only_listing_rows():
    out = sp.redact_commission(commission(), policy(withheld=[entry(source="a-commission")]))
    assert all(set(d) == LISTING for d in out["reports"] + out["transcripts"])
    assert out["recommendations"] == [] and out["court_context"] == [] and out["notes"] == []
    assert out["withheld"]["label"] == "Withheld at the publisher's request"
    assert out["established"] is None and out["commissioners"] == []
    text = json.dumps(out)
    for leaked in ("Do the thing", "The Court ruled", "Letters Patent dated", "Commissioner: A Person", "On Monday", "An OPAX note", ".pdf", "/transcripts/"):
        assert leaked not in text


@pytest.mark.parametrize("use", ["documents_only", "search_only"])
def test_a_source_that_is_not_quotable_carries_no_quotation_or_text_pointer(use):
    out = sp.redact_commission(commission(), policy(use={"a-commission": use}))
    assert out["use"] == use and out["recommendations"] == []
    for d in out["reports"] + out["transcripts"]:
        assert "date_quote" not in d and "full_text" not in d and d["files"]
    assert "quote" not in out["established"] and "quote" not in out["commissioners"][0]
    assert sp.redact_commission(commission(), policy()) == commission()  # an unlisted source is unchanged


def test_export_holds_a_record_that_carries_text_its_policy_does_not_allow(capsys):
    p = policy(use={"a-commission": "documents_only"})
    c = {**sp.redact_commission(commission(), p), "inquiry_type": "royal_commission", "jurisdiction": "Vic"}
    export.check(c, p)
    with pytest.raises(SystemExit):
        export.check({**c, "transcripts": [{**c["transcripts"][0], "date_quote": "On Monday"}]}, p)
    with pytest.raises(SystemExit):
        export.check({**c, "commissioners": [{**c["commissioners"][0], "quote": "Commissioner: A Person"}]}, p)


# ---- building a documents-only source: facts are checked on the page, and no wording is held

def documents_only_entry(sha, **changes):
    doc = {"key": "day-1", "kind": "hearing_transcript", "source": "manual", "url": "https://publisher.example.gov.au/day-1.pdf", "sha256": sha,
           "title": "Public hearing transcript, Monday 2 March 2026", "document_kind": "public hearing transcript",
           "acquisition": "manual publisher download supplied by the OPAX maintainer, 11 Nov 2026", "rights": "No notice.",
           "date": "2026-03-02", "date_page": 1}
    return {"id": "test-sitting", "name": "Royal Commission into Sitting", "inquiry_type": "royal_commission", "jurisdiction": "Vic",
            "documents": [{**doc, **changes.pop("doc", {})}], "notes": ["OPAX lists the transcripts only."],
            "facts": [{"field": "commissioner", "value": "The Honourable A Person", "role": "Commissioner", "doc": "day-1", "page": 1}], **changes}


@pytest.fixture
def sitting(tmp_path):
    data = make_pdf([[("TRANSCRIPT OF PROCEEDINGS", 14), ("Presiding: The Honourable A Person", 10), ("On Monday, 2 March 2026 at 9.30 am", 10)],
                     [("MR SMITH: Evidence that must not be held.", 10)]])
    sha = hashlib.sha256(data).hexdigest()
    (tmp_path / "manual").mkdir()
    (tmp_path / "manual" / (sha + ".pdf")).write_bytes(data)
    run = tmp_path / "raw" / "r"
    run.mkdir(parents=True)
    return sha, run, rc.Texts(tmp_path)


def test_a_documents_only_source_is_built_with_checked_facts_and_no_document_wording(sitting):
    sha, run, texts = sitting
    p = policy(use={"test-sitting": "documents_only"})
    out = rc.build_commission(documents_only_entry(sha), run, texts, {}, p)
    t = out["transcripts"][0]
    assert t["date"] == "2026-03-02" and t["date_basis"] == "stated" and t["date_cite"]["page"] == 1 and "date_quote" not in t
    assert out["commissioners"] == [{"name": "The Honourable A Person", "role": "Commissioner",
                                     "cite": {"url": "https://publisher.example.gov.au/day-1.pdf", "document": t["title"], "page": 1}}]
    assert t["files"][0]["pages"] == 2 and t["files"][0]["sha256"] == sha
    blob = json.dumps(out)
    assert "Evidence that must not be held" not in blob and "9.30 am" not in blob and "Presiding:" not in blob
    # ... and the build keeps no extracted text of the document on disk either
    assert not (texts.cache / "text").exists()


@pytest.mark.parametrize("changes", [
    {"doc": {"date_quote": "On Monday, 2 March 2026 at 9.30 am"}},  # a held date line
    {"doc": {"date": "2026-03-03"}},  # a date the page does not print
    {"facts": [{"field": "commissioner", "value": "The Honourable A Person", "doc": "day-1", "page": 1, "quote": "Presiding: The Honourable A Person"}]},
    {"facts": [{"field": "commissioner", "value": "Someone Else", "doc": "day-1", "page": 1}]},  # a name the page does not print
    {"notes": ['The commission said "Orders may follow".']},  # a quotation in a note
])
def test_a_documents_only_source_holds_on_a_quotation_or_an_unchecked_fact(sitting, changes):
    sha, run, texts = sitting
    with pytest.raises(SystemExit):
        rc.build_commission(documents_only_entry(sha, **changes), run, texts, {}, policy(use={"test-sitting": "documents_only"}))


# ---- item 1: the commission's record as published

QUOTE_MARKS = '"“”‘’'


def strings(value):
    if isinstance(value, dict):
        for v in value.values():
            yield from strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from strings(v)
    elif isinstance(value, str):
        yield value


def test_the_registry_holds_no_extract_from_the_commissions_transcripts():
    reg = next(c for c in rc.registry()["commissions"] if c["id"] == VIC)
    assert set(reg) == {"id", "name", "inquiry_type", "jurisdiction", "site", "documents", "reference_pages", "facts", "notes", "gaps"}
    for d in reg["documents"]:
        assert set(d) == {"key", "kind", "source", "url", "sha256", "title", "document_kind", "acquisition", "rights", "page", "date", "date_page", "hearing"}
    assert reg["facts"] == [{"field": "commissioner", "value": reg["facts"][0]["value"], "role": "Commissioner", "doc": "transcript-2026-11-09", "page": 1}]
    for s in strings(reg):
        assert not any(q in s.replace("commission's", "").replace("publisher's", "") for q in QUOTE_MARKS), s


def test_the_published_record_carries_listing_fields_and_opax_worded_notes_only():
    c = json.loads((PUBLIC / "royal-commissions" / f"commission-{VIC}.json").read_text())["commission"]
    assert c["use"] == "documents_only" and c["established"] is None
    assert c["reports"] == [] and c["responses"] == [] and c["recommendations"] == [] and c["court_context"] == []
    assert [set(x) for x in c["commissioners"]] == [{"name", "role", "cite"}] and c["commissioners"][0]["cite"]["page"] == 1
    assert len(c["transcripts"]) == 2
    for t in c["transcripts"]:
        # title, date, publisher links, page count, hash, rights note; nothing read from the text
        assert set(t) == {"key", "kind", "title", "date", "date_basis", "page_url", "files", "cite", "acquisition", "document_kind", "rights", "date_cite", "hearing"}
        assert [set(f) for f in t["files"]] == [{"url", "name", "pages", "bytes", "sha256"}]
        assert t["date_cite"]["page"] == 1 and set(t["date_cite"]) == {"url", "document", "page"}
    assert len(c["notes"]) == 3 and all(len(n) < 300 for n in c["notes"])
    for s in strings(c):
        assert not any(q in s.replace("commission's", "").replace("publisher's", "") for q in QUOTE_MARKS), s
    # the same record is what the registry would rebuild
    reg = next(x for x in rc.registry()["commissions"] if x["id"] == VIC)
    assert c["notes"] == reg["notes"] and c["commissioners"][0]["name"] == reg["facts"][0]["value"]
    assert sp.redact_commission(c, sp.load()) == c


def test_no_text_of_the_commissions_transcripts_is_published_or_indexed():
    ix = json.loads((PUBLIC / "transcripts" / "index.json").read_text())
    assert VIC not in ix["commissions"] and not any(d.get("commission") == VIC for d in ix["docs"])
    assert not (PUBLIC / "transcripts" / VIC).exists()
    hashes = {t["files"][0]["sha256"] for t in json.loads((PUBLIC / "royal-commissions" / f"commission-{VIC}.json").read_text())["commission"]["transcripts"]}
    assert not any(d.get("sha256") in hashes for d in ix["docs"])
    row = next(r for r in json.loads((PUBLIC / "royal-commissions" / "index.json").read_text())["commissions"] if r["id"] == VIC)
    assert row["use"] == "documents_only" and row["counts"]["recommendations"] == 0 and row["counts"]["transcripts"] == 2
