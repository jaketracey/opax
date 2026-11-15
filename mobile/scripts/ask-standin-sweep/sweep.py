#!/usr/bin/env python3
"""The stand-in sweep for Ask's held starter box (README.md).

Lays out "What has <member> said in parliament this year?" for every
verified member of the House and for the stand-in names in
src/features/ask/AskIdle.tsx (SIZING_MEMBERS), at every text size and row
width swept, and prints the worst margin: the tallest stand-in question's
height less the tallest real question's. It must never be negative.

    python3 sweep.py --wrap <built wrap binary> [--public <portal/public>]
                     [--standins 'Name One|Name Two']

Reads the roster from a portal/public folder (this repository's by default,
or one downloaded from the live site). Writes nothing.
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[2]
# The body role's Dynamic Type sizes, Large to AX5, and the row's text
# widths from a narrow split pane to a wide phone.
SIZES = [17, 19, 21, 23, 28, 33, 40, 47, 53]
WIDTHS = range(200, 331, 2)


def question(member: str) -> str:
    return f'What has {member.strip()} said in parliament this year?'


def house_names(public: pathlib.Path) -> list[str]:
    """Names of the verified current members of the House, as Ask reads them."""
    manifest = json.loads((public / 'electorates/manifest.json').read_text())
    index = json.loads((public / manifest['index_url'].lstrip('/')).read_text())
    people = json.loads((public / manifest['people_url'].lstrip('/')).read_text())
    by_id = {person['person_id']: person for person in people['people']}
    names = set()
    for seat in index['electorates']:
        if (
            seat['jurisdiction'] == 'federal'
            and seat['chamber'] == 'representatives'
            and seat['status'] != 'historical'
            and seat['representation_status'] == 'verified'
        ):
            for representative in seat['representatives']:
                person = by_id.get(representative['person_id'])
                if person:
                    names.add(person['name'])
    return sorted(names)


def app_standins() -> list[str]:
    source = (REPO / 'mobile/src/features/ask/AskIdle.tsx').read_text()
    block = re.search(r'SIZING_MEMBERS = \[(.*?)\]', source, re.S)
    if not block:
        sys.exit('SIZING_MEMBERS not found in AskIdle.tsx')
    return re.findall(r"'([^']+)'", block.group(1))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--wrap', required=True, help='the built wrap binary')
    parser.add_argument('--public', default=str(REPO / 'portal/public'))
    parser.add_argument('--standins', help="names separated by '|'")
    args = parser.parse_args()
    names = house_names(pathlib.Path(args.public))
    standins = args.standins.split('|') if args.standins else app_standins()
    questions = [question(name) for name in names + standins]
    worst = None
    combos = 0
    for size in SIZES:
        for width in WIDTHS:
            out = subprocess.run(
                [args.wrap, str(width), str(size)],
                input='\n'.join(questions),
                capture_output=True,
                text=True,
                check=True,
            ).stdout.strip().split('\n')
            height = {line.split('\t')[3]: float(line.split('\t')[2]) for line in out}
            box = max(height[question(name)] for name in standins)
            tallest, member = max((height[question(name)], name) for name in names)
            combos += 1
            margin = box - tallest
            if worst is None or margin < worst[0]:
                worst = (margin, size, width, member, tallest, box)
    margin, size, width, member, tallest, box = worst
    print(f'{len(names)} verified House names; stand-ins {standins}')
    print(f'{combos} size and width combinations')
    print(
        f'worst margin {margin:.1f} pt: at {size} pt text, {width} pt wide, '
        f'the box is {box:.1f} pt and the question about {member} is {tallest:.1f} pt'
    )
    sys.exit(1 if margin < 0 else 0)


if __name__ == '__main__':
    main()
