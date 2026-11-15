#!/usr/bin/env python3
"""Rebuild the affected speech documents and profile statistics offline.

Only the output directory is written. Topic shares reuse the held legacy
speech_topics labels, with all eligible House speeches as the denominator.
They are not a fresh enrichment or a read of the live knowledge box.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.ingest.arag_sync import map_speech  # noqa: E402
from parli.ingest.speaker_identity import IDENTITIES, identity_for, resolve_attribution  # noqa: E402
from scripts.export_speakers import eligible_where  # noqa: E402


def rebuild(db, out):
    out.mkdir(parents=True, exist_ok=True)
    old_ids = [p['old_person_id'] for p in IDENTITIES]
    ids = old_ids + [p['person_id'] for p in IDENTITIES]
    # Stephen Martin already has an accurately named transcript profile. Reuse
    # its existing cohort when recounting that profile; only the 89 reviewed
    # rows are reassigned or exported as changed documents.
    where = '(person_id IN (' + ','.join('?' for _ in ids) + ") OR speaker_name_clean='Stephen Martin')"
    all_rows = list(db.execute('SELECT * FROM speeches WHERE ' + where, ids))
    changed = [r for r in all_rows if identity_for(r)]
    before, after = defaultdict(list), defaultdict(list)
    columns = {r[1] for r in db.execute('PRAGMA table_info(speeches)')}
    eligible = list(db.execute('SELECT * FROM speeches WHERE ' + where
                              + " AND chamber='representatives' AND date>='1993-03-13' AND "
                              + eligible_where(columns), ids))
    labels = defaultdict(set)
    for row in all_rows:
        for label, in db.execute('SELECT t.name FROM speech_topics st JOIN topics t USING(topic_id) '
                                 'WHERE st.speech_id=?', (row['speech_id'],)):
            labels[row['speech_id']].add(label)
    for row in eligible:
        owner = (IDENTITIES[1]['person_id'] if row['speaker_name_clean'] == 'Stephen Martin'
                 else row['person_id'])
        before[owner].append(row)
        resolved = resolve_attribution(row)
        after[owner if owner == IDENTITIES[1]['person_id'] else resolved['person_id']].append(resolved)

    def stats(rows):
        counts = Counter(label for r in rows for label in labels[r['speech_id']])
        return dict(speeches=len(rows), first=min((r['date'] for r in rows), default=None),
                    last=max((r['date'] for r in rows), default=None),
                    topics={label: dict(speeches=n, share=round(n / len(rows), 6))
                            for label, n in sorted(counts.items())})

    profiles = {pid: dict(before=stats(before[pid]), after=stats(after[pid])) for pid in ids}
    manifest = []
    with (out / 'speech-documents.jsonl').open('w') as stream:
        for raw in sorted(changed, key=lambda r: r['speech_id']):
            doc = map_speech(raw)
            stream.write(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
            manifest.append(dict(speech_id=raw['speech_id'], before=raw['person_id'],
                                 after=doc['extra']['metadata']['person_id'], date=raw['date'],
                                 raw_sha256=hashlib.sha256(json.dumps(dict(raw), sort_keys=True,
                                                                     ensure_ascii=False).encode()).hexdigest()))
    report = dict(scope='Non-Wragge House speeches since 1993-03-13 under export_speakers eligibility',
                  topic_basis='Held legacy speech_topics labels; denominator is all eligible House speeches; multiple labels may overlap',
                  moved=dict(Counter(r['after'] for r in manifest)), profiles=profiles, speeches=manifest,
                  documents_sha256=hashlib.sha256((out / 'speech-documents.jsonl').read_bytes()).hexdigest())
    (out / 'rebuild.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    db = sqlite3.connect(f'file:{args.db}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    result = rebuild(db, args.out)
    print(json.dumps(dict(moved=result['moved'], profiles={pid: {k: v['speeches'] for k, v in p.items()}
                                                        for pid, p in result['profiles'].items()})))


if __name__ == '__main__':
    main()
