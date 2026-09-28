"""The windowed dedup sets and the incremental full-text sync.

    python3 -m unittest scripts/test_dedup_and_fts.py
"""
import hashlib
import sqlite3
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from parli.ingest import fts as fts_gate  # noqa: E402
from parli.ingest.dedup import LazyDateSeen, build_seen, key_of  # noqa: E402
import fts_sync  # noqa: E402


def text_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


ROWS = [  # speaker, date, text, source
    ("A", "2026-08-01", "old speech one", "nsw_hansard"),
    ("A", "2026-09-10", "recent speech one", "nsw_hansard"),
    ("B", "2026-09-10", "recent speech two", "vic_hansard"),
    ("C", "2026-09-12", "committee words", "committee_senate"),
    ("D", "2026-06-05", "older committee words", "committee_senate"),
    (None, "2026-09-11", "no speaker recorded", "openaustralia"),
    ("E|F", "2026-09-11", "a pipe in the speaker", "qld_hansard"),
]


def make_db():
    db = sqlite3.connect(":memory:")
    db.executescript("""
        CREATE TABLE speeches(speech_id INTEGER PRIMARY KEY, speaker_name TEXT, topic TEXT, text TEXT,
                              date TEXT, source TEXT);
    """)
    db.executemany("INSERT INTO speeches(speaker_name, date, text, source) VALUES (?,?,?,?)", ROWS)
    db.row_factory = sqlite3.Row
    return db


class BuildSeen(unittest.TestCase):
    def setUp(self):
        self.db = make_db()
        self.all = build_seen(self.db, text_hash)

    def test_no_window_is_every_stored_speech(self):
        self.assertEqual(len(self.all), len(ROWS))
        self.assertIn(key_of(None, "2026-09-11", text_hash, "no speaker recorded"), self.all)
        self.assertIn("|2026-09-11|" + text_hash("no speaker recorded"), self.all, "a missing speaker keys as ''")

    def test_since_keeps_exactly_the_rows_a_run_from_that_date_can_match(self):
        windowed = build_seen(self.db, text_hash, since="2026-09-10")
        self.assertEqual(len(windowed), 5)
        self.assertTrue(all(k.rsplit("|", 2)[1] >= "2026-09-10" for k in windowed))
        # the loader property: for any key dated in the window, membership is the same as with the full set
        for key in self.all:
            if key.rsplit("|", 2)[1] >= "2026-09-10":
                self.assertIn(key, windowed)
        # ...and an out-of-window key is (correctly) not asked about: a run only creates keys dated in its window
        self.assertNotIn(key_of("A", "2026-08-01", text_hash, "old speech one"), windowed)

    def test_sources_filter(self):
        nsw = build_seen(self.db, text_hash, sources=["nsw_hansard"])
        self.assertEqual(len(nsw), 2)
        nsw_recent = build_seen(self.db, text_hash, sources=["nsw_hansard"], since="2026-09-01")
        self.assertEqual(nsw_recent, {key_of("A", "2026-09-10", text_hash, "recent speech one")})
        both = build_seen(self.db, text_hash, sources=["committee_senate", "committee_house"])
        self.assertEqual(len(both), 2)

    def test_rows_are_streamed_not_fetchall(self):
        calls = []

        class Spy:
            def execute(self_inner, sql, params=()):
                cur = self.db.execute(sql, params)

                class C:
                    def __iter__(c):
                        return iter(cur)

                    def fetchall(c):
                        calls.append("fetchall")
                        return cur.fetchall()
                return C()
        build_seen(Spy(), text_hash, since="2026-09-01")
        self.assertEqual(calls, [])


class LazySeen(unittest.TestCase):
    def test_matches_the_full_set_and_reads_only_the_dates_it_is_asked_about(self):
        db = make_db()
        queries = []
        db.set_trace_callback(lambda s: queries.append(s) if s.startswith("SELECT speaker_name") else None)
        full = build_seen(db, text_hash, sources=["committee_senate"])
        queries.clear()
        lazy = LazyDateSeen(db, text_hash, sources=["committee_senate"])
        dup = key_of("C", "2026-09-12", text_hash, "committee words")
        new = key_of("C", "2026-09-12", text_hash, "brand new words")
        self.assertEqual(dup in lazy, dup in full)
        self.assertTrue(dup in lazy)
        self.assertFalse(new in lazy)
        lazy.add(new)
        self.assertTrue(new in lazy)
        self.assertEqual(len(queries), 1, "the second key on the same date must not query again")
        self.assertNotIn(key_of("D", "2026-06-05", text_hash, "older committee words"), lazy.keys)
        self.assertEqual(len(queries), 1, "an untouched date is never read")
        # a key on another date loads that date
        self.assertTrue(key_of("D", "2026-06-05", text_hash, "older committee words") in lazy)
        self.assertEqual(len(queries), 2)

    def test_speaker_with_a_pipe(self):
        db = make_db()
        lazy = LazyDateSeen(db, text_hash)
        self.assertTrue(key_of("E|F", "2026-09-11", text_hash, "a pipe in the speaker") in lazy)

    def test_other_sources_do_not_leak_in(self):
        db = make_db()
        lazy = LazyDateSeen(db, text_hash, sources=["committee_senate"])
        self.assertFalse(key_of("B", "2026-09-10", text_hash, "recent speech two") in lazy)


class ArgaSyncDedupe(unittest.TestCase):
    """prepare_dedupe over only the dates that hold new rows excludes exactly the same new rows."""

    @classmethod
    def setUpClass(cls):
        from parli.ingest import arag_sync
        cls.arag = arag_sync

    def make(self):
        db = sqlite3.connect(":memory:")
        db.row_factory = sqlite3.Row
        db.executescript("""
            CREATE TABLE speeches(speech_id INTEGER PRIMARY KEY, speaker_name TEXT, topic TEXT, text TEXT,
                                  date TEXT, source TEXT, chamber TEXT);
        """)
        body = "x" * 300
        rows = [
            # already pushed (ids 1-6): a committee transcript, then its duplicate from another source
            ("Senator A", "T", body + "one", "2026-06-05", "committee_senate", "senate"),
            ("Senator A", "T", body + "one", "2026-06-05", "committee_senate", "senate"),   # dup of 1 (old)
            ("B", "T", body + "two", "2026-06-06", "nsw_hansard", ""),
            ("B", "T", body + "three", "2026-06-06", "vic_hansard", ""),
            ("C", "T", body + "four", "2026-06-07", "zenodo", "representatives"),
            ("C", "T", body + "five", "2026-06-07", "openaustralia", "senate"),
            # new since the checkpoint (ids 7+)
            ("B", "T", body + "two", "2026-06-06", "nsw_hansard", ""),       # dup of an OLD row 3 -> excluded
            ("D", "T", body + "six", "2026-09-10", "nsw_hansard", ""),
            ("D", "T", body + "six", "2026-09-10", "vic_hansard", ""),       # same (date, speaker, text), lower priority
            ("E", "T", body + "seven", "2026-09-11", "qld_hansard", ""),
            ("E", "T", body + "seven", "2026-09-11", "qld_hansard", ""),     # exact dup within the new rows
            ("F", "T", body + "eight", "2026-09-12", "openaustralia", "representatives"),
        ]
        db.executemany("INSERT INTO speeches(speaker_name, topic, text, date, source, chamber) VALUES (?,?,?,?,?,?)", rows)
        return db

    def excluded(self, db, after):
        db.execute("DROP TABLE IF EXISTS temp.dedupe_excluded")
        db.execute("DROP TABLE IF EXISTS temp.zenodo_dates")
        self.arag.prepare_dedupe(db, "1993-03-13", after)
        return {r[0] for r in db.execute("SELECT speech_id FROM temp.dedupe_excluded")}

    def test_new_rows_get_the_same_exclusions_either_way(self):
        db = self.make()
        checkpoint = 6
        full = self.excluded(db, None)
        windowed = self.excluded(db, checkpoint)
        new_full = {i for i in full if i > checkpoint}
        new_windowed = {i for i in windowed if i > checkpoint}
        self.assertEqual(new_windowed, new_full)
        self.assertEqual(new_full, {7, 9, 11}, "the old-row duplicate, the lower-priority source, the repeated row")

    def test_the_window_really_is_narrower(self):
        db = self.make()
        self.assertLess(len(self.excluded(db, 6)), len(self.excluded(db, None)),
                        "the old committee duplicate (id 2) is outside the dates that hold new rows")

    def test_a_zero_checkpoint_means_every_date(self):
        db = self.make()
        self.assertEqual(self.excluded(db, 0), self.excluded(db, None))


class FtsGate(unittest.TestCase):
    def test_rebuild_is_off_unless_asked(self):
        import os
        os.environ.pop("OPAX_FTS_REBUILD", None)
        self.assertFalse(fts_gate.rebuild_wanted(False))
        self.assertTrue(fts_gate.rebuild_wanted(True))
        os.environ["OPAX_FTS_REBUILD"] = "1"
        try:
            self.assertTrue(fts_gate.rebuild_wanted(False))
        finally:
            del os.environ["OPAX_FTS_REBUILD"]


class FtsSync(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript("""
            CREATE TABLE speeches(speech_id INTEGER PRIMARY KEY, speaker_name TEXT, topic TEXT, text TEXT);
            CREATE VIRTUAL TABLE speeches_fts USING fts5(speaker_name, topic, text, content=speeches,
                content_rowid=speech_id, tokenize='porter unicode61');
        """)
        self.db.executemany("INSERT INTO speeches(speaker_name, topic, text) VALUES (?,?,?)",
                            [(f"A{i}", "t", f"the quick brown fox {i}") for i in range(30)])
        self.db.execute("INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')")
        self.db.execute("DELETE FROM speeches_fts WHERE rowid IN (10, 11)")  # gaps in ids, as in the real table
        self.db.execute("DELETE FROM speeches WHERE speech_id IN (10, 11)")
        self.db.commit()

    def hits(self, word):
        return self.db.execute("SELECT COUNT(*) FROM speeches_fts WHERE speeches_fts MATCH ?", (word,)).fetchone()[0]

    def test_indexes_only_new_rows_in_batches_and_finds_them(self):
        self.db.executemany("INSERT INTO speeches(speaker_name, topic, text) VALUES (?,?,?)",
                            [(f"B{i}", None, f"zebra crossing {i}") for i in range(25)])
        self.db.commit()
        st = fts_sync.state(self.db)
        self.assertEqual((st["new_rows"], st["unindexed_gap"]), (25, 0))
        self.assertEqual(self.hits("zebra"), 0)
        lines = []
        added = fts_sync.sync(self.db, batch=10, log=lines.append)
        self.assertEqual(added, 25)
        self.assertEqual(len(lines), 3, "25 rows in batches of 10 = three commits")
        self.assertEqual(self.hits("zebra"), 25)
        self.assertEqual(self.hits("fox"), 28, "the old rows are untouched")
        self.assertEqual(fts_sync.state(self.db)["new_rows"], 0)
        self.assertEqual(fts_sync.sync(self.db), 0, "a second run is a no-op")

    def test_result_equals_a_full_rebuild(self):
        self.db.executemany("INSERT INTO speeches(speaker_name, topic, text) VALUES (?,?,?)",
                            [(f"C{i}", "x", f"zebra dust {i}") for i in range(12)])
        self.db.commit()
        fts_sync.sync(self.db, batch=5)
        incremental = sorted(self.db.execute(
            "SELECT rowid FROM speeches_fts WHERE speeches_fts MATCH 'zebra OR fox'").fetchall())
        self.db.execute("INSERT INTO speeches_fts(speeches_fts) VALUES('rebuild')")
        rebuilt = sorted(self.db.execute(
            "SELECT rowid FROM speeches_fts WHERE speeches_fts MATCH 'zebra OR fox'").fetchall())
        self.assertEqual(incremental, rebuilt)


if __name__ == "__main__":
    unittest.main()
