"""Offline regression checks for the nightly catch-up and durable coverage alarm."""
import json
import os
import subprocess
import sys
from pathlib import Path
import sqlite3

import pytest

from parli.ingest import senate_backfill as B, federal_backfill as F, openaustralia_xml as X
from parli.ingest import arag_sync as S, senate_backfill_policy as policy
from parli.ingest import backfill_guard as G
from parli.ingest.honest_http import BudgetSpent, HonestHTTP, Refused
from scripts.federal_hansard_coverage import alerts, measure, update_backfill_progress
from scripts import vote_parties as P
from test_federal_backfill import args


@pytest.fixture(autouse=True)
def isolated_source_receipts(tmp_path, monkeypatch):
    monkeypatch.setenv('OPAX_SOURCE_STATUS_FILE', str(tmp_path / 'source-access.json'))
    monkeypatch.setenv('OPAX_BACKFILL_STATE_DIR', str(tmp_path / 'pipeline'))
    class KB:
        def counters(self):
            return {'index_size': 1000, 'resources': 10}
    monkeypatch.setattr(B, 'guard_client', KB)


def fixture(tmp_path, monkeypatch, days=('2014-02-11', '2018-02-12', '2019-02-12')):
    a = args(tmp_path)
    manifest = tmp_path / 'manifest.json'
    source = Path(a.cache_dir) / 'raw/senate_debates/2019-02-12.xml'
    raw = source.read_bytes()
    for day in days:
        (source.parent / f'{day}.xml').write_bytes(raw.replace(b'2019-02-12', day.encode()))
    manifest.write_text(json.dumps({'version': 1, 'days': [{'chamber': 'senate', 'date': day,
        'url': f'{X.BASE}/scrapedxml/senate_debates/{day}.xml'} for day in days]}))
    monkeypatch.setattr(P, 'load_evidence', lambda **k: P.Evidence())
    monkeypatch.setattr(F, 'assert_enrichment_cap_ready', lambda: None)
    return a, manifest


def run(a, manifest, **kwargs):
    return B.run(a.db, a.stage, manifest=manifest, cache=a.cache_dir, offline=True, **kwargs)


def test_expanded_bounds_chamber_selection_and_source_manifest(tmp_path):
    a = args(tmp_path)
    a.start, a.end, a.chamber = '2014-01-01', '2018-12-31', ['senate']
    raw = Path(a.cache_dir) / 'raw/senate_debates'
    body = (raw / '2019-02-12.xml').read_bytes().replace(b'2019-02-12', b'2014-02-11')
    body = body.replace(b'</debates>', b'<speech id="unresolved" speakerid="unknown" speakername="Unknown"><p>' +
                        b'An unresolved speaker must remain held. ' * 10 + b'</p></speech></debates>')
    (raw / '2014-02-11.xml').write_bytes(body)
    result = F.run(a)
    assert result['selected_missing_days'] == 1 and result['new_documents'] == 2
    assert sum(i['reason'] == 'unresolved-speaker' for i in json.loads((Path(a.stage) / 'identity-issues.json').read_text())) == 1
    manifest = F.source_days(B.MANIFEST, ['senate'], B.START, B.END)
    assert set(manifest) == {'senate'}
    assert len(manifest['senate']) == 284
    assert all(any(d.startswith(str(year)) for d in manifest['senate']) for year in range(2014, 2020))


def test_backfill_cli_defaults_include_2014(monkeypatch):
    captured = []
    monkeypatch.setattr(F, 'run', lambda args: captured.append((args.start, args.end)) or {})
    monkeypatch.setattr('sys.argv', ['openaustralia_xml', '--backfill-missing-days', '--offline'])
    X.main()
    assert captured == [('2014-01-01', '2025-12-31')]


def test_stage_cli_is_on_by_default_with_one_off_switch(monkeypatch):
    monkeypatch.setenv('OPAX_SENATE_BACKFILL', '0')
    monkeypatch.setattr('sys.argv', ['senate_backfill', '--db', '/unused', '--stage', '/unused'])
    monkeypatch.setattr(B, 'run', lambda *a, **kw: pytest.fail('disabled CLI must not acquire or insert'))
    B.main()
    calls = []
    monkeypatch.delenv('OPAX_SENATE_BACKFILL', raising=False)
    monkeypatch.setattr(B, 'run', lambda *a, **kw: calls.append(kw))
    B.main()
    assert calls[0]['max_days'] == 10 and calls[0]['budget'] == 1200


def test_disabled_sync_holds_old_queued_ids_and_releases_them_after_checkpoint(tmp_path, monkeypatch):
    a, manifest = fixture(tmp_path, monkeypatch, ('2014-02-11',))
    run(a, manifest)
    monkeypatch.setenv('OPAX_SENATE_BACKFILL', '0')
    monkeypatch.setattr(S, 'STATE_PATH', tmp_path / 'sync-state.json')
    created = []
    class KB:
        def counters(self):
            return {'index_size': 1000, 'resources': 10}
        def create_resource(self, body):
            created.append(body['slug'])
    with sqlite3.connect(a.db) as db:
        db.row_factory = sqlite3.Row
        ordinary = db.execute("INSERT INTO speeches(date,chamber,speaker_name,text,source) "
            "VALUES ('2026-10-29','representatives','Ordinary Member',?,'openaustralia')",
            ('An ordinary new parliamentary contribution about public transport. ' * 10,)).lastrowid
        db.commit()
        S.prepare_dedupe(db, B.START)
        state = {'tables': {}}
        def sync(limit=100):
            S.sync_table(KB(), db, 'speeches', S.TABLES['speeches'], state, limit, False, B.START)
        sync()
        assert created == [f'speech-{ordinary}']
        held = state['tables']['speeches']['failed']
        assert len(held) == 2 and set(held.values()) == {G.HOLD + 'senate disabled'}
        assert state['tables']['speeches']['after'] == ordinary
        assert measure(db, sync_state=state)['backfill_pending_days_by_year']['2014'] == 63
        S.retry_failed(KB(), db, state)
        assert created == [f'speech-{ordinary}']
        # Restart after the ordinary checkpoint has passed both held IDs.
        state = S.load_state()
        monkeypatch.setenv('OPAX_SENATE_BACKFILL', '1')
        sync(limit=1)
        assert len(created) == 2 and len(state['tables']['speeches']['failed']) == 1
        sync()
        assert len(created) == 3 and len(set(created)) == 3
        assert not state['tables']['speeches']['failed']
        assert state['tables']['speeches']['after'] == ordinary
        sync()
        assert len(created) == 3


def test_cap_resume_and_second_run_adds_zero(tmp_path, monkeypatch):
    a, manifest = fixture(tmp_path, monkeypatch)
    first = run(a, manifest, max_days=2)
    assert len(first['days']) == 2 and first['stop'] == 'day-cap' and first['days_left'] == 1
    assert first['added'] == 8
    second = run(a, manifest, max_days=2)
    assert len(second['days']) == 1 and second['days_left'] == 0
    with X.read_only(a.db) as db:
        rows = db.execute('SELECT speech_id,text,gid FROM speeches ORDER BY speech_id').fetchall()
    third = run(a, manifest)
    assert third['added'] == 0 and third['days'] == []
    with X.read_only(a.db) as db:
        assert db.execute('SELECT speech_id,text,gid FROM speeches ORDER BY speech_id').fetchall() == rows
    assert first['kb_writes'] == first['d1_writes'] == 0


def test_budget_stops_before_first_fetch_and_resumes(tmp_path, monkeypatch):
    a, manifest = fixture(tmp_path, monkeypatch)
    original = F.Archive.get
    monkeypatch.setattr(F.Archive, 'get', lambda *a: pytest.fail('budget must stop before fetching a day'))
    receipt = run(a, manifest, budget=0.01)
    assert receipt['stop'] == 'time-budget' and receipt['added'] == 0
    with X.read_only(a.db) as db:
        assert 2014 in measure(db, through_year=2025)['empty_senate_years']
    monkeypatch.setattr(F.Archive, 'get', original)
    assert run(a, manifest, max_days=1)['added'] == 4


def test_enrichment_readiness_does_not_hold_acquisition_or_sync(tmp_path, monkeypatch):
    a, manifest = fixture(tmp_path, monkeypatch)
    monkeypatch.setattr(F, 'assert_enrichment_cap_ready', lambda: pytest.fail('enrichment must be asynchronous'))
    receipt = run(a, manifest)
    assert receipt['added'] > 0
    with X.read_only(a.db) as db:
        db.row_factory = sqlite3.Row
        body = S.map_speech(db.execute('SELECT * FROM speeches WHERE enrichment_run_id IS NOT NULL').fetchone())
    assert body['extra']['metadata']['enrichment_budget'] == {'run_id': G.ORIGIN, 'max_usd': 30}
    assert {'labelset': 'origin', 'label': 'backfill-2026-11'} in body['usermetadata']['classifications']


def test_budget_accounts_for_publication_and_stops_between_days(tmp_path, monkeypatch):
    a, manifest = fixture(tmp_path, monkeypatch)
    # A fake monotonic clock simulates a slow first insertion. Its committed
    # day survives, and no second day enters the loader on this invocation.
    clock = [0]
    monkeypatch.setattr(B.time, 'monotonic', lambda: clock[0])
    load = B.load_modern_jsonl
    def slow_load(*args, **kwargs):
        result = load(*args, **kwargs)
        clock[0] += 90
        return result
    monkeypatch.setattr(B, 'load_modern_jsonl', slow_load)
    report = run(a, manifest, budget=240)
    assert len(report['days']) == 1 and report['stop'] == 'time-budget'
    assert report['publish_allowance_seconds'] > 0
    assert report['sync_preparation_allowance_seconds'] == 120


def test_publication_budget_uses_measured_normal_sync_rate(tmp_path, monkeypatch):
    a, manifest = fixture(tmp_path, monkeypatch, ('2014-02-11',))
    evidence = json.loads(Path('docs/reports/2026-11-14-senate-sync-evidence.json').read_text())
    bulk = evidence['normal_sync_runs'][0]
    assert bulk['workers'] == 10
    assert B.PUBLISH_DOCS_PER_SECOND == int(bulk['speech_acknowledgements'] / bulk['sync_seconds'] * 10) / 10
    report = run(a, manifest)
    assert report['publish_docs_per_second'] == 8.9
    assert report['publish_rate_source'] == bulk['id']
    parsed = next((Path(a.stage) / 'modern').glob('*/*.jsonl'))
    long_turns = sum(len(json.loads(line)['text']) >= 200 for line in parsed.read_text().splitlines())
    assert report['publish_allowance_seconds'] == long_turns / 8.9


def test_ten_day_cap_still_obeys_budget_and_resumes(tmp_path, monkeypatch):
    days = tuple(f'2014-02-{day:02d}' for day in range(1, 12))
    a, manifest = fixture(tmp_path, monkeypatch, days)
    clock = [0]
    monkeypatch.setattr(B.time, 'monotonic', lambda: clock[0])
    load = B.load_modern_jsonl
    def slow_load(*args, **kwargs):
        result = load(*args, **kwargs)
        clock[0] += 100
        return result
    monkeypatch.setattr(B, 'load_modern_jsonl', slow_load)
    report = run(a, manifest, max_days=10, budget=450)
    assert len(report['days']) == 3 and report['stop'] == 'time-budget'
    assert report['days_left'] == 8
    monkeypatch.setattr(B, 'load_modern_jsonl', load)
    assert len(run(a, manifest, max_days=10)['days']) == 8
    assert run(a, manifest, max_days=10)['added'] == 0


def test_loader_budget_interrupt_rolls_back_and_preserves_publication_reserve(tmp_path, monkeypatch):
    a, manifest = fixture(tmp_path, monkeypatch)
    clock = [0]
    monkeypatch.setattr(B.time, 'monotonic', lambda: clock[0])
    def slow_load(db, *args, **kwargs):
        clock[0] = 1100
        db.execute('WITH RECURSIVE x(n) AS (VALUES(0) UNION ALL SELECT n+1 FROM x WHERE n<10000) SELECT SUM(n) FROM x').fetchone()
        pytest.fail('SQLite should interrupt at the deadline minus publication reserves')
    monkeypatch.setattr(B, 'load_modern_jsonl', slow_load)
    report = run(a, manifest)
    assert report['stop'] == 'time-budget' and report['added'] == 0
    with X.read_only(a.db) as db:
        assert db.execute('SELECT COUNT(*) FROM speeches').fetchone()[0] == 1


def test_refusal_stops_without_trying_another_day(tmp_path, monkeypatch):
    a, manifest = fixture(tmp_path, monkeypatch)
    calls = []
    def refuse(self, relative):
        calls.append(relative)
        raise Refused('fixture refusal', X.BASE)
    monkeypatch.setattr(F.Archive, 'get', refuse)
    with pytest.raises(Refused):
        run(a, manifest)
    assert len(calls) == 1
    assert json.loads((Path(a.stage) / 'report.json').read_text())['stop'] == 'source-refused'
    with pytest.raises(X.source_http.SourceRefused):
        run(a, manifest)
    assert len(calls) == 1


def test_unknown_speakers_are_held_and_occupied_other_source_is_untouched(tmp_path, monkeypatch):
    a, manifest = fixture(tmp_path, monkeypatch, ('2014-02-11', '2018-02-12'))
    raw = Path(a.cache_dir) / 'raw/senate_debates/2018-02-12.xml'
    raw.write_text(raw.read_text().replace('</debates>',
        '<speech id="unknown-fixture" speakerid="unknown" speakername="Unknown"><p>' +
        'An unresolved contribution requiring identity review. ' * 8 + '</p></speech></debates>'))
    with sqlite3.connect(a.db) as db:
        db.execute("INSERT INTO speeches(date,chamber,text,source) VALUES ('2014-02-11','senate','Permanent held citation','zenodo')")
    report = run(a, manifest)
    assert report['occupied_days_held'] == 1 and len(report['days']) == 1
    assert report['days'][0]['identity_held'] == 2
    with X.read_only(a.db) as db:
        assert db.execute("SELECT text FROM speeches WHERE date='2014-02-11'").fetchall() == [('Permanent held citation',)]
        assert db.execute("SELECT COUNT(*) FROM speeches WHERE gid='unknown-fixture'").fetchone()[0] == 0


@pytest.mark.parametrize('cap,budget', [(0, 1200), (-1, 1200), (2, 0), (2, 1201), (2, float('nan'))])
def test_invalid_caps_and_budgets_reject(cap, budget):
    with pytest.raises(ValueError):
        B.configuration(cap, budget)


def test_dated_parties_rename_hold_and_own_chamber():
    class People:
        def resolve(self, *args):
            return {'person_id': '101', 'speaker': 'Alex Example', 'party': 'Centre Alliance'}
    evidence = P.Evidence([P.entry('handbook-term', ('federal', 'senate'), ('handbook', '101'),
        ['Alex Example'], 'Centre Alliance', '2014-01-01', '2019-01-01', pids=['101'])],
        renames=P.read_renames([{'evidence': ['fixture'], 'names': [
            {'name': 'Nick Xenophon Team'}, {'from': '2018-04-10', 'name': 'Centre Alliance'}]}]))
    people = B.DatedPeople(People(), evidence)
    assert people.resolve('o', 'Alex Example', 'senate', '2018-04-09')['party'] == 'Nick Xenophon Team'
    assert people.resolve('o', 'Alex Example', 'senate', '2018-04-10')['party'] == 'Centre Alliance'
    evidence.holds = [{'chamber': ('federal', 'senate'), 'pid': '101',
                       'windows': [('2018-01-01', '2019-01-01')], 'reason': 'fixture hold'}]
    held = people.resolve('o', 'Alex Example', 'senate', '2018-04-10')
    assert held['party'] == '' and held['source_party'] == 'Centre Alliance'
    class Chair:
        def resolve(self, *args):
            return {'person_id': '101', 'speaker': 'Alex Example', 'party': 'President'}
    assert B.DatedPeople(Chair(), evidence).resolve('o', 'Alex Example', 'senate', '2018-04-10')['party'] == 'President'
    ambiguous = P.Evidence([P.entry('handbook-term', ('federal', 'senate'), ('handbook', key),
        ['Alex Example'], party, '2014-01-01', '2019-01-01', pids=['101'])
        for key, party in [('first', 'Labor'), ('second', 'Liberal')]])
    assert B.DatedPeople(People(), ambiguous).resolve('o', 'Alex Example', 'senate', '2018-04-10')['party'] == ''


def test_coverage_guard_survives_recent_rows_and_pending_publication(tmp_path, monkeypatch):
    a, manifest = fixture(tmp_path, monkeypatch, ('2014-02-11',))
    run(a, manifest)
    with X.read_only(a.db) as db:
        coverage = measure(db, through_year=2025)
        assert 'Senate Hansard has zero stored rows for 2018' in alerts(coverage)
        assert 2014 not in coverage['empty_senate_years']
        assert 2014 in coverage['unpublished_senate_years']
        checkpoint = db.execute('SELECT MAX(speech_id) FROM speeches').fetchone()[0]
        ready = measure(db, through_year=2025, sync_state={'tables': {'speeches': {'after': checkpoint}}})
        assert 2014 not in ready['unpublished_senate_years']
        assert ready['backfill_pending_days_by_year']['2014'] == 62
        assert coverage['backfill_pending_days_by_year']['2014'] == 63
        failed = measure(db, through_year=2025, sync_state={'tables': {'speeches': {
            'after': checkpoint, 'failed': {f'speech-{sid}': 'fixture' for sid in range(42, checkpoint+1)}}}})
        assert 2014 in failed['unpublished_senate_years']


def test_source_transport_deadline_and_origin(monkeypatch):
    http = HonestHTTP(deadline=10, user_agent='opax-improve-audit', allowed_origin=X.BASE)
    monkeypatch.setattr(B.time, 'monotonic', lambda: 10)
    with pytest.raises(BudgetSpent):
        http.pause(0)
    with pytest.raises(Refused, match='permitted source'):
        http.get('https://example.test/source')


def test_audit_identity_is_source_specific_and_default_transport_stays_identified():
    from parli.ingest import http
    assert http.Request(X.BASE + '/robots.txt', audit=True).get_header('User-agent') == 'opax-improve-audit'
    assert http.Request('https://example.test/').get_header('User-agent') == http.USER_AGENT
    with pytest.raises(ValueError, match='OpenAustralia'):
        http.Request('https://example.test/', audit=True)


def test_nightly_wires_stage_after_normal_refresh_and_before_coverage():
    shell = Path('scripts/daily_refresh.sh').read_text()
    assert shell.index('run_step arag_sync') < shell.index('run_step senate_backfill') < shell.index('run_step federal_coverage')
    assert 'nice -n 10 "$PY" -m parli.ingest.senate_backfill' in shell
    assert 'federal source refused during normal refresh' in shell
    assert '${OPAX_SENATE_BACKFILL:-1}' in shell
    assert 'BACKFILL_STEPS=",senate_backfill,nsw_backfill,nsw_hansard_backfill,federal_coverage,"' in shell
    assert B.DEFAULT_DAYS == 10 and B.DEFAULT_BUDGET == 1200


def test_larger_stage_cap_checks_counters_every_ten_days_and_keeps_idempotence(tmp_path, monkeypatch):
    days = tuple(f'2014-02-{d:02d}' for d in range(1, 22))
    a, manifest = fixture(tmp_path, monkeypatch, days)
    kb = GuardKB()
    monkeypatch.setattr(B, 'guard_client', lambda: kb)
    result = run(a, manifest, max_days=21)
    assert len(result['days']) == 21 and result['days_left'] == 0
    assert kb.gets == 4 and kb.created == []
    assert run(a, manifest, max_days=21)['added'] == 0


def test_shared_stop_blocks_stage_before_database_or_source_access(monkeypatch):
    root = G.state_dir()
    root.mkdir(parents=True)
    (root / 'backfill.STOP').touch()
    monkeypatch.setattr(B, 'guard_client', lambda: pytest.fail('no request while stopped'))
    with pytest.raises(G.Stopped):
        B.run('/unused', '/unused')


def test_midrun_growth_stop_commits_ten_days_and_never_attempts_the_eleventh(tmp_path, monkeypatch):
    days = tuple(f'2014-02-{d:02d}' for d in range(1, 13))
    a, manifest = fixture(tmp_path, monkeypatch, days)
    class Growing(GuardKB):
        def counters(self):
            if self.gets:
                self.size += 6_000_000_000
                self.resources += 150_000
            return super().counters()
    kb = Growing()
    monkeypatch.setattr(B, 'guard_client', lambda: kb)
    with pytest.raises(G.Stopped):
        run(a, manifest, max_days=12)
    report = json.loads((Path(a.stage) / 'report.json').read_text())
    assert report['stop'] == 'growth-guard' and len(report['days']) == 10
    assert report['days_left'] == 2 and kb.gets == 2 and not kb.created
    with pytest.raises(G.Stopped):
        run(a, manifest, max_days=12)
    assert kb.gets == 2


@pytest.mark.parametrize('stage', ['senate_backfill', 'nsw_backfill', 'nsw_hansard_backfill'])
@pytest.mark.parametrize('rc', [1, 124, 137])
def test_both_stage_names_keep_errors_and_timeouts_out_of_periodic_failures(tmp_path, stage, rc):
    config = next(line for line in Path('scripts/daily_refresh.sh').read_text().splitlines()
                  if line.startswith('BACKFILL_STEPS='))
    program = '''PIPE="$TASK_STATE"
LOG="$PIPE/refresh.log"
PY="$TASK_PYTHON"
ALLOW_FAIL=,
''' + config + '''
. scripts/lib/refresh_lib.sh
run_step "$TASK_STAGE" '' sh -c "exit $TASK_RC"
result=$?
[[ "$result" = "$TASK_RC" && ${#FAILED_STEPS[@]} = 0 && ${#BACKFILL_FAILURES[@]} = 1 ]]
'''
    result = subprocess.run(['bash', '-c', program], text=True, capture_output=True,
                            env={**os.environ, 'TASK_STATE': str(tmp_path), 'TASK_PYTHON': sys.executable,
                                 'TASK_STAGE': stage, 'TASK_RC': str(rc)})
    assert result.returncode == 0, result.stdout + result.stderr
    assert f'{stage}] WARNING(rc={rc}' in result.stdout


class GuardKB:
    def __init__(self):
        self.size, self.resources, self.gets, self.created = 1_000_000, 1000, 0, []

    def counters(self):
        self.gets += 1
        return {'index_size': self.size, 'resources': self.resources}


def test_coverage_supplies_queued_days_without_senate_logic_in_shared_guard():
    guard = G.Guard()
    guard.progress('senate', remaining=0, cap=10, stop='complete', done=10,
                   acquisition_days_remaining=0)
    guard.progress('nsw', remaining=4, cap=4, stop='cap', done=4)
    update_backfill_progress({'backfill_pending_days_by_year': {'2018': 10}})
    report = G.status(guard.root, '2026-11-14')
    assert report['stages']['senate']['days_remaining'] == 10
    assert report['stages']['senate']['acquisition_days_remaining'] == 0
    assert report['stages']['senate']['projected_finish_date'] == '2026-11-15'
    assert report['stages']['nsw']['days_remaining'] == 4
    update_backfill_progress({'backfill_pending_days_by_year': {}})
    assert G.status(guard.root, '2026-11-15')['stages']['senate']['projected_finish_date'] == '2026-11-15'
