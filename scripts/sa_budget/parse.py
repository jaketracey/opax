"""Cell-preserving parsers for the inspected official SA layouts.

Fixtures use the same split headers, scaling format, dashes and ETF matrix.
No total is created here. Reconciliation arithmetic is a separate private path.
"""
from decimal import Decimal, ROUND_HALF_UP
import re

YEAR = re.compile(r'\b(20\d{2})[–-](\d{2})\b')


def year(value):
    match = YEAR.search(str(value))
    if not match:
        raise ValueError('Missing fiscal year')
    return match[1] + '-' + match[2]


def function_code(cell):
    raw = cell.value
    if isinstance(raw, int) and cell.number_format == '0000':
        return f'{raw:04d}'
    return str(raw or '')


def numeric(cell, scaled=False):
    raw = cell.value
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        if raw == '—':
            return dict(value=None, raw_value=raw, source_marker=raw, number_format=cell.number_format, display_divisor=1, decimals=None)
        raise ValueError('Unexpected source cell ' + cell.coordinate)
    fmt = cell.number_format.split(';')[0]
    divisor = 1000 if scaled and fmt.endswith(',') else 1
    if scaled and divisor != 1000:
        raise ValueError('Unrecognised Table 1.3 money format')
    decimals = 1 if fmt == '0.0' else 0
    display = Decimal(str(raw / divisor)).quantize(Decimal(10) ** -decimals, rounding=ROUND_HALF_UP)
    return dict(value=float(display), raw_value=raw, source_marker=None, number_format=cell.number_format,
                display_divisor=divisor, decimals=decimals)


def budget_cells(sheet, table_number):
    if not str(sheet['A1'].value).startswith('Table ' + table_number + ':'):
        raise ValueError('Unrecognised source title')
    summary = table_number == '1.3'
    columns = []
    for col in range(2, sheet.max_column + 1):
        header = ' '.join(str(sheet.cell(r, col).value or '') for r in range(2, 5) if summary or r == 2)
        fiscal = year(header)
        label = YEAR.sub('', header).strip()
        label = ' '.join(label.split())
        if label not in ('Actual', 'Estimated Result', 'Budget', 'Estimate'):
            raise ValueError('Unrecognised estimate/actual header: ' + label)
        columns.append((col, fiscal, label))
    out = []
    for row in range(5 if summary else 4, sheet.max_row + 1):
        label = sheet.cell(row, 1).value
        if not label or not any(sheet.cell(row, col).value is not None for col, _, _ in columns):
            continue
        label = str(label).strip()
        source_label = str(sheet.cell(row, 1).value)
        section = ''
        if table_number == 'A.1':
            if 5 <= row <= 13:
                section = str(sheet['A4'].value)
            elif 17 <= row <= 28:
                section = str(sheet['A16'].value)
        # The cash-flow table wraps labels above/below a numeric source row.
        if table_number == 'A.7':
            if row in (34, 54):
                label += ' ' + str(sheet.cell(row + 1, 1).value).strip()
            if row in (37, 39):
                label = str(sheet.cell(row - 1, 1).value).strip() + ' ' + label
        for col, fiscal, label_status in columns:
            cell = sheet.cell(row, col)
            if cell.value is None:
                raise ValueError('Unexpected blank budget cell ' + cell.coordinate)
            units = 'percent' if summary and '(%)' in label else 'AUD million'
            out.append(dict(sheet=sheet.title, cell=cell.coordinate, measure=(section + ': ' if section else '') + label,
                            measure_as_published=source_label, section_as_published=section,
                            fiscal_year=fiscal, estimate_or_actual='actual' if label_status == 'Actual' else 'estimate',
                            status_as_published=label_status, units=units, unit_status='verified',
                            basis='Cash flow' if table_number == 'A.7' else 'Balance sheet at year end' if table_number == 'A.4' else 'Accrual budget indicators' if summary else 'Accrual operating statement',
                            **numeric(cell, scaled=summary and units == 'AUD million')))
    return out


def function_cells(sheet):
    fiscal = year(sheet.title)
    if year(sheet['A1'].value) != fiscal or sheet['A4'].value != 'GPC' or sheet['B4'].value != 'Description':
        raise ValueError('Unrecognised function matrix')
    totals = [c.column for c in sheet[3] if c.value == 'Total GPC']
    if len(totals) != 1:
        raise ValueError('Exactly one published Total GPC column required')
    end = totals[0]
    out = []
    for row in range(5, sheet.max_row + 1):
        code = function_code(sheet.cell(row, 1))
        if not (re.fullmatch(r'\d{4}', code) or code == 'TOTAL'):
            continue
        for col in range(3, end + 1):
            cell = sheet.cell(row, col)
            # Blank cells stay absent, never zero. The source matrix is sparse.
            if cell.value is None:
                continue
            etf = sheet.cell(3, col).value
            description = str(sheet.cell(4, col).value or '')
            out.append(dict(sheet=sheet.title, cell=cell.coordinate, fiscal_year=fiscal,
                            measure='Expenses', function_code=code,
                            measure_as_published='Expenses', section_as_published='',
                            function_code_raw=sheet.cell(row, 1).value,
                            function_as_published=sheet.cell(row, 2).value or code,
                            economic_type_code=str(etf), economic_type_as_published=description if col != end else 'Total GPC',
                            estimate_or_actual='actual', status_as_published='Final Budget Outcome (resource description)',
                            units='Unresolved: catalogue says $million; workbook does not label its scale',
                            unit_status='unresolved', basis='Final Budget Outcome; GPC by ETF, as published; subject to revision',
                            **numeric(cell)))
    return out
