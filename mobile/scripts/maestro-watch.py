#!/usr/bin/env python3
"""Bound Maestro and terminate its tree on fatal iOS driver transport errors."""
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

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


class StartupAllowance:
    """Bound readiness probes, anchored to the runner server when it reports it.

    Native preflight stays under the overall flow deadline until the server
    signal arrives. Without native runner logs, launch is the fallback.
    The overall deadline always bounds both phases together.
    """
    server_started = re.compile(
        r'\bserver\s+started\b|\[FlyingFox\]\s+starting server\b', re.IGNORECASE,
    )
    ready = '[Done] Perform XCUITest driver status check'
    probe = '[Failed] Perform XCUITest driver status check'

    def __init__(self, launched, seconds):
        self.anchor = launched
        self.seconds = seconds
        self.saw_server = False
        self.connected = False
        self.waiting_for_server = False

    def observe(self, line, now, runner=False):
        if runner:
            # Native preflight/classification tests are not readiness probes.
            # They remain bounded by the overall flow deadline, then the
            # readiness allowance starts at the server signal itself.
            self.waiting_for_server = True
        if not self.saw_server and self.server_started.search(line):
            self.anchor = now
            self.saw_server = True
        if self.ready in line:
            self.connected = True

    def allows(self, line, now):
        return (self.probe in line and not self.connected
                and ((self.waiting_for_server and not self.saw_server)
                     or now - self.anchor < self.seconds))


def positive_seconds(value, name):
    if not re.fullmatch(r'[0-9]+', value) or int(value) <= 0:
        raise ValueError(f'{name} must be a positive integer')
    return int(value)


def startup_timeout_seconds():
    return positive_seconds(
        os.environ.get('OPAX_MAESTRO_STARTUP_TIMEOUT_SECONDS', '180'),
        'OPAX_MAESTRO_STARTUP_TIMEOUT_SECONDS',
    )


def driver_startup_timeout_ms():
    # Unlike the watcher, Maestro counts native preflight against its timeout.
    # Keep 180 s of preflight headroom in addition to the server allowance.
    return positive_seconds(
        os.environ.get('MAESTRO_DRIVER_STARTUP_TIMEOUT') or str(
            (180 + startup_timeout_seconds()) * 1000),
        'MAESTRO_DRIVER_STARTUP_TIMEOUT',
    )


def log_sources(log, debug):
    # Read runner readiness before queued console probes. XCTest's own unit
    # tests can print deliberate transport errors, so use these logs for the
    # server-start signal only. Device syslogs are never a transport source.
    root = Path(debug)
    runner = {*root.rglob('xctest_runner_*.log'), *root.rglob('device-xctest.log')}
    maestro = set(root.rglob('maestro.log')) - {Path(log)}
    return [(path, False) for path in sorted(runner)] + [
        (Path(log), True), *((path, True) for path in sorted(maestro)),
    ]


def run(log, debug, seconds, *command):
    limit = positive_seconds(seconds, 'OPAX_MAESTRO_TIMEOUT_SECONDS')
    startup_seconds = startup_timeout_seconds()
    offsets = {}
    tails = {}

    def logs():
        return log_sources(log, debug)

    for path, _ in logs():
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
        env = dict(os.environ, MAESTRO_DRIVER_STARTUP_TIMEOUT=str(driver_startup_timeout_ms()))
        child = subprocess.Popen(command, stdout=output, stderr=output, env=env)
        child_start = subprocess.run(['/bin/ps', '-o', 'lstart=', '-p', str(child.pid)],
                                     capture_output=True, text=True, check=False).stdout.strip()
        tracked[child.pid] = ' '.join(child_start.split())
        for sig in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
            signal.signal(sig, interrupted)
        started = time.monotonic()
        startup = StartupAllowance(started, startup_seconds)
        deadline = started + limit
        rc = None
        try:
            while True:
                remember_tree(process_rows())
                for path, transport in logs():
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
                        startup.observe(line, time.monotonic(), runner=not transport)
                        if not transport:
                            continue
                        match = forbidden.search(line) or connection.search(line)
                        if not match:
                            continue
                        # Only the named startup probe receives an allowance.
                        # Gestures, other transport errors and all 403s fail now.
                        if (not forbidden.search(line)
                                and startup.allows(line, time.monotonic())):
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
    return rc


if __name__ == '__main__':
    try:
        raise SystemExit(run(*sys.argv[1:]))
    except ValueError as error:
        raise SystemExit(str(error))
