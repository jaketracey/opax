"""Federal feed fixtures use invented parliamentarian identities and no network."""
from argparse import Namespace
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
from unittest.mock import patch
import urllib.error
import pytest

from parli.ingest import federal_feed as N, honest_http as H, openaustralia_xml as X
from parli.ingest import tvfy_refresh as T
from parli.ingest.speeches import load_modern_jsonl, text_hash
from parli.ingest.dedup import build_seen
from scripts.vm.mobile_votes_contract import validate_votes
from scripts import export_votes as E

FIXTURES = Path(__file__).parent / 'fixtures' / 'openaustralia'


def db_fixture():
    db = sqlite3.connect(':memory:')
    db.executescript('''
    CREATE TABLE members (person_id TEXT PRIMARY KEY, full_name TEXT, first_name TEXT, last_name TEXT,
      chamber TEXT, entered_house TEXT, left_house TEXT, party TEXT, party_canonical TEXT);
    INSERT INTO members VALUES ('101','Alex Example','Alex','Example','senate','2000-01-01',NULL,'Labor','Labor');
    INSERT INTO members VALUES ('102','Sam Fixture','Sam','Fixture','senate','2000-01-01',NULL,'Greens','Greens');
    CREATE TABLE divisions (division_id INTEGER PRIMARY KEY,house TEXT,name TEXT,date TEXT,number INT,
      aye_votes INT,no_votes INT,possible_turnout INT,rebellions INT,summary TEXT,state TEXT);
    CREATE TABLE votes (division_id INT,person_id TEXT,vote TEXT);
    CREATE TABLE speeches (speech_id INTEGER PRIMARY KEY,person_id TEXT,speaker_name TEXT,party TEXT,
      electorate TEXT,chamber TEXT,date TEXT,topic TEXT,text TEXT,word_count INT,source TEXT);
    ''')
    db.executescript(X.EXT_DDL)
    return db


def people(db):
    return X.People((FIXTURES / 'people.xml').read_bytes(), [(FIXTURES / 'senators.xml').read_bytes()], db)


def normal(db, ids=None):
    return X.parse_day((FIXTURES / 'sitting.xml').read_bytes(), 'senate', '2026-10-13', people(db), ids or {})


def test_normal_sitting_resolves_people_bills_counts_and_question():
    db = db_fixture()
    speeches, divisions, votes, issues = normal(db, {('senate','2026-10-13',1):'federal-senate-77'})
    assert not issues
    assert speeches[0]['person_id'] == '101'
    assert speeches[0]['gid'] == 'uk.org.publicwhip/lords/2026-10-13.1.3'
    assert divisions[0].id == 'federal-senate-77'
    assert divisions[0].extra['bills'][0]['official_id'] == 's999'
    assert divisions[0].question == 'That this bill be now read a second time.'
    assert divisions[0].result == 'affirmative'
    assert [(v.person_id,v.vote) for v in votes] == [('tvfy_101','aye'),('tvfy_102','no')]


def test_zero_byte_day_never_removes_cached_rows(tmp_path):
    db = db_fixture(); stage = tmp_path
    for name in ('people.xml','senators.xml'):
        (stage/name).write_bytes((FIXTURES/name).read_bytes())
    (stage/'representatives.xml').write_text('<members/>')
    folder = stage/'raw'/'senate_debates'; folder.mkdir(parents=True)
    (folder/'2026-10-14.xml').write_bytes((FIXTURES/'no-sitting.xml').read_bytes())
    modern = stage/'modern'; modern.mkdir()
    old = modern/'2026-10-14_senate.jsonl'; old.write_text('existing good row\n')
    args = Namespace(stage=str(stage),offline=True,start='2026-10-14',end='2026-10-14',
                     modern_dir=str(modern),tvfy_list_cache=None)
    divisions,votes,report = X.fetch(args,db)
    assert not divisions and not votes and not report['issues']
    assert report['days'][0]['status'] == 'no_sitting'
    assert old.read_text() == 'existing good row\n'


def test_identity_conflict_unknown_office_and_wrong_term_are_quarantined():
    db = db_fixture(); raw = (FIXTURES/'sitting.xml').read_bytes()
    for altered in [raw.replace(b'Alex Example',b'Sam Fixture'),
                    raw.replace(b'lord/1',b'lord/404'),
                    raw.replace(b'2026-10-13',b'1999-10-13')]:
        day = '1999-10-13' if b'1999-10-13' in altered else '2026-10-13'
        assert X.parse_day(altered,'senate',day,people(db),{})[3]


def test_incomplete_tally_is_reported():
    db=db_fixture()
    raw=(FIXTURES/'sitting.xml').read_bytes().replace(b'ayes="1"',b'ayes="4"')
    assert any(i['kind']=='vote-count' for i in X.parse_day(raw,'senate','2026-10-13',people(db),{})[3])


def test_same_loader_dedup_and_guarded_person_id(tmp_path):
    from parli.ingest import speeches as S
    db=db_fixture(); rows=normal(db)[0]
    path=tmp_path/'2026-10-13_senate.jsonl'
    path.write_text(''.join(json.dumps(s)+'\n' for s in rows))
    with patch.object(S,'MODERN_DIR',tmp_path):
        n=load_modern_jsonl(db,set(),'2026-10-13')
        assert n > 0
        assert load_modern_jsonl(db,build_seen(db,text_hash),'2026-10-13') == 0
    assert db.execute('SELECT person_id FROM speeches ORDER BY speech_id LIMIT 1').fetchone()[0]=='101'


def test_additive_load_idempotence_and_schema_one_bytes():
    db=db_fixture(); _, divisions,votes,issues=normal(db)
    assert not issues
    X.apply_divisions(db,divisions,votes)
    X.apply_divisions(db,divisions,votes)
    assert db.execute('SELECT COUNT(*) FROM ext_divisions').fetchone()[0]==1
    assert db.execute('SELECT COUNT(*) FROM ext_votes').fetchone()[0]==2
    out,names,newest={},{},{}
    E.export_federal(db,out,names,newest)
    out['_names']=names
    out['_meta']={'schema':1,'content_changed_at':'2026-10-14T00:00:00Z',
                  'latest_division_date':'2026-10-13','latest_division_date_by_jurisdiction':{'federal':'2026-10-13'}}
    validate_votes(out)
    assert out['101']['ayes']==1 and out['102']['noes']==1
    before=E.dump(out)
    X.apply_divisions(db,divisions,votes)
    again,names2,newest2={},{},{}; E.export_federal(db,again,names2,newest2)
    again.update(_names=names2,_meta=out['_meta'])
    assert E.dump(again)==before


def test_xml_refusal_stops_without_api_fallback():
    with patch.object(N,'read_only'),patch.object(N,'fetch',side_effect=H.Refused('refused')), \
         patch.object(N,'api_hansard') as fallback,patch('sys.argv',['feed','--start','2026-10-13']):
        with pytest.raises(SystemExit,match='refused'):N.main()
        fallback.assert_not_called()


def test_serial_http_agent_robots_retry_after_and_stop():
    client=H.HonestHTTP()
    with patch.object(client,'_request',side_effect=[b'User-agent: OPAXBot\nDisallow: /blocked',b'yes']) as request:
        with pytest.raises(H.Refused):client.get('https://example.test/blocked')
        assert client.get('https://example.test/open')==b'yes'
        assert request.call_count==2
    error=urllib.error.HTTPError('https://example.test',429,'refused',{'Retry-After':'2'},None)
    with patch.object(client.opener,'open',side_effect=error) as call,patch.object(H.time,'sleep') as sleep:
        with pytest.raises(H.Refused):client._request('https://example.test')
        assert call.call_count==1
        assert call.call_args.args[0].get_header('User-agent')==H.USER_AGENT
        assert any(c.args==(2.0,) for c in sleep.call_args_list)


def test_tvfy_partial_month_is_relisted_and_existing_row_deduped(tmp_path):
    from datetime import date
    db=db_fixture()
    db.execute("INSERT INTO divisions VALUES(1,'senate','Question','2006-02-07',1,1,0,NULL,NULL,NULL,'federal')")
    listed=[{'id':1,'date':'2006-02-07','number':1},{'id':2,'date':'2006-02-08','number':2}]
    def window(house,start,end,out):
        if house=='senate':out.extend(listed)
        return 1
    with patch.object(T,'CACHE',tmp_path),patch.object(T,'STATE_PATH',tmp_path/'state.json'), \
         patch.object(T,'month_windows',return_value=[(date(2006,2,1),date(2006,2,28))]), \
         patch.object(T,'fetch_window',side_effect=window),patch.object(T,'log'):
        assert T.phase_list(db,date(2006,2,1),True)==0
    assert db.execute("SELECT COUNT(*) FROM divisions WHERE house='senate'").fetchone()[0]==2


def test_tvfy_partial_start_window_never_checkpoints_a_whole_month(tmp_path):
    from datetime import date
    db=db_fixture()
    with patch.object(T,'CACHE',tmp_path),patch.object(T,'STATE_PATH',tmp_path/'state.json'), \
         patch.object(T,'month_windows',return_value=[(date(2006,2,15),date(2006,2,28))]), \
         patch.object(T,'fetch_window',return_value=1),patch.object(T,'log'):
        assert T.phase_list(db,date(2006,2,15),False)==0
    assert json.loads((tmp_path/'state.json').read_text())['months_done']=={'representatives':[],'senate':[]}


def test_tvfy_membership_id_cannot_substitute_for_person_id():
    good={'id':1,'house':'senate','date':'2026-10-13','aye_votes':1,'no_votes':0,
          'votes':[{'vote':'aye','member':{'id':999,'person':{'id':101}}}]}
    assert T.complete_detail(good,1)
    del good['votes'][0]['member']['person']
    assert not T.complete_detail(good,1)


def test_jsonl_loader_rechecks_a_conflicting_person_id(tmp_path):
    from parli.ingest import speeches as S
    db=db_fixture(); rows=normal(db)[0];rows[0]['person_id']='102'
    (tmp_path/'2026-10-13_senate.jsonl').write_text(json.dumps(rows[0])+'\n')
    with patch.object(S,'MODERN_DIR',tmp_path):load_modern_jsonl(db,set(),'2026-10-13')
    assert db.execute('SELECT person_id FROM speeches').fetchone()[0] is None


def test_api_fallback_only_writes_after_every_honest_response(tmp_path):
    args=Namespace(start='2026-10-13',end='2026-10-13',modern_dir=str(tmp_path))
    listing=json.dumps([{'entry':{'body':'Bills'},'subs':[{'listurl':'/senate/?id=fixture'}]}]).encode()
    page=b'<div class="main"><p class="speaker"><strong>Alex Example</strong></p><p>A fixture debate speech with sufficient text for the existing speech loader.</p></div>'
    with patch.dict('os.environ',{'OPENAUSTRALIA_API_KEY':'fixture-key'}), \
         patch.object(N.HonestHTTP,'get',side_effect=[listing,page,listing,page]):
        N.api_hansard(args)
    assert len(list(tmp_path.glob('*.jsonl')))==2
    for path in tmp_path.glob('*.jsonl'):path.unlink()
    with patch.dict('os.environ',{'OPENAUSTRALIA_API_KEY':'fixture-key'}), \
         patch.object(N.HonestHTTP,'get',side_effect=[listing,page,H.Refused('challenge')]):
        with pytest.raises(H.Refused):N.api_hansard(args)
    assert not list(tmp_path.glob('*.jsonl'))


def test_xml_outage_selects_the_api_but_refusal_does_not(tmp_path):
    with patch.object(N,'read_only'),patch.object(N,'fetch',side_effect=H.Unavailable('outage')), \
         patch.object(N,'api_hansard') as fallback,patch('sys.argv',['feed','--start','2026-10-13','--stage',str(tmp_path)]):
        N.main()
        fallback.assert_called_once()


def test_http_disables_environment_proxies_and_obeys_http_date_retry_after():
    with patch.dict('os.environ',{'HTTPS_PROXY':'http://fixture.invalid:1234'}), \
         patch.object(H.urllib.request,'build_opener') as opener:
        H.HonestHTTP()
        assert opener.call_args.args[0].proxies == {}
    with patch.object(H,'datetime') as clock:
        from datetime import datetime,timezone
        clock.now.return_value=datetime(2026,10,14,0,0,tzinfo=timezone.utc)
        assert H.retry_seconds('Wed, 14 Oct 2026 00:00:04 GMT')==4


def test_legacy_tvfy_entry_point_requires_complete_details():
    from parli.ingest import divisions as legacy
    with patch('sys.argv',['divisions','--since','2026-10-01']),patch.object(legacy,'refresh_main') as refresh:
        legacy.main()
        import sys
        assert '--strict' in sys.argv
        refresh.assert_called_once()


def test_api_return_keeps_published_xml_key_and_does_not_double_count():
    db=db_fixture(); _,divisions,votes,_=normal(db)
    X.apply_divisions(db,divisions,votes)
    db.execute("INSERT INTO divisions VALUES(77,'senate','Example Bill 2026 - Second Reading','2026-10-13',1,1,1,NULL,NULL,NULL,'federal')")
    db.executemany('INSERT INTO votes VALUES(?,?,?)',[(77,'101','aye'),(77,'102','no')])
    N.apply_api_projection(db,'2026-10-13')
    assert db.execute('SELECT id FROM ext_divisions').fetchall()[0][0]==divisions[0].id
    assert db.execute('SELECT COUNT(*) FROM ext_divisions').fetchone()[0]==1
    assert db.execute('SELECT COUNT(*) FROM ext_votes').fetchone()[0]==2
    out={}; E.export_federal(db,out,{},{})
    assert out['101']['ayes']==1 and out['102']['noes']==1
    db.executescript(T.BILLS_DDL)
    db.execute("CREATE TABLE bills_v2(bill_key TEXT,jurisdiction TEXT,source_id TEXT)")
    db.execute("INSERT INTO bills_v2 VALUES('fixture','federal','s999')")
    db.execute("INSERT INTO division_bills VALUES(77,NULL,'s999','Example Bill 2026',NULL)")
    from parli.ingest.tvfy_bill_links import plan_links
    assert {target for _,target,_ in plan_links(db)}=={divisions[0].id}


def test_quarantined_source_division_is_not_reported_as_recovered():
    db=db_fixture()
    raw=(FIXTURES/'sitting.xml').read_bytes().replace(b'ayes="1"',b'ayes="4"')
    _,divisions,votes,issues=X.parse_day(raw,'senate','2026-10-13',people(db),{})
    report=X.audit(db,divisions,votes,issues,[])
    assert report['recovered_divisions']==0
    assert report['quarantined_recovered_divisions']==[divisions[0].id]
    assert report['additional_member_votes']==0


def test_party_switch_boundary_keeps_person_and_leaves_party_unknown():
    db=db_fixture()
    crosswalk=(FIXTURES/'people.xml').read_text().replace('<office id="uk.org.publicwhip/lord/1"/>',
        '<office id="uk.org.publicwhip/lord/1"/><office id="uk.org.publicwhip/lord/3"/><office id="uk.org.publicwhip/lord/4"/>')
    offices=(FIXTURES/'senators.xml').read_text().replace('todate="9999-12-31" party="Australian Labor Party"',
        'todate="2026-07-04" party="Australian Labor Party"').replace('</members>',
        '<member id="uk.org.publicwhip/lord/3" firstname="Alex" lastname="Example" house="senate" fromdate="2026-07-04" todate="2026-10-13" party="Independent" division="NSW"/>'
        '<member id="uk.org.publicwhip/lord/4" firstname="Alex" lastname="Example" house="senate" fromdate="2026-10-13" todate="9999-12-31" party="Australian Greens" division="NSW"/></members>')
    p=X.People(crosswalk,[offices],db)
    found=p.resolve('uk.org.publicwhip/lord/1','Alex Example','senate','2026-10-13')
    assert found['person_id']=='101' and found['party']==''
    assert p.resolve('uk.org.publicwhip/lord/1','Alex Example','senate','2026-10-14')['party']=='Australian Greens'
