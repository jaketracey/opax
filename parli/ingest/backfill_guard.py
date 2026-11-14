"""Shared Senate/NSW spending guard. Only counters GETs, never a publisher.

Both repairs use the same state directory, ledger, stop file and enrichment
budget. Whole-KB growth includes ordinary ingestion, conservatively. Index
shrinkage never refunds headroom. No token or response body is persisted.
"""
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
import fcntl
import json
import math
import os
from pathlib import Path
import re
import threading

BYTE_CEILING = 5_500_000_000
BYTES_PER_RESOURCE = 59_280  # 1.2 * 49.4 decimal KB, displayed as 59.3 KB
MIN_RESOURCES = 500
CHECK_DAYS = 10
ORIGIN = 'backfill-2026-11'  # classification origin/backfill-2026-11
ENRICHMENT_USD = 30
HOLD = 'Backfill held: '


class Stopped(Exception):
    pass


def state_dir():
    return Path(os.environ.get('OPAX_BACKFILL_STATE_DIR',
                               '~/.cache/autoresearch/pipeline')).expanduser()


def enabled(stage):
    return os.environ.get(f'OPAX_{stage.upper()}_BACKFILL', '1') != '0'


def stage_for(body):
    meta = body.get('extra', {}).get('metadata', {})
    stage = meta.get('backfill_stage')
    if stage in ('senate', 'nsw'):
        return stage
    if str(meta.get('enrichment_budget', {}).get('run_id', '')).startswith('senate-2014-2019-'):
        return 'senate'
    if meta.get('nsw_backfill'):
        return 'nsw'
    return None


def tag(body, stage):
    meta = body.setdefault('extra', {}).setdefault('metadata', {})
    meta['backfill_stage'] = stage
    meta['enrichment_budget'] = {'run_id': ORIGIN, 'max_usd': ENRICHMENT_USD}
    labels = body.setdefault('usermetadata', {}).setdefault('classifications', [])
    label = {'labelset': 'origin', 'label': ORIGIN}
    if label not in labels:
        labels.append(label)
    return body


def _now():
    return datetime.now(timezone.utc).isoformat()


def _atomic(path, value):
    temporary = path.with_name(path.name + f'.{os.getpid()}.{threading.get_ident()}.tmp')
    with temporary.open('w') as out:
        json.dump(value, out, indent=2)
        out.write('\n')
        out.flush()
        os.fsync(out.fileno())
    temporary.replace(path)


class Guard:
    def __init__(self, root=None):
        self.root = Path(root) if root is not None else state_dir()
        self.root.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def locked(self):
        with (self.root / 'backfill-ledger.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            yield

    def ensure_running(self):
        if getattr(self, '_stopped', None):
            raise Stopped(self._stopped)
        if (self.root / 'backfill.STOP').exists():
            raise Stopped('shared backfill.STOP exists; inspect the growth ledger before resuming')

    def stop(self, reason):
        self._stopped = reason
        try:
            with self.locked():
                if not (self.root / 'backfill.STOP').exists():
                    _atomic(self.root / 'backfill.STOP', {'reason': reason, 'at': _now()})
        except OSError:
            # Even a failed stop-file write must hold repairs rather than
            # turn a repair warning into an ordinary refresh failure.
            reason += '; shared stop file could not be written'
        raise Stopped(reason)

    def response(self, status, detail):
        # Called BEFORE the normal client's retry/backpressure handling. Every
        # guarded response, including a transient 429, is terminal for repairs.
        error = detail
        if status < 400:
            try:
                payload = json.loads(detail)
                error = json.dumps(payload.get('error')) if isinstance(payload, dict) and payload.get('error') else ''
            except (ValueError, TypeError):
                error = ''
        if status in (402, 429, 507) or re.search(
                r'quota|billing|payment|credit|insufficient.?fund|insufficient.?balance|'
                r'(?:spend|subscription|usage|resource|storage|size|plan).?limit|upgrade.{0,20}plan',
                error, re.I):
            self.stop(f'Progress HTTP {status}: rate, quota or billing refusal')

    def request_scope(self):
        from parli.arag import observe_responses
        return observe_responses(self.response)

    def read(self):
        path = self.root / 'backfill-ledger.json'
        if not path.exists():
            return {'version': 1, 'bytes_added': 0, 'resources_added': 0,
                    'nights': {}, 'stages': {}, 'observations': []}
        data = json.loads(path.read_text())
        if data.get('version') != 1:
            raise ValueError('unknown backfill ledger version')
        return data

    def check(self, kb, stage):
        self.ensure_running()
        try:
            with self.request_scope():
                counters = kb.counters()
            sample = {key: counters[key] for key in ('index_size', 'resources')}
            if any(type(v) is not int or v < 0 for v in sample.values()):
                raise ValueError('invalid counters')
            sample.update(at=_now(), stage=stage)
            reason = None
            with self.locked():
                self.ensure_running()
                data = self.read()
                previous = data.get('last', sample)
                added = {key: max(0, sample[key] - previous[key]) for key in ('index_size', 'resources')}
                data.setdefault('baseline', sample)
                data['last'] = sample
                data['bytes_added'] += added['index_size']
                data['resources_added'] += added['resources']
                # Sydney dates match nightly status and the completion estimate.
                from zoneinfo import ZoneInfo
                night = datetime.now(ZoneInfo('Australia/Sydney')).date().isoformat()
                totals = data['nights'].setdefault(night, {'bytes_added': 0, 'resources_added': 0})
                totals['bytes_added'] += added['index_size']
                totals['resources_added'] += added['resources']
                data['observations'].append(sample)
                if data['bytes_added'] > BYTE_CEILING:
                    reason = 'cumulative KB growth exceeds 5.5 GB'
                elif (data['resources_added'] >= MIN_RESOURCES and
                      data['bytes_added'] > data['resources_added'] * BYTES_PER_RESOURCE):
                    reason = 'KB growth exceeds 59.3 KB per added resource (at least 500 resources)'
                if reason:
                    data['stop_reason'] = reason
                    _atomic(self.root / 'backfill.STOP', {'reason': reason, 'at': sample['at']})
                _atomic(self.root / 'backfill-ledger.json', data)
            if reason:
                raise Stopped(reason)
            return data
        except Stopped:
            raise
        except Exception:
            self.stop('KB counters unavailable or growth ledger invalid; repair held closed')

    def progress(self, stage, *, remaining, cap, stop, done, **details):
        with self.locked():
            data = self.read()
            data['stages'][stage] = {'days_remaining': remaining, 'days_done': done,
                                     'cap': cap, 'stop': stop, 'updated': _now(), **details}
            _atomic(self.root / 'backfill-ledger.json', data)


def status(root, night):
    """A read-only status snapshot. A missing ledger is normal before first run."""
    root = Path(root)
    result = {'byte_ceiling': BYTE_CEILING, 'max_bytes_per_resource': BYTES_PER_RESOURCE,
              'minimum_resources': MIN_RESOURCES, 'bytes_added': 0, 'resources_added': 0,
              'cumulative_bytes_added': 0, 'cumulative_resources_added': 0,
              'bytes_remaining': BYTE_CEILING, 'stopped': False, 'stages': {}}
    try:
        data = json.loads((root / 'backfill-ledger.json').read_text())
        result.update(data.get('nights', {}).get(night, {}))
        result.update(cumulative_bytes_added=data['bytes_added'],
                      cumulative_resources_added=data['resources_added'],
                      baseline=data.get('baseline'), last=data.get('last'))
        result['bytes_remaining'] = max(0, BYTE_CEILING - data['bytes_added'])
        result['average_bytes_per_resource'] = (data['bytes_added'] / data['resources_added']
                                                if data['resources_added'] else None)
        for stage, progress in data['stages'].items():
            current = dict(progress)
            current['projection_basis'] = 'cap estimate plus publication; identity holds, budgets and stops can extend it'
            remaining = current['days_remaining']
            acquisition = current.get('acquisition_days_remaining', remaining)
            cap_env = 'OPAX_BACKFILL_NSW_CAP' if stage == 'nsw' else f'OPAX_{stage.upper()}_BACKFILL_DAYS'
            cap = int(os.environ.get(cap_env, current['cap']))
            stopped = (not enabled(stage) or (root / 'backfill.STOP').exists()
                       or current.get('stop') in ('source-refused', 'error', 'growth-guard', 'identity-holds'))
            # This night's acquisition has finished. Remaining days start next
            # night; normal-sync publication follows acquisition by one night.
            current['projected_finish_date'] = ((date.fromisoformat(night) + timedelta(
                days=math.ceil(acquisition / cap) + int(remaining > 0))).isoformat()
                if remaining is not None and cap > 0 and not stopped else None)
            result['stages'][stage] = current
    except FileNotFoundError:
        pass
    except (OSError, ValueError, KeyError, TypeError):
        result['warning'] = 'backfill growth ledger unreadable'
    if (root / 'backfill.STOP').exists():
        result['stopped'] = True
        try:
            result['warning'] = json.loads((root / 'backfill.STOP').read_text())['reason']
        except (OSError, ValueError, KeyError, TypeError):
            result['warning'] = 'shared backfill.STOP exists'
    stages = list(result['stages'].values())
    result['days_remaining'] = (sum(s['days_remaining'] for s in stages)
                                if stages and all(s['days_remaining'] is not None for s in stages) else None)
    result['projected_finish_date'] = (max(s['projected_finish_date'] for s in stages)
                                       if stages and all(s['projected_finish_date'] for s in stages) else None)
    return result


def nightly_fields(root, night, warnings):
    """Shared receipt fields; repair warnings never become periodic failures."""
    backfill = status(root, night)
    failures = [w.removeprefix('Backfill did not complete: ') for w in warnings
                if w.startswith('Backfill did not complete: ')]
    if backfill.get('warning'):
        failures.append('growth guard: ' + backfill['warning'])
        warnings.append('Backfill growth guard: ' + backfill['warning'])
    return {'backfill': backfill, 'backfill_failures': list(dict.fromkeys(failures))}
