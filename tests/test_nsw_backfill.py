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


def test_unknown_speaker_heading_fails_closed_instead_of_inheriting_name():
    import xml.etree.ElementTree as E
    xml = XML.replace(b'MemberSpeech-H', b'MemberNewForm-H')
    with pytest.raises(ValueError, match='Unrecognised NSW speaker heading'):
        n.extract_speeches_from_fragment(E.fromstring(xml))


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


def test_review_fragment_separates_nanva_question_from_graham_answer():
    import xml.etree.ElementTree as E
    source=Path(__file__).parent/'fixtures/nsw-hansard/HANSARD-1820781676-94532.xml'
    speeches=n.extract_speeches_from_fragment(E.parse(source).getroot())
    questions=[s for s in speeches if s['speaker_id']=='2295']
    answers=[s for s in speeches if s['speaker_id']=='2224']
    assert len(questions)==2 and len(answers)==2
    assert all('Answer only:' not in s['text'] for s in questions)
    assert all('Question only:' not in s['text'] for s in answers)
    assert all('JOHN GRAHAM' in s['speaker_name'] for s in answers)
    assert any('Continuation' in s['text'] for s in answers)


@pytest.mark.parametrize('heading', [
    'MemberSpeech-H', 'MemberUpper-H', 'MemberLower-H', 'MemberQuestion-H',
    'MemberAnswer-H', 'OfficeSpeech-H', 'OfficeUpper-H', 'OfficeLower-H',
])
def test_all_cached_heading_forms_start_a_separate_turn(heading):
    import xml.etree.ElementTree as E
    xml=XML.decode().replace('MemberUpper-H',heading)
    speeches=n.extract_speeches_from_fragment(E.fromstring(xml))
    assert len(speeches)==3
    assert speeches[0]['speaker_name']=='Mr CHRIS MINNS'
    assert all(s['text'].count(TEXT)==1 for s in speeches)


def test_explicit_span_id_wins_over_pending_anchor_and_unresolved_byline_resets_speaker():
    import xml.etree.ElementTree as E
    xml=XML.decode().replace('class="MemberUpper-H"','class="MemberAnswer-H" data-mode="member" data-value="2224"')
    speeches=n.extract_speeches_from_fragment(E.fromstring(xml))
    assert speeches[0]['speaker_id']=='2224'
    # A new surname byline cannot inherit the preceding member's personal ID.
    xml=xml.replace('<a data-mode="member" data-value="999"/>','').replace('Ms JANE EXAMPLE','Mr UNKNOWN')
    assert n.extract_speeches_from_fragment(E.fromstring(xml))[-1]['speaker_id']==''


def test_held_turns_retry_after_dated_evidence_improves_on_an_occupied_owned_day(db):
    db.executemany('INSERT INTO members VALUES (?,?,?,?,?,?)',[
        ('a','Jane Example','nsw_la','nsw','2020-01-01',None),
        ('b','Jane Example','nsw_la','nsw','2020-01-01',None)])
    db.commit()
    first=b.run(db)
    assert first['inserted']==1 and first['held_turns']==2
    original=db.execute('SELECT speech_id FROM speeches').fetchone()[0]
    assert b.run(db)['inserted']==0
    db.execute("UPDATE members SET left_house='2022-12-31' WHERE person_id='b'");db.commit()
    retry=b.run(db)
    assert retry['inserted']==1 and retry['held_turns']==1
    assert retry['incomplete_left']==1
    assert db.execute('SELECT person_id FROM speeches WHERE speech_id=?',(original,)).fetchone()[0]=='nsw_hansard_108'
    assert b.run(db)['inserted']==0
    assert n._api_get.call_count==1


def test_wholly_held_day_is_retried_after_resolver_revision(db,monkeypatch):
    n._api_get.return_value=XML.replace(b'Mr CHRIS MINNS',b'Mr UNKNOWN').replace(b'Ms JANE EXAMPLE',b'Mr UNKNOWN')
    assert b.run(db)['inserted']==0
    assert b.run(db)['incomplete_left']==1
    n._api_get.assert_called_once()
    resolve=b.resolve_member
    db.execute("INSERT INTO members VALUES ('known','Chris Minns','nsw_la','nsw','2023-01-01',NULL)")
    db.commit()
    def improved(db,speech,chamber,day):
        if speech['speaker_id']=='108':return 'known',None
        return resolve(db,speech,chamber,day)
    monkeypatch.setattr(b,'resolve_member',improved)
    assert b.run(db)['inserted']==1
    assert n._api_get.call_count==1


def test_held_and_publication_failures_prevent_false_clear():
    progress={('nsw_la','2023-05-09'):{'held_turns':2,'publication_pending':3,'publication_failed':1,'stage_errors':0}}
    counts={('nsw_la','2023-05-09'):10}
    receipt=b.coverage_receipt([SITTING],counts,progress)
    assert receipt['gaps'][0]['missing_dates']==[]
    assert receipt['gaps'][0]['incomplete_dates']==['2023-05-09']
    b.guard_coverage([SITTING],counts,receipt,progress)
    receipt['gaps']=[]
    with pytest.raises(ValueError,match='coverage guard'):
        b.guard_coverage([SITTING],counts,receipt,progress)


def test_owned_day_error_is_retried_without_changing_existing_speech_ids(db):
    assert b.run(db)['inserted'] == 2
    ids = db.execute('SELECT speech_id FROM speeches ORDER BY speech_id').fetchall()
    db.execute("UPDATE nsw_backfill_days SET error='receipt unavailable'")
    db.commit()
    retried = b.run(db)
    assert len(retried['days']) == 1 and retried['inserted'] == 0
    assert db.execute('SELECT speech_id FROM speeches ORDER BY speech_id').fetchall() == ids
    assert db.execute('SELECT error FROM nsw_backfill_days').fetchone()[0] is None
    assert n._api_get.call_count == 1


def test_2022_cannot_be_written_even_when_an_old_calendar_returns_it(db):
    n.get_sitting_days.return_value=[{**SITTING,'date':'2022-10-19'}]
    with pytest.raises(ValueError,match='bounds'):
        b.run(db)
    assert db.execute('SELECT COUNT(*) FROM speeches').fetchone()[0]==0


def test_http_error_body_budget_is_checked_and_closed(monkeypatch):
    import importlib,io
    real=importlib.reload(n)._api_get
    clock=[0.0]
    monkeypatch.setattr(n.time,'monotonic',lambda:clock[0])
    monkeypatch.setattr(n.time,'sleep',lambda s:None)
    monkeypatch.setattr(n,'_next_request_at',0)
    monkeypatch.setattr(n,'REQUEST_DEADLINE',1)
    class Slow(io.BytesIO):
        def read1(self,size):
            clock[0]=2
            return b'error'
    body=Slow()
    opener=Mock();opener.open.side_effect=urllib.error.HTTPError(n.API_BASE,500,'error',{},body)
    monkeypatch.setattr(n.source_http,'build_opener',lambda:opener)
    with pytest.raises(n.BudgetSpent):real(n.API_BASE+'/year/2023')
    assert body.closed
    assert opener.open.call_count==1


def test_hard_cap_and_budget_cannot_be_raised(db):
    for cap, seconds in [(5,1200),(-1,1200),(4,1201),(4,float('nan'))]:
        with pytest.raises(ValueError):
            b.run(db, cap=cap, budget_s=seconds)
    n.get_sitting_days.assert_not_called()


def test_shared_stop_blocks_nightly_before_database_or_source(monkeypatch, tmp_path):
    from parli.ingest import backfill_guard as growth
    monkeypatch.setenv('OPAX_BACKFILL_STATE_DIR', str(tmp_path))
    (tmp_path / 'backfill.STOP').touch()
    monkeypatch.setenv('OPAX_DB', str(tmp_path / 'never-created.sqlite'))
    monkeypatch.setattr('sys.argv', ['nsw_hansard', '--backfill-missing-days', '--growth-guard'])
    with pytest.raises(growth.Stopped):
        n.main()
    assert not (tmp_path / 'never-created.sqlite').exists()
    n.get_sitting_days.assert_not_called()


def test_single_off_switch_blocks_nightly_before_database_or_source(monkeypatch, tmp_path):
    monkeypatch.setenv('OPAX_NSW_BACKFILL', '0')
    monkeypatch.setenv('OPAX_DB', str(tmp_path / 'never-created.sqlite'))
    monkeypatch.setattr('sys.argv', ['nsw_hansard', '--backfill-missing-days', '--growth-guard'])
    n.main()
    assert not (tmp_path / 'never-created.sqlite').exists()
    n.get_sitting_days.assert_not_called()


def test_nightly_stage_updates_shared_status_with_incomplete_not_only_empty_days(db, tmp_path):
    from parli.ingest import backfill_guard as growth
    guard = growth.Guard(tmp_path)
    result = b.run(db, guard=guard)
    tracked = guard.read()['stages']['nsw']
    assert result['missing_left'] == 0 and result['incomplete_left'] == 1
    assert tracked['days_remaining'] == 1 and tracked['days_done'] == 1 and tracked['cap'] == 4
    assert b.run(db, guard=guard)['inserted'] == 0


def test_budget_exit_reports_held_days_as_incomplete_after_committing_a_day(db, tmp_path, monkeypatch):
    from parli.ingest import backfill_guard as growth
    guard = growth.Guard(tmp_path)
    n.get_sitting_days.return_value = [SITTING, {**SITTING,'toc_doc_id':'second','date':'2023-05-10'}]
    original = b.stage_day
    def checkpoint_then_budget(*args):
        result = original(*args)
        monkeypatch.setattr(b,'check_load',Mock(side_effect=n.BudgetSpent('after checkpoint')))
        return result
    monkeypatch.setattr(b,'stage_day',checkpoint_then_budget)
    result = b.run(db,guard=guard)
    assert result['stop'] == 'budget' and len(result['days']) == 1
    assert result['missing_left'] == 1 and result['incomplete_left'] == 2
    assert result['held_turns'] == 1
    assert guard.read()['stages']['nsw']['days_remaining'] == 2


def test_shared_projection_separates_acquisition_from_incomplete_held_days(db, tmp_path):
    from parli.ingest import backfill_guard as growth
    guard = growth.Guard(tmp_path)
    n.get_sitting_days.return_value = [{**SITTING,'date':f'2023-05-{day:02d}', 'toc_doc_id':f'toc-{day}'}
                                      for day in range(9,15)]
    result = b.run(db,cap=1,guard=guard)
    assert result['acquisition_days_remaining'] == 5
    assert result['incomplete_left'] == 6 and result['held_turns'] == 1
    report = growth.status(tmp_path,'2026-11-14')['stages']['nsw']
    assert report['days_remaining'] == 6 and report['acquisition_days_remaining'] == 5
    assert report['projected_finish_date'] == '2026-11-20'


def test_shared_projection_stays_unknown_when_only_identity_holds_remain(db, tmp_path):
    from parli.ingest import backfill_guard as growth
    guard = growth.Guard(tmp_path)
    result = b.run(db,guard=guard)
    assert result['acquisition_days_remaining'] == 0
    assert result['held_turns'] == 1 and result['stop'] == 'identity-holds'
    assert growth.status(tmp_path,'2026-11-14')['projected_finish_date'] is None
    assert b.run(db,guard=guard)['inserted'] == 0
    assert growth.status(tmp_path,'2026-11-15')['projected_finish_date'] is None


def test_shared_projection_keeps_publication_only_debt_until_next_refresh(db, tmp_path):
    import xml.etree.ElementTree as ET
    from parli.ingest import backfill_guard as growth
    guard = growth.Guard(tmp_path)
    root = ET.fromstring(XML)
    body = root.find('.//body')
    for node in list(body)[2:]:
        body.remove(node)
    n._api_get.return_value = ET.tostring(root).replace(TEXT.encode(), (TEXT*4).encode())
    result = b.run(db,guard=guard)
    assert result['held_turns'] == 0 and result['publication_pending'] == 1
    assert result['acquisition_days_remaining'] == 0 and result['incomplete_left'] == 1
    assert growth.status(tmp_path,'2026-11-14')['projected_finish_date'] == '2026-11-15'
    assert b.run(db,guard=guard)['inserted'] == 0
    assert n._api_get.call_count == 1


def test_shared_growth_stop_has_its_own_receipt_state_and_keeps_periodic_failures_separate(db, tmp_path, monkeypatch):
    from parli.ingest import backfill_guard as growth
    guard = growth.Guard(tmp_path)
    monkeypatch.setattr(guard,'ensure_running',Mock(side_effect=[None,growth.Stopped('fixture growth stop')]))
    receipt = tmp_path/'receipt.json'
    with pytest.raises(growth.Stopped,match='fixture growth stop'):
        b.run(db,guard=guard,receipt_path=receipt)
    assert json.loads(receipt.read_text())['stop'] == 'growth-guard'
    assert guard.read()['stages']['nsw']['stop'] == 'growth-guard'
    assert growth.status(tmp_path,'2026-11-14')['projected_finish_date'] is None
    assert db.execute('SELECT COUNT(*) FROM nsw_backfill_errors').fetchone()[0] == 0
    n.get_fragment_uids.assert_not_called()
