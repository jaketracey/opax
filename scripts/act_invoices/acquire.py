"""ACT-only, locked acquisition using the SA lane's robots/refusal primitives.

Every exact query URL is checked before requesting. Never follows redirects or
retries a refused host; successful bodies stay private and receipts stay public.
"""
from datetime import datetime, timezone
from http.client import HTTPException
import fcntl
import hashlib
import json
from pathlib import Path
import time
from urllib import error, parse, request, robotparser
from scripts.sa_budget.acquire import NoRedirect, robots_allowed, UA, host_stopped

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / 'data/staged/act-invoices'
CACHE = ROOT / 'portal/private/act-invoices/acquisition'
BASE = 'https://www.data.act.gov.au'
ID = 'kzmf-7uhp'
META = BASE + '/api/views/' + ID + '.json'
PAGE = BASE + '/Government-and-Transparency/Notifiable-Invoices-Register/' + ID
CC = 'https://creativecommons.org/licenses/by/4.0/'


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def acquire(url, kind, *, stage=STAGE, cache=CACHE, opener=None, sleep=time.sleep):
    stage.mkdir(parents=True, exist_ok=True)
    with (stage / '.acquire.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return _acquire(url, kind, stage, cache, opener, sleep)


def _acquire(url, kind, stage, cache, opener, sleep):
    cache.mkdir(parents=True, exist_ok=True)
    path = stage / 'receipts.json'
    ledger = json.loads(path.read_text()) if path.exists() else []
    def hold(reason, requested=False):
        receipt = dict(url=url, kind=kind, requested=requested, hold=reason,
                       snapshot=datetime.now(timezone.utc).isoformat())
        ledger.append(receipt)
        save(path, ledger)
        save(stage / 'hold.json', receipt)
        raise ValueError(reason)
    if (stage / 'hold.json').exists() or any(host_stopped(r) for r in ledger):
        raise ValueError('Source held; no further requests')
    parts = parse.urlsplit(url)
    if parts.scheme != 'https' or parts.netloc != 'www.data.act.gov.au' or parts.fragment:
        raise ValueError('Exact authorised ACT host only')
    if kind == 'robots':
        valid = url == BASE + '/robots.txt'
    elif kind == 'metadata':
        valid = url == META
    elif kind == 'page':
        # Only canonical landing path or an explicitly recorded same-host redirect.
        valid = url == PAGE or any(parse.urljoin(r['url'], r.get('location') or '') == url and r.get('kind') == 'page' for r in ledger)
    elif kind == 'data':
        valid = parts.path == '/resource/' + ID + '.json' or parts.path == '/api/views/' + ID + '/rows.json'
        if parts.path.endswith('/rows.json'):
            valid = valid and parts.query in ('', 'accessType=DOWNLOAD')
        else:
            params = parse.parse_qs(parts.query, keep_blank_values=True)
            valid = valid and set(params) <= {'$limit', '$offset', '$order'} and all(len(v) == 1 for v in params.values())
        if not valid:
            raise ValueError('Outside authorised data URLs')
        metadata = next((r for r in ledger if r.get('kind') == 'metadata' and r.get('body_retained')), None)
        if not metadata:
            hold('Dataset-specific licence must be checked before data acquisition')
        m = json.loads((cache / metadata['sha256']).read_text())
        if m.get('id') != ID or m.get('license', {}).get('termsLink') not in (CC, 'http://creativecommons.org/licenses/by/4.0/legalcode', 'https://creativecommons.org/licenses/by/4.0/legalcode'):
            hold('Dataset-specific CC BY 4.0 grant missing or changed')
    else:
        raise ValueError('Unknown request kind')
    if not valid:
        raise ValueError('Outside authorised path')
    prior = next((r for r in ledger if r['url'] == url and r.get('body_retained')), None)
    if prior:
        return prior
    robots_text = ''
    if kind != 'robots':
        robots = next((r for r in ledger if r.get('kind') == 'robots' and r.get('body_retained')), None)
        if not robots:
            hold('Robots first')
        robots_text = (cache / robots['sha256']).read_text()
        if not robots_allowed(robots_text, url):
            hold('Robots disallows exact URL including query; no request made')
    policy = robotparser.RobotFileParser()
    policy.parse(robots_text.splitlines())
    delay = max(5.11, policy.crawl_delay(UA) or policy.crawl_delay('*') or 0)
    requested = [r for r in ledger if r.get('requested', True)]
    if requested:
        sleep(max(0, delay - (time.time() - datetime.fromisoformat(requested[-1]['snapshot']).timestamp())))
    started = datetime.now(timezone.utc).isoformat()
    body, status, failure, content_type, location = b'', None, None, None, None
    try:
        transport = opener or request.build_opener(request.ProxyHandler({}), NoRedirect())
        with transport.open(request.Request(url, headers={'User-Agent': UA}), timeout=30) as response:
            status, content_type = response.status, response.headers.get('Content-Type')
            body = response.read()
    except error.HTTPError as exc:
        status, content_type, location = exc.code, exc.headers.get('Content-Type'), exc.headers.get('Location')
        try:
            body = exc.read()
            failure = 'http-error'
        except (HTTPException, OSError):
            failure = 'connection-error-or-timeout'
        finally:
            exc.close()
    except (error.URLError, HTTPException, TimeoutError, OSError):
        failure = 'connection-error-or-timeout'
    challenge = any(x in body.lower() for x in (b'cf-chl-', b'just a moment...', b'verify you are human', b'captcha challenge'))
    retained = status == 200 and not challenge and failure is None
    receipt = dict(url=url, host=parts.netloc, kind=kind, requested=True, requested_at=started,
                   snapshot=datetime.now(timezone.utc).isoformat(), status=status,
                   sha256=hashlib.sha256(body).hexdigest(), bytes=len(body), content_type=content_type,
                   location=location, challenge=challenge, error=failure, stopped=not retained,
                   body_retained=retained, method='GET', user_agent=UA, automatic_redirects=False,
                   proxy=False, minimum_delay_seconds=delay, robots_allowed=True if kind != 'robots' else None)
    ledger.append(receipt)
    save(path, ledger)
    if retained:
        (cache / receipt['sha256']).write_bytes(body)
    if not retained and not (kind == 'page' and status in (301, 302, 303, 307, 308)):
        save(stage / 'hold.json', receipt)
        raise ValueError('STOP: source held; receipt saved, response discarded')
    return receipt


if __name__ == '__main__':
    import sys
    try:
        r = acquire(sys.argv[1], sys.argv[2])
        print(json.dumps({k:r.get(k) for k in ('kind','status','sha256','bytes','snapshot','location')}))
    except ValueError as exc:
        raise SystemExit(str(exc))
