"""The nightly FRL request (words_parlinfo frl-acts-recent): one request, offline.

curl is replaced by fixtures. Every answer other than a 200 title list ends the
night after exactly one request, leaves the stored Acts alone and never retries;
a refusal pauses the source with a receipt.
"""
from __future__ import annotations

from argparse import Namespace
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import subprocess
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import pytest

from parli.ingest import frl_instruments as frl
from parli.ingest import http
from parli.ingest import words_parlinfo as W

POLICY = json.loads((Path(__file__).resolve().parents[1] / "parli/ingest/source_policy.json").read_text())["frl_acts"]
QUIET = datetime(2026, 11, 16, 16, 20, tzinfo=timezone.utc)   # 03:20 Sydney, 02:20 AEST
BUSY = datetime(2026, 11, 16, 23, 0, tzinfo=timezone.utc)     # 09:00 AEST


@pytest.fixture(autouse=True)
def isolated_source_status(monkeypatch, tmp_path):
    monkeypatch.setenv("OPAX_SOURCE_STATUS_FILE", str(tmp_path / "access.json"))
    monkeypatch.setenv("OPAX_SOURCE_NAME", "frl_acts_recent")


def wire(status: int, body: bytes, headers: bytes = b"Content-Type: application/json") -> subprocess.CompletedProcess:
    raw = f"HTTP/1.1 {status}\r\n".encode() + headers + b"\r\n\r\n" + body + f"\n{status}".encode()
    return subprocess.CompletedProcess([], 0, raw, b"")


def titles(*rows) -> bytes:
    return json.dumps({"value": [{"id": act_id, "name": name, "makingDate": made + "T00:00:00",
                                  "year": 2026, "number": 1, "isPrincipal": True, "isInForce": True, "status": "InForce",
                                  "originatingBillUri": f"https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22legislation%2Fbillhome%2F{code}%22"}
                                 for act_id, name, made, code in rows]}).encode()


def session(now=QUIET):
    return frl.PoliteSession(max_requests=1, attempts=1, now=lambda: now, clock=lambda: 0, sleep=lambda _: None)


def stored(db_path: Path) -> list[tuple]:
    if not db_path.exists():
        return []
    with sqlite3.connect(db_path) as db:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE name='ext_frl_acts'").fetchone():
            return []
        return db.execute("SELECT act_id, making_date, bill_code FROM ext_frl_acts ORDER BY act_id").fetchall()


def seed(db_path: Path) -> None:
    with sqlite3.connect(db_path) as db:
        db.execute(W.ACTS_DDL)
        db.execute("INSERT INTO ext_frl_acts (act_id, name, making_date, bill_code, fetched_at) "
                   "VALUES ('C2026A00001', 'Kept Act 2026', '2026-01-02', 'r7000', '2026-11-12T16:00:00Z')")


def test_one_request_reads_the_newest_hundred_acts_into_ext_frl_acts(tmp_path):
    db_path = tmp_path / "parli.db"
    body = titles(("C2026A00101", "Newest Act 2026", "2026-11-12", "r7600"), ("C2026A00100", "Older Act 2026", "2026-11-10", "s1530"))
    with mock.patch.object(frl.subprocess, "run", return_value=wire(200, body)) as transport:
        assert W.run_frl_acts_recent(Namespace(db=str(db_path)), session()) == 2
    assert transport.call_count == 1
    argv = transport.call_args.args[0]
    assert argv[argv.index("--user-agent") + 1] == http.USER_AGENT
    url = urlsplit(argv[-1])
    assert (url.hostname, url.path) == (POLICY["host"], POLICY["paths"][0])
    query = parse_qs(url.query)
    assert query["$orderby"] == ["id desc"] and query["$top"] == ["100"]
    assert query["$filter"] == ["collection eq 'Act'"] and query["$select"] == [W.FRL_ACT_SELECT]
    assert stored(db_path) == [("C2026A00100", "2026-11-10", "s1530"), ("C2026A00101", "2026-11-12", "r7600")]


@pytest.mark.parametrize("status", [429, 503, 500, 400, 404])
def test_any_other_answer_holds_the_night_after_one_request(status, tmp_path):
    db_path = tmp_path / "parli.db"
    seed(db_path)
    with mock.patch.object(frl.subprocess, "run", return_value=wire(status, b'{"error":"busy"}')) as transport:
        with pytest.raises(frl.Held, match="single attempt, no retry|refused"):
            W.run_frl_acts_recent(Namespace(db=str(db_path)), session())
    assert transport.call_count == 1
    assert stored(db_path) == [("C2026A00001", "2026-01-02", "r7000")]
    assert not (tmp_path / "access.json").exists()


@pytest.mark.parametrize("status,body,headers", [
    (403, b"forbidden", b"Content-Type: text/plain"),
    (401, b"no", b"Content-Type: text/plain"),
    (200, b"{}", b"Content-Type: application/json\r\ncf-mitigated: challenge"),
])
def test_refusal_or_challenge_pauses_with_a_receipt_and_keeps_rows(status, body, headers, tmp_path):
    db_path = tmp_path / "parli.db"
    seed(db_path)
    with mock.patch.object(frl.subprocess, "run", return_value=wire(status, body, headers)) as transport:
        with pytest.raises(http.SourceRefused) as refused:
            W.run_frl_acts_recent(Namespace(db=str(db_path)), session())
    assert refused.value.code == 4
    assert transport.call_count == 1
    assert stored(db_path) == [("C2026A00001", "2026-01-02", "r7000")]
    receipt = json.loads((tmp_path / "access.json").read_text())["frl_acts_recent"]
    assert receipt["status"] == "paused" and receipt["host"] == POLICY["host"]


def test_busy_hours_hold_before_any_request_or_database_access(tmp_path):
    db_path = tmp_path / "parli.db"
    with mock.patch.object(frl.subprocess, "run") as transport:
        with pytest.raises(frl.Held, match="busy hours"):
            W.run_frl_acts_recent(Namespace(db=str(db_path)), session(BUSY))
    transport.assert_not_called()
    assert not db_path.exists()


def test_a_reply_without_a_title_list_stores_nothing(tmp_path):
    db_path = tmp_path / "parli.db"
    seed(db_path)
    with mock.patch.object(frl.subprocess, "run", return_value=wire(200, b'{"value": "nope"}')):
        with pytest.raises(frl.Held, match="without an Act title list"):
            W.run_frl_acts_recent(Namespace(db=str(db_path)), session())
    assert stored(db_path) == [("C2026A00001", "2026-01-02", "r7000")]


def test_the_weekly_sweep_keeps_its_five_attempts():
    assert frl.PoliteSession().attempts == POLICY["retry"]["weekly_attempts"] == 5
    assert frl.PoliteSession(attempts=1).attempts == POLICY["retry"]["nightly_attempts"] == 1
