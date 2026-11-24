"""Bills recorded from Hansard and divisions (scripts/derive_bills_hansard.py).

    python3 -m pytest -q scripts/test_derive_bills_hansard.py

No network, database or model. The fixture Hansard is written here in the shape
OpenAustralia publishes; the last class reads the committed portal/public/bills.
"""
import contextlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
import export_bills as eb  # noqa: E402
import derive_bills_hansard as dbh  # noqa: E402
from scripts.vm import bills_guard, validate_data  # noqa: E402

REGISTRY = {
    "key": "au-federal-r7000", "title": "Old Measures Bill 2026", "short_title": "Old Measures Bill 2026", "aliases": [],
    "jurisdiction": "federal", "parliament": 48, "introduced": "2026-09-17", "originating_house": "representatives",
    "sponsor": None, "sponsor_party": None, "sponsor_person_id": None, "portfolio": "Treasury",
    "status": "before_parliament", "status_as_of": "2026-09-17",
    "key_dates": [], "sources": [], "summary": None, "divisions": [], "speeches": [], "acts": [],
}
DRAFT = {**REGISTRY, "key": "au-federal-ed-safe-harbours-2026", "title": "Safe Harbours Bill 2026",
         "short_title": "Safe Harbours Bill 2026", "status": "exposure_draft", "introduced": "2026-09-01",
         "status_as_of": "2026-09-01", "originating_house": None, "portfolio": None}


def heading(n, text, tag="minor-heading", house="debate", day="2026-10-27"):
    return f'<{tag} id="uk.org.publicwhip/{house}/{day}.{n}.1">{text}</{tag}>'


def bills(*pairs):
    return "<bills>" + "".join(
        f'<bill id="{bid}" url="http://example.invalid/{bid}">{title}</bill>' for bid, title in pairs) + "</bills>"


def speech(text):
    return f'<speech speakername="A Member" talktype="speech"><p>{text}</p></speech>'


MOVED = "I move:</p><p>That this bill be now read a second time.</p><p>The bill does things."
REPS_27 = "<debates>" + "".join([
    heading(1, "BILLS", "major-heading"),
    heading(2, "New Things Bill 2026; Second Reading"), bills(("r7601", "New Things Bill 2026")), speech(MOVED),
    # In the registry already, by key and by title.
    heading(3, "Old Measures Bill 2026; Second Reading"), bills(("r7000", "Old Measures Bill 2026")), speech(MOVED),
    # Its title is in the index as an exposure draft: never duplicated.
    heading(4, "Safe Harbours Bill 2026; Second Reading"), bills(("r7602", "Safe Harbours Bill 2026")), speech(MOVED),
    # A debate speech, not the mover: recorded, but no introduction is claimed.
    heading(5, "Resumed Bill 2026; Second Reading"), bills(("r7603", "Resumed Bill 2026")),
    speech("I rise to speak on this bill."),
    # No printed id, a heading that is not a stage, and a heading outside BILLS: all left out.
    heading(6, "Unnumbered Bill 2026; Second Reading"), bills(("", "Unnumbered Bill 2026")), speech(MOVED),
    heading(7, "Odd Stage Bill 2026; Something Else"), bills(("r7604", "Odd Stage Bill 2026")), speech(MOVED),
    heading(8, "ADJOURNMENT", "major-heading"),
    heading(9, "Chatter Bill 2026; Second Reading"), bills(("r7605", "Chatter Bill 2026")), speech(MOVED),
]) + "</debates>"
SENATE_16 = "<debates>" + "".join([
    heading(1, "BILLS", "major-heading", "lords", "2026-11-16"),
    heading(2, "New Things Bill 2026; First Reading", house="lords", day="2026-11-16"),
    bills(("r7601", "New Things Bill 2026")), speech("Bill read a first time."),
    heading(3, "Senate Idea Bill 2026 [No. 2]; First Reading", house="lords", day="2026-11-16"),
    bills(("s1601", "Senate Idea Bill 2026 [No. 2]")), speech("Bill read a first time."),
]) + "</debates>"


def division(key, name, date="2026-11-16", house="senate", ayes=2, noes=1):
    members = ([{"name": f"A{i}", "party": "Labor", "vote": "aye"} for i in range(ayes)]
               + [{"name": f"N{i}", "party": "Greens", "vote": "no"} for i in range(noes)])
    record = {"key": key, "slug": f"division-{key}", "date": date, "house": house, "jurisdiction": "federal",
              "name": name, "question": "The question is that the bill be now read a second time.",
              "ayes": ayes, "noes": noes, "result": "affirmative", "members": members, "bills": [],
              "source_url": f"{dbh.SOURCE_BASE}/senate_debates/{date}.xml"}
    row = {"key": key, "slug": f"division-{key}", "date": date,
           "party_tallies": [{"party": "Greens", "votes": {"no": noes}}, {"party": "Labor", "votes": {"aye": ayes}}]}
    return record, row


class Site:
    """A throwaway published tree and staged Hansard."""

    def __init__(self, tmp, registry=(REGISTRY, DRAFT)):
        self.out, self.divisions, self.stage = tmp / "bills", tmp / "divisions", tmp / "stage"
        docs = [dict(d) for d in registry]
        index = {"generated_at": "2026-10-04T00:00:00+00:00", "count": len(docs), "meta": {"mode": "registry"},
                 "bills": [eb.index_row(d) for d in docs]}
        eb.write_out(docs, index, self.out, None)
        self.divisions.mkdir()
        rows = []
        for record, row in (
            division("federal-senate-oa-2026-11-16-1", "BILLS - New Things Bill 2026; Second Reading"),
            division("federal-senate-oa-2026-11-16-2", "BILLS - New Things Bill 2026 [No. 2]; Second Reading"),
            division("federal-senate-oa-2026-11-16-3", "BUSINESS - Rearrangement"),
        ):
            (self.divisions / f"division-{record['key']}.json").write_text(json.dumps(record))
            rows.append(row)
        (self.divisions / "index.json").write_text(json.dumps({"divisions": rows}))
        self.put("representatives", "2026-10-27", REPS_27)
        self.put("senate", "2026-11-16", SENATE_16)

    def put(self, house, day, xml):
        path = self.stage / "raw" / dbh.FOLDERS[house] / f"{day}.xml"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(xml)

    def derive(self, stage=True):
        return dbh.derive(self.out, self.divisions, self.stage if stage else None)

    def index(self):
        return json.loads((self.out / "index.json").read_text())

    def doc(self, key):
        return json.loads((self.out / f"{key}.json").read_text())


class WithSite(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.site = Site(Path(tmp.name))


class Derivation(WithSite):
    def test_only_bills_hansard_prints_and_the_registry_lacks_are_recorded(self):
        result = self.site.derive()
        self.assertEqual(sorted(result["docs"]), ["au-federal-r7601", "au-federal-r7603", "au-federal-s1601"])
        index = self.site.index()
        self.assertEqual(index["count"], 5)
        self.assertEqual(len(index["bills"]), 5)
        titles = [row["title"] for row in index["bills"]]
        self.assertEqual(len(titles), len(set(titles)), "a title in the index is never duplicated")
        self.assertEqual(index["meta"]["hansard_recorded"]["count"], 3)
        self.assertEqual(index["meta"]["hansard_recorded"]["current_to"], "2026-11-16")

    def test_each_field_comes_from_the_record_and_nothing_is_guessed(self):
        self.site.derive()
        doc = self.site.doc("au-federal-r7601")
        self.assertEqual(doc["title"], "New Things Bill 2026")
        self.assertEqual((doc["introduced"], doc["originating_house"]), ("2026-10-27", "representatives"))
        self.assertEqual(doc["provenance"]["introduced_basis"], "second_reading_moved")
        self.assertEqual(doc["status_as_of"], "2026-11-16")  # the latest recorded event, never a fetch date
        self.assertEqual([(d["stage"], d["house"], d["date"]) for d in doc["key_dates"]], [
            ("second_reading", "representatives", "2026-10-27"), ("first_reading", "senate", "2026-11-16")])
        for field in ("sponsor", "sponsor_party", "sponsor_person_id", "portfolio", "summary"):
            self.assertIsNone(doc[field], field)
        self.assertEqual((doc["sponsors"], doc["speeches"], doc["acts"]), ([], [], []))
        # Only the division that names exactly this bill: not the [No. 2] bill's, not the business motion.
        self.assertEqual([d["key"] for d in doc["divisions"]], ["federal-senate-oa-2026-11-16-1"])
        division = doc["divisions"][0]
        self.assertEqual((division["ayes"], division["noes"], division["outcome"]), (2, 1, "affirmative"))
        self.assertEqual(division["party_splits"], {"Greens": {"ayes": 0, "noes": 1}, "Labor": {"ayes": 2, "noes": 0}})
        self.assertEqual(division["party_coverage"], {"dated": 3})
        self.assertIsInstance(division["question"], str)

    def test_a_voter_published_with_no_party_is_counted_as_unknown_not_dropped(self):
        path = self.site.divisions / "division-federal-senate-oa-2026-11-16-1.json"
        record = json.loads(path.read_text())
        record["members"][0]["party"] = None
        path.write_text(json.dumps(record))
        self.site.derive()
        division = self.site.doc("au-federal-r7601")["divisions"][0]
        self.assertEqual(division["party_splits"]["Unknown"], {"ayes": 1, "noes": 0})
        self.assertEqual(division["party_coverage"], {"dated": 2, "unknown": 1})
        counted = sum(v["ayes"] + v["noes"] for v in division["party_splits"].values())
        self.assertEqual(counted, sum(division["party_coverage"].values()))

    def test_an_introduction_is_claimed_only_from_a_first_reading_or_the_movers_words(self):
        self.site.derive()
        resumed = self.site.doc("au-federal-r7603")
        self.assertIsNone(resumed["introduced"])
        self.assertIsNone(resumed["originating_house"])
        self.assertEqual(resumed["provenance"]["first_recorded"], "2026-10-27")
        senate = self.site.doc("au-federal-s1601")
        self.assertEqual((senate["introduced"], senate["originating_house"]), ("2026-11-16", "senate"))
        self.assertEqual(senate["provenance"]["introduced_basis"], "first_reading")

    def test_no_link_leaves_the_sources_that_were_read(self):
        self.site.derive()
        for key in ("au-federal-r7601", "au-federal-r7603", "au-federal-s1601"):
            text = (self.site.out / f"{key}.json").read_text()
            self.assertNotRegex(text, r"aph\.gov\.au|example\.invalid|www\.openaustralia")
            urls = re.findall(r'"url": "([^"]+)"', text)
            self.assertTrue(urls and all(u.startswith(dbh.SOURCE_BASE + "/") for u in urls), urls)

    def test_a_rerun_changes_nothing_and_a_missing_stage_keeps_what_was_recorded(self):
        self.site.derive()
        before = {p.name: p.read_bytes() for p in self.site.out.glob("*.json")}
        self.site.derive()
        self.site.derive(stage=False)
        self.assertEqual({p.name: p.read_bytes() for p in self.site.out.glob("*.json")}, before)


class IntroductionNeedsTheRightHouse(WithSite):
    """The earliest staged day is not always the earliest day there was."""

    def only_senate_day(self):
        (self.site.stage / "raw" / dbh.FOLDERS["representatives"] / "2026-10-27.xml").unlink()

    def test_a_house_bill_first_seen_at_its_senate_first_reading_claims_no_introduction(self):
        self.only_senate_day()
        self.site.derive()
        doc = self.site.doc("au-federal-r7601")
        self.assertEqual(doc["provenance"]["first_recorded_house"], "senate")
        self.assertEqual((doc["introduced"], doc["originating_house"], doc["provenance"]["introduced_basis"]),
                         (None, None, None))
        # The Senate's own bill, on the same day and the same kind of heading, is introduced there.
        self.assertEqual(self.site.doc("au-federal-s1601")["originating_house"], "senate")

    def test_a_senate_second_reading_motion_on_a_house_bill_claims_no_introduction(self):
        self.only_senate_day()
        self.site.put("senate", "2026-11-16", "<debates>" + "".join([
            heading(1, "BILLS", "major-heading", "lords", "2026-11-16"),
            heading(2, "New Things Bill 2026; Second Reading", house="lords", day="2026-11-16"),
            bills(("r7601", "New Things Bill 2026")), speech(MOVED)]) + "</debates>")
        self.site.derive()
        doc = self.site.doc("au-federal-r7601")
        self.assertEqual((doc["introduced"], doc["originating_house"]), (None, None))
        obs = [{"house": "senate", "date": "2026-11-16", "stage": "second_reading", "gid": "g", "moved": True}]
        self.assertEqual(dbh.introduction(obs, "r7601"), (None, None, None))
        self.assertEqual(dbh.introduction(obs, "s1601"), ("2026-11-16", "senate", "second_reading_moved"))

    def test_a_division_named_with_a_long_dash_names_the_bill(self):
        self.assertTrue(dbh.names("New Things Bill 2026", "Bills \u2014 New Things Bill 2026; Second Reading"))
        self.assertTrue(dbh.names("New Things Bill 2026", "BILLS - Other Bill 2026, New Things Bill 2026; Second Reading"))
        self.assertFalse(dbh.names("New Things Bill 2026", "Bills \u2014 New Things Bill 2026 [No. 2]; Second Reading"))
        self.assertFalse(dbh.names("Things Bill 2026", "Bills \u2014 New Things Bill 2026; Second Reading"))


class Provenance(WithSite):
    def test_the_label_is_on_the_row_the_file_and_the_index(self):
        self.site.derive()
        row = next(r for r in self.site.index()["bills"] if r["key"] == "au-federal-r7601")
        doc = self.site.doc("au-federal-r7601")
        self.assertEqual(row["record_source"], "hansard_divisions")
        self.assertEqual(doc["record_source"], "hansard_divisions")
        self.assertEqual(row["status"], "recorded_in_parliament")
        self.assertEqual(doc["provenance"]["label"],
                         "Recorded from Hansard and divisions. The Parliament's bill page is not yet loaded.")
        self.assertEqual(self.site.index()["meta"]["hansard_recorded"]["label"], doc["provenance"]["label"])
        self.assertEqual(doc["provenance"]["bill_id_as_printed"], "r7601")
        self.assertEqual({s["kind"] for s in doc["sources"]}, {"hansard"})
        for row in self.site.index()["bills"]:
            if row["key"] in ("au-federal-r7000", "au-federal-ed-safe-harbours-2026"):
                self.assertNotIn("record_source", row)

    def test_copy_is_plain(self):
        for text in (dbh.LABEL, dbh.BASIS):
            self.assertNotIn("—", text)
            self.assertNotIn("–", text)


class Replacement(WithSite):
    def registry_export(self, *docs):
        """What a registry export does: a fresh index of registry bills only, files overwritten."""
        index = {"generated_at": "2026-11-25T00:00:00+00:00", "count": len(docs), "meta": {"mode": "registry"},
                 "bills": [eb.index_row(d) for d in docs]}
        eb.write_out([dict(d) for d in docs], index, self.site.out, None)

    def test_the_registry_record_replaces_the_recorded_one_on_its_key(self):
        self.site.derive()
        real = {**REGISTRY, "key": "au-federal-r7601", "title": "New Things Bill 2026",
                "short_title": "New Things Bill 2026", "introduced": "2026-10-27", "portfolio": "Industry"}
        self.registry_export(REGISTRY, DRAFT, real)
        result = self.site.derive()
        self.assertNotIn("au-federal-r7601", result["docs"])
        doc = self.site.doc("au-federal-r7601")
        self.assertEqual(doc["portfolio"], "Industry")
        self.assertNotIn("record_source", doc)
        rows = [r for r in self.site.index()["bills"] if r["title"] == "New Things Bill 2026"]
        self.assertEqual(len(rows), 1)
        self.assertNotIn("record_source", rows[0])
        # The bills the registry still lacks come back after the export dropped them.
        self.assertEqual(sorted(result["docs"]), ["au-federal-r7603", "au-federal-s1601"])

    def test_it_also_replaces_on_the_normalised_title_and_year_under_another_key(self):
        self.site.derive()
        real = {**REGISTRY, "key": "au-federal-r7999", "title": "NEW THINGS BILL 2026",
                "short_title": "New Things Bill 2026", "introduced": "2026-10-27"}
        self.registry_export(REGISTRY, DRAFT, real)
        result = self.site.derive()
        self.assertEqual(result["replaced"], {"au-federal-r7601": "au-federal-r7999"})
        self.assertFalse((self.site.out / "au-federal-r7601.json").exists())
        self.assertNotIn("au-federal-r7601", [r["key"] for r in self.site.index()["bills"]])

    def test_another_year_or_reprint_number_is_another_bill(self):
        registry = [{"key": "au-federal-r1", "title": "New Things Bill 2025"},
                    {"key": "au-federal-r2", "title": "New Things Bill 2026 [No. 2]"}]
        self.assertIsNone(dbh.superseded("au-federal-r7601", "New Things Bill 2026", registry))
        self.assertEqual(dbh.superseded("au-federal-r7601", "New  things bill 2026",
                                        registry + [{"key": "au-federal-r3", "title": "New Things Bill 2026"}]),
                         "au-federal-r3")

    def test_the_publication_guard_lets_the_registry_record_through(self):
        self.site.derive()
        recorded = self.site.doc("au-federal-r7601")
        real = {**REGISTRY, "key": "au-federal-r7601", "title": "New Things Bill 2026",
                "key_dates": [{"stage": "introduced", "house": "representatives", "date": "2026-10-27"}]}
        self.assertGreater(len(recorded["key_dates"]) + len(recorded["divisions"]), len(real["key_dates"]))
        self.assertEqual(bills_guard.regressions(recorded, real), [])
        # Two registry copies are still compared in full.
        self.assertTrue(bills_guard.regressions({**real, "status_as_of": "2026-11-01"},
                                                {**real, "status_as_of": "2026-10-01"}))


class FailClosed(WithSite):
    def test_a_malformed_record_is_refused_by_every_rule_that_guards_it(self):
        self.site.derive()
        good = self.site.doc("au-federal-r7601")
        self.assertEqual(dbh.record_errors(good, self.site.divisions), [])
        self.assertEqual(validate_data.bill_doc_errors(good, parties=set()), [])
        broken = {
            "a made-up key": {"key": "au-federal-hansard-new-things"},
            "a reworded label": {"provenance": {**good["provenance"], "label": "From the Parliament's bill page."}},
            "a guessed sponsor": {"sponsor": "A Member"},
            "a guessed portfolio": {"portfolio": "Treasury"},
            "a registry status": {"status": "before_parliament"},
            "a bill page link": {"sources": [{"kind": "billhome", "document_date": None, "licence": None,
                                              "url": "https://parlinfo.aph.gov.au/parlInfo/x"}]},
            "an introduction nothing records": {"introduced": "2026-10-01"},
            "a stage nothing records": {"key_dates": good["key_dates"] + [
                {"stage": "third_reading", "house": "senate", "date": "2026-11-17", "url": good["key_dates"][0]["url"]}]},
            "no observations": {"provenance": {**good["provenance"], "observations": []}},
            "a changed tally": {"divisions": [{**good["divisions"][0], "ayes": 99}]},
            "a division of another bill": {"divisions": [{**good["divisions"][0], "key": "federal-senate-oa-2026-11-16-3"}]},
        }
        for name, change in broken.items():
            with self.subTest(name):
                self.assertTrue(dbh.record_errors({**good, **change}, self.site.divisions), name)
        # validate_data has no divisions tree to hand: everything but the last two still fails there.
        for name in list(broken)[:-2]:
            with self.subTest(f"validate_data: {name}"):
                self.assertTrue(validate_data.bill_doc_errors({**good, **broken[name]}, parties=set()), name)
        # A registry bill may not borrow the status, and a recorded bill may not drop its source.
        self.assertTrue(validate_data.bill_doc_errors({**REGISTRY, "status": "recorded_in_parliament"}, parties=set()))
        self.assertEqual(validate_data.bill_doc_errors(REGISTRY, parties=set()), [])

    def test_a_run_that_cannot_trust_its_inputs_writes_nothing(self):
        self.site.derive()
        record = json.loads((self.site.divisions / "division-federal-senate-oa-2026-11-16-1.json").read_text())
        (self.site.divisions / "division-federal-senate-oa-2026-11-16-1.json").write_text(
            json.dumps({**record, "key": "federal-senate-oa-2026-11-16-9"}))  # identity mismatch
        with self.assertRaises(ValueError):
            self.site.derive()
        # Nothing was written by the failed run: the published copy still stands and still reads.
        self.assertEqual(self.site.doc("au-federal-r7601")["divisions"][0]["ayes"], 2)
        self.assertEqual(self.site.index()["count"], 5)

    def test_a_refused_new_record_never_reaches_the_index(self):
        original = dbh.record_errors

        def refuse(doc, divisions=None):
            return ["refused for the test"] if doc["key"] == "au-federal-s1601" else original(doc, divisions)
        dbh.record_errors = refuse
        try:
            result = self.site.derive()
        finally:
            dbh.record_errors = original
        self.assertIn("au-federal-s1601", result["refused"])
        self.assertFalse((self.site.out / "au-federal-s1601.json").exists())
        keys = [r["key"] for r in self.site.index()["bills"]]
        self.assertNotIn("au-federal-s1601", keys)
        self.assertIn("au-federal-r7601", keys)


class BadInputs(WithSite):
    def test_an_unreadable_day_file_is_held_and_the_other_days_are_still_read(self):
        self.site.put("senate", "2026-11-17", "<debates><major-heading>BILLS</major-head")  # cut short
        self.site.put("senate", "2026-11-18", "<html>not Hansard</html>")
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            result = self.site.derive()
        self.assertEqual(sorted(result["docs"]), ["au-federal-r7601", "au-federal-r7603", "au-federal-s1601"])
        self.assertIn("HELD senate_debates/2026-11-17.xml", err.getvalue())
        self.assertIn("HELD senate_debates/2026-11-18.xml", err.getvalue())
        self.assertIn("HELD 2 Hansard day file(s) in all", err.getvalue())

    def test_a_published_file_with_no_provenance_does_not_stop_the_run(self):
        self.site.derive()
        path = self.site.out / "au-federal-r7603.json"
        doc = json.loads(path.read_text())
        del doc["provenance"]
        path.write_text(json.dumps(doc))
        result = self.site.derive()  # no KeyError; Hansard still holds the bill, so it is rebuilt whole
        self.assertIn("provenance", self.site.doc("au-federal-r7603"))
        self.assertIn("au-federal-r7603", result["docs"])


class RegistryExportNight(unittest.TestCase):
    """An unpaused night: the export writes the index without the recorded bills, the publication
    guard lets that through, and this step must put them back or the whole group goes back to HEAD."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.repo = Path(tmp.name)
        self.site = Site(self.repo / "portal" / "public")
        self.site.out.parent.mkdir(parents=True, exist_ok=True)
        self.git("init", "-q")
        self.site.derive()
        self.git("add", "-A")
        self.git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "published")
        was = os.getcwd()
        os.chdir(self.repo)
        self.addCleanup(os.chdir, was)
        # The export: registry bills only in the index; the recorded files are left on disk.
        docs = [dict(REGISTRY), dict(DRAFT)]
        eb.write_out(docs, {"generated_at": "2026-11-25T00:00:00+00:00", "count": 2, "meta": {"mode": "registry"},
                            "bills": [eb.index_row(d) for d in docs]}, self.site.out, None)

    def git(self, *args):
        subprocess.run(["git", *args], cwd=self.repo, check=True, capture_output=True)

    def run_step(self):
        argv, err = sys.argv, io.StringIO()
        sys.argv = ["derive_bills_hansard.py", "--out", str(self.site.out), "--divisions", str(self.site.divisions),
                    "--stage", str(self.site.stage)]
        try:
            with contextlib.redirect_stderr(err):
                return dbh.main(), err.getvalue()
        finally:
            sys.argv = argv

    def recorded_rows(self):
        return sorted(r["key"] for r in self.site.index()["bills"] if r.get("record_source"))

    def guard(self):
        with contextlib.redirect_stderr(io.StringIO()):
            return bills_guard.check()

    def test_the_guard_passes_the_export_and_the_step_puts_the_recorded_bills_back(self):
        self.assertEqual(self.recorded_rows(), [])
        self.guard()  # the export alone is not "existing bills disappeared"
        rc, _ = self.run_step()
        self.assertEqual(rc, 0)
        self.assertEqual(self.recorded_rows(), ["au-federal-r7601", "au-federal-r7603", "au-federal-s1601"])
        self.guard()
        # Back to what was published: at most the index's build stamp differs, and no file is outside it.
        changed = subprocess.run(["git", "status", "--porcelain", "--", "portal/public/bills"], cwd=self.repo,
                                 capture_output=True, text=True).stdout.split()[1::2]
        self.assertLessEqual(set(changed), {"portal/public/bills/index.json"})

    def test_one_unparseable_day_file_does_not_drop_them(self):
        self.site.put("senate", "2026-11-16", "<debates><minor-heading>cut sho")
        rc, printed = self.run_step()
        self.assertEqual(rc, 0)
        self.assertIn("HELD senate_debates/2026-11-16.xml", printed)
        # What that day had recorded is kept from the published copies.
        self.assertEqual(self.recorded_rows(), ["au-federal-r7601", "au-federal-r7603", "au-federal-s1601"])
        self.assertEqual(self.site.doc("au-federal-s1601")["introduced"], "2026-11-16")
        self.guard()

    def test_a_failure_with_the_stage_falls_back_to_the_published_records(self):
        original = dbh.scan_stage
        dbh.scan_stage = lambda stage, since: (_ for _ in ()).throw(RuntimeError("stage unreadable"))
        try:
            rc, printed = self.run_step()
        finally:
            dbh.scan_stage = original
        self.assertEqual(rc, 0)
        self.assertIn("rebuilding from the published records only", printed)
        self.assertEqual(self.recorded_rows(), ["au-federal-r7601", "au-federal-r7603", "au-federal-s1601"])

    def test_a_step_that_cannot_run_says_so_and_the_nightly_puts_the_group_back(self):
        path = self.site.divisions / "division-federal-senate-oa-2026-11-16-1.json"
        path.write_text(json.dumps({**json.loads(path.read_text()), "key": "someone-else"}))
        before = {p.name: p.read_bytes() for p in self.site.out.glob("*.json")}
        rc, printed = self.run_step()
        self.assertEqual(rc, 1, "a non-zero exit is what tells the nightly to revert")
        self.assertIn("nothing written", printed)
        self.assertEqual({p.name: p.read_bytes() for p in self.site.out.glob("*.json")}, before)
        self.assertEqual(self.recorded_rows(), [], "left alone, the export's index would drop the recorded bills")
        # The nightly's answer, as written in scripts/vm/nightly.sh: the bills group goes back to HEAD.
        nightly = (ROOT / "scripts/vm/nightly.sh").read_text()
        step = nightly[nightly.index("scripts/derive_bills_hansard.py --stage"):]
        step = step[:step.index("\nfi\n")]
        self.assertRegex(step, r"then\n\s+fail [^\n]*reverted to HEAD[^\n]*\n\s+revert portal/public/bills$")
        self.git("checkout", "-q", "HEAD", "--", "portal/public/bills")
        self.git("clean", "-fdq", "--", "portal/public/bills")
        self.assertEqual(self.recorded_rows(), ["au-federal-r7601", "au-federal-r7603", "au-federal-s1601"])
        self.guard()


# The strictest bill decoder on readers' phones (mobile/src/api/ids.ts and catalog-decoders.ts in
# iOS 1.1.3 build 57). Gates runs the real decoders (scripts/ci/app-data-guard.sh); this is the same
# contract for the recorded bills, close to the script that writes them.
APP_BILL_KEY = re.compile(r"^au-federal-(?:[rs]\d+|alrc-\d+|ed-[a-z0-9]+(?:-[a-z0-9]+)*)$")
APP_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")


def app_decodes(doc: dict) -> list[str]:
    bad = []

    def need(ok, what):
        if not ok:
            bad.append(what)
    text = lambda v: isinstance(v, str)  # noqa: E731
    nonempty = lambda v: text(v) and bool(v.strip())  # noqa: E731
    date = lambda v: text(v) and bool(APP_DATE.match(v))  # noqa: E731
    count = lambda v: type(v) is int and v >= 0  # noqa: E731
    url = lambda v: text(v) and v.startswith("https://")  # noqa: E731
    need(text(doc.get("key")) and APP_BILL_KEY.match(doc["key"]), "key")
    need(nonempty(doc.get("title")) and nonempty(doc.get("status")) and nonempty(doc.get("jurisdiction")), "title/status")
    for field in ("short_title", "originating_house", "sponsor", "sponsor_party", "portfolio"):
        need(doc.get(field) is None or text(doc[field]), field)
    for field in ("introduced", "status_as_of"):
        need(doc.get(field) is None or date(doc[field]), field)
    need(doc.get("parliament") is None or count(doc["parliament"]), "parliament")
    need(doc.get("sponsor_person_id") is None, "sponsor_person_id")
    need(doc.get("summary") is None, "summary")
    for d in doc["key_dates"]:
        need(nonempty(d["stage"]) and date(d["date"]) and (d["house"] is None or text(d["house"]))
             and (d["url"] is None or url(d["url"])), "key_dates")
    for s in doc["sources"]:
        need(nonempty(s["kind"]) and url(s["url"]) and (s["licence"] is None or text(s["licence"]))
             and (s["document_date"] is None or date(s["document_date"])), "sources")
    for d in doc["divisions"]:
        need(nonempty(d["key"]) and date(d["date"]) and nonempty(d["house"]) and text(d["question"])
             and (d["stage"] is None or text(d["stage"])) and count(d["ayes"]) and count(d["noes"])
             and nonempty(d["outcome"]) and count(d["paired"]) and url(d["url"])
             and all(count(v["ayes"]) and count(v["noes"]) for v in d["party_splits"].values())
             and all(count(v) for v in d["party_coverage"].values()), f"divisions {d.get('key')}")
    need(doc["speeches"] == [] and doc["acts"] == [], "speeches/acts")
    return bad


class ShippedAppContract(WithSite):
    def test_a_recorded_bill_decodes_under_the_strictest_shipped_decoder(self):
        self.site.derive()
        for key in ("au-federal-r7601", "au-federal-r7603", "au-federal-s1601"):
            self.assertEqual(app_decodes(self.site.doc(key)), [], key)
        row = next(r for r in self.site.index()["bills"] if r["key"] == "au-federal-r7601")
        for field in ("has_summary", "divisions", "speeches", "acts", "summary_version"):
            self.assertIn(field, row)

    def test_the_decoder_mirror_refuses_what_the_app_refuses(self):
        self.site.derive()
        doc = self.site.doc("au-federal-r7601")
        self.assertTrue(app_decodes({**doc, "key": "au-federal-hansard-new-things-bill-2026"}))
        self.assertTrue(app_decodes({**doc, "divisions": [{**doc["divisions"][0], "question": None}]}))


class PublishedData(unittest.TestCase):
    """The committed projection."""

    BILLS, DIVISIONS = ROOT / "portal/public/bills", ROOT / "portal/public/divisions"

    def test_every_published_recorded_bill_passes_every_rule(self):
        index = json.loads((self.BILLS / "index.json").read_text())
        recorded = [r for r in index["bills"] if r.get("record_source")]
        registry_titles = {eb.norm(r["title"]) for r in index["bills"] if not r.get("record_source")}
        self.assertEqual((index.get("meta") or {}).get("hansard_recorded", {}).get("count", 0), len(recorded))
        for row in recorded:
            with self.subTest(row["key"]):
                doc = json.loads((self.BILLS / f"{row['key']}.json").read_text())
                self.assertEqual(dbh.record_errors(doc, self.DIVISIONS), [])
                self.assertEqual(app_decodes(doc), [])
                self.assertNotIn(eb.norm(doc["title"]), registry_titles)
                self.assertEqual(row, eb.index_row(doc))
        self.assertEqual(validate_data.check_bills(), [])


if __name__ == "__main__":
    unittest.main()
