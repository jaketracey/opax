"""Small complete static evidence tree; no real source/sidecar data."""
import json
from pathlib import Path
import sys


def seed(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'lookup').mkdir(exist_ok=True)
    rows = []
    for i, prefix in enumerate(('aa', 'bb'), 1):
        identity = prefix + '0' * 22
        row = dict(id=identity, name=f'Fixture {i}', kind='organisation', abn=None, records=100)
        text = 'Honourable membersinterjecting— &amp; ' * 10
        entry = dict(row, years={'2026': 100}, source_kinds={'Parliamentary record': 100},
                     excerpts=[dict(id=f'e{i}', text=text, details={'excerpt': text})])
        (directory / f'{prefix}.json').write_text(json.dumps({'entries': {identity: entry}}, ensure_ascii=False))
        (directory / 'lookup' / f'{prefix}.json').write_text(json.dumps({f'fixture {i}': [identity]}))
        rows.append(row)
    stats = dict(generated_at='old', complete=True, programme_links_complete=True,
                 identity_review_complete=True, additional_mentions_complete=True,
                 published_record_matches=200, entities_with_connections=2)
    (directory / 'index.json').write_text(json.dumps(dict(meta=stats, entities=rows)))
    (directory / 'stats.json').write_text(json.dumps(stats))
    (directory / 'identity-links.json').write_text(json.dumps(dict(method='fixture', links=[])))


if __name__ == '__main__':
    seed(sys.argv[1])
