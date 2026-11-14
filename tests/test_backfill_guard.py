"""Offline spending, shared-state and normal publisher regressions."""
from datetime import datetime
import json
from pathlib import Path

import pytest

from parli import arag
from parli.ingest import arag_sync as S, backfill_guard as G
from parli.ingest import senate_backfill as B
from test_senate_backfill import fixture, run


class KB:
    def __init__(self):
        self.size, self.resources, self.gets, self.created = 1_000_000, 1000, 0, []

    def counters(self):
        self.gets += 1
        return {'index_size': self.size, 'resources': self.resources}

    def create_resource(self, body):
        self.created.append(body)
        self.size += 40_000
        self.resources += 1


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv('OPAX_BACKFILL_STATE_DIR', str(tmp_path / 'pipeline'))
    monkeypatch.setenv('OPAX_SOURCE_STATUS_FILE', str(tmp_path / 'source.json'))
    monkeypatch.delenv('OPAX_SENATE_BACKFILL', raising=False)
    monkeypatch.delenv('OPAX_NSW_BACKFILL', raising=False)


def body(stage='senate', day=1):
    return G.tag({'slug': f'{stage}-{day}', 'extra': {'metadata': {'date': f'2014-02-{day:02d}'}},
                  'usermetadata': {'classifications': [{'labelset': 'chamber', 'label': 'senate'}]}}, stage)


def test_shared_ledger_counts_both_stages_and_does_not_refund_shrinkage():
    kb, senate, nsw = KB(), G.Guard(), G.Guard()
    senate.check(kb, 'senate')
    kb.size += 10_000_000
    kb.resources += 250
    senate.check(kb, 'senate')
    kb.size += 10_000_000
    kb.resources += 250
    data = nsw.check(kb, 'nsw')
    assert data['bytes_added'] == 20_000_000 and data['resources_added'] == 500
    assert [s['stage'] for s in data['observations']] == ['senate', 'senate', 'nsw']
    kb.size -= 4_000_000
    assert nsw.check(kb, 'nsw')['bytes_added'] == 20_000_000
    kb.size += 2_000_000
    assert senate.check(kb, 'senate')['bytes_added'] == 22_000_000


def test_byte_ceiling_stops_even_when_average_is_inside_bound():
    kb, guard = KB(), G.Guard()
    guard.check(kb, 'senate')
    kb.size += G.BYTE_CEILING
    kb.resources += 150_000
    assert guard.check(kb, 'nsw')['bytes_added'] == 5_500_000_000
    kb.size += 1
    with pytest.raises(G.Stopped, match='5.5 GB'):
        guard.check(kb, 'nsw')
    assert (guard.root / 'backfill.STOP').exists()
    assert guard.read()['bytes_added'] == 5_500_000_001
    with pytest.raises(G.Stopped):
        G.Guard().check(kb, 'senate')
    assert kb.gets == 3  # the shared stop prevents even the next GET


def test_per_resource_bound_requires_500_and_uses_exact_decimal_bytes():
    kb, guard = KB(), G.Guard()
    guard.check(kb, 'senate')
    kb.resources += 499
    kb.size += 500 * G.BYTES_PER_RESOURCE
    guard.check(kb, 'senate')  # fewer than 500 samples cannot trip the ratio
    kb.resources += 1
    guard.check(kb, 'nsw')  # equality is permitted
    kb.size += 1
    with pytest.raises(G.Stopped, match='59.3 KB'):
        guard.check(kb, 'nsw')
    assert G.BYTES_PER_RESOURCE == 59_280


@pytest.mark.parametrize('status,detail', [
    (429, '{"detail":{"try_after":99999999999,"back_pressure_type":"index"}}'),
    (403, '{"detail":"quota exceeded"}'), (402, 'payment required'),
    (503, '{"detail":"billing account suspended"}'), (400, 'insufficient credits')])
@pytest.mark.parametrize('method', ['GET', 'POST'])
def test_any_guarded_progress_refusal_stops_without_retry(monkeypatch, status, detail, method):
    calls = []
    class Response:
        ok, status_code, text, headers = False, status, detail, {}
    def request(*args, **kwargs):
        calls.append(kwargs)
        return Response()
    monkeypatch.setattr(arag.requests, 'request', request)
    monkeypatch.setattr(arag.time, 'sleep', lambda *_: pytest.fail('a refusal must not retry'))
    guard = G.Guard()
    with pytest.raises(G.Stopped), guard.request_scope():
        arag._request(method, 'https://example.test/counters', {'secret': 'not persisted'})
    assert len(calls) == 1 and calls[0]['timeout'] == 20
    stop = (guard.root / 'backfill.STOP').read_text()
    assert 'Progress HTTP' in stop and 'secret' not in stop and detail not in stop


def test_ordinary_progress_refusal_stops_repairs_without_reclassifying_ordinary_error(monkeypatch):
    class Response:
        ok, status_code, text, headers = False, 402, 'billing failure', {}
    monkeypatch.setattr(arag.requests, 'request', lambda *a, **kw: Response())
    with pytest.raises(arag.AragError):
        arag._request('POST', 'https://example.test/resources', {}, max_retries=0)
    assert (G.state_dir() / 'backfill.STOP').exists()


def test_counters_unavailable_or_corrupt_ledger_holds_closed():
    class Broken(KB):
        def counters(self):
            return {'resources': 1000}
    with pytest.raises(G.Stopped, match='counters unavailable'):
        G.Guard().check(Broken(), 'senate')


@pytest.mark.parametrize('stage', ['senate', 'nsw'])
def test_switch_and_stop_prevent_normal_publication_but_not_ordinary_rows(stage, monkeypatch):
    kb = KB()
    monkeypatch.setenv(f'OPAX_{stage.upper()}_BACKFILL', '0')
    assert S._push_one(kb, body(stage))[1].startswith(G.HOLD)
    assert kb.gets == 0 and kb.created == []
    monkeypatch.delenv(f'OPAX_{stage.upper()}_BACKFILL')
    (G.state_dir()).mkdir(parents=True, exist_ok=True)
    (G.state_dir() / 'backfill.STOP').touch()
    assert S._push_one(kb, body(stage))[1].startswith(G.HOLD)
    assert kb.created == []
    assert S._push_one(kb, {'slug': 'ordinary'}) == ('ordinary', None)
    assert len(kb.created) == 1


def test_shared_origin_and_worker_cap_are_identical_for_both_repairs():
    for stage in ('senate', 'nsw'):
        b = body(stage)
        G.tag(b, stage)
        assert b['extra']['metadata']['enrichment_budget'] == {'run_id': 'backfill-2026-11', 'max_usd': 30}
        assert b['usermetadata']['classifications'].count({'labelset': 'origin', 'label': G.ORIGIN}) == 1
    assert G.stage_for({'extra': {'metadata': {'nsw_backfill': True}}}) == 'nsw'


def test_larger_publication_run_checks_at_ten_days_and_end_without_a_second_publisher():
    kb, state = KB(), {'failed': {}, 'pushed': 0}
    publication = S.BackfillPublication(kb)
    S._push_batch(kb, [body(day=d) for d in range(1, 22)], state, publication)
    publication.finish()
    assert kb.gets == 4  # before day 1, after 10, after 20, final short group
    assert len(kb.created) == 21 and state['pushed'] == 21 and not state['failed']
    assert G.Guard().read()['resources_added'] == 21


def test_publication_budget_holds_remaining_rows_and_keeps_ordinary_refresh(monkeypatch):
    kb, state, clock = KB(), {'failed': {}, 'pushed': 0}, [0]
    monkeypatch.setattr(S.time, 'monotonic', lambda: clock[0])
    publication = S.BackfillPublication(kb)
    S._push_batch(kb, [body()], state, publication)
    clock[0] = 1201
    S._push_batch(kb, [body(day=2), {'slug': 'ordinary'}], state, publication)
    assert [b['slug'] for b in kb.created] == ['senate-1', 'ordinary']
    assert 'time budget' in state['failed']['senate-2']
    assert not (G.state_dir() / 'backfill.STOP').exists()


def test_publication_checks_budget_within_a_batch_not_only_between_days(monkeypatch):
    kb, state, clock = KB(), {'failed': {}, 'pushed': 0}, [0]
    monkeypatch.setattr(S.time, 'monotonic', lambda: clock[0])
    monkeypatch.setattr(S, 'WORKERS', 1)
    def slow(body):
        kb.created.append(body)
        clock[0] += 1201
    kb.create_resource = slow
    docs = [body() for _ in range(4)]
    for i, doc in enumerate(docs):
        doc['slug'] = f'speech-{i}'
    S._push_batch(kb, docs, state)
    assert len(kb.created) == 1 and len(state['failed']) == 3
    assert all('time budget' in reason for reason in state['failed'].values())


def test_larger_stage_cap_checks_counters_every_ten_days_and_keeps_idempotence(tmp_path, monkeypatch):
    days = tuple(f'2014-02-{d:02d}' for d in range(1, 22))
    a, manifest = fixture(tmp_path, monkeypatch, days)
    kb = KB()
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
    class Growing(KB):
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


def test_nightly_metrics_include_growth_days_and_publication_projection():
    kb, guard = KB(), G.Guard()
    guard.check(kb, 'senate')
    kb.size += 40_000_000
    kb.resources += 1000
    data = guard.check(kb, 'nsw')
    night = next(iter(data['nights']))
    guard.progress('senate', remaining=274, cap=10, stop='day-cap', done=10)
    report = G.status(guard.root, night)
    assert report['bytes_added'] == report['cumulative_bytes_added'] == 40_000_000
    assert report['resources_added'] == report['cumulative_resources_added'] == 1000
    assert report['byte_ceiling'] == 5_500_000_000 and report['days_remaining'] == 274
    assert (datetime.fromisoformat(report['projected_finish_date']) - datetime.fromisoformat(night)).days == 29
    (guard.root / 'backfill.STOP').touch()
    report = G.status(guard.root, night)
    assert report['stopped'] and report['warning'] and report['projected_finish_date'] is None


def test_projection_includes_queued_days_and_finishes_on_the_publication_night():
    kb, guard = KB(), G.Guard()
    data = guard.check(kb, 'senate')
    night = next(iter(data['nights']))
    guard.progress('senate', remaining=0, cap=10, stop='complete', done=10)
    coverage = guard.root / 'federal-hansard-coverage.json'
    coverage.write_text(json.dumps({'backfill_pending_days_by_year': {'2018': 10}}))
    report = G.status(guard.root, night)
    assert report['days_remaining'] == 10
    assert report['projected_finish_date'] > night
    coverage.write_text(json.dumps({'backfill_pending_days_by_year': {'2018': 0}}))
    report = G.status(guard.root, night)
    assert report['days_remaining'] == 0 and report['projected_finish_date'] == night
