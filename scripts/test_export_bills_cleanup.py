"""Data cleanup wave 1, bills: the export rules for findings bills-001 to bills-014.

    python3 -m pytest -q scripts/test_export_bills_cleanup.py
"""
import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "bills_registry"))
import bills_fetch  # noqa: E402
import export_bills as eb  # noqa: E402
from bills_registry.bills_stages import BILL_STAGE_ORDER, lifecycle  # noqa: E402
from corrections import apply as corrections  # noqa: E402
from vm import bills_guard  # noqa: E402


def event(stage, date, raw=None, house="representatives", url=None):
    return {"stage": stage, "date": date, "house": house, "url": url, "event_raw": raw}


class SponsorPartyTests(unittest.TestCase):
    """bills-001 and bills-002."""

    def test_known_party_labels_map_to_one_token(self):
        cases = {
            "Australian Labor Party": "Labor", "ALP": "Labor", "&#34;ALP&#34;": "Labor",
            "Liberal Party of Australia": "Liberal", "The Nationals": "Nationals",
            "Australian Greens": "Greens", "Queensland Greens": "Greens",
            "Independent Members": "Independent",
            "Pauline Hanson&#39;s One Nation": "One Nation",
            "Pauline Hanson&amp;#39;s One Nation": "One Nation",  # double-escaped
            "Pauline Hanson’s One Nation": "One Nation",
            "United Australia Party (Clive Palmer": "United Australia Party",
            "Country Liberals (Northern Territory": "Country Liberal Party",
            "Derryn Hinch&#39;s Justice Party": "Derryn Hinch's Justice Party",
        }
        for raw, token in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(eb.sponsor_party_token(raw), token)

    def test_labels_that_name_no_party_are_not_published(self):
        for raw in ("independent candidate for the federal seat of Bass, Tas",
                    "Liberal Party candidate for the federal seat of Makin, SA",
                    "monarchist", "xx", "Unknown", "", None):
            with self.subTest(raw=raw):
                self.assertIsNone(eb.sponsor_party_token(raw))

    def test_every_token_is_a_published_party(self):
        self.assertTrue(eb.SPONSOR_PARTY_TOKEN_SET <= eb.PUBLISHED_PARTIES)

    def test_source_text_decodes_and_unquotes(self):
        self.assertEqual(eb.source_text('&#34;O&#39;CONNOR, Brendan, MP&#34;'), "O'CONNOR, Brendan, MP")
        self.assertEqual(eb.source_text("  a \n b "), "a b")
        self.assertIsNone(eb.source_text("   "))

    def test_sponsors_take_the_source_party_else_the_dated_party_else_none(self):
        class Timeline:
            def at(self, pid, day):
                return {"p1": ("Greens", "dated"), "p2": ("Labor", "unknown")}.get(pid, (None, "unknown"))
        bills = [{"introduced": "2019-01-01", "sponsor_person_id": "p1", "sponsor_party": None,
                  "sponsors": [{"name": "A", "party": None, "person_id": "p1"},
                               {"name": "B", "party": "Liberal", "person_id": "p9"},
                               {"name": "C", "party": None, "person_id": "p2"}]}]
        eb.fill_sponsor_parties(bills, Timeline())
        self.assertEqual(bills[0]["sponsor_party"], "Greens")
        self.assertEqual([s["party"] for s in bills[0]["sponsors"]], ["Greens", "Liberal", None])


class SponsorListTests(unittest.TestCase):
    """bills-006 and bills-007."""

    def test_private_portfolio_print_is_split_into_members(self):
        self.assertEqual(eb.portfolio_sponsors("(s) PHELPS, Kerryn, MPWILKIE, Andrew, MPBANDT, Adam, MP"),
                         ["PHELPS, Kerryn, MP", "WILKIE, Andrew, MP", "BANDT, Adam, MP"])
        self.assertEqual(eb.portfolio_sponsors("(s) KATTER, Bob, MP"), ["KATTER, Bob, MP"])
        self.assertIsNone(eb.portfolio_sponsors("Treasury"))
        self.assertIsNone(eb.portfolio_sponsors(None))

    def test_registry_sponsors_prefer_the_scraped_list(self):
        extras = {"sponsors": [{"name": "WHISH-WILSON, Sen Peter", "party": "Australian Greens"},
                               {"name": "HANSON, Sen Pauline", "party": "Pauline Hanson&#39;s One Nation"},
                               {"name": "X, Sen Y", "party": "monarchist"}]}
        got = eb.registry_sponsors({"sponsor_name": "WHISH-WILSON, Sen Peter"}, extras, None)
        self.assertEqual([(s["name"], s["party"]) for s in got],
                         [("WHISH-WILSON, Sen Peter", "Greens"), ("HANSON, Sen Pauline", "One Nation"), ("X, Sen Y", None)])
        self.assertEqual(got[2]["_party_raw"], "monarchist")

    def test_portfolio_co_sponsors_join_only_when_the_first_matches(self):
        prints = ["ENTSCH, Warren, MP", "GAMBARO, Teresa, MP"]
        same = eb.registry_sponsors({"sponsor_name": "ENTSCH, Warren, MP"}, {}, prints)
        self.assertEqual([s["name"] for s in same], prints)
        other = eb.registry_sponsors({"sponsor_name": "SMITH, Jan, MP"}, {}, prints)
        self.assertEqual([s["name"] for s in other], ["SMITH, Jan, MP"])
        self.assertEqual([s["name"] for s in eb.registry_sponsors({}, {}, prints)], prints)

    def test_billhome_parser_keeps_every_sponsor_once(self):
        body = ('<sponsor id="XT4" party="Australian Greens">WHISH-WILSON, Sen Peter</sponsor>'
                '<sponsor id="IK4" party="Pauline Hanson&#39;s One Nation">HANSON, Sen Pauline</sponsor>'
                '<sponsor id="XT4" party="Australian Greens">WHISH-WILSON, Sen Peter</sponsor>')
        got = bills_fetch.parse_sponsors(body)
        self.assertEqual([(s["name"], s["aph_id"]) for s in got],
                         [("WHISH-WILSON, Sen Peter", "XT4"), ("HANSON, Sen Pauline", "IK4")])
        self.assertEqual(got[1]["party"], "Pauline Hanson's One Nation")


class StatusAndStageTests(unittest.TestCase):
    """bills-003, bills-004, bills-005 and bills-012."""

    def test_final_negatived_vote_makes_a_dead_bill_negatived(self):
        events = [event("second_reading", "2017-02-09", "Second reading moved"),
                  event("second_reading", "2017-03-20", "Second reading negatived")]
        self.assertEqual(eb.final_status("lapsed", events), "negatived")

    def test_negatived_then_later_events_keep_lapsed(self):
        events = [event("second_reading", "2017-03-20", "Second reading negatived"),
                  event("other", "2018-05-01", "Restored to Notice Paper")]
        self.assertEqual(eb.final_status("lapsed", events), "lapsed")

    def test_negatived_then_passed_keeps_passed(self):
        # The shape of r5738, r5269 and r5270: a negatived stage, then passage.
        events = [event("third_reading", "2016-02-02", "Third reading negatived"),
                  event("third_reading", "2016-02-10", "Third reading agreed to"),
                  event("royal_assent", "2016-02-12", "Assent", house=None)]
        self.assertEqual(eb.final_status("passed", events), "passed")
        self.assertEqual(eb.final_status("passed", events[:1]), "passed")

    def test_key_dates_keep_source_wording_flag_negatives_and_drop_exact_repeats(self):
        events = [event("other", "2014-03-27", "Order of the day removed"),
                  event("other", "2014-03-27", "Order of the day removed"),
                  event("other", "2014-03-27", "Referred to committee"),
                  event("second_reading", "2014-06-19", "Second reading negatived")]
        rows = eb.key_dates(events)
        self.assertEqual([r["event_raw"] for r in rows],
                         ["Order of the day removed", "Referred to committee", "Second reading negatived"])
        self.assertTrue(rows[-1]["negatived"])
        self.assertNotIn("negatived", rows[0])

    def test_assent_is_not_a_chamber(self):
        self.assertIsNone(eb.house_code("Assent"))
        self.assertEqual(eb.house_code("House of Representatives"), eb.house_code("house of representatives"))
        self.assertIsNone(eb.house_code(None))

    def test_negatived_is_terminal_and_a_negatived_third_reading_is_not_passage(self):
        self.assertEqual(BILL_STAGE_ORDER["negatived"], BILL_STAGE_ORDER["lapsed"])
        passed = {"status": "lapsed", "key_dates": [{"stage": "third_reading", "house": "senate", "date": "2017-01-01"}]}
        defeated = copy.deepcopy(passed)
        defeated["status"] = "negatived"
        defeated["key_dates"][0]["negatived"] = True
        self.assertEqual(lifecycle(defeated), BILL_STAGE_ORDER["negatived"])
        self.assertEqual(lifecycle(passed), BILL_STAGE_ORDER["lapsed"])
        one_house = {"status": "before_parliament", "key_dates": passed["key_dates"]}
        self.assertEqual(lifecycle(one_house), BILL_STAGE_ORDER["passed_one_house"])
        flagged = copy.deepcopy(one_house)
        flagged["key_dates"][0]["negatived"] = True
        self.assertEqual(lifecycle(flagged), BILL_STAGE_ORDER["before_parliament"])


class EndingTests(unittest.TestCase):
    """How a dead bill ended: `ended` and `ended_label`, from the register's words."""

    def test_the_final_days_event_names_the_ending(self):
        cases = {
            "Removed from the Notice Paper in accordance with (SO 42)": "removed",
            "Discharged from Notice Paper": "discharged",
            "Discharged from Notice Paper (In accordance with House Standing Order 222(a))": "discharged",
            "Lapsed at dissolution": "lapsed",
            "Lapsed at end of Parliament": "lapsed",
            "Laid aside": "laid_aside",
            "Consideration of Senate message (Details: Bill laid aside)": "laid_aside",
        }
        for raw, ended in cases.items():
            with self.subTest(raw=raw):
                events = [event("introduced", "2019-02-12", "Introduced and read a first time"),
                          event("other", "2020-03-01", raw)]
                self.assertEqual(eb.bill_ended("lapsed", "Not Proceeding", events), ended)

    def test_with_no_ending_event_the_status_text_is_the_ending(self):
        events = [event("second_reading", "2019-02-12", "Second reading debate")]
        self.assertEqual(eb.bill_ended("lapsed", "Not Proceeding", events), "not_proceeding")
        self.assertEqual(eb.bill_ended("lapsed", "lapsed", events), "lapsed")
        self.assertEqual(eb.bill_ended("lapsed", "Not Proceeding", []), "not_proceeding")

    def test_a_negatived_bill_ended_negatived(self):
        events = [event("second_reading", "2017-03-20", "Second reading negatived")]
        status = eb.final_status("lapsed", events)
        self.assertEqual(eb.bill_ended(status, "Not Proceeding", events), "negatived")
        self.assertEqual(eb.ENDED_LABELS["negatived"], "Voted down")

    def test_a_restored_bill_does_not_keep_its_earlier_ending(self):
        events = [event("other", "2014-03-27", "Removed from the Notice Paper in accordance with (SO 42)"),
                  event("other", "2014-05-13", "Restored to Notice Paper")]
        self.assertEqual(eb.bill_ended("lapsed", "Not Proceeding", events), "not_proceeding")

    def test_two_endings_on_the_last_day_read_the_status_text(self):
        events = [event("other", "2016-04-15", "Discharged from Notice Paper"),
                  event("other", "2016-04-15", "Lapsed at prorogation")]
        self.assertEqual(eb.bill_ended("lapsed", "Not Proceeding", events), "not_proceeding")

    def test_a_live_or_passed_bill_or_unnamed_ending_has_none(self):
        removed = [event("other", "2020-03-01", "Removed from the Notice Paper in accordance with (SO 42)")]
        self.assertIsNone(eb.bill_ended("before_parliament", "Before Senate", removed))
        self.assertIsNone(eb.bill_ended("passed", "Act", removed))
        quiet = [event("second_reading", "2019-02-12", "Second reading moved")]
        for raw in ("", None, "Unknown", "Before Senate"):
            with self.subTest(raw=raw):
                self.assertIsNone(eb.bill_ended("lapsed", raw, quiet))

    def test_every_ending_has_a_label_without_an_em_dash(self):
        endings = {ended for _, ended in eb._ENDED_EVENT + eb._ENDED_STATUS}
        self.assertTrue(endings <= set(eb.ENDED_LABELS))
        self.assertEqual(eb.ENDED_LABELS["removed"], "Removed from the Notice Paper")
        for label in eb.ENDED_LABELS.values():
            self.assertNotIn("\u2014", label)

    def test_the_fields_sit_after_status_as_of_and_leave_when_none(self):
        record = {"key": "k", "status": "lapsed", "status_as_of": "2020-03-01", "sponsor": None}
        got = eb.with_ended(record, "removed")
        self.assertEqual(list(got), ["key", "status", "status_as_of", "ended", "ended_label", "sponsor"])
        self.assertEqual(got["ended_label"], "Removed from the Notice Paper")
        self.assertEqual(eb.with_ended(got, None), record)
        self.assertEqual(eb.with_ended(record, "guess"), record)

    def test_index_rows_and_docs_carry_the_ending_only_when_named(self):
        doc = {"key": "k", "title": "t", "short_title": None, "jurisdiction": "federal", "parliament": 46,
               "introduced": "2019-07-04", "originating_house": "senate", "status": "lapsed",
               "status_as_of": "2022-04-11", "sponsor": None, "sponsor_party": None, "portfolio": None,
               "summary": None, "divisions": [], "speeches": [], "acts": [], "ended": "lapsed"}
        row = eb.index_row(doc)
        self.assertEqual((row["ended"], row["ended_label"]), ("lapsed", "Lapsed"))
        del doc["ended"]
        self.assertNotIn("ended", eb.index_row(doc))

    def test_fill_endings_adds_only_the_two_fields_to_a_retained_export(self):
        import bills_schema
        import sqlite3
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "parli.db"
            db = sqlite3.connect(db_path)
            for stmt in bills_schema.DDL:
                db.execute(stmt)
            bills = {  # key: (registry status, status text, events, published status)
                "au-federal-r1": ("lapsed", "Not Proceeding",
                                  [("introduced", "2019-07-04", "Introduced and read a first time"),
                                   ("other", "2022-02-10", "Removed from the Notice Paper in accordance with (SO 42)")],
                                  "lapsed"),
                "au-federal-r2": ("lapsed", "Not Proceeding",
                                  [("second_reading", "2020-08-27", "Second reading negatived")], "lapsed"),
                "au-federal-r3": ("lapsed", "Not Proceeding", [], "before_parliament"),
                "au-federal-r4": ("passed", "Act", [("royal_assent", "2021-03-01", "Assent")], "lapsed"),
                "au-federal-r5": ("lapsed", "Not Proceeding",
                                  [("second_reading", "2020-08-27", "Second reading debate")], "lapsed"),
            }
            for key, (status, raw, events, _) in bills.items():
                db.execute("INSERT INTO bills_v2 (bill_key, jurisdiction, title, status, status_raw) "
                           "VALUES (?, 'federal', ?, ?, ?)", (key, key, status, raw))
                for stage, date, text in events:
                    db.execute("INSERT INTO bill_events (bill_key, stage, date, house, event_raw) "
                               "VALUES (?, ?, ?, 'House of Representatives', ?)", (key, stage, date, text))
            db.commit()
            db.close()
            out = Path(tmp) / "bills"
            out.mkdir()
            rows = []
            for key, (*_, published) in bills.items():
                doc = {"key": key, "title": key, "status": published, "status_as_of": "2022-02-10",
                       "key_dates": [], "divisions": []}
                (out / f"{key}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
                rows.append({"key": key, "status": published, "status_as_of": "2022-02-10", "divisions": 0})
            index = {"generated_at": "2026-10-04T16:27:54+00:00", "count": len(rows), "meta": {}, "bills": rows}
            (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")
            before = {p.name: json.loads(p.read_text()) for p in out.iterdir()}

            conn = eb.connect(f"file:{db_path}?mode=ro")
            try:
                self.assertEqual(eb.fill_endings(out, conn), 3)
                self.assertEqual(eb.fill_endings(out, conn), 0)  # a rerun changes nothing
            finally:
                conn.rollback()
                conn.close()

            after = {p.name: json.loads(p.read_text()) for p in out.iterdir()}
            want = {"au-federal-r1": ("removed", "Removed from the Notice Paper"),
                    "au-federal-r2": ("negatived", "Voted down")}
            def strip(record):
                return {k: v for k, v in record.items() if k not in ("ended", "ended_label")}
            for name, doc in after.items():
                with self.subTest(name=name):
                    if name == "index.json":
                        doc = {**doc, "bills": [strip(r) for r in doc["bills"]]}
                    self.assertEqual(strip(doc), before[name])
            for key, (ended, label) in want.items():
                self.assertEqual((after[f"{key}.json"]["ended"], after[f"{key}.json"]["ended_label"]), (ended, label))
            for key in ("au-federal-r3", "au-federal-r4"):
                self.assertNotIn("ended", after[f"{key}.json"])
            self.assertEqual(after["au-federal-r5.json"]["ended"], "not_proceeding")
            ended_rows = {r["key"]: r.get("ended") for r in after["index.json"]["bills"]}
            self.assertEqual(ended_rows, {"au-federal-r1": "removed", "au-federal-r2": "negatived",
                                          "au-federal-r3": None, "au-federal-r4": None,
                                          "au-federal-r5": "not_proceeding"})
            self.assertEqual(list(after["index.json"]["bills"][0]),
                             ["key", "status", "status_as_of", "ended", "ended_label", "divisions"])
            self.assertEqual(after["index.json"]["generated_at"], index["generated_at"])


class SuppressionTests(unittest.TestCase):
    """bills-008."""

    def test_reviewed_duplicates_leave_with_a_redirect(self):
        bills = [{"key": "au-federal-alrc-4391"}, {"key": "au-federal-r5824"}, {"key": "au-federal-x"}]
        kept, redirects = eb.suppress(bills, [{"key": "au-federal-alrc-4391", "duplicate_of": "au-federal-r5824",
                                               "reason": "duplicate", "finding": "bills-008"}])
        self.assertEqual([b["key"] for b in kept], ["au-federal-r5824", "au-federal-x"])
        self.assertEqual(redirects, {"au-federal-alrc-4391": "au-federal-r5824"})

    def test_a_redirect_to_nothing_is_refused(self):
        with self.assertRaises(ValueError):
            eb.suppress([{"key": "a"}], [{"key": "a", "duplicate_of": "b", "reason": "r", "finding": "f"}])

    def test_the_reviewed_file_names_a_source_for_every_entry(self):
        rows = eb.load_suppressed()
        self.assertEqual({(r["key"], r["duplicate_of"]) for r in rows}, {
            ("au-federal-alrc-4391", "au-federal-r5824"), ("au-federal-alrc-5160", "au-federal-s1060"),
            ("au-federal-alrc-4437", "au-federal-r5967")})
        for r in rows:
            self.assertTrue(r["evidence_url"].startswith("https://www.aph.gov.au/"), r["key"])

    def test_suppressed_files_are_removed_from_the_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            (out / "au-federal-alrc-4391.json").write_text("{}")
            index = {"generated_at": "x", "count": 0, "bills": [], "meta": {},
                     "redirects": {"au-federal-alrc-4391": "au-federal-r5824"}}
            eb.write_out([], index, out, None)
            self.assertFalse((out / "au-federal-alrc-4391.json").exists())


class CorrectionTests(unittest.TestCase):
    """bills-009 and bills-014, through scripts/corrections/apply.py."""

    def entry(self, **kw):
        base = {"id": "r1", "field": "f", "from": "a", "to": "b", "evidence_url": "https://example.gov.au/x",
                "evidence": "the source says b", "finding": "test", "reviewed": "2026-11-10"}
        return {**base, **kw}

    def test_apply_sets_the_value_and_a_stale_entry_stops_for_review(self):
        # The shared helper (scripts/corrections/apply.py) fails loudly once the record
        # already holds `to`: the source now agrees, so the entry must be removed.
        records = [{"id": "r1", "f": "a"}]
        self.assertEqual(len(corrections.apply("t", records, entries=[self.entry()])), 1)
        self.assertEqual(records[0]["f"], "b")
        with self.assertRaisesRegex(corrections.CorrectionMismatch, "remove the correction"):
            corrections.apply("t", records, entries=[self.entry()])

    def test_a_changed_or_missing_record_stops_for_review(self):
        with self.assertRaises(corrections.CorrectionMismatch):
            corrections.apply("t", [{"id": "r1", "f": "c"}], entries=[self.entry()])
        with self.assertRaises(corrections.CorrectionMismatch):
            corrections.apply("t", [], entries=[self.entry()])

    def test_load_requires_every_field_and_an_https_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "t.json").write_text(json.dumps([self.entry(evidence_url="http://x")]))
            with self.assertRaises(corrections.CorrectionMismatch):
                corrections.load("t", d)
            bad = self.entry()
            del bad["evidence"]
            (d / "t.json").write_text(json.dumps([bad]))
            with self.assertRaises(corrections.CorrectionMismatch):
                corrections.load("t", d)

    def test_the_link_corrections_move_six_r6348_divisions_to_r6482(self):
        entries = corrections.load("bill_links")
        self.assertEqual(len(entries), 6)
        for e in entries:
            self.assertEqual((e["field"], e["from"], e["to"]), ("bill_key", "au-federal-r6348", "au-federal-r6482"))
            self.assertTrue(e["evidence_url"].startswith("https://www.aph.gov.au/"))
        records = [{"id": e["id"], "bill_key": "au-federal-r6348"} for e in entries]
        corrections.apply("bill_links", records)
        self.assertEqual({r["bill_key"] for r in records}, {"au-federal-r6482"})

    def test_the_act_corrections_cite_the_act_text(self):
        entries = {e["id"]: e for e in corrections.load("bill_acts")}
        self.assertEqual((entries["C2024A00135"]["from"], entries["C2024A00135"]["to"]), ("2024-12-11", "2024-12-10"))
        self.assertEqual((entries["C2026A00064"]["from"], entries["C2026A00064"]["to"]), ("2026-07-02", "2026-07-06"))
        for e in entries.values():
            self.assertTrue(e["evidence_url"].startswith("https://www.legislation.gov.au/"))


class ReviewFlagTests(unittest.TestCase):
    """bills-009: links after a finished bill's last event are listed, not dropped."""

    def test_late_links_on_finished_bills_are_listed(self):
        docs = [{"key": "a", "status": "negatived", "key_dates": [{"date": "2019-01-01"}],
                 "divisions": [{"key": "d1", "date": "2019-01-01"}, {"key": "d2", "date": "2019-12-05"}]},
                {"key": "b", "status": "before_parliament", "key_dates": [{"date": "2019-01-01"}],
                 "divisions": [{"key": "d3", "date": "2020-01-01"}]}]
        self.assertEqual(eb.links_after_last_event(docs), [
            {"bill": "a", "status": "negatived", "last_event": "2019-01-01", "division": "d2", "division_date": "2019-12-05"}])
        self.assertEqual(len(docs[0]["divisions"]), 2)


class GuardTests(unittest.TestCase):
    """The bills guard accepts these reviewed changes and still holds the rest."""

    def test_flagging_a_negatived_third_reading_is_not_a_regression(self):
        old = {"key": "k", "status": "lapsed",
               "key_dates": [{"stage": "third_reading", "house": "senate", "date": "2017-01-01"}]}
        new = copy.deepcopy(old)
        new["status"] = "negatived"
        new["key_dates"][0].update(negatived=True, event_raw="Third reading negatived")
        self.assertEqual(bills_guard.regressions(old, new), [])
        before = {"key": "k", "status": "before_parliament", "key_dates": copy.deepcopy(old["key_dates"])}
        dropped = {"key": "k", "status": "before_parliament", "key_dates": []}
        self.assertIn("bill lifecycle went backwards", bills_guard.regressions(before, dropped))

    def test_a_reviewed_move_is_accepted_and_any_other_loss_is_held(self):
        old = {"key": "au-federal-r6348", "divisions": [{"key": "federal-representatives-6145"}, {"key": "d2"}]}
        new = {"key": "au-federal-r6348", "divisions": [{"key": "d2"}]}
        moved = bills_guard.reviewed_moves()
        self.assertIn(("au-federal-r6348", "federal-representatives-6145"), moved)
        self.assertEqual(bills_guard.regressions(old, new, moved), [])
        self.assertTrue(bills_guard.regressions(old, {"key": old["key"], "divisions": [old["divisions"][0]]}, moved))

    def test_check_accepts_only_reviewed_suppressions_that_redirect(self):
        def index(keys, redirects=None):
            doc = {"generated_at": "x", "count": len(keys), "bills": [{"key": k} for k in keys]}
            if redirects:
                doc["redirects"] = redirects
            return doc
        def doc(k):
            return {"key": k, "key_dates": [], "divisions": []}
        old_keys = ["au-federal-alrc-4391", "au-federal-r5824", "au-federal-x"]
        cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            try:
                bills = Path(bills_guard.BILLS)
                bills.mkdir(parents=True)
                def write(keys, redirects=None):
                    for p in bills.glob("*.json"):
                        p.unlink()
                    (bills / "index.json").write_text(json.dumps(index(keys, redirects)))
                    for k in keys:
                        (bills / f"{k}.json").write_text(json.dumps(doc(k)))
                git = lambda *a: subprocess.run(["git", *a], check=True, capture_output=True)  # noqa: E731
                git("init", "-q")
                write(old_keys)
                git("add", "-A")
                git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false",
                    "commit", "-qm", "head")
                kept = ["au-federal-r5824", "au-federal-x"]
                write(kept, {"au-federal-alrc-4391": "au-federal-r5824"})
                self.assertIn("0 new", bills_guard.check())
                write(kept)  # no redirect: a disappearance
                with self.assertRaises(ValueError):
                    bills_guard.check()
                write(["au-federal-alrc-4391", "au-federal-r5824"], {"au-federal-x": "au-federal-r5824"})
                with self.assertRaises(ValueError):  # not a reviewed suppression
                    bills_guard.check()
            finally:
                os.chdir(cwd)


if __name__ == "__main__":
    unittest.main()
