"""Offline relabel, immutable citation and dated House membership regressions."""
from collections import Counter, defaultdict
import json
import os
import sqlite3
import zipfile

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from parli.ingest import federation as F, federation_relabel as R, speeches as L, arag_sync as S
from parli.ingest import federation_publish as P
from argparse import Namespace
from scripts import vote_parties as V


@pytest.fixture
def db():
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.executescript('''CREATE TABLE members(person_id TEXT PRIMARY KEY);
      INSERT INTO members VALUES ('101'); INSERT INTO members VALUES ('102');
      CREATE TABLE speeches(speech_id INTEGER PRIMARY KEY,person_id TEXT,speaker_name TEXT,party TEXT,
      electorate TEXT,chamber TEXT,date TEXT,topic TEXT,text TEXT,word_count INTEGER,source TEXT,
      state TEXT DEFAULT 'federal',party_canonical TEXT);''')
    yield db
    db.close()


@pytest.fixture
def membership(db):
    evidence = V.Evidence([
        V.entry('release-term', 'representatives', ('release', 'one'), ['Alex Example'], 'Labor',
                '2000-01-01', '2010-01-01', pids=['101']),
        V.entry('release-term', 'representatives', ('release', 'one'), ['Alex Example'], 'Independent',
                '2010-01-01', None, '2022-09-08', pids=['101']),
        V.entry('handbook-term', 'senate', ('handbook', 'two'), ['Alex Example'], 'Liberal',
                '1990-01-01', None, '2026-01-01', pids=['102']),
    ], elections={})
    return F.HouseMembership(db, evidence)


def add(db, sid=41, day='2009-02-03', text='Substantive policy evidence. '*15, source='zenodo'):
    db.execute("INSERT INTO speeches VALUES (?,NULL,'Example, Alex, MP','source party','Seat',"
               "'representatives',?,NULL,?,100,?,'federal',NULL)", (sid, day, text, source))
    db.commit()
    return dict(date=day, text=text, body_sha256=R.digest(text), source_input_id='original-41',
                source_row_number=7, speaker='Example, Alex, MP')


def test_flags_and_main_committee_share_one_logical_chamber():
    for value in [1, True, '1', '1.0', 'true']:
        assert F.logical_chamber(None, value) == 'federation'
    for value in [0, False, None, 'false', '0.0']:
        assert F.logical_chamber(None, value) == 'representatives'
    with pytest.raises(ValueError): F.flagged('unexpected')
    assert F.input_id('NA') is None


def test_load_guard_pauses_above_40_and_resumes_at_the_boundary(monkeypatch):
    loads=iter([(0,40.01,0),(0,40,0)])
    sleeps=[]
    monkeypatch.setattr(R.os,'getloadavg',lambda:next(loads))
    monkeypatch.setattr(R.time,'sleep',sleeps.append)
    R.load_guard()
    assert sleeps==[5]


def test_person_exports_retain_house_membership_and_respect_publication_hold(monkeypatch):
    monkeypatch.delenv('OPAX_PUBLISH_FEDERATION',raising=False)
    assert F.published_person_chambers(['federation','representatives'])==['representatives']
    monkeypatch.setenv('OPAX_PUBLISH_FEDERATION','1')
    assert F.published_person_chambers(['federation'])==['federation','representatives']
    assert F.published_person_chambers(['representatives','federation'])==['representatives','federation']


def test_dated_house_membership_never_uses_senate_or_todays_party(membership):
    assert membership.at('Example, Alex, MP', '2009-12-31') == ('101', 'Labor')
    assert membership.at('Alex Example', '2010-01-01') == ('101', 'Independent')
    assert membership.at('Alex Example', '2022-09-09') == (None, None)
    assert membership.at('Example', '2009-01-01') == (None, None)


def test_conflicting_dated_parties_are_null(db):
    evidence = V.Evidence([V.entry('release-term','representatives',('release','a'),['Alex Example'],p,
        '2000-01-01','2020-01-01',pids=['101']) for p in ('Labor','Liberal')],elections={})
    assert F.HouseMembership(db,evidence).at('Alex Example','2009-01-01') == ('101',None)


def test_loader_retains_flag_original_id_and_uses_dated_house(db, membership, tmp_path, monkeypatch):
    rows = [dict(body='Policy evidence '*20, name='Example, Alex, MP', party='LP', electorate='Seat',
        date=day, fedchamb_flag=flag, uniqueID=uid) for day,flag,uid in
        [('2009-02-03',1,'before-name-change'),('2013-02-03',1,'after-name-change'),('2014-02-03',0,'house')]]
    rows.append(dict(rows[0],body='short',uniqueID='excluded'))
    table = pa.Table.from_pylist(rows)
    buf = pa.BufferOutputStream(); pq.write_table(table,buf)
    path=tmp_path/'input.zip'
    with zipfile.ZipFile(path,'w') as z: z.writestr('corpus.parquet',buf.getvalue().to_pybytes())
    monkeypatch.setattr(L,'ZENODO_ZIP',path)
    monkeypatch.setattr(L,'HouseMembership',lambda db:membership)
    seen=set()
    assert L.load_zenodo_parquet(db,seen) == 3
    assert [tuple(r) for r in db.execute('SELECT chamber,fedchamb_flag,source_input_id,person_id,party,party_canonical FROM speeches ORDER BY speech_id')] == [
        ('federation',1,'before-name-change','101','LP','Labor'),
        ('federation',1,'after-name-change','101','LP','Independent'),
        ('representatives',0,'house','101','LP','Independent')]
    ids=db.execute('SELECT speech_id FROM speeches').fetchall()
    assert L.load_zenodo_parquet(db,seen) == 0
    assert db.execute('SELECT speech_id FROM speeches').fetchall() == ids


def test_exact_dated_body_census_counts_rows_once(db):
    turn=add(db)
    add(db,42,source='openaustralia')
    years=defaultdict(Counter)
    plan=R.measure(db,[turn,turn],set(),years)
    assert len(plan)==1 and plan[0]['speech_id']==41
    assert plan[0]['basis']=='exact_dated_body'
    assert years['2009']['relabels']==1
    assert years['2009']['repeated_input_collapsed']==1
    assert years['2009']['other_source_exact_rows_unverified']==1


def test_original_id_precedes_body_and_conflict_is_held(db):
    turn=add(db); add(db,42)
    F.ensure_columns(db)
    db.execute("UPDATE speeches SET source_input_id='original-41' WHERE speech_id=41")
    db.commit()
    years=defaultdict(Counter)
    assert R.measure(db,[turn],set(),years)[0]['basis']=='original_id'
    # Retained IDs also distinguish a House/Federation pair with identical words.
    assert R.measure(db,[turn],{(turn['date'],turn['body_sha256'])},defaultdict(Counter))[0]['basis']=='original_id'
    db.execute("UPDATE speeches SET text='changed body' WHERE speech_id=41");db.commit()
    assert not R.measure(db,[turn],set(),defaultdict(Counter))


def test_body_fallback_does_not_overwrite_another_original_id(db):
    turn=add(db)
    F.ensure_columns(db)
    db.execute("UPDATE speeches SET source_input_id='different-original-id'");db.commit()
    years=defaultdict(Counter)
    assert not R.measure(db,[turn],set(),years)
    assert years['2009']['held_id_conflict']==1


def test_ambiguous_and_mixed_flag_bodies_are_held(db):
    turn=add(db); add(db,42)
    assert not R.measure(db,[turn],set(),defaultdict(Counter))
    db.execute('DELETE FROM speeches WHERE speech_id=42');db.commit()
    assert not R.measure(db,[turn],{(turn['date'],turn['body_sha256'])},defaultdict(Counter))


def test_budget_and_stale_plan_roll_back_then_relabel_is_idempotent(db,membership):
    turn=add(db)
    plan=R.measure(db,[turn],set(),defaultdict(Counter))
    with pytest.raises(ValueError): R.apply_plan(db,plan,0,membership)
    bad=[dict(plan[0],body_sha256='stale')]
    with pytest.raises(ValueError): R.apply_plan(db,bad,1,membership)
    assert db.execute('SELECT chamber FROM speeches').fetchone()[0]=='representatives'
    before=db.execute('SELECT speech_id,text,party,date,source FROM speeches').fetchall()
    assert R.apply_plan(db,plan,1,membership)==1
    assert R.apply_plan(db,plan,1,membership)==0
    assert db.execute('SELECT speech_id,text,party,date,source FROM speeches').fetchall()==before
    assert tuple(db.execute('SELECT chamber,person_id,party_canonical,source_input_id FROM speeches').fetchone()) == ('federation','101','Labor','original-41')


def test_budget_failure_changes_no_rows_or_schema(db,membership):
    a=add(db);b=add(db,42,day='2009-02-04')
    plan=R.measure(db,[a,b],set(),defaultdict(Counter))
    with pytest.raises(ValueError,match='exceed'): R.apply_plan(db,plan,1,membership)
    assert all(r[0]=='representatives' for r in db.execute('SELECT chamber FROM speeches'))
    assert 'fedchamb_flag' not in {r[1] for r in db.execute('PRAGMA table_info(speeches)')}


def test_already_labelled_row_can_fill_missing_original_provenance(db,membership):
    turn=add(db)
    F.ensure_columns(db)
    db.execute("UPDATE speeches SET chamber='federation',fedchamb_flag=1");db.commit()
    plan=R.measure(db,[turn],set(),defaultdict(Counter))
    assert R.apply_plan(db,plan,1,membership)==1
    assert tuple(db.execute('SELECT source_input_id,source_row_number FROM speeches').fetchone())==('original-41',7)
    assert R.apply_plan(db,plan,1,membership)==0


def test_publication_off_by_default_preserves_slug_and_source_party_is_not_a_fallback(db,membership,monkeypatch):
    turn=add(db)
    plan=R.measure(db,[turn],set(),defaultdict(Counter))
    R.apply_plan(db,plan,1,membership)
    row=db.execute('SELECT * FROM speeches').fetchone()
    monkeypatch.delenv('OPAX_PUBLISH_FEDERATION',raising=False)
    held=S.map_speech(row)
    assert {'labelset':'chamber','label':'representatives'} in held['usermetadata']['classifications']
    monkeypatch.setenv('OPAX_PUBLISH_FEDERATION','1')
    released=S.map_speech(row)
    assert released['slug']==held['slug']=='speech-41'
    assert {'labelset':'chamber','label':'federation'} in released['usermetadata']['classifications']
    assert released['extra']['metadata']['source_input_id']=='original-41'
    db.execute('UPDATE speeches SET party_canonical=NULL')
    assert not any(c['labelset']=='party' for c in S.map_speech(db.execute('SELECT * FROM speeches').fetchone())['usermetadata']['classifications'])
    # Committee/title readers depend on their established separator grammar.
    other=dict(row,chamber='house_committee',source='committee_house',topic='Economics - Inquiry')
    assert ' — Economics - Inquiry — ' in S.map_speech(other)['title']


def test_snapshot_apply_refused_before_any_open(tmp_path):
    with pytest.raises(SystemExit):
        R.main(['--db',str(R.SNAPSHOT),'--stage',str(tmp_path),'--apply','--max-rows','1'])


def test_snapshot_hardlink_alias_is_also_protected(tmp_path,monkeypatch):
    original=tmp_path/'protected.sqlite';original.write_bytes(b'Invented read-only fixture')
    alias=tmp_path/'alias.sqlite';os.link(original,alias)
    monkeypatch.setattr(R,'SNAPSHOT',original)
    with pytest.raises(SystemExit):
        R.main(['--db',str(alias),'--stage',str(tmp_path),'--apply','--max-rows','1'])
    assert original.read_bytes()==b'Invented read-only fixture'


@pytest.mark.parametrize('native_response', [False, True])
def test_publisher_default_off_digest_budget_metadata_only_and_replay(db,membership,tmp_path,monkeypatch,native_response):
    turn=add(db);plan=R.measure(db,[turn],set(),defaultdict(Counter))
    R.apply_plan(db,plan,1,membership)
    monkeypatch.setenv('OPAX_PUBLISH_FEDERATION','1')
    staged=S.map_speech(db.execute('SELECT * FROM speeches').fetchone())
    path=tmp_path/'payloads.jsonl';path.write_text(json.dumps(staged)+'\n')
    args=Namespace(payloads=str(path),apply=False,max_documents=None,approved_sha256=None)
    assert P.run(args)['documents']==1
    class Stub:
        def __init__(self):
            self.live={'usermetadata':{'classifications':[{'labelset':'chamber','label':'representatives'},
                {'labelset':'kind','label':'speech'},{'labelset':'source','label':'zenodo'},
                {'labelset':'topic','label':'housing'}],'custom':'retain'},
                'extra':{'metadata':{'speech_id':41,'date':'2009-02-03','summary':'Existing summary','other':'retain'}}}
            self.patches=[]
            if native_response:
                self.native_labels()
        def native_labels(self):
            for label in self.live['usermetadata']['classifications']:
                label.setdefault('cancelled_by_user', False)
            self.live['usermetadata']['classifications'].reverse()
        def get(self,slug):
            assert slug=='speech-41'
            return self.live
        def patch(self,slug,body):
            assert set(body)=={'usermetadata','extra'}
            self.patches.append(body);self.live.update(body)
            if native_response:
                self.native_labels()
    stub=Stub();args.apply=True
    monkeypatch.delenv('OPAX_PUBLISH_FEDERATION')
    with pytest.raises(ValueError,match='OFF'):P.run(args,stub)
    monkeypatch.setenv('OPAX_PUBLISH_FEDERATION','1')
    with pytest.raises(ValueError,match='digest'):P.run(args,stub)
    args.approved_sha256=R.file_digest(path)
    with pytest.raises(ValueError,match='budget'):P.run(args,stub)
    assert not stub.patches
    args.max_documents=1
    assert P.run(args,stub)['patched']==1
    assert stub.live['extra']['metadata']['summary']=='Existing summary'
    assert ('topic','housing') in P.active_label_pairs(stub.live['usermetadata']['classifications'])
    assert P.run(args,stub)['unchanged']==1
    assert len(stub.patches)==1
    stub.live['extra']['metadata']['date']='2010-02-03'
    with pytest.raises(ValueError,match='identity or date'): P.run(args,stub)
    assert len(stub.patches)==1


def test_cancelled_labels_neither_approve_provenance_nor_force_replay(db,membership,monkeypatch):
    turn=add(db);plan=R.measure(db,[turn],set(),defaultdict(Counter))
    R.apply_plan(db,plan,1,membership)
    monkeypatch.setenv('OPAX_PUBLISH_FEDERATION','1')
    staged=S.map_speech(db.execute('SELECT * FROM speeches').fetchone())
    live=json.loads(json.dumps(staged))
    labels=live['usermetadata']['classifications']
    for label in labels:
        label['cancelled_by_user']=False
    labels.extend([{'labelset':'chamber','label':'senate','cancelled_by_user':True},
                   {'labelset':'party','label':'Old party','cancelled_by_user':True}])
    assert P.metadata_patch(live,staged) is None
    for labelset in ('kind','source'):
        label=next(c for c in labels if c['labelset']==labelset)
        label['cancelled_by_user']=True
        with pytest.raises(ValueError,match='provenance'):
            P.metadata_patch(live,staged)
        label['cancelled_by_user']=False
