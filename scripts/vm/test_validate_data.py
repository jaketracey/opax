#!/usr/bin/env python3
"""Tests for the data groups in validate_data.py, run against a throwaway git repo.

    python3 -m unittest scripts/vm/test_validate_data.py -v

The repo mirrors the paths under portal/public that the groups read, with small documents that
have the real files' shape. validate_data.ROOT is pointed at it, so `git show HEAD:...`,
`git ls-tree` and `git status` all see the temp repo. The bills/votes/corpus/wrangler groups are
not covered here; scripts/vm/test_nightly.sh exercises them.
"""
import contextlib
import copy
import importlib.util
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPT = Path(__file__).resolve().parent / "validate_data.py"
spec = importlib.util.spec_from_file_location("validate_data_under_test", SCRIPT)
vd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vd)

P = "portal/public"
GROUPS = ["money", "grants", "suppliers", "access", "expenses", "interests", "fits", "speakers", "people", "pay",
          "discovery", "taxcharity"]
N = 20  # size of the small arrays; 80% of it is 16, 90% is 18, 95% is 19


def rows(n, prefix="r"):
    return [{"id": f"{prefix}{i}"} for i in range(n)]


def objs(n, prefix="k"):
    return {f"{prefix}{i}": {"v": i} for i in range(n)}


def fixture() -> dict:
    """Every file the new groups read, keyed by repo-relative path."""
    f = {}
    for jur in ("", ".qld", ".vic", ".tas"):
        f[f"{P}/graph/money{jur}.json"] = {"meta": {"generated": "2026-09-21"}, "nodes": rows(N), "edges": rows(N)}
    keys = [f"go{i}" for i in range(N)]
    f[f"{P}/graph/grants.federal.json"] = {
        "meta": {"shards": 10, "generated": "2026-09-21T00:00:00Z"}, "agencies": rows(N), "recipients": rows(N),
        "programs": [{"id": k.upper(), "key": k} for k in keys]}
    for i in range(10):
        f[f"{P}/grants/federal/shard-{i:02d}.json"] = {f"abn-{i}": {"n": i}}
    for k in keys:
        f[f"{P}/grants/federal/programs/{k}.json"] = {"id": k.upper(), "key": k}
    f[f"{P}/grants/program-notes.json"] = {"programs": {"federal": {"GO0": {"name": "a"}, "GO7": {"name": "b"}},
                                                          "qld": {"QLD-NOT-IN-FEDERAL-INDEX": {"name": "c"}}}}
    f[f"{P}/suppliers.json"] = {"meta": {"supplier_count": 100}, "suppliers": rows(100)}
    f[f"{P}/agencies.json"] = {"meta": {"agency_count": N}, "agencies": rows(N)}
    for i in range(N):
        f[f"{P}/suppliers/{i:02x}.json"] = {"profiles": {f"s-{i}": {"n": i}}}
        f[f"{P}/agencies/a-{i:04x}.json"] = {"id": f"a-{i:04x}", "total": 1.5}
    f[f"{P}/access.json"] = {"meta": {"generated": "d"}, "donors": objs(N), "ministers": objs(N), "aliases": objs(N)}
    f[f"{P}/expenses.json"] = {"meta": {"rows": 1000, "generated": "d"}, "names": objs(N), "people": objs(N)}
    people = {**{str(10000 + i): {"name": f"P{i}", "total": 3} for i in range(10)},
              **{f"n-p{i}": {"name": f"N{i}", "total": 2} for i in range(10)}}
    by_name = {v["name"].lower(): k for k, v in people.items()}
    f[f"{P}/interests/index.json"] = {"_meta": {"people": N}, "_by_name": by_name, "people": people}
    for pid in people:
        f[f"{P}/interests/{pid}.json"] = {"name": people[pid]["name"], "buckets": {"a": [1]}}
    f[f"{P}/interests/recent.json"] = {"meta": {}, "items": rows(3)}
    f[f"{P}/interests/ties-by-donor.json"] = {"meta": {}, "donors": objs(3)}
    f[f"{P}/fits.json"] = {"meta": {"generated": "d"}, "by_entity": objs(N), "people": objs(N)}
    f[f"{P}/speakers.json"] = [[f"S{i}", 100 - i] for i in range(100)]
    f[f"{P}/parliamentarians.json"] = {"meta": {"people": N}, "people": rows(N)}
    f[f"{P}/pay.json"] = {"meta": {"generated": "d"}, "base": rows(N), "offices": objs(N), "current": rows(N),
                          "names": objs(N), "people": objs(N)}
    f[f"{P}/discovery.json"] = {"signals": rows(N), "coverage": {"a": 1}, "methodology": ["m"] * N,
                                "generated_at": "2026-09-21T00:00:00+00:00", "export_seconds": 1.2}
    tc = f"{P}/entities/tax-charity"
    f[f"{tc}/index.json"] = {"meta": {"caveats": {"ais": "a"}, "sources": {"ais": {}},
                                        "counts": {"abns_written": 1000, "charity": 800, "ais": 700, "ato": 300,
                                                   "register_rows": 5000}}}
    f[f"{tc}/names.json"] = {"by_name": objs(N)}
    for i in range(100):
        f[f"{tc}/{i:02d}.json"] = {f"{i:02d}0000000{i:02d}": {"a": [], "c": {"n": "x"}}}
    return f


ENV = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
ENV.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        env = mock.patch.dict(os.environ, ENV, clear=True)
        env.start()
        self.addCleanup(env.stop)
        self.files = fixture()
        self.make()

    def make(self, head=None):
        """(Re)build the repo: write every fixture file, commit those in `head` (default: all)."""
        self.root = Path(self._tmp.name) / "repo"
        if self.root.exists():
            subprocess.run(["rm", "-rf", str(self.root)], check=True)
        self.root.mkdir()
        self.git("init", "-q")
        for rel, doc in self.files.items():
            self.write(rel, doc)
        keep = [r for r in self.files if head is None or r in head]
        self.git("add", "--", *keep)
        self.git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false",
                 "commit", "-q", "--allow-empty", "-m", "fixture")
        patcher = mock.patch.object(vd, "ROOT", self.root)
        patcher.start()
        self.addCleanup(patcher.stop)

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)

    def write(self, rel, doc):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(doc if isinstance(doc, bytes) else json.dumps(doc).encode())

    def load(self, rel):
        return json.loads((self.root / rel).read_text())

    def edit(self, rel, fn):
        doc = self.load(rel)
        fn(doc)
        self.write(rel, doc)

    def errs(self, group):
        return vd.CHECKS[group]()

    def assertOk(self, group):
        self.assertEqual(self.errs(group), [], group)

    def assertFails(self, group, needle):
        errs = self.errs(group)
        self.assertTrue(errs, f"{group} passed but should have failed on {needle!r}")
        self.assertTrue(any(needle in e for e in errs), f"{needle!r} not in {errs}")


def truncate(doc, path, keep):
    """Cut the array or object at a dotted path to its first `keep` entries."""
    *parents, last = path.split(".") if path else [""]
    node = doc
    for part in parents:
        node = node[part]
    if not path:
        del doc[keep:]
    elif isinstance(node[last], list):
        node[last] = node[last][:keep]
    else:
        node[last] = dict(list(node[last].items())[:keep])


class EveryGroupTests(Base):
    # group -> (file, key to drop, path to truncate, entries to keep in a 20-entry structure at the tolerance)
    SINGLE = {
        "money": (f"{P}/graph/money.json", "edges", "nodes", 16),
        "access": (f"{P}/access.json", "ministers", "donors", 16),
        "expenses": (f"{P}/expenses.json", "names", "people", 19),
        "fits": (f"{P}/fits.json", "by_entity", "by_entity", 16),
        "people": (f"{P}/parliamentarians.json", "meta", "people", 19),
        "pay": (f"{P}/pay.json", "offices", "current", 16),
        "discovery": (f"{P}/discovery.json", "generated_at", "signals", 16),
        "speakers": (f"{P}/speakers.json", None, "", 95),
        "suppliers": (f"{P}/suppliers.json", "meta", "suppliers", 95),
        "grants": (f"{P}/graph/grants.federal.json", "recipients", "recipients", 16),
    }

    def test_identical_committed_data_passes(self):
        for g in GROUPS:
            with self.subTest(g):
                self.assertOk(g)

    def test_group_registry_has_every_group(self):
        for g in GROUPS:
            self.assertIn(g, vd.CHECKS)
        registry = (SCRIPT.parent / "data_groups.sh").read_text()
        groups = re.search(r"^DATA_GROUPS=\(([^)]+)\)", registry, re.M).group(1).split()
        self.assertEqual(list(vd.CHECKS), groups)

    def test_truncated_below_tolerance_fails_and_at_tolerance_passes(self):
        for g, (rel, _, path, keep) in self.SINGLE.items():
            with self.subTest(g):
                self.edit(rel, lambda d: truncate(d, path, keep))
                if g == "suppliers":
                    self.edit(rel, lambda d: d["meta"].update(supplier_count=len(d["suppliers"])))
                if g == "people":
                    self.edit(rel, lambda d: d["meta"].update(people=len(d["people"])))
                self.assertOk(g)  # exactly at the tolerance is fine
                self.edit(rel, lambda d: truncate(d, path, keep - 1))
                self.assertFails(g, "fell from")
                self.git("checkout", "-q", "--", rel)

    def test_growth_passes(self):
        def grow(d, path):
            *parents, last = path.split(".") if path else [""]
            node = d
            for part in parents:
                node = node[part]
            if not path:
                d.extend([["extra", 1]] * 50)
            elif isinstance(node[last], list):
                node[last] = node[last] + rows(50, "new")
            else:
                node[last] = {**node[last], **objs(50, "new")}

        for g, (rel, _, path, _) in self.SINGLE.items():
            with self.subTest(g):
                self.edit(rel, lambda d: grow(d, path))
                self.assertOk(g)
                self.git("checkout", "-q", "--", rel)

    def test_unparseable_json_fails(self):
        for g, (rel, *_rest) in self.SINGLE.items():
            with self.subTest(g):
                self.write(rel, b'{"truncated": [1, 2,')
                self.assertFails(g, "unreadable")
                self.git("checkout", "-q", "--", rel)

    def test_empty_file_and_empty_document_fail(self):
        for g, (rel, *_rest) in self.SINGLE.items():
            for body in (b"", b"{}", b"[]", b"null"):
                with self.subTest(g, body=body):
                    self.write(rel, body)
                    self.assertTrue(self.errs(g))
                    self.git("checkout", "-q", "--", rel)

    def test_dropped_required_key_fails(self):
        for g, (rel, key, *_rest) in self.SINGLE.items():
            if key is None:
                continue
            with self.subTest(g):
                self.edit(rel, lambda d: d.pop(key))
                self.assertTrue(any(f"lacks {key!r}" in e or "not an array" in e for e in self.errs(g)), self.errs(g))
                self.git("checkout", "-q", "--", rel)

    def test_deleted_file_fails(self):
        for g, (rel, *_rest) in self.SINGLE.items():
            with self.subTest(g):
                (self.root / rel).unlink()
                self.assertFails(g, "deleted")
                self.git("checkout", "-q", "--", rel)

    def test_file_absent_from_head_gets_only_the_absolute_checks(self):
        rels = [v[0] for v in self.SINGLE.values()]
        self.files = fixture()
        for rel in rels:
            # a document far smaller than the fixture would trip the ratio if HEAD had it
            self.files[rel] = truncate_copy(self.files[rel])
        self.make(head=[r for r in self.files if r not in rels])
        for g in self.SINGLE:
            with self.subTest(g):
                self.assertOk(g)

    def test_file_absent_from_head_is_still_checked_for_shape(self):
        rel = f"{P}/access.json"
        self.make(head=[r for r in self.files if r != rel])
        self.edit(rel, lambda d: d.pop("donors"))
        self.assertFails("access", "lacks 'donors'")
        self.edit(rel, lambda d: d.update(donors={}, ministers={}, aliases={}, meta={"generated": "d"}))
        self.assertFails("access", "donors is empty")


def truncate_copy(doc):
    doc = copy.deepcopy(doc)
    for path in ("nodes", "edges", "donors", "ministers", "people", "names", "by_entity", "current", "suppliers",
                 "recipients", "signals", "methodology", "aliases", "base", "offices"):
        if isinstance(doc, dict) and isinstance(doc.get(path), (list, dict)) and len(doc[path]) > 3:
            truncate(doc, path, 3)
    if isinstance(doc, list):
        del doc[3:]
    return doc


class MoneyTests(Base):
    def test_state_files_are_optional_when_neither_head_nor_disk_has_them(self):
        rels = [f"{P}/graph/money.{j}.json" for j in ("qld", "vic", "tas")]
        self.make(head=[r for r in self.files if r not in rels])
        for r in rels:
            (self.root / r).unlink()
        self.assertOk("money")

    def test_state_file_that_head_has_must_still_exist(self):
        (self.root / f"{P}/graph/money.vic.json").unlink()
        self.assertFails("money", "money.vic.json deleted")

    def test_state_file_present_but_broken_fails_even_though_optional(self):
        rel = f"{P}/graph/money.tas.json"
        self.make(head=[r for r in self.files if r != rel])
        self.write(rel, b"not json")
        self.assertFails("money", "money.tas.json unreadable")

    def test_new_state_file_is_accepted_and_checked_absolutely(self):
        rel = f"{P}/graph/money.qld.json"
        self.make(head=[r for r in self.files if r != rel])
        self.assertOk("money")
        self.edit(rel, lambda d: d.update(nodes=[]))
        self.assertFails("money", "nodes is empty")

    def test_each_state_file_is_held_to_its_own_head(self):
        self.edit(f"{P}/graph/money.qld.json", lambda d: truncate(d, "edges", 10))
        self.assertFails("money", "money.qld.json edges fell from 20 to 10")
        self.assertEqual(len(self.errs("money")), 1, "only the shrunken file should be flagged")

    def test_missing_money_json_that_head_lacks_is_an_error(self):
        rel = f"{P}/graph/money.json"
        self.make(head=[r for r in self.files if r != rel])
        (self.root / rel).unlink()
        self.assertFails("money", "money.json missing")


class SuppliersTests(Base):
    def test_supplier_count_meta_is_held_to_the_same_ratio(self):
        self.edit(f"{P}/suppliers.json", lambda d: d["meta"].update(supplier_count=94))
        self.assertFails("suppliers", "supplier_count fell from 100 to 94")
        self.edit(f"{P}/suppliers.json", lambda d: d["meta"].update(supplier_count=95))
        self.assertOk("suppliers")

    def test_agencies_json_is_checked(self):
        self.edit(f"{P}/agencies.json", lambda d: truncate(d, "agencies", 17))
        self.assertFails("suppliers", "agencies.json agencies fell from 20 to 17")
        self.edit(f"{P}/agencies.json", lambda d: d.pop("meta"))
        self.assertFails("suppliers", "lacks 'meta'")

    def test_shard_count_under_ninety_percent_fails(self):
        for i in (0, 1):
            (self.root / f"{P}/suppliers/{i:02x}.json").unlink()
        self.assertOk("suppliers")  # 18 of 20 is exactly 90%
        (self.root / f"{P}/suppliers/02.json").unlink()
        self.assertFails("suppliers", "suppliers/ file count fell from 20 to 17")

    def test_agency_shard_count_under_ninety_percent_fails(self):
        for i in range(3):
            (self.root / f"{P}/agencies/a-{i:04x}.json").unlink()
        self.assertFails("suppliers", "agencies/ file count fell from 20 to 17")

    def test_changed_shard_that_does_not_parse_fails(self):
        self.write(f"{P}/suppliers/05.json", b'{"profiles": {"s-1":')
        self.assertFails("suppliers", "suppliers/05.json unreadable")

    def test_changed_agency_shard_that_does_not_parse_fails(self):
        self.write(f"{P}/agencies/a-0003.json", b"")
        self.assertFails("suppliers", "a-0003.json unreadable")

    def test_new_untracked_shard_is_parsed_too(self):
        self.write(f"{P}/suppliers/ff.json", b"garbage")
        self.assertFails("suppliers", "suppliers/ff.json unreadable")
        self.write(f"{P}/suppliers/ff.json", {"profiles": {"s-9": {}}})
        self.assertOk("suppliers")

    def test_changed_shard_with_no_content_fails(self):
        self.write(f"{P}/suppliers/06.json", {})
        self.assertFails("suppliers", "suppliers/06.json is empty")

    def test_files_that_are_not_shards_are_ignored(self):
        self.write(f"{P}/suppliers/notes.txt", b"not json")
        self.write(f"{P}/suppliers/README.json", b"not json")
        self.assertOk("suppliers")

    def test_shard_growth_passes(self):
        for i in range(0x14, 0x30):
            self.write(f"{P}/suppliers/{i:02x}.json", {"profiles": {f"s-{i}": {}}})
        self.assertOk("suppliers")

    def test_many_bad_shards_report_a_bounded_number_of_errors(self):
        for i in range(N):
            self.write(f"{P}/suppliers/{i:02x}.json", b"x")
        self.assertLessEqual(len(self.errs("suppliers")), 12)


class SpeakersTests(Base):
    def test_speakers_must_be_at_least_95_percent(self):
        self.write(f"{P}/speakers.json", self.load(f"{P}/speakers.json")[:95])
        self.assertOk("speakers")
        self.write(f"{P}/speakers.json", self.load(f"{P}/speakers.json")[:94])
        self.assertFails("speakers", "speakers.json rows fell from 100 to 94")

    def test_empty_array_fails(self):
        self.write(f"{P}/speakers.json", [])
        self.assertFails("speakers", "is empty")

    def test_scalar_document_is_rejected(self):
        self.write(f"{P}/speakers.json", b"42")
        self.assertTrue(self.errs("speakers"))
        self.write(f"{P}/speakers.json", b'"text"')
        self.assertFails("speakers", "not an array, object or count")


class TaxCharityTests(Base):
    TC = f"{P}/entities/tax-charity"

    def test_counts_held_to_ninety_percent(self):
        self.edit(f"{self.TC}/index.json", lambda d: d["meta"]["counts"].update(abns_written=900))
        self.assertOk("taxcharity")
        self.edit(f"{self.TC}/index.json", lambda d: d["meta"]["counts"].update(abns_written=899))
        self.assertFails("taxcharity", "abns_written fell from 1,000 to 899")

    def test_zero_count_fails(self):
        self.edit(f"{self.TC}/index.json", lambda d: d["meta"]["counts"].update(ato=0))
        self.assertFails("taxcharity", "counts.ato is empty")

    def test_missing_caveats_fails(self):
        self.edit(f"{self.TC}/index.json", lambda d: d["meta"].pop("caveats"))
        self.assertFails("taxcharity", "lacks 'meta.caveats'")

    def test_names_file_must_keep_its_names(self):
        self.edit(f"{self.TC}/names.json", lambda d: truncate(d, "by_name", 17))
        self.assertFails("taxcharity", "by_name fell from 20 to 17")

    def test_shard_files_below_ninety_percent_fail(self):
        for i in range(10, 20):
            (self.root / self.TC / f"{i:02d}.json").unlink()
        self.assertOk("taxcharity")   # exactly 90% of HEAD's shards is still fine
        (self.root / self.TC / "20.json").unlink()
        self.assertFails("taxcharity", "file count fell from 100 to 89")

    def test_changed_shard_that_does_not_parse_fails(self):
        self.write(f"{self.TC}/42.json", b"{oops")
        self.assertFails("taxcharity", "unreadable")

    def test_index_and_names_are_not_counted_as_shards(self):
        for i in range(100):
            (self.root / self.TC / f"{i:02d}.json").unlink()
        self.assertFails("taxcharity", "has no files matching")


class InterestsTests(Base):
    def test_index_that_lists_a_person_without_a_file_fails(self):
        (self.root / f"{P}/interests/10003.json").unlink()
        self.assertFails("interests", "index lists 10003 but 10003.json is missing")

    def test_changed_person_file_that_does_not_parse_fails(self):
        self.write(f"{P}/interests/n-p4.json", b'{"name": "N4", ')
        self.assertFails("interests", "interests/n-p4.json unreadable")

    def test_changed_numeric_person_file_that_does_not_parse_fails(self):
        self.write(f"{P}/interests/10001.json", b"")
        self.assertFails("interests", "interests/10001.json unreadable")

    def test_index_shrinking_under_ninety_percent_fails(self):
        def cut(d, keep):
            d["people"] = dict(list(d["people"].items())[:keep])
        self.edit(f"{P}/interests/index.json", lambda d: cut(d, 18))
        self.assertOk("interests")
        self.edit(f"{P}/interests/index.json", lambda d: cut(d, 17))
        self.assertFails("interests", "people fell from 20 to 17")

    def test_index_key_dropped_fails(self):
        self.edit(f"{P}/interests/index.json", lambda d: d.pop("_by_name"))
        self.assertFails("interests", "lacks '_by_name'")

    def test_broken_index_stops_early_without_a_traceback(self):
        self.write(f"{P}/interests/index.json", b"{")
        self.assertEqual(len(self.errs("interests")), 1)

    def test_person_files_deleted_below_ninety_percent_fail(self):
        for pid in ("10000", "10001", "10002"):
            (self.root / f"{P}/interests/{pid}.json").unlink()
        self.assertTrue(any("file count fell" in e for e in self.errs("interests")))

    def test_recent_and_ties_files_are_parsed_when_changed(self):
        self.write(f"{P}/interests/recent.json", b"[")
        self.assertFails("interests", "interests/recent.json unreadable")

    def test_new_person_with_good_file_passes(self):
        self.write(f"{P}/interests/n-new.json", {"name": "New", "buckets": {}})
        self.assertOk("interests")


class GrantsTests(Base):
    FED = f"{P}/grants/federal"
    IDX = f"{P}/graph/grants.federal.json"

    def test_changed_shard_that_does_not_parse_fails(self):
        self.write(f"{self.FED}/shard-03.json", b"{")
        self.assertFails("grants", "shard-03.json unreadable")

    def test_changed_program_file_that_does_not_parse_fails(self):
        self.write(f"{self.FED}/programs/go4.json", b"")
        self.assertFails("grants", "programs/go4.json unreadable")

    def test_shard_files_below_ninety_percent_fail(self):
        (self.root / f"{self.FED}/shard-00.json").unlink()
        self.assertFails("grants", "says 10 shards but")  # 9 of 10 is exactly 90%, but meta.shards disagrees
        self.edit(self.IDX, lambda d: d["meta"].update(shards=9))
        self.assertOk("grants")
        (self.root / f"{self.FED}/shard-01.json").unlink()
        self.assertFails("grants", "grants/federal/ file count fell from 10 to 8")

    def test_meta_shards_must_match_the_files(self):
        self.edit(self.IDX, lambda d: d["meta"].update(shards=12))
        self.assertFails("grants", "says 12 shards but")

    def test_listed_program_without_a_file_fails(self):
        (self.root / f"{self.FED}/programs/go5.json").unlink()
        self.assertFails("grants", "programs/go5.json is missing")

    def test_extra_program_files_are_harmless(self):
        self.write(f"{self.FED}/programs/stale.json", {"id": "x"})
        self.assertOk("grants")

    def test_program_notes_rule_a_named_federal_program_must_stay_in_the_index(self):
        def drop(d):
            d["programs"] = [p for p in d["programs"] if p["id"] != "GO7"]
        self.edit(self.IDX, drop)
        self.assertFails("grants", "program-notes.json names federal programs missing")
        self.assertTrue(any("GO7" in e for e in self.errs("grants")))

    def test_program_notes_rule_ignores_other_jurisdictions_and_other_programs(self):
        def drop(d):
            d["programs"] = [p for p in d["programs"] if p["id"] not in ("GO3", "GO4")]
        self.edit(self.IDX, drop)
        self.edit(self.IDX, lambda d: d["meta"].update(shards=10))
        self.assertFalse(any("program-notes" in e for e in self.errs("grants")))

    def test_absent_or_broken_notes_file_is_not_this_groups_problem(self):
        (self.root / f"{P}/grants/program-notes.json").unlink()
        self.assertOk("grants")
        self.write(f"{P}/grants/program-notes.json", b"{")
        self.assertOk("grants")

    def test_index_that_loses_programs_fails(self):
        self.edit(self.IDX, lambda d: truncate(d, "programs", 15))
        self.assertTrue(any("programs fell from 20 to 15" in e for e in self.errs("grants")))

    def test_growth_of_programs_and_shards_passes(self):
        def grow(d):
            d["programs"] += [{"id": f"GOX{i}", "key": f"gox{i}"} for i in range(5)]
            d["meta"]["shards"] = 12
        self.edit(self.IDX, grow)
        for i in range(5):
            self.write(f"{self.FED}/programs/gox{i}.json", {"id": f"GOX{i}"})
        for i in (10, 11):
            self.write(f"{self.FED}/shard-{i}.json", {"abn-x": {}})
        self.assertOk("grants")

    def test_program_without_a_key_fails(self):
        self.edit(self.IDX, lambda d: d["programs"].append({"id": "GO99"}))
        self.assertFails("grants", "index lists program GO99")


class CommandLineTests(Base):
    def run_main(self, *groups):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(sys, "argv", ["validate_data.py", *groups]):
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                rc = vd.main()
        return rc, out.getvalue(), err.getvalue()

    def test_all_good_prints_ok_lines_and_exits_zero(self):
        rc, out, _ = self.run_main("money", "grants", "speakers")
        self.assertEqual(rc, 0)
        self.assertEqual(out.splitlines(), ["ok   money", "ok   grants", "ok   speakers"])

    def test_exit_status_is_the_number_of_failing_groups(self):
        self.edit(f"{P}/graph/money.json", lambda d: truncate(d, "nodes", 5))
        self.write(f"{P}/speakers.json", b"[")
        rc, out, _ = self.run_main("money", "fits", "speakers")
        self.assertEqual(rc, 2)
        lines = out.splitlines()
        self.assertTrue(lines[0].startswith("FAIL money: "), lines)
        self.assertIn("nodes fell from 20 to 5", lines[0])
        self.assertEqual(lines[1], "ok   fits")
        self.assertTrue(lines[2].startswith("FAIL speakers: "), lines)

    def test_unknown_group_is_refused(self):
        rc, out, err = self.run_main("nope")
        self.assertEqual((rc, out), (64, ""))
        self.assertIn("money", err)

    def test_all_new_groups_run_in_one_call(self):
        rc, out, _ = self.run_main(*GROUPS)
        self.assertEqual((rc, len(out.splitlines())), (0, len(GROUPS)))


class RealTreeTests(unittest.TestCase):
    """The default ROOT is still this repo, and the committed data passes."""

    def test_default_root_is_the_repo(self):
        self.assertEqual(vd.ROOT, Path(__file__).resolve().parents[2])

    @unittest.skipUnless((vd.ROOT / P / "graph" / "money.json").exists(), "no portal data in this checkout")
    def test_committed_data_passes_every_new_group(self):
        # pathspec * crosses directories, so this is every JSON file under portal/public
        dirty = subprocess.run(["git", "status", "--porcelain", "--", f"{P}/*.json"], cwd=vd.ROOT,
                               capture_output=True, text=True)
        if dirty.returncode != 0 or dirty.stdout.strip():
            self.skipTest("working tree has uncommitted data changes; this test is for clean checkouts")
        for g in GROUPS:
            with self.subTest(g):
                self.assertEqual(vd.CHECKS[g](), [])


if __name__ == "__main__":
    unittest.main()
