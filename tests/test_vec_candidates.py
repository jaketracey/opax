"""Synthetic VEC report parsing and atomic, refusal-safe acquisition."""
import json
from pathlib import Path

import pytest
import xlrd

from scripts import fetch_vec_candidates as vec

FIX = Path(__file__).parent / 'fixtures/vec_candidates'
CONFIG = {'nominations_close': '2026-11-09T12:00:00+11:00',
          'districts': [{'name': 'Albert Park'}], 'regions': [{'name': 'Eastern Victoria'}]}


def rows():
    sheet = xlrd.open_workbook(FIX / 'candidates.xls').sheet_by_index(0)
    return [sheet.row_values(i) for i in range(sheet.nrows)]


def test_saved_xls_preserves_ballot_order_exact_labels_and_blank_parties():
    result, snapshot = vec.parse_workbook((FIX / 'candidates.xls').read_bytes(), CONFIG)
    assert snapshot == '2026-11-09'
    assert result['districts']['Albert Park'] == [
        {'name': 'QUILL, Zéphyr', 'party': 'Paper Lantern Party '},
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
        return (FIX / ('election.html' if url == vec.PAGE else 'candidates.xls')).read_bytes()

    monkeypatch.setattr(vec.HonestHTTP, 'get', get)
    result = vec.generate(cache, out, config)
    assert set(result) == {'published', 'url', 'districts', 'regions'}
    assert json.loads(out.read_text()) == result
    assert result['published'] == '2026-11-11'
    assert sent == [vec.PAGE, 'https://www.vec.vic.gov.au/-/media/invented-candidates.xls']
    assert vec.generate(cache, out, config) == result
    assert len(sent) == 2


@pytest.mark.parametrize('refused_request', [1, 2])
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
        return (FIX / 'election.html').read_bytes()

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
