"""ext_apply: refuse a bad stage, keep ids and labels, archive what it supersedes, apply atomically.

    python3 -m unittest tests/test_ext_apply.py

Built on the real loader DDL (donations, lobbyists, FITS, GrantConnect) so a column added to a
loader without the live table is caught here as schema drift, as it would be on the box.
"""
import contextlib
import io
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from parli.ingest import ext_apply as ea  # noqa: E402
from parli.ingest import fits_register, grantconnect, money_lobbyists, money_state_donations  # noqa: E402

# the live donations table carries a reviewed-label column the loader DDL does not
LIVE_DON_DDL = money_state_donations.DDL.replace(
    "    industry TEXT,", "    industry TEXT,\n    industry_source TEXT,", 1)


def don_row(i, source="qld_ecq", donor=None, amount=None, rec_id=None):
    donor = donor or f"Donor {i % 4}"
    return dict(jurisdiction="qld", source=source, source_record_id=rec_id or f"{source}-{i}", donor_name=donor,
                donor_type="organisation", recipient="Party A", recipient_type="party", recipient_party="Labor",
                amount=amount if amount is not None else 100.0 + i, date_made=f"2026-08-{(i % 28) + 1:02d}",
                financial_year="2026-27", disclosure_type="gift", source_url="https://example.test/",
                ingested_at="2026-09-29T00:00:00Z")


def insert(con, table, rows):
    for r in rows:
        cols = list(r)
        con.execute(f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})", [r[c] for c in cols])
    con.commit()


class ApplyBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.live = self.dir / "live.sqlite"
        self.stage = self.dir / "stage.sqlite"
        self.archive = self.dir / "archive"
        self.addCleanup(self.tmp.cleanup)

    def con(self, path=None):
        c = sqlite3.connect(str(path or self.live))
        c.row_factory = sqlite3.Row
        return c

    def apply(self, profile, **kw):
        kw.setdefault("archive_dir", self.archive)
        return ea.apply_profile(profile, self.live, [self.stage], **kw)


class GuardTests(unittest.TestCase):
    def test_guard(self):
        self.assertIsNone(ea.guard(0, 5, 0.9))
        self.assertIn("empty", ea.guard(10, 0, 0.9))
        self.assertIn("empty", ea.guard(0, 0, 0.9))
        self.assertIn("below 90%", ea.guard(10, 8, 0.9))
        self.assertIsNone(ea.guard(10, 9, 0.9))
        self.assertIsNone(ea.guard(10, 12, 0.9))
        self.assertIsNone(ea.guard(10, 5, 0.5))


class DonationTests(ApplyBase):
    def setUp(self):
        super().setUp()
        live = self.con()
        live.executescript(LIVE_DON_DDL)
        self.old = [don_row(i) for i in range(10)]
        insert(live, "ext_donations", self.old)
        # reviewed labels: "Donor 1" is a reviewed 'mining' donor, the rest unlabelled
        live.execute("UPDATE ext_donations SET industry='mining', industry_source='reviewed' WHERE donor_name='Donor 1'")
        # a source this run does not touch
        insert(live, "ext_donations", [don_row(100, source="wa_waec")])
        live.commit()
        live.close()
        self.ids = {r["source_record_id"]: r["id"] for r in self.con().execute("SELECT * FROM ext_donations")}
        st = self.con(self.stage)
        st.executescript(money_state_donations.DDL)
        st.close()

    def stage_rows(self, rows):
        st = self.con(self.stage)
        insert(st, "ext_donations", rows)
        st.close()

    def test_apply_keeps_ids_labels_and_archives_the_superseded(self):
        stage = [don_row(i) for i in range(9)]                      # 9 unchanged (row 9 withdrawn)
        stage.append(don_row(50, donor="Donor 1"))                  # new gift by a labelled donor
        stage.append(don_row(51, donor="Brand New Donor"))          # new gift, no label yet
        stage[3] = don_row(3, amount=999.0)                         # amended: same record id, new amount
        self.stage_rows(stage)
        rep = self.apply("donations", only_sources=["qld_ecq"])
        s = rep["sources"]["qld_ecq"]
        self.assertEqual(s["status"], "applied")
        t = s["tables"]["ext_donations"]
        self.assertEqual((t["unchanged_ids"], t["amended_in_place"], t["inserted"], t["superseded"]), (8, 1, 2, 1))
        self.assertEqual(rep["exit"], 0)

        rows = {r["source_record_id"]: r for r in self.con().execute("SELECT * FROM ext_donations WHERE source='qld_ecq'")}
        for rid in ("qld_ecq-0", "qld_ecq-1", "qld_ecq-2"):                      # unchanged: same id
            self.assertEqual(rows[rid]["id"], self.ids[rid])
        self.assertEqual(rows["qld_ecq-3"]["id"], self.ids["qld_ecq-3"])         # amended in place: same id
        self.assertEqual(rows["qld_ecq-3"]["amount"], 999.0)
        self.assertNotIn("qld_ecq-9", rows)                                      # withdrawn
        # a reviewed label survives on an unchanged row, on the in-place amendment of a labelled donor and is
        # carried to a new gift by that donor; an unknown donor stays unlabelled
        self.assertEqual((rows["qld_ecq-1"]["industry"], rows["qld_ecq-1"]["industry_source"]), ("mining", "reviewed"))
        self.assertEqual(rows["qld_ecq-50"]["industry"], "mining")
        self.assertEqual(rows["qld_ecq-50"]["industry_source"], "reviewed")
        self.assertIsNone(rows["qld_ecq-51"]["industry"])
        self.assertEqual(t["labels_carried"], 1)
        # the other source is untouched
        self.assertEqual(self.con().execute("SELECT COUNT(*) FROM ext_donations WHERE source='wa_waec'").fetchone()[0], 1)

        # archive: the withdrawn row and the amended row's pre-image, with a recorded checksum
        arch = Path(s["archive"])
        self.assertTrue(arch.exists())
        self.assertEqual(arch.parent.name, "qld_ecq")
        self.assertRegex(arch.name, r"^\d{4}-\d{2}-\d{2}\.json$")
        doc = json.loads(arch.read_text())
        d = doc["tables"]["ext_donations"]
        self.assertEqual([r["source_record_id"] for r in d["removed"]], ["qld_ecq-9"])
        self.assertEqual([(r["source_record_id"], r["amount"]) for r in d["amended_before"]], [("qld_ecq-3", 103.0)])
        import hashlib
        self.assertEqual(s["archive_sha256"], hashlib.sha256(arch.read_bytes()).hexdigest())
        # logged
        log = self.con().execute("SELECT * FROM ext_ingest_log WHERE source='qld_ecq'").fetchall()
        self.assertEqual(len(log), 1)
        self.assertIn("ext_apply donations", log[0]["notes"])
        self.assertIn(s["archive_sha256"], log[0]["notes"])

    def test_refuses_an_empty_stage_and_touches_nothing(self):
        before = self.con().execute("SELECT * FROM ext_donations ORDER BY id").fetchall()
        rep = self.apply("donations", only_sources=["qld_ecq"])
        self.assertEqual(rep["sources"]["qld_ecq"]["status"], "refused")
        self.assertIn("empty", rep["sources"]["qld_ecq"]["reason"])
        self.assertEqual(rep["exit"], ea.EXIT_REFUSED)
        after = self.con().execute("SELECT * FROM ext_donations ORDER BY id").fetchall()
        self.assertEqual([tuple(r) for r in before], [tuple(r) for r in after])
        self.assertFalse(self.archive.exists(), "a refused source writes no archive")
        self.assertEqual(self.con().execute("SELECT COUNT(*) FROM ext_ingest_log").fetchone()[0], 0)

    def test_refuses_a_truncated_stage_and_a_per_source_ratio_can_allow_it(self):
        self.stage_rows([don_row(i) for i in range(8)])            # 8 of 10 = 80% < 90%
        rep = self.apply("donations", only_sources=["qld_ecq"])
        self.assertEqual(rep["sources"]["qld_ecq"]["status"], "refused")
        self.assertIn("below 90%", rep["sources"]["qld_ecq"]["reason"])
        self.assertEqual(self.con().execute("SELECT COUNT(*) FROM ext_donations WHERE source='qld_ecq'").fetchone()[0], 10)
        rep = self.apply("donations", only_sources=["qld_ecq"], source_ratio={"qld_ecq": 0.75})
        self.assertEqual(rep["sources"]["qld_ecq"]["status"], "applied")
        self.assertEqual(self.con().execute("SELECT COUNT(*) FROM ext_donations WHERE source='qld_ecq'").fetchone()[0], 8)

    def test_dry_run_writes_nothing(self):
        self.stage_rows([don_row(i) for i in range(9)] + [don_row(70)])
        before = self.con().execute("SELECT * FROM ext_donations ORDER BY id").fetchall()
        rep = self.apply("donations", only_sources=["qld_ecq"], dry_run=True)
        self.assertEqual(rep["sources"]["qld_ecq"]["status"], "would-apply")
        self.assertEqual(rep["sources"]["qld_ecq"]["tables"]["ext_donations"]["inserted"], 1)
        after = self.con().execute("SELECT * FROM ext_donations ORDER BY id").fetchall()
        self.assertEqual([tuple(r) for r in before], [tuple(r) for r in after])
        self.assertFalse(self.archive.exists())

    def test_identical_stage_is_unchanged_and_writes_no_archive(self):
        self.stage_rows([don_row(i) for i in range(10)])
        rep = self.apply("donations", only_sources=["qld_ecq"])
        self.assertEqual(rep["sources"]["qld_ecq"]["status"], "unchanged")
        self.assertEqual(rep["exit"], 0)
        self.assertFalse(self.archive.exists())

    def test_expected_source_missing_from_the_stage_is_reported(self):
        self.stage_rows([don_row(i) for i in range(10)])
        rep = self.apply("donations")             # expects qld_ecq, vic_vec, tas_tec
        self.assertEqual(rep["sources"]["qld_ecq"]["status"], "unchanged")
        self.assertEqual(rep["sources"]["vic_vec"]["status"], "missing")
        self.assertEqual(rep["sources"]["tas_tec"]["status"], "missing")
        self.assertEqual(rep["exit"], ea.EXIT_REFUSED)

    def test_strict_applies_nothing_when_any_source_is_refused(self):
        self.stage_rows([don_row(i) for i in range(9)] + [don_row(70)])
        rep = self.apply("donations", strict=True)            # vic_vec / tas_tec missing
        self.assertEqual(rep["sources"]["qld_ecq"]["status"], "not-applied")
        self.assertEqual(self.con().execute("SELECT COUNT(*) FROM ext_donations WHERE source_record_id='qld_ecq-70'").fetchone()[0], 0)

    def test_post_condition_failure_rolls_back_and_marks_the_archive(self):
        live = self.con()
        # a trigger that corrupts every inserted row: the stored rows can no longer equal the stage
        live.execute("CREATE TRIGGER corrupt AFTER INSERT ON ext_donations BEGIN "
                     "UPDATE ext_donations SET amount = amount + 1 WHERE rowid = NEW.rowid; END")
        live.commit()
        live.close()
        self.stage_rows([don_row(i) for i in range(9)] + [don_row(70)])
        before = [tuple(r) for r in self.con().execute("SELECT * FROM ext_donations ORDER BY id")]
        with self.assertRaises(ea.ExtApplyError):
            self.apply("donations", only_sources=["qld_ecq"])
        after = [tuple(r) for r in self.con().execute("SELECT * FROM ext_donations ORDER BY id")]
        self.assertEqual(before, after)
        self.assertEqual(list(self.archive.rglob("*.json")), [])
        self.assertEqual(len(list(self.archive.rglob("*.json.aborted"))), 1)

    def test_schema_drift_is_refused_loudly(self):
        st = self.con(self.stage)
        st.execute("ALTER TABLE ext_donations ADD COLUMN brand_new_column TEXT")
        st.commit()
        st.close()
        self.stage_rows([don_row(i) for i in range(10)])
        with self.assertRaises(ea.ExtApplyError):
            self.apply("donations", only_sources=["qld_ecq"])

    def test_a_stage_directory_of_one_file_per_source(self):
        """qld.sqlite + vic.sqlite side by side (the weekly layout): each source is planned against its own file."""
        live = self.con()
        insert(live, "ext_donations", [dict(don_row(i, source="vic_vec"), jurisdiction="vic") for i in range(10)])
        live.close()
        self.stage_rows([don_row(i) for i in range(9)] + [don_row(70)])                 # qld: one new, one withdrawn
        vic = self.dir / "vic.sqlite"
        c = sqlite3.connect(str(vic))
        c.executescript(money_state_donations.DDL)
        insert(c, "ext_donations", [dict(don_row(i, source="vic_vec"), jurisdiction="vic") for i in range(3)])   # truncated
        c.close()
        rep = ea.apply_profile("donations", self.live, [self.stage, vic], archive_dir=self.archive,
                               only_sources=["qld_ecq", "vic_vec"])
        self.assertEqual(rep["sources"]["qld_ecq"]["status"], "applied")
        self.assertEqual(rep["sources"]["vic_vec"]["status"], "refused")
        self.assertEqual(rep["exit"], ea.EXIT_REFUSED)
        self.assertEqual(self.con().execute("SELECT COUNT(*) FROM ext_donations WHERE source='vic_vec'").fetchone()[0], 10)
        self.assertEqual(self.con().execute("SELECT COUNT(*) FROM ext_donations WHERE source_record_id='qld_ecq-70'").fetchone()[0], 1)

    def test_two_stage_files_carrying_one_source_are_ambiguous(self):
        self.stage_rows([don_row(i) for i in range(10)])
        second = self.dir / "stage2.sqlite"
        c = sqlite3.connect(str(second))
        c.executescript(money_state_donations.DDL)
        insert(c, "ext_donations", [don_row(1)])
        c.close()
        with self.assertRaises(ea.ExtApplyError):
            ea.apply_profile("donations", self.live, [self.stage, second], archive_dir=self.archive)


class LobbyistTests(ApplyBase):
    def setUp(self):
        super().setUp()
        live = self.con()
        live.executescript(money_lobbyists.DDL)
        for src in ("agd_register", "nsw_ec_register"):
            insert(live, "ext_lobbyists", [
                dict(jurisdiction="x", source=src, register_id=f"{src}-{i}", entity_name=f"Firm {i}", status="active",
                     ingested_at="2026-09-21T00:00:00Z") for i in range(10)])
            insert(live, "ext_lobbyist_clients", [
                dict(jurisdiction="x", source=src, lobbyist_register_id=f"{src}-{i}", lobbyist_name=f"Firm {i}",
                     client_name=f"Client {i}", active=1, ingested_at="2026-09-21T00:00:00Z") for i in range(10)])
        live.close()
        st = self.con(self.stage)
        st.executescript(money_lobbyists.DDL)
        st.close()

    def stage_source(self, src, n_firms=10, n_clients=10, amend=None):
        st = self.con(self.stage)
        insert(st, "ext_lobbyists", [
            dict(jurisdiction="x", source=src, register_id=f"{src}-{i}", entity_name=f"Firm {i}",
                 status="cancelled" if amend == i else "active", ingested_at="2026-09-29T00:00:00Z") for i in range(n_firms)])
        insert(st, "ext_lobbyist_clients", [
            dict(jurisdiction="x", source=src, lobbyist_register_id=f"{src}-{i}", lobbyist_name=f"Firm {i}",
                 client_name=f"Client {i}", active=1, ingested_at="2026-09-29T00:00:00Z") for i in range(n_clients)])
        st.close()

    def test_amended_register_row_keeps_its_id_and_all_four_tables_move_together(self):
        self.stage_source("agd_register", amend=4)
        self.stage_source("nsw_ec_register")
        ids = {r["register_id"]: r["id"] for r in self.con().execute("SELECT * FROM ext_lobbyists")}
        rep = self.apply("lobbyists")
        self.assertEqual(rep["sources"]["agd_register"]["status"], "applied")
        lob = rep["sources"]["agd_register"]["tables"]["ext_lobbyists"]
        self.assertEqual((lob["unchanged_ids"], lob["amended_in_place"], lob["inserted"], lob["superseded"]), (9, 1, 0, 0))
        row = self.con().execute("SELECT * FROM ext_lobbyists WHERE register_id='agd_register-4'").fetchone()
        self.assertEqual((row["id"], row["status"]), (ids["agd_register-4"], "cancelled"))
        arch = json.loads(Path(rep["sources"]["agd_register"]["archive"]).read_text())
        self.assertEqual(arch["tables"]["ext_lobbyists"]["amended_before"][0]["status"], "active")
        # the missing registers (sa/vic/qld/wa never staged, never stored) are reported, not fatal
        self.assertEqual(rep["sources"]["qld_integrity"]["status"], "missing")
        self.assertEqual(rep["exit"], ea.EXIT_REFUSED)
        self.assertEqual(rep["sources"]["nsw_ec_register"]["status"], "unchanged")

    def test_one_failed_register_does_not_block_the_others_unless_strict(self):
        self.stage_source("agd_register", amend=1)
        self.stage_source("nsw_ec_register", n_firms=3, n_clients=3)      # shrunk: refused
        rep = self.apply("lobbyists", only_sources=["agd_register", "nsw_ec_register"])
        self.assertEqual(rep["sources"]["agd_register"]["status"], "applied")
        self.assertEqual(rep["sources"]["nsw_ec_register"]["status"], "refused")
        self.assertEqual(self.con().execute("SELECT COUNT(*) FROM ext_lobbyists WHERE source='nsw_ec_register'").fetchone()[0], 10)
        self.assertEqual(self.con().execute("SELECT COUNT(*) FROM ext_lobbyist_clients WHERE source='nsw_ec_register'").fetchone()[0], 10)
        rep = self.apply("lobbyists", only_sources=["agd_register", "nsw_ec_register"], strict=True, dry_run=True)
        self.assertEqual(rep["sources"]["agd_register"]["status"], "not-applied")

    def test_child_table_shrinking_refuses_the_whole_source(self):
        self.stage_source("agd_register", n_clients=2)             # firms fine, clients 2 of 10
        rep = self.apply("lobbyists", only_sources=["agd_register"])
        self.assertEqual(rep["sources"]["agd_register"]["status"], "refused")
        self.assertIn("ext_lobbyist_clients", rep["sources"]["agd_register"]["reason"])
        self.assertEqual(self.con().execute("SELECT COUNT(*) FROM ext_lobbyists WHERE source='agd_register'").fetchone()[0], 10)


class FitsTests(ApplyBase):
    def test_fits_applies_across_its_four_tables(self):
        live = self.con()
        live.executescript(fits_register.DDL)
        rows = [dict(source="agd_fits_register", registrant_id=f"r{i}", name=f"Reg {i}", status="current",
                     ingested_at="2026-09-02T00:00:00Z") for i in range(10)]
        insert(live, "ext_fits_registrants", rows)
        insert(live, "ext_fits_principals", [dict(source="agd_fits_register", principal_id=f"p{i}", registrant_id=f"r{i}",
                                                 name=f"Prin {i}", ingested_at="2026-09-02T00:00:00Z") for i in range(10)])
        live.close()
        st = self.con(self.stage)
        st.executescript(fits_register.DDL)
        insert(st, "ext_fits_registrants", [dict(r, ingested_at="2026-09-29T00:00:00Z") for r in rows[:9]]
               + [dict(source="agd_fits_register", registrant_id="r99", name="Reg 99", status="current",
                       ingested_at="2026-09-29T00:00:00Z")])
        insert(st, "ext_fits_principals", [dict(source="agd_fits_register", principal_id=f"p{i}", registrant_id=f"r{i}",
                                               name=f"Prin {i}", ingested_at="2026-09-29T00:00:00Z") for i in range(10)])
        st.close()
        rep = self.apply("fits")
        s = rep["sources"]["agd_fits_register"]
        self.assertEqual(s["status"], "applied")
        self.assertEqual(s["tables"]["ext_fits_registrants"]["inserted"], 1)
        self.assertEqual(s["tables"]["ext_fits_registrants"]["superseded"], 1)
        self.assertEqual(s["tables"]["ext_fits_principals"]["unchanged_ids"], 10)
        self.assertEqual(rep["exit"], 0)


class GrantWindowTests(ApplyBase):
    def grant(self, ga, date, value=1000.0, version=1):
        return dict(ga_id=ga, version=version, agency="Dept", publish_date=date, value=value, recipient_name="R",
                    source="grantconnect", ingested_at="2026-09-29T00:00:00Z")

    def test_window_scope_amendment_in_place_and_reentering_award(self):
        live = self.con()
        live.executescript(grantconnect.DDL)
        old_rows = [self.grant(f"GA{i}", "2026-08-20") for i in range(10)] + [self.grant("GA-OLD", "2026-01-05")]
        insert(live, "ext_grants", old_rows)
        live.close()
        st = self.con(self.stage)
        st.executescript(grantconnect.DDL)
        # window 2026-08-01..: 9 unchanged, GA3 varied (version 2), GA9 dropped from the window's data,
        # a new award, and GA-OLD (stored with an old date) re-published inside the window
        new_rows = [self.grant(f"GA{i}", "2026-08-20") for i in range(9) if i != 3]
        new_rows += [self.grant("GA3", "2026-08-25", value=2000.0, version=2), self.grant("GA-NEW", "2026-09-10"),
                     self.grant("GA-OLD", "2026-08-30", version=2)]
        insert(st, "ext_grants", new_rows)
        st.close()
        ids = {r["ga_id"]: r["rowid"] for r in self.con().execute("SELECT rowid, * FROM ext_grants")}
        rep = self.apply("grants", since="2026-08-01", source_ratio={"grantconnect": 0.5})
        t = rep["sources"]["grantconnect"]["tables"]["ext_grants"]
        # old scope = the 10 GA0-9 rows (GA-OLD is outside it); staged = 11
        self.assertEqual((t["old"], t["new"]), (10, 11))
        self.assertEqual(t["unchanged_ids"], 8)
        self.assertEqual(t["amended_in_place"], 2)              # GA3 (in scope) and GA-OLD (re-entering)
        self.assertEqual((t["inserted"], t["superseded"]), (1, 1))
        after = {r["ga_id"]: r for r in self.con().execute("SELECT rowid, * FROM ext_grants")}
        self.assertEqual(after["GA3"]["rowid"], ids["GA3"])
        self.assertEqual((after["GA3"]["value"], after["GA3"]["version"]), (2000.0, 2))
        self.assertEqual(after["GA-OLD"]["rowid"], ids["GA-OLD"])
        self.assertEqual(after["GA-OLD"]["publish_date"], "2026-08-30")
        self.assertNotIn("GA9", after)
        self.assertIn("GA-NEW", after)

    def test_the_fetch_window_label_is_not_a_change(self):
        """The same awards fetched under a different window split are unchanged rows, not 'amended' ones."""
        live = self.con()
        live.executescript(grantconnect.DDL)
        insert(live, "ext_grants", [dict(self.grant(f"GA{i}", "2026-08-20"), window="2026-08-01..2026-08-31") for i in range(6)])
        live.close()
        st = self.con(self.stage)
        st.executescript(grantconnect.DDL)
        insert(st, "ext_grants", [dict(self.grant(f"GA{i}", "2026-08-20"), window="2026-08-15..2026-08-31") for i in range(6)])
        st.close()
        rep = self.apply("grants", since="2026-08-01")
        self.assertEqual(rep["sources"]["grantconnect"]["status"], "unchanged")
        self.assertEqual(rep["sources"]["grantconnect"]["tables"]["ext_grants"]["unchanged_ids"], 6)

    def test_windowed_profile_needs_since(self):
        live = self.con()
        live.executescript(grantconnect.DDL)
        insert(live, "ext_grants", [self.grant("GA1", "2026-08-20")])
        live.close()
        st = self.con(self.stage)
        st.executescript(grantconnect.DDL)
        insert(st, "ext_grants", [self.grant("GA1", "2026-08-20")])
        st.close()
        with self.assertRaises(ea.ExtApplyError):
            self.apply("grants")

    def test_empty_window_refuses(self):
        live = self.con()
        live.executescript(grantconnect.DDL)
        insert(live, "ext_grants", [self.grant(f"GA{i}", "2026-08-20") for i in range(5)])
        live.close()
        st = self.con(self.stage)
        st.executescript(grantconnect.DDL)
        st.close()
        rep = self.apply("grants", since="2026-08-01")
        self.assertEqual(rep["sources"]["grantconnect"]["status"], "refused")
        self.assertEqual(self.con().execute("SELECT COUNT(*) FROM ext_grants").fetchone()[0], 5)


class CliTests(ApplyBase):
    def test_cli_exit_codes_and_stage_dir(self):
        live = self.con()
        live.executescript(LIVE_DON_DDL)
        insert(live, "ext_donations", [don_row(i) for i in range(10)])
        live.close()
        d = self.dir / "stages"
        d.mkdir()
        st = sqlite3.connect(str(d / "qld.sqlite"))
        st.executescript(money_state_donations.DDL)
        insert(st, "ext_donations", [don_row(i) for i in range(10)])
        st.close()
        quiet = contextlib.redirect_stdout(io.StringIO())
        err = contextlib.redirect_stderr(io.StringIO())
        with quiet, err:
            rc = ea.main(["donations", "--db", str(self.live), "--stage-dir", str(d), "--source", "qld_ecq",
                          "--archive-dir", str(self.archive)])
        self.assertEqual(rc, 0)
        st = sqlite3.connect(str(d / "qld.sqlite"))
        st.execute("DELETE FROM ext_donations")
        st.commit()
        st.close()
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            rc = ea.main(["donations", "--db", str(self.live), "--stage-dir", str(d), "--source", "qld_ecq",
                          "--archive-dir", str(self.archive)])
            usage = ea.main(["donations", "--db", str(self.live), "--stage", str(self.dir / "nope.sqlite")])
        self.assertEqual(rc, ea.EXIT_REFUSED)
        self.assertEqual(usage, ea.EXIT_USAGE)


if __name__ == "__main__":
    unittest.main()
