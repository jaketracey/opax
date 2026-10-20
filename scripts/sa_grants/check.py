"""Reparse retained originals; validate private candidate without promotion."""
import argparse
import json
from .acquire import STAGE
from .stage import build, projection


def checked_projection(stage):
    if stage.resolve()!=STAGE.resolve():
        raise ValueError('Retained source cache belongs to this worktree')
    inventory,hub,reconciliation,audit=build()
    for name,expected in [('inventory',inventory),('hub',hub),('reconciliation',reconciliation),('acquisition-audit',audit)]:
        if json.loads((stage/(name+'.json')).read_text())!=expected:
            raise ValueError('Staging differs from retained source: '+name)
    series=[json.loads(line) for line in (stage/'series.jsonl').read_text().splitlines()]
    if series!=hub['rows']:
        raise ValueError('Award rows differ from retained source')
    assert len({(r['resource_id'],r['sheet'],r['source_row']) for r in series})==len(series)
    output=projection(hub)
    assert all(r['programme']=='Grants SA' for r in output['rows'])
    assert all(c['status']=='pass' for c in reconciliation['checks'])
    return output,dict(**inventory['counts'],reconciliations=len(reconciliation['checks']),source_row_checks=len(series),public_computed_totals=0)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--dry-run',action='store_true',required=True);p.parse_args()
    _,counts=checked_projection(STAGE)
    print(json.dumps(dict(mode='dry-run',writes=0,review=json.loads((STAGE/'review.json').read_text())['status'],**counts)))
