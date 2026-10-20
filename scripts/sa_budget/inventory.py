"""Inventory publisher HTML only; no CKAN API or inferred table numbers."""
from html.parser import HTMLParser
import re
from urllib.parse import urljoin

from .acquire import BASE


class ResourceList(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'li' and 'resource-item' in a.get('class', '').split():
            self.current = {'id': a['data-id']}
            self.rows.append(self.current)
        if self.current is None:
            return
        if tag == 'a' and 'heading' in a.get('class', '').split():
            title = a['title']
            match = re.match(r'^(Table|Figure) ([A-Z0-9]+\.[0-9]+(?:\([a-z]\))?)(?=\s|$)', title)
            self.current.update(title=title, resource_url=urljoin(BASE, a['href']),
                                table_number=match[2] if match and match[1] == 'Table' else None,
                                published_number=match[0] if match else None)
        if tag == 'span' and 'format-label' in a.get('class', '').split():
            self.current['format'] = a['data-format'].upper()


def resources(html):
    parser = ResourceList()
    parser.feed(html)
    for row in parser.rows:
        if not all(row.get(k) for k in ('id', 'title', 'resource_url', 'format')):
            raise ValueError('Incomplete publisher resource entry')
    if len({r['id'] for r in parser.rows}) != len(parser.rows):
        raise ValueError('Duplicate resource UUID')
    return parser.rows
