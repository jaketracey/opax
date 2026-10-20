"""Bounded SA acquisition. Successful bodies stay private; refusals persist.

No automatic redirects, proxies, alternative identity, API or retry. Reuse the
Queensland robots matcher, including wildcard and longest-path allow rules.
"""
from datetime import datetime, timezone
from http.client import HTTPException
import hashlib
import fcntl
import json
from pathlib import Path
import re
import sys
import time
from urllib import error, parse, request, robotparser

from scripts.qld_budget.acquire import NoRedirect, robots_allowed, UA

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / 'data/staged/sa-budget'
CACHE = ROOT / 'portal/private/sa-budget/acquisition'
BASE = 'https://data.sa.gov.au'
DATASETS = ('budget-2015-16-data', 'general-government-sector-expenses-by-function-and-by-economic-type')


def host_stopped(r):
    return r.get('challenge', False) or r.get('error') == 'connection-error-or-timeout' or r.get('status') in (401, 403, 429)


def acquire(url, kind):
    STAGE.mkdir(parents=True, exist_ok=True)
    # A yielded shell process must not allow a second invocation to race the
    # ledger or start a request while the first response is still in flight.
    with (STAGE / '.acquire.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return _acquire(url, kind)


def _acquire(url, kind):
    STAGE.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    ledger_path = STAGE / 'receipts.json'
    ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else []
    parts = parse.urlsplit(url)
    if kind not in ('robots','terms','dataset','resource','download','redirect') or (kind == 'robots') != (parts.path == '/robots.txt'):
        raise ValueError('Request kind must match authorised path')
    if parts.scheme != 'https' or parts.netloc != 'data.sa.gov.au' or parts.query or parts.fragment:
        raise ValueError('Exact authorised same-host URLs only')
    if any(host_stopped(r) for r in ledger):
        raise ValueError('Host stopped: no further requests authorised')
    url_hash = hashlib.sha256(url.encode()).hexdigest()
    prior = next((r for r in ledger if r['url'] == url or r.get('requested_url_sha256') == url_hash), None)
    if prior:
        return prior
    original = any(parts.path == '/data/dataset/' + d or parts.path.startswith('/data/dataset/' + d + '/resource/') for d in DATASETS)
    redirect = next((r for r in ledger if r.get('location') and parse.urljoin(r['url'], r['location']) == url), None)
    linked_download = '/download/' in parts.path and any(
        url in (CACHE / r['sha256']).read_text() for r in ledger
        if r['kind'] == 'resource' and r['body_retained'])
    if not (original or linked_download or parts.path in ('/robots.txt', '/copyright') or redirect):
        raise ValueError('Outside authorised datasets / recorded redirect')
    if '/download/' in parts.path or redirect:
        from html import unescape
        pages = [unescape((CACHE / r['sha256']).read_text()) for r in ledger if r['kind'] == 'resource' and r['body_retained']]
        terms = any(r['url'] == BASE + '/copyright' and r['body_retained'] for r in ledger)
        source = redirect['url'] if redirect else url
        if not terms or not any(source in p and 'creativecommons.org/licenses/by/4.0' in p for p in pages):
            raise ValueError('Download requires checked source grant and publisher terms')
        downloads = [r for r in ledger if r['kind'] == 'download']
        if kind == 'download' and len(downloads) >= 15:
            raise ValueError('Budget workbook cap reached')
    robots_text = ''
    if kind != 'robots':
        robots = next((r for r in ledger if r['kind'] == 'robots' and r['body_retained']), None)
        if not robots:
            raise ValueError('Robots first')
        robots_text = (CACHE / robots['sha256']).read_text()
        if not robots_allowed(robots_text, url):
            raise ValueError('Robots disallows exact URL; held without request')
    policy = robotparser.RobotFileParser()
    policy.parse(robots_text.splitlines())
    delay = max(5.11, policy.crawl_delay(UA) or policy.crawl_delay('*') or 0)
    if ledger:
        time.sleep(max(0, delay - (time.time() - datetime.fromisoformat(ledger[-1]['snapshot']).timestamp())))
    started = datetime.now(timezone.utc).isoformat()
    body, status, failure, content_type, location = b'', None, None, None, None
    try:
        opener = request.build_opener(request.ProxyHandler({}), NoRedirect())
        with opener.open(request.Request(url, headers={'User-Agent': UA}), timeout=30) as response:
            status, content_type = response.status, response.headers.get('Content-Type')
            body = response.read()
    except error.HTTPError as exc:
        status, content_type, location = exc.code, exc.headers.get('Content-Type'), exc.headers.get('Location')
        try:
            body = exc.read()
            failure = 'http-error'
        except (HTTPException, OSError):
            failure = 'connection-error-or-timeout'
    except (error.URLError, HTTPException, TimeoutError, OSError):
        failure = 'connection-error-or-timeout'
    challenge = any(x in body.lower() for x in (b'cf-chl-', b'just a moment...', b'verify you are human', b'captcha challenge'))
    retained = status == 200 and not challenge and failure is None
    receipt = dict(url=url, host=parts.netloc, kind=kind, requested_at=started,
                   snapshot=datetime.now(timezone.utc).isoformat(), status=status,
                   sha256=hashlib.sha256(body).hexdigest(), bytes=len(body), content_type=content_type,
                   location=location, challenge=challenge, error=failure, stopped=not retained,
                   body_retained=retained, method='GET', user_agent=UA, automatic_redirects=False,
                   proxy=False, minimum_delay_seconds=delay)
    # One publisher basename embeds a local desktop account identifier. The
    # exact link remains in private source HTML; committed evidence uses its
    # hash and stable resource UUID, without repeating that identifier.
    receipt['requested_url_sha256'] = url_hash
    receipt['resource_id'] = re.search(r'/resource/([^/]+)', url)[1] if '/resource/' in url else None
    if '/download/cusers' in url.lower():
        receipt['url'] = None
        receipt['url_withheld_reason'] = 'Publisher basename embeds a local desktop account identifier; exact link retained in private source HTML'
    ledger.append(receipt)
    ledger_path.write_text(json.dumps(ledger, indent=2) + '\n')
    if retained:
        (CACHE / receipt['sha256']).write_bytes(body)
    if host_stopped(receipt):
        raise SystemExit('STOP: host held; compact receipt saved, body discarded')
    return receipt


if __name__ == '__main__':
    print(json.dumps(acquire(sys.argv[1], sys.argv[2])))
