import json
import sqlite3
import urllib.error
from datetime import date
from pathlib import Path
from unittest.mock import Mock

import pytest

from parli.ingest import nsw_backfill as b, nsw_hansard as n
from parli.ingest import http

SITTING = {"date": "2023-05-09", "chamber_code": "nsw_la", "chamber": "Legislative Assembly", "toc_doc_id": "toc"}
TEXT = "This is a sufficiently long contribution from the named member to the parliamentary debate."
XML = f'''<hansard><hansard.header><date>2023-05-09T10:00:00</date><chamber>Legislative Assembly</chamber></hansard.header>
<fragment.text><body><a data-mode="member" data-value="108"/><p><span class="MemberUpper-H">Mr CHRIS MINNS:</span> {TEXT}</p>
<a data-mode="member" data-value="30"/><p><span class="OfficeSpeech-H">The SPEAKER:</span> {TEXT}</p>
<a data-mode="member" data-value="999"/><p><span class="MemberSpeech-H">Ms JANE EXAMPLE:</span> {TEXT}</p></body></fragment.text></hansard>'''.encode()


@pytest.fixture
def db():
    c = sqlite3.connect(":memory:")
    c.executescript('''CREATE TABLE members(person_id TEXT PRIMARY KEY,full_name TEXT,chamber TEXT,state TEXT,entered_house TEXT,left_house TEXT);
      CREATE TABLE speeches(speech_id INTEGER PRIMARY KEY,person_id TEXT,speaker_name TEXT,party TEXT,electorate TEXT,
      chamber TEXT,date TEXT,topic TEXT,text TEXT,word_count INTEGER,source TEXT,state TEXT);''')
    yield c
    c.close()


@pytest.fixture(autouse=True)
def transport(monkeypatch, tmp_path):
    monkeypatch.setenv("OPAX_SOURCE_STATUS_FILE", str(tmp_path / "source-access.json"))
    monkeypatch.setattr(b.os, "getloadavg", lambda: (1, 1, 1))
    monkeypatch.setattr(n, "get_sitting_days", Mock(return_value=[SITTING]))
    monkeypatch.setattr(n, "get_fragment_uids", Mock(return_value=["fragment"]))
    monkeypatch.setattr(n, "_api_get", Mock(return_value=XML))


def test_bounds_cap_and_idempotence_with_source_provenance(db):
    for start,end in [(date(2022,9,30),b.END),(b.START,date(2025,3,1)),(b.END,b.START)]:
        with pytest.raises(ValueError):
            b.run(db,start=start,end=end)
    assert b.run(db, cap=0)["days"] == []
    r = b.run(db, cap=1)
    assert r["inserted"] == 2 and r["days"][0]["held"] == 1
    assert db.execute("SELECT source_member_id,status FROM nsw_backfill_turns ORDER BY turn").fetchall() == [('108','inserted'),('30','held'),('999','inserted')]
    assert db.execute("SELECT DISTINCT party FROM speeches").fetchall() == [(None,)]
    assert b.run(db, cap=1)["inserted"] == 0
    assert n._api_get.call_count == 1


def test_cap_counts_chamber_days(db):
    n.get_sitting_days.return_value = [SITTING, {**SITTING, "toc_doc_id": "second", "date": "2023-05-10"}]
    assert len(b.run(db, cap=1)["days"]) == 1
    assert n.get_fragment_uids.call_count == 1


def test_budget_mid_day_checkpoints_and_resumes_without_partial_speeches(db, monkeypatch):
    n.get_fragment_uids.return_value = ['a','b']
    def fetch(*args, **kwargs):
        if n._api_get.call_count == 2:
            raise n.BudgetSpent('spent')
        return XML
    n._api_get.side_effect = fetch
    assert b.run(db)["stop"] == 'budget'
    assert db.execute('SELECT COUNT(*) FROM speeches').fetchone()[0] == 0
    assert db.execute('SELECT COUNT(*) FROM nsw_backfill_fragments').fetchone()[0] == 1
    n._api_get.side_effect = None
    # The second fragment has identical turns, and must not duplicate speeches.
    assert b.run(db)["inserted"] == 2
    assert n._api_get.call_count == 3
    assert b.run(db)["inserted"] == 0


def test_budget_and_load_stop_before_discovery(db, monkeypatch):
    monkeypatch.setattr(b.os, 'getloadavg', lambda: (41,40,39))
    assert b.run(db)["stop"] == 'budget'
    n.get_sitting_days.assert_not_called()
    monkeypatch.setattr(b.os, 'getloadavg', lambda: (1,1,1))
    assert b.run(db, budget_s=1e-12)["stop"] == 'budget'
    n.get_sitting_days.assert_not_called()


def test_refusal_stops_without_later_day_or_completed_progress(db, tmp_path):
    n.get_sitting_days.return_value = [SITTING, {**SITTING, 'toc_doc_id':'next'}]
    n.get_fragment_uids.return_value = ['a','b','c']
    n._api_get.side_effect = [XML, http.SourceRefused(n.API_BASE, 'HTTP 403')]
    receipt = tmp_path/'receipt.json'
    with pytest.raises(http.SourceRefused):
        b.run(db, receipt_path=receipt)
    assert n._api_get.call_count == 2
    assert db.execute('SELECT status FROM nsw_backfill_days').fetchone()[0] == 'pending'
    assert db.execute('SELECT COUNT(*) FROM speeches').fetchone()[0] == 0
    assert json.loads(receipt.read_text())['stop'] == 'source-refused'
    n.get_sitting_days.reset_mock()
    with pytest.raises(http.SourceRefused):
        b.run(db)
    n.get_sitting_days.assert_not_called()
    assert n._api_get.call_count == 2


def test_discovery_error_keeps_previous_coverage_and_is_never_empty_success(db, tmp_path):
    coverage = tmp_path/'coverage.json'; coverage.write_text('previous')
    n.get_sitting_days.side_effect = ValueError('year failed')
    with pytest.raises(ValueError, match='year failed'):
        b.run(db, coverage_path=coverage)
    assert coverage.read_text() == 'previous'
    assert db.execute('SELECT COUNT(*) FROM nsw_backfill_days').fetchone()[0] == 0
    assert db.execute('SELECT detail FROM nsw_backfill_errors').fetchone()[0] == 'year failed'


def test_occupied_day_any_source_is_held(db):
    db.execute("INSERT INTO speeches(chamber,date,text,source) VALUES ('nsw_la','2023-05-09','existing','other')")
    db.commit()
    assert b.run(db)['inserted'] == 0
    n.get_fragment_uids.assert_not_called()


def test_no_personal_id_and_conflicting_id_are_held(db):
    db.executescript(b.DDL)
    s = {'speaker_id':'108','speaker_name':'Mr CHRIS MINNS'}
    assert b.resolve_member(db,s,'nsw_la','2023-05-09')[0] == 'nsw_hansard_108'
    assert b.resolve_member(db,{**s,'speaker_name':'Mr ANOTHER PERSON'},'nsw_la','2023-05-09')[0] is None
    for name in ['The PRESIDENT','Mr M','Mr C MINNS','']:
        assert b.resolve_member(db,{**s,'speaker_name':name},'nsw_la','2023-05-09')[0] is None
    assert b.resolve_member(db,{**s,'speaker_id':''},'nsw_la','2023-05-09')[0] is None


def test_coverage_watchdog_hook_drops_only_filled_chamber_year():
    calendar=[SITTING,{**SITTING,'date':'2023-05-10'},{**SITTING,'chamber_code':'nsw_lc'}]
    g = b.known_gaps(calendar,{('nsw_la','2023-05-09'):1})
    assert [(x['chamber'],len(x['missing_dates'])) for x in g] == [('nsw_la',1),('nsw_lc',1)]
    assert b.known_gaps(calendar,{('nsw_la','2023-05-09'):1,('nsw_la','2023-05-10'):1,('nsw_lc','2023-05-09'):1}) == []


def test_parser_splits_member_anchors_without_metadata():
    import xml.etree.ElementTree as E
    speeches=n.extract_speeches_from_fragment(E.fromstring(XML))
    assert [s['speaker_id'] for s in speeches] == ['108','30','999']
    assert [s['speaker_name'] for s in speeches] == ['Mr CHRIS MINNS','The SPEAKER','Ms JANE EXAMPLE']
    assert all(s['text'].count(TEXT)==1 for s in speeches)


def test_calendar_exception_and_empty_year_fail(monkeypatch):
    original = __import__('importlib').reload(n).get_sitting_days
    monkeypatch.setattr(n,'_api_json',Mock(side_effect=ValueError('bad year')))
    with pytest.raises(ValueError,match='bad year'):
        original(b.START,b.END)
    n._api_json.side_effect = None; n._api_json.return_value=[]
    with pytest.raises(ValueError,match='year discovery'):
        original(b.START,b.END)


def test_transport_honest_agent_one_retry_pacing_and_no_off_host(monkeypatch):
    import importlib
    import io
    real=importlib.reload(n)._api_get
    t=[0.0]; calls=[]
    monkeypatch.setattr(n.time,'monotonic',lambda:t[0])
    monkeypatch.setattr(n.time,'sleep',lambda s:t.__setitem__(0,t[0]+s))
    monkeypatch.setattr(n,'_next_request_at',0)
    def fail(req,timeout):
        calls.append((t[0],req.get_header('User-agent')))
        raise urllib.error.HTTPError(req.full_url,500,'error',{},io.BytesIO(b'error'))
    monkeypatch.setattr(n.source_http,'build_opener',lambda:Mock(open=fail))
    with pytest.raises(http.SourceRefused):
        real(n.API_BASE+'/year/2023')
    assert calls==[(0.0,'opax-improve-audit'),(1.0,'opax-improve-audit')]
    with pytest.raises(ValueError):
        real('https://example.com/year/2023')


def test_transport_refusal_has_no_retry(monkeypatch):
    import importlib
    import io
    real=importlib.reload(n)._api_get
    opener=Mock(); opener.open.side_effect=urllib.error.HTTPError(n.API_BASE,403,'refused',{},io.BytesIO(b'refused'))
    monkeypatch.setattr(n.source_http,'build_opener',lambda:opener)
    monkeypatch.setattr(n.time,'sleep',lambda s:None)
    with pytest.raises(http.SourceRefused):
        real(n.API_BASE+'/year/2023')
    assert opener.open.call_count==1


def test_coverage_guard_rejects_clearing_or_omitting_known_gap():
    receipt=b.coverage_receipt([SITTING], {})
    b.guard_coverage([SITTING], {}, receipt)
    receipt['gaps']=[]
    with pytest.raises(ValueError,match='coverage guard'):
        b.guard_coverage([SITTING], {}, receipt)
    b.guard_coverage([SITTING], {('nsw_la','2023-05-09'):1}, receipt)


def test_owner_occupancy_wins_over_stale_completed_progress(db):
    assert b.run(db)['inserted']==2
    db.execute('DELETE FROM speeches'); db.commit()
    assert b.run(db)['inserted']==2
    assert n._api_get.call_count==1


def test_source_identity_keeps_own_state_and_never_current_party(db):
    assert b.run(db)['inserted']==2
    assert db.execute('SELECT DISTINCT state FROM members').fetchall()==[('nsw',)]
    assert db.execute('SELECT DISTINCT party FROM speeches').fetchall()==[(None,)]


def test_cli_requires_explicit_existing_sqlite_and_rejects_outside_bounds(monkeypatch,tmp_path):
    monkeypatch.delenv('DATABASE_URL',raising=False)
    monkeypatch.delenv('OPAX_DB',raising=False)
    monkeypatch.setattr('sys.argv',['nsw_hansard','--backfill-missing-days'])
    with pytest.raises(SystemExit):
        n.main()
    missing=tmp_path/'does-not-exist.sqlite'
    monkeypatch.setenv('OPAX_DB',str(missing))
    with pytest.raises(sqlite3.OperationalError):
        n.main()
    assert not missing.exists()
    monkeypatch.setattr('sys.argv',['nsw_hansard','--backfill-missing-days','--start','2020-01-01'])
    with pytest.raises(ValueError,match='bounds'):
        n.main()


def test_future_publication_allowance_is_charged_before_commit(db,monkeypatch):
    monkeypatch.setattr(b,'SYNC_PREPARATION_S',0)
    n._api_get.return_value=XML.replace(TEXT.encode(),(TEXT*20).encode())
    monkeypatch.setattr(b,'PUBLISH_DOCS_PER_SECOND',0.001)
    assert b.run(db,budget_s=100)['stop']=='budget'
    assert db.execute('SELECT COUNT(*) FROM speeches').fetchone()[0]==0
    assert db.execute('SELECT COUNT(*) FROM nsw_backfill_fragments').fetchone()[0]==1


def test_transport_budget_interrupts_a_streaming_body(monkeypatch):
    import importlib
    import io
    real=importlib.reload(n)._api_get
    clock=[0.0]
    monkeypatch.setattr(n.time,'monotonic',lambda:clock[0])
    monkeypatch.setattr(n.time,'sleep',lambda s:None)
    monkeypatch.setattr(n,'_next_request_at',0)
    monkeypatch.setattr(n,'REQUEST_DEADLINE',1)
    class Streaming(io.BytesIO):
        status=200
        headers={'Content-Type':'application/json'}
        def read1(self,size):
            clock[0]=2
            return b'partial'
    response=Streaming()
    opener=Mock();opener.open.return_value=response
    monkeypatch.setattr(n.source_http,'build_opener',lambda:opener)
    with pytest.raises(n.BudgetSpent):
        real(n.API_BASE+'/year/2023')
    assert response.closed
    assert opener.open.call_count==1


def test_year_without_recognised_chambers_is_error_but_recess_subset_is_valid(monkeypatch):
    import importlib
    original=importlib.reload(n).get_sitting_days
    payload=[{'date':'2023-05-09','Events':[]}]
    monkeypatch.setattr(n,'_api_json',Mock(return_value=payload))
    with pytest.raises(ValueError,match='year discovery'):
        original(date(2023,1,1),date(2023,12,31))
    payload[0]['Events']=[{'Chamber':'Legislative Assembly','TocDocId':'toc'}]
    assert original(date(2023,5,10),date(2023,5,10))==[]
    payload[0]['Events'][0]['TocDocId']=''
    with pytest.raises(ValueError,match='missing chamber TOC'):
        original(date(2023,1,1),date(2023,12,31))
