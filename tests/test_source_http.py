"""Source access policy, including a repository-wide regression guard."""
import ast
from datetime import datetime, timezone
from email.utils import format_datetime
import io
import json
from pathlib import Path
import re
import subprocess
import sqlite3
import urllib.error
import urllib.request
import urllib.response
from unittest import mock

import pytest
import requests

from parli.ingest import http

ROOT = Path(__file__).resolve().parents[1]
FIX = Path(__file__).parent / 'fixtures/source_access'


@pytest.fixture(autouse=True)
def isolated_access(monkeypatch, tmp_path):
    monkeypatch.setenv('OPAX_SOURCE_STATUS_FILE', str(tmp_path / 'access.json'))
    monkeypatch.delenv('OPAX_SOURCE_NAME', raising=False)
    http._logged.clear()
    monkeypatch.setattr(http, 'pace', lambda *a: None)


class Transport(requests.adapters.BaseAdapter):
    def __init__(self, responses):
        self.responses = iter(responses)
        self.sent = []

    def send(self, request, **kwargs):
        self.sent.append((request, kwargs))
        status, body, headers = next(self.responses)
        response = requests.Response()
        response.status_code, response._content = status, body
        response.headers = requests.structures.CaseInsensitiveDict(headers)
        response.url, response.request = request.url, request
        return response

    def close(self): pass


def session(responses):
    client = http.Session()
    transport = Transport(responses)
    client.mount('https://', transport)
    return client, transport


@pytest.mark.parametrize('family', ['Mozilla', 'Firefox', 'Chrome', 'Safari', 'AppleWebKit', 'Gecko'])
def test_requests_cannot_override_identity(family):
    client, wire = session([(200, b'ok', {})])
    client.headers['User-Agent'] = family + '/128.0'
    client.get('https://example.test/source', headers={'user-agent': family + '/1.0'}, proxies={'https': 'http://proxy.invalid'})
    assert wire.sent[0][0].headers['User-Agent'] == http.USER_AGENT
    assert not wire.sent[0][1]['proxies']
    assert not client.trust_env


def test_redirect_keeps_honest_identity():
    client, wire = session([(302, b'', {'Location': '/detail'}), (200, b'ok', {})])
    client.get('https://example.test/source')
    assert len(wire.sent) == 2
    assert all(request.headers['User-Agent'] == http.USER_AGENT for request, _ in wire.sent)


def test_prepared_requests_cannot_bypass_identity():
    client, wire = session([(200, b'ok', {})])
    prepared = requests.Request('GET', 'https://example.test', headers={'User-Agent': 'spoof'}).prepare()
    client.send(prepared)
    assert wire.sent[0][0].headers['User-Agent'] == http.USER_AGENT


def test_internal_api_fetches_identify_opax_without_changing_retry_policy():
    from parli import arag
    response = mock.Mock(ok=True, status_code=200)
    response.json.return_value = {'records': []}
    with mock.patch.object(arag.requests, 'request', return_value=response) as wire:
        assert arag._request('GET', 'https://example.test/fixture', {'user-agent': 'spoof'}) == {'records': []}
    assert wire.call_args.kwargs['headers']['User-Agent'] == http.USER_AGENT


@pytest.mark.parametrize('status,fixture', [(403, '403.html'), (200, 'challenge.html')])
def test_refusal_stops_on_first_response_and_preserves_file(status, fixture, tmp_path, capsys):
    published = tmp_path / 'published.json'
    published.write_bytes(b'{"existing":"last good"}')
    client, wire = session([(status, (FIX / fixture).read_bytes(), {})])
    with pytest.raises(http.SourceRefused) as exc:
        response = client.get('https://example.test/source')
        published.write_bytes(response.content)
    assert exc.value.code == 4
    assert published.read_bytes() == b'{"existing":"last good"}'
    assert len(wire.sent) == 1
    state = json.loads((tmp_path / 'access.json').read_text())
    assert state['example.test']['status'] == 'paused'
    assert capsys.readouterr().out.count(http.PAUSE_MESSAGE) == 1


def test_known_paused_hosts_and_service_never_send_requests():
    client, wire = session([])
    for host in [*http.PAUSED_HOSTS, 'api.firecrawl.dev']:
        with pytest.raises(http.SourceRefused):
            client.get('https://' + host + '/source')
    assert not wire.sent


def test_urllib_forces_identity_and_does_not_cache_challenge():
    req = http.Request('https://example.test/source', headers={'user-agent': 'spoof'})
    assert req.get_header('User-agent') == http.USER_AGENT
    response = mock.Mock()
    response.headers = {}
    response.getcode.return_value = 200
    response.geturl.return_value = req.full_url
    response.read.return_value = (FIX / 'challenge.html').read_bytes()
    response.__enter__ = mock.Mock(return_value=response)
    response.__exit__ = mock.Mock(return_value=False)
    opener = mock.Mock(); opener.open.return_value = response
    with pytest.raises(http.SourceRefused):
        http.open_url(opener, req)
    opener.open.assert_called_once()


def test_urllib_403_stops_before_backoff():
    opener = mock.Mock()
    opener.open.side_effect = urllib.error.HTTPError('https://example.test', 403, 'Forbidden', {}, io.BytesIO(b''))
    with pytest.raises(http.SourceRefused):
        http.open_url(opener, http.Request('https://example.test'))
    opener.open.assert_called_once()


def test_bill_redirect_terminal_is_not_followed():
    from parli.ingest.bill_texts import NoRedirect
    requests_seen = []
    class FixtureHTTP(urllib.request.HTTPHandler):
        def http_open(self, request):
            requests_seen.append((request.selector, request.get_header('User-agent')))
            response = urllib.response.addinfourl(io.BytesIO(b''), {'Location': '/download/forbidden'}, request.full_url, 301)
            response.msg = 'Moved permanently'
            return response
    with pytest.raises(urllib.error.HTTPError) as error:
        http.open_url(http.build_opener(NoRedirect(), FixtureHTTP()), http.Request('http://example.test/display'))
    assert error.value.code == 301
    assert requests_seen == [('/display', http.USER_AGENT)]


def test_retry_after_seconds_and_dates_are_not_capped():
    stamp = datetime(2026, 10, 10, tzinfo=timezone.utc).timestamp()
    assert http.retry_after('240') == 240
    assert http.retry_after(format_datetime(datetime.fromtimestamp(stamp + 300, timezone.utc)), now=stamp) == 300
    assert http.retry_after('invalid') == 0


def test_throttling_honours_retry_after():
    client, wire = session([(429, b'', {'Retry-After': '240'}), (200, b'ok', {})])
    with mock.patch.object(http.time, 'sleep') as sleep:
        assert client.get('https://example.test/source').content == b'ok'
    sleep.assert_called_once_with(240)
    assert len(wire.sent) == 2


def test_register_replace_rolls_back_committed_batches_on_later_refusal():
    db = sqlite3.connect(':memory:')
    db.execute('CREATE TABLE records (id INTEGER)')
    db.execute('INSERT INTO records VALUES (1)'); db.commit()

    @http.preserve_on_refusal
    def fetch_register(staged):
        staged.execute('DELETE FROM records'); staged.commit()
        staged.execute('INSERT INTO records VALUES (2)'); staged.commit()
        http.check_response('https://example.test', 403)

    with pytest.raises(http.SourceRefused): fetch_register(db)
    assert db.execute('SELECT id FROM records').fetchall() == [(1,)]


def test_aec_refusal_precedes_any_register_deletion(monkeypatch, tmp_path):
    from parli.ingest import donations
    db = sqlite3.connect(':memory:')
    db.execute('CREATE TABLE donations (id INTEGER)')
    db.execute('INSERT INTO donations VALUES (1)'); db.commit()
    monkeypatch.setattr(donations, 'get_db', lambda: db)
    monkeypatch.setattr(donations, 'init_db', lambda db: None)
    monkeypatch.setattr(donations, 'CACHE_DIR', tmp_path)
    monkeypatch.setattr(donations, 'AEC_ZIPS', {'snapshot': 'https://example.test'})
    monkeypatch.setattr('sys.argv', ['donations'])
    def refuse(url): http.check_response(url, 403)
    monkeypatch.setattr(donations, 'download_zip', refuse)
    with pytest.raises(http.SourceRefused): donations.main()
    assert db.execute('SELECT id FROM donations').fetchall() == [(1,)]


def test_repository_cannot_reintroduce_browser_identity_or_bypass_flag():
    from scripts.source_access_guard import scan
    assert not (failures := scan(ROOT)), '\n'.join(failures)


def test_python_fetch_paths_cannot_bypass_shared_transport():
    paths = [*(ROOT / 'parli/ingest').glob('*.py'), *(ROOT / 'scripts').rglob('*.py'), ROOT / 'download_hansard.py', ROOT / 'download_hansard_fast.py']
    direct = {'requests.Session', 'requests.get', 'requests.post', 'requests.request', 'urllib.request.Request', 'urllib.request.urlopen'}
    failures = []
    for path in paths:
        if path.name.startswith('test') or path.name == 'http.py': continue
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and ast.unparse(node.func) in direct:
                failures.append(f'{path.relative_to(ROOT)}:{node.lineno}')
    assert not failures, '\n'.join(failures)


def test_node_build_fetches_use_same_identity_and_refusal_fixtures(tmp_path):
    code = """
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { honestFetch, USER_AGENT, SourceRefused } from './scripts/lib/http.mjs';
assert.equal(USER_AGENT, JSON.parse(readFileSync('./parli/ingest/user-agent.json','utf8')).user_agent);
let calls = 0;
globalThis.fetch = async (url, options) => {
  calls++; assert.equal(options.headers.get('user-agent'), USER_AGENT);
  return new Response(readFileSync('./tests/fixtures/source_access/challenge.html'), {headers:{'content-type':'text/html'}});
};
await assert.rejects(honestFetch('https://example.test', {headers:{'user-agent':'spoof'}}), SourceRefused);
assert.equal(calls, 1);
process.exitCode = 0;
"""
    subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, check=True, capture_output=True)


def test_node_cli_refusal_exits_with_preserved_source_status():
    code = """
import { honestFetch, runSource } from './scripts/lib/http.mjs';
globalThis.fetch = async () => new Response('Forbidden', { status: 403 });
await runSource(async () => { await honestFetch('https://example.test'); throw new Error('must not continue'); });
"""
    result = subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, capture_output=True)
    assert result.returncode == 4
    assert result.stderr.decode().count(http.PAUSE_MESSAGE) == 1


def test_austender_valid_200_json_is_never_a_challenge():
    body = (FIX / 'austender.json').read_bytes()
    client, wire = session([(200, body, {'Content-Type': 'application/json'})])
    assert client.get('https://example.test/feed', expected_json=True).json()['success']
    assert len(wire.sent) == 1


@pytest.mark.parametrize('body,headers,expected_json', [
    (b'ok', {'cf-mitigated': 'challenge'}, False),
    (b'<html><body id="cf-chl-widget">Waiting</body></html>', {}, False),
    (b'<html><body><script src="/cdn-cgi/challenge-platform/entry"></script></body></html>', {}, False),
    (b'<html><body>Unavailable</body></html>', {'Content-Type': 'text/html'}, True),
    ((FIX / 'challenge.html').read_bytes(), {'Content-Type': 'text/plain'}, False),
])
def test_headers_structure_and_json_mismatch_pause(body, headers, expected_json):
    client, wire = session([(200, body, headers)])
    with pytest.raises(http.SourceRefused):
        client.get('https://example.test/source', expected_json=expected_json)
    assert len(wire.sent) == 1


def test_ordinary_html_about_access_controls_does_not_pause():
    body = b'<html><title>Procurement</title><body>Our web application firewall: verify you are human, enable JavaScript and cookies to continue.</body></html>'
    http.check_response('https://example.test', 200, body)


@pytest.mark.parametrize('mime', ['text/plain', 'application/json', 'text/html'])
def test_node_detects_challenges_regardless_of_mime(mime):
    code = """
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { honestFetch, SourceRefused } from './scripts/lib/http.mjs';
globalThis.fetch = async () => new Response(readFileSync('./tests/fixtures/source_access/challenge.html'), {headers:{'content-type':MIME}});
await assert.rejects(honestFetch('https://example.test'), SourceRefused);
process.exitCode = 0;
""".replace('MIME', json.dumps(mime))
    subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, check=True, capture_output=True)


def test_node_accepts_austender_200_json():
    code = """
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { honestFetch } from './scripts/lib/http.mjs';
globalThis.fetch = async () => new Response(readFileSync('./tests/fixtures/source_access/austender.json'), {headers:{'content-type':'application/json'}});
assert.equal((await (await honestFetch('https://example.test', {expectedJson:true})).json()).success, true);
"""
    subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT, check=True, capture_output=True)


def test_qld_contact_log_refusal_keeps_retained_rows(monkeypatch):
    from parli.ingest import qld_lobbyists as source
    db = sqlite3.connect(':memory:')
    source.init_lobbyist_tables(db)
    db.execute("INSERT INTO qld_lobbyist_contacts(contact_id) VALUES ('retained')")
    db.commit()
    monkeypatch.setattr(source.source_http, 'get', lambda *a, **kw: mock.Mock(ok=True, content=b'<html><div class="entitylist"><table></table></div></html>'))
    with pytest.raises(http.SourceRefused):
        source.store_contact_entries(db, source.scrape_contact_log())
    assert db.execute('SELECT contact_id FROM qld_lobbyist_contacts').fetchall() == [('retained',)]


def test_qld_contact_log_direct_static_data(monkeypatch):
    from parli.ingest import qld_lobbyists as source
    body = b'<html><table class="table"><tbody><tr><td>Fixture firm</td><td>Fixture company</td><td>Public office</td><td>Portfolio</td><td>2026-10-10</td></tr></tbody></table></html>'
    monkeypatch.setattr(source.source_http, 'get', lambda *a, **kw: mock.Mock(ok=True, content=body))
    assert source.scrape_contact_log()[0]['client_name'] == 'Fixture company'


def test_probe_records_refusal_and_continues(monkeypatch, tmp_path, capsys):
    from scripts.vm import probe_sources as probe
    monkeypatch.setattr(probe, 'load_env', lambda: None)
    monkeypatch.setattr('sys.argv', ['probe_sources'])
    probes = [dict(name='refused fixture', step='refused', url='https://refused.test', ua=http.USER_AGENT),
              dict(name='healthy fixture', step='healthy', url='https://healthy.test', ua=http.USER_AGENT, ok=lambda r: True)]
    monkeypatch.setattr(probe, 'probes', lambda: probes)
    monkeypatch.setattr(probe.source_http, 'get', lambda *a, **kw: mock.Mock(text='fixture IP'))
    calls = []
    def fetch(method, url, **kw):
        calls.append(url)
        if url == 'https://refused.test': raise http.SourceRefused(url, 'HTTP 403')
        return mock.Mock(status_code=200, text='ok', headers={})
    monkeypatch.setattr(probe.source_http, 'request', fetch)
    assert probe.main() == 0
    assert calls == [p['url'] for p in probes]
    out = capsys.readouterr().out
    assert 'PAUSED' in out and 'healthy fixture' in out
    assert json.loads((tmp_path / 'access.json').read_text())['refused.test']['status'] == 'paused'
