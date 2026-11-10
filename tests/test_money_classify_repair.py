"""money_classify: the shared whole-word matcher and the --repair mode (after PR #217)."""
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parli.ingest import money_classify  # noqa: E402
from parli.ingest.classify_donations import INDUSTRY_KEYWORDS, INDUSTRY_PATTERNS, classify_donor_name  # noqa: E402

from test_classify_donations import CASES  # noqa: E402

FED = """CREATE TABLE donations (donation_id INTEGER PRIMARY KEY AUTOINCREMENT, donor_name TEXT NOT NULL,
  recipient TEXT NOT NULL, amount REAL, financial_year TEXT, donor_type TEXT, industry TEXT)"""
EXT = """CREATE TABLE ext_donations (id INTEGER PRIMARY KEY AUTOINCREMENT, jurisdiction TEXT NOT NULL, source TEXT NOT NULL,
  donor_name TEXT NOT NULL, donor_type TEXT, recipient TEXT NOT NULL, amount REAL, industry TEXT, industry_source TEXT);
CREATE TABLE ext_ingest_log (table_name TEXT, source TEXT, rows_loaded INT, rows_deleted INT, loaded_at TEXT, notes TEXT)"""

# (donor, type, stored label, amount): stored labels as the pre-#217 substring pass left them,
# plus labels that pass could not have produced (manual or LLM) and correct ones.
FEDERAL = [
    ("Crown Castle Australia", "organisation", "gambling", 5000.0),     # 'crown' -> telecom
    ("Crown Castle Australia", "organisation", "gambling", 2500.5),
    ("Wesfarmers Limited", "organisation", "agriculture", 10000.0),     # 'farm' in Wesfarmers -> retail
    ("Rheinmetall Defence Australia Pty Ltd", "organisation", "tech", 800.0),  # 'meta' -> defence
    ("Crown Resorts Limited", "organisation", "gambling", 9000.0),      # correct, unchanged
    ("Asuria People Services Pty Ltd", "organisation", "unions", 300.0),  # 'asu' -> no keyword evidence: NULL
    ("Jane Pubsworth", "individual", "hospitality", 100.0),             # 'pub' -> individual fallback
    ("Northern Rivers Holdings", "organisation", "media", 400.0),       # not a legacy label: LLM/manual, untouched
    ("Crown Castle International", "organisation", "property", 50.0),   # manual label the matcher disagrees with: listed
    ("Some Person", "individual", "individual", 20.0),                  # fallback labels are never reviewed
]
STATE = [
    ("tas", "Hospitality Tasmania", "organisation", "health", "keyword", 700.0),   # 'hospital' -> hospitality
    ("qld", "VULY TRAMPOLINES PTY LTD", "organisation", "fossil_fuels", "keyword", 60.0),  # 'ampol' -> NULL
    ("vic", "Wesfarmers Limited", "organisation", "agriculture", "aec_match", 90.0),  # inherits the federal fix
    ("vic", "Banksia Strategic Partners Pty Ltd", "organisation", "finance", "aec_match", 30.0),  # unchanged federal: no row
    ("qld", "Queensland Gaskets Pty Ltd", "organisation", None, None, 15.0),       # normal tier: no 'gas' match now
    ("qld", "Arrow Energy Pty Ltd", "organisation", None, None, 25.0),             # normal tier still matches
]


class MatcherParityTests(unittest.TestCase):
    def setUp(self):
        ns = {}
        exec(money_classify.MATCHER, ns)
        self.classify, self.legacy = ns["make_matcher"](
            [(i, INDUSTRY_PATTERNS[i].pattern) for i in INDUSTRY_KEYWORDS], money_classify.PLACEHOLDERS,
            money_classify.legacy_tables())

    def test_the_shipped_matcher_is_classify_donor_name(self):
        names = list(CASES) + [k for kws in INDUSTRY_KEYWORDS.values() for k in kws] + [
            "", " ", "n/a", "AB", "Wesfarmers Limited", "Kenora Design", "Hospitality Tasmania", "NAB", "x"]
        for name in names:
            with self.subTest(name=name):
                self.assertEqual(self.classify(name), classify_donor_name(name))

    def test_legacy_tables_reproduce_the_old_substring_labels(self):
        self.assertEqual(self.legacy("Crown Castle Australia"), {"gambling"})
        self.assertEqual(self.legacy("Wesfarmers Limited"), {"agriculture"})
        self.assertEqual(self.legacy("Hospitality Tasmania"), {"health"})
        self.assertEqual(self.legacy("Northern Rivers Holdings"), set())


class RepairTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = str(Path(self.tmp.name) / "parli.db")
        db = sqlite3.connect(self.path)
        db.executescript(FED + ";" + EXT)
        for name, dtype, ind, amt in FEDERAL:
            db.execute("INSERT INTO donations (donor_name, recipient, amount, donor_type, industry) VALUES (?,?,?,?,?)",
                       (name, "Party", amt, dtype, ind))
        for jur, name, dtype, ind, src, amt in STATE:
            db.execute("INSERT INTO ext_donations (jurisdiction, source, donor_name, donor_type, recipient, amount, industry, industry_source) "
                       "VALUES (?,?,?,?,?,?,?,?)", (jur, jur + "_x", name, dtype, "Party", amt, ind, src))
        db.commit()
        db.close()

    def snapshot(self):
        db = sqlite3.connect(self.path)
        try:
            return {t: db.execute(f"SELECT * FROM {t} ORDER BY 1").fetchall() for t in ("donations", "ext_donations")}
        finally:
            db.close()

    def amounts(self):
        snap = self.snapshot()
        return [(r[0], r[1], r[3]) for r in snap["donations"]], [(r[0], r[3], r[6]) for r in snap["ext_donations"]]

    def labels(self, table, name):
        db = sqlite3.connect(self.path)
        try:
            col = "industry, industry_source" if table == "ext_donations" else "industry"
            return db.execute(f"SELECT DISTINCT {col} FROM {table} WHERE donor_name=?", (name,)).fetchall()
        finally:
            db.close()

    def run_repair(self, approve=None, dry_run=False):
        return money_classify.run(self.path, None, dry_run, 0, repair=True, approve=approve)

    def keys(self, entries):
        return [[e["table"], e["jurisdiction"], e["donor_name"], e["donor_type"], e["from"], e["to"], e["rows"]] for e in entries]

    def test_dry_run_proposes_only_keyword_sourced_fixes_and_changes_nothing(self):
        before = self.snapshot()
        r = self.run_repair(dry_run=True)["repair"]
        self.assertEqual(self.snapshot(), before)
        got = {(e["kind"], e["jurisdiction"], e["donor_name"], e["from"], e["to"]) for e in r["proposals"]}
        self.assertEqual(got, {
            ("keyword", "federal", "Crown Castle Australia", "gambling", "telecom"),
            ("keyword", "federal", "Wesfarmers Limited", "agriculture", "retail"),
            ("keyword", "federal", "Rheinmetall Defence Australia Pty Ltd", "tech", "defence"),
            ("keyword", "federal", "Asuria People Services Pty Ltd", "unions", None),
            ("keyword", "federal", "Jane Pubsworth", "hospitality", "individual"),
            ("keyword", "tas", "Hospitality Tasmania", "health", "hospitality"),
            ("keyword", "qld", "VULY TRAMPOLINES PTY LTD", "fossil_fuels", None),
            ("derived", "vic", "wesfarmers limited", "agriculture", "retail"),
        })
        self.assertEqual(r["applied"], [])
        crown = next(e for e in r["proposals"] if e["donor_name"] == "Crown Castle Australia")
        self.assertEqual((crown["rows"], crown["amount"]), (2, 7500.5))
        # A label the old pass could not have stored is never proposed; one the matcher disagrees with is listed.
        self.assertEqual([e["donor_name"] for e in r["held_not_keyword"]], ["Crown Castle International"])

    def test_approve_applies_exactly_the_listed_proposals_and_never_an_amount(self):
        amounts = self.amounts()
        proposals = self.run_repair(dry_run=True)["repair"]["proposals"]
        approved = [e for e in proposals if e["donor_name"] != "VULY TRAMPOLINES PTY LTD"]
        res = self.run_repair(approve=self.keys(approved))
        r = res["repair"]
        self.assertEqual(len(r["applied"]), len(approved))
        self.assertEqual([e["donor_name"] for e in r["held"]], ["VULY TRAMPOLINES PTY LTD"])
        self.assertEqual(self.amounts(), amounts)
        self.assertEqual(self.labels("donations", "Crown Castle Australia"), [("telecom",)])
        self.assertEqual(self.labels("donations", "Wesfarmers Limited"), [("retail",)])
        self.assertEqual(self.labels("donations", "Asuria People Services Pty Ltd"), [(None,)])
        self.assertEqual(self.labels("donations", "Jane Pubsworth"), [("individual",)])
        self.assertEqual(self.labels("donations", "Crown Resorts Limited"), [("gambling",)])
        self.assertEqual(self.labels("donations", "Northern Rivers Holdings"), [("media",)])
        self.assertEqual(self.labels("donations", "Crown Castle International"), [("property",)])
        self.assertEqual(self.labels("ext_donations", "Hospitality Tasmania"), [("hospitality", "keyword")])
        self.assertEqual(self.labels("ext_donations", "Wesfarmers Limited"), [("retail", "aec_match")])
        self.assertEqual(self.labels("ext_donations", "VULY TRAMPOLINES PTY LTD"), [("fossil_fuels", "keyword")])
        # The repair is idempotent: a second dry run proposes only what was held.
        again = self.run_repair(dry_run=True)["repair"]["proposals"]
        self.assertEqual([e["donor_name"] for e in again], ["VULY TRAMPOLINES PTY LTD"])

    def test_the_normal_state_pass_matches_whole_words_only(self):
        money_classify.run(self.path, None, False, 0)
        self.assertEqual(self.labels("ext_donations", "Queensland Gaskets Pty Ltd"), [(None, None)])
        self.assertEqual(self.labels("ext_donations", "Arrow Energy Pty Ltd"), [("fossil_fuels", "keyword")])
        # Without --repair, stored labels are left alone.
        self.assertEqual(self.labels("donations", "Crown Castle Australia"), [("gambling",)])
        self.assertEqual(self.labels("ext_donations", "Hospitality Tasmania"), [("health", "keyword")])

    def test_a_group_that_changed_since_the_review_is_held(self):
        proposals = self.run_repair(dry_run=True)["repair"]["proposals"]
        db = sqlite3.connect(self.path)
        db.execute("INSERT INTO donations (donor_name, recipient, amount, donor_type, industry) VALUES "
                   "('Wesfarmers Limited','Party',1,'organisation','agriculture')")
        db.commit()
        db.close()
        r = self.run_repair(approve=self.keys(proposals))["repair"]
        self.assertIn("Wesfarmers Limited", [e["donor_name"] for e in r["held"]])
        self.assertEqual(self.labels("donations", "Wesfarmers Limited"), [("agriculture",)])
        self.assertEqual(self.labels("donations", "Crown Castle Australia"), [("telecom",)])


if __name__ == "__main__":
    unittest.main()
