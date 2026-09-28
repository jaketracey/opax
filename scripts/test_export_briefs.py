"""Speech briefs and the index layout in scripts/export_bills.py.

    python3 -m unittest scripts/test_export_briefs.py
"""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import export_bills as eb  # noqa: E402
from parli.arag import AragError  # noqa: E402

NOW = datetime(2026, 9, 28, 12, 0, tzinfo=timezone.utc).timestamp()
HOUR = 3600


class FakeKb:
    """get_text_field_by_slug over a dict; a slug mapped to an int raises that HTTP status."""

    def __init__(self, briefs):
        self.briefs = briefs
        self.calls = []

    def get_text_field_by_slug(self, slug, field):
        self.calls.append(slug)
        v = self.briefs.get(slug, 404)
        if isinstance(v, int):
            raise AragError(v, f"/slug/{slug}", "nope")
        return {"value": {"body": v}}


def bill(key, speeches):
    return {"key": key, "speeches": [{"slug": s, "speaker": "A", "date": d, "state": "NSW", "brief": b}
                                     for s, d, b in speeches]}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.out = self.dir / "bills"
        self.out.mkdir()
        self.cache = self.dir / "briefs.json"

    def put(self, doc):
        (self.out / f"{doc['key']}.json").write_text(json.dumps(doc, indent=1) + "\n")

    def get(self, key):
        return json.loads((self.out / f"{key}.json").read_text())


class FillBriefs(Base):
    def test_new_slug_is_fetched_and_attached(self):
        self.put(bill("b1", [("s-new", "2026-09-20", None)]))
        kb = FakeKb({"s-new": "A brief."})
        stats = eb.fill_briefs(self.out, self.cache, kb=kb, now=NOW)
        self.assertEqual(self.get("b1")["speeches"][0]["brief"], "A brief.")
        self.assertEqual(stats["new"], 1)
        self.assertEqual(json.loads(self.cache.read_text()), {"s-new": "A brief."})

    def test_cached_none_is_refetched_and_gains_a_brief(self):
        self.put(bill("b1", [("s1", "2026-09-20", None)]))
        self.cache.write_text(json.dumps({"s1": None}))
        kb = FakeKb({"s1": "Now written."})
        stats = eb.fill_briefs(self.out, self.cache, kb=kb, now=NOW)
        self.assertEqual(kb.calls, ["s1"])
        self.assertEqual(self.get("b1")["speeches"][0]["brief"], "Now written.")
        self.assertEqual(stats["gained"], 1)
        self.assertNotIn("s1", json.loads(eb.checked_path(self.cache).read_text()))

    def test_still_empty_is_stamped_and_not_asked_again_within_the_window(self):
        self.put(bill("b1", [("s1", "2026-09-20", None)]))
        self.cache.write_text(json.dumps({"s1": None}))
        kb = FakeKb({"s1": 404})
        eb.fill_briefs(self.out, self.cache, kb=kb, now=NOW)
        self.assertEqual(kb.calls, ["s1"])
        self.assertEqual(json.loads(eb.checked_path(self.cache).read_text()), {"s1": NOW})
        eb.fill_briefs(self.out, self.cache, kb=kb, now=NOW + 5 * HOUR)
        self.assertEqual(kb.calls, ["s1"], "asked again inside the recheck window")
        eb.fill_briefs(self.out, self.cache, kb=kb, now=NOW + 21 * HOUR)
        self.assertEqual(kb.calls, ["s1", "s1"], "not asked again after the window")

    def test_older_empties_are_bounded_and_least_recent_first(self):
        speeches = [(f"old{i}", "2025-01-01", None) for i in range(5)]
        self.put(bill("b1", speeches))
        self.cache.write_text(json.dumps({s[0]: None for s in speeches}))
        eb._write_json_atomic(eb.checked_path(self.cache),
                              {"old0": NOW - 90 * HOUR, "old1": NOW - 80 * HOUR, "old2": NOW - 70 * HOUR,
                               "old3": NOW - 60 * HOUR, "old4": NOW - 50 * HOUR})
        kb = FakeKb({})
        eb.fill_briefs(self.out, self.cache, kb=kb, recheck_limit=2, now=NOW)
        self.assertEqual(sorted(kb.calls), ["old0", "old1"])

    def test_recent_empties_are_all_rechecked_regardless_of_the_older_limit(self):
        speeches = [(f"new{i}", "2026-09-25", None) for i in range(5)]
        self.put(bill("b1", speeches))
        self.cache.write_text(json.dumps({s[0]: None for s in speeches}))
        kb = FakeKb({})
        eb.fill_briefs(self.out, self.cache, kb=kb, recheck_limit=1, now=NOW)
        self.assertEqual(len(kb.calls), 5)

    def test_a_fetch_that_errors_never_blanks_an_existing_brief(self):
        self.put(bill("b1", [("s1", "2026-09-20", "Kept brief."), ("s2", "2026-09-21", None)]))
        kb = FakeKb({"s1": 500, "s2": "Fine."})
        stats = eb.fill_briefs(self.out, self.cache, kb=kb, now=NOW)
        doc = self.get("b1")
        self.assertEqual(doc["speeches"][0]["brief"], "Kept brief.")
        self.assertEqual(doc["speeches"][1]["brief"], "Fine.")
        self.assertEqual(stats["failed"], 1)
        self.assertNotIn("s1", json.loads(self.cache.read_text()), "a failure must not be cached")

    def test_cached_brief_is_never_refetched(self):
        self.put(bill("b1", [("s1", "2026-09-20", None)]))
        self.cache.write_text(json.dumps({"s1": "Cached."}))
        kb = FakeKb({})
        eb.fill_briefs(self.out, self.cache, kb=kb, now=NOW)
        self.assertEqual(kb.calls, [])
        self.assertEqual(self.get("b1")["speeches"][0]["brief"], "Cached.")


class WriteIndex(Base):
    INDEX = {"generated_at": "2026-09-21T12:20:15+00:00", "count": 1, "meta": {"mode": "registry"},
             "bills": [{"key": "k1", "title": "Ünïcode Bill", "divisions": 0}]}

    def test_layout_is_indent_one_ensure_ascii_false_with_newline(self):
        path = self.dir / "index.json"
        eb.write_index(path, json.loads(json.dumps(self.INDEX)))
        self.assertEqual(path.read_text(), json.dumps(self.INDEX, ensure_ascii=False, indent=1) + "\n")
        self.assertIn("Ünïcode", path.read_text())

    def test_unchanged_content_keeps_the_old_build_stamp(self):
        path = self.dir / "index.json"
        eb.write_index(path, json.loads(json.dumps(self.INDEX)))
        before = path.read_bytes()
        fresh = json.loads(json.dumps(self.INDEX))
        fresh["generated_at"] = "2026-09-29T03:40:00+00:00"
        eb.write_index(path, fresh)
        self.assertEqual(path.read_bytes(), before)

    def test_changed_content_takes_the_new_stamp(self):
        path = self.dir / "index.json"
        eb.write_index(path, json.loads(json.dumps(self.INDEX)))
        fresh = json.loads(json.dumps(self.INDEX))
        fresh["generated_at"] = "2026-09-29T03:40:00+00:00"
        fresh["bills"][0]["divisions"] = 3
        eb.write_index(path, fresh)
        self.assertEqual(json.loads(path.read_text())["generated_at"], "2026-09-29T03:40:00+00:00")

    def test_the_committed_index_round_trips_byte_for_byte(self):
        committed = Path(__file__).resolve().parents[1] / "portal" / "public" / "bills" / "index.json"
        if not committed.exists():
            self.skipTest("no committed index.json")
        index = json.loads(committed.read_text())
        path = self.dir / "index.json"
        eb.write_index(path, index)
        self.assertEqual(path.read_bytes(), committed.read_bytes())


if __name__ == "__main__":
    unittest.main()
