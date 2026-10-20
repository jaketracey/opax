"""One sequential, original-URL-only acquisition; no retry after host refusal.

Bodies are private local evidence. The committed ledger contains receipts only.
Run from the repository root; a repeated URL is read from this run's cache.
"""
from datetime import datetime, timezone
from http.client import HTTPException
import hashlib
import json
from pathlib import Path
import sys
import time
from urllib import error, parse, request
import re

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / 'data/staged/qld-budget'
CACHE = ROOT / 'portal/private/qld-budget/acquisition'
HOST = 'www.data.qld.gov.au'
BASE = f'https://{HOST}'
DATASETS = ('2026-27-state-budget-budget-paper-3-capital-statement',
            '2026-27-state-budget-budget-paper-4-budget-measures')
DATASET_IDS = ('fb0df743-a719-476e-a3ae-4d4e3a0d9124', 'e37910f7-0ae5-4a20-9e59-dcaa30517080')
UA = json.loads((ROOT / 'parli/ingest/user-agent.json').read_text())['user_agent']


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def robots_allowed(text, url):
    """Match longest applicable Allow/Disallow, including portal wildcard rules."""
    groups = []
    agents, rules = [], []
    for raw in text.splitlines() + ['User-agent: end-of-policy']:
        line = raw.split('#', 1)[0].strip()
        if ':' not in line:
            continue
        key, val = (s.strip() for s in line.split(':', 1))
        if key.lower() == 'user-agent':
            if rules:
                groups.append((agents, rules))
                agents, rules = [], []
            agents.append(val.lower())
        elif key.lower() in ('allow', 'disallow') and val:
            rules.append((key.lower(), val))
    matches = [(max((len(a) for a in agents if a != '*' and a in UA.lower()), default=0), rules)
               for agents, rules in groups if '*' in agents or any(a in UA.lower() for a in agents)]
    if not matches:
        return True
    specificity = max(s for s, _ in matches)
    parts = parse.urlsplit(url)
    path = parts.path + ('?' + parts.query if parts.query else '')
    decisions = []
    for score, rules in matches:
        if score != specificity:
            continue
        for directive, pattern in rules:
            end = pattern.endswith('$')
            literal = pattern[:-1] if end else pattern
            regex = '^' + re.escape(literal).replace(r'\*', '.*') + ('$' if end else '')
            if re.search(regex, path):
                decisions.append((len(literal.replace('*', '')), directive == 'allow'))
    return max(decisions, default=(0, True))[1]


def host_stopped(receipt):
    return (receipt.get('challenge', False) or receipt.get('error') == 'connection-error-or-timeout'
            or (receipt['stopped'] and receipt['status'] not in (301, 302, 303, 307, 308)))


def acquire(url, kind):
    STAGE.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    ledger_path = STAGE / 'receipts.json'
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else []
    parts = parse.urlsplit(url)
    if parts.scheme != 'https' or parts.netloc != HOST or parts.query or parts.fragment:
        raise ValueError('Only exact original same-host URLs')
    if not (parts.path == '/robots.txt' or parts.path in ('/article/copyright', '/article/terms-and-conditions')
            or any(parts.path == '/dataset/' + d or parts.path.startswith('/dataset/' + d + '/resource/') for d in DATASETS + DATASET_IDS)):
        raise ValueError('Outside the two authorised datasets')
    if '/download/' in parts.path:
        import html
        pages = [html.unescape((CACHE / r['sha256']).read_text()) for r in ledger
                 if r['kind'] == 'resource' and r['status'] == 200 and not r['stopped']]
        if not any(url in page and 'https://creativecommons.org/licenses/by/4.0/' in page for page in pages):
            raise ValueError('Download must be the original link on a checked resource page')
    # Redirects hold the individual file, rather than constituting a refusal.
    # A real host refusal remains effective on subsequent invocations.
    if any(host_stopped(r) for r in ledger):
        raise ValueError('Host stopped: no further requests authorised')
    prior = next((r for r in ledger if r['url'] == url), None)
    if prior:
        print(json.dumps(prior))
        return
    if parts.path != '/robots.txt':
        robots = next((r for r in ledger if r['kind'] == 'robots' and r['status'] == 200), None)
        if not robots:
            raise ValueError('Robots first')
        if not robots_allowed((CACHE / robots['sha256']).read_text(), url):
            raise ValueError('Robots disallows exact URL; no request made')
    if ledger:
        completed = datetime.fromisoformat(ledger[-1]['snapshot']).timestamp()
        time.sleep(max(0, 10.1 - (time.time() - completed)))
    started = datetime.now(timezone.utc).isoformat()
    body = b''
    status = None
    failure = None
    content_type = None
    location = None
    try:
        opener = request.build_opener(request.ProxyHandler({}), NoRedirect())
        with opener.open(request.Request(url, headers={'User-Agent': UA}), timeout=30) as response:
            status = response.status
            content_type = response.headers.get('Content-Type')
            body = response.read()
    except error.HTTPError as exc:
        status = exc.code
        location = exc.headers.get('Location')
        try:
            body = exc.read()
            failure = 'http-error'
        except (HTTPException, OSError):
            failure = 'connection-error-or-timeout'
    except (error.URLError, HTTPException, TimeoutError, OSError):
        failure = 'connection-error-or-timeout'
    challenge = any(marker in body.lower() for marker in
                    (b'cf-chl-', b'just a moment...', b'verify you are human', b'captcha challenge'))
    stopped = status != 200 or challenge or failure is not None
    receipt = dict(url=url, host=HOST, kind=kind, requested_at=started,
                   snapshot=datetime.now(timezone.utc).isoformat(), status=status,
                   sha256=hashlib.sha256(body).hexdigest(), bytes=len(body),
                   content_type=content_type, location=location, challenge=challenge, error=failure,
                   stopped=stopped, body_retained=not stopped, method='GET',
                   user_agent=UA, automatic_redirects=False, proxy=False)
    ledger.append(receipt)
    ledger_path.write_text(json.dumps(ledger, indent=2) + '\n')
    if not stopped:
        (CACHE / receipt['sha256']).write_bytes(body)
    print(json.dumps(receipt))
    if host_stopped(receipt):
        raise SystemExit('STOP: host held; response body discarded after hashing')


if __name__ == '__main__':
    acquire(sys.argv[1], sys.argv[2])
