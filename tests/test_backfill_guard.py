"""Offline spending, shared-state and normal publisher regressions."""
from datetime import datetime
import json
from pathlib import Path

import pytest

from parli import arag
from parli.ingest import arag_sync as S, backfill_guard as G


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
    (503, '{"detail":"billing account suspended"}'), (400, 'insufficient credits'),
    (403, 'resource limit exceeded'), (403, 'usage limit reached'),
    (507, 'Insufficient Storage'), (200, '{"error":"quota exceeded"}')])
@pytest.mark.parametrize('method', ['GET', 'POST'])
def test_any_guarded_progress_refusal_stops_without_retry(monkeypatch, status, detail, method):
    calls = []
    class Response:
        ok, status_code, text, headers = status < 400, status, detail, {}
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


def test_real_nightly_status_exposes_shared_growth_and_drives_existing_alert_path(tmp_path, monkeypatch):
    from datetime import timezone
    from scripts.refresh_watchdog import evaluate
    import re
    import sys
    guard, kb = G.Guard(), KB()
    guard.check(kb, 'senate')
    kb.size += 40_000_000
    kb.resources += 1000
    ledger = guard.check(kb, 'nsw')
    night = next(iter(ledger['nights']))
    guard.progress('nsw', remaining=161, cap=4, stop='cap', done=4)
    try:
        guard.stop('test: cumulative growth ceiling exceeded')
    except G.Stopped:
        pass
    shell = Path('scripts/vm/nightly.sh').read_text()
    body = re.search(r'write_status\(\).*?<<\'PYEOF\'.*?\n(.*?)\nPYEOF',shell,re.S)[1]
    output = tmp_path / 'status.json'
    monkeypatch.setattr(sys, 'argv', ['-',str(output),'ok',night,'nightly',
                                    datetime.now(timezone.utc).isoformat(),'sha','published','', '0'])
    exec(compile(body,'nightly.write_status','exec'), {})
    status = json.loads(output.read_text())
    assert status['failures'] == [] and status['status'] == 'ok'
    assert status['backfill_failures'] == ['growth guard: test: cumulative growth ceiling exceeded']
    assert any('growth guard' in warning for warning in status['warnings'])
    assert status['backfill']['bytes_added'] == 40_000_000
    assert status['backfill']['cumulative_resources_added'] == 1000
    assert status['backfill']['byte_ceiling'] == 5_500_000_000
    assert status['backfill']['stages']['nsw']['days_remaining'] == 161
    now = datetime.now(timezone.utc)
    corpus = {'refresh':{'checked_at':now.isoformat()}}
    problems, _, warnings = evaluate(corpus, status, now)
    assert any('growth guard stopped repairs' in problem for problem in problems)
    assert any('growth guard' in warning for warning in warnings)


def test_corrupt_ledger_closes_gate_without_source_or_publisher_calls():
    guard, kb = G.Guard(), KB()
    (guard.root / 'backfill-ledger.json').write_text('{')
    with pytest.raises(G.Stopped, match='ledger invalid'):
        guard.check(kb, 'nsw')
    assert (guard.root / 'backfill.STOP').exists() and kb.created == []


def test_publication_stops_queued_requests_mid_day_when_budget_spent(monkeypatch):
    kb, clock = KB(), [0]
    monkeypatch.setattr(S.time, 'monotonic', lambda: clock[0])
    monkeypatch.setattr(S, 'WORKERS', 1)
    original = kb.create_resource
    def slow_create(document):
        original(document)
        clock[0] = 1201
    kb.create_resource = slow_create
    state = {'failed':{},'pushed':0}
    documents = [body('nsw') for _ in range(3)]
    for index, document in enumerate(documents):
        document['slug'] = f'nsw-{index}'
    S._push_batch(kb, documents, state)
    assert len(kb.created) == state['pushed'] == 1
    assert len(state['failed']) == 2
    assert all('time budget spent' in error for error in state['failed'].values())
    assert not (G.state_dir() / 'backfill.STOP').exists()


@pytest.mark.parametrize('budget', ['bad','nan','1201','-1'])
def test_invalid_publication_budget_holds_without_breaking_normal_sync(monkeypatch, budget):
    monkeypatch.setenv('OPAX_BACKFILL_NSW_BUDGET_S', budget)
    kb, state = KB(), {'failed':{},'pushed':0}
    S._push_batch(kb, [body('nsw'), {'slug':'ordinary'}], state)
    assert [item['slug'] for item in kb.created] == ['ordinary']
    assert 'invalid backfill publication budget' in state['failed']['nsw-1']


def test_completed_source_has_no_extra_publication_night_and_empty_status_has_headroom():
    guard = G.Guard()
    initial = G.status(guard.root, '2026-11-14')
    assert initial['bytes_remaining'] == initial['byte_ceiling'] == 5_500_000_000
    assert initial['stopped'] is False
    guard.progress('nsw', remaining=0, cap=4, stop='complete', done=0)
    complete = G.status(guard.root, '2026-11-14')
    assert complete['days_remaining'] == 0
    assert complete['projected_finish_date'] == '2026-11-14'


def test_unwritable_guard_state_still_holds_publication_without_failing_ordinary_refresh(monkeypatch):
    kb = KB()
    def unwritable(*_):
        raise OSError('fixture full state filesystem')
    monkeypatch.setattr(G, '_atomic', unwritable)
    assert S._push_one(kb, body())[1].startswith(G.HOLD)
    assert not kb.created
    assert S._push_one(kb, {'slug': 'ordinary'}) == ('ordinary', None)
    assert len(kb.created) == 1


@pytest.mark.parametrize('stage', ['senate', 'nsw'])
def test_queued_publication_days_and_unresolved_holds_have_honest_projection(stage, monkeypatch):
    guard = G.Guard()
    guard.progress(stage, remaining=10, acquisition_days_remaining=0, cap=10, stop='complete', done=10)
    report = G.status(guard.root, '2026-11-14')
    assert report['days_remaining'] == 10
    assert report['projected_finish_date'] == '2026-11-15'
    guard.progress(stage, remaining=0, acquisition_days_remaining=0, cap=10, stop='complete', done=0)
    assert G.status(guard.root, '2026-11-15')['projected_finish_date'] == '2026-11-15'
    guard.progress(stage, remaining=1, cap=10, stop='identity-holds', done=0)
    assert G.status(guard.root, '2026-11-15')['projected_finish_date'] is None


def test_nsw_projection_uses_its_canonical_cap_setting(monkeypatch):
    guard = G.Guard()
    guard.progress('nsw', remaining=8, cap=4, stop='cap', done=4)
    monkeypatch.setenv('OPAX_BACKFILL_NSW_CAP', '2')
    assert G.status(guard.root, '2026-11-14')['projected_finish_date'] == '2026-11-19'


@pytest.mark.parametrize('stage', ['senate_backfill', 'nsw_hansard_backfill'])
def test_shared_receipt_fields_keep_repair_timeouts_in_warnings(stage):
    warning = f'Backfill did not complete: {stage}(rc=124)'
    warnings = [warning]
    fields = G.nightly_fields(G.state_dir(), '2026-11-14', warnings)
    assert fields['backfill_failures'] == [f'{stage}(rc=124)']
    assert warnings == [warning]
    assert 'failures' not in fields
