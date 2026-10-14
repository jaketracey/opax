"""Fetch the VEC's district results for the 2022 Victorian state election and
the by-elections held since, into scripts/hubs/vic-results-2022.json.

Records only: the elected member as the VEC lists them, and the party shares in
the VEC's "Results after distribution of preferences" table. Other candidates'
names are not kept. VEC website material is CC BY 4.0 (https://vec.vic.gov.au/legal).

    python3 -I scripts/fetch_vec_results.py [--cache DIR]
"""
import argparse, hashlib, html, json, re, sys, time, urllib.request
from datetime import date
from pathlib import Path

VEC = 'https://www.vec.vic.gov.au'
INDEX = VEC + '/results/state-election-results/2022-state-election-results'
BY_ELECTIONS = VEC + '/results/state-election-results/state-by-elections-timeline'
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parli.ingest import http as source_http
UA = source_http.USER_AGENT
OUT = Path(__file__).parent / 'hubs' / 'vic-results-2022.json'
# Held since the 26 November 2022 general election. The Narracan supplementary
# election replaced its 2022 district poll, which failed when a candidate died.
SINCE_2022 = [
    ('Narracan', '2023-01-28', 'supplementary', '/narracan-district-supplementary-election-results'),
    ('Warrandyte', '2023-08-26', 'by-election', '/warrandyte-district-by-election-results/results-by-district/warrandyte-district-results'),
    ('Mulgrave', '2023-11-18', 'by-election', '/mulgrave-district-by-election-results/results-by-district/mulgrave-district-by-election-results'),
    ('Prahran', '2025-02-08', 'by-election', '/prahran-district-results/results-by-district/prahran-district-results'),
    ('Werribee', '2025-02-08', 'by-election', '/werribee-district-results/results-by-district/werribee-district-results'),
    ('Nepean', '2026-05-02', 'by-election', '/nepean-by-election-results/results-by-district/nepean-district-results'),
]
PARTIES = {
    'Australian Labor Party - Victorian Branch': 'Labor', 'Australian Labor Party': 'Labor',
    'Liberal': 'Liberal', 'The Nationals': 'Nationals', 'National Party of Australia - Victoria': 'Nationals',
    'Australian Greens': 'Greens', '': 'Independent',
}


def fetch(url, cache):
    name = re.sub(r'[^a-z0-9]+', '-', url.lower().split('vec.vic.gov.au', 1)[1]).strip('-') + '.html'
    path = cache / name
    if not path.exists():
        req = source_http.Request(url, headers={'User-Agent': UA})
        with source_http.urlopen(req, timeout=60) as r:
            path.write_bytes(r.read())
        time.sleep(0.5)
    body = path.read_bytes()
    return body.decode('utf-8', 'replace'), hashlib.sha256(body).hexdigest()


def cells(row):
    return [html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)]


def party(label):
    label = re.sub(r'\s+', ' ', label).strip()
    return PARTIES.get(label, label)


def two_candidate(page, url, cache):
    """The VEC's two-candidate preferred count, used where the preference
    distribution stopped early (an absolute majority before two remained)."""
    inline = page.split('<h3>Two candidate preferred vote</h3>', 1)
    table = inline[1].split('<h3>', 1)[0].split('</table>', 1)[0] if len(inline) == 2 else ''
    head = [re.sub(r'<[^>]+>', '', h).strip() for h in re.findall(r'<th[^>]*>(.*?)</th>', table, re.S)]
    rows = [r for r in (cells(r) for r in re.findall(r'<tr>(.*?)</tr>', table, re.S)) if len(r) == 4]
    if len(rows) == 2 and 'Party' in head:  # printed inline; column order varies by page
        return [{'party': party(r[head.index('Party')]), 'share': float(r[3].rstrip('%'))} for r in rows], None
    link = re.search(r'href="([^"]*2cp-results-by-voting-centre)"', page, re.I)
    if not link:
        raise ValueError(f'No two-candidate count on {url}')
    body, _ = fetch(VEC + link.group(1), cache)
    rows = [[html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', r, re.S)]
            for r in re.findall(r'<tr.*?</tr>', body.split('<main', 1)[-1], re.S)]
    parties, shares = rows[1], next(r for r in rows if r and r[0].startswith('Percentage of formal vote'))
    return [{'party': party(parties[i]), 'share': float(shares[i].rstrip('%'))} for i in (1, 2)], VEC + link.group(1)


def parse(page, url, cache):
    elected = re.search(r'<h3>Elected member</h3>\s*<p>\s*<b>(.*?)</b>(?:\s*<br\s*/?>\s*<em>(.*?)</em>)?', page, re.S)
    if not elected:
        raise ValueError(f'No elected member on {url}')
    final = page.split('Results after distribution of preferences', 1)
    table = final[1].split('</table>', 1)[0] if len(final) == 2 else ''
    rows = [c for c in (cells(r) for r in re.findall(r'<tr>(.*?)</tr>', table, re.S)) if len(c) == 4]
    count, basis, source = [{'party': party(c[1]), 'share': float(c[3].rstrip('%'))} for c in rows], 'distribution', None
    if len(count) != 2:
        count, source = two_candidate(page, url, cache)
        basis = 'two-candidate count'
    count.sort(key=lambda r: -r['share'])
    surname, _, given = html.unescape(elected.group(1)).partition(',')
    winner_party = party(html.unescape(elected.group(2) or ''))
    if count[0]['party'] != winner_party:
        raise ValueError(f'Elected member is not first in the final count on {url}')
    # The winning margin is the winner's two-candidate share above 50%, as the
    # VEC's "districts with winning margins" maps use it.
    out = {'elected': f'{given.strip()} {surname.strip().title()}'.strip(), 'party': winner_party,
           'share': count[0]['share'], 'against': count[1]['party'], 'against_share': count[1]['share'],
           'margin': round(count[0]['share'] - 50, 2), 'basis': basis}
    if source:
        out['two_candidate_url'] = source
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=str(Path(__file__).parents[1] / 'portal' / 'private' / 'vec-results'))
    args = ap.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    index, index_hash = fetch(INDEX, cache)
    paths = sorted(set(re.findall(r'href="(/results/state-election-results/2022-state-election-results/results-by-district/[a-z0-9-]+-district-results)"', index)))
    districts, hashes = {}, {'index': index_hash}
    for path in paths:
        page, digest = fetch(VEC + path, cache)
        name = html.unescape(re.search(r'<h1[^>]*>\s*(.*?) District results', page, re.S).group(1)).strip()
        districts[name] = {'general': {'date': '2022-11-26', 'url': VEC + path, **parse(page, path, cache)}}
        hashes[name] = digest
    for name, held, kind, path in SINCE_2022:
        page, digest = fetch(BY_ELECTIONS + path, cache)
        row = {'date': held, 'kind': kind, 'url': BY_ELECTIONS + path, **parse(page, path, cache)}
        if kind == 'supplementary':
            districts.setdefault(name, {})['general'] = {**row, 'kind': 'supplementary'}
        else:
            districts.setdefault(name, {})['since'] = row
        hashes[f'{name} {kind}'] = digest
    if len(districts) != 88:
        sys.exit(f'Expected 88 districts, found {len(districts)}')
    OUT.write_text(json.dumps({
        'source': 'Victorian Electoral Commission', 'index': INDEX, 'by_elections': BY_ELECTIONS,
        'licence': 'CC BY 4.0 (https://vec.vic.gov.au/legal)', 'fetched': date.today().isoformat(),
        'districts': dict(sorted(districts.items())), 'sha256': hashes,
    }, indent=1, ensure_ascii=False) + '\n')
    print(f'{len(districts)} districts -> {OUT}')


if __name__ == '__main__':
    main()
