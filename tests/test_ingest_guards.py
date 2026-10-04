"""Empty-upstream guards and the small P8 loader fixes.

    python3 -m unittest discover -s tests -p test_ingest_guards.py

state_rosters and qld_contracts used to delete their whole table and insert whatever came back;
money_ipea skipped the person_id link whenever --db was given and replaced a quarter with an
empty CSV; money_diaries re-parsed every PDF on every run.
"""
import contextlib
import csv
import io
import re
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from parli.ingest import money_classify, money_diaries, money_ipea, money_state_donations, qld_contracts, state_rosters  # noqa: E402
from parli.ingest.ext_common import ExtWriter  # noqa: E402
from parli.ingest.replace_guard import ExtGuardError  # noqa: E402


def quiet():
    return contextlib.redirect_stdout(io.StringIO())


class StateRosterGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = sqlite3.connect(str(Path(self.tmp.name) / "p.sqlite"))
        self.addCleanup(self.db.close)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(state_rosters.DDL)
        stamp = "2026-09-08T00:00:00Z"
        for (state, chamber) in state_rosters.POSITIONS:
            for i in range(10):
                self.db.execute("INSERT INTO ext_state_roster VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                                (f"Q{i}", state, chamber, f"Old {state} {i}", None, "Old", None, None, None, None, None, None, stamp))
        self.db.commit()

    def sparql_returning(self, per_position):
        """A stub for the SPARQL endpoint: `per_position[qid]` rows for each position query."""
        by_qid = {qid: per_position.get(pos, 10) for pos, qid in state_rosters.POSITIONS.items()}

        def fake(query, tries=4):
            qid = next(q for q in by_qid if f"wd:{q}" in query)
            return [{"p": {"value": f"http://www.wikidata.org/entity/Q{9000 + i}"}, "pLabel": {"value": f"New {qid} {i}"},
                     "familyLabel": {"value": "New"}} for i in range(by_qid[qid])]
        return fake

    def rows(self, state, chamber):
        return [r["full_name"] for r in self.db.execute(
            "SELECT full_name FROM ext_state_roster WHERE state=? AND chamber=?", (state, chamber))]

    def test_normal_fetch_replaces_every_position(self):
        with mock.patch.object(state_rosters, "sparql", self.sparql_returning({})), mock.patch("time.sleep"), quiet():
            state_rosters.fetch(self.db)
        self.assertTrue(all(n.startswith("New") for n in self.rows("qld", "qld_la")))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ext_state_roster").fetchone()[0], 10 * len(state_rosters.POSITIONS))

    def test_all_empty_leaves_the_table_untouched(self):
        empty = {pos: 0 for pos in state_rosters.POSITIONS}
        with mock.patch.object(state_rosters, "sparql", self.sparql_returning(empty)), mock.patch("time.sleep"), quiet():
            with self.assertRaises(ExtGuardError):
                state_rosters.fetch(self.db)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ext_state_roster").fetchone()[0], 10 * len(state_rosters.POSITIONS))
        self.assertTrue(all(n.startswith("Old") for n in self.rows("qld", "qld_la")))

    def test_one_empty_position_keeps_its_rows_while_the_rest_refresh(self):
        counts = {("sa", "sa_lc"): 0, ("nsw", "nsw_lc"): 3}         # empty, and 3 of 10 (< 50%)
        with mock.patch.object(state_rosters, "sparql", self.sparql_returning(counts)), mock.patch("time.sleep"), quiet():
            with self.assertRaises(ExtGuardError) as cm:
                state_rosters.fetch(self.db)
        self.assertIn("sa/sa_lc", str(cm.exception))
        self.assertIn("nsw/nsw_lc", str(cm.exception))
        self.assertTrue(all(n.startswith("Old") for n in self.rows("sa", "sa_lc")))
        self.assertTrue(all(n.startswith("Old") for n in self.rows("nsw", "nsw_lc")))
        self.assertTrue(all(n.startswith("New") for n in self.rows("qld", "qld_la")))      # the good ones landed
        note = self.db.execute("SELECT notes FROM ext_ingest_log ORDER BY id DESC LIMIT 1").fetchone()[0]
        self.assertIn("kept unchanged", note)

    def test_allow_shrink_overrides(self):
        empty = {pos: 0 for pos in state_rosters.POSITIONS}
        with mock.patch.object(state_rosters, "sparql", self.sparql_returning(empty)), mock.patch("time.sleep"), quiet():
            state_rosters.fetch(self.db, allow_shrink=True)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ext_state_roster").fetchone()[0], 0)

    def test_first_load_into_an_empty_table_is_fine(self):
        self.db.execute("DELETE FROM ext_state_roster")
        self.db.commit()
        with mock.patch.object(state_rosters, "sparql", self.sparql_returning({})), mock.patch("time.sleep"), quiet():
            state_rosters.fetch(self.db)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM ext_state_roster").fetchone()[0], 10 * len(state_rosters.POSITIONS))


class QldContractsGuardTests(unittest.TestCase):
    def run_main(self, db, files=()):
        argv = ["qld_contracts.py", "--db", str(db), "--cache", str(Path(db).parent / "cache")]
        with mock.patch.object(sys, "argv", argv), mock.patch.object(qld_contracts, "catalogue", lambda: list(files)), quiet():
            qld_contracts.main()

    def test_no_rows_never_wipes_the_register(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / "p.sqlite"
            con = sqlite3.connect(db)
            con.executescript(qld_contracts.DDL)
            for i in range(6):
                con.execute("INSERT INTO ext_state_contracts (row_key, jurisdiction, supplier_name, amount, ingested_at) "
                            "VALUES (?, 'qld', ?, 1.0, 'x')", (f"k{i}", f"S{i}"))
            con.commit()
            con.close()
            with self.assertRaises(SystemExit) as cm:
                self.run_main(db)
            self.assertEqual(cm.exception.code, 3)
            con = sqlite3.connect(db)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM ext_state_contracts").fetchone()[0], 6)
            con.close()

    def test_first_load_with_nothing_stored_proceeds(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / "p.sqlite"
            self.run_main(db)                      # empty catalogue, empty table: nothing to lose, no refusal
            con = sqlite3.connect(db)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM ext_state_contracts").fetchone()[0], 0)
            con.close()


class ClassifyBackendTests(unittest.TestCase):
    """money_classify used to ssh to the desktop unless --db was given; OPAX_DB / --db-local now keep it local."""

    def run_main(self, argv, env):
        seen = {}

        def fake_run(db_path, host, dry_run, report):
            seen.update(db=db_path, host=host)
            return {"stats": {"keyword_total": 0, "individual": 0, "aec_match": 0, "unidentified": 0, "remaining_rows": 0,
                              "remaining_names": 0, "aec_match_by_industry": {}}, "changed": 0, "source_dist": [], "industry_dist": []}

        with mock.patch.object(money_classify, "run", fake_run), mock.patch.object(sys, "argv", ["money_classify.py", *argv]), \
                mock.patch.dict("os.environ", env, clear=False), quiet():
            if "OPAX_DB" not in env:
                import os
                os.environ.pop("OPAX_DB", None)
            money_classify.main()
        return seen

    def test_opax_db_env_is_local(self):
        seen = self.run_main([], {"OPAX_DB": "/srv/vm/parli.db"})
        self.assertEqual((seen["db"], seen["host"]), ("/srv/vm/parli.db", None))

    def test_no_env_is_still_the_desktop(self):
        seen = self.run_main([], {})
        self.assertEqual(seen["host"], "desktop")

    def test_explicit_db_and_db_local(self):
        self.assertEqual(self.run_main(["--db", "/tmp/x.sqlite"], {"OPAX_DB": "/srv/vm/parli.db"})["db"], "/tmp/x.sqlite")
        seen = self.run_main(["--db-local"], {"OPAX_DB": "/srv/vm/parli.db"})
        self.assertEqual((seen["db"], seen["host"]), ("/srv/vm/parli.db", None))


class DonationLoaderGuardTests(unittest.TestCase):
    """A direct load into the live DB: an empty source is refused, the other sources still load, exit is non-zero."""

    def test_empty_source_is_refused_and_the_rest_carry_on(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / "p.sqlite"
            con = sqlite3.connect(db)
            con.executescript(money_state_donations.DDL)
            for i in range(5):
                con.execute("INSERT INTO ext_donations (jurisdiction, source, donor_name, recipient) VALUES ('qld','qld_ecq',?,'A')", (f"D{i}",))
            con.commit()
            con.close()
            col = money_state_donations.COLUMNS

            def row(**kw):
                r = {c: None for c in col}
                r.update(jurisdiction="vic", source="vic_vec", donor_name="New", recipient="B", **kw)
                return [r[c] for c in col]

            fetchers = {"qld": lambda s, limit=0: [], "vic": lambda s, limit=0: [row(amount=1.0)]}
            argv = ["money_state_donations.py", "--db", str(db)]
            with mock.patch.object(money_state_donations, "FETCHERS", fetchers), mock.patch.object(sys, "argv", argv), quiet():
                with self.assertRaises(SystemExit) as cm:
                    money_state_donations.main()
            self.assertEqual(cm.exception.code, 3)
            con = sqlite3.connect(db)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM ext_donations WHERE source='qld_ecq'").fetchone()[0], 5)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM ext_donations WHERE source='vic_vec'").fetchone()[0], 1)
            con.close()


CSV_HEADER = ["UniqueId", "ReportingPeriodId", "ReportingPeriod", "ReportingPeriodStartDate", "ReportingPeriodEndDate",
              "OfficeCode", "FullNameWithTitle", "Surname", "FirstName", "Party", "StateOrTerritory", "Electorate",
              "Homebase", "Role", "UserFirstName", "UserSurname", "HighLevelCategory", "MajorSubCategory",
              "MinorSubCategory", "FromDate", "ToDate", "NumberNights", "NightlyRate", "Description", "FromLocation",
              "ToLocation", "Amount", "TripSequence", "LegNumber", "ReasonForTravel", "PublishableNotes"]


def write_csv(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_HEADER)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in CSV_HEADER})


class IpeaTests(unittest.TestCase):
    DS = {"quarter": "2026q02", "url": "https://example.test/2026q02_dataextract.csv", "title": "IPEA Q2",
          "licence": "cc-by", "licence_title": "Creative Commons Attribution 3.0 Australia",
          "licence_url": "http://creativecommons.org/licenses/by/3.0/au/",
          "modified": "2026-08-05", "dataset_url": "https://data.gov.au/data/dataset/x"}

    def run_ipea(self, db_arg, csv_rows, env_db=None):
        with tempfile.TemporaryDirectory() as d:
            csv_path = Path(d) / "q.csv"
            write_csv(csv_path, csv_rows)
            argv = ["money_ipea.py", "--since", "2026q01"] + (["--db", str(db_arg)] if db_arg else [])
            env = {"OPAX_DB": str(env_db)} if env_db else {}
            with mock.patch.object(sys, "argv", argv), mock.patch.dict("os.environ", env, clear=False), \
                    mock.patch.object(money_ipea, "discover", lambda s: [dict(self.DS)]), \
                    mock.patch.object(money_ipea, "download", lambda s, ds: csv_path), \
                    mock.patch.object(money_ipea, "make_session", lambda: None), quiet():
                money_ipea.main()

    def live_db(self, d):
        db = Path(d) / "live.sqlite"
        con = sqlite3.connect(db)
        con.executescript("CREATE TABLE members (person_id TEXT, last_name TEXT, first_name TEXT, left_house TEXT);"
                          "INSERT INTO members VALUES ('P1','Smith','Jane',NULL);")
        con.close()
        return db

    ROW = {"UniqueId": "u1", "ReportingPeriodId": "2026Q02", "FullNameWithTitle": "Ms Jane Smith", "Surname": "Smith",
           "FirstName": "Jane", "HighLevelCategory": "Travel", "Amount": "12.50"}

    def test_local_db_with_members_links_person_id(self):
        with tempfile.TemporaryDirectory() as d:
            db = self.live_db(d)
            self.run_ipea(db, [self.ROW])
            con = sqlite3.connect(db)
            self.assertEqual(con.execute("SELECT person_id FROM ext_expenses").fetchall(), [("P1",)])
            con.close()

    def test_opax_db_env_links_too(self):
        with tempfile.TemporaryDirectory() as d:
            db = self.live_db(d)
            self.run_ipea(None, [self.ROW], env_db=db)
            con = sqlite3.connect(db)
            self.assertEqual(con.execute("SELECT person_id FROM ext_expenses").fetchall(), [("P1",)])
            con.close()

    def test_staging_file_without_members_loads_unlinked_instead_of_failing(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / "stage.sqlite"
            self.run_ipea(db, [self.ROW])
            con = sqlite3.connect(db)
            self.assertEqual(con.execute("SELECT person_id FROM ext_expenses").fetchall(), [(None,)])
            con.close()

    def test_a_quarter_that_parses_to_nothing_is_not_replaced(self):
        with tempfile.TemporaryDirectory() as d:
            db = self.live_db(d)
            self.run_ipea(db, [self.ROW])
            self.run_ipea(db, [])                  # header only
            con = sqlite3.connect(db)
            self.assertEqual(con.execute("SELECT COUNT(*) FROM ext_expenses").fetchone()[0], 1)
            con.close()

    def run_quarters(self, db, quarters, since="2026q01"):
        """Load [(dataset overrides, csv rows), ...], one CSV per quarter; returns (exit code, log)."""
        with tempfile.TemporaryDirectory() as d:
            datasets, paths = [], {}
            for over, csv_rows in quarters:
                ds = dict(self.DS, **over)
                paths[ds["quarter"]] = Path(d) / f"{ds['quarter']}.csv"
                write_csv(paths[ds["quarter"]], csv_rows)
                datasets.append(ds)
            out, code = io.StringIO(), 0
            with mock.patch.object(sys, "argv", ["money_ipea.py", "--since", since, "--db", str(db)]), \
                    mock.patch.object(money_ipea, "discover", lambda s: [dict(x) for x in datasets]), \
                    mock.patch.object(money_ipea, "download", lambda s, ds: paths[ds["quarter"]]), \
                    mock.patch.object(money_ipea, "make_session", lambda: None), contextlib.redirect_stdout(out):
                try:
                    money_ipea.main()
                except SystemExit as e:
                    code = e.code
            return code, out.getvalue()

    def quarter(self, period, uid):
        q = period.lower()
        return {"quarter": q, "url": f"https://example.test/{q}_dataextract.csv"}, \
            [dict(self.ROW, UniqueId=uid, ReportingPeriodId=period)]

    def stored(self, db):
        con = sqlite3.connect(db)
        try:
            return sorted(con.execute("SELECT reporting_period_id, unique_id FROM ext_expenses").fetchall())
        finally:
            con.close()

    def test_a_respelled_licence_title_fails_nothing(self):
        # the review's case: a spacing/case-only change to a 2017 quarter's title, outside the run's range
        with tempfile.TemporaryDirectory() as d:
            db = self.live_db(d)
            self.assertEqual(self.run_quarters(db, [self.quarter("2017Q02", "old")], since="2017q01")[0], 0)
            respelled = {"licence_title": "creative  commons attribution 3.0   AUSTRALIA "}
            q17, rows17 = self.quarter("2017Q02", "new17")
            q26, rows26 = self.quarter("2026Q02", "new26")
            code, out = self.run_quarters(db, [(dict(q17, **respelled), rows17), (dict(q26, **respelled), rows26)])
            self.assertEqual(code, 0)
            self.assertNotIn("REFUSED", out)
            self.assertNotIn("WARNING", out)
            self.assertEqual(self.stored(db), [("2017Q02", "old"), ("2026Q02", "new26")])

    def test_a_relicensed_quarter_in_range_is_stale_and_keeps_its_rows(self):
        with tempfile.TemporaryDirectory() as d:
            db = self.live_db(d)
            self.run_quarters(db, [self.quarter("2026Q02", "kept")])
            for change in ({"licence": "cc-by-4.0"},
                           {"licence_url": "https://creativecommons.org/licenses/by/4.0/"}):
                q01, rows01 = self.quarter("2026Q01", "q1")
                q02, rows02 = self.quarter("2026Q02", "replacement")
                code, out = self.run_quarters(db, [(q01, rows01), (dict(q02, **change), rows02)])
                self.assertEqual(code, 3, change)          # stale: weekly_refresh.sh logs STALE, not FAIL
                self.assertIn("REFUSED 2026q02", out)
                self.assertIn("last good rows kept: 2026q02", out)
                # the refused quarter keeps its stored rows; the other quarter in range still loads
                self.assertEqual(self.stored(db), [("2026Q01", "q1"), ("2026Q02", "kept")])

    def test_a_relicensed_quarter_outside_the_range_is_only_a_warning(self):
        with tempfile.TemporaryDirectory() as d:
            db = self.live_db(d)
            self.run_quarters(db, [self.quarter("2017Q02", "old")], since="2017q01")
            q17, rows17 = self.quarter("2017Q02", "new17")
            code, out = self.run_quarters(db, [(dict(q17, licence="cc-by-4.0"), rows17), self.quarter("2026Q02", "new26")])
            self.assertEqual(code, 0)
            self.assertIn("WARNING 2017q02 (outside this run)", out)
            self.assertEqual(self.stored(db), [("2017Q02", "old"), ("2026Q02", "new26")])

    def test_weekly_refresh_reports_an_ipea_exit_3_as_stale(self):
        # run_step ipea ... treats rc=3 as STALE only for steps listed in STALE_OK (scripts/lib/refresh_lib.sh)
        sh = (ROOT / "scripts/weekly_refresh.sh").read_text()
        stale_ok = re.search(r'^STALE_OK="([^"]*)"', sh, re.M).group(1)
        self.assertIn(",ipea,", stale_ok)
        self.assertRegex(sh, r"run_step ipea [^\n]*\\\n\s*\"\$PY\" -m parli\.ingest\.money_ipea ")

    def test_db_has_table(self):
        with tempfile.TemporaryDirectory() as d:
            db = self.live_db(d)
            self.assertTrue(money_ipea.db_has_table(db, "members"))
            self.assertFalse(money_ipea.db_has_table(db, "nope"))
            self.assertFalse(money_ipea.db_has_table(Path(d) / "absent.sqlite", "members"))


class DiariesNewOnlyTests(unittest.TestCase):
    def test_loaded_urls_local(self):
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / "p.sqlite"
            w = ExtWriter(db_path=db)
            self.assertEqual(money_diaries.loaded_urls(w, "nsw_diary"), set())       # no table yet
            con = sqlite3.connect(db)
            con.executescript(money_diaries.DDL)
            cols = {c: None for c in money_diaries.COLUMNS}
            for src, url in (("nsw_diary", "https://a/1.pdf"), ("nsw_diary", "https://a/2.pdf"), ("qld_diary", "https://b/1.pdf")):
                row = dict(cols, jurisdiction=src[:3], source=src, source_url=url, minister_name="M",
                           meeting_date_raw="1 Jan 2026")
                names = [c for c in row if row[c] is not None]
                con.execute(f"INSERT INTO ext_ministerial_meetings ({','.join(names)}) VALUES ({','.join('?' for _ in names)})",
                            [row[c] for c in names])
            con.commit()
            con.close()
            self.assertEqual(money_diaries.loaded_urls(w, "nsw_diary"), {"https://a/1.pdf", "https://a/2.pdf"})
            self.assertEqual(money_diaries.loaded_urls(w, "qld_diary"), {"https://b/1.pdf"})

    def test_run_nsw_skips_loaded_pdfs_without_downloading_them(self):
        fetched = []

        def fake_bytes(session, url, path):
            fetched.append(url)
            return b"%PDF"

        links = [{"url": "https://a/old.pdf"}, {"url": "https://a/new.pdf"}]
        with mock.patch.object(money_diaries, "nsw_year_pages", lambda s: {2026: "https://a/2026"}), \
                mock.patch.object(money_diaries, "nsw_pdf_links", lambda s, u: links), \
                mock.patch.object(money_diaries, "cached_bytes", fake_bytes), \
                mock.patch.object(money_diaries, "parse_diary_tables", lambda b, rx, f: ([], "")), \
                mock.patch.object(money_diaries, "nsw_header", lambda first, link: {"period_end": None, "period_start": None,
                                                                                     "period_label": "", "minister_title": ""}), \
                quiet():
            rows, urls = money_diaries.run_nsw(None, [2026], 0, False, {"https://a/old.pdf"})
        self.assertEqual(fetched, ["https://a/new.pdf"])
        self.assertEqual(urls, ["https://a/new.pdf"])


if __name__ == "__main__":
    unittest.main()
