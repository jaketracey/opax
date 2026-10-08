#!/usr/bin/env python3
"""Bound Maestro and terminate its tree on fatal iOS driver transport errors."""
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

log, debug, seconds, *command = sys.argv[1:]
limit = int(seconds)
if limit <= 0:
    raise SystemExit('OPAX_MAESTRO_TIMEOUT_SECONDS must be positive')
# Driver failures are emitted in the verbose console or debug log while the
# CLI retries. Ordinary app assertions and fixture HTTP responses are excluded.
# Match an HTTP status or an explicit request failure, never a byte count
# such as Apple's response_status=200,...response_bytes=403 telemetry.
forbidden = re.compile(
    r'\b(?:HTTP(?:/\d(?:\.\d)?)?(?:\s+response)?(?:\s+status(?:\s+code)?)?|'
    r'response[_\s]+(?:status|code)|status(?:[_\s]+code)?|request\s+failed)'
    r'\s*[:=(]?\s*403\b', re.IGNORECASE,
)
connection = re.compile(
    r'ConnectException|Connection (?:refused|reset)|Failed to connect to /?127\.0\.0\.1|'
    r'(?:driver|XCTest).*?(?:connection error|unreachable)', re.IGNORECASE,
)
offsets = {}
tails = {}


def logs():
    return {Path(log), *Path(debug).rglob('*.log')}


for path in logs():
    offsets[path] = path.stat().st_size if path.exists() else 0


tracked = {}


def process_rows():
    rows = subprocess.check_output(
        ['/bin/ps', '-axo', 'pid=,ppid=,lstart=,stat='], text=True,
    )
    result = {}
    for row in rows.splitlines():
        fields = row.split(None, 2)
        if len(fields) != 3:
            continue
        start, state = fields[2].rsplit(None, 1)
        result[int(fields[0])] = (int(fields[1]), ' '.join(start.split()), state)
    return result


def remember_tree(rows):
    # Retain identities when a child is orphaned. Descend only through a
    # matching parent identity, so a reused PID cannot introduce a new tree.
    parents = {pid for pid, start in tracked.items()
               if pid in rows and rows[pid][1] == start}
    while parents:
        children = {pid for pid, (parent, start, state) in rows.items()
                    if parent in parents and pid not in tracked}
        for pid in children:
            tracked[pid] = rows[pid][1]
        parents = children


def live_tree(rows):
    return [pid for pid, start in tracked.items()
            if pid in rows and rows[pid][1] == start and not rows[pid][2].startswith('Z')]


def signal_tree(sig):
    rows = process_rows()
    remember_tree(rows)
    for pid in live_tree(rows):
        # Recheck immediately before each signal, including TERM and KILL.
        current = subprocess.run(['/bin/ps', '-o', 'lstart=,stat=', '-p', str(pid)],
                                 capture_output=True, text=True, check=False).stdout.strip()
        if not current:
            continue
        start, state = current.rsplit(None, 1)
        if ' '.join(start.split()) != tracked[pid] or state.startswith('Z'):
            continue
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            pass


def stop():
    # Keep Maestro in the locked wrapper's group: a dead wrapper can never be
    # reaped while this command tree is alive. Only this driver's identified
    # descendants are signalled here; the auditor and fixture are untouched.
    for sig in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, signal.SIG_IGN)
    signal_tree(signal.SIGTERM)
    end = time.monotonic() + 0.5
    while time.monotonic() < end:
        rows = process_rows()
        remember_tree(rows)
        if not live_tree(rows):
            break
        time.sleep(0.05)
    signal_tree(signal.SIGKILL)
    child.wait()


def interrupted(signum, frame):
    stop()
    raise SystemExit(128 + signum)


with open(log, 'a') as output:
    child = subprocess.Popen(command, stdout=output, stderr=output)
    child_start = subprocess.run(['/bin/ps', '-o', 'lstart=', '-p', str(child.pid)],
                                 capture_output=True, text=True, check=False).stdout.strip()
    tracked[child.pid] = ' '.join(child_start.split())
    for sig in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, interrupted)
    started = time.monotonic()
    deadline = started + limit
    rc = None
    try:
        while True:
            remember_tree(process_rows())
            for path in logs():
                try:
                    with path.open(errors='replace') as source:
                        if path.stat().st_size < offsets.get(path, 0):
                            offsets[path] = 0
                            tails[path] = ''
                        source.seek(offsets.get(path, 0))
                        fresh = source.read()
                        offsets[path] = source.tell()
                except OSError:
                    continue
                fresh = tails.get(path, '') + fresh
                tails[path] = fresh.rsplit('\n', 1)[-1][-4096:]
                for line in fresh.splitlines():
                    match = forbidden.search(line) or connection.search(line)
                    if not match:
                        continue
                    # Maestro probes an absent runner before installing it.
                    # Only this named startup probe gets a bounded allowance;
                    # gesture/transport errors and all 403s fail immediately.
                    if (not forbidden.search(line)
                            and '[Failed] Perform XCUITest driver status check' in line
                            and time.monotonic() - started < 60):
                        continue
                    print(f'Maestro driver failed: {match.group(0)} ({path})', file=sys.stderr)
                    rc = 1
                    break
                if rc is not None:
                    break
            if rc is not None:
                break
            rc = child.poll()
            if rc is not None:
                break
            if time.monotonic() >= deadline:
                print(f'Maestro exceeded {limit}s; stopping driver', file=sys.stderr)
                rc = 124
                break
            time.sleep(0.2)
    finally:
        stop()
raise SystemExit(rc)
