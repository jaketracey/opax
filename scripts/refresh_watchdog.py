#!/usr/bin/env python3
"""Check delivery freshness and report retained source coverage separately."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import time
import urllib.request


def evaluate(corpus, status, now, max_age=20):
    problems, notes, warnings = [], [], []

    def age(stamp):
        then = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
        if then.tzinfo is None:
            then = then.replace(tzinfo=timezone.utc)
        return (now - then).total_seconds() / 3600

    try:
        checked = corpus['refresh']['checked_at']
        hours = age(checked)
        notes.append(f"corpus.json version {corpus.get('version')}, checked {checked} ({hours:.1f} h ago)")
        if hours < -1 or hours > max_age:
            problems.append(f'live corpus timestamp age {hours:.1f} h is outside the permitted window (limit {max_age:g} h)')
    except (KeyError, TypeError, ValueError):
        problems.append('live corpus has no valid refresh.checked_at')

    try:
        finished_age = age(status['finished'])
        if finished_age < -1 or finished_age > max_age + 10:
            problems.append(f'nightly status timestamp age {finished_age:.1f} h is outside the permitted window')
    except (KeyError, TypeError, ValueError):
        problems.append('nightly status has no valid finished timestamp')
    notes.append(f"nightly status: {status.get('status')} for {status.get('date')}; commit {status.get('commit')}")
    if status.get('status') != 'ok':
        problems.extend(f"last nightly run: {item}" for item in status.get('failures') or ['no failure detail'])
    warnings.extend(str(item) for item in status.get('warnings', []))
    paused = dict(corpus.get('refresh', {}).get('source_access', {}))
    paused.update(status.get('paused_sources', {}))
    for name, receipt in sorted(paused.items()):
        if receipt.get('status') == 'paused':
            warnings.append(f"source paused: {name} ({receipt.get('host', 'host unavailable')}); retained records are not a current source check")
    periodic = status.get('periodic_state', {})
    if periodic.get('error'):
        problems.append('periodic refresh state is unreadable; inspect the VM state file')
    for name, state in sorted(periodic.get('groups', {}).items()):
        if state.get('due'):
            warnings.append(f"periodic refresh pending retry: {name} (due {state['due']})")
    return problems, notes, list(dict.fromkeys(warnings))


def main():
    now = datetime.now(timezone.utc)
    max_age = float(os.environ.get('MAX_AGE_HOURS', '20'))
    agent = json.loads((Path(__file__).resolve().parents[1] / 'parli/ingest/user-agent.json').read_text())['user_agent']

    def fetch(url):
        req = urllib.request.Request(f"{url}{'&' if '?' in url else '?'}wd={int(time.time())}",
                                     headers={'Cache-Control': 'no-cache', 'User-Agent': agent})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)

    problems, notes, warnings = [], [], []
    try:
        corpus = fetch(os.environ.get('SITE', 'https://opax.com.au') + '/corpus.json')
        status = fetch(os.environ['STATUS_URL'])
        problems, notes, warnings = evaluate(corpus, status, now, max_age)
    except Exception as error:
        problems.append(f'cannot read refresh evidence: {error}')
    for note in notes:
        print(note)
    for warning in warnings:
        print('::warning::' + warning.replace('\n', ' '))
    for problem in problems:
        print('::error::' + problem.replace('\n', ' '))
    result = ('FAILED: delivery chain needs repair' if problems else
              'OK: delivery chain is current; source coverage has holds' if warnings else
              'OK: delivery chain is current; no reported source holds')
    print(result)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as out:
            out.write('### OPAX refresh\n\n' + result + '\n\n')
            for label, items in [('Delivery', notes), ('Problems', problems), ('Source and data holds', warnings)]:
                if items:
                    out.write(f'**{label}**\n\n' + ''.join(f'- {item}\n' for item in items) + '\n')
            out.write('A recent manifest confirms publication, not complete access to every source.\n')
    return bool(problems)


if __name__ == '__main__':
    sys.exit(main())
