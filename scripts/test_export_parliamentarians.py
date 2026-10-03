"""Directory party fallbacks and the federal/state surname boundary."""
import contextlib
import io
import json
import sqlite3
import unittest
from unittest.mock import patch

from scripts import export_parliamentarians as export
from parli.ingest.link_speakers import build_member_lookup, match_historical_surname


class MemberPartyTests(unittest.TestCase):
    def test_verified_state_roster_repairs_are_scoped_to_the_contaminated_identity(self):
        self.assertEqual(export.member_party('vic_annabelle_cleeland', 'Annabelle Cleeland', 'vic', 'vic_la', 'ALP', None), 'Nationals')
        self.assertEqual(export.member_party('sa_harvey', 'Richard Manuel Harvey', 'sa', 'sa_ha', 'ALP', None), 'Liberal')
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
                                  party TEXT, party_canonical TEXT, left_house TEXT);
            CREATE TABLE speeches (speaker_name TEXT, person_id TEXT, party TEXT, party_canonical TEXT,
                                   state TEXT, chamber TEXT, date TEXT, witness_name TEXT, text TEXT);
        ''')
        db.executemany('INSERT INTO members VALUES (?,?,?,?,?,?,?)', [
            ('vic_annabelle_cleeland', 'Annabelle Cleeland', 'vic', 'vic_la', 'ALP', None, None),
            ('sa_harvey', 'Richard Manuel Harvey', 'sa', 'sa_ha', 'ALP', None, '2022-03-19'),
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


if __name__ == '__main__':
    unittest.main()
