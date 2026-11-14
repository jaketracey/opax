"""Replay the measured follow-up without changing citations or raw evidence."""
import json
from pathlib import Path
import sqlite3

import pytest

from parli.ingest.arag_sync import map_speech
from parli.ingest.speaker_identity import identity_for, resolve_attribution, apply_identities

FIXTURE = json.loads((Path(__file__).parent / 'fixtures/speech-identities/martin-wragge.json').read_text())
ROWS = FIXTURE['rows']
EXPECTED = FIXTURE['expected']


@pytest.mark.parametrize('row', ROWS, ids=lambda r: str(r['speech_id']))
def test_followup_matches_independent_dated_seat_evidence(row):
    expected = EXPECTED[str(row['speech_id'])]
    original = dict(row)
    resolved = resolve_attribution(row)
    assert row == original
    assert resolved['person_id'] == expected['person_id']
    assert {k: v for k, v in resolved.items() if k not in ('person_id', 'speaker_name_clean')} == {
        k: v for k, v in row.items() if k not in ('person_id', 'speaker_name_clean')}
    if expected.get('held'):
        assert resolved == row
        return
    # These intervals were extracted independently from the pinned source CSV,
    # rather than from the resolver's matching rules.
    terms = FIXTURE['service'][expected['person_id']]
    assert any(t['start'] <= row['date'] <= t['end'] and t['chamber'] == row['chamber']
               and (not row['electorate'] or row['electorate'] in t['seat_prints']) for t in terms)
    doc = map_speech(dict(row, text='Held public speech. ' * 20, word_count=80, topic='Held topic'))
    assert doc['extra']['metadata']['person_id'] == expected['person_id']
    assert doc['slug'] == f"speech-{row['speech_id']}"


@pytest.mark.parametrize('runner', ['linker', 'hygiene'])
def test_all_followup_changes_are_idempotent_and_audited(tmp_path, monkeypatch, runner):
    from tests.test_federal_speaker_identities import repair_db
    db = repair_db(tmp_path / 'followup.db')
    fields = list(ROWS[0])
    db.executemany('INSERT INTO speeches (' + ','.join(fields) + ') VALUES ('
                   + ','.join('?' for _ in fields) + ')', [[r[k] for k in fields] for r in ROWS])
    db.commit()
    if runner == 'linker':
        assert apply_identities(db) == 750  # prior 89 plus this follow-up's 661
    else:
        from parli.ingest.speaker_hygiene import main
        monkeypatch.setattr('sys.argv', ['speaker_hygiene', '--db', str(tmp_path / 'followup.db'), '--loops', 'identity'])
        main()
    assert apply_identities(db) == 0
    assert db.execute('SELECT COUNT(*) FROM ext_kb_patch_queue').fetchone()[0] == 435
    assert db.execute("SELECT COUNT(*) FROM ext_kb_patch_queue q JOIN speeches s "
                      "ON q.slug='speech-' || s.speech_id WHERE s.source='wragge_xml'").fetchone()[0] == 0
    assert db.execute('SELECT COUNT(*) FROM ext_committee_relinks').fetchone()[0] == 750
    for row in ROWS:
        got = dict(db.execute('SELECT * FROM speeches WHERE speech_id=?', (row['speech_id'],)).fetchone())
        assert got == resolve_attribution(row)


def test_wragge_is_still_excluded_from_public_speech_counts():
    from scripts.export_speakers import count_speakers
    db = sqlite3.connect(':memory:')
    fields = list(ROWS[0]) + ['text']
    db.execute('CREATE TABLE speeches (' + ','.join(fields) + ')')
    db.executemany('INSERT INTO speeches VALUES (' + ','.join('?' for _ in fields) + ')',
                   [[r[k] for k in ROWS[0]] + ['Held public speech. ' * 20] for r in ROWS])
    assert dict(count_speakers(db, min_speeches=1)[0]) == {'Stephen Martin': 346}


@pytest.mark.parametrize('change', [dict(chamber='senate'), dict(date='2018-06-01'),
                                  dict(electorate='Reid'), dict(person_id='10937'),
                                  dict(source='committee_senate'), dict(state='tas'),
                                  dict(speaker_type='witness'), dict(witness_name='Example Witness')])
def test_full_name_rule_refuses_contradictory_context(change):
    row = next(r for r in ROWS if r['person_id'] == '10905' and r['electorate'])
    assert identity_for(row)
    assert identity_for(dict(row, **change)) is None


def test_missing_seats_require_the_reviewed_full_personal_print():
    full = next(r for r in ROWS if r['person_id'] == '10905' and not r['electorate'])
    assert identity_for(full)['name'] == 'Stephen Martin'
    assert identity_for(dict(full, speaker_name='Mr MARTIN')) is None
    for row in ROWS:
        if row['source'] == 'wragge_xml' and not row['electorate']:
            assert identity_for(row) is None


def test_followup_is_limited_to_the_measured_prior_ids():
    for row in ROWS:
        if not EXPECTED[str(row['speech_id'])].get('held'):
            assert identity_for(dict(row, person_id=None)) is None
            assert identity_for(dict(row, person_id='unreviewed-id')) is None


def test_a_conflicting_rule_holds_instead_of_taking_the_first_match(monkeypatch):
    import parli.ingest.speaker_identity as resolver
    person, rule = next((p, r) for p, r in resolver.RULES if '10905' in r['old_person_ids'])
    conflicting = dict(person, person_id='conflicting-catalogue-id')
    monkeypatch.setattr(resolver, 'RULES', [*resolver.RULES, (conflicting, rule)])
    row = next(r for r in ROWS if r['person_id'] == '10905')
    assert resolver.identity_for(row) is None


def test_full_audit_includes_wragge_and_checks_chamber_date_and_seat():
    from tests.test_federal_speaker_identities import repair_db
    from scripts.audit_speech_service import audit, service_index, service_problem
    from scripts.roster_source_profiles import reference
    db = repair_db()
    db.execute('ALTER TABLE speeches ADD COLUMN witness_name')
    fields = list(ROWS[0])
    db.executemany('INSERT INTO speeches (' + ','.join(fields) + ') VALUES ('
                   + ','.join('?' for _ in fields) + ')', [[r[k] for k in fields] for r in ROWS])
    scope = dict(all_federal=True, person_ids=['10592', '10905', '10937'])
    before = audit(db, resolved=False, **scope)
    after = audit(db, **scope)
    assert before['counts']['checked'] == 752
    assert before['counts']['chamber_mismatch'] == 346
    assert after['counts'] == {'checked': 752, 'passed': 750, 'outside_house_service': 2}
    assert sum(p['count'] for p in before['pairs'] if p['correct']) == 750
    index = service_index(reference())
    good = dict(person_id='person_9c02d321caef54b2ba21a1f8', chamber='representatives',
                date='1998-03-02', electorate='Cunningham')
    assert service_problem(good, index) is None
    assert service_problem(dict(good, electorate='Macarthur'), index) == 'seat_mismatch'
    assert service_problem(dict(good, chamber='senate'), index) == 'chamber_mismatch'
    assert service_problem(dict(good, date='2018-03-02'), index) == 'outside_house_service'


def test_service_input_builder_does_not_join_unrelated_people_with_missing_legacy_ids():
    from scripts.build_speech_service_evidence import catalogue_id
    from parli.electorates import stable_id
    people = [dict(person_id='existing', name='Alex Example', jurisdiction='federal')]
    assert catalogue_id(people, None, 'Blair Sample', 'aph:TEST') == stable_id('person', 'aph:TEST')
    assert catalogue_id(people, None, 'Alex Example', 'aph:TEST') == 'existing'


def test_conflicting_banks_member_does_not_hold_the_cunningham_rows_on_the_same_old_id():
    from tests.test_federal_speaker_identities import repair_db
    db = repair_db()
    fields = list(ROWS[0])
    db.executemany('INSERT INTO speeches (' + ','.join(fields) + ') VALUES ('
                   + ','.join('?' for _ in fields) + ')', [[r[k] for k in fields] for r in ROWS])
    pid = 'person_6b7f7f7533045b15bff880a6'
    db.execute('INSERT INTO members (person_id, full_name, chamber, electorate) VALUES (?,?,?,?)',
               (pid, 'Conflicting catalogue member', 'senate', 'Banks'))
    db.commit()
    assert apply_identities(db) == 618
    assert apply_identities(db) == 0
    assert db.execute('SELECT COUNT(*) FROM speeches WHERE person_id=?', (pid,)).fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM speeches WHERE person_id='person_9c02d321caef54b2ba21a1f8'").fetchone()[0] == 489


def test_offline_rebuild_counts_all_prior_ids_but_does_not_export_wragge_to_the_kb(tmp_path):
    from tests.test_federal_speaker_identities import repair_db
    from scripts.rebuild_speech_identities import rebuild
    db = repair_db()
    fields = list(ROWS[0])
    db.executemany('INSERT INTO speeches (' + ','.join(fields) + ') VALUES ('
                   + ','.join('?' for _ in fields) + ')', [[r[k] for k in fields] for r in ROWS])
    for field in ('text', 'topic', 'word_count'):
        db.execute('ALTER TABLE speeches ADD COLUMN ' + field)
    db.execute('UPDATE speeches SET text=?, topic=?, word_count=?', ('Held public speech. ' * 20, 'Held topic', 80))
    db.execute('CREATE TABLE topics (topic_id, name)')
    db.execute('CREATE TABLE speech_topics (speech_id, topic_id)')
    report = rebuild(db, tmp_path)
    assert len(report['speeches']) == 750
    assert report['mapped_documents'] == 435
    assert report['stored_profiles']['10905'] == dict(before=346, after=0)
    assert report['stored_profiles']['person_9c02d321caef54b2ba21a1f8'] == dict(before=0, after=489)
    docs = [json.loads(line) for line in (tmp_path / 'speech-documents.jsonl').read_text().splitlines()]
    main_ids = {r['speech_id'] for r in report['speeches'] if r['source'] != 'wragge_xml'}
    assert {d['slug'] for d in docs} == {f'speech-{sid}' for sid in main_ids}
