"""A refresh cannot silently discard published divisions or named vote evidence."""

from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("division_refresh_guard", ROOT / "scripts/export_division_pages.py")
D = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)


def record(key="federal-senate-1", partial=False):
    members = [
        {"name": "Alex Example", "person_id": "1", "person_slug": "alex-example", "vote": "aye"},
        {"name": "Bob Example", "person_id": "2", "person_slug": "bob-example", "vote": "no"},
        {"name": "Cara Example", "person_id": None, "person_slug": "cara-example", "vote": "absent"},
    ]
    return {
        "key": key, "slug": f"division-{key}", "name": "Example division",
        "question": "That the bill be read a second time", "date": "2026-09-01",
        "house": "senate", "jurisdiction": "federal", "ayes": 1, "noes": 1,
        "result": "negative", "source_url": f"https://example.test/{key}",
        "members": members[:1] if partial else members,
        "bills": [{"key": "example-bill", "title": "Example Bill", "url": "/bill/example-bill"}],
        "_meta": {"schema": 1, "member_coverage": "partial" if partial else "recorded", "source": "fixture"},
    }


class DivisionRefreshGuardTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.output = Path(temporary.name) / "divisions"
        self.previous = record()
        self.previous["_meta"].update(member_source_url=self.previous["source_url"], member_source="verified snapshot")
        D.write_projection({self.previous["key"]: self.previous}, self.output)

    def publish(self, candidate, strict=False):
        return D.write_projection({candidate["key"]: candidate}, self.output, strict=strict)[candidate["key"]]

    def snapshot(self):
        return {p.name: p.read_bytes() for p in self.output.glob("*.json")}

    def assertRetained(self, result, reason):
        self.assertEqual(result["members"], self.previous["members"])
        self.assertEqual(result["question"], self.previous["question"])
        self.assertTrue(result["_meta"]["refresh_retained"])
        self.assertEqual(result["_meta"]["refresh_retained_reason"], reason)
        index = json.loads((self.output / "index.json").read_text())
        self.assertEqual(index["coverage"]["retained_count"], 1)
        entry = next(row for row in index["divisions"] if row["key"] == self.previous["key"])
        self.assertEqual(entry["member_count"], 3)
        self.assertTrue(entry["refresh_retained"])
        self.assertEqual(entry["refresh_retained_reason"], reason)

    def test_missing_division_does_not_shrink_set(self):
        other = record("federal-senate-2")
        published = D.write_projection({other["key"]: other}, self.output)
        self.assertEqual(set(published), {self.previous["key"], other["key"]})
        self.assertRetained(published[self.previous["key"]], "missing-division")

    def test_missing_named_members_retains_pinned_record_in_normal_db_mode(self):
        incoming = deepcopy(self.previous)
        incoming["members"] = []
        incoming["_meta"] = {"member_coverage": "unavailable", "source": "parli.db-ext-divisions"}
        self.assertRetained(self.publish(incoming), "member-coverage-regression")

    def test_lost_absent_member_is_a_regression_even_when_tally_matches(self):
        incoming = deepcopy(self.previous)
        incoming["members"] = incoming["members"][:2]
        self.assertRetained(self.publish(incoming), "named-member-count-regression")

    def test_retained_snapshot_can_add_dated_party_facts_without_losing_members(self):
        incoming = deepcopy(self.previous)
        incoming["members"] = incoming["members"][:2]
        incoming["members"][0]["party"] = "Example Party"
        original = deepcopy(incoming)
        result = self.publish(incoming)
        self.assertEqual(len(result["members"]), 3)
        self.assertEqual(result["members"][0]["party"], "Example Party")
        self.assertNotIn("party", result["members"][1])
        self.assertTrue(result["_meta"]["refresh_retained"])
        self.assertEqual(result["_meta"]["party_source"], "parli.db-ext-votes")
        self.assertEqual(incoming, original)

    def test_retained_snapshot_rejects_party_facts_from_changed_date(self):
        incoming = deepcopy(self.previous)
        incoming["date"] = "2026-09-02"
        incoming["members"] = incoming["members"][:2]
        incoming["members"][0]["party"] = "Example Party"
        result = self.publish(incoming)
        self.assertEqual(result["members"], self.previous["members"])

    def test_same_named_count_cannot_replace_a_previous_absent_member(self):
        incoming = deepcopy(self.previous)
        incoming["members"][2].update(name="Dana Example", person_slug="dana-example")
        self.assertRetained(self.publish(incoming), "member-evidence-regression")

    def test_swapped_votes_with_same_tally_are_not_a_valid_refresh(self):
        incoming = deepcopy(self.previous)
        incoming["members"][0]["vote"] = "no"
        incoming["members"][1]["vote"] = "aye"
        self.assertRetained(self.publish(incoming), "member-evidence-regression")

    def test_paired_records_are_protected_even_with_unchanged_count(self):
        old = record("federal-senate-2")
        old["members"][2]["vote"] = "paired"
        D.write_projection({self.previous["key"]: self.previous, old["key"]: old}, self.output)
        incoming = deepcopy(old)
        incoming["members"][2]["vote"] = "absent"
        result = D.write_projection({self.previous["key"]: self.previous, incoming["key"]: incoming}, self.output)
        self.assertEqual(result[old["key"]]["members"], old["members"])
        self.assertEqual(result[old["key"]]["_meta"]["refresh_retained_reason"], "member-evidence-regression")

    def test_less_complete_coverage_cannot_replace_recorded_coverage(self):
        incoming = deepcopy(self.previous)
        incoming["_meta"]["member_coverage"] = "partial"
        self.assertRetained(self.publish(incoming), "member-coverage-regression")

    def test_changed_source_facts_retain_the_complete_previous_record(self):
        for field, value in [("question", "A different question"), ("source_url", "https://other.test"),
                             ("ayes", 2), ("date", None), ("house", "representatives")]:
            with self.subTest(field=field):
                incoming = deepcopy(self.previous)
                incoming[field] = value
                result = self.publish(incoming)
                self.assertRetained(result, "source-facts-changed")
                self.assertEqual(result[field], self.previous[field])

    def test_partial_same_count_cannot_replace_old_named_evidence(self):
        old = record("federal-senate-2", partial=True)
        D.write_projection({self.previous["key"]: self.previous, old["key"]: old}, self.output)
        incoming = deepcopy(old)
        incoming["members"][0].update(name="Dana Example", person_id="4", person_slug="dana-example")
        result = D.write_projection({self.previous["key"]: self.previous, incoming["key"]: incoming}, self.output)
        self.assertEqual(result[old["key"]]["members"], old["members"])
        self.assertEqual(result[old["key"]]["_meta"]["refresh_retained_reason"], "member-evidence-regression")

    def test_partial_snapshot_can_improve_with_a_superset_of_its_votes(self):
        old = record("federal-senate-2", partial=True)
        D.write_projection({self.previous["key"]: self.previous, old["key"]: old}, self.output)
        incoming = record(old["key"])
        result = D.write_projection({self.previous["key"]: self.previous, incoming["key"]: incoming}, self.output)
        self.assertEqual(result[old["key"]]["members"], incoming["members"])
        self.assertFalse(result[old["key"]]["_meta"]["refresh_retained"])
        self.assertEqual(result[old["key"]]["_meta"]["member_coverage"], "recorded")

    def test_valid_enrichment_publishes_new_fields_and_defaults(self):
        incoming = deepcopy(self.previous)
        incoming["members"][2]["person_id"] = "3"
        incoming["bills"].append({"key": "other", "title": "Other Bill", "url": "/bill/other"})
        incoming["_meta"]["source"] = "fresh-db-fixture"
        result = self.publish(incoming)
        self.assertEqual(result["members"][2]["person_id"], "3")
        self.assertEqual(len(result["bills"]), 2)
        self.assertFalse(result["_meta"]["refresh_retained"])
        self.assertIsNone(result["_meta"]["refresh_retained_reason"])
        self.assertEqual(result["_meta"]["member_count"], 3)
        index = json.loads((self.output / "index.json").read_text())
        self.assertEqual(index["coverage"]["retained_count"], 0)
        self.assertEqual(index["coverage"]["source_counts"], {"fresh-db-fixture": 1})

    def test_strict_run_refuses_before_any_publish(self):
        before = self.snapshot()
        new = record("federal-senate-2")
        with self.assertRaisesRegex(D.RefreshDegradationError, "missing-division"):
            D.write_projection({new["key"]: new}, self.output, strict=True)
        self.assertEqual(self.snapshot(), before)
        self.assertFalse((self.output / f"{new['slug']}.json").exists())

    def test_repeated_degraded_run_is_byte_identical_and_does_not_mutate_input(self):
        incoming = deepcopy(self.previous)
        incoming["members"] = []
        expected_input = deepcopy(incoming)
        self.publish(incoming)
        before = self.snapshot()
        self.publish(incoming)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(incoming, expected_input)

    def test_index_is_replaced_last_after_atomic_shard_replacement(self):
        incoming = deepcopy(self.previous)
        incoming["bills"] = []
        replacements = []
        replace = D.os.replace

        def capture(source, target):
            replacements.append(Path(target).name)
            return replace(source, target)

        with mock.patch.object(D.os, "replace", side_effect=capture):
            self.publish(incoming)
        self.assertEqual(replacements[-1], "index.json")
        self.assertIn(f"{incoming['slug']}.json", replacements)
        self.assertFalse(list(self.output.glob(".division-refresh-*")))

    def test_invalid_serialization_does_not_publish_any_shard(self):
        before = self.snapshot()
        incoming = deepcopy(self.previous)
        incoming["extra"] = float("nan")
        with self.assertRaises(ValueError):
            self.publish(incoming)
        self.assertEqual(self.snapshot(), before)

    def test_existing_index_with_missing_shard_fails_without_rewriting_index(self):
        index = (self.output / "index.json").read_bytes()
        (self.output / f"{self.previous['slug']}.json").unlink()
        with self.assertRaises(D.RefreshDegradationError):
            self.publish(self.previous)
        self.assertEqual((self.output / "index.json").read_bytes(), index)


if __name__ == "__main__":
    unittest.main()
