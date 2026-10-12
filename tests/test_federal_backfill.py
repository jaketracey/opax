"""Invented members, offline XML, separate SQLite files and a stub KB only."""
from argparse import Namespace
import hashlib
import json
from pathlib import Path
import sqlite3

import pytest

from parli.ingest import federal_backfill as B, openaustralia_xml as X, arag_sync as S
from parli.ingest.speeches import load_modern_jsonl

FIXTURES = Path(__file__).parent / 'fixtures/openaustralia'


def source(path):
    db = sqlite3.connect(path)
    db.executescript('''
        CREATE TABLE members (person_id TEXT PRIMARY KEY, full_name TEXT, first_name TEXT, last_name TEXT,
          chamber TEXT, entered_house TEXT, left_house TEXT);
        INSERT INTO members VALUES ('101','Alex Example','Alex','Example','senate','2000-01-01',NULL);
        INSERT INTO members VALUES ('102','Sam Fixture','Sam','Fixture','senate','2000-01-01',NULL);
        CREATE TABLE speeches (speech_id INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT,
          speaker_name TEXT, party TEXT, electorate TEXT, chamber TEXT, date TEXT NOT NULL,
          topic TEXT, text TEXT, word_count INT, source TEXT, state TEXT DEFAULT 'federal');
        INSERT INTO speeches (speech_id,person_id,speaker_name,party,chamber,date,text,source)
          VALUES (41,'101','Alex Example','Labor','senate','2024-02-06','An existing permanent citation','openaustralia');
    ''')
    db.commit(); db.close()


def args(tmp_path):
    original = tmp_path / 'source.sqlite'
    source(original)
    cache = tmp_path / 'cache'
    cache.mkdir()
    for f in ('people.xml', 'senators.xml'):
        (cache / f).write_bytes((FIXTURES / f).read_bytes())
    (cache / 'representatives.xml').write_text('<members/>')
    raw = cache / 'raw/senate_debates'
    raw.mkdir(parents=True)
    fixture = (FIXTURES / 'backfill.xml').read_bytes()
    (raw / '2019-02-12.xml').write_bytes(fixture)
    (raw / '2024-02-06.xml').write_bytes(fixture.replace(b'2019-02-12', b'2024-02-06'))
    return Namespace(db=str(original), start='2019-01-01', end='2025-12-31', max_days=1000,
        stage=str(tmp_path/'stage'), cache_dir=str(cache), offline=True, staging_db=None,
        apply=False, sync_kb=False, sync_state=None, modern_dir=None, load_divisions=False,
        ingest_docs_per_second=5)


def test_discovery_zero_rows_only_all_sources_and_chambers(tmp_path):
    a = args(tmp_path)
    with X.read_only(a.db) as db:
        db2 = sqlite3.connect(a.db)
        db2.execute("INSERT INTO speeches (speech_id,date,chamber,text,source) VALUES (42,'2020-01-01','representatives','one row','zenodo')")
        db2.commit(); db2.close()
        available = {'senate':['2018-12-31','2019-02-12','2024-02-06','2026-01-01'],
                     'representatives':['2020-01-01','2020-01-02']}
        missing, held, total = B.discover_days(db, available, a.start, a.end, 1)
    assert total == 2 and len(missing) == 1
    assert {(i['chamber'],i['date']) for i in held} == {('representatives','2020-01-01'),('senate','2024-02-06')}


def test_dry_run_backup_identity_roles_exclusions_provenance_and_partial_list(tmp_path):
    a = args(tmp_path)
    before = hashlib.sha256(Path(a.db).read_bytes()).hexdigest()
    receipt = B.run(a)
    assert hashlib.sha256(Path(a.db).read_bytes()).hexdigest() == before
    assert receipt['dry_run'] and receipt['kb_writes'] == receipt['enrichment_queued'] == 0
    assert receipt['selected_missing_days'] == 1 and receipt['new_documents'] == 2
    assert receipt['needs_summaries'] == receipt['needs_topic_labels'] == 2
    stage = Path(a.stage)
    report = json.loads((stage/'report.json').read_text())
    counts = next(c for c in report['counts'] if (c['year'],c['chamber']) == ('2019','senate'))
    assert counts['identity_failures_parser'] == 1
    assert counts['excluded_loader_short'] == 1
    assert counts['excluded_kb_short'] == 1 and counts['excluded_kb_procedural'] == 1
    with sqlite3.connect(stage/'staging.sqlite') as db:
        assert db.execute('SELECT text FROM speeches WHERE speech_id=41').fetchone()[0] == 'An existing permanent citation'
        assert db.execute("SELECT COUNT(*) FROM speeches WHERE date='2024-02-06'").fetchone()[0] == 1
        chair = db.execute("SELECT speaker_type,chair_role,party FROM speeches WHERE speaker_type='chair'").fetchone()
        assert chair == ('chair','President','President')
    documents = [json.loads(l) for l in (stage/'kb-payloads.jsonl').read_text().splitlines()]
    first = documents[0]
    assert 'accessibility of stations' not in first['texts']['body']['body']
    assert first['extra']['metadata']['person_id'] == '101'
    assert first['extra']['metadata']['gid'].endswith('2019-02-12.1.1')
    assert first['extra']['metadata']['source_url'].startswith('https://parlinfo.aph.gov.au/')
    assert 'Commonwealth' in first['extra']['metadata']['source_attribution']
    partials = json.loads((stage/'partial-days.json').read_text())
    assert partials[0]['date'] == '2024-02-06' and partials[0]['eligible_xml_unmatched'] == 2


def test_missing_only_loader_recheck_keeps_citations_and_is_idempotent(tmp_path):
    a = args(tmp_path)
    B.run(a)
    stage = Path(a.stage)
    modern = next((stage/'modern').iterdir())
    # Simulate an occupied day appearing after discovery, and a rerun of an already loaded day.
    (modern/'2024-02-06_senate.jsonl').write_text(json.dumps({'date':'2024-02-06','chamber':'senate',
        'speaker':'Alex Example','person_id':'101','text':'Additional content '*30,'gid':'new-on-partial'})+'\n')
    with sqlite3.connect(stage/'staging.sqlite') as db:
        before = db.execute('SELECT speech_id,text FROM speeches ORDER BY speech_id').fetchall()
        provenance = db.execute('SELECT * FROM oa_speech_provenance ORDER BY gid').fetchall()
        report = []
        assert load_modern_jsonl(db, set(), modern_dir=modern, missing_days_only=True, report=report) == 0
        assert db.execute('SELECT speech_id,text FROM speeches ORDER BY speech_id').fetchall() == before
        assert db.execute('SELECT * FROM oa_speech_provenance ORDER BY gid').fetchall() == provenance
        assert all(r['held'] == 'occupied-day' for r in report)


@pytest.mark.parametrize('changes', [dict(start='2018-01-01'),dict(end='2026-01-01'),
    dict(max_days=0),dict(sync_kb=True),dict(modern_dir='nightly-cache'),dict(load_divisions=True),
    dict(staging_db='SOURCE')])
def test_invalid_modes_reject_before_fetch_or_database_write(tmp_path, changes):
    a = args(tmp_path)
    if changes.get('staging_db') == 'SOURCE': changes['staging_db'] = a.db
    for key,value in changes.items(): setattr(a,key,value)
    before = Path(a.db).read_bytes()
    with pytest.raises(ValueError): B.run(a)
    assert Path(a.db).read_bytes() == before


def test_cached_archive_uses_no_http_and_offline_missing_file_fails(tmp_path, monkeypatch):
    a = args(tmp_path)
    archive = B.Archive(a.stage, a.cache_dir, True)
    monkeypatch.setattr(archive.http, 'get', lambda *a,**k: pytest.fail('cache should not fetch'))
    assert archive.get('raw/senate_debates/2019-02-12.xml').startswith(b'<debates>')
    with pytest.raises(B.Unavailable): archive.get('raw/senate_debates/2019-02-13.xml')


def test_bounded_checkpoint_sync_retries_and_resumes_without_outside_rows(tmp_path, monkeypatch):
    import parli.arag as A
    monkeypatch.setattr(B,'assert_kb_owner',lambda:None)
    a = args(tmp_path)
    B.run(a)
    stage = Path(a.stage)
    target = stage/'staging.sqlite'
    docs = [json.loads(l) for l in (stage/'kb-payloads.jsonl').read_text().splitlines()]
    ids = [d['extra']['metadata']['speech_id'] for d in docs]
    attempted = []
    class KB:
        def create_resource(self, body):
            attempted.append(body['slug'])
            if len(attempted) == 1:
                raise A.AragError(503,'fixture','try later')
    monkeypatch.setattr(A, 'load_dotenv', lambda *a:None)
    monkeypatch.setattr(A.AragConfig, 'from_env', lambda: Namespace(kb_configured=True))
    monkeypatch.setattr(A, 'KbClient', lambda cfg:KB())
    state = stage/'checkpoint.json'
    nightly_before = S.STATE_PATH
    with pytest.raises(ValueError, match='failures retained'):
        B.push(target, ids, state, a.start, a.end)
    assert S.STATE_PATH == nightly_before
    B.push(target, [], state, a.start, a.end)
    checkpoint = json.loads(state.read_text())
    assert checkpoint['tables']['speeches']['failed'] == {}
    assert checkpoint['backfill']['speech_ids'] == ids
    assert len(attempted) == 3 and set(attempted) == {d['slug'] for d in docs}
    B.push(target, [], state, a.start, a.end)
    assert len(attempted) == 3


def test_checkpoint_recovers_interrupted_load_from_source_gids(tmp_path, monkeypatch):
    import parli.arag as A
    monkeypatch.setattr(B,'assert_kb_owner',lambda:None)
    a = args(tmp_path)
    B.run(a)
    stage = Path(a.stage)
    target = stage/'staging.sqlite'
    documents = [json.loads(l) for l in (stage/'kb-payloads.jsonl').read_text().splitlines()]
    gids = [d['extra']['metadata']['gid'] for d in documents]
    state = stage/'scope-only.json'
    B.checkpoint_scope(target, state, a.start, a.end, gids)
    # No saved row IDs: emulate termination after loader commit, before report/sync.
    captured = []
    class KB:
        def create_resource(self, body): captured.append(body['slug'])
    monkeypatch.setattr(A,'load_dotenv',lambda *a:None)
    monkeypatch.setattr(A.AragConfig,'from_env',lambda:Namespace(kb_configured=True))
    monkeypatch.setattr(A,'KbClient',lambda cfg:KB())
    B.push(target, [], state, a.start, a.end)
    assert captured == [d['slug'] for d in documents]


def test_apply_requires_separate_checkpoint_and_rejects_unrelated_one_before_db_mutation(tmp_path):
    a = args(tmp_path)
    a.apply = True
    before = Path(a.db).read_bytes()
    with pytest.raises(ValueError, match='dedicated'): B.run(a)
    a.sync_state = str(tmp_path/'old-checkpoint.json')
    Path(a.sync_state).write_text(json.dumps({'tables':{'speeches':{'after':41}}}))
    with pytest.raises(ValueError, match='no backfill scope'): B.run(a)
    assert Path(a.db).read_bytes() == before


def test_apply_only_on_invented_fixture_records_scope_and_skips_partial_day(tmp_path):
    a = args(tmp_path)
    a.apply = True
    a.sync_state = str(tmp_path/'apply-state.json')
    result = B.run(a)
    assert result['new_documents'] == 2 and result['kb_writes'] == 0
    state = json.loads(Path(a.sync_state).read_text())
    assert len(state['backfill']['scope_gids']) == 5
    with X.read_only(a.db) as db:
        assert db.execute("SELECT COUNT(*) FROM speeches WHERE date='2024-02-06'").fetchone()[0] == 1
        assert db.execute('SELECT text FROM speeches WHERE speech_id=41').fetchone()[0] == 'An existing permanent citation'
    again = B.run(a)
    assert again['selected_missing_days'] == 0 and again['new_documents'] == 0
    assert json.loads(Path(a.sync_state).read_text())['backfill']['scope_gids'] == state['backfill']['scope_gids']


def test_desktop_cutover_refuses_kb_write_before_checkpoint_or_load(tmp_path, monkeypatch):
    a = args(tmp_path)
    marker = tmp_path/'.cache/autoresearch/MIGRATED_TO_VM'
    marker.parent.mkdir(parents=True)
    marker.write_text('fixture cutover')
    monkeypatch.setattr(B.Path,'home',lambda:tmp_path)
    a.apply = a.sync_kb = True
    a.sync_state = str(tmp_path/'state.json')
    before = Path(a.db).read_bytes()
    with pytest.raises(ValueError, match='nightly KB owner'): B.run(a)
    assert Path(a.db).read_bytes() == before and not Path(a.sync_state).exists()
