"""Run with: python3 -m unittest discover -s tests -p test_export_fits_dates.py

interests-expenses-011 / registers-005 (data cleanup 10 Nov 2026): the FITS register gives
Richardson Coutts / Etisalat Group a commencement (2024-03-06, the lodgement of a retrospective
registration) later than its cease (2023-12-31). The export keeps the register's own from/to,
never swapped or replaced, and adds the activity's own dates and a note beside them.
"""

import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DDL = """
CREATE TABLE ext_fits_registrants (registrant_id TEXT, name TEXT, title TEXT, postnominals TEXT, other_names TEXT,
  trading_name TEXT, abn TEXT, registrant_type TEXT, occupation TEXT, registered_from TEXT, registered_to TEXT,
  status TEXT, source_url TEXT);
CREATE TABLE ext_fits_principals (principal_id TEXT, registrant_id TEXT, name TEXT, principal_type TEXT);
CREATE TABLE ext_fits_registrations (registrant_id TEXT, principal_id TEXT, principal_name TEXT, country TEXT,
  activity_types TEXT, start_date TEXT, end_date TEXT, status TEXT, source_url TEXT);
CREATE TABLE ext_fits_activities (registrant_id TEXT, principal_id TEXT, start_date TEXT, end_date TEXT, cease_date TEXT);
CREATE TABLE ext_ingest_log (table_name TEXT, loaded_at TEXT);
"""
URL = "https://foreigninfluence.ag.gov.au/Profile/4aa9150a?page=ForeignPrincipals"


def export(registrations, activities):
    with tempfile.TemporaryDirectory() as d:
        db = Path(d) / "parli.db"
        con = sqlite3.connect(db)
        con.executescript(DDL)
        con.execute("INSERT INTO ext_fits_registrants VALUES ('R1','RICHARDSON COUTTS PTY LTD',NULL,NULL,NULL,NULL,NULL,"
                    "'Company',NULL,'2024-03-06',NULL,'ceased',?)", (URL,))
        con.executemany("INSERT INTO ext_fits_principals VALUES (?, 'R1', ?, 'Foreign business')",
                        [(r[0], r[1]) for r in registrations])
        con.executemany("INSERT INTO ext_fits_registrations VALUES ('R1', ?, ?, 'United Arab Emirates', "
                        "'General political lobbying', ?, ?, 'ceased', ?)", [(*r, URL) for r in registrations])
        con.executemany("INSERT INTO ext_fits_activities VALUES ('R1', ?, ?, ?, ?)", activities)
        con.execute("INSERT INTO ext_ingest_log VALUES ('ext_fits_registrants', '2026-10-18T00:00:00Z')")
        con.commit()
        con.close()
        portal = Path(d) / "public"
        (portal / "graph").mkdir(parents=True)
        (portal / "graph/money.json").write_text(json.dumps({"nodes": [{"kind": "donor", "label": "Richardson Coutts Pty Ltd"}]}))
        (portal / "parliamentarians.json").write_text(json.dumps({"people": []}))
        out = Path(d) / "fits.json"
        subprocess.run([sys.executable, str(ROOT / "scripts/export_fits.py"), "--db", str(db), "--portal", str(portal),
                        "--out", str(out)], check=True, capture_output=True, text=True)
        return json.loads(out.read_text())


class InvertedInterval(unittest.TestCase):
    def test_register_dates_kept_and_activity_dates_added(self):
        out = export([("P1", "Etisalat Group", "2024-03-06", "2023-12-31")],
                     [("P1", "2023-09-15", "2023-12-31", "2023-12-31")])
        (e,) = out["by_entity"]["richardson coutts"]
        self.assertEqual((e["from"], e["to"]), ("2024-03-06", "2023-12-31"))
        self.assertEqual((e["activity_from"], e["activity_to"]), ("2023-09-15", "2023-12-31"))
        self.assertIn("register's own dates", e["date_note"])

    def test_ordinary_interval_gains_nothing(self):
        out = export([("P1", "Etisalat Group", "2023-09-15", "2023-12-31")],
                     [("P1", "2023-09-15", "2023-12-31", None)])
        (e,) = out["by_entity"]["richardson coutts"]
        self.assertNotIn("activity_from", e)
        self.assertNotIn("date_note", e)

    def test_inverted_without_activities_has_only_the_note(self):
        (e,) = export([("P1", "Etisalat Group", "2024-03-06", "2023-12-31")], [])["by_entity"]["richardson coutts"]
        self.assertEqual((e["from"], e["to"]), ("2024-03-06", "2023-12-31"))
        self.assertNotIn("activity_from", e)
        self.assertIn("date_note", e)


if __name__ == "__main__":
    unittest.main()
