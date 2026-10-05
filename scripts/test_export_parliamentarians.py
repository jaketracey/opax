"""Directory party fallbacks and the federal/state surname boundary."""
import contextlib
import io
import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from scripts import export_parliamentarians as export
from parli.ingest.link_speakers import build_member_lookup, match_historical_surname


class MemberPartyTests(unittest.TestCase):
    def setUp(self):
        # These exports are tiny fixtures with no baseline, which only the explicit override ships; the
        # safety net has its own tests below.
        for patcher in (patch.object(export, 'PREVIOUS', os.path.join(tempfile.gettempdir(), 'no-shipped-roster.json')),
                        patch.dict(os.environ, {'OPAX_ROSTER_ACCEPT': '1'})):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_verified_state_roster_repairs_are_scoped_to_the_contaminated_identity(self):
        self.assertEqual(export.member_party('vic_annabelle_cleeland', 'Annabelle Cleeland', 'vic', 'vic_la', 'ALP', None), 'Nationals')
        self.assertEqual(export.member_party('sa_harvey', 'Richard Manuel Harvey', 'sa', 'sa_ha', 'ALP', None), 'Liberal')
        self.assertEqual(export.member_party('sa_harvey', 'Richard Manuel Harvey', 'sa', 'sa_ha', 'ALP', 'ALP'), 'Liberal')
        for identity in [('vic_annabelle_cleeland', 'Annabelle Cleeland', 'federal', 'representatives'),
                         ('vic_annabelle_cleeland', 'Peter Cleeland', 'vic', 'vic_la'),
                         ('historic_cleeland', 'Annabelle Cleeland', 'vic', 'vic_la')]:
            self.assertEqual(export.member_party(*identity, 'ALP', None), 'Labor')
        self.assertEqual(export.member_party('vic_annabelle_cleeland', 'Annabelle Cleeland', 'vic', 'vic_la', 'Greens', None), 'Greens')
        self.assertEqual(export.member_party('vic_annabelle_cleeland', 'Annabelle Cleeland', 'vic', 'vic_la', 'ALP', 'Greens'), 'Greens')

    def test_refresh_exports_corrected_fallbacks_without_changing_speech_party_history(self):
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.executescript('''
            CREATE TABLE members (person_id TEXT, full_name TEXT, state TEXT, chamber TEXT,
                                  party TEXT, party_canonical TEXT, left_house TEXT,
                                  first_name TEXT, last_name TEXT, entered_house TEXT);
            CREATE TABLE speeches (speaker_name TEXT, person_id TEXT, party TEXT, party_canonical TEXT,
                                   state TEXT, chamber TEXT, date TEXT, witness_name TEXT, text TEXT);
        ''')
        db.executemany('INSERT INTO members (person_id, full_name, state, chamber, party, party_canonical, '
                       'left_house) VALUES (?,?,?,?,?,?,?)', [
            ('vic_annabelle_cleeland', 'Annabelle Cleeland', 'vic', 'vic_la', 'ALP', None, None),
            ('sa_harvey', 'Richard Manuel Harvey', 'sa', 'sa_ha', 'ALP', 'ALP', '2022-03-19'),
            ('100', 'Peter Cleeland', 'federal', 'representatives', 'ALP', None, '1996-03-02'),
            ('101', 'Party Switch', 'federal', 'senate', 'Greens', 'Greens', None),
        ])
        for name, pid, state, chamber, party in [
            ('Annabelle Cleeland', 'vic_annabelle_cleeland', 'vic', 'vic_la', ''),
            ('Harvey', 'sa_harvey', 'sa', 'sa_ha', ''),
            ('Peter Cleeland', '100', 'federal', 'representatives', 'ALP'),
            ('Party Switch', '101', 'federal', 'senate', 'ALP'),
        ]:
            db.executemany('INSERT INTO speeches VALUES (?,?,?,?,?,?,?,?,?)',
                           [(name, pid, party, None, state, chamber, '2025-05-01', None, 'x' * 250)] * 6)
        stdout = io.StringIO()
        with patch.object(export.sqlite3, 'connect', return_value=db), \
             patch.multiple(export, prepare_dedupe=lambda *_: None, JUNK_PREDICATES='', DEDUPE_PREDICATES=''), \
             contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(io.StringIO()):
            export.main()
        people = {p['name']: p for p in json.loads(stdout.getvalue())['people']}
        self.assertEqual(people['Annabelle Cleeland']['party'], 'Nationals')
        self.assertEqual(people['Harvey']['party'], 'Liberal')
        self.assertEqual(people['Peter Cleeland']['party'], 'Labor')
        self.assertEqual(people['Party Switch']['party'], 'Labor')
        self.assertEqual(people['Party Switch']['party_now'], 'Greens')
        self.assertFalse(people['Annabelle Cleeland'].get('current', False))

    def test_a_row_takes_only_the_person_id_it_is_verified_to_be(self):
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.executescript('''
            CREATE TABLE members (person_id TEXT, full_name TEXT, first_name TEXT, last_name TEXT, state TEXT,
                                  chamber TEXT, party TEXT, party_canonical TEXT, entered_house TEXT, left_house TEXT);
            CREATE TABLE speeches (speaker_name TEXT, person_id TEXT, party TEXT, party_canonical TEXT,
                                   state TEXT, chamber TEXT, date TEXT, witness_name TEXT, text TEXT);
        ''')
        db.executemany('INSERT INTO members VALUES (?,?,?,?,?,?,?,?,?,?)', [
            ('10098', 'George Campbell', 'George', 'Campbell', 'federal', 'senate', 'ALP', 'ALP', '1997-03-11', '2008-06-30'),
            ('10903', 'Rex Patrick', 'Rex', 'Patrick', 'federal', 'senate', 'IND', None, '2017-11-14', '2022-06-30'),
            ('10922', 'Pat Conaghan', 'Pat', 'Conaghan', 'federal', 'representatives', 'NAT', None, '2019-05-18', None),
            ('10964', 'Dorinda Cox', 'Dorinda', 'Cox', 'federal', 'senate', 'ALP', 'ALP', '2021-09-01', None),
            ('10007', 'Anthony Albanese', 'Anthony', 'Albanese', 'federal', 'representatives', 'ALP', 'ALP', '1996-03-02', None),
            ('10026', 'Bob Baldwin', 'Bob', 'Baldwin', 'federal', 'representatives', 'LIB', None, '1996-03-02', '2016-05-09'),
            ('10545', 'Stuart Robert', 'Stuart', 'Robert', 'federal', 'representatives', 'LIB', None, '2007-11-24', '2023-05-18'),
            ('10758', 'Bridget McKenzie', 'Bridget', 'McKenzie', 'federal', 'senate', 'NAT', None, '2011-07-01', None),
        ])
        rows = [
            # (print, linked person_id, chamber, date, witness)
            ('Graeme Campbell', '10098', 'representatives', '1998-03-03', None),   # Kalgoorlie, gone in 1998
            ('George Campbell', '10098', 'senate', '2006-03-03', None),
            ('Patrick Conaghan', '10903', 'representatives', '2020-03-03', None),  # the linker read Patrick
            ('Robert Baldwin', '10545', 'representatives', '2005-03-03', None),
            ('Cox', '10964', 'representatives', '2000-03-03', None),               # David Cox, Kingston
            ('Cox', '10964', 'senate_committee', '2024-03-03', None),             # Dorinda Cox
            ('Dorinda Cox', '10964', 'senate', '2024-03-03', None),
            ('Albanese', '10007', 'representatives', '2001-03-03', None),
            ('McKenzie', '10758', 'senate_committee', '2025-03-03', None),
            ('McKenzie', None, 'senate_committee', '2025-04-03', 'Mr McKenzie'),   # a witness
        ]
        for name, pid, chamber, day, witness in rows:
            db.executemany('INSERT INTO speeches VALUES (?,?,?,?,?,?,?,?,?)',
                           [(name, pid, 'ALP', None, 'federal', chamber, day, witness, 'x' * 250)] * 6)
        stdout = io.StringIO()
        with patch.object(export.sqlite3, 'connect', return_value=db), \
             patch.object(export, 'same_person', return_value={'robert baldwin': '10026'}), \
             patch.multiple(export, prepare_dedupe=lambda *_: None, JUNK_PREDICATES='', DEDUPE_PREDICATES=''), \
             contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(io.StringIO()):
            export.main()
        people = {p['name']: p for p in json.loads(stdout.getvalue())['people']}
        # A namesake's id is dropped, not kept: no face, votes or seat from George Campbell.
        self.assertNotIn('pid', people['Graeme Campbell'])
        self.assertEqual(people['George Campbell']['pid'], '10098')
        # The one member of that name in those years.
        self.assertEqual(people['Patrick Conaghan']['pid'], '10922')
        self.assertTrue(people['Patrick Conaghan']['current'])
        # The hand-checked list (person_identity.json) for a nickname the names cannot show.
        self.assertEqual(people['Robert Baldwin']['pid'], '10026')
        # A print holding two people takes neither, nor the other's sitting status or name.
        for field in ('pid', 'current', 'party_now', 'full'):
            self.assertNotIn(field, people['Cox'])
        self.assertEqual(people['Dorinda Cox']['pid'], '10964')
        self.assertTrue(people['Dorinda Cox']['current'])
        # One person's print keeps the id and the full name; a print shared with a witness does not.
        self.assertEqual((people['Albanese']['pid'], people['Albanese']['full']), ('10007', 'Anthony Albanese'))
        self.assertNotIn('pid', people['McKenzie'])

    def test_federal_surname_lookup_cannot_capture_a_state_member(self):
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.row_factory = sqlite3.Row
        db.execute('CREATE TABLE members (person_id, first_name, last_name, full_name, chamber)')
        db.executemany('INSERT INTO members VALUES (?,?,?,?,?)', [
            ('vic_annabelle_cleeland', 'Annabelle', 'Cleeland', 'Annabelle Cleeland', 'vic_la'),
            ('sa_harvey', 'Richard', 'Harvey', 'Richard Manuel Harvey', 'sa_ha'),
            ('101', 'Mehreen', 'Faruqi', 'Mehreen Faruqi', 'senate'),
            ('nsw_faruqi', 'Mehreen', 'Faruqi', 'Mehreen Faruqi', 'nsw_lc'),
        ])
        full, surnames = build_member_lookup(db)
        self.assertIsNone(match_historical_surname('Mr CLEELAND', 'Cleeland', surnames))
        self.assertIsNone(match_historical_surname('Mrs HARVEY', 'Harvey', surnames))
        self.assertEqual(full['mehreen faruqi'], '101')
        self.assertEqual(match_historical_surname('Senator FARUQI', 'Faruqi', surnames), '101')
        db.execute("INSERT INTO members VALUES ('100', 'Peter', 'Cleeland', 'Peter Cleeland', 'representatives')")
        _, surnames = build_member_lookup(db)
        self.assertEqual(match_historical_surname('Mr CLEELAND', 'Cleeland', surnames), '100')


def roster_row(name, pid=None, current=False, **extra):
    row = {'name': name, 'speeches': 10}
    if pid:
        row['pid'] = pid
    if current:
        row.update(current=True, party_now='Labor')
    row.update(extra)
    return row


class SafetyNetTests(unittest.TestCase):
    """A new export may not replace the shipped roster if it takes a sitting member's id or seat, changes the
    identity of more than 25 rows, or drops rows (docs/PHOTOS.md, "Nightly safety net")."""
    SHIPPED = [roster_row('Anthony Albanese', '10007', True), roster_row('Albanese', '10007', True, full='Anthony Albanese'),
               roster_row('Pat Conaghan', '10922', True), roster_row('Graeme Campbell')] + \
              [roster_row(f'Former Member {i}', str(20000 + i)) for i in range(30)]

    def test_the_same_roster_or_a_small_change_ships(self):
        self.assertEqual(export.refusals(self.SHIPPED, self.SHIPPED), [])
        new = [dict(r) for r in self.SHIPPED] + [roster_row('New Senator', '11099', True)]
        for r in new[4:29]:  # 25 rows change: the limit, not over it
            r.pop('pid')
        self.assertEqual(export.refusals(self.SHIPPED, new), [])

    def test_a_sitting_member_losing_an_id_or_seat_is_held(self):
        for change, why in [({'pid': None}, '10922 -> no id'), ({'pid': '10903'}, '10922 -> 10903'),
                            ({'current': None}, 'no longer sitting')]:
            new = [dict(r) for r in self.SHIPPED]
            new[2] = {k: v for k, v in {**new[2], **change}.items() if v is not None}
            reasons = export.refusals(self.SHIPPED, new)
            self.assertEqual(len(reasons), 1, reasons)
            self.assertIn('1 sitting member row(s) lose their id or seat', reasons[0])
            self.assertIn(f'Pat Conaghan ({why})', reasons[0])

    def test_more_than_25_identity_changes_or_fewer_rows_are_held(self):
        new = [dict(r) for r in self.SHIPPED]
        for r in new[4:30]:  # 26 former members lose their ids
            r.pop('pid')
        self.assertRegex(' '.join(export.refusals(self.SHIPPED, new)), r'^26 rows change pid/current/party_now/full \(more than 25\)')
        self.assertEqual(export.refusals(self.SHIPPED, self.SHIPPED[:-1]), ['the row count drops from 34 to 33'])

    def stripped_export(self, baseline):
        """Run the exporter against a database whose members table knows nobody (a bad sync, a renamed
        column: every pid would vanish), with `baseline` as the shipped roster file's bytes (None: no file).
        Returns a function env -> (exit code, stdout, stderr)."""
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.executescript('''
            CREATE TABLE members (person_id TEXT, full_name TEXT, first_name TEXT, last_name TEXT, state TEXT,
                                  chamber TEXT, party TEXT, party_canonical TEXT, entered_house TEXT, left_house TEXT);
            CREATE TABLE speeches (speaker_name TEXT, person_id TEXT, party TEXT, party_canonical TEXT,
                                   state TEXT, chamber TEXT, date TEXT, witness_name TEXT, text TEXT);
        ''')
        for name, pid in [('Anthony Albanese', '10007'), ('Pat Conaghan', '10922')]:
            db.executemany('INSERT INTO speeches VALUES (?,?,?,?,?,?,?,?,?)',
                           [(name, pid, 'ALP', None, 'federal', 'representatives', '2025-03-03', None, 'x' * 250)] * 6)
        folder = tempfile.mkdtemp()
        self.addCleanup(lambda: [os.unlink(os.path.join(folder, f)) for f in os.listdir(folder)] and os.rmdir(folder))
        path = os.path.join(folder, 'parliamentarians.json')
        if baseline is not None:
            with open(path, 'wb') as fh:
                fh.write(baseline)

        def run(env):
            stdout, stderr = io.StringIO(), io.StringIO()
            with patch.object(export.sqlite3, 'connect', return_value=db), patch.object(export, 'PREVIOUS', path), \
                 patch.object(export, 'same_person', return_value={}), patch.dict(os.environ, env), \
                 patch.multiple(export, prepare_dedupe=lambda *_: None, JUNK_PREDICATES='', DEDUPE_PREDICATES=''), \
                 contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                try:
                    export.main()
                    code = 0
                except SystemExit as exit_:
                    code = exit_.code
            return code, stdout.getvalue(), stderr.getvalue()
        return run

    GOOD = json.dumps({'meta': {}, 'people': [roster_row('Anthony Albanese', '10007', True),
                                              roster_row('Pat Conaghan', '10922', True)]}).encode()

    def test_a_real_database_export_that_strips_ids_is_not_shipped(self):
        run = self.stripped_export(self.GOOD)
        code, out, err = run({'OPAX_ROSTER_ACCEPT': ''})
        self.assertEqual(code, export.HELD)
        self.assertEqual(out, '', 'nothing reaches export_step.sh, so the shipped file is kept')
        self.assertIn('ROSTER HELD: 2 sitting member row(s) lose their id or seat: Anthony Albanese (10007 -> no id), '
                      'Pat Conaghan (10922 -> no id)', err)
        code, out, _ = run({'OPAX_ROSTER_ACCEPT': '1'})
        self.assertEqual(code, 0)
        self.assertEqual({p['name'] for p in json.loads(out)['people']}, {'Anthony Albanese', 'Pat Conaghan'})

    def test_no_usable_baseline_holds_the_export_unless_it_is_overridden(self):
        # Fail closed: a baseline that cannot be compared with is a reason to hold, never permission to ship.
        for case, baseline, why in [
            ('missing', None, 'no shipped roster at'),
            ('malformed JSON', b'{', 'cannot be read (JSONDecodeError'),
            ('people null', b'{"people": null}', 'has no people to compare with'),
            ('people empty', b'{"people": []}', 'has no people to compare with'),
            ('not an object', b'[1, 2]', 'has no people to compare with'),
            ('nameless rows', b'{"people": [{"pid": "10007"}]}', 'has rows without a name'),
        ]:
            with self.subTest(case):
                run = self.stripped_export(baseline)
                code, out, err = run({'OPAX_ROSTER_ACCEPT': ''})
                self.assertEqual((code, out), (export.HELD, ''), err)
                self.assertRegex(err, r'ROSTER HELD: (no shipped roster|the shipped roster) at ')
                self.assertIn(why, err)
                code, out, _ = run({'OPAX_ROSTER_ACCEPT': '1'})  # a deliberate first run
                self.assertEqual(code, 0)
                self.assertEqual(len(json.loads(out)['people']), 2)

    def test_the_baseline_loader_says_why_it_cannot_be_used(self):
        folder = tempfile.mkdtemp()
        self.addCleanup(lambda: [os.unlink(os.path.join(folder, f)) for f in os.listdir(folder)] and os.rmdir(folder))
        good = os.path.join(folder, 'good.json')
        with open(good, 'wb') as fh:
            fh.write(self.GOOD)
        people, why = export.shipped_roster(good)
        self.assertEqual((len(people), why), (2, None))
        people, why = export.shipped_roster(os.path.join(folder, 'missing.json'))
        self.assertIsNone(people)
        self.assertIn('no shipped roster at', why)

if __name__ == '__main__':
    unittest.main()
