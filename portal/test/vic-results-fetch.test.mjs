import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Actual parser and CLI, cached HTML only. Every network refusal is simulated.
test('VEC parser and 2026 CLI handle preference traps and preserve data on refusal',()=>{
  const result=spawnSync('python3',['-I','-',fileURLToPath(new URL('../../scripts/fetch_vec_results.py',import.meta.url))],{encoding:'utf8',input:`
import importlib.util, json, re, sys, tempfile, urllib.error
from pathlib import Path
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('vec_results', sys.argv[1])
vec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vec)
vec.OFFLINE = True

def elected():
    return '<h3>Elected member</h3><p><b>QUILL, Avery</b><br><em>Liberal</em></p>'

def row(party, share):
    return '<tr><td>Quill</td><td>' + party + '</td><td>1</td><td>' + str(share) + '%</td></tr>'

def cache_name(url):
    return re.sub(r'[^a-z0-9]+', '-', url.lower().split('vec.vic.gov.au', 1)[1]).strip('-') + '.html'

with tempfile.TemporaryDirectory(prefix='opax-vec-parser-') as scratch:
    cache = Path(scratch)
    completed = elected() + 'Results after distribution of preferences<table>' + row('Liberal', 55.25) + row('Australian Labor Party', 44.75) + '</table>'
    parsed = vec.parse(completed, 'held', cache)
    assert parsed['margin'] == 5.25 and parsed['against'] == 'Labor'
    # Three remaining candidates are not a two-candidate count.
    stopped = elected() + 'Results after distribution of preferences<table>' + row('Liberal', 51) + row('Australian Labor Party', 29) + row('Australian Greens', 20) + '</table>'
    inline = '<h3>Two candidate preferred vote</h3><table><tr><th>Party</th><th>Candidate</th><th>Votes</th><th>Percentage</th></tr><tr><td>Liberal</td><td>Quill</td><td>6</td><td>60%</td></tr><tr><td>Australian Labor Party</td><td>Wren</td><td>4</td><td>40%</td></tr></table>'
    assert vec.parse(stopped + inline, 'held', cache)['margin'] == 10
    path = '/results/state-election-results/2026-state-election-results/results-by-district/test-2cp-results-by-voting-centre'
    linked = '<main><table><tr><td>Candidate</td><td>Quill</td><td>Wren</td></tr><tr><td>Party</td><td>Liberal</td><td>Australian Labor Party</td></tr><tr><td>Percentage of formal vote</td><td>60%</td><td>40%</td></tr></table>'
    (cache / cache_name(vec.VEC + path)).write_text(linked)
    assert vec.parse(stopped + '<a href="' + path + '">Count</a>', 'held', cache)['margin'] == 10
    try:
        vec.parse(stopped, 'held', cache)
        raise AssertionError('Incomplete distribution accepted')
    except ValueError:
        pass
    index = vec.VEC + '/results/state-election-results/2026-state-election-results'
    paths = ['/results/state-election-results/2026-state-election-results/results-by-district/test-' + chr(97 + i // 26) + chr(97 + i % 26) + '-district-results' for i in range(88)]
    (cache / cache_name(index)).write_text(''.join('<a href="' + p + '">Result</a>' for p in paths))
    for i, path in enumerate(paths):
        (cache / cache_name(vec.VEC + path)).write_text('<h1>Seat ' + str(i) + ' District results</h1>' + completed)
    output = cache / 'results.json'
    with patch.object(sys, 'argv', ['fetch_vec_results.py', '--year', '2026', '--election-day', '2026-11-28', '--cache', str(cache), '--out', str(output), '--offline']):
        vec.main()
        source = json.loads(output.read_text())
        assert source['election_day'] == '2026-11-28' and source['status'] == 'final'
        assert len(source['districts']) == 88
        assert all('since' not in r for r in source['districts'].values())
        before = output.read_bytes()
        (cache / cache_name(vec.VEC + paths[-1])).unlink()
        try:
            vec.main()
            raise AssertionError('Offline cache miss accepted')
        except ValueError:
            pass
        assert output.read_bytes() == before
    vec.OFFLINE = False
    calls = []
    class Refusing:
        def open(self, req, **kwargs):
            calls.append(req)
            raise urllib.error.HTTPError(req.full_url, 403, 'Refused', {}, None)
    with patch.object(vec.urllib.request, 'build_opener', return_value=Refusing()):
        try:
            vec.fetch(vec.VEC + paths[-1], cache)
            raise AssertionError('Refusal accepted')
        except urllib.error.HTTPError:
            pass
    assert len(calls) == 1 and calls[0].get_header('User-agent') == 'opax-improve-audit'
    assert output.read_bytes() == before
print('Offline parser, 88-district 2026 command and refusal preservation passed')
`});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  assert.match(result.stdout,/Offline parser, 88-district 2026 command and refusal preservation passed/);
});
