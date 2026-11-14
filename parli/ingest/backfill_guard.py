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


# Quota, rate, billing, account and limit refusals, matched case-insensitively.
REFUSAL = re.compile(
    r'quota|rate.?limit|too many requests|throttl|billing|payment|credit|'
    r'insufficient|exceed|limit.{0,20}reached|reached.{0,20}limit|'
    r'(?:spend|subscription|usage|resource|storage|size|plan).?limit|upgrade.{0,20}plan|'
    r'suspend|deactivat|trial|spending.?cap|\bcap\b|capped|subscription|inactive',
    re.I)
# Keys an API puts an error under, at any depth.
REFUSAL_KEYS = ('error', 'errors', 'message', 'messages', 'detail', 'details', 'msg',
                'reason', 'error_description')
ERROR_STATUSES = ('error', 'errors', 'fail', 'failed', 'failure', 'refused', 'denied')
# Inside a guarded request every status of 400 or more stops the backfill,
# except 409 (the slug already exists: counted as done) and 404 (a missing
# path or resource says nothing about the account or its spend).
GUARDED_PASS = (404, 409)


def refusal_text(detail):
    """The text of a 2xx body where a refusal could sit.

    JSON, at any depth: everything under an error-like key (error, message,
    reason, detail, msg and similar), and every string in an object that says
    it failed (status "error", success or ok false). A plain-text body is read
    whole. Other fields (resource titles, text) are ignored, so a speech
    about quotas is not a refusal.
    """
    if detail is None:
        return ''
    if isinstance(detail, bytes):
        detail = detail.decode('utf-8', 'replace')
    try:
        payload = json.loads(detail)
    except (ValueError, TypeError):
        return str(detail)
    if isinstance(payload, str):
        return payload
    found = []
    def walk(value, keyed):
        if isinstance(value, str):
            if keyed:
                found.append(value)
        elif isinstance(value, dict):
            status = value.get('status')
            failed = ((isinstance(status, str) and status.lower() in ERROR_STATUSES)
                      or value.get('success') is False or value.get('ok') is False)
            for key, item in value.items():
                walk(item, keyed or failed or str(key).lower() in REFUSAL_KEYS)
        elif isinstance(value, list):
            for item in value:
                walk(item, keyed)
    if isinstance(payload, list):
        for item in payload:
            walk(item, isinstance(item, str))
    else:
        walk(payload, False)
    return '\n'.join(found)


def recent_rate(observations):
    """Bytes per resource over the latest check interval(s), or None.

    Walk back from the newest sample until the window holds at least
    MIN_RESOURCES added resources, so one small batch cannot trip the bound.
    Per-step growth is clamped at zero, as in the all-time totals.
    """
    size = count = 0
    for newer, older in zip(reversed(observations), list(reversed(observations))[1:]):
        size += max(0, newer['index_size'] - older['index_size'])
        count += max(0, newer['resources'] - older['resources'])
        if count >= MIN_RESOURCES:
            return size / count
    return None


def growth_rate(data):
    """The current per-resource rate: the higher of all-time and recent.

    Before MIN_RESOURCES resources have been added, the 59.3 KB bound itself.
    """
    rates = [recent_rate(data.get('observations', []))]
    if data.get('resources_added', 0) >= MIN_RESOURCES:
        rates.append(data['bytes_added'] / data['resources_added'])
    rates = [r for r in rates if r is not None]
    return max(rates) if rates else BYTES_PER_RESOURCE


class Guard:
    def __init__(self, root=None):
        self.root = Path(root) if root is not None else state_dir()
        self.root.mkdir(parents=True, exist_ok=True)
        # Backfill resources created since the last counters check. The index
        # does not count them yet, so the ceiling projection adds them.
        self.unchecked = 0
        self._count_lock = threading.Lock()

    def published(self, n):
        with self._count_lock:
            self.unchecked += n

    def before_batch(self, n):
        """Stop before a batch of n resources that could cross 5.5 GB.

        Projects the ledger's bytes, plus resources created since the last
        check, plus this batch, at the current per-resource rate.
        """
        self.ensure_running()
        try:
            with self.locked():
                data = self.read()
        except Exception:
            self.stop('growth ledger unreadable before a batch; repair held closed')
        projected = data['bytes_added'] + (self.unchecked + n) * growth_rate(data)
        if projected > BYTE_CEILING:
            reason = (f'next batch of {n} could cross 5.5 GB at '
                      f'{growth_rate(data) / 1000:.1f} KB per resource; stopped before it')
            with self.locked():
                data = self.read()
                data['stop_reason'] = reason
                _atomic(self.root / 'backfill-ledger.json', data)
            self.stop(reason)

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

    def response(self, status, detail, guarded=True):
        # Called BEFORE the normal client's retry/backpressure handling. Every
        # guarded response, including a transient 429, is terminal for repairs.
        # A 200 can still carry a refusal: read every place an API puts one.
        # Ordinary refresh requests (guarded=False) stop the repairs only on
        # refusal wording, without changing their own failure policy.
        error = detail if status >= 400 else refusal_text(detail)
        if status in (402, 429, 507) or REFUSAL.search(error or ''):
            self.stop(f'Progress HTTP {status}: rate, quota or billing refusal')
        if guarded and status >= 400 and status not in GUARDED_PASS:
            self.stop(f'Progress HTTP {status}: error inside a guarded backfill request')

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
                recent = recent_rate(data['observations'])
                if data['bytes_added'] > BYTE_CEILING:
                    reason = 'cumulative KB growth exceeds 5.5 GB'
                elif (data['resources_added'] >= MIN_RESOURCES and
                      data['bytes_added'] > data['resources_added'] * BYTES_PER_RESOURCE):
                    reason = 'KB growth exceeds 59.3 KB per added resource (at least 500 resources)'
                elif recent is not None and recent > BYTES_PER_RESOURCE:
                    # A sustained rise late in the run, which the all-time
                    # average would absorb (joint review P3).
                    reason = ('recent KB growth exceeds 59.3 KB per added resource '
                              '(latest check interval, at least 500 resources)')
                if reason:
                    data['stop_reason'] = reason
                    _atomic(self.root / 'backfill.STOP', {'reason': reason, 'at': sample['at']})
                _atomic(self.root / 'backfill-ledger.json', data)
            with self._count_lock:
                self.unchecked = 0
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


# The coverage watchdog's repair sitting-day inventories: one JSON per lane in
# STATE_DIR/coverage-sitting-days, listing every expected sitting day of the
# repaired years, held or not. The lane names are the ones the watchdog reads.
SITTING_MANIFESTS = {
    'senate': ('senate.json', 'im/backfill-joint', {'senate': range(2014, 2020)}),
    'nsw': ('nsw.json', 'im/backfill-joint', {'nsw_la': range(2023, 2026), 'nsw_lc': range(2023, 2026)}),
}


def write_sitting_manifest(stage, days, evidence, root=None):
    """Write `days` ((chamber, ISO date) pairs) for the watchdog; never fatal.

    Returns the path, or None when the inventory could not be written.
    """
    name, lane, chambers = SITTING_MANIFESTS[stage]
    inventory = {ch: {str(year): set() for year in years} for ch, years in chambers.items()}
    for chamber, day in days:
        year = day[:4]
        if chamber in inventory and year in inventory[chamber]:
            inventory[chamber][year].add(date.fromisoformat(day).isoformat())
    data = {'schema_version': 1, 'lane': lane, 'generated_at': _now(), 'evidence': evidence,
            'chambers': {ch: {y: sorted(d) for y, d in years.items()} for ch, years in inventory.items()}}
    try:
        folder = Path(root if root is not None else state_dir()) / 'coverage-sitting-days'
        folder.mkdir(parents=True, exist_ok=True)
        _atomic(folder / name, data)
        return folder / name
    except OSError:
        return None


def run_night(night, after):
    """The date of the `after`-th backfill night following `night`.

    The nightly skips both backfill stages on weekly/monthly nights, which are
    Sundays (Sydney), so a projection counts only the other six nights.
    """
    day = date.fromisoformat(night) if isinstance(night, str) else night
    while after > 0:
        day += timedelta(days=1)
        if day.weekday() != 6:
            after -= 1
    return day


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
            # A scheduled periodic-night skip switches the stage off for one
            # night only; it is not a stop and the projection still stands.
            skipped = bool(os.environ.get('OPAX_BACKFILL_SKIPPED_TONIGHT'))
            # Projections allow for Sunday skips only. A skip on another night
            # means a periodic group is still owed; while it stays owed every
            # night skips, so no date is honest until it clears.
            owed = skipped and date.fromisoformat(night).weekday() != 6
            if owed:
                current['projection_basis'] = 'withheld: an owed periodic group skipped the backfill tonight'
            stopped = (owed or (not enabled(stage) and not skipped) or (root / 'backfill.STOP').exists()
                       or current.get('stop') in ('source-refused', 'error', 'growth-guard', 'identity-holds'))
            # This night's acquisition has finished. Remaining days start next
            # night; normal-sync publication follows acquisition by one night.
            # Sundays (weekly/monthly nights) run no backfill and are not counted.
            current['projected_finish_date'] = (run_night(night, math.ceil(acquisition / cap)
                                                          + int(remaining > 0)).isoformat()
                if remaining is not None and cap > 0 and not stopped else None)
            result['stages'][stage] = current
    except FileNotFoundError:
        pass
    except (OSError, ValueError, KeyError, TypeError):
        result['warning'] = 'backfill growth ledger unreadable'
    if os.environ.get('OPAX_BACKFILL_SKIPPED_TONIGHT'):
        result['skipped_tonight'] = os.environ['OPAX_BACKFILL_SKIPPED_TONIGHT']
    if (root / 'backfill.STOP').exists():
        result['stopped'] = True
        try:
            result['warning'] = json.loads((root / 'backfill.STOP').read_text())['reason']
        except (OSError, ValueError, KeyError, TypeError):
            result['warning'] = 'shared backfill.STOP exists'
    # Jake's GO is in GB: every byte figure also in decimal GB, 2 places.
    for key in ('byte_ceiling', 'bytes_added', 'cumulative_bytes_added', 'bytes_remaining'):
        result[key.replace('bytes', 'gb').replace('byte_', 'gb_')] = round(result[key] / 1e9, 2)
    stages = list(result['stages'].values())
    result['days_remaining'] = (sum(s['days_remaining'] for s in stages)
                                if stages and all(s['days_remaining'] is not None for s in stages) else None)
    result['projected_finish_date'] = (max(s['projected_finish_date'] for s in stages)
                                       if stages and all(s['projected_finish_date'] for s in stages) else None)
    return result


def nightly_fields(root, night, warnings):
    """Shared receipt fields; repair warnings never become periodic failures."""
    backfill = status(root, night)
    # Accept the existing NSW wrapper's warnings too, so both callers expose
    # the same field without depending on Senate's shell warning function.
    repair_prefixes = ('Backfill did not complete: ', 'NSW Hansard repair ',
                       'NSW Hansard API refused', 'Shared backfill.STOP:')
    failures = [w.removeprefix('Backfill did not complete: ') for w in warnings
                if w.startswith(repair_prefixes)]
    if backfill.get('warning'):
        failures.append('growth guard: ' + backfill['warning'])
        warnings.append('Backfill growth guard: ' + backfill['warning'])
    return {'backfill': backfill, 'backfill_failures': list(dict.fromkeys(failures))}
