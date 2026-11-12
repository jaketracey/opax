"""Convert the VEC's 2026 candidate XLS report to the election hub's input.

    uv run python scripts/fetch_vec_candidates.py [--cache DIR]

The cache holds honest, robots-checked source responses, including contact
details that are never exported. Use a fresh cache directory to refresh.
VEC website text: CC BY 4.0, https://www.vec.vic.gov.au/legal.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import json
from pathlib import Path
import re
import sys
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup
import xlrd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parli.ingest import http as source_http
from parli.ingest.honest_http import HonestHTTP, Refused

ROOT = Path(__file__).resolve().parents[1]
PAGE = 'https://www.vec.vic.gov.au/voting/2026-state-election'
CONFIG = ROOT / 'scripts/hubs/vic-election-2026.json'
OUT = CONFIG.with_name('vic-candidates-2026.json')
HEADERS = ['Candidates', 'Contact Person Name', 'Phone Contact', 'Email Address', 'RPP Name']


def publication(page: bytes) -> tuple[str, str]:
    """Use the dated VEC candidate notice, not the fetch or XLS snapshot date."""
    soup = BeautifulSoup(page, 'html.parser')
    main = soup.find('main')
    if main is None or '2026 state election' not in main.get_text(' ', strip=True):
        raise ValueError('Not the VEC 2026 state election page')
    links = [a for a in main.select('a[href]')
             if a.get_text(' ', strip=True).lower() == 'spreadsheet of all the candidates']
    notices = [a.get_text(' ', strip=True) for a in main.select('a')
               if a.get_text(' ', strip=True).startswith('Get to know your candidates - published ')]
    if len(links) != 1 or len(notices) != 1:
        raise ValueError('Expected one candidate spreadsheet and one dated candidate notice')
    printed = notices[0].split(' - published ', 1)[1]
    published = datetime.strptime(printed + ' 2026', '%A %d %B %Y').date()
    if published.strftime('%A') != printed.split()[0]:
        raise ValueError('Candidate notice weekday does not match its 2026 date')
    url = urljoin(PAGE, links[0]['href'])
    parts = urlsplit(url)
    if parts.scheme != 'https' or parts.netloc != 'www.vec.vic.gov.au' or not parts.path.endswith('.xls'):
        raise ValueError('Candidate download must be an official VEC XLS URL')
    return published.isoformat(), url


def parse_rows(rows: list[list], config: dict) -> tuple[dict, str]:
    """Keep report row order across Council groups, including ungrouped rows.

    Only the candidate and RPP Name columns are retained. Party labels are the
    spreadsheet's registered names, with surrounding whitespace removed.
    Council group headings are absent from this five-column report.
    """
    if len(rows) < 9 or any(len(row) != 5 for row in rows):
        raise ValueError('Expected the five-column VEC candidate report')
    if rows[0][0] != "Candidate Contact Persons' Details Summary Report" or rows[1][0] != 'State Election 2026':
        raise ValueError('Not the 2026 VEC candidate report')
    nominations_close = datetime.fromisoformat(config['nominations_close'])
    snapshot = datetime.strptime(rows[3][0], 'As at %d %b %Y %I:%M %p').replace(tzinfo=nominations_close.tzinfo)
    if snapshot.year != 2026 or snapshot < nominations_close:
        raise ValueError('Candidate report predates the close of 2026 nominations')
    if rows[4][0] != 'Total Candidates for ALL Electorates':
        raise ValueError('Missing report candidate total')
    total = rows[4][1]
    output = {'districts': {}, 'regions': {}}
    expected = {f'{c["name"]} {kind[:-1].title()}': (kind, c['name'])
                for kind in output for c in config[kind]}
    current = None
    expected_count = None
    needs_header = False

    def finish():
        if current is not None:
            kind, name = current
            if needs_header or expected_count is None or len(output[kind][name]) != expected_count:
                raise ValueError(f'Incomplete candidate list: {name}')

    for row in rows[5:]:
        label = row[0]
        if not any(row):
            continue
        if isinstance(label, str) and label.endswith((' District', ' Region')):
            finish()
            if label not in expected:
                raise ValueError(f'Unknown constituency: {label}')
            current = expected[label]
            kind, name = current
            if name in output[kind]:
                raise ValueError(f'Duplicate constituency: {name}')
            output[kind][name] = []
            expected_count = None
            needs_header = True
        elif current is None:
            raise ValueError('Unexpected row outside a constituency')
        elif expected_count is None:
            match = re.fullmatch(r'\((\d+) vacanc(?:y|ies), (\d+) candidates\)\s*', label)
            if not match or int(match[1]) != (1 if current[0] == 'districts' else 5) or int(match[2]) < 1:
                raise ValueError(f'Invalid vacancy/candidate count: {current[1]}')
            expected_count = int(match[2])
        elif needs_header:
            if row != HEADERS:
                raise ValueError(f'Unexpected candidate columns: {current[1]}')
            needs_header = False
        else:
            if not isinstance(label, str) or not label.strip() or not isinstance(row[4], str):
                raise ValueError(f'Invalid candidate name or party: {current[1]}')
            candidates = output[current[0]][current[1]]
            if any(c['name'] == label for c in candidates):
                raise ValueError(f'Duplicate candidate: {current[1]}')
            candidates.append({'name': label, 'party': row[4].strip()})
    finish()
    for kind in output:
        missing = {c['name'] for c in config[kind]} - output[kind].keys()
        if missing:
            raise ValueError(f'Missing {kind}: {", ".join(sorted(missing))}')
    if sum(len(candidates) for seats in output.values() for candidates in seats.values()) != total:
        raise ValueError('Candidate total does not match the VEC report')
    return output, snapshot.date().isoformat()


def parse_workbook(body: bytes, config: dict) -> tuple[dict, str]:
    book = xlrd.open_workbook(file_contents=body)
    if book.nsheets != 1:
        raise ValueError('Expected one VEC candidate worksheet')
    sheet = book.sheet_by_index(0)
    return parse_rows([sheet.row_values(i) for i in range(sheet.nrows)], config)


def fetch(url: str, path: Path, client: HonestHTTP) -> bytes:
    if path.exists():
        return path.read_bytes()
    try:
        body = client.get(url)
    except Refused as exc:
        # Robots/HTTP refusals from HonestHTTP must also write the shared receipt.
        raise source_http.SourceRefused(exc.url or url, str(exc)) from None
    if body is None:
        raise ValueError(f'VEC source not found: {url}')
    path.write_bytes(body)
    return body


def parse_region_groups(body: bytes, name: str, candidates: list[dict]) -> list[dict]:
    """Add only group letters/names, after an exact candidate-order check.

    VEC repeats each heading for mobile and desktop. Unnamed-N is a source
    placeholder, not a group name. A blank party is never used to infer a group.
    """
    soup = BeautifulSoup(body, 'html.parser')
    main = soup.find('main')
    if main is None or main.find('h1') is None or main.h1.get_text(' ', strip=True) != f'Candidates for {name} Region':
        raise ValueError(f'Not the VEC nominations page for {name}')
    tables = main.select('table.js-responsive-table')
    if len(tables) != 1:
        raise ValueError(f'Expected one candidate table: {name}')
    group = None
    mobile = None
    used = set()
    output = []
    group_start = 0
    for row in tables[0].select('tbody > tr'):
        classes = row.get('class', [])
        if 'party-row' in classes:
            heading = row.select_one('.party-name')
            if heading is None:
                raise ValueError(f'Missing group heading: {name}')
            text = heading.get_text(' ', strip=True)
            if 'mobile' in classes:
                if mobile is not None:
                    raise ValueError(f'Duplicate mobile group heading: {name}')
                mobile = text
                continue
            if 'desktop' not in classes or mobile != text:
                raise ValueError(f'Inconsistent group headings: {name}')
            mobile = None
            if group is not None and len(output) == group_start:
                raise ValueError(f'Empty Council group: {name}')
            if text == 'Ungrouped':
                letter, label = None, ''
            else:
                match = re.fullmatch(r'([A-Z])\. (.+)', text)
                if not match or match[1] != chr(ord('A') + len(used)) or None in used:
                    raise ValueError(f'Invalid group ballot order: {name}')
                letter, label = match.groups()
                if re.fullmatch(r'Unnamed-\d+', label):
                    label = ''
            if letter in used:
                raise ValueError(f'Duplicate Council group: {name}')
            used.add(letter)
            group = (letter, label)
            group_start = len(output)
        elif 'candidate-row' in classes:
            cells = row.find_all('td', recursive=False)
            if group is None or mobile is not None or not cells:
                raise ValueError(f'Candidate outside a Council group: {name}')
            # Only the direct name text; paragraphs contain party and locality.
            printed = ' '.join(str(n).strip() for n in cells[0].find_all(string=True, recursive=False)).strip()
            index = len(output)
            if index >= len(candidates) or printed != candidates[index]['name']:
                raise ValueError(f'Council candidate order differs from workbook: {name}, row {index + 1}')
            output.append({**candidates[index], 'group': group[0], 'group_name': group[1]})
        else:
            raise ValueError(f'Unexpected nominations row: {name}')
    if mobile is not None or not output or len(output) != len(candidates) or group_start == len(output):
        raise ValueError(f'Incomplete Council candidate list: {name}')
    return output


def add_region_groups(lists: dict, cache: Path, config: dict, client: HonestHTTP):
    for region in config['regions']:
        url = region['source_url'].rstrip('/') + '/nominations'
        path = cache / (Path(urlsplit(region['source_url']).path).name + '.html')
        body = fetch(url, path, client)
        lists['regions'][region['name']] = parse_region_groups(body, region['name'], lists['regions'][region['name']])


def write_result(result: dict, out: Path):
    temp = out.with_suffix('.tmp')
    temp.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    temp.replace(out)


def enrich_snapshot(cache: Path, out: Path = OUT, config_path: Path = CONFIG) -> dict:
    """Add groups to the saved JSON without requesting the landing page or XLS."""
    cache.mkdir(parents=True, exist_ok=True)
    result = json.loads(out.read_text())
    for kind in ('districts', 'regions'):
        for candidates in result[kind].values():
            for candidate in candidates:
                candidate['party'] = candidate['party'].strip()
    add_region_groups(result, cache, json.loads(config_path.read_text()), HonestHTTP())
    write_result(result, out)
    return result


def generate(cache: Path, out: Path = OUT, config_path: Path = CONFIG) -> dict:
    cache.mkdir(parents=True, exist_ok=True)
    client = HonestHTTP()
    page = fetch(PAGE, cache / 'election.html', client)
    published, download = publication(page)
    # Both the landing page and its linked workbook are cached. A fresh cache
    # directory is required to discover a replacement report URL.
    body = fetch(download, cache / Path(urlsplit(download).path).name, client)
    config = json.loads(config_path.read_text())
    lists, snapshot = parse_workbook(body, config)
    if snapshot > published:
        raise ValueError('Workbook snapshot is newer than the dated publication notice')
    add_region_groups(lists, cache, config, client)
    result = {'published': published, 'url': PAGE, **lists}
    write_result(result, out)
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--cache', type=Path, default=ROOT / 'portal/private/vec-candidates-2026')
    ap.add_argument('--groups-only', action='store_true', help='Enrich the saved JSON using only the eight region nominations pages')
    args = ap.parse_args()
    result = (enrich_snapshot if args.groups_only else generate)(args.cache)
    total = sum(len(c) for kind in ('districts', 'regions') for c in result[kind].values())
    print(f'{len(result["districts"])} districts, {len(result["regions"])} regions, {total} candidates -> {OUT}')


if __name__ == '__main__':
    main()
