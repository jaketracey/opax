"""Federal feed fixtures use invented parliamentarian identities and no network."""
from argparse import Namespace
from copy import deepcopy
import json
import io
from pathlib import Path
import sqlite3
from unittest.mock import patch
import urllib.error
import urllib.response
import pytest

from parli.ingest import federal_feed as N, honest_http as H, openaustralia_xml as X
from parli.ingest import tvfy_refresh as T
from parli.ingest.speeches import load_modern_jsonl, text_hash
from parli.ingest.dedup import build_seen
from scripts.vm.mobile_votes_contract import validate_votes
from scripts import export_votes as E

FIXTURES = Path(__file__).parent / 'fixtures' / 'openaustralia'


@pytest.fixture(autouse=True)
def isolated_source_status(monkeypatch, tmp_path):
    monkeypatch.setenv('OPAX_SOURCE_STATUS_FILE', str(tmp_path/'source-status.json'))
    monkeypatch.delenv('OPAX_SOURCE_NAME', raising=False)


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


def test_xml_refusal_stops_without_api_fallback(tmp_path):
    with patch.object(N,'read_only'),patch.object(N,'fetch',side_effect=H.Refused('refused')), \
         patch.object(N,'api_hansard') as fallback,patch('sys.argv',['feed','--start','2026-10-13']):
        with pytest.raises(N.source_http.SourceRefused) as refused:N.main()
        assert refused.value.code == 4
        fallback.assert_not_called()
    status=json.loads((tmp_path/'source-status.json').read_text())
    assert status['data.openaustralia.org.au']['status']=='paused'


@pytest.mark.parametrize('body,headers',[
    (b'<html><title>Just a moment</title></html>',{}),
    (b'<html><form id="challenge-form"></form></html>',{}),
    (b'ok',{'cf-mitigated':'challenge'}),
    (b'ok',{'x-sucuri-block':'1'}),
])
def test_feed_uses_shared_challenge_checks_without_retry(body,headers):
    client=H.HonestHTTP()
    response=urllib.response.addinfourl(io.BytesIO(body),headers,'https://example.test/xml',200)
    with patch.object(client.opener,'open',return_value=response) as request,patch.object(H.time,'sleep'):
        with pytest.raises(N.source_http.SourceRefused) as refused:
            client._request('https://example.test/xml')
    assert refused.value.code==4 and request.call_count==1


def test_usable_archive_index_with_passive_detection_script_is_not_a_challenge():
    client=H.HonestHTTP()
    body=b'<html><title>Index of /scrapedxml/senate_debates</title><a href="2026-10-13.xml">XML</a><script>var s=document.createElement("script");s.src="/cdn-cgi/challenge-platform/scripts/jsd/main.js";</script></html>'
    response=urllib.response.addinfourl(io.BytesIO(body),{},'https://data.openaustralia.org.au/scrapedxml/senate_debates/',200)
    with patch.object(client.opener,'open',return_value=response),patch.object(H.time,'sleep'):
        assert client._request(response.geturl())==body


def test_tvfy_refusal_is_paused_and_never_retried(tmp_path):
    with patch.object(T,'key',return_value='fixture-key'),patch.object(T._http,'get',side_effect=H.Refused('HTTP 403')) as request:
        with pytest.raises(N.source_http.SourceRefused) as refused:T.get('divisions.json',{})
    assert refused.value.code==4 and request.call_count==1
    status=(tmp_path/'source-status.json').read_text()
    assert json.loads(status)['theyvoteforyou.org.au']['status']=='paused'
    assert 'fixture-key' not in status


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
    report=[]
    with patch.object(S,'MODERN_DIR',tmp_path):
        assert load_modern_jsonl(db,set(),'2026-10-13',report=report)==0
        assert load_modern_jsonl(db,set(),'2026-10-13')==0
    assert db.execute('SELECT COUNT(*) FROM speeches').fetchone()[0]==0
    assert report[0]['unmatched'][0]['reason']=='rejected-person-id'


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


def write_speeches(directory, rows):
    (directory/'2026-10-13_senate.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in rows))


def test_api_day_reconciles_footer_and_retains_unmatched_citations(tmp_path):
    from parli.ingest import speeches as S
    db=db_fixture(); row=normal(db)[0][0]
    db.execute('INSERT INTO speeches VALUES(900,?,?,?,?,?,?,?,?,?,?)',
               ('101','Alex Example','Labor','NSW','senate','2026-10-13',None,
                row['text'].replace('\n\n','  ')+'\nView the PC OA website',25,'openaustralia'))
    unmatched=dict(row,gid=row['gid']+'.unmatched',text=row['text']+' An additional unmatched sentence.')
    write_speeches(tmp_path,[row,unmatched]); report=[]
    with patch.object(S,'MODERN_DIR',tmp_path):
        assert S.load_modern_jsonl(db,set(),report=report)==0
    assert db.execute('SELECT speech_id FROM speeches').fetchall()==[(900,)]
    assert report[0]['matched'][0]['speech_id']==900
    assert report[0]['unmatched'][0]['gid']==unmatched['gid']
    assert not report[0]['fully_reconciled']


def test_fresh_day_duplicate_body_under_new_gid_is_impossible(tmp_path):
    from parli.ingest import speeches as S
    db=db_fixture(); row=normal(db)[0][0]
    duplicate=dict(row,gid=row['gid']+'.duplicate',text=row['text'].replace('\n\n',' \t ')+'\nView the PC OA website')
    write_speeches(tmp_path,[row,duplicate]); report=[]
    with patch.object(S,'MODERN_DIR',tmp_path):
        assert S.load_modern_jsonl(db,set(),report=report)==1
        assert S.load_modern_jsonl(db,set())==0
    assert report[0]['duplicate_bodies']==1
    assert db.execute('SELECT COUNT(*) FROM speeches').fetchone()[0]==1
    assert db.execute('SELECT COUNT(DISTINCT speech_id) FROM oa_speech_provenance').fetchone()[0]==1
    assert db.execute('SELECT COUNT(*) FROM oa_speech_provenance').fetchone()[0]==2


def test_gid_reconciles_to_existing_citation_when_text_changes(tmp_path):
    from parli.ingest import speeches as S
    db=db_fixture(); row=normal(db)[0][0]
    write_speeches(tmp_path,[row])
    with patch.object(S,'MODERN_DIR',tmp_path):
        assert S.load_modern_jsonl(db,set())==1
        row['text']+=' An upstream correction does not create a new citation URL.'
        write_speeches(tmp_path,[row]); report=[]
        assert S.load_modern_jsonl(db,set(),report=report)==0
    assert report[0]['matched'][0]['basis']=='gid'


def test_gid_cannot_reconcile_a_different_guarded_person(tmp_path):
    from parli.ingest import speeches as S
    db=db_fixture();row=normal(db)[0][0];write_speeches(tmp_path,[row])
    with patch.object(S,'MODERN_DIR',tmp_path):
        assert S.load_modern_jsonl(db,set())==1
        write_speeches(tmp_path,[dict(row,speaker='Sam Fixture',person_id='102')])
        report=[]
        assert S.load_modern_jsonl(db,set(),report=report)==0
        assert S.load_modern_jsonl(db,set())==0
    assert report[0]['unmatched'][0]['reason']=='gid-identity-conflict'
    assert db.execute('SELECT COUNT(*) FROM speeches').fetchone()[0]==1


@pytest.mark.parametrize('reverse',[False,True])
@pytest.mark.parametrize('same_gid',[False,True])
def test_rejected_then_valid_identity_batch_is_held_in_either_order_and_on_rerun(tmp_path,reverse,same_gid):
    from parli.ingest import speeches as S
    db=db_fixture();good=normal(db)[0][0]
    bad=dict(good,person_id='102',gid=good['gid'] if same_gid else good['gid']+'.rejected')
    rows=[bad,good]
    if reverse:rows.reverse()
    write_speeches(tmp_path,rows)
    with patch.object(S,'MODERN_DIR',tmp_path):
        for _ in range(2):
            report=[]
            assert S.load_modern_jsonl(db,set(),report=report)==0
            assert len(report[0]['unmatched'])==2
            assert {r['reason'] for r in report[0]['unmatched']}=={'batch-identity-conflict'}
    assert db.execute('SELECT COUNT(*) FROM speeches').fetchone()[0]==0
    assert db.execute('SELECT COUNT(*) FROM oa_speech_provenance').fetchone()[0]==0


@pytest.mark.parametrize('reverse',[False,True])
def test_rejected_and_valid_identity_across_loads_mint_one_citation_and_replay(tmp_path,reverse):
    from parli.ingest import speeches as S
    db=db_fixture();good=normal(db)[0][0];bad=dict(good,person_id='102')
    rows=[bad,good]
    if reverse:rows.reverse()
    with patch.object(S,'MODERN_DIR',tmp_path):
        for row in rows:
            write_speeches(tmp_path,[row])
            assert S.load_modern_jsonl(db,set())==(1 if row['person_id']=='101' else 0)
        before=db.execute('SELECT * FROM speeches').fetchall()
        for row in rows:
            write_speeches(tmp_path,[row])
            assert S.load_modern_jsonl(db,set())==0
        write_speeches(tmp_path,rows)
        assert S.load_modern_jsonl(db,set())==0
    assert db.execute('SELECT * FROM speeches').fetchall()==before
    assert db.execute('SELECT person_id FROM speeches').fetchall()==[('101',)]


@pytest.mark.parametrize('same_gid',[False,True])
def test_conflicting_valid_identities_are_held_before_first_citation(tmp_path,same_gid):
    from parli.ingest import speeches as S
    db=db_fixture();first=normal(db)[0][0]
    second=dict(first,person_id='102',speaker='Sam Fixture',
                gid=first['gid'] if same_gid else first['gid']+'.other',
                text=first['text'].replace('\n\n','  ')+'\nView the PC OA website')
    write_speeches(tmp_path,[first,second])
    with patch.object(S,'MODERN_DIR',tmp_path):
        assert S.load_modern_jsonl(db,set())==0
        assert S.load_modern_jsonl(db,set())==0
    assert db.execute('SELECT COUNT(*) FROM speeches').fetchone()[0]==0


@pytest.mark.parametrize('failure',[H.Refused('refused'),H.Unavailable('failed'),'shared-refusal',b'<broken>',
    (FIXTURES/'sitting.xml').read_bytes().replace(b'2026-10-13',b'2026-10-14').replace(b'ayes="1"',b'ayes="4"')])
def test_second_day_failure_leaves_entire_cache_unchanged(tmp_path,failure):
    stage=tmp_path/'stage';stage.mkdir();modern=tmp_path/'modern';modern.mkdir()
    for f in ('people.xml','representatives.xml','senators.xml'):(stage/f).write_bytes(b'previous mapping')
    for day in ('2026-10-13','2026-10-14'):
        p=stage/'raw'/'senate_debates'/f'{day}.xml';p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'previous XML')
        (modern/f'{day}_senate.jsonl').write_bytes(b'previous speeches')
    (stage/'divisions.json').write_bytes(b'previous divisions')
    before={p.relative_to(tmp_path):p.read_bytes() for p in tmp_path.rglob('*') if p.is_file()}
    responses=iter([(FIXTURES/'people.xml').read_bytes(),b'<members/>',(FIXTURES/'senators.xml').read_bytes(),
               b'Index of',b'Index of href="2026-10-13.xml" href="2026-10-14.xml"',
               (FIXTURES/'sitting.xml').read_bytes(),failure])
    def response(url):
        value=next(responses)
        if value=='shared-refusal':raise N.source_http.SourceRefused(url,'HTTP 403')
        if isinstance(value,BaseException):raise value
        return value
    args=Namespace(stage=str(stage),offline=False,start='2026-10-13',end='2026-10-14',
                   modern_dir=str(modern),tvfy_list_cache=str(tmp_path/'lists'),load_divisions=False)
    with patch.object(X.HonestHTTP,'get',side_effect=response):
        if failure=='shared-refusal':expected=N.source_http.SourceRefused
        elif isinstance(failure,bytes):expected=X.ET.ParseError if failure==b'<broken>' else ValueError
        else:expected=type(failure)
        with pytest.raises(expected):X.fetch(args,db_fixture())
    assert {p.relative_to(tmp_path):p.read_bytes() for p in tmp_path.rglob('*')
            if p.is_file() and p.name!='source-status.json'}==before
    assert not list(tmp_path.glob('.*-batch-*'))


def test_success_swaps_cache_directory_after_explicit_publication(tmp_path):
    from parli.ingest.cache_batch import CacheBatch
    root=tmp_path/'cache';root.mkdir();(root/'old').write_bytes(b'unchanged')
    old_inode=root.stat().st_ino
    with CacheBatch(root) as batch:
        batch.write(root/'old',b'new');batch.write(root/'added',b'validated')
        assert (root/'old').read_bytes()==b'unchanged'
        batch.publish()
    assert (root/'old').read_bytes()==b'new' and (root/'added').read_bytes()==b'validated'
    assert root.stat().st_ino!=old_inode


@pytest.mark.parametrize('question',[
    'That the question be now put.','That the debate be adjourned.',
    'Closure of debate','That standing orders be suspended.',
    'Suspension of standing orders','That the amendment be agreed to.',
    'That the motion be agreed to.','',None,'Unresolved question',
])
def test_xml_procedural_and_unresolved_questions_never_become_bill_stances(question):
    parsed=E.parse_name('Example Bill 2026 - Second Reading')
    assert E.xml_polarity(parsed,question)==0


@pytest.mark.parametrize('question',['That this bill be now read a second time.',
    'That the bill be read a third time.','That the bill, as amended, be agreed to.'])
def test_xml_explicit_bill_questions_qualify(question):
    assert E.xml_polarity(E.parse_name('Example Bill 2026 - Second Reading'),question)==1


def test_procedural_votes_keep_totals_and_bill_evidence(tmp_path):
    db=db_fixture();_,divisions,votes,_=normal(db)
    d=divisions[0];d.question='That the question be now put.'
    X.apply_divisions(db,divisions,votes)
    out={};E.export_federal(db,out,{},{})
    assert out['101']['divisions_total']==1 and out['102']['divisions_total']==1
    assert out['101']['for']==out['101']['against']==[]
    assert db.execute('SELECT bill_ref FROM ext_divisions').fetchone()[0]==d.bill_ref
    assert json.loads(db.execute('SELECT evidence FROM oa_division_provenance').fetchone()[0])['bills']


def test_morning_runner_is_bounded_federal_only_and_schema_one(tmp_path):
    from scripts import federal_morning as M
    stage=tmp_path/'stage';stage.mkdir()
    for f in ('people.xml','senators.xml'):(stage/f).write_bytes((FIXTURES/f).read_bytes())
    (stage/'representatives.xml').write_bytes(b'<members/>')
    raw=stage/'raw'/'senate_debates';raw.mkdir(parents=True)
    (raw/'2026-10-13.xml').write_bytes((FIXTURES/'sitting.xml').read_bytes())
    modern=stage/'morning-modern';modern.mkdir()
    row=normal(db_fixture())[0][0]
    (modern/'2026-10-16_senate.jsonl').write_text(json.dumps(dict(row,date='2026-10-16'))+'\n')
    path=tmp_path/'scratch.db'
    with sqlite3.connect(path) as scratch:db_fixture().backup(scratch)
    args=Namespace(db=str(path),stage=str(stage),output=tmp_path/'votes.json',date='2026-10-14',offline=True)
    M.run(args)
    first=args.output.read_bytes();validate_votes(json.loads(first))
    M.run(args)
    assert args.output.read_bytes()==first
    receipt=json.loads((stage/'morning-receipt.json').read_text())
    assert receipt['start']=='2026-10-07' and receipt['end']=='2026-10-13'
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT COUNT(*) FROM speeches').fetchone()[0]==1
        assert db.execute('SELECT COUNT(*) FROM speeches WHERE date>\'2026-10-13\'').fetchone()[0]==0
        assert db.execute('SELECT COUNT(*) FROM ext_divisions').fetchone()[0]==1
        assert db.execute('SELECT COUNT(*) FROM ext_votes').fetchone()[0]==2


def test_morning_runner_calendar_skip_opens_no_database(tmp_path):
    from scripts import federal_morning as M
    path=tmp_path/'absent.db'
    M.run(Namespace(date='2026-10-12',db=str(path)))
    assert not path.exists()
