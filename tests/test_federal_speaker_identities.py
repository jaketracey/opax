"""Replay the 89 held House attributions against independently sourced seat terms."""
import json
from pathlib import Path

import pytest

from parli.ingest.arag_sync import map_speech
from scripts.roster_source_profiles import reference
from scripts.audit_speech_service import service_index, service_problem

ROWS = json.loads((Path(__file__).parent / 'fixtures/speech-identities/house.json').read_text())


def holds_seat(person_id, house, day):
    return service_problem(dict(person_id=person_id, chamber=house, date=day), service_index(reference())) is None


@pytest.mark.parametrize('row', ROWS, ids=lambda r: str(r['speech_id']))
def test_resolved_house_speaker_holds_a_seat_on_the_speech_date(row):
    doc = map_speech(dict(row, text='Held speech text.', word_count=3, topic='Held topic'))
    pid = doc['extra']['metadata']['person_id']
    assert holds_seat(pid, row['chamber'], row['date']), (row['speech_id'], pid, row['date'])


def test_the_guard_catches_wrong_house_and_day_and_only_allows_an_exact_exception():
    row = dict(speech_id=5, person_id='10592', chamber='representatives', date='1998-03-02')
    index = service_index(reference())
    assert service_problem(row, index) == 'outside_house_service'
    allowed = dict(row, reason='Fixture exception', source_url='https://example.invalid/evidence')
    assert service_problem(row, index, [allowed]) is None
    assert service_problem(dict(row, date='1998-03-03'), index, [allowed])
    assert service_problem(dict(row, chamber='senate'), index, [allowed])


def test_source_rules_reject_contradictory_seats_dates_houses_and_witnesses():
    from parli.ingest.speaker_identity import identity_for
    row = ROWS[0]
    assert identity_for(row)
    for change in [dict(electorate='Casey'), dict(date='2001-11-10'), dict(chamber='senate'),
                   dict(state='vic'), dict(speaker_type='witness'), dict(witness_name='Witness'),
                   dict(person_id='10937'), dict(source='wragge_xml')]:
        assert identity_for(dict(row, **change)) is None
    martin = next(r for r in ROWS if r['person_id'] == '10937')
    assert identity_for(martin)['name'] == 'Stephen Martin'
    assert identity_for(dict(martin, electorate='Reid')) is None
    assert identity_for(dict(martin, electorate='')) is None
    assert identity_for(dict(martin, date='2020-03-04')) is None


def repair_db(path=':memory:'):
    import sqlite3
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute('CREATE TABLE members (person_id PRIMARY KEY, full_name, first_name, last_name, state, '
               'chamber, electorate, entered_house, left_house)')
    fields = list(ROWS[0])
    db.execute('CREATE TABLE speeches (' + ','.join(fields) + ')')
    db.executemany('INSERT INTO speeches VALUES (' + ','.join('?' for _ in fields) + ')',
                   [[r[k] for k in fields] for r in ROWS])
    db.execute('CREATE TABLE ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes)')
    db.commit()
    return db


def test_nightly_repair_reuses_catalogue_ids_queues_all_89_and_is_idempotent():
    from parli.ingest.speaker_identity import apply_identities
    db = repair_db()
    assert apply_identities(db) == 89
    assert apply_identities(db) == 0
    assert db.execute('SELECT COUNT(*) FROM ext_kb_patch_queue').fetchone()[0] == 89
    assert db.execute('SELECT COUNT(*) FROM members').fetchone()[0] == 2
    # entered_house is the full House career, distinct from the Cunningham
    # party/service interval used to resolve the four 2002 prints.
    assert db.execute("SELECT entered_house FROM members WHERE person_id='person_9c02d321caef54b2ba21a1f8'").fetchone()[0] == '1984-12-01'
    for row in db.execute('SELECT * FROM speeches'):
        assert holds_seat(row['person_id'], row['chamber'], row['date'])
        original = next(r for r in ROWS if r['speech_id'] == row['speech_id'])
        for field in ROWS[0]:
            if field not in ('person_id', 'speaker_name_clean'):
                assert row[field] == original[field]


@pytest.mark.parametrize('conflicting_index', [0, 1])
@pytest.mark.parametrize('runner', ['linker', 'hygiene', 'hygiene-dry-run'])
def test_member_conflict_skips_only_that_identity_and_logs_it(conflicting_index, runner, tmp_path, monkeypatch, caplog):
    from parli.ingest.speaker_identity import IDENTITIES, apply_identities
    path = tmp_path / 'repair.db'
    db = repair_db(path)
    conflict = IDENTITIES[conflicting_index]
    db.execute('INSERT INTO members (person_id, full_name, chamber, electorate) VALUES (?,?,?,?)',
               (conflict['person_id'], 'Conflicting catalogue record', 'senate', conflict['seat']))
    db.commit()
    dry_run = runner == 'hygiene-dry-run'
    expected = 0 if dry_run else sum(r['person_id'] != conflict['old_person_id'] for r in ROWS)
    if runner == 'linker':
        assert apply_identities(db) == expected
        assert apply_identities(db) == 0
    else:
        from parli.ingest.speaker_hygiene import main
        monkeypatch.setattr('sys.argv', ['speaker_hygiene', '--db', str(path), '--loops', 'identity']
                            + (['--dry-run'] if dry_run else []))
        main()
    assert f"Skipping reviewed House identity {conflict['person_id']}" in caplog.text
    assert db.execute('SELECT full_name, chamber FROM members WHERE person_id=?',
                      (conflict['person_id'],)).fetchone()[:] == ('Conflicting catalogue record', 'senate')
    assert db.execute('SELECT COUNT(*) FROM ext_kb_patch_queue').fetchone()[0] == expected
    assert db.execute('SELECT COUNT(*) FROM ext_committee_relinks').fetchone()[0] == expected
    assert db.execute('SELECT COUNT(*) FROM members').fetchone()[0] == (1 if dry_run else 2)
    for row in db.execute('SELECT * FROM speeches'):
        original = next(r for r in ROWS if r['speech_id'] == row['speech_id'])
        if dry_run or original['person_id'] == conflict['old_person_id']:
            assert dict(row) == original
        else:
            assert holds_seat(row['person_id'], row['chamber'], row['date'])


def test_reviewed_profile_changes_hold_if_the_raw_export_or_review_moves():
    from copy import deepcopy
    from scripts import roster_accept
    from scripts.speech_identity_review import RULE, fresh_matches, group_problem, review
    root = Path(__file__).resolve().parents[1]
    data = review(root)
    for name, expected in data['records'].items():
        group = dict(evidence=RULE, fields=expected['fields'])
        assert group_problem(name, group, None, root) is None
        moved = deepcopy(group)
        moved['fields']['speeches'][1] += 1
        assert group_problem(name, moved, None, root)
        raw = expected['raw_after']
        assert fresh_matches(name, raw, root)
        assert not fresh_matches(name, dict(raw, speeches=raw['speeches'] + 1), root)
    people = json.loads((root / 'portal/public/parliamentarians.json').read_text())['people']
    assert roster_accept.validate(roster_accept.load(), people) == []


def test_read_only_export_and_sync_resolve_the_same_89_original_prints():
    import sqlite3
    from scripts.export_speakers import count_speakers
    db = sqlite3.connect(':memory:')
    fields = list(ROWS[0]) + ['text']
    db.execute('CREATE TABLE speeches (' + ','.join(fields) + ')')
    db.executemany('INSERT INTO speeches VALUES (' + ','.join('?' for _ in fields) + ')',
                   [[r[k] for k in ROWS[0]] + ['Held speech. ' * 30] for r in ROWS])
    counts, _ = count_speakers(db, min_speeches=1)
    assert dict(counts) == {'Anthony Charles Smith': 85, 'Stephen Martin': 4}
