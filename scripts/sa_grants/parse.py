"""Conservative award parsers. No identity resolution or aggregate amounts."""
import csv
from decimal import Decimal
import io
import re

HEADERS = ['Organisation Name', 'Project Title', 'Project Description', 'Region', 'Amount']
FIELDS = ('recipient', 'project_title', 'project_description', 'region', 'amount_as_published')
AWARD_FIELDS = FIELDS + ('amount', 'year', 'programme', 'sheet', 'source_row')
EXCLUDED = re.compile(r'unsucc|applicant|application|not\s+funded', re.I)


def amount(value):
    text = str(value).strip()
    if not re.fullmatch(r'\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?', text):
        raise ValueError('Unknown published amount syntax')
    return float(Decimal(text.replace('$', '').replace(',', '')))


def csv_awards(body, year):
    if year not in ('2016-17', '2017-18'):
        raise ValueError('Outside Grants SA historical years')
    # Originals use Windows-1252 punctuation, including the publisher's dagger.
    reader = csv.reader(io.StringIO(body.decode('cp1252'), newline=''))
    if next(reader, None) != HEADERS:
        raise ValueError('Unknown Grants SA CSV header')
    rows = []
    for number, values in enumerate(reader, 2):
        if not any(v.strip() for v in values):
            continue
        if len(values) != 5 or not all(v.strip() for v in values):
            raise ValueError('Incomplete award row')
        row = dict(zip(FIELDS, values))  # Verbatim, including source whitespace.
        row.update(amount=amount(values[4]), year=year, programme='Grants SA', sheet='CSV', source_row=number)
        rows.append(row)
    return rows


def successful_sheet(name, title):
    return not EXCLUDED.search(name + ' ' + title) and title.startswith('Successful Organisations PCIF ')


def xls_awards(book, year, title, allowed_sheets):
    """Future file gate: explicitly reviewed successful sheets only.

    No live XLS schema is approved in this run: all five originals are 404.
    The narrow synthetic layout exercises exclusions without reading any cells
    from applicant/unsuccessful sheets. Unknown headers fail closed.
    """
    if not re.fullmatch(r'20(?:08-09|09-10|10-11|11-12|12-13)', year):
        raise ValueError('Outside PCIF years')
    rows = []
    for name in book.sheet_names():
        if name not in allowed_sheets or not successful_sheet(name, title):
            continue
        sheet = book.sheet_by_name(name)
        if sheet.row_values(0) != HEADERS:
            raise ValueError('Unreviewed successful-award XLS layout')
        for index in range(1, sheet.nrows):
            values = sheet.row_values(index)
            if not any(str(v).strip() for v in values):
                continue
            if len(values) != 5 or not all(str(v).strip() for v in values):
                raise ValueError('Incomplete successful award')
            row = dict(zip(FIELDS, values))
            row.update(amount=amount(values[4]), year=year, programme="Premier’s Community Initiatives Fund", sheet=name, source_row=index+1)
            rows.append(row)
    return rows
