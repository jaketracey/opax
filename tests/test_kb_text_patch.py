"""The shared knowledge-box text-patch loop (used by act_hansard and committee_hearings) on the committee queue."""
import sqlite3

import pytest

pytest.importorskip("parli.ingest.arag_sync")           # arag_sync needs Python 3.12+ (an f-string in speech_hygiene)

from parli.arag import AragError
from parli.ingest import committee_hearings as ch
from parli.ingest import kb_text_patch as kp
from parli.schema import get_db

LONG = "The committee heard evidence about the annual report and the outlook for interest rates. " * 4      # > 200 characters


class FakeKb:
    def __init__(self, missing=(), boom=()):
        self.calls, self.missing, self.boom = [], set(missing), set(boom)

    def patch_resource_by_slug(self, slug, body):
        self.calls.append(("patch", slug, sorted(body)))
        if slug in self.boom:
            raise AragError(500, "u", "server error")
        if slug in self.missing:
            raise AragError(404, "u", "not found")

    def delete_resource_by_slug(self, slug):
        self.calls.append(("delete", slug))

    def create_resource(self, body):
        self.calls.append(("create", body["slug"]))


@pytest.fixture
def db(tmp_path):
    conn = get_db(tmp_path / "kp.db")
    ch.ensure_schema(conn)
    conn.row_factory = sqlite3.Row
    yield conn
    conn.close()


def speech(db, text=LONG, source="committee_house", date="2026-09-18"):
    db.execute("INSERT INTO speeches (speaker_name, chamber, date, topic, text, word_count, source, state, hearing_id) "
               "VALUES ('Ms Bullock','house_committee',?,'Committee - Inquiry',?,40,?,'federal','committees/commrep/1/0001')",
               (date, text, source))
    return db.execute("SELECT last_insert_rowid()").fetchone()[0]


def pending(db):
    return [tuple(r) for r in db.execute("SELECT speech_id, op FROM committee_kb_queue WHERE done_at IS NULL ORDER BY speech_id")]


def test_a_row_the_box_holds_gets_a_text_only_patch_and_is_marked_done(db):
    sid = speech(db)
    kp.queue(db, "committee_kb_queue", sid, "patch", "proof_to_final")
    kb = FakeKb()
    assert kp.send_queued(db, kb, "committee_kb_queue", label="committee", checkpoint=sid) == {"patched": 1}
    assert kb.calls == [("patch", f"speech-{sid}", ["texts"])]                  # the body only: labels and summaries stay
    assert pending(db) == [] and kp.send_queued(db, kb, "committee_kb_queue", checkpoint=sid) == {}


def test_a_row_above_the_push_checkpoint_needs_nothing_because_the_next_push_carries_it(db):
    sid = speech(db)
    kp.queue(db, "committee_kb_queue", sid, "patch", "proof_to_final")
    kb = FakeKb()
    assert kp.send_queued(db, kb, "committee_kb_queue", checkpoint=sid - 1) == {"not-pushed": 1}
    assert kb.calls == [] and pending(db) == []


def test_a_missing_resource_is_created_when_the_new_text_qualifies_and_skipped_when_it_does_not(db):
    ok, short = speech(db), speech(db, text="Too short to be in the corpus at all.")
    for sid in (ok, short):
        kp.queue(db, "committee_kb_queue", sid, "patch", "proof_to_final")
    kb = FakeKb(missing={f"speech-{ok}", f"speech-{short}"})
    assert kp.send_queued(db, kb, "committee_kb_queue", checkpoint=10 ** 9) == {"created": 1, "not-in-corpus": 1}
    assert ("create", f"speech-{ok}") in kb.calls and ("create", f"speech-{short}") not in kb.calls


def test_a_deleted_turn_is_deleted_from_the_box_only_if_it_was_pushed(db):
    kp.queue(db, "committee_kb_queue", 5, "delete", "turn absent from the Final")
    kp.queue(db, "committee_kb_queue", 50, "delete", "turn absent from the Final")
    kb = FakeKb()
    assert kp.send_queued(db, kb, "committee_kb_queue", checkpoint=10) == {"deleted": 1, "not-pushed": 1}
    assert kb.calls == [("delete", "speech-5")]


def test_a_failure_stays_queued_with_its_error_and_is_retried(db):
    sid = speech(db)
    kp.queue(db, "committee_kb_queue", sid, "patch", "proof_to_final")
    assert kp.send_queued(db, FakeKb(boom={f"speech-{sid}"}), "committee_kb_queue", checkpoint=sid) == {"failed": 1}
    assert pending(db) == [(sid, "patch")]
    assert "AragError" in db.execute("SELECT error FROM committee_kb_queue").fetchone()[0]
    assert kp.send_queued(db, FakeKb(), "committee_kb_queue", checkpoint=sid) == {"patched": 1}
    assert db.execute("SELECT error FROM committee_kb_queue").fetchone()[0] is None


def test_a_dry_run_sends_and_marks_nothing(db):
    sid = speech(db)
    kp.queue(db, "committee_kb_queue", sid, "patch", "proof_to_final")
    kb = FakeKb()
    assert kp.send_queued(db, kb, "committee_kb_queue", dry_run=True, checkpoint=sid) == {"would-patch": 1}
    assert kb.calls == [] and pending(db) == [(sid, "patch")]


def test_a_row_deleted_from_the_database_is_reported_gone(db):
    kp.queue(db, "committee_kb_queue", 777, "patch", "proof_to_final")
    assert kp.send_queued(db, FakeKb(), "committee_kb_queue", checkpoint=10 ** 9) == {"gone": 1}


def test_re_queueing_a_done_row_makes_it_pending_again(db):
    sid = speech(db)
    kp.queue(db, "committee_kb_queue", sid, "patch", "proof_to_final")
    kp.send_queued(db, FakeKb(), "committee_kb_queue", checkpoint=sid)
    kp.queue(db, "committee_kb_queue", sid, "patch", "proof_to_final")
    assert pending(db) == [(sid, "patch")]


# ---- the committee command uses it ------------------------------------------------------------------------------------

def test_patch_kb_flag_sends_the_queue_and_exits_without_discovery(tmp_path, monkeypatch):
    sent = []
    monkeypatch.setattr(ch, "send_kb_queue", lambda db, **kw: sent.append(kw) or {})
    monkeypatch.setattr(ch, "RateLimitedSession", lambda: (_ for _ in ()).throw(AssertionError("no requests for --patch-kb")))
    assert ch.main(["--db", str(tmp_path / "p.db"), "--patch-kb", "--patch-limit", "7"]) == 0
    assert sent == [{"limit": 7, "dry_run": False}]


def test_a_nightly_run_sends_its_queue_only_with_opax_sync_kb(tmp_path, monkeypatch, capsys):
    from test_committee_hearings import CliHttp                               # the fake ParlInfo of the ingest tests
    http = CliHttp()
    monkeypatch.setattr(ch, "RateLimitedSession", lambda: http)
    sent = []
    monkeypatch.setattr(ch, "send_kb_queue", lambda db, **kw: sent.append(kw) or {})
    db_path = str(tmp_path / "n.db")
    args = ["--db", db_path, "--cache-dir", str(tmp_path / "c"), "--since", "2026-09-01", "--until", "2026-09-30"]
    monkeypatch.delenv("OPAX_SYNC_KB", raising=False)
    conn = get_db(db_path)
    ch.ensure_schema(conn)
    kp.queue(conn, "committee_kb_queue", 1, "patch", "proof_to_final")
    conn.commit()
    conn.close()
    ch.main(args)
    assert sent == [] and "changes queued in committee_kb_queue" in capsys.readouterr().out
    monkeypatch.setenv("OPAX_SYNC_KB", "1")
    ch.main(args)
    assert len(sent) == 1
    ch.main(args + ["--no-patch-kb"])
    assert len(sent) == 1
