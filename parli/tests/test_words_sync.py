import sqlite3

from parli.ingest.words_sync import audit_rows, select_rows


COLUMNS = (
    "source", "source_id", "url", "date", "body_text", "licence",
)


def rows(*values):
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("CREATE TABLE x (source, source_id, url, date, body_text, licence)")
    db.executemany("INSERT INTO x VALUES (?,?,?,?,?,?)", values)
    return db.execute("SELECT rowid, * FROM x ORDER BY rowid").fetchall()


def valid(source_id="47000", body=None):
    return (
        "pmtranscripts", source_id,
        f"https://pmtranscripts.pmc.gov.au/release/transcript-{source_id}",
        "2026-01-10", body or ("A sourced statement with substantive text. " * 10),
        "CC BY 4.0 (Commonwealth of Australia; pmtranscripts.pmc.gov.au/copyright)",
    )


def test_audit_accepts_valid_official_record():
    accepted, rejected = audit_rows(rows(valid()), since="2024-01-01")
    assert len(accepted) == 1
    assert rejected == {}


def test_audit_rejects_duplicate_body_and_bad_provenance():
    body = "The same substantive official statement. " * 10
    bad = list(valid("47002", "A different long statement. " * 10))
    bad[2] = "https://example.com/not-the-official-record"
    accepted, rejected = audit_rows(
        rows(valid("47000", body), valid("47001", body), tuple(bad)),
        since="2024-01-01",
    )
    assert len(accepted) == 1
    assert rejected == {"duplicate_body": 1, "invalid_source_url": 1}


def test_audit_rejects_short_old_and_unlicensed_rows():
    short = list(valid("47000")); short[4] = "too short"
    old = list(valid("47001")); old[3] = "2020-01-01"
    closed = list(valid("47002")); closed[5] = "All rights reserved"
    accepted, rejected = audit_rows(rows(tuple(short), tuple(old), tuple(closed)), since="2024-01-01")
    assert accepted == []
    assert rejected == {"short_body": 1, "invalid_date": 1, "licence_not_public": 1}


def test_audit_rejects_hidden_controls_but_keeps_normal_whitespace():
    bad = list(valid("47000")); bad[4] = ("A valid-looking body. " * 12) + "\u001fhidden"
    good = list(valid("47001")); good[4] = ("A body with permitted line breaks.\n\t" * 10)
    accepted, rejected = audit_rows(rows(tuple(bad), tuple(good)), since="2024-01-01")
    assert [row["source_id"] for row in accepted] == ["47001"]
    assert rejected == {"control_character": 1}


def test_bounded_runs_resume_after_reported_rowid():
    accepted, _ = audit_rows(rows(
        valid("47000", "First substantive statement. " * 10),
        valid("47001", "Second substantive statement. " * 10),
        valid("47002", "Third substantive statement. " * 10),
    ), since="2024-01-01")
    first = select_rows(accepted, after_rowid=0, limit=2)
    second = select_rows(accepted, after_rowid=first[-1]["rowid"], limit=2)
    assert [row["source_id"] for row in first] == ["47000", "47001"]
    assert [row["source_id"] for row in second] == ["47002"]
