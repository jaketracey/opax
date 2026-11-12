"""Bill lifecycle facts survive the registry-to-portal projection."""
import json
from pathlib import Path
import sqlite3
import sys
import unittest
from unittest.mock import patch

from scripts import export_bills as export

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/bills_registry"))
import bills_fetch as fetch  # noqa: E402
from bills_schema import DDL  # noqa: E402


def registry():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    for statement in DDL:
        db.execute(statement)
    return db


class BillLifecycleExportTests(unittest.TestCase):
    def test_existing_bill_detail_has_dates_without_inventing_act_number(self):
        bill = json.loads((ROOT / "portal/public/bills/au-federal-r7180.json").read_text())
        facts = export.lifecycle_fields(bill["key_dates"])
        self.assertEqual(bill["introduced"], "2024-03-27")
        self.assertEqual(facts, {
            "passed_both_houses": True,
            "passed_both_houses_date": "2024-07-04",
            "royal_assent": "2024-07-09",
            "act_number": None,
        })

    def test_registry_export_preserves_raw_stage_chamber_source_and_sponsor(self):
        bill = json.loads((ROOT / "portal/public/bills/au-federal-s1471.json").read_text())
        event = bill["key_dates"][0]
        with registry() as db:
            db.execute("INSERT INTO bills_v2 (bill_key,title,introduced_date,originating_house,"
                       "sponsor_name,sponsor_person_id,jurisdiction) VALUES (?,?,?,?,?,?,?)", (
                           bill["key"], bill["title"], bill["introduced"], bill["originating_house"],
                           bill["sponsor"], bill["sponsor_person_id"], "federal"))
            db.execute("INSERT INTO bill_events VALUES (?,?,?,?,?,?)", (
                bill["key"], event["stage"], event["date"], event["house"],
                "Introduced and read a first time", event["url"]))
            row = export.load_v2_bills(db)[0]
        self.assertEqual(row["introduced"], bill["introduced"])
        self.assertEqual(row["sponsor"], "POCOCK, Sen David")
        self.assertEqual(row["sponsor_person_id"], "11009")
        self.assertEqual(row["key_dates"], [{**event, "event_raw": "Introduced and read a first time"}])

    def test_assent_label_is_extracted_only_from_assent_event(self):
        for raw, number in [
            ("Assent (Act no. 67 of 2024)", "67 of 2024"),
            ("Assent (Act Number: 67, 2024)", "67 of 2024"),
            ("Assent (Act no: 67)", "67"),
            ("Assent (2024-07-09)", None),
            ("Assent (C2024A00067)", None),
        ]:
            with self.subTest(raw=raw):
                facts = export.lifecycle_fields([{
                    "stage": "royal_assent", "date": "2024-07-09", "event_raw": raw,
                }, {"stage": "introduced", "date": "2024-03-27", "event_raw": "Act no. 999"}])
                self.assertEqual(facts["royal_assent"], "2024-07-09")
                self.assertEqual(facts["act_number"], number)
                self.assertIsNone(facts["passed_both_houses"])
                self.assertIsNone(facts["passed_both_houses_date"])

    def test_conflicting_act_numbers_and_unrecorded_lifecycle_stay_unknown(self):
        events = [{"stage": "royal_assent", "date": "2024-07-09", "event_raw": raw}
                  for raw in ("Assent (Act no. 67 of 2024)", "Assent (Act no. 68 of 2024)")]
        self.assertIsNone(export.lifecycle_fields(events)["act_number"])
        self.assertEqual(export.lifecycle_fields([]), {
            "passed_both_houses": None, "passed_both_houses_date": None,
            "royal_assent": None, "act_number": None,
        })
        passed = export.lifecycle_fields([{"stage": "passed", "date": None}])
        self.assertTrue(passed["passed_both_houses"])
        self.assertIsNone(passed["passed_both_houses_date"])
        conflicting_dates = export.lifecycle_fields([
            {"stage": stage, "date": date}
            for stage in ("royal_assent", "passed") for date in ("2024-07-08", "2024-07-09")])
        self.assertTrue(conflicting_dates["passed_both_houses"])
        self.assertIsNone(conflicting_dates["passed_both_houses_date"])
        self.assertIsNone(conflicting_dates["royal_assent"])

    def test_legacy_export_keeps_assent_raw_text(self):
        with sqlite3.connect(":memory:") as db:
            db.row_factory = sqlite3.Row
            db.executescript("""
                CREATE TABLE bills(bill_id,title,status,portfolio,introduced_date,house);
                CREATE TABLE bill_progress(progress_id,bill_id,stage,date,house,event_raw);
                INSERT INTO bills VALUES (1,'Fixture Bill 2024','passed',NULL,'2024-03-27','Senate');
                INSERT INTO bill_progress VALUES (1,1,'royal_assent','2024-07-09',NULL,
                    'Assent (Act no. 67 of 2024)');
            """)
            bill = export.load_legacy_bills(db)[0]
        self.assertEqual(bill["royal_assent"], "2024-07-09")
        self.assertEqual(bill["act_number"], "67 of 2024")
        self.assertEqual(bill["key_dates"][0]["event_raw"], "Assent (Act no. 67 of 2024)")
        self.assertIsNone(bill["key_dates"][0]["house"])

    def test_full_projection_and_index_emit_explicit_lifecycle_fields(self):
        bill = json.loads((ROOT / "portal/public/bills/au-federal-r7180.json").read_text())
        bill.update({"source_system": "parlinfo", "legacy_bill_id": None, "assent": "2024-07-09",
                     **export.lifecycle_fields(bill["key_dates"])})
        bill["act_number"] = "67 of 2024"
        timeline = export.PartyTimeline({}, {})
        with registry() as db, patch.object(export.PartyTimeline, "load", return_value=timeline), \
                patch.object(export, "load_v2_bills", return_value=[bill]), \
                patch.object(export, "load_suppressed", return_value=[]), \
                patch.object(export, "load_divisions", return_value={}), \
                patch.object(export, "load_acts", return_value=({}, {})), \
                patch.object(export, "load_sources", return_value={}), \
                patch.object(export, "load_speech_candidates", return_value=[]), \
                patch.object(export, "load_drafts", return_value=[]):
            docs, index = export.build(db, legacy=False)
        for field in ("passed_both_houses", "passed_both_houses_date", "royal_assent", "act_number"):
            self.assertEqual(docs[0][field], bill[field])
            self.assertEqual(index["bills"][0][field], bill[field])


class BillLifecycleIngestTests(unittest.TestCase):
    def test_progress_extra_cell_and_source_are_stored_verbatim(self):
        body = '''<short-title>Fixture Bill 2024</short-title>
            <originating-chamber>Senate</originating-chamber>
            <sponsor id="ABC" party="IND">EXAMPLE, Sen Member</sponsor>
            <table class="bills-progress">
              <tr class="bills-progress-heading"><td>Senate</td></tr>
              <tr class="bills-progress-key-item"><td>Introduced and read a first time</td>
                <td>27/03/24</td></tr>
              <tr class="bills-progress-key-item"><td>Assent</td><td>09/07/24</td>
                <td>Act no. 67 of 2024</td></tr>
            </table>'''
        rec = fetch.parse_billhome(body, "sfixture")
        with registry() as db:
            fetch.upsert(db, rec, {"parlinfo_id": "legislation/billhome/sfixture",
                                  "parliament": 47}, "2026-11-10")
            bill = export.load_v2_bills(db)[0]
        self.assertEqual(bill["introduced"], "2024-03-27")
        self.assertEqual(bill["sponsor"], "EXAMPLE, Sen Member")
        self.assertEqual(bill["act_number"], "67 of 2024")
        event = bill["key_dates"][-1]
        self.assertEqual(event["event_raw"], "Assent (Act no. 67 of 2024)")
        self.assertIn("legislation/billhome/sfixture", event["url"])

    def test_a_reading_date_does_not_become_an_introduction_date(self):
        rec = {"code": "sfixture", "events": [{"stage": "second_reading", "date": "2024-07-01",
                "house": "senate", "event_raw": "Second reading debate"}]}
        with registry() as db:
            fetch.upsert(db, rec, {"parlinfo_id": "legislation/billhome/sfixture",
                                  "parliament": 47, "title": "Fixture Bill 2024"}, "2026-11-10")
            bill = export.load_v2_bills(db)[0]
        self.assertIsNone(bill["introduced"])
        self.assertEqual(bill["status_as_of"], "2024-07-01")


if __name__ == "__main__":
    unittest.main()
