"""The nightly NSW load: a split byline is one speaker, a recent day with nothing stored is never final,
and a failed day fails the step."""
import sqlite3
import sys
import xml.etree.ElementTree as ET
from datetime import date, timedelta

import pytest

from parli import schema
from parli.ingest import nsw_hansard as n

TODAY = date.today()
RECENT = (TODAY - timedelta(days=5)).isoformat()
OLD = (TODAY - timedelta(days=n.RETRY_WINDOW_DAYS + 10)).isoformat()
SCHEMA = """CREATE TABLE IF NOT EXISTS speeches(speech_id INTEGER PRIMARY KEY, person_id TEXT, speaker_name TEXT,
    party TEXT, electorate TEXT, chamber TEXT, date TEXT, topic TEXT, text TEXT, word_count INTEGER, source TEXT,
    state TEXT)"""


TEXT = "This is a sufficiently long contribution from the named member to the parliamentary debate."


def fragment(byline):
    return ET.fromstring(f'''<hansard xmlns:html="http://www.w3.org/1999/xhtml"><hansard.header>
<chamber>Legislative Council</chamber></hansard.header><fragment.text><html:body><html:p class="Normal-P">
<html:span class="Normal-H">{byline}<html:span class="GeneralBold-H"> (</html:span><html:span class="Time-H">10:09</html:span>
<html:span class="GeneralBold-H">):</html:span> {TEXT}</html:span></html:p></html:body></fragment.text></hansard>''')


def test_a_name_split_across_adjacent_spans_is_one_speaker():
    """The form that lost 19 November 2026: one member's byline set in two spans, the ID on the first."""
    speeches = n.extract_speeches_from_fragment(fragment(
        '<html:span class="MemberSpeech-H" data-mode="member" data-value="88">The Hon. JANE</html:span>\n'
        '<html:span class="MemberSpeech-H"> EXAMPLE</html:span>'))
    assert [(s["speaker_name"], s["speaker_id"]) for s in speeches] == [("The Hon. JANE EXAMPLE", "88")]
    assert TEXT in speeches[0]["text"]


@pytest.mark.parametrize("byline", [
    # two members
    '<html:span class="MemberSpeech-H" data-mode="member" data-value="88">Ms JANE EXAMPLE</html:span>'
    '<html:span class="MemberSpeech-H" data-mode="member" data-value="91">Mr JOHN SAMPLE</html:span>',
    # words between the spans
    '<html:span class="MemberSpeech-H" data-mode="member" data-value="88">Ms JANE EXAMPLE</html:span> and '
    '<html:span class="MemberSpeech-H">Mr JOHN SAMPLE</html:span>',
    # different heading forms
    '<html:span class="MemberSpeech-H" data-mode="member" data-value="88">Ms JANE EXAMPLE</html:span>'
    '<html:span class="MemberQuestion-H">Mr JOHN SAMPLE</html:span>',
])
def test_two_speakers_in_one_paragraph_still_need_review(byline):
    with pytest.raises(ValueError, match="Multiple NSW speaker bylines"):
        n.extract_speeches_from_fragment(fragment(byline))


def sitting(day, toc, chamber="nsw_la"):
    return {"date": day, "chamber": "Legislative Assembly", "chamber_code": chamber, "toc_doc_id": toc,
            "pdf_doc_id": ""}


@pytest.fixture
def box(tmp_path, monkeypatch):
    """main() against a temporary database and progress file, with no network."""
    path = tmp_path / "parli.db"
    with sqlite3.connect(path) as db:
        db.execute(SCHEMA)
    monkeypatch.setattr(schema, "DEFAULT_DB_PATH", path)
    monkeypatch.setattr(n, "get_db", lambda: sqlite3.connect(path))
    monkeypatch.setattr(n, "init_db", lambda db: None)
    monkeypatch.setattr(n, "PROGRESS_DIR", tmp_path / "progress")
    monkeypatch.setattr(n, "_api_get", lambda *a, **k: pytest.fail("no request expected"))
    state = {"path": path, "progress": tmp_path / "progress" / "progress.txt", "asked": [], "sittings": [],
             "published": {}, "broken": set()}

    def ingest_day(db, s, seen, dry_run=False):
        state["asked"].append(s["toc_doc_id"])
        if s["toc_doc_id"] in state["broken"]:
            raise ValueError("fragment did not parse")
        count = state["published"].get(s["toc_doc_id"], 0)
        for i in range(count):
            db.execute("INSERT INTO speeches(speaker_name, chamber, date, text, source, state) VALUES (?,?,?,?,?,?)",
                       (f"Member {i}", s["chamber_code"], s["date"], f"speech {i}", "nsw_hansard", "nsw"))
        db.commit()
        return count

    monkeypatch.setattr(n, "ingest_day", ingest_day)
    monkeypatch.setattr(n, "get_sitting_days", lambda start, end: list(state["sittings"]))

    def run():
        state["asked"].clear()
        monkeypatch.setattr(sys, "argv", ["nsw_hansard", "--start", OLD])
        n.main()

    state["run"] = run
    state["done"] = lambda: n.load_progress(state["progress"])
    state["rows"] = lambda: sqlite3.connect(path).execute(
        "SELECT COUNT(*) FROM speeches WHERE source='nsw_hansard'").fetchone()[0]
    return state


def test_recent_empty_day_is_not_final_and_loads_once_published(box):
    box["sittings"] = [sitting(RECENT, "toc-recent")]
    box["run"]()
    assert box["asked"] == ["toc-recent"]
    assert box["done"]() == set()          # listed before its transcript: not recorded as done
    box["published"]["toc-recent"] = 3
    box["run"]()
    assert box["rows"]() == 3 and box["done"]() == {"toc-recent"}
    box["run"]()
    assert box["asked"] == []              # final now


def test_recent_day_already_recorded_with_no_rows_is_retried(box):
    """The state the 17 to 19 November 2026 days were left in: in progress.txt, nothing stored."""
    n.save_progress(box["progress"], "toc-recent")
    n.save_progress(box["progress"], "toc-loaded")
    with sqlite3.connect(box["path"]) as db:
        db.execute("INSERT INTO speeches(speaker_name, chamber, date, text, source) VALUES ('A','nsw_lc',?,'t','nsw_hansard')",
                   (RECENT,))
    box["sittings"] = [sitting(RECENT, "toc-recent"), sitting(RECENT, "toc-loaded", "nsw_lc")]
    box["published"]["toc-recent"] = 2
    box["run"]()
    assert box["asked"] == ["toc-recent"]  # the other chamber has rows and stays done
    assert box["rows"]() == 3
    assert box["progress"].read_text().split() == ["toc-recent", "toc-loaded"]   # no duplicate line


def test_old_empty_day_is_final(box):
    box["sittings"] = [sitting(OLD, "toc-old")]
    box["run"]()
    assert box["done"]() == {"toc-old"}
    box["run"]()
    assert box["asked"] == []


def test_a_failed_day_exits_non_zero_after_the_other_days(box):
    box["sittings"] = [sitting(RECENT, "toc-bad"), sitting(RECENT, "toc-good", "nsw_lc")]
    box["broken"].add("toc-bad")
    box["published"]["toc-good"] = 2
    with pytest.raises(SystemExit) as stop:
        box["run"]()
    assert stop.value.code == 1
    assert box["asked"] == ["toc-bad", "toc-good"]
    assert box["rows"]() == 2 and box["done"]() == {"toc-good"}


def test_a_clean_run_exits_zero(box):
    box["sittings"] = [sitting(RECENT, "toc-good")]
    box["published"]["toc-good"] = 1
    box["run"]()                           # no SystemExit
    assert box["done"]() == {"toc-good"}
