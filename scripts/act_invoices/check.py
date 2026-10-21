"""Reparse retained originals and reject any altered, held or partial staging."""
import argparse
import json
from .acquire import STAGE
from .stage import build


def checked_projection(stage):
    inventory,columns,rows,report,audit,info,text=build(stage)
    for name,value in [('inventory',inventory),('schema',columns),('reconciliation',report),('acquisition-audit',audit),('hub',info)]:
        if json.loads((stage/(name+'.json')).read_text())!=value:
            raise ValueError('Staging differs from retained original: '+name)
    if (stage/'series.jsonl').read_text()!=text:
        raise ValueError('Source rows differ from retained original')
    coverage=dict(exact_duplicate_groups=report['exact_duplicate_groups'],extra_duplicate_rows=report['extra_duplicate_rows'],observed_months=sum('2015-07'<=m<=info['payment_date_max'][:7] for m in report['by_month']),missing_months=report['missing_months'],outside_period_rows=sum(n for m,n in report['by_month'].items() if m<'2015-07'),missing_payment_dates=report['missing_payment_dates'])
    return dict(info,coverage=coverage,series_jsonl=text),dict(rows=len(rows),months=len(report['by_month']),missing_months=report['missing_months'],
                                  exact_duplicate_groups=report['exact_duplicate_groups'],extra_duplicate_rows=report['extra_duplicate_rows'],public_computed_totals=0)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--dry-run',action='store_true',required=True);p.parse_args()
    _,counts=checked_projection(STAGE)
    print(json.dumps(dict(mode='dry-run',writes=0,review=json.loads((STAGE/'review.json').read_text())['status'],**counts)))
