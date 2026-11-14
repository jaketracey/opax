"""Offline regression checks for the nightly catch-up and durable coverage alarm."""
import json
from pathlib import Path
import sqlite3
import signal

import pytest

from parli.ingest import senate_backfill as B, federal_backfill as F, openaustralia_xml as X
from parli.ingest.honest_http import BudgetSpent, HonestHTTP, Refused
from scripts.federal_hansard_coverage import alerts, measure
from scripts import vote_parties as P
from test_federal_backfill import args


@pytest.fixture(autouse=True)
def isolated_source_receipts(tmp_path, monkeypatch):
    monkeypatch.setenv('OPAX_SOURCE_STATUS_FILE', str(tmp_path / 'source-access.json'))


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


def test_readiness_wait_obeys_stage_budget_and_restores_alarm(tmp_path, monkeypatch):
    a, manifest = fixture(tmp_path, monkeypatch)
    previous = signal.getsignal(signal.SIGALRM)
    monkeypatch.setattr(F, 'assert_enrichment_cap_ready', lambda: signal.raise_signal(signal.SIGALRM))
    receipt = run(a, manifest)
    assert receipt['stop'] == 'time-budget' and receipt['added'] == 0
    assert signal.getsignal(signal.SIGALRM) == previous
    assert signal.getitimer(signal.ITIMER_REAL)[0] == 0


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


@pytest.mark.parametrize('cap,budget', [(0, 1200), (11, 1200), (2, 0), (2, 1201), (2, float('nan'))])
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
    assert B.DEFAULT_DAYS == 2 and B.DEFAULT_BUDGET == 1200
