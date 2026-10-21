"""Lossless source-record parser. Row coordinates identify a snapshot, not invoices."""
from collections import Counter, defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re

FIELDS = ('supplier_name', 'supplier_abn', 'reporting_entity', 'publish_description',
          'date_invoice_received', 'payment_date', 'payment_amount', 'contract_number')
TYPES = ('text', 'text', 'text', 'text', 'calendar_date', 'calendar_date', 'number', 'text')


def schema(view):
    columns = [c for c in view['columns'] if not c['fieldName'].startswith(':')]
    if [(c['fieldName'], c['dataTypeName']) for c in columns] != list(zip(FIELDS, TYPES)):
        raise ValueError('Published eight-field schema changed; review required')
    return [{k:c.get(k, '') for k in ('name','fieldName','dataTypeName','position','description')} for c in columns]


def date(value):
    if value in (None, ''):
        return None
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?', value):
        raise ValueError('Unexpected published date format')
    datetime.fromisoformat(value)
    return value[:10]


def records(payload, receipt):
    view = payload['meta']['view']
    schema(view)
    names = [c['fieldName'] for c in view['columns']]
    rows, originals = [], defaultdict(list)
    for position, values in enumerate(payload['data'], 1):
        if len(values) != len(names):
            raise ValueError('Source row width differs from schema')
        raw = dict(zip(names, values))
        native = {k:raw[k] for k in FIELDS}
        for k in FIELDS:
            if native[k] is not None and not isinstance(native[k], str):
                raise ValueError('Published value type changed')
        payment_date, received_date = date(native['payment_date']), date(native['date_invoice_received'])
        try:
            amount = Decimal(native['payment_amount']) if native['payment_amount'] not in (None, '') else None
            if amount is not None and not amount.is_finite():
                raise ValueError('Non-finite amount')
        except (InvalidOperation, TypeError):
            raise ValueError('Invalid published payment amount') from None
        month = payment_date[:7] if payment_date else None
        year = int(payment_date[:4]) if payment_date else None
        fy = year - (int(payment_date[5:7]) < 7) if payment_date else None
        row = dict(native, id=f"{receipt['sha256']}:{position}", source_row_position=position,
                   socrata_id=raw.get(':id'), socrata_sid=raw.get(':sid'), socrata_position=raw.get(':position'),
                   snapshot=receipt['snapshot'], snapshot_sha256=receipt['sha256'],
                   payment_day=payment_date, received_day=received_date, month=month,
                   financial_year=f'{fy}-{str(fy+1)[-2:]}' if fy else None, amount=float(amount) if amount is not None else None)
        rows.append(row)
        original = json.dumps(native, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
        originals[hashlib.sha256(original.encode()).hexdigest()].append(position)
    duplicates = [{'record_sha256':key,'source_row_positions':positions,'copies':len(positions)}
                  for key, positions in originals.items() if len(positions) > 1]
    months = Counter(r['month'] for r in rows if r['month'])
    latest = max(months) if months else None
    expected, y, m = [], 2015, 7
    while latest and f'{y:04}-{m:02}' <= latest:
        expected.append(f'{y:04}-{m:02}')
        y, m = (y+1, 1) if m == 12 else (y, m+1)
    report = dict(rows=len(rows), by_year=dict(sorted(Counter(r['payment_day'][:4] for r in rows if r['payment_day']).items())),
                  by_month={month:months.get(month,0) for month in sorted(set(expected) | set(months))},
                  missing_months=[month for month in expected if not months[month]],
                  payment_date_min=min((r['payment_day'] for r in rows if r['payment_day']),default=None),
                  payment_date_max=max((r['payment_day'] for r in rows if r['payment_day']),default=None),
                  missing_payment_dates=sum(r['payment_day'] is None for r in rows),
                  missing_amounts=sum(r['amount'] is None for r in rows),
                  missing_received_dates=sum(r['received_day'] is None for r in rows),
                  payments_below_invoice_threshold=sum(r['amount'] is not None and r['amount'] < 25000 for r in rows),
                  negative_payments=sum(r['amount'] is not None and r['amount'] < 0 for r in rows),
                  exact_duplicate_groups=len(duplicates), extra_duplicate_rows=sum(d['copies']-1 for d in duplicates),
                  duplicates=duplicates, deduplicated=False, public_computed_totals=0,
                  unique_source_coordinates=len({r['source_row_position'] for r in rows}) == len(rows),
                  unique_socrata_ids=len({r['socrata_id'] for r in rows}) == len(rows),
                  unique_invoice_id=False)
    return rows, report
