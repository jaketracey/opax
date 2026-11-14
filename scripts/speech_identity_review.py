"""Exact reviewed roster deltas for the two dated House identity repairs.

The neutral Martin transcript has a pinned witness cohort different from the
raw snapshot. Its reviewed change subtracts only the two eligible Cunningham
speeches, retaining that cohort. Both the raw export and delta are pinned.
"""
import hashlib
import json
from pathlib import Path

from parli.ingest.speaker_identity import BY_NAME, IDENTITIES, identity_for

RULE = 'dated-house-speaker-identity'


def review(root):
    root = Path(root)
    data = json.loads((root / 'scripts/speech_identity_review.json').read_text())
    raw = (root / 'tests/fixtures/speech-identities/house.json').read_bytes()
    if hashlib.sha256(raw).hexdigest() != data['fixture_sha256']:
        raise ValueError('House identity replay fixture changed')
    from collections import Counter
    counts = Counter(identity_for(r)['person_id'] for r in json.loads(raw))
    if counts != {IDENTITIES[0]['person_id']: 85, IDENTITIES[1]['person_id']: 4}:
        raise ValueError('House identity replay does not establish 85 + 4 speeches')
    return data


def group_problem(name, group, row, root):
    expected = review(root)['records'].get(name)
    if expected is None or group.get('fields') != expected['fields']:
        return 'dated House repair differs from the reviewed profile delta'
    if row is not None and row != expected.get('prior') and not all(row.get(f) in values for f, values in expected['fields'].items()):
        return 'dated House repair profile moved since review'
    return None


def fresh_matches(name, row, root):
    expected = review(root)['records'].get(name)
    return row is not None and expected is not None and all(row.get(f) == v for f, v in expected['raw_after'].items())


def new_problem(name, entry, root):
    expected = review(root)['new'].get(name)
    person = BY_NAME.get(name)
    if (person is None or entry.get('row') != expected or entry.get('phid') != person['phid']
            or entry.get('service') != dict(chamber=person['house'], jurisdiction='federal',
                                             start=person['start'], end=person['end'])):
        return 'new House profile differs from its reviewed identity and service'
    # Require the existing catalogue identity and exact dated seat term.
    from scripts.roster_source_profiles import reference
    bundle = reference(root)
    terms = [t for t in bundle['terms'] if t['representation_id'] == person['catalog_term_id']]
    if (len(terms) != 1 or terms[0]['person_id'] != person['person_id']
            or (terms[0]['start'], terms[0]['end']) != (person['start'], person['end'])):
        return 'reviewed House term differs from the published catalogue'
    return None
