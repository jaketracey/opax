"""Synthetic VEC report parsing and atomic, refusal-safe acquisition."""
import json
from pathlib import Path

import pytest
import xlrd

from scripts import fetch_vec_candidates as vec

FIX = Path(__file__).parent / 'fixtures/vec_candidates'
CONFIG = {'nominations_close': '2026-11-09T12:00:00+11:00',
          'districts': [{'name': 'Albert Park'}], 'regions': [{'name': 'Eastern Victoria',
          'source_url': 'https://www.vec.vic.gov.au/electoral-boundaries/state-regions/eastern-victoria-region'}]}
REGION_URL = CONFIG['regions'][0]['source_url'] + '/nominations'


def rows():
    sheet = xlrd.open_workbook(FIX / 'candidates.xls').sheet_by_index(0)
    return [sheet.row_values(i) for i in range(sheet.nrows)]


def test_saved_xls_preserves_ballot_order_trims_party_labels_and_keeps_blank_parties():
    result, snapshot = vec.parse_workbook((FIX / 'candidates.xls').read_bytes(), CONFIG)
    assert snapshot == '2026-11-09'
    assert result['districts']['Albert Park'] == [
        {'name': 'QUILL, Zéphyr', 'party': 'Paper Lantern Party'},
        {'name': 'ASTER, Rowan', 'party': ''},
        {'name': 'MOSS, Avery-June', 'party': 'River & Reed'},
    ]
    assert result['regions']['Eastern Victoria'] == [
        {'name': 'WREN, Sol', 'party': 'River & Reed'},
        {'name': 'BIRCH, Marlow', 'party': 'River & Reed'},
        {'name': 'QUARTZ, Ren', 'party': ''},
        {'name': 'FERN, Iona', 'party': ''},
        {'name': 'SKYLARK', 'party': ''},
    ]
    assert 'contact@example.test' not in json.dumps(result)
    assert 'Tavi Sable' not in json.dumps(result)


def test_region_groups_match_workbook_order_including_unnamed_and_ungrouped():
    lists, _ = vec.parse_workbook((FIX / 'candidates.xls').read_bytes(), CONFIG)
    candidates = lists['regions']['Eastern Victoria']
    grouped = vec.parse_region_groups((FIX / 'region.html').read_bytes(), 'Eastern Victoria', candidates)
    assert [{k: c[k] for k in ('name', 'party')} for c in grouped] == candidates
    assert [(c['group'], c['group_name']) for c in grouped] == [
        ('A', 'River & Reed'), ('A', 'River & Reed'), ('B', ''), ('B', ''), (None, '')]
    assert 'contact@example.test' not in json.dumps(grouped)
    assert 'Invented locality' not in json.dumps(grouped)


@pytest.mark.parametrize(('old', 'new', 'error'), [
    ('Eastern Victoria Region', 'Imaginary Region', 'Not the VEC'),
    ('WREN, Sol', 'WREN, Sky', 'candidate order differs'),
    ('B. Unnamed-1', 'C. Unnamed-1', 'Invalid group ballot order'),
    ('party-row desktop', 'party-row missing', 'Inconsistent group headings'),
    ('candidate-row', 'unrecognised-row', 'Unexpected nominations row'),
    ('<td>SKYLARK<p>Invented locality</p></td>', '<td></td>', 'candidate order differs'),
])
def test_region_source_changes_fail_closed(old, new, error):
    lists, _ = vec.parse_workbook((FIX / 'candidates.xls').read_bytes(), CONFIG)
    body = (FIX / 'region.html').read_text().replace(old, new)
    with pytest.raises(ValueError, match=error):
        vec.parse_region_groups(body.encode(), 'Eastern Victoria', lists['regions']['Eastern Victoria'])


def test_region_requires_complete_candidate_sequence():
    lists, _ = vec.parse_workbook((FIX / 'candidates.xls').read_bytes(), CONFIG)
    candidates = lists['regions']['Eastern Victoria']
    for changed in [candidates[:-1], candidates + [{'name': 'QUILL, Ash', 'party': ''}]]:
        with pytest.raises(ValueError, match='candidate order differs|Incomplete Council'):
            vec.parse_region_groups((FIX / 'region.html').read_bytes(), 'Eastern Victoria', changed)


@pytest.mark.parametrize(('row', 'column', 'value', 'error'), [
    (1, 0, 'State Election 2022', 'Not the 2026'),
    (3, 0, 'As at 08 Nov 2026 07:58 PM', 'predates'),
    (3, 0, 'As at 09 Nov 2026 11:59 AM', 'predates'),
    (4, 1, 9, 'total does not match'),
    (6, 0, 'Nowhere District', 'Unknown constituency'),
    (7, 0, '(1 vacancy, 4 candidates)', 'Incomplete'),
    (7, 0, '(1 vacancy, 0 candidates)', 'Invalid vacancy/candidate count'),
    (8, 4, 'Different party column', 'Unexpected candidate columns'),
    (10, 0, 'QUILL, Zéphyr', 'Duplicate candidate'),
    (10, 0, 42, 'Invalid candidate'),
    (10, 4, 42, 'Invalid candidate'),
    (14, 0, '(1 vacancy, 5 candidates)', 'Invalid vacancy/candidate count'),
])
def test_changed_or_incomplete_reports_fail_closed(row, column, value, error):
    report = rows()
    report[row][column] = value
    with pytest.raises(ValueError, match=error):
        vec.parse_rows(report, CONFIG)


def test_missing_constituency_and_truncated_candidate_list_fail():
    with pytest.raises(ValueError, match='Missing regions'):
        vec.parse_rows(rows()[:13], CONFIG)
    with pytest.raises(ValueError, match='Incomplete candidate list'):
        vec.parse_rows(rows()[:-2], CONFIG)


def test_duplicate_constituency_fails():
    with pytest.raises(ValueError, match='Duplicate constituency'):
        vec.parse_rows(rows() + rows()[6:13], CONFIG)


def test_publication_date_is_from_dated_notice_and_download_is_discovered():
    assert vec.publication((FIX / 'election.html').read_bytes()) == (
        '2026-11-11', 'https://www.vec.vic.gov.au/-/media/invented-candidates.xls')


@pytest.mark.parametrize(('old', 'new', 'error'), [
    ('Wednesday 11 November', 'Tuesday 11 November', 'weekday'),
    ('Get to know your candidates', 'Other notice', 'dated candidate notice'),
    ('/-/media/invented-candidates.xls', 'https://other.example.test/candidates.xls', 'official VEC'),
])
def test_publication_requires_an_explicit_date_and_official_download(old, new, error):
    page = (FIX / 'election.html').read_text().replace(old, new)
    with pytest.raises(ValueError, match=error):
        vec.publication(page.encode())


def setup_generation(tmp_path):
    config = tmp_path / 'config.json'
    config.write_text(json.dumps(CONFIG))
    out = tmp_path / 'candidates.json'
    out.write_text('existing candidate data\n')
    return tmp_path / 'cache', out, config


def test_generation_exports_only_the_hub_shape_and_reuses_honest_cache(tmp_path, monkeypatch):
    cache, out, config = setup_generation(tmp_path)
    sent = []

    def get(self, url):
        sent.append(url)
        return (FIX / ('election.html' if url == vec.PAGE else 'region.html' if url == REGION_URL else 'candidates.xls')).read_bytes()

    monkeypatch.setattr(vec.HonestHTTP, 'get', get)
    result = vec.generate(cache, out, config)
    assert set(result) == {'published', 'url', 'districts', 'regions'}
    assert json.loads(out.read_text()) == result
    assert result['published'] == '2026-11-11'
    assert sent == [vec.PAGE, 'https://www.vec.vic.gov.au/-/media/invented-candidates.xls', REGION_URL]
    assert vec.generate(cache, out, config) == result
    assert len(sent) == 3


@pytest.mark.parametrize('refused_request', [1, 2, 3])
def test_refusal_stops_fetches_writes_pause_receipt_and_preserves_output(tmp_path, monkeypatch, refused_request):
    cache, out, config = setup_generation(tmp_path)
    status = tmp_path / 'source-access.json'
    monkeypatch.setenv('OPAX_SOURCE_STATUS_FILE', str(status))
    monkeypatch.setenv('OPAX_SOURCE_NAME', 'vec-candidates-test')
    sent = []

    def get(self, url):
        sent.append(url)
        if len(sent) == refused_request:
            raise vec.Refused('robots.txt disallows the honest agent', url)
        return (FIX / ('election.html' if url == vec.PAGE else 'candidates.xls')).read_bytes()

    monkeypatch.setattr(vec.HonestHTTP, 'get', get)
    with pytest.raises(vec.source_http.SourceRefused) as refused:
        vec.generate(cache, out, config)
    assert refused.value.code == 4
    receipt = json.loads(status.read_text())['vec-candidates-test']
    assert receipt['status'] == 'paused'
    assert receipt['reason'] == 'robots.txt disallows the honest agent'
    assert len(sent) == refused_request
    assert out.read_text() == 'existing candidate data\n'
    assert not out.with_suffix('.tmp').exists()


def test_invalid_source_keeps_existing_output(tmp_path, monkeypatch):
    cache, out, config = setup_generation(tmp_path)
    monkeypatch.setattr(vec.HonestHTTP, 'get', lambda self, url: b'<html>not a candidate list</html>')
    with pytest.raises(ValueError, match='Not the VEC'):
        vec.generate(cache, out, config)
    assert out.read_text() == 'existing candidate data\n'


def test_invalid_workbook_keeps_existing_output(tmp_path, monkeypatch):
    cache, out, config = setup_generation(tmp_path)
    monkeypatch.setattr(vec.HonestHTTP, 'get', lambda self, url:
                        (FIX / 'election.html').read_bytes() if url == vec.PAGE else b'not a workbook')
    with pytest.raises(xlrd.biffh.XLRDError):
        vec.generate(cache, out, config)
    assert out.read_text() == 'existing candidate data\n'


def test_groups_only_fetches_only_region_pages_and_writes_atomically(tmp_path, monkeypatch):
    cache, out, config = setup_generation(tmp_path)
    lists, _ = vec.parse_workbook((FIX / 'candidates.xls').read_bytes(), CONFIG)
    saved = json.loads(json.dumps({'published': '2026-11-11', 'url': vec.PAGE, **lists}))
    saved['districts']['Albert Park'][0]['party'] += ' '
    out.write_text(json.dumps(saved))
    sent = []

    def get(self, url):
        sent.append(url)
        assert url == REGION_URL
        return (FIX / 'region.html').read_bytes()

    monkeypatch.setattr(vec.HonestHTTP, 'get', get)
    result = vec.enrich_snapshot(cache, out, config)
    assert sent == [REGION_URL]
    assert result['districts'] == lists['districts']
    assert result['published'] == saved['published']
    assert set(result['regions']['Eastern Victoria'][0]) == {'name', 'party', 'group', 'group_name'}
    assert json.loads(out.read_text()) == result
    assert vec.enrich_snapshot(cache, out, config) == result
    assert sent == [REGION_URL]


def test_invalid_region_keeps_existing_snapshot(tmp_path, monkeypatch):
    cache, out, config = setup_generation(tmp_path)
    lists, _ = vec.parse_workbook((FIX / 'candidates.xls').read_bytes(), CONFIG)
    saved = json.dumps({'published': '2026-11-11', 'url': vec.PAGE, **lists})
    out.write_text(saved)
    monkeypatch.setattr(vec.HonestHTTP, 'get', lambda self, url: b'<main>Changed source</main>')
    with pytest.raises(ValueError, match='Not the VEC'):
        vec.enrich_snapshot(cache, out, config)
    assert out.read_text() == saved
