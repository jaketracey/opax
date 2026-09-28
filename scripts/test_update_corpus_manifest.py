"""scripts/update_corpus_manifest.py without the network.

    python3 -m unittest scripts/test_update_corpus_manifest.py
"""
import copy
import json
import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_corpus_manifest as ucm  # noqa: E402

CORPUS = Path(__file__).resolve().parents[1] / "portal" / "public" / "corpus.json"
NOW = datetime(2026, 9, 29, 3, 40, tzinfo=timezone.utc)

LOG = """\
2026-09-21 05:00:00 ===== daily refresh start (since=2026-08-22, timeout/step=3h, host=desktop) =====
2026-09-21 05:01:00 [nsw] OK in 60s; rows 100 -> 900 (+800); log /x/nsw.log
2026-09-22 05:25:03 ===== daily refresh end =====
2026-09-28 21:05:32 ===== daily refresh start (since=2026-08-29, timeout/step=3h, host=desktop) =====
2026-09-28 21:16:13 [fed_load] OK in 456s; rows 67477 -> 67477 (+0); log /x/fed_load.log
2026-09-28 21:19:42 [austender] OK in 209s; rows 19309 -> 19326 (+17); log /x/austender.log
2026-09-28 21:24:01 [vic] OK in 241s; rows 60568 -> 61241 (+673); log /x/vic.log
2026-09-28 21:37:14 [nsw] OK in 563s; rows 119182 -> 120500 (+1318); log /x/nsw.log
2026-09-28 21:37:25 [sa] FAIL(rc=1) in 10s; rows 68982 -> 68982 (+0); log /x/sa.log
2026-09-28 21:47:12 [releases_nsw_sync] OK in 17s; (no row count); log /x/r.log
2026-09-28 21:50:13 [tvfy_refresh] OK in 4s; rows 10647 -> 10647 (+0); log /x/tvfy.log
2026-09-28 21:50:21   committee_senate   newest 2026-06-05  rows 222,965
2026-09-28 21:50:21   nsw_hansard        newest 2026-09-24  rows 120,500
2026-09-28 21:50:21   openaustralia      newest 2026-09-17  rows 67,477
2026-09-28 21:50:21   qld_hansard        newest 2026-09-16  rows 17,723
2026-09-28 21:50:21   vic_hansard        newest 2026-09-24  rows 61,241
2026-09-28 21:50:21 ===== daily refresh end =====
"""


def manifest():
    return {
        "version": "2026-09-21",
        "expected_resources": 1000,
        "expected_resources_breakdown": {"live_index_before_refresh": 900, "new_speech_resources": 100},
        "collected_speeches": 800,
        "sources": [
            {"name": "NSW Parliament", "docs": 300, "coverage": "2015–2026"},
            {"name": "Federal bill records", "docs": 40, "coverage": "Registry records"},
            {"name": "AEC donations (27+ industries classified)", "docs": 199233, "coverage": "1998–2026"},
        ],
        "refresh": {
            "checked_at": "2026-09-21T00:00:00+00:00",
            "bills_registry": 40, "current_parliament_bills": 10, "latest_bill_introduced": "2026-09-01",
            "latest_nsw_release": "2026-09-20",
            "source_limitations": ["SA blocked.", "Federal Hansard is current to 2026-09-10; old.", "Other."],
            "resource_counts": {"bill": 40, "press_release": 160, "speech": 800},
            "raw_source_updates": {"federal_speeches": 5},
        },
    }


def kb(**over):
    base = {"resources": 1000, "kinds": {k: 0 for k in ucm.KINDS}, "sources": {s: 0 for s in ucm.SOURCES}}
    base["kinds"].update({"bill": 40, "press_release": 160, "speech": 800})
    base["sources"].update({"nsw_hansard": 300})
    base.update(over)
    return base


def run(prev=None, live=None, log=None, bills=None, nsw="2026-09-20", **kw):
    return ucm.compute(prev or manifest(), live or kb(), log or ucm.parse_daily_log(LOG), bills or {},
                       nsw, date(2026, 9, 29), NOW, **kw)


class ParseLog(unittest.TestCase):
    def test_takes_the_last_block_only(self):
        log = ucm.parse_daily_log(LOG)
        self.assertTrue(log["complete"])
        self.assertEqual(log["steps"]["nsw"]["delta"], 1318)  # not the 21 Sep block's +800
        self.assertFalse(log["steps"]["sa"]["ok"])
        self.assertIsNone(log["steps"]["releases_nsw_sync"]["delta"])
        self.assertEqual(log["newest"]["openaustralia"], "2026-09-17")
        self.assertEqual(log["since"], "2026-08-29")

    def test_a_block_without_an_end_line_is_incomplete(self):
        log = ucm.parse_daily_log("\n".join(LOG.splitlines()[:-1]))
        self.assertFalse(log["complete"])

    def test_empty_log(self):
        self.assertFalse(ucm.parse_daily_log("")["complete"])


class Compute(unittest.TestCase):
    def test_no_change_in_the_box_writes_nothing(self):
        new, res = run()
        self.assertFalse(res["changed"])
        self.assertEqual(new, manifest())

    def test_always_stamp_touches_only_checked_at(self):
        new, res = run(always_stamp=True)
        self.assertEqual(res["changed_fields"], ["checked_at"])
        want = manifest()
        want["refresh"]["checked_at"] = "2026-09-29T03:40:00+00:00"
        self.assertEqual(new, want)

    def test_growth_updates_the_whole_manifest_and_the_breakdown_sums(self):
        live = kb(resources=1130)
        live["kinds"].update({"speech": 900, "press_release": 190})
        live["sources"]["nsw_hansard"] = 400
        new, res = run(live=live, bills={"bills_registry": 41, "current_parliament_bills": 11,
                                          "latest_bill_introduced": "2026-09-25"})
        self.assertTrue(res["kb_changed"])
        self.assertEqual(res["new_resources"], 130)
        self.assertEqual(new["version"], "2026-09-29")
        self.assertEqual(new["expected_resources"], 1130)
        self.assertEqual(new["expected_resources_breakdown"],
                         {"live_index_before_refresh": 1000, "new_press_release_resources": 30,
                          "new_speech_resources": 100})
        self.assertEqual(sum(new["expected_resources_breakdown"].values()), new["expected_resources"])
        self.assertEqual(new["collected_speeches"], 900)
        self.assertEqual(new["sources"][0]["docs"], 400)
        self.assertEqual(new["sources"][1]["docs"], 40)  # bill kind total
        self.assertEqual(new["sources"][2]["docs"], 199233, "hand-kept row untouched")
        r = new["refresh"]
        self.assertEqual(r["resource_counts"]["speech"], 900)
        self.assertEqual(r["raw_source_updates"], {"federal_speeches": 0, "nsw_speeches": 1318,
                                                   "vic_speeches": 673, "austender_contracts": 17,
                                                   "new_federal_divisions": 0})
        self.assertEqual((r["bills_registry"], r["current_parliament_bills"], r["latest_bill_introduced"]),
                         (41, 11, "2026-09-25"))
        self.assertEqual(r["checked_at"], "2026-09-29T03:40:00+00:00")

    def test_federal_line_is_replaced_and_others_kept(self):
        live = kb(resources=1001)
        live["kinds"]["speech"] = 801
        new, _ = run(live=live)
        limits = new["refresh"]["source_limitations"]
        self.assertEqual(limits[0], "SA blocked.")
        self.assertEqual(limits[2], "Other.")
        self.assertEqual(limits[1],
                         "Federal Hansard is current to 2026-09-17 (no sittings since); NSW Parliament to 2026-09-24; "
                         "Victoria to 2026-09-24; QLD to 2026-09-16. Senate committee hearings are current to the "
                         "last estimates round (2026-06-05).")

    def test_removals_and_unclassified_still_sum_to_the_total(self):
        live = kb(resources=1000 + 7 - 3)
        live["kinds"].update({"speech": 810, "press_release": 157})
        new, _ = run(live=live)
        bd = new["expected_resources_breakdown"]
        self.assertEqual(bd["removed_press_release_resources"], -3)
        self.assertEqual(bd["new_speech_resources"], 10)
        self.assertEqual(sum(bd.values()), new["expected_resources"])
        live2 = kb(resources=1005)  # box says 5 more resources, no kind accounts for them
        new2, _ = run(live=live2)
        self.assertEqual(new2["expected_resources_breakdown"]["other_resource_change"], 5)
        self.assertEqual(sum(new2["expected_resources_breakdown"].values()), 1005)

    def test_a_shrunken_box_is_refused(self):
        with self.assertRaises(ucm.Refused):
            run(live=kb(resources=500))
        run(live=kb(resources=500), allow_shrink=True)  # explicit override

    def test_a_missing_kind_is_refused(self):
        live = kb()
        live["kinds"]["speech"] = None
        with self.assertRaises(ucm.Refused):
            run(live=live)

    def test_bill_and_release_fields_move_without_the_box(self):
        new, res = run(bills={"bills_registry": 42, "current_parliament_bills": 10,
                              "latest_bill_introduced": "2026-09-01"}, nsw="2026-09-28")
        self.assertFalse(res["kb_changed"])
        self.assertTrue(res["changed"])
        self.assertEqual(sorted(res["changed_fields"]), ["bills_registry", "checked_at", "latest_nsw_release"])
        self.assertEqual(new["version"], "2026-09-21", "version stays with the last box change")

    def test_incomplete_log_leaves_raw_updates_and_the_federal_line(self):
        live = kb(resources=1001)
        live["kinds"]["speech"] = 801
        incomplete = ucm.parse_daily_log("\n".join(LOG.splitlines()[:-1]))
        new, _ = run(live=live, log=incomplete)
        self.assertEqual(new["refresh"]["raw_source_updates"], {"federal_speeches": 5})
        self.assertTrue(new["refresh"]["source_limitations"][1].endswith("old."))

    def test_quiet_federal_line_omits_no_sittings_when_recent_or_loaded(self):
        log = ucm.parse_daily_log(LOG)
        self.assertIn("(no sittings since)", ucm.federal_line(log, date(2026, 9, 28)))
        self.assertNotIn("(no sittings since)", ucm.federal_line(log, date(2026, 9, 19)))  # only 2 days on
        log["steps"]["fed_load"]["delta"] = 12
        self.assertNotIn("(no sittings since)", ucm.federal_line(log, date(2026, 9, 28)))

    def test_coverage_only_extends(self):
        self.assertEqual(ucm.extend_coverage("2015–2026", "2027-01-06"), "2015–2027")
        self.assertEqual(ucm.extend_coverage("2015–2026", "2026-09-24"), "2015–2026")
        self.assertEqual(ucm.extend_coverage("Registry records", "2027-01-06"), "Registry records")

    def test_bill_facts_ignore_exposure_drafts(self):
        index = {"bills": [
            {"status": "passed", "parliament": 48, "introduced": "2026-09-17"},
            {"status": "introduced", "parliament": 47, "introduced": "2025-01-01"},
            {"status": "exposure_draft", "parliament": 48, "introduced": "2026-12-01"},
        ]}
        self.assertEqual(ucm.bill_facts(index), {"bills_registry": 2, "current_parliament_bills": 1,
                                                "latest_bill_introduced": "2026-09-17"})


class CommittedManifest(unittest.TestCase):
    """Guards on the real file, so a rename cannot silently stop a row updating."""

    def setUp(self):
        self.corpus = json.loads(CORPUS.read_text(encoding="utf-8"))

    def test_every_mapped_source_row_exists(self):
        names = {s["name"] for s in self.corpus["sources"]}
        self.assertEqual(set(ucm.SOURCE_ROWS) - names, set())

    def test_breakdown_sums_and_kinds_are_all_known(self):
        self.assertEqual(sum(self.corpus["expected_resources_breakdown"].values()),
                         self.corpus["expected_resources"])
        self.assertEqual(sorted(self.corpus["refresh"]["resource_counts"]), sorted(ucm.KINDS))

    def test_file_is_in_the_layout_the_script_writes(self):
        raw = CORPUS.read_text(encoding="utf-8")
        self.assertEqual(raw, ucm.dump(json.loads(raw)))

    def test_an_unchanged_box_is_a_no_op_on_the_real_manifest(self):
        counts = self.corpus["refresh"]["resource_counts"]
        live = {"resources": self.corpus["expected_resources"], "kinds": dict(counts),
                "sources": {s: 0 for s in ucm.SOURCES}}
        new, res = ucm.compute(copy.deepcopy(self.corpus), live, {"complete": False, "steps": {}, "newest": {}},
                               {}, None, date(2026, 9, 29), NOW)
        self.assertFalse(res["changed"])
        self.assertEqual(new, self.corpus)


if __name__ == "__main__":
    unittest.main()
