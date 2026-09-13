#!/usr/bin/env python3
"""Publish completed versions and optionally finish legacy bill acquisition.

The first crawl is supervised by a separate user service. Legacy source requests
start only after that service has stopped with no automatic restart pending.
Run this watcher under a persistent systemd user service for reboot recovery.
All child commands resume from the state DB; completion receipts describe a
finished workflow, not proof that every source bill was available.
"""
import argparse
import fcntl
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone

UNIT_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.:@-]*\.service$')
BUSY_STATES = {'active', 'activating', 'reloading', 'deactivating', 'refreshing'}


class SourcePaused(RuntimeError):
    """A deliberate source-block stop must not turn into automatic fetch retries."""


def crawl_state(unit):
    result = subprocess.run(
        ['systemctl', '--user', 'show', unit, '--property=LoadState',
         '--property=ActiveState', '--property=SubState', '--property=ExecMainStatus',
         '--property=Result', '--property=Restart', '--property=Job',
         '--property=ExecMainStartTimestampMonotonic', '--property=RestartPreventExitStatus'],
        capture_output=True, text=True, timeout=30)
    values = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    if result.returncode or values.get('LoadState') != 'loaded':
        raise RuntimeError('Crawler service is unavailable; refusing to infer completion')
    return values


def completion_state(values):
    """Return None while the source service may run again, else its exit code."""
    if values.get('ActiveState') in BUSY_STATES or values.get('Job', '') not in ('', '0'):
        return None
    if values.get('ActiveState') not in {'inactive', 'failed'}:
        raise RuntimeError('Unrecognised crawler service state')
    if not values.get('ExecMainStartTimestampMonotonic', '').isdigit() or int(values['ExecMainStartTimestampMonotonic']) <= 0:
        raise RuntimeError('Crawler service has not run; refusing to infer completion')
    if not re.fullmatch(r'\d+', values.get('ExecMainStatus', '')) or not values.get('Result'):
        raise RuntimeError('Crawler service did not expose an exit result')
    status = int(values['ExecMainStatus'])
    if values['Result'] != 'success':
        status = status or 1  # signal/timeout failures can expose a zero status
    if status == 130:
        raise SourcePaused('Source crawl paused after repeated refusal or interruption; operator restart required')
    restart = values.get('Restart')
    if restart not in {'no', 'on-failure', 'on-abnormal', 'on-watchdog', 'on-abort', 'on-success', 'always'}:
        raise RuntimeError('Crawler restart policy is unavailable')
    if restart == 'always' or (status == 0 and restart == 'on-success'):
        return None
    prevented = values.get('RestartPreventExitStatus', '').split()
    if status and restart != 'no' and str(status) not in prevented:
        raise RuntimeError('Crawler failed with a restart policy; resume it before legacy acquisition')
    return status


def coverage_state(state_dir):
    db = sqlite3.connect((state_dir / 'state.sqlite').as_uri() + '?mode=ro', uri=True)
    try:
        result = {
            'bills': dict(db.execute('SELECT status,count(*) FROM bill_text_bills GROUP BY status')),
            'versions': dict(db.execute('SELECT status,count(*) FROM bill_text_versions GROUP BY status')),
        }
    finally:
        db.close()
    report = state_dir / 'identity-reconciliation.json'
    if report.exists():
        records = json.loads(report.read_text()).get('records', [])
        result['identities'] = {status: sum(row.get('status') == status for row in records)
                                for status in ('resolved', 'unresolved', 'ambiguous')}
    return result


def completion_receipt(state_dir, crawl_unit, legacy, crawler_exit, legacy_exit):
    receipt = state_dir / 'workflow-complete.json'
    coverage = coverage_state(state_dir)
    gaps = (sum(n for status, n in coverage['versions'].items() if status != 'complete')
            + sum(n for status, n in coverage['bills'].items() if status in ('failed', 'pending', 'unavailable')))
    data = {'completed_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'crawler_unit': crawl_unit, 'crawler_exit': crawler_exit,
            'legacy_reconciled': legacy, 'legacy_exit': legacy_exit, 'publisher_exit': 0,
            'status': 'completed_with_gaps' if gaps or crawler_exit == 2 or legacy_exit == 2 else 'completed',
            'counts': coverage,
            'coverage': 'Workflow finished; consult state.sqlite and identity-reconciliation.json for unavailable or unresolved sources.'}
    temporary = receipt.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.replace(receipt)


def watch(args):
    script = Path(__file__).with_name('publish_bill_texts.py')
    common = ['--state-dir', str(args.state_dir)]
    command = [sys.executable, str(script), 'publish', *common, '--env', args.env, '--rate', '1']
    legacy_command = [sys.executable, str(script), 'finish-legacy', *common]
    failures = 0
    legacy = None
    try:
        while True:
            result = subprocess.run(command)
            failures = failures + 1 if result.returncode else 0
            values = crawl_state(args.crawl_unit)
            crawler_exit = completion_state(values)
            print(json.dumps({'publisher_exit': result.returncode, 'crawler': values,
                              'consecutive_failures': failures,
                              'legacy_exit': legacy.poll() if legacy else None}), flush=True)
            if crawler_exit is None and legacy is not None:
                raise RuntimeError('Source crawler restarted during legacy acquisition; stopping legacy child')
            if failures >= 5:
                raise RuntimeError('Five consecutive publishing failures; resumable state retained')
            if crawler_exit is not None and not result.returncode:
                if args.finish_legacy and legacy is None:
                    legacy = subprocess.Popen(legacy_command)
                    print(json.dumps({'legacy_started': True, 'pid': legacy.pid}), flush=True)
                legacy_exit = legacy.poll() if legacy else 0
                if legacy_exit is not None:
                    # The source may finish after the previous publisher took its
                    # selection snapshot. Only a final successful pass can complete.
                    final = subprocess.run(command)
                    # Exit2 means the source pass finished with explicit coverage
                    # gaps, not an operational failure that should block legacy.
                    exit_code = final.returncode or (legacy_exit if legacy_exit not in (0, 2) else 0) or (crawler_exit if crawler_exit not in (0, 2) else 0)
                    if exit_code == 0:
                        completion_receipt(args.state_dir, args.crawl_unit, args.finish_legacy, crawler_exit, legacy_exit)
                    return exit_code
            time.sleep(min(args.interval * 2 ** min(failures, 4), 900))
    finally:
        if legacy is not None and legacy.poll() is None:
            legacy.terminate()
            try:
                legacy.wait(timeout=30)
            except subprocess.TimeoutExpired:
                legacy.kill()
                legacy.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir', type=Path, required=True)
    parser.add_argument('--env', required=True)
    parser.add_argument('--crawl-unit', default='opax-bill-text-crawl-20260913.service')
    parser.add_argument('--interval', type=int, default=60)
    parser.add_argument('--finish-legacy', action='store_true', help='Reconcile and crawl legacy identities after the primary source crawl stops')
    args = parser.parse_args()
    if args.interval < 30:
        parser.error('interval must be at least 30 seconds')
    if not UNIT_RE.fullmatch(args.crawl_unit):
        parser.error('crawl-unit must be a service name, not a systemctl option or path')
    args.state_dir = args.state_dir.resolve()
    args.env = str(Path(args.env).resolve())
    if not (args.state_dir / 'state.sqlite').is_file() or not Path(args.env).is_file():
        parser.error('Existing crawl state.sqlite and environment file are required')
    # Prevent a second watcher (including a manually launched copy) from issuing
    # duplicate publisher calls or starting an overlapping legacy source crawl.
    with (args.state_dir / '.watch.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('Another bill publisher watcher owns this state directory')
        return watch(args)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except SourcePaused as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(130)
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error))
