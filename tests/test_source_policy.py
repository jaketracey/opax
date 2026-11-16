"""The source policy for Python: the public tiers, and the withheld list from this machine's private store.

The withheld list's real contents are never in the repository. Every test here supplies a fake entry through
the private path (the environment variable or a mode 600 file), the way the refresh box does, and asserts that
nothing gets through and that no output, log line or error names the entry.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from parli import arag, source_policy as sp
from parli.ingest import arag_sync, royal_commissions as rc
from scripts import build_transcript_fulltext as ft

ROOT = Path(__file__).resolve().parents[1]
VIC = "vic-major-infrastructure"
# A made-up item. Nothing a test prints, raises or logs may contain any of these.
FAKE = {"document": "speech-424242", "source": "fake-withheld-source", "reason": "legal_order", "date": "2026-11-16"}
SECRETS = (FAKE["document"], FAKE["source"], "424242", "legal_order", "2026-11-16", "Withheld", "withheld at", "legal order")


def policy(use=None, withheld=()):
    """use: source or document id -> a tier name, or a whole record."""
    sources = {k: (v if isinstance(v, dict) else {"use": v, **({"names": ["A Name For This Source"]} if v == "quote_and_cite" else {})}) for k, v in (use or {}).items()}
    return sp.Policy({"schema": 2, "sources": sources}, list(withheld))


def entry(reason="publisher_request", mode=None, **ident):
    return {**ident, "reason": reason, "date": "2026-11-16", **({"mode": mode} if mode else {})}


def store(*entries):
    return json.dumps({"schema": 1, "withheld": list(entries)})


@pytest.fixture(autouse=True)
def no_private_store(monkeypatch, tmp_path):
    """Tests never read the developer's own private store."""
    monkeypatch.delenv("OPAX_WITHHELD_JSON", raising=False)
    monkeypatch.setenv("OPAX_WITHHELD_FILE", str(tmp_path / "absent.json"))


def quiet(capsys, caplog):
    out = capsys.readouterr()
    text = out.out + out.err + caplog.text
    for secret in SECRETS:
        assert secret not in text, secret
    return text


# ---- the public file, the tiers and the empty example

def test_the_repository_holds_the_tiers_and_an_empty_example_and_no_withheld_entry():
    data = json.loads(sp.PATH.read_text())
    assert set(data) == {"schema", "sources"}, "the public policy has no withheld list at all"
    assert json.loads((sp.PATH.parent / "withheld.example.json").read_text()) == {"schema": 1, "withheld": []}
    p = sp.load()
    assert p.withheld_sources == {} and p.withheld_documents == {}
    assert p.use(VIC) == "documents_only" and not p.can("index", sources=[VIC]) and not p.summaries(sources=[VIC]) and not p.kb_generation(VIC)
    assert {k for k, v in data["sources"].items() if v["use"] == "full"} == set(ft.COMMISSIONS)
    # No tracked file other than the example and the loaders' own documentation is a withheld store.
    tracked = [p for p in ROOT.glob("**/withheld*.json") if ".venv" not in p.parts and "node_modules" not in p.parts]
    assert [p.name for p in tracked] == ["withheld.example.json"]


def test_the_registry_and_the_policy_agree_on_each_commissions_tier():
    p = sp.load(private=False)
    for c in rc.registry()["commissions"]:
        if c.get("use"):
            assert p.listed(c["id"]) and p.use(c["id"]) == c["use"], c["id"]
        elif p.listed(c["id"]):
            assert sp.allows(p.use(c["id"]), "quote"), c["id"]


def test_one_table_defines_the_four_tiers():
    assert sp.USES == ("documents_only", "search_only", "quote_and_cite", "full")
    assert sp.CAPABILITIES == {"documents_only": [], "search_only": ["index"], "quote_and_cite": ["index", "quote"],
                               "full": ["index", "quote", "narrative", "kb"]}
    p = policy(use={"a": "documents_only", "b": "search_only", "c": "quote_and_cite", "d": "full"})
    assert [[p.can(cap, sources=[s]) for cap in ("index", "quote", "narrative", "kb")] for s in "abcd"] == [
        [False, False, False, False], [True, False, False, False], [True, True, False, False], [True, True, True, True]]
    assert [p.summaries(sources=[s]) for s in "abcd"] == [False] * 4 and [p.kb_generation(s) for s in "abcd"] == [False] * 4
    allowed = policy(use={"d": {"use": "full", "summaries": "allowed", "kb_generation": "allowed"}})
    assert allowed.summaries(sources=["d"]) and allowed.kb_generation("d")
    assert p.can("kb", sources=["openaustralia"]) and p.summaries(sources=["openaustralia"]) and p.kb_generation("openaustralia")
    assert sp.KB_GENERATION_NEVER == (VIC,) and not policy().kb_generation(VIC)
    assert not policy(use={"d": {"use": "full", "kb_generation": "allowed"}}, withheld=[entry(source="d")]).kb_generation("d")
    q = policy(use={"a-source": "documents_only", "a-source/final": "full"})
    assert q.can("quote", documents=["a-source/final"]) and not q.can("quote", documents=["a-source/day-1"])


@pytest.mark.parametrize("bad", [
    {"schema": 2}, {"schema": 2, "sources": {}, "withheld": []}, {"schema": 2, "sources": {}, "notes": "free text"},
    {"schema": 2, "sources": {"a-source": {"use": "summarise"}}}, {"schema": 2, "sources": {"a-source": "full"}},
    {"schema": 1, "use": {"a-source": "quotable"}}, {"schema": 2, "sources": {"a-source": {"use": "full", "note": "free text"}}},
    {"schema": 2, "sources": {"a-source": {"use": "full", "summaries": "yes"}}},
    {"schema": 2, "sources": {"a-source": {"use": "quote_and_cite", "names": ["A Name For This Source"], "summaries": "allowed"}}},
    {"schema": 2, "sources": {"a-source": {"use": "search_only", "kb_generation": "allowed"}}},
    {"schema": 2, "sources": {VIC: {"use": "full", "kb_generation": "allowed"}}},
    {"schema": 2, "sources": {"a-source": {"use": "quote_and_cite"}}},
    {"schema": 2, "sources": {"a-source": {"use": "full", "hosts": ["https://example.org/path"]}}},
    {"schema": 2, "sources": {"a-source/doc": {"use": "full", "summaries": "allowed"}}},
])
def test_a_malformed_public_policy_is_refused(bad):
    with pytest.raises(sp.PolicyError):
        sp.Policy(bad)


BAD_ENTRIES = [
    [{"source": "a-source", "reason": "publisher_request", "date": "2026-11-16", "note": "why"}],
    [{"source": "a-source", "reason": "because", "date": "2026-11-16"}],
    [{"source": "a-source", "reason": "legal_order", "date": "16 November 2026"}],
    [{"source": "a-source", "reason": "legal_order", "date": "2026-02-30"}],
    [{"source": "A source with words", "reason": "legal_order", "date": "2026-11-16"}],
    [{"source": "a", "document": "b", "reason": "legal_order", "date": "2026-11-16"}],
    [{"document": "speech-1", "reason": "legal_order", "date": "2026-11-16", "mode": "redact"}],
    [entry(source="a-source"), entry(source="a-source")],
]


@pytest.mark.parametrize("entries", BAD_ENTRIES)
def test_a_malformed_entry_is_refused_without_repeating_it(entries):
    with pytest.raises(sp.PolicyError) as error:
        policy(withheld=entries)
    for e in entries:
        for value in e.values():
            assert len(str(value)) < 4 or str(value) not in str(error.value)


def test_only_the_mode_of_an_entry_ever_leaves_the_loader():
    p = policy(withheld=[entry("legal_order", source="a-source"), entry(document="speech-12", mode="hide")])
    assert p.withheld(sources=["a-source"]) == {"mode": "list_only"}
    assert p.withheld(documents=["speech-12"]) == {"mode": "hide"}
    assert p.withheld(documents=["a-source/any-key"]) == {"mode": "list_only"}  # a source covers its documents
    assert p.withheld(sources=["other"], documents=["speech-13"]) is None
    assert sp.MODES == ("list_only", "hide") and sp.NOTICE == "Not available on OPAX. Open the publisher's copy."
    assert not hasattr(sp, "LABELS"), "there is no public wording per reason class"


# ---- the private store

def test_no_store_is_nothing_withheld_and_the_environment_or_a_private_file_supplies_one(monkeypatch, tmp_path):
    assert sp.private_entries() == [] and sp.load().withheld_documents == {}
    monkeypatch.setenv("OPAX_WITHHELD_JSON", store(FAKE and entry("legal_order", document=FAKE["document"])))
    assert sp.load().withheld(documents=[FAKE["document"]]) == {"mode": "list_only"}
    assert sp.load(private=False).withheld(documents=[FAKE["document"]]) is None, "committed outputs are built from the tiers alone"
    monkeypatch.delenv("OPAX_WITHHELD_JSON")
    path = tmp_path / "withheld.json"
    path.write_text(store(entry("legal_order", "hide", source=FAKE["source"])))
    path.chmod(0o600)
    monkeypatch.setenv("OPAX_WITHHELD_FILE", str(path))
    assert sp.load().withheld(sources=[FAKE["source"]]) == {"mode": "hide"}
    path.write_text("")
    assert sp.private_entries() == [], "an empty file is nothing withheld"


@pytest.mark.parametrize("content", ["{not json", '{"schema": 2, "withheld": []}', '{"schema": 1}', '{"schema": 1, "withheld": {}}',
                                     json.dumps({"schema": 1, "withheld": [{"document": "speech-424242", "reason": "legal_order", "date": "soon"}]})])
def test_a_store_that_is_there_and_cannot_be_read_stops_the_job_without_repeating_it(content, monkeypatch, tmp_path, capsys, caplog):
    for supply in ("env", "file"):
        if supply == "env":
            monkeypatch.setenv("OPAX_WITHHELD_JSON", content)
        else:
            monkeypatch.delenv("OPAX_WITHHELD_JSON")
            path = tmp_path / "withheld.json"
            path.write_text(content)
            path.chmod(0o600)
            monkeypatch.setenv("OPAX_WITHHELD_FILE", str(path))
        with pytest.raises(sp.PolicyError) as error:
            sp.load()
        assert "424242" not in str(error.value) and "legal_order" not in str(error.value) and content[:12] not in str(error.value)
        # Every knowledge base client refuses to start, so nothing is pushed from an unread list.
        kb = arag.KbClient(arag.AragConfig(zone="z", account="a", nua_key="n", kb_id="k", kb_token="t"))
        with pytest.raises(sp.PolicyError):
            kb.create_resource(body("speech-1"))
    quiet(capsys, caplog)


def test_a_store_other_users_can_read_is_refused(monkeypatch, tmp_path):
    path = tmp_path / "withheld.json"
    path.write_text(store())
    path.chmod(0o644)
    monkeypatch.setenv("OPAX_WITHHELD_FILE", str(path))
    with pytest.raises(sp.PolicyError, match="chmod 600"):
        sp.load()


def test_the_digest_names_nothing_and_changes_with_the_list():
    empty, one = policy().digest(), policy(withheld=[entry("legal_order", document=FAKE["document"])]).digest()
    assert empty == "4f53cda18c2baa0c" and one != empty and len(one) == 16
    assert policy(withheld=[entry("legal_order", document=FAKE["document"], mode="list_only")]).digest() == one, "the default mode is the same entry"
    assert FAKE["document"] not in one


# ---- the knowledge base: never pushed, deleted if present, and never named

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


def body(slug, source="openaustralia", origin="opax-parli", kind="speech"):
    return {"slug": slug, "title": "t", "texts": {"body": {"body": "words", "format": "PLAIN"}}, "origin": {"source_id": origin},
            "usermetadata": {"classifications": [{"labelset": "kind", "label": kind}, {"labelset": "source", "label": source}]}}


def kb_client(monkeypatch, entries=(), use=None):
    sent = []
    monkeypatch.setattr(arag, "_request", lambda method, url, headers, body=None, **kw: sent.append((method, url)) or {"uuid": "x"})
    kb = arag.KbClient(arag.AragConfig(zone="z", account="a", nua_key="n", kb_id="k", kb_token="t"))
    kb._source_policy = policy(use=use, withheld=entries)
    return kb, sent


# Any knowledge base resource by its id: a speech, a release, a bill text, a research note.
@pytest.mark.parametrize("slug, kind", [(FAKE["document"], "speech"), ("press-pmt-424242", "press_release"),
                                        ("bill-text-au-federal-424242", "bill_text"), ("grant-site-evidence-ga424242", "research_report")])
def test_a_withheld_resource_of_any_kind_is_skipped_by_every_push_path_without_a_word(slug, kind, monkeypatch, capsys, caplog):
    kb, sent = kb_client(monkeypatch, [entry("legal_order", document=slug)])
    # The caller sees an ordinary result: no exception or log line can mark the item as withheld.
    assert kb.create_resource(body(slug, kind=kind)) == {}
    assert kb.patch_resource_by_slug(slug, {"texts": {"body": {"body": "new", "format": "PLAIN"}}}) == {}
    assert sent == []
    kb.create_resource(body("speech-2"))
    assert [m for m, _ in sent] == ["POST"]
    quiet(capsys, caplog)


def test_a_withheld_source_is_skipped_the_same_way(monkeypatch, capsys, caplog):
    kb, sent = kb_client(monkeypatch, [entry(source=FAKE["source"], mode="hide")])
    assert kb.create_resource(body("speech-9", source=FAKE["source"])) == {} and kb.create_resource(body("speech-9", origin=FAKE["source"])) == {}
    assert sent == []
    quiet(capsys, caplog)


@pytest.mark.parametrize("tier", ["documents_only", "search_only", "quote_and_cite"])
def test_a_source_below_the_full_tier_is_refused_aloud_because_tiers_are_public(tier, monkeypatch):
    kb, sent = kb_client(monkeypatch, use={"openaustralia": tier})
    with pytest.raises(sp.Withheld) as error:
        kb.create_resource(body("speech-1"))
    assert "speech-1" not in str(error.value) and sent == []


def test_every_push_path_goes_through_the_guarded_client():
    """No script posts resources to the knowledge base except through KbClient."""
    offenders = []
    for path in [*ROOT.glob("parli/**/*.py"), *ROOT.glob("scripts/**/*.py")]:
        text = path.read_text(encoding="utf-8", errors="ignore")
        if path.name != "arag.py" and '"/resources"' in text and "_request(" in text:
            offenders.append(str(path.relative_to(ROOT)))
    assert offenders == []


def test_sync_does_not_push_queue_or_mention_a_withheld_resource(capsys, caplog):
    p = policy(withheld=[entry("legal_order", document=FAKE["document"])], use={"committee_x": "search_only"})
    kb, state = FakeKb(), {"pushed": 0, "failed": {FAKE["document"]: "500: earlier"}}
    arag_sync._push_batch(kb, [body(FAKE["document"]), body("speech-2"), body("speech-3", source="committee_x")], state, policy=p)
    assert kb.pushed == ["speech-2"] and state["failed"] == {} and state["pushed"] == 1
    quiet(capsys, caplog)


def test_purge_deletes_withheld_documents_and_every_resource_of_a_withheld_source(capsys, caplog):
    p = policy(withheld=[entry(document=FAKE["document"]), entry(document="speech-gone"), entry(document="a-commission/day-1"),
                         entry(document="integrity-report-fake-424242"), entry("legal_order", source=FAKE["source"])])
    pages = lambda: [{"resources": {"r1": {"slug": "speech-7"}, "r2": {"slug": "speech-8"}}, "fulltext": {"next_page": True}},  # noqa: E731
                     {"resources": {"r3": {"slug": "speech-9"}}, "fulltext": {"next_page": False}}]
    dry = FakeKb(catalog=pages())
    # The dry run lists what it would delete, for the operator's own terminal, and deletes nothing.
    assert arag_sync.purge_withheld(dry, p, dry_run=True) == {"would_delete": ["integrity-report-fake-424242", "speech-424242", "speech-7", "speech-8", "speech-9", "speech-gone"]}
    assert dry.deleted == []
    kb = FakeKb(catalog=pages())
    assert arag_sync.purge_withheld(kb, p) == {"deleted": 5, "absent": 1}
    assert kb.deleted == ["integrity-report-fake-424242", "speech-424242", "speech-7", "speech-8", "speech-9"]
    assert kb.asked["filter_expression"]["resource"]["or"] == [{"prop": "label", "labelset": "source", "label": FAKE["source"]}, {"prop": "origin_source", "id": FAKE["source"]}]
    assert arag_sync.purge_withheld(FakeKb(), policy()) == {"deleted": 0, "absent": 0}
    quiet(capsys, caplog)  # the function itself prints nothing; only the operator's command prints its return value


def test_the_nightly_sync_purges_silently_and_only_the_operators_command_prints(monkeypatch, capsys):
    source = (ROOT / "parli" / "ingest" / "arag_sync.py").read_text()
    assert "print(json.dumps(purge_withheld(KbClient(cfg), policy, dry_run=args.dry_run)))" in source
    assert "    if kb is not None and (policy.withheld_sources or policy.withheld_documents):\n        purge_withheld(kb, policy)\n" in source
    assert "WITHHELD" not in source and "[withheld]" not in source


# ---- transcript full text: a committed output, built from the tiers alone

REG = {"commissions": [{"id": "cth-robodebt", "name": "R", "documents": [
    {"key": "day-1", "kind": "hearing_transcript"}, {"key": "day-2", "kind": "hearing_transcript"}, {"key": "final", "kind": "final_report"}]},
    {"id": VIC, "name": "V", "documents": [{"key": "day-1", "kind": "hearing_transcript"}]}]}


def keys(p):
    return [(c["id"], d["key"]) for c, d in ft.transcripts(REG, p)]


def test_transcript_text_is_published_only_for_a_listed_full_source():
    assert keys(policy(use={"cth-robodebt": "full"})) == [("cth-robodebt", "day-1"), ("cth-robodebt", "day-2")]
    for tier in ("documents_only", "search_only", "quote_and_cite"):
        assert keys(policy(use={"cth-robodebt": tier})) == []
    assert keys(policy()) == []  # not listed: no text
    assert all(c["id"] != VIC for c, _ in ft.transcripts(json.loads(ft.REGISTRY.read_text())))


def test_a_committed_build_never_reads_the_private_store(monkeypatch):
    """The transcript text files are committed. A withheld transcript is taken out at deploy, never here, so the
    repository's history cannot show one being removed."""
    monkeypatch.setenv("OPAX_WITHHELD_JSON", store(entry("legal_order", document="cth-robodebt/day-2")))
    registry = {"commissions": [{**REG["commissions"][0]}]}
    monkeypatch.setattr(ft.source_policy, "PATH", _policy_file(monkeypatch, {"cth-robodebt": {"use": "full"}}))
    assert [(c["id"], d["key"]) for c, d in ft.transcripts(registry)] == [("cth-robodebt", "day-1"), ("cth-robodebt", "day-2")]
    source = (ROOT / "scripts" / "build_transcript_fulltext.py").read_text()
    assert "source_policy.load(private=False)" in source and "source_policy.load()" not in source


def _policy_file(monkeypatch, sources):
    path = Path(os.environ["OPAX_WITHHELD_FILE"]).parent / "policy.json"
    path.write_text(json.dumps({"schema": 2, "sources": sources}))
    real = sp.load
    monkeypatch.setattr(sp, "load", lambda p=path, private=True: real(p, private))
    return path
