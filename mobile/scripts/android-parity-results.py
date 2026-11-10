#!/usr/bin/env python3
"""Index private Android journey results; never write QA evidence to tracked paths."""
import argparse
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import xml.etree.ElementTree as ET


def lane(name):
    if name.startswith(('20-', '21-', '22-account')): return 'voice/account'
    if name.startswith(('23-', '24-', '42-', '43-', '63-', '64-', '65-')): return 'money map'
    if name.startswith(('01-', '07-scene', '13i-', '62-')): return 'navigation'
    if name.startswith(('05-', '15-')): return 'design system'
    return 'screens'


def index(root, prepared, blocked_reason=''):
    plan = json.loads((prepared/'suite.json').read_text())
    runs = {}
    for path in sorted(root.rglob('flow-results.tsv'), key=lambda p: p.stat().st_mtime):
        for file, api, status in csv.reader(path.open(), delimiter='\t'):
            if api not in ('34', '36'): continue
            name = Path(file).name
            report = path.parent/(Path(file).stem+'-report.xml')
            step = ''
            if report.exists():
                try:
                    failure = ET.parse(report).find('.//failure')
                    if failure is not None: step = failure.get('message') or failure.text or 'See Maestro report'
                except ET.ParseError: step = 'See incomplete Maestro report'
            shot = path.parent/'maestro'/Path(file).stem/'failure.png'
            evidence = f'; [screenshot]({shot.relative_to(root)})' if shot.exists() else ''
            # Maestro owns UIAutomation while its driver is reused. A second
            # uiautomator dump may fail and leave an old XML file on-device;
            # its own failure hierarchy is fresh and belongs to this step.
            hierarchies = list((path.parent/'maestro'/Path(file).stem).glob('**/screen-hierarchy/*.json'))
            if status != '0' and hierarchies:
                hierarchy = max(hierarchies, key=lambda p: p.stat().st_mtime)
                evidence += f'; [hierarchy]({hierarchy.relative_to(root)})'
            result = 'PASS' if status == '0' else 'FAIL'+evidence+'; '+step.replace('|','/').replace('\n',' ')[:350]
            runs[(name, api)] = result
    counts = {category:sum(p['category'] == category for p in plan) for category in sorted({p['category'] for p in plan})}
    text = '# and-b-pipeline Android parity results\n\n'
    text += 'Updated: '+datetime.now(timezone.utc).isoformat()+'\n\n'
    text += 'Coverage: '+', '.join(f'{k}: {v}' for k,v in counts.items())+f"; {sum(p['run'] for p in plan)} runnable journeys.\n\n"
    if blocked_reason: text += '**Device execution blocked:** '+blocked_reason+'\n\n'
    text += '| Shared flow | API 34: OPAX_API34, 5602 | API 36: OPAX_Pixel_API36, 5604 read-only | Owning lane if app failure |\n| --- | --- | --- | --- |\n'
    for row in plan:
        cells = [runs.get((Path(row['path']).name, api), 'NOT RUN' if row['run'] else row['category']+(': helper' if 'helper' in row['reason'].lower() else '')) for api in ('34','36')]
        text += f"| {row['shared']} | {cells[0]} | {cells[1]} | {lane(row['shared'])} |\n"
    text += '\nApp failures require screenshot/step review before attribution. Lane labels above indicate triage ownership, not confirmed bugs.\n'
    return text


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root',type=Path); parser.add_argument('prepared',type=Path)
    parser.add_argument('--blocked-reason',default='')
    args=parser.parse_args()
    args.root.mkdir(parents=True,exist_ok=True)
    (args.root/'results.md').write_text(index(args.root,args.prepared,args.blocked_reason))
