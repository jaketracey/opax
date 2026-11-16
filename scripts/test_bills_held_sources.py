#!/usr/bin/env python3
"""scripts/bills_held_sources.py on the retained bills snapshot, offline.

Fixtures come from data the repository holds: the 4 Oct 2026 bills snapshot,
the 160 OpenAustralia-keyed division pages, and Hansard XML written here from
those pages' own headings. The ten FRL Acts stand in for the ten the box holds
since the snapshot (their ids live only on the box; the nightly logs them):
they are made for ten held bills still before parliament.
"""
from __future__ import annotations

import collections
import importlib.util
import json
import shutil
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT))
import bills_held_sources as H  # noqa: E402
import export_bills as eb  # noqa: E402

BILLS = ROOT / "portal/public/bills"
DIVISIONS = ROOT / "portal/public/divisions"
_guard_spec = importlib.util.spec_from_file_location("bills_guard_for_held_sources", ROOT / "scripts/vm/bills_guard.py")
bills_guard = importlib.util.module_from_spec(_guard_spec)
_guard_spec.loader.exec_module(bills_guard)

TODAY = "2026-11-17"
FETCHED = "2026-11-16T16:20:00Z"  # 03:20 on 17 Nov in Sydney: the nightly's one request


def oa_divisions() -> list[dict]:
    rows = json.loads((DIVISIONS / "index.json").read_text())["divisions"]
    return [json.loads((DIVISIONS / f"division-{r['key']}.json").read_text())
            for r in rows if "-oa-" in r["key"]]


def division_title(name: str) -> tuple[str, str]:
    """('X Bill 2026', 'Second Reading') from 'BILLS - X Bill 2026; Second Reading'."""
    tail = name.split(" - ", 1)[-1]
    title, _, stage = tail.rpartition(";")
    return title.strip(), stage.strip()


class HeldSourcesFixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = json.loads((BILLS / "index.json").read_text())
        cls.snapshot = cls.index["generated_at"][:10]
        rows = cls.index["bills"]
        cls.by_title = collections.defaultdict(list)
        for row in rows:
            if H.HELD_KEY.match(row["key"]):
                cls.by_title[eb.norm(row["title"])].append(row["key"])
        cls.divisions = oa_divisions()
        # Exact links the box's bill_links would hold for these divisions (fixture only:
        # the box joins them on the official id in oa_division_provenance).
        cls.links = []
        for d in cls.divisions:
            title, _ = division_title(d["name"])
            keys = cls.by_title.get(eb.norm(title), [])
            if len(keys) == 1:
                cls.links.append((keys[0], d["key"]))
        alive = sorted((r for r in rows if r["parliament"] == 48 and r["status"] == "before_parliament"
                        and H.HELD_KEY.match(r["key"])), key=lambda r: (r["introduced"] or "", r["key"]), reverse=True)
        cls.assented = [r["key"] for r in alive[:10]]
        linked = {bill for bill, _ in cls.links}
        cls.lapsed = next(r["key"] for r in rows if r["status"] == "lapsed" and H.HELD_KEY.match(r["key"])
                          and r["key"] not in linked)

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.bills = self.tmp / "bills"
        shutil.copytree(BILLS, self.bills)
        self.before = {p.name: p.read_bytes() for p in self.bills.glob("*.json")}
        self.db_path = self.tmp / "parli.db"
        self.build_db()
        self.stage = self.tmp / "oa-feed"
        self.plan = self.build_hansard()

    # --- fixtures -----------------------------------------------------------------

    def build_db(self):
        db = sqlite3.connect(self.db_path)
        db.executescript("""
            CREATE TABLE ext_frl_acts (act_id TEXT PRIMARY KEY, name TEXT, making_date TEXT, year INTEGER, number INTEGER,
                is_principal INTEGER, is_in_force INTEGER, status TEXT, bill_uri TEXT, bill_code TEXT, fetched_at TEXT);
            CREATE TABLE bill_links (bill_key TEXT NOT NULL, kind TEXT NOT NULL, target_key TEXT NOT NULL, rule TEXT,
                confidence REAL, evidence_json TEXT, audited TEXT DEFAULT '', PRIMARY KEY (bill_key, kind, target_key));
            CREATE TABLE ext_divisions (id TEXT PRIMARY KEY, jurisdiction TEXT, house TEXT, date TEXT, number INTEGER,
                name TEXT, question TEXT, ayes_count INTEGER, noes_count INTEGER, result TEXT, source_url TEXT);
            CREATE TABLE ext_votes (division_id TEXT, person_id TEXT, vote TEXT, jurisdiction TEXT);
            CREATE TABLE members (person_id TEXT, full_name TEXT, party TEXT, party_canonical TEXT);
            CREATE TABLE speeches (person_id TEXT, date TEXT, party_canonical TEXT, state TEXT);
        """)
        people = {}
        for d in self.divisions:
            db.execute("INSERT INTO ext_divisions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                       (d["key"], "federal", d["house"], d["date"], int(d["key"].rsplit("-", 1)[1]), d["name"],
                        d.get("question"), d["ayes"], d["noes"], d["result"], d["source_url"]))
            for m in d.get("members") or []:
                db.execute("INSERT INTO ext_votes VALUES (?,?,?,?)", (d["key"], m["person_id"], m["vote"], "federal"))
                people[m["person_id"].removeprefix("tvfy_")] = (m["name"], m.get("party"))
        db.executemany("INSERT INTO members VALUES (?,?,?,?)",
                       [(pid, name, party, party) for pid, (name, party) in sorted(people.items())])
        db.executemany("INSERT INTO bill_links VALUES (?,?,?,?,?,?,?)",
                       [(bill, "division", division, H.EXACT_LINK_RULE, 1, "{}", "") for bill, division in self.links])
        # Never published: a title-rule row, and an exact row an audit marked wrong.
        spare = [d["key"] for d in self.divisions if all(d["key"] != t for _, t in self.links)]
        db.execute("INSERT INTO bill_links VALUES (?,?,?,?,?,?,?)",
                   (self.assented[0], "division", spare[0], "title-date", 0.9, "{}", ""))
        db.execute("INSERT INTO bill_links VALUES (?,?,?,?,?,?,?)",
                   (self.assented[1], "division", spare[1], H.EXACT_LINK_RULE, 1, "{}", "wrong"))
        db.execute("INSERT INTO bill_links VALUES (?,?,?,?,?,?,?)",
                   (self.assented[2], "division", "federal-senate-oa-2026-10-14-99", H.EXACT_LINK_RULE, 1, "{}", ""))
        acts = []
        for n, key in enumerate(self.assented):
            title = json.loads((self.bills / f"{key}.json").read_text())["title"]
            acts.append((f"C2026A{92 + n:05d}", title.replace(" Bill ", " Act "), f"2026-10-{16 + n:02d}", 2026, 92 + n,
                         1, 1, "InForce", f"https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22legislation%2Fbillhome%2F{key.rsplit('-', 1)[1]}%22",
                         key.rsplit("-", 1)[1], FETCHED))
        acts.append(("C2026A00120", "Imaginary Act 2026", "2026-11-05", 2026, 120, 1, 1, "InForce", None, "r9999", FETCHED))
        acts.append(("C2026A00121", "Dead Bill Act 2026", "2026-11-06", 2026, 121, 1, 1, "InForce", None,
                     self.lapsed.rsplit("-", 1)[1], FETCHED))
        acts.append(("C2026A00080", "Before The Snapshot Act 2026", "2026-09-30", 2026, 80, 1, 1, "InForce", None,
                     self.assented[3].rsplit("-", 1)[1], FETCHED))
        db.executemany("INSERT INTO ext_frl_acts VALUES (?,?,?,?,?,?,?,?,?,?,?)", acts)
        db.commit()
        db.close()

    def build_hansard(self) -> set[tuple]:
        """Chamber-days from the OA division pages, one section per bill and
        stage the pages name; returns the (bill, stage, house, date) expected."""
        days = collections.defaultdict(list)
        expected = set()
        for d in self.divisions:
            title, stage = division_title(d["name"])
            keys = self.by_title.get(eb.norm(title), [])
            code = H.heading_stage(stage)
            if len(keys) != 1 or code not in ("second_reading", "third_reading") or d["date"] <= self.snapshot:
                continue
            key = keys[0]
            ref = key.rsplit("-", 1)[1]
            words = "Question agreed to. Bill read a third time." if code == "third_reading" else "Debate adjourned."
            days[(d["house"], d["date"])].append(
                f'<minor-heading id="x">{escape(title)}; {escape(stage)}</minor-heading>'
                f'<bills><bill id="{ref}" url="https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id%3A%22legislation%2Fbillhome%2F{ref}%22">{escape(title)}</bill></bills>'
                f'<speech nospeaker="true"><p>{words}</p></speech>')
            expected.add((key, code, d["house"], d["date"]))
        self.assertGreaterEqual(len(expected), 2)  # October readings of held bills the pages name
        # Review-only sections on the first fixture day.
        house, day = sorted(days)[0]
        held_title = json.loads((self.bills / f"{self.assented[4]}.json").read_text())["title"]
        days[(house, day)] += [
            f'<minor-heading id="y">{escape(held_title)}; Third Reading</minor-heading>'
            f'<bills><bill id="{self.assented[4].rsplit("-", 1)[1]}" url="">{escape(held_title)}</bill></bills>'
            '<speech nospeaker="true"><p>Question negatived.</p></speech>',
            '<minor-heading id="z">Imaginary Bill 2026; First Reading</minor-heading>'
            '<bills><bill id="r9998" url="">Imaginary Bill 2026</bill></bills>'
            '<speech nospeaker="true"><p>Bill read a first time.</p></speech>',
            f'<minor-heading id="w">{escape(held_title)}; Second Reading</minor-heading>'
            '<speech nospeaker="true"><p>Debate resumed.</p></speech>',
        ]
        # A day before the snapshot: ParlInfo's record already covers it.
        days[("representatives", "2026-09-15")].append(
            f'<minor-heading id="v">{escape(held_title)}; Second Reading</minor-heading>'
            f'<bills><bill id="{self.assented[4].rsplit("-", 1)[1]}" url="">{escape(held_title)}</bill></bills>')
        for (house, day), sections in days.items():
            path = self.stage / "raw" / H.FOLDERS[house] / f"{day}.xml"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('<debates><major-heading id="m">BILLS</major-heading>' + "".join(sections) + "</debates>\n")
        self.negatived = (self.assented[4], house, day)
        return expected

    def run_overlay(self, head=None):
        db = eb.connect(f"file:{self.db_path}?mode=ro")
        try:
            return H.overlay(self.bills, DIVISIONS, db, self.stage, TODAY, head or {})
        finally:
            db.close()

    def doc(self, key):
        return json.loads((self.bills / f"{key}.json").read_text())

    # --- tests --------------------------------------------------------------------

    def test_ten_acts_add_assent_act_source_and_passed_status(self):
        result = self.run_overlay()
        applied = {a["act_id"]: a for a in result["summary"]["assents_added"]}
        self.assertEqual(len(applied), 10)
        rows = {r["key"]: r for r in json.loads((self.bills / "index.json").read_text())["bills"]}
        for n, key in enumerate(self.assented):
            act_id, made = f"C2026A{92 + n:05d}", f"2026-10-{16 + n:02d}"
            uri = f"https://www.legislation.gov.au/{act_id}"
            doc = self.doc(key)
            assent = [r for r in doc["key_dates"] if r["stage"] == "royal_assent"]
            self.assertEqual(assent, [{"stage": "royal_assent", "date": made, "house": None, "url": uri,
                                       "source": "frl", "retrieved": "2026-11-17"}])
            self.assertIn({"title": doc["acts"][-1]["title"], "frl_uri": uri, "assent_date": made, "retrieved": "2026-11-17"},
                          doc["acts"])
            self.assertIn({"kind": "frl_act", "url": uri, "document_date": made, "licence": "CC BY 4.0",
                           "retrieved": "2026-11-17"}, doc["sources"])
            self.assertEqual((doc["status"], doc["status_as_of"]), ("passed", made))
            self.assertEqual((rows[key]["status"], rows[key]["status_as_of"], rows[key]["acts"]), ("passed", made, len(doc["acts"])))
            self.assertEqual(applied[act_id]["bill"], key)

    def test_acts_for_bills_we_do_not_hold_dead_or_before_the_snapshot_are_not_published(self):
        result = self.run_overlay()
        kinds = {(e["kind"], e.get("act_id")) for e in result["review"] if e["source"] == "frl"}
        self.assertIn(("unknown_bill_id", "C2026A00120"), kinds)
        self.assertIn(("assent_not_published", "C2026A00121"), kinds)
        self.assertFalse((self.bills / "au-federal-r9999.json").exists())
        self.assertEqual((self.bills / f"{self.lapsed}.json").read_bytes(), self.before[f"{self.lapsed}.json"])
        self.assertNotIn("https://www.legislation.gov.au/C2026A00080",
                         [a["frl_uri"] for a in self.doc(self.assented[3])["acts"]])

    def test_oa_divisions_link_by_exact_rule_with_page_tallies(self):
        result = self.run_overlay()
        self.assertEqual(len(self.divisions), 160)
        self.assertGreater(len(self.links), 50)
        self.assertEqual(result["summary"]["division_links_added"], len(self.links))
        self.assertEqual(result["summary"]["division_links_unpublished"], 1)
        rows = {r["key"]: r for r in json.loads((self.bills / "index.json").read_text())["bills"]}
        pages = {d["key"]: d for d in self.divisions}
        for bill, division in self.links:
            doc = self.doc(bill)
            entry = next(d for d in doc["divisions"] if d["key"] == division)
            page = pages[division]
            self.assertEqual((entry["ayes"], entry["noes"], entry["outcome"], entry["url"]),
                             (page["ayes"], page["noes"], page["result"], page["source_url"]))
            self.assertIsInstance(entry["question"], str)
            self.assertTrue(entry["outcome"] and entry["url"])  # the app decoder's non-null fields
            self.assertEqual(rows[bill]["divisions"], len(doc["divisions"]))
            self.assertEqual(doc["divisions"], sorted(doc["divisions"], key=lambda d: (d["date"] or "", d["key"])))
        linked = {d for _, d in self.links}
        for bill in self.assented[:2]:
            self.assertFalse({d["key"] for d in self.doc(bill)["divisions"]} - linked)
        eb.check_division_facts(self.bills, DIVISIONS)

    def test_hansard_readings_by_exact_id_and_review_for_the_rest(self):
        result = self.run_overlay()
        got = {(k, r["stage"], r["house"], r["date"]) for k in {p[0] for p in self.plan} | {self.negatived[0]}
               for r in self.doc(k)["key_dates"] if r.get("source") == "hansard"}
        self.assertEqual(got, self.plan)
        for key, stage, house, day in self.plan:
            row = next(r for r in self.doc(key)["key_dates"] if (r["stage"], r["house"], r["date"]) == (stage, house, day))
            self.assertEqual(row["url"], f"{H.OA_SCRAPED}/{H.FOLDERS[house]}/{day}.xml")
        review = collections.Counter(e["kind"] for e in result["review"] if e["source"] == "hansard")
        self.assertEqual(review["third_reading_not_published"], 1)
        self.assertGreaterEqual(review["unknown_bill_id"], 1)
        titled = [e for e in result["review"] if e["kind"] == "title_only"]
        self.assertTrue(titled and all(e["basis"].startswith("exact normalised title") for e in titled))
        self.assertIn(self.negatived[0], titled[0]["candidates"])
        self.assertTrue(all(r["date"] > self.snapshot for k in {p[0] for p in self.plan}
                            for r in self.doc(k)["key_dates"] if r.get("source") == "hansard"))

    def test_field_only_idempotent_and_guard_clean(self):
        result = self.run_overlay()
        index = json.loads((self.bills / "index.json").read_text())
        old_index = json.loads(self.before["index.json"])
        self.assertEqual(index["generated_at"], old_index["generated_at"])
        self.assertEqual(list(index)[:2], ["generated_at", "progress_as_at"])
        read = [p.stem for p in self.stage.glob("raw/*/*.xml") if p.stem > self.snapshot]
        floor = H.sydney_day(old_index["generated_at"])
        self.assertEqual(floor, "2026-10-05")  # the export's Sydney day, as the site's "as at" line shows it
        # Only what both sources cover: the earlier of Hansard read and the register's read day.
        self.assertEqual(index["progress_as_at"], max(floor, min(max(read), "2026-11-17")))
        self.assertEqual((index["meta"]["held_sources"]["hansard_latest"], index["meta"]["held_sources"]["frl_read"]),
                         (max(read), "2026-11-17"))
        self.assertEqual(index["meta"]["held_sources"]["since"], self.snapshot)
        changed = {p.name for p in self.bills.glob("*.json") if p.read_bytes() != self.before[p.name]}
        self.assertEqual(len(changed) - 1, result["summary"]["bills_changed"])
        for name in changed - {"index.json"}:
            old, new = json.loads(self.before[name]), json.loads((self.bills / name).read_text())
            self.assertEqual(bills_guard.regressions(old, new), [], name)
            self.assertEqual(set(old) - set(new), set(), name)
            self.assertEqual(eb.same_layout(self.before[name].decode(), new), (self.bills / name).read_text())
        snapshot = {p.name: p.read_bytes() for p in self.bills.glob("*.json")}
        again = self.run_overlay()
        self.assertEqual({p.name: p.read_bytes() for p in self.bills.glob("*.json")}, snapshot)
        self.assertEqual((again["summary"]["bills_changed"], again["summary"]["stages_added"],
                          again["summary"]["division_links_added"], again["summary"]["assents_added"]), (0, 0, 0, []))

    def test_rows_published_at_head_survive_a_full_export_that_lacks_them(self):
        self.run_overlay()
        key = self.assented[0]
        head = {key: self.doc(key)}
        (self.bills / f"{key}.json").write_bytes(self.before[f"{key}.json"])  # a full export's copy
        with sqlite3.connect(self.db_path) as db:
            db.execute("DELETE FROM ext_frl_acts")  # nothing to re-read: only the carry can restore it
        self.run_overlay(head)
        doc = self.doc(key)
        self.assertEqual(H.own_rows(doc), H.own_rows(head[key]))
        self.assertEqual((doc["status"], doc["status_as_of"]), (head[key]["status"], head[key]["status_as_of"]))
        self.assertEqual(bills_guard.regressions(head[key], doc), [])

    def test_an_unreadable_day_goes_to_review_and_holds_the_progress_date(self):
        # An unreadable chamber-day in the other house on the last reading day: readings
        # before it publish, readings on or after it are held back until it reads.
        days = sorted({day for *_, day in self.plan})
        self.assertGreaterEqual(len(days), 2)
        houses = {house for _, _, house, day in self.plan if day == days[-1]}
        gap = self.stage / "raw" / H.FOLDERS["senate" if "representatives" in houses else "representatives"] / f"{days[-1]}.xml"
        gap.parent.mkdir(parents=True, exist_ok=True)
        gap.write_text("<debates><minor-heading>")
        result = self.run_overlay()
        kinds = result["summary"]["review_kinds"]
        self.assertIn("unreadable_day", kinds)
        index = json.loads((self.bills / "index.json").read_text())
        self.assertLess(index["meta"]["held_sources"]["hansard_latest"] or "", gap.stem)
        self.assertLess(index["progress_as_at"], gap.stem)
        published = [r["date"] for k in {p[0] for p in self.plan} for r in self.doc(k)["key_dates"]
                     if r.get("source") == "hansard"]
        self.assertTrue(published and all(d < gap.stem for d in published))
        held_back = [e for e in result["review"] if e["kind"] == "held_after_unreadable_day"]
        self.assertTrue(held_back and all(e["date"] >= gap.stem for e in held_back))
        # One review entry per reading, though the fixture writes a section per division.
        self.assertEqual(len(published) + len(held_back), len(self.plan))

    def test_with_no_hansard_read_progress_stays_at_the_export_day(self):
        shutil.rmtree(self.stage / "raw")
        result = self.run_overlay()
        self.assertEqual(len(result["summary"]["assents_added"]), 10)  # the register still adds its Acts
        index = json.loads((self.bills / "index.json").read_text())
        self.assertEqual(index["progress_as_at"], "2026-10-05")  # not the newest Act's day (2026-10-25)
        with sqlite3.connect(self.db_path) as db:
            db.execute("DELETE FROM ext_frl_acts")
        self.run_overlay()
        self.assertEqual(json.loads((self.bills / "index.json").read_text())["progress_as_at"], "2026-10-05")

    def test_a_negatived_second_reading_is_reviewed_not_published(self):
        key = self.assented[5]
        ref, title = key.rsplit("-", 1)[1], self.doc(key)["title"]
        bills = (f'<bills><bill id="{ref}" url="https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;'
                 f'query=Id%3A%22legislation%2Fbillhome%2F{ref}%22">{escape(title)}</bill></bills>')
        def section(words, division=""):
            return (f'<minor-heading id="n">{escape(title)}; Second Reading</minor-heading>{bills}{division}'
                    f'<speech nospeaker="true"><p>{words}</p></speech>')
        lost = '<division id="d"><divisioncount ayes="30" noes="35"/></division>'
        cases = {
            "2026-11-03": section("Question negatived.", lost),                        # the bill voted down: review
            "2026-11-04": section("Question negatived. Bill read a second time.", lost),  # an amendment lost, then agreed
            "2026-11-05": section("That this bill be now read a second time. Question negatived."),  # the motion is not the record
        }
        for day, body in cases.items():
            path = self.stage / "raw" / H.FOLDERS["senate"] / f"{day}.xml"
            path.write_text(f'<debates><major-heading id="m">BILLS</major-heading>{body}</debates>\n')
        result = self.run_overlay()
        rows = {r["date"] for r in self.doc(key)["key_dates"] if r.get("source") == "hansard" and r["stage"] == "second_reading"}
        self.assertEqual(rows, {"2026-11-04"})
        reviewed = {e["date"]: e for e in result["review"] if e["kind"] == "second_reading_not_published"}
        self.assertEqual(set(reviewed), {"2026-11-03", "2026-11-05"})
        self.assertTrue(all(e["bill"] == key and "negatived" in e["basis"] for e in reviewed.values()))
        self.assertFalse(any(r.get("negatived") for r in self.doc(key)["key_dates"] if r.get("source") == "hansard"))

    def test_a_newer_export_retires_overlay_rows_and_never_duplicates_royal_assent(self):
        self.run_overlay()
        assent_key = self.assented[0]
        reading_key = next(k for k, *_ in sorted(self.plan) if k != assent_key)
        head = {k: self.doc(k) for k in (assent_key, reading_key)}
        made = next(r["date"] for r in head[assent_key]["key_dates"] if r.get("source") == "frl")
        parlinfo = ("https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;"
                    f"query=Id%3A%22legislation/billhome/{assent_key.rsplit('-', 1)[1]}%22")

        def full_export(assent_day: str, generated_at: str):
            """ParlInfo is back: its own copies, its own assent row (with a house), a new export day."""
            for key in head:
                doc = json.loads(self.before[f"{key}.json"])
                if key == assent_key:
                    doc["key_dates"].append({"stage": "royal_assent", "date": assent_day, "house": "senate", "url": parlinfo})
                    doc["status"], doc["status_as_of"] = "passed", assent_day
                (self.bills / f"{key}.json").write_text(eb.same_layout(self.before[f"{key}.json"].decode(), doc))
            index = json.loads(self.before["index.json"])
            index["generated_at"] = generated_at
            (self.bills / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")

        for assent_day, generated_at, retires in ((made, self.index["generated_at"], False),
                                                  (made, "2026-12-01T16:00:00+00:00", True),
                                                  (f"{made[:8]}{int(made[8:]) - 1:02d}", "2026-12-01T16:00:00+00:00", True)):
            with self.subTest(assent_day=assent_day, generated_at=generated_at):
                full_export(assent_day, generated_at)
                result = self.run_overlay(head)
                doc = self.doc(assent_key)
                assent = [r for r in doc["key_dates"] if r["stage"] == "royal_assent"]
                self.assertEqual([(r["date"], r["house"]) for r in assent], [(assent_day, "senate")])
                self.assertEqual(len([a for a in doc["acts"] if a["frl_uri"].endswith(head[assent_key]["acts"][-1]["frl_uri"][-11:])]),
                                 1 if not retires else 0)
                readings = [r for r in self.doc(reading_key)["key_dates"] if r.get("source") == "hansard"]
                self.assertEqual(bool(readings), not retires)
                self.assertGreater(result["summary"]["rows_retired"], 0)
                cutoff = generated_at[:10]
                for key in head:
                    self.assertEqual(bills_guard.regressions(head[key], self.doc(key), cutoff=cutoff), [], key)
                if retires:  # the allowance is what lets them go, and only for rows the export's day covers
                    self.assertTrue(bills_guard.regressions(head[reading_key], self.doc(reading_key)))
                    self.assertTrue(bills_guard.regressions(head[reading_key], self.doc(reading_key), cutoff=self.snapshot))

    def test_heading_stage_reads_only_the_last_segment(self):
        self.assertEqual(H.heading_stage("Example Bill 2026; Second Reading"), "second_reading")
        self.assertEqual(H.heading_stage("Introduction and First Reading"), "introduced")
        self.assertEqual(H.heading_stage("Third Reading"), "third_reading")
        self.assertIsNone(H.heading_stage("Second Reading; Consideration in Detail"))
        self.assertIsNone(H.heading_stage("BILLS"))
        self.assertEqual(H.sydney_day("2026-11-16T16:20:00Z"), "2026-11-17")


if __name__ == "__main__":
    unittest.main()
