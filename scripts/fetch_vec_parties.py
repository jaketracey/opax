"""Fetch the VEC's register of political parties into
scripts/hubs/vic-registered-parties-2026.json.

Records only: each party's registered name exactly as the register prints it,
its registration dates, and its registered abbreviated name and acronym where
the register gives one. Registered officers and addresses are not kept.
VEC website material is CC BY 4.0 (https://vec.vic.gov.au/legal).

    python3 -I scripts/fetch_vec_parties.py            # one request
    python3 -I scripts/fetch_vec_parties.py --html saved.html --retrieved 2026-11-16

The register is the only source of party names for the Victorian alias map
(portal/public/labels.js PARTY_ALIASES; portal/test/vic-party-pages.test.mjs).
A changed page shape fails before replacing the file.
"""
import argparse, html, json, re, urllib.request
from datetime import date, datetime
from pathlib import Path

URL = 'https://www.vec.vic.gov.au/candidates-and-parties/registered-political-parties/currently-registered-parties'
UA = 'opax-improve-audit'
OUT = Path(__file__).parent / 'hubs' / 'vic-registered-parties-2026.json'


def text(fragment: str) -> str:
    """A cell's text, one line per paragraph or break."""
    fragment = re.sub(r'<(?:br|/p)\b[^>]*>', '\n', fragment)
    return html.unescape(re.sub(r'<[^>]+>', '', fragment))


def iso(day: str) -> str:
    return datetime.strptime(day.strip(), '%d %B %Y').date().isoformat()


def parse(page: str) -> list[dict]:
    parties = []
    for row in re.findall(r'<tr\b.*?</tr>', page, re.S):
        cells = re.findall(r'<td\b.*?</td>', row, re.S)
        name = re.search(r'<strong>(.*?)</strong>', cells[0], re.S) if cells else None
        if not name:
            continue
        lines = [' '.join(line.split()) for line in text(cells[0]).split('\n')]
        field = lambda label: next((line[len(label) + 1:].strip() for line in lines if line.startswith(label + ':')), None)
        first = field('First registered')
        if not first:
            raise SystemExit(f'No registration date: {name.group(1)}')
        again = field('Re-registered')
        parties.append({
            'name': ' '.join(text(name.group(1)).split()),
            'first_registered': iso(first),
            're_registered': iso(again) if again else None,
            'abbreviation': field('Abbreviated name'),
            'acronym': field('Acronym'),
        })
    names = [p['name'] for p in parties]
    if len(parties) < 10 or len(set(names)) != len(names):
        raise SystemExit(f'Unexpected register: {len(parties)} parties')
    return parties


def main() -> None:
    args = argparse.ArgumentParser()
    args.add_argument('--html', help='a saved copy of the register page')
    args.add_argument('--retrieved', default=date.today().isoformat())
    opts = args.parse_args()
    if opts.html:
        page = Path(opts.html).read_text(encoding='utf8')
    else:
        with urllib.request.urlopen(urllib.request.Request(URL, headers={'User-Agent': UA}), timeout=30) as response:
            page = response.read().decode('utf8')
    data = {
        'source': 'Victorian Electoral Commission, register of political parties',
        'url': URL,
        'licence': 'CC BY 4.0',
        'retrieved': opts.retrieved,
        'parties': parse(page),
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf8')
    print(f'{OUT.name}: {len(data["parties"])} registered parties')


if __name__ == '__main__':
    main()
