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

RECEIPT_GRACE_SECONDS = 5 * 60


def evaluate(corpus, status, now, max_age=20):
    problems, notes, warnings = [], [], []

    def timestamp(stamp):
        if not isinstance(stamp, str):
            raise ValueError('timestamp must be a string')
        then = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
        if then.tzinfo is None:
            then = then.replace(tzinfo=timezone.utc)
        return then

    checked_at = finished_at = None
    try:
        checked = corpus['refresh']['checked_at']
        checked_at = timestamp(checked)
        hours = (now - checked_at).total_seconds() / 3600
        notes.append(f"corpus.json version {corpus.get('version')}, checked {checked} ({hours:.1f} h ago)")
        if hours < -1 or hours > max_age:
            problems.append(f'live corpus timestamp age {hours:.1f} h is outside the permitted window (limit {max_age:g} h)')
    except (KeyError, TypeError, ValueError):
        problems.append('live corpus has no valid refresh.checked_at')

    try:
        finished_at = timestamp(status['finished'])
        finished_age = (now - finished_at).total_seconds() / 3600
        if finished_age < -1 or finished_age > max_age + 10:
            problems.append(f'nightly status timestamp age {finished_age:.1f} h is outside the permitted window')
    except (KeyError, TypeError, ValueError):
        problems.append('nightly status has no valid finished timestamp')
    # A successful data push can be followed by a failed status push. Yesterday's
    # OK receipt must not clear today's manifest, even inside its 30-hour window.
    if checked_at is not None and finished_at is not None:
        receipt_lag = (checked_at - finished_at).total_seconds()
        if receipt_lag > RECEIPT_GRACE_SECONDS:
            problems.append(f'nightly status receipt predates the live corpus refresh by {receipt_lag / 60:.1f} min (limit 5 min)')
    notes.append(f"nightly status: {status.get('status')} for {status.get('date')}; commit {status.get('commit')}")
    if status.get('status') != 'ok':
        problems.extend(f"last nightly run: {item}" for item in status.get('failures') or ['no failure detail'])
    # Coverage alerts page without marking the refresh itself failed (nightly.sh).
    coverage_alerts = status.get('coverage_alerts') or []
    if not isinstance(coverage_alerts, list):
        coverage_alerts = ['coverage alerts field is malformed; inspect the nightly status']
    problems.extend(str(item) for item in coverage_alerts)
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


def evaluate_mcp(status):
    """Sustained no-account MCP volume is a problem; the tier being switched off is only a note."""
    problems, notes = [], []
    paused = status.get('paused_today') or []
    if isinstance(paused, str):
        paused = [paused]
    if paused:
        problems.append(f"MCP without an account paused itself today for {', '.join(paused)} (pool:count): the daily cap was reached "
                        '(MCP_ANON_DAILY_PROGRESS_* / MCP_ANON_DAILY_REQUESTS_*, docs/COMMUNITY.md)')
    if status.get('volume') == 'high':
        problems.append('MCP requests without an account have stayed above the alert line for three hours in a row in the last day; '
                        'check Worker logs for mcp_anon_volume and consider MCP_ANON_ENABLED=false (docs/COMMUNITY.md)')
    notes.append(f"MCP without an account: {'on' if status.get('anonymous') else 'off'}, volume {status.get('volume', 'unknown')}")
    return problems, notes


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
    # The no-account MCP tier: the Worker counts its requests by the hour and reports
    # "high" when three full hours in a row passed its alert line in the last day (MCP_ANON_ALERT_HOURLY).
    try:
        mcp_problems, mcp_notes = evaluate_mcp(fetch(os.environ.get('SITE', 'https://opax.com.au') + '/api/mcp/status'))
        problems.extend(mcp_problems)
        notes.extend(mcp_notes)
    except Exception as error:
        warnings.append(f'cannot read MCP volume status: {error}')
    # ChatGPT's server addresses get the shared ceiling in the no-account limits; OpenAI changes the list.
    try:
        from refresh_mcp_egress import FILE as egress_file, SOURCE as egress_source, missing_ranges
        behind = missing_ranges(fetch(egress_source), egress_file.read_text())
        if behind:
            warnings.append(f'OpenAI publishes {len(behind)} server ranges the MCP limits do not hold (first: {behind[0]}); '
                            'run python3 scripts/refresh_mcp_egress.py --write and deploy')
    except Exception as error:
        warnings.append(f'cannot check the OpenAI server range list: {error}')
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
