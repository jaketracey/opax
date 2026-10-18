"""scripts/roster_overlay.py: a re-export never changes, adds or drops a shipped roster row.

    python3 -m unittest scripts.test_roster_overlay
"""
import copy
import json
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
