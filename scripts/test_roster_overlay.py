"""scripts/roster_overlay.py: a re-export never changes, adds or drops a shipped roster row.

    python3 -m unittest scripts.test_roster_overlay
"""
import copy
import json
import random
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts import roster_accept
from scripts.roster_overlay import overlay, summary

ROOT = Path(__file__).resolve().parents[1]


def shipped():
    return {"meta": {"generated": "2026-10-04", "people": 4, "speeches": 50},
            "people": [
                {"name": "Alex Example", "speeches": 20, "party": "Labor", "states": ["sa"], "chambers": ["sa_ha"],
                 "first": 2020, "last": 2024, "representation": []},
                {"name": "Sam Fixture", "speeches": 15, "party": "Liberal", "states": ["federal"], "chambers": ["senate"],
                 "first": 2006, "last": 2007, "pid": "90001", "representation": []},
                {"name": "Fixture", "party": "LNP", "full": "Jo Fixture", "states": ["qld"], "chambers": ["qld_la"],
                 "speech_scope": {"state": "qld", "chamber": "qld_la", "service": [[2024, 2026]]},
                 "speech_count_basis": "pending", "transcript": {"speeches": 30}},
                {"name": "Kim Sample", "speeches": 9, "party": "Greens", "states": ["federal"], "chambers": ["senate"],
                 "first": 2019, "last": 2026, "pid": "90002", "current": True, "prints": ["Sample"]},
            ]}


def box_export():
    """What the 18 Oct box export did to such a roster, in miniature."""
    doc = copy.deepcopy(shipped())
    doc["meta"] = {"generated": "2026-10-18", "people": 5, "speeches": 70}
    alex, sam, scoped, kim = doc["people"]
    del alex["party"]                                       # a pinned party lost
    scoped["speeches"] = 30; del scoped["speech_count_basis"]  # a pending count published as a number
    kim["speeches"] = 12; kim["last"] = 2026                  # a count moved
    doc["people"] = [alex, scoped, kim,                       # a row gone
                     {"name": "Robin Newcomer", "speeches": 6, "pid": "90003", "current": True},   # rows added
                     {"name": "Lee Former", "speeches": 7, "pid": "90004"}]
    return doc


class OverlayTests(unittest.TestCase):
    def test_every_shipped_row_is_kept_exactly_and_new_rows_are_held(self):
        merged, report = overlay(shipped(), box_export())
        self.assertEqual(merged, shipped())
        self.assertEqual(report["held"], ["Lee Former", "Robin Newcomer"])
        self.assertEqual(report["held_sitting"], ["Robin Newcomer"])
        self.assertEqual(report["dropped"], ["Sam Fixture"])
        self.assertEqual(report["differ"], 3)
        self.assertEqual(report["fields"]["speeches"], 2)

    def test_a_folded_print_is_neither_new_nor_dropped(self):
        before = shipped(); before["people"].append({"name": "Sample", "speeches": 3, "party": "Greens"})
        after = copy.deepcopy(before); after["people"] = [p for p in after["people"] if p["name"] != "Sample"]
        merged, report = overlay(before, after)
        self.assertEqual(merged, before)
        self.assertEqual(report["dropped"], [])

    def test_the_summary_names_held_sitting_members_for_the_nightly_warning(self):
        _, report = overlay(shipped(), box_export())
        line = summary(report)
        self.assertIn("held 2 new row(s): Lee Former, Robin Newcomer", line)
        self.assertIn("1 held row(s) are sitting members: Robin Newcomer", line)
        self.assertIn("kept 1 row(s) the export dropped: Sam Fixture", line)

    def test_the_cli_rewrites_the_export_to_the_shipped_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            ship, export = Path(tmp) / "shipped.json", Path(tmp) / "export.json"
            ship.write_text(json.dumps(shipped(), ensure_ascii=False, separators=(",", ":")) + "\n")
            export.write_text(json.dumps(box_export()))
            r = subprocess.run([sys.executable, str(ROOT / "scripts/roster_overlay.py"), "--directory", str(export),
                                "--shipped", str(ship), "--accept", str(Path(tmp) / "none.json")],
                               capture_output=True, text=True, check=True)
            self.assertEqual(export.read_bytes(), ship.read_bytes())
            self.assertTrue(r.stderr.startswith("ROSTER OVERLAY: kept 4 shipped records"), r.stderr)


if __name__ == "__main__":
    unittest.main()


def accept_list():
    """A review of box_export(): Kim's count rise and Robin's new row accepted; the rest held."""
    return {"evidence": {
                "hansard-growth": {"kind": "corpus", "rule": "growth", "earliest": 2019, "checked": "2026-10-18", "reason": "x"},
                "handbook": {"kind": "identity", "url": "https://handbookapi.aph.gov.au/api/individuals",
                             "checked": "2026-10-18", "reason": "x"}},
            "records": {"Kim Sample": [{"evidence": "hansard-growth", "fields": {"speeches": [9, 12], "last": [2026, 2026]}}]},
            "new": {"Robin Newcomer": {"evidence": "handbook", "url": "https://handbookapi.aph.gov.au/api/individuals",
                                       "checked": "2026-10-18", "phid": "XX1",
                                       "service": {"chamber": "senate", "jurisdiction": "federal", "start": "2026-08-01", "end": None},
                                       "row": copy.deepcopy(NEWCOMER)}}}


NEWCOMER = {"name": "Robin Newcomer", "speeches": 6, "pid": "90003", "current": True, "states": ["federal"],
            "chambers": ["senate"], "first": 2026, "last": 2026}
NO_CURATED = {}  # the fixtures' people are in no reviewed evidence file


class AcceptListTests(unittest.TestCase):
    def export(self):
        doc = box_export()
        doc["people"][3] = dict(NEWCOMER)
        return doc

    def held(self, report):
        return {name: why for name, why in report["accept_held"]}

    def test_only_accepted_values_the_export_still_shows_are_installed(self):
        merged, report = overlay(shipped(), self.export(), accept_list())
        by = {p["name"]: p for p in merged["people"]}
        self.assertEqual(by["Kim Sample"]["speeches"], 12)
        self.assertIn("Robin Newcomer", by)
        self.assertEqual(report["accepted"], 2)
        # everything not accepted is exactly as shipped: the lost party, the pending count, the dropped row
        for p in shipped()["people"]:
            if p["name"] != "Kim Sample":
                self.assertEqual(by[p["name"]], p)
        self.assertEqual(report["held"], ["Lee Former"])
        self.assertEqual(merged["meta"]["people"], 5)
        self.assertEqual(merged["meta"]["speeches"], sum(p.get("speeches") or 0 for p in merged["people"]))
        self.assertEqual([p.get("speeches") or 0 for p in merged["people"]],
                         sorted((p.get("speeches") or 0 for p in merged["people"]), reverse=True))

    def test_a_value_that_moves_again_is_held_and_the_accepted_one_stays(self):
        first, _ = overlay(shipped(), self.export(), accept_list())
        later = self.export()
        later["people"][2]["speeches"] = 14
        later["people"][3]["speeches"] = 7
        merged, report = overlay(first, later, accept_list())
        self.assertEqual(merged, first)
        self.assertEqual(report["accepted"], 0)
        # and before it was ever installed, a moved value installs nothing
        merged, report = overlay(shipped(), later, accept_list())
        self.assertEqual(merged["people"], shipped()["people"])
        self.assertEqual(self.held(report), {"Kim Sample": roster_accept.MOVED, "Robin Newcomer": roster_accept.MOVED})

    def test_a_night_with_nothing_new_installs_the_same_bytes(self):
        first, _ = overlay(shipped(), self.export(), accept_list())
        again, report = overlay(first, self.export(), accept_list())
        self.assertIs(again["meta"], first["meta"])
        self.assertEqual(json.dumps(again, separators=(",", ":")), json.dumps(first, separators=(",", ":")))
        self.assertEqual(report["accepted"], 0)

    def test_revert_restores_the_roster_before_the_list(self):
        merged, _ = overlay(shipped(), self.export(), accept_list())
        key = lambda people: sorted(people, key=lambda p: p["name"])  # noqa: E731
        self.assertEqual(key(roster_accept.revert(merged["people"], accept_list())), key(shipped()["people"]))

    def test_corpus_evidence_cannot_carry_a_fall_an_identity_or_a_new_house(self):
        acc = accept_list()
        ev = acc["evidence"]["hansard-growth"]
        for fields, why in [({"speeches": [9, 8]}, "falls"), ({"party": ["Greens", "Labor"]}, "identity"),
                            ({"chambers": [["senate"], ["senate", "representatives"]]}, "house"),
                            ({"first": [2023, 2001]}, "first year"), ({"last": [2026, 2025]}, "earlier")]:
            with self.subTest(fields=fields):
                self.assertIn(why, roster_accept.corpus_reason("Kim Sample", fields, ev))
        self.assertIsNone(roster_accept.corpus_reason("Kim Sample", {"chambers": [["senate"], ["senate", "senate_committee"]]}, ev))
        self.assertIn("presiding", roster_accept.corpus_reason("Kim Sample", {"speeches": [9, 2]},
                      {"kind": "corpus", "rule": "presiding", "people": {}}))

    # Codex review of 61af7387b, P1 repro 1: an invalid corpus group carrying a party change was installed.
    def test_an_invalid_corpus_group_is_held_and_the_valid_ones_still_apply(self):
        acc = accept_list()
        acc["records"]["Alex Example"] = [{"evidence": "hansard-growth", "fields": {"party": ["Labor", "Greens"]}}]
        export = self.export()
        export["people"][0]["party"] = "Greens"
        merged, report = overlay(shipped(), export, acc)
        by = {p["name"]: p for p in merged["people"]}
        self.assertEqual(by["Alex Example"]["party"], "Labor")
        self.assertIn("corpus evidence fails its rule: identity fields", self.held(report)["Alex Example"])
        self.assertEqual(by["Kim Sample"]["speeches"], 12)          # the valid group beside it still applies
        self.assertIn("Robin Newcomer", by)
        self.assertIn("held 1 reviewed change(s), kept as shipped: corpus evidence fails its rule", summary(report))

    # P1 repro 2: a stale group overwrote a value curated after the review, though validate() saw the conflict.
    def test_a_group_whose_record_was_curated_since_the_review_is_held(self):
        acc = accept_list()
        acc["records"]["Alex Example"] = [{"evidence": "handbook", "fields": {"party": ["Liberal", "Greens"]}}]
        export = self.export()
        export["people"][0]["party"] = "Greens"
        self.assertTrue(any("Alex Example: the shipped record has moved" in p
                            for p in roster_accept.validate(acc, shipped()["people"], NO_CURATED)))
        merged, report = overlay(shipped(), export, acc)          # shipped says Labor: curated since the review
        self.assertEqual({p["name"]: p for p in merged["people"]}["Alex Example"]["party"], "Labor")
        self.assertIn("the shipped record has moved since the review", self.held(report)["Alex Example"])
        # Re-review of d12b8d135, P1: a group may not claim the curated value as one it may replace (`was`)
        acc["records"]["Alex Example"][0]["was"] = {"party": "Labor"}
        merged, report = overlay(shipped(), export, acc)
        self.assertEqual({p["name"]: p for p in merged["people"]}["Alex Example"]["party"], "Labor")
        self.assertEqual(self.held(report)["Alex Example"], "malformed group")

    def test_propose_keeps_installed_groups_and_never_writes_was(self):
        first, _ = overlay(shipped(), self.export(), accept_list())
        acc = accept_list()
        acc["records"]["Alex Example"] = [{"evidence": "handbook", "fields": {"party": ["Labor", "Greens"]}}]
        current = {p["name"]: p for p in first["people"]}
        current["Alex Example"] = dict(current["Alex Example"], party="Liberal")    # curated after the review
        later = self.export()
        later["people"][0]["party"] = "Greens"
        later["people"][2]["speeches"] = 14                                        # Kim moved again
        out, held = roster_accept.propose(roster_accept.revert(list(current.values()), acc), later["people"], acc, current)
        self.assertEqual(out["records"]["Kim Sample"], acc["records"]["Kim Sample"])   # kept exactly, not replaced
        self.assertNotIn("Alex Example", out["records"])
        reasons = {name: why for name, _, why in held}
        self.assertIn("moved again: edit the group and the roster by hand", reasons["Kim Sample"])
        self.assertIn("curated since the review", reasons["Alex Example"])
        self.assertNotIn('"was"', json.dumps(out))

    def test_curated_records_keep_what_they_pin(self):
        base = shipped()["people"]
        rows = {p["name"]: p for p in base}
        rows["Stub"] = {"name": "Stub", "speeches": 30, "states": ["federal"], "chambers": ["senate_committee"],
                        "first": 2025, "last": 2026, "witness_rows": 20, "representation": []}
        handbook = accept_list()["evidence"]
        cases = [("Fixture", {"evidence": "hansard-growth", "fields": {"chambers": [["qld_la"], ["qld_la", "joint_committee"]]}},
                  "pinned witness split"),
                 ("Kim Sample", {"evidence": "handbook", "fields": {"pid": ["90002", "90009"]}}, "folded person"),
                 ("Stub", {"evidence": "handbook", "fields": {"full": [None, "Alex Stub"]}}, "neutral namesake"),
                 ("Alex Example", {"evidence": "handbook", "fields": {"party": ["Labor", None]}}, "removes an identity value"),
                 ("Alex Example", {"evidence": "handbook", "fields": {"party": ["Labor", "Greens"]}}, "pinned in the reviewed"),
                 ("Alex Example", {"fields": {"party": ["Labor", "Greens"]}}, "malformed group")]
        for name, group, why in cases:
            with self.subTest(name=name, why=why):
                curated = {"Alex Example": roster_accept.PARTY_FIELDS} if why == "pinned in the reviewed" else NO_CURATED
                self.assertIn(why, roster_accept.group_problem(name, group, handbook, rows[name], curated))
        # without readable evidence files, an identity group is held (fail closed); a corpus group is judged as usual
        g = {"evidence": "handbook", "fields": {"party": ["Labor", "Greens"]}}
        self.assertIn("cannot be used", roster_accept.group_problem("Alex Example", g, handbook, rows["Alex Example"], None))

    # P2: the new-row validator accepted a committee-only row with no pid, and a matching export installed it.
    def test_a_new_row_must_be_a_complete_parliamentary_identity(self):
        evidence = accept_list()["evidence"]
        entry = accept_list()["new"]["Robin Newcomer"]
        committee = {**entry, "row": {"name": "Casey Witness", "speeches": 9, "states": ["federal"],
                                      "chambers": ["senate_committee"], "first": 2026, "last": 2026}}
        committee.pop("phid")
        self.assertIn("pid", roster_accept.new_row_problem("Casey Witness", committee, evidence))
        committee["phid"] = "XX2"
        self.assertIn("committee-only", roster_accept.new_row_problem("Casey Witness", committee, evidence))
        for change, why in [({"name": "Newcomer"}, "full name"), ({"pid": None}, "pid"), ({"witness_rows": 3}, "witness"),
                            ({"first": 2019}, "outside the evidence's service"), ({"states": ["nsw"]}, "jurisdiction")]:
            with self.subTest(change=change):
                bad = {**entry, "row": {**NEWCOMER, **change}}
                bad.pop("phid")
                name = bad["row"]["name"]
                self.assertIn(why, roster_accept.new_row_problem(name, bad, evidence))
        self.assertIsNone(roster_accept.new_row_problem("Robin Newcomer", entry, evidence))
        # and the overlay does not install it, even when the export matches exactly
        acc = accept_list()
        acc["new"] = {"Casey Witness": committee}
        export = self.export()
        export["people"].append(dict(committee["row"]))
        merged, report = overlay(shipped(), export, acc)
        self.assertNotIn("Casey Witness", {p["name"] for p in merged["people"]})
        self.assertIn("committee-only", self.held(report)["Casey Witness"])

    def test_a_malformed_list_holds_everything_and_one_bad_entry_holds_only_itself(self):
        for broken in ([], {"records": []}, {"records": {}, "new": {}, "evidence": {"x": 1}}):
            with self.subTest(broken=broken):
                merged, report = overlay(shipped(), self.export(), broken)
                self.assertEqual(merged["people"], shipped()["people"])
                self.assertEqual(merged["meta"], shipped()["meta"])
                self.assertTrue(report["accept_blocked"])
                self.assertIn("no reviewed change installed, every one held", summary(report))
        acc = accept_list()
        acc["records"]["Alex Example"] = "not a list"
        merged, report = overlay(shipped(), self.export(), acc)
        self.assertEqual(report["accepted"], 2)
        self.assertEqual(self.held(report)["Alex Example"], "malformed record entry")
        with tempfile.TemporaryDirectory() as tmp:
            ship, export, bad = Path(tmp) / "shipped.json", Path(tmp) / "export.json", Path(tmp) / "accept.json"
            ship.write_text(json.dumps(shipped(), ensure_ascii=False, separators=(",", ":")) + "\n")
            export.write_text(json.dumps(self.export()))
            bad.write_text('{"records": {"Kim Sample": [')
            r = subprocess.run([sys.executable, str(ROOT / "scripts/roster_overlay.py"), "--directory", str(export),
                                "--shipped", str(ship), "--accept", str(bad)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(export.read_bytes(), ship.read_bytes())
            self.assertIn("no reviewed change installed, every one held (scripts/roster_accept.json unreadable", r.stderr)

    # Re-review of d12b8d135, P1: corrupt curated evidence held only identity groups; it now holds everything.
    def test_unusable_curated_evidence_installs_nothing(self):
        def corrupt(text):
            return lambda path: path.write_text(text)
        for rel in roster_accept.CURATED_FILES:
            for label, damage in [("missing", lambda path: path.unlink()), ("truncated", corrupt('{"aliases": {')),
                                  ("wrong shape", corrupt('{"aliases": [], "services": {}}')),
                                  ("wrong types", corrupt('{"service": [{"name": 7}], "services": [{"print": 1, "name": null}]}'))]:
                with self.subTest(file=rel, damage=label), tempfile.TemporaryDirectory() as tmp:
                    for name in roster_accept.CURATED_FILES:
                        (Path(tmp) / name).parent.mkdir(parents=True, exist_ok=True)
                        (Path(tmp) / name).write_bytes((ROOT / name).read_bytes())
                    damage(Path(tmp) / rel)
                    before = json.dumps(shipped(), separators=(",", ":"))
                    merged, report = overlay(shipped(), self.export(), accept_list(), root=Path(tmp))
                    self.assertEqual(merged["people"], shipped()["people"])
                    self.assertEqual(json.dumps({"meta": merged["meta"], "people": merged["people"]}, separators=(",", ":")), before)
                    self.assertEqual(report["accepted"], 0)
                    self.assertIn(rel, report["accept_blocked"])
                    self.assertIn("no reviewed change installed, every one held (" + rel, summary(report))
        self.assertEqual(roster_accept.read_curated(), (roster_accept.curated_names(), None))

    # Re-review of d12b8d135, P2: wrongly typed new-row values raised TypeError and stopped the run.
    def test_wrongly_typed_entries_are_held_never_raised(self):
        wrong = [None, 7, 2.5, True, [], ["x"], "text", {}, {"a": 1}]
        entry_keys = ["evidence", "url", "checked", "phid", "service", "row"]
        row_keys = ["name", "chambers", "states", "first", "last", "speeches", "pid"]
        service_keys = ["chamber", "jurisdiction", "start", "end"]
        group_keys = ["evidence", "fields", "url", "checked"]
        cases = []
        for value in wrong:
            for k in entry_keys:
                cases.append(("new", lambda e, k=k, v=value: e.__setitem__(k, v)))
            for k in row_keys:
                cases.append(("new", lambda e, k=k, v=value: e["row"].__setitem__(k, v)))
            for k in service_keys:
                cases.append(("new", lambda e, k=k, v=value: e["service"].__setitem__(k, v)))
            for k in group_keys:
                cases.append(("group", lambda g, k=k, v=value: g.__setitem__(k, v)))
            cases.append(("group", lambda g, v=value: g["fields"].__setitem__("speeches", v)))
            cases.append(("group", lambda g, v=value: g["fields"].__setitem__("speeches", [9, v])))
            cases.append(("records", lambda r, v=value: r.__setitem__("Kim Sample", v)))
            cases.append(("records", lambda r, v=value: r.__setitem__("Kim Sample", [v])))
            cases.append(("newentry", lambda n, v=value: n.__setitem__("Robin Newcomer", v)))
        # the reviewer's two examples
        cases.append(("new", lambda e: e.__setitem__("evidence", [])))
        cases.append(("new", lambda e: e["row"].__setitem__("chambers", 7)))
        for i, (where, mutate) in enumerate(cases):
            acc = accept_list()
            target = {"new": acc["new"]["Robin Newcomer"], "group": acc["records"]["Kim Sample"][0],
                      "records": acc["records"], "newentry": acc["new"]}[where]
            mutate(target)
            export = self.export()
            row = acc["new"]["Robin Newcomer"].get("row") if isinstance(acc["new"].get("Robin Newcomer"), dict) else None
            if where == "new" and isinstance(row, dict) and row.get("name") == "Robin Newcomer":
                export["people"][3] = row   # the export even matches the bad row
            with self.subTest(case=i, where=where):
                merged, report = overlay(shipped(), export, acc)          # never raises
                summary(report)
                roster_accept.validate(acc, shipped()["people"], NO_CURATED)
                names = {p["name"] for p in merged["people"]}
                broken = "Robin Newcomer" if where in ("new", "newentry") else "Kim Sample"
                if broken in self.held(report):
                    self.assertNotEqual(self.held(report)[broken], roster_accept.MOVED if where == "new" and broken in names else None)
                if where in ("new", "newentry") and broken not in names:
                    self.assertIn(broken, self.held(report))
        for mutate in (lambda e: e.__setitem__("evidence", []), lambda e: e["row"].__setitem__("chambers", 7)):
            acc = accept_list()
            mutate(acc["new"]["Robin Newcomer"])
            with tempfile.TemporaryDirectory() as tmp:
                ship, export, bad = Path(tmp) / "shipped.json", Path(tmp) / "export.json", Path(tmp) / "accept.json"
                ship.write_text(json.dumps(shipped(), ensure_ascii=False, separators=(",", ":")) + "\n")
                doc = self.export()
                doc["people"][3] = acc["new"]["Robin Newcomer"]["row"]
                export.write_text(json.dumps(doc))
                bad.write_text(json.dumps(acc))
                r = subprocess.run([sys.executable, str(ROOT / "scripts/roster_overlay.py"), "--directory", str(export),
                                    "--shipped", str(ship), "--accept", str(bad)], capture_output=True, text=True)
                self.assertEqual(r.returncode, 0, r.stderr)
                self.assertNotIn("Robin Newcomer", {p["name"] for p in json.loads(export.read_text())["people"]})
                self.assertIn("Robin Newcomer", r.stderr.split("held", 1)[1])

    def test_validate_wants_sources_for_identity_and_complete_new_rows(self):
        acc = accept_list()
        acc["records"]["Alex Example"] = [{"evidence": "handbook", "fields": {"party": [None, "Greens"]}}]
        del acc["evidence"]["handbook"]["url"]
        acc["new"]["Newcomer"] = {"evidence": "handbook", "url": "https://x.invalid", "checked": "2026-10-18",
                                  "row": {"name": "Newcomer", "speeches": 6}}
        problems = roster_accept.validate(acc, shipped()["people"], NO_CURATED)
        self.assertTrue(any("Alex Example: identity evidence without a source URL" in p for p in problems), problems)
        self.assertTrue(any("Newcomer: a new row needs a full name" in p for p in problems), problems)
        acc["evidence"]["handbook"]["url"] = "https://handbookapi.aph.gov.au/api/individuals"
        problems = roster_accept.validate(acc, shipped()["people"], NO_CURATED)
        self.assertTrue(any("Alex Example: the shipped record has moved" in p for p in problems), problems)

    def test_the_committed_list_is_valid_and_installed(self):
        people = json.loads((ROOT / "portal/public/parliamentarians.json").read_text())["people"]
        acc = roster_accept.load()
        self.assertEqual(roster_accept.validate(acc, people), [])
        self.assertIsNotNone(roster_accept.curated_names())
        for p in people:
            for g in acc["records"].get(p["name"], []):
                self.assertEqual(roster_accept.state(p, g), "applied", p["name"])


def sandbox(tmp, damage=None):
    """A copy of the overlay's scripts and curated evidence under `tmp`; `damage(path, rel)` may break one file."""
    for rel in ("scripts/roster_overlay.py", "scripts/roster_accept.py", *roster_accept.CURATED_FILES):
        (Path(tmp) / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / rel, Path(tmp) / rel)
        if damage:
            damage(Path(tmp) / rel, rel)
    return Path(tmp)


def run_cli(tmp, shipped_doc, export_doc, accept_doc, root=ROOT):
    ship, export, acc = Path(tmp) / "shipped.json", Path(tmp) / "export.json", Path(tmp) / "accept.json"
    ship.write_text(json.dumps(shipped_doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    export.write_text(json.dumps(export_doc))
    acc.write_text(json.dumps(accept_doc) if not isinstance(accept_doc, str) else accept_doc)
    r = subprocess.run([sys.executable, str(Path(root) / "scripts/roster_overlay.py"), "--directory", str(export),
                        "--shipped", str(ship), "--accept", str(acc)], capture_output=True, text=True)
    return r, export.read_bytes(), ship.read_bytes()


class SingleGateTests(unittest.TestCase):
    """Re-review 3 of 44f0c9170: every group is judged by judge() on the shipped, unmodified record, and apply()
    installs only what validate() passes; the whole accept step fails closed."""

    def dated(self):
        doc = shipped()
        doc["people"][0]["identity_basis"] = "dated party, reviewed"
        return doc

    def export_with(self, doc, **alex):
        export = copy.deepcopy(doc)
        rows = {p["name"]: p for p in export["people"]}
        rows["Alex Example"].update(alex)
        rows["Kim Sample"]["speeches"] = 12
        export["people"].append(copy.deepcopy(NEWCOMER))
        export["meta"] = {"generated": "2026-10-18"}
        return export

    # repro 1: clearing identity_basis in one group let a party change in another group install
    def test_a_group_cannot_clear_the_protection_another_group_needs(self):
        acc = accept_list()
        acc["records"]["Alex Example"] = [
            {"evidence": "handbook", "fields": {"identity_basis": ["dated party, reviewed", ""]}},
            {"evidence": "handbook", "fields": {"party": ["Labor", "Greens"]}}]
        doc = self.dated()
        export = self.export_with(doc, identity_basis="", party="Greens")
        merged, report = overlay(doc, export, acc)
        alex = merged["people"][[p["name"] for p in merged["people"]].index("Alex Example")]
        self.assertEqual((alex["identity_basis"], alex["party"]), ("dated party, reviewed", "Labor"))
        rejected = {(n, i) for n, i, why in roster_accept.validate(acc, doc["people"], detail=True)}
        self.assertEqual({(n, i) for n, i in rejected if n == "Alex Example"}, {("Alex Example", 0), ("Alex Example", 1)})
        self.assertEqual(sum(n == "Alex Example" for n, _ in report["accept_held"]), 2)
        # the order of the groups makes no difference, and nor does a blank instead of a removal
        acc["records"]["Alex Example"].reverse()
        acc["records"]["Alex Example"][1]["fields"]["identity_basis"][1] = None
        merged, _ = overlay(doc, export, acc)
        self.assertEqual(merged["people"][[p["name"] for p in merged["people"]].index("Alex Example")]["party"], "Labor")

    def test_two_groups_on_one_field_hold_both(self):
        acc = accept_list()
        acc["records"]["Kim Sample"].append({"evidence": "hansard-growth", "fields": {"speeches": [9, 12]}})
        merged, report = overlay(shipped(), self.export_with(shipped()), acc)
        self.assertEqual({p["name"]: p for p in merged["people"]}["Kim Sample"]["speeches"], 9)
        self.assertEqual([w for n, w in report["accept_held"] if n == "Kim Sample"],
                         ["two groups touch the same field, so every group on the record is held"] * 2)

    # repro 2: an alias entry whose name is a list crashed the overlay (exit 1)
    def test_a_malformed_alias_entry_holds_everything_and_exits_0(self):
        def damage(path, rel):
            if rel == "scripts/roster_service.json":
                doc = json.loads(path.read_text())
                next(iter(doc["aliases"].values()))["name"] = []
                path.write_text(json.dumps(doc))
        with tempfile.TemporaryDirectory() as tmp:
            root = sandbox(tmp, damage)
            self.assertIn("roster_service.json is malformed", roster_accept.read_curated(root)[1])
            for key in ("aliases", "same_person"):
                doc = json.loads((ROOT / "scripts/roster_service.json").read_text())
                next(iter(doc[key].values()))["name"] = []
                (root / "scripts/roster_service.json").write_text(json.dumps(doc))
                r, out, ship = run_cli(tmp, shipped(), self.export_with(shipped()), accept_list(), root)
                self.assertEqual(r.returncode, 0, r.stderr)
                self.assertEqual(out, ship)
                self.assertIn("no reviewed change installed, every one held (scripts/roster_service.json is malformed", r.stderr)

    # repro 3: prints: 7 on an accepted new row crashed recount() (exit 1)
    def test_a_new_row_with_wrongly_typed_or_disallowed_fields_is_held(self):
        for prints in (7, ["Newcomer"], "Newcomer"):
            with self.subTest(prints=prints), tempfile.TemporaryDirectory() as tmp:
                acc = accept_list()
                acc["new"]["Robin Newcomer"]["row"]["prints"] = prints
                export = box_export()
                export["people"][3] = acc["new"]["Robin Newcomer"]["row"]
                r, out, _ = run_cli(tmp, shipped(), export, acc)
                self.assertEqual(r.returncode, 0, r.stderr)
                self.assertNotIn("Robin Newcomer", {p["name"] for p in json.loads(out)["people"]})
                self.assertIn("a new row may not carry prints", r.stderr)

    def test_any_error_inside_the_accept_step_keeps_the_shipped_roster(self):
        doc = shipped()
        doc["meta"] = "not an object"           # recount() cannot read it, so the step raises
        merged, report = overlay(doc, self.export_with(shipped()), accept_list())
        self.assertEqual((merged["people"], merged["meta"]), (doc["people"], doc["meta"]))
        self.assertEqual(report["accepted"], 0)
        self.assertIn("no reviewed change installed, every one held (the accept step failed (", summary(report))
        with tempfile.TemporaryDirectory() as tmp:
            r, out, ship = run_cli(tmp, doc, self.export_with(shipped()), accept_list())
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(out, ship)

    # property: whatever the list holds, the overlay never raises and installs only what validate() passes
    POOL = [None, 0, 7, -1, 2.5, True, False, "", "x", "Greens", [], [1], ["a", "b"], [None, None], [5, 6],
            [[1], [2]], {}, {"a": 1}, {"speeches": "x"}, ["senate"], ["senate_committee"]]

    def mutate(self, acc, rnd):
        if not isinstance(acc.get("records"), dict):
            return
        groups = [(n, gs) for n, gs in acc["records"].items() if isinstance(gs, list)]
        op = rnd.randrange(7)
        if op == 0:                              # any value anywhere
            node, key = acc, None
            for _ in range(rnd.randrange(1, 6)):
                kids = list(node.items()) if isinstance(node, dict) else list(enumerate(node)) if isinstance(node, list) else []
                if not kids:
                    break
                key, child = rnd.choice(kids)
                if rnd.random() < 0.35 or not isinstance(child, (dict, list)):
                    break
                node = child
            if isinstance(node, (dict, list)) and key is not None:
                try:
                    node[key] = copy.deepcopy(rnd.choice(self.POOL))
                except (IndexError, TypeError):
                    pass
        elif op == 1 and groups:                 # a duplicate or conflicting group
            n, gs = rnd.choice(groups)
            if gs:
                g = copy.deepcopy(rnd.choice(gs))
                if isinstance(g, dict) and isinstance(g.get("fields"), dict) and g["fields"] and rnd.random() < 0.5:
                    f = rnd.choice(list(g["fields"]))
                    if isinstance(g["fields"][f], list) and len(g["fields"][f]) == 2:
                        g["fields"][f][1] = rnd.choice(self.POOL)
                gs.append(g)
        elif op == 2:                            # a protection field edit, alone or beside a party change
            n = rnd.choice(["Alex Example", "Kim Sample", "Fixture", "Sam Fixture"])
            f = rnd.choice(sorted(roster_accept.PROTECTION_FIELDS))
            gs = acc["records"].setdefault(n, [])
            if isinstance(gs, list):
                gs.append({"evidence": "handbook", "fields": {f: [rnd.choice(self.POOL), rnd.choice(self.POOL)]}})
                if rnd.random() < 0.5:
                    gs.append({"evidence": "handbook", "fields": {"party": [rnd.choice(["Labor", None]), "Greens"]}})
        elif op == 3:                            # an identity group on any field
            n = rnd.choice(["Alex Example", "Kim Sample", "Fixture", "Sam Fixture", "Nobody"])
            f = rnd.choice(sorted(roster_accept.FIELD_TYPES | {"name", "speaker_type"}))
            gs = acc["records"].setdefault(n, [])
            if isinstance(gs, list):
                gs.append({"evidence": rnd.choice(["handbook", "hansard-growth", "nope"]),
                           "fields": {f: [rnd.choice(self.POOL), rnd.choice(self.POOL)]}})
        elif op == 4:                            # a key removed
            new = acc.get("new") if isinstance(acc.get("new"), dict) else {}
            target = rnd.choice([acc, new.get("Robin Newcomer"), *(gs[0] for _, gs in groups if gs)])
            if isinstance(target, dict) and target:
                target.pop(rnd.choice(list(target)), None)
        elif op == 5 and groups:                 # a group moved to another record
            n, gs = rnd.choice(groups)
            if gs:
                dest = acc["records"].setdefault(rnd.choice(["Alex Example", "Fixture", "Nobody"]), [])
                if isinstance(dest, list):
                    dest.append(gs.pop())
        elif op == 6:                            # a new row's field
            e = acc["new"].get("Robin Newcomer") if isinstance(acc.get("new"), dict) else None
            if isinstance(e, dict) and isinstance(e.get("row"), dict):
                e["row"][rnd.choice(sorted(roster_accept.NEW_ROW_FIELDS | {"prints", "speech_scope", "witness_rows"}))] = rnd.choice(self.POOL)

    def export_for(self, doc, acc):
        """The export showing every `to` value it can, so only the gate stands between the list and the roster."""
        export = copy.deepcopy(doc)
        export["meta"] = {"generated": "2026-10-18"}
        rows = {p["name"]: p for p in export["people"]}
        for n, gs in (acc.get("records") or {}).items() if isinstance(acc.get("records"), dict) else []:
            for g in gs if isinstance(gs, list) else []:
                fields = g.get("fields") if isinstance(g, dict) else None
                for f, v in (fields.items() if isinstance(fields, dict) else []):
                    if n in rows and isinstance(v, list) and len(v) == 2 and f != "name":
                        if v[1] is None:
                            rows[n].pop(f, None)
                        else:
                            rows[n][f] = copy.deepcopy(v[1])
        for n, e in (acc.get("new") or {}).items() if isinstance(acc.get("new"), dict) else []:
            if isinstance(e, dict) and isinstance(e.get("row"), dict) and e["row"].get("name") == n:
                export["people"].append(copy.deepcopy(e["row"]))
        return export

    def installed_only_what_validate_passes(self, doc, acc, merged):
        problems = roster_accept.validate(acc, doc["people"], detail=True)
        if problems and problems[0][0] == "roster_accept.json":
            self.assertEqual(merged["people"], doc["people"])
            return
        rejected = {(n, i) for n, i, _ in problems}
        before = {p["name"]: p for p in doc["people"]}
        records = acc.get("records", {})
        for p in merged["people"]:
            if p["name"] not in before:
                self.assertIn(p["name"], acc.get("new") or {})
                self.assertNotIn((p["name"], None), rejected, p["name"])
                continue
            old = before[p["name"]]
            for f in p.keys() | old.keys():
                if p.get(f) == old.get(f):
                    continue
                groups = records.get(p["name"]) if isinstance(records.get(p["name"]), list) else []
                sources = [i for i, g in enumerate(groups) if isinstance(g, dict) and isinstance(g.get("fields"), dict)
                           and isinstance(g["fields"].get(f), list) and len(g["fields"][f]) == 2
                           and g["fields"][f][1] == p.get(f) and (p["name"], i) not in rejected]
                self.assertTrue(sources, (p["name"], f, p.get(f)))

    def base(self):
        acc = accept_list()
        acc["records"]["Alex Example"] = [{"evidence": "handbook", "fields": {"party": ["Labor", "Greens"]}},
                                          {"evidence": "hansard-growth", "fields": {"speeches": [20, 25]}}]
        return acc

    def test_random_lists_never_raise_and_install_only_what_validate_passes(self):
        rnd = random.Random(20261018)
        for trial in range(600):
            acc, doc = self.base(), rnd.choice([shipped(), self.dated()])
            for _ in range(rnd.randrange(1, 5)):
                self.mutate(acc, rnd)
            export = self.export_for(doc, acc)
            with self.subTest(trial=trial):
                merged, report = overlay(doc, export, acc)
                summary(report)
                json.dumps(merged)
                self.installed_only_what_validate_passes(doc, acc, merged)
        with tempfile.TemporaryDirectory() as tmp:
            for trial in range(20):
                acc, doc = self.base(), shipped()
                for _ in range(rnd.randrange(1, 5)):
                    self.mutate(acc, rnd)
                r, out, ship = run_cli(tmp, doc, self.export_for(doc, acc), acc)
                with self.subTest(cli=trial):
                    self.assertEqual(r.returncode, 0, r.stderr)
                    self.assertTrue(r.stderr.startswith("ROSTER OVERLAY: "), r.stderr)
                    self.installed_only_what_validate_passes(doc, acc, json.loads(out))
