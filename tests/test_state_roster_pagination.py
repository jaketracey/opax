"""Roster pages must be complete before any last-good chamber is replaced."""
import contextlib
import io
import json
from pathlib import Path
import re
import sqlite3
import sys
import unittest
from unittest import mock
import urllib.parse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from parli.ingest import state_rosters as roster
from parli.ingest.replace_guard import ExtGuardError


def binding(number):
    return {"p": {"type": "uri", "value": f"http://www.wikidata.org/entity/Q{number + 1000}"},
            "pLabel": {"type": "literal", "xml:lang": "en", "value": f"Member {number:04}"},
            "familyLabel": {"type": "literal", "value": f"Family {number:04}"}}


class RosterPagination(unittest.TestCase):
    def pages(self, rows, *, final_count=None, alter_page=None):
        calls, counts = [], []

        def query(text):
            calls.append(text)
            if "COUNT(*)" in text:
                counts.append(text)
                total = len(rows) if len(counts) == 1 or final_count is None else final_count
                return [{"count": {"type": "literal", "value": str(total)}}]
            offset = int(re.search(r"OFFSET (\d+)", text)[1])
            limit = int(re.search(r"LIMIT (\d+)", text)[1])
            page = rows[offset:offset + limit]
            return alter_page(offset, page) if alter_page else page
        return query, calls

    def test_multiple_pages_have_exact_coverage_and_full_stable_order(self):
        rows = [binding(i) for i in range(205)]
        query, calls = self.pages(rows)
        with mock.patch.object(roster, "sparql", side_effect=query):
            got = roster.roster_bindings("Q18526194")
        self.assertEqual(got, rows)
        pages = [query for query in calls if "COUNT(*)" not in query]
        self.assertEqual([int(re.search(r"OFFSET (\d+)", query)[1]) for query in pages], [0, 100, 200])
        for query in pages:
            self.assertIn("SELECT DISTINCT " + " ".join("?" + field for field in roster.ROSTER_FIELDS), query)
            self.assertIn("ORDER BY " + " ".join("?" + field for field in roster.ROSTER_FIELDS) + "\nLIMIT 100", query)
        self.assertEqual(sum("COUNT(*)" in query for query in calls), 2)

    def test_exact_multiple_requires_empty_terminal_page(self):
        rows = [binding(i) for i in range(200)]
        query, calls = self.pages(rows)
        with mock.patch.object(roster, "sparql", side_effect=query):
            self.assertEqual(roster.roster_bindings("Q18526194"), rows)
        self.assertEqual([int(re.search(r"OFFSET (\d+)", text)[1]) for text in calls if "OFFSET" in text], [0, 100, 200])

    def test_short_truncated_repeated_or_oversized_pages_are_refused(self):
        rows = [binding(i) for i in range(205)]
        for alter in (lambda offset, page: page[:2] if offset == 100 else page,
                      lambda offset, page: rows[:100] if offset == 100 else page,
                      lambda offset, page: rows[:101] if offset == 100 else page,
                      lambda offset, page: [{"p": {"value": 42}}] if offset == 100 else page):
            with self.subTest(alter=alter):
                query, _ = self.pages(rows, alter_page=alter)
                with mock.patch.object(roster, "sparql", side_effect=query), self.assertRaises(ExtGuardError):
                    roster.roster_bindings("Q18526194")

    def test_count_change_or_malformed_count_is_refused(self):
        query, _ = self.pages([binding(i) for i in range(105)], final_count=106)
        with mock.patch.object(roster, "sparql", side_effect=query), self.assertRaises(ExtGuardError):
            roster.roster_bindings("Q18526194")
        for count in ([], None, [{"count": {"value": "not a count"}}], [{"count": {"value": 2}}]):
            with self.subTest(count=count), mock.patch.object(roster, "sparql", return_value=count), self.assertRaises(ExtGuardError):
                roster.roster_bindings("Q18526194")

    def test_page_bound_refuses_before_requesting_unbounded_results(self):
        with mock.patch.object(roster, "sparql", return_value=[{"count": {"value": "300"}}]) as query:
            with self.assertRaisesRegex(ExtGuardError, "3-page coverage bound"):
                roster.roster_bindings("Q18526194", max_pages=3)
        self.assertEqual(query.call_count, 1)

    def test_truncated_middle_json_retains_every_last_good_chamber(self):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.executescript(roster.DDL)
        positions = {("sa", "sa_ha"): "Q18220900", ("qld", "qld_la"): "Q18526194"}
        for state, chamber in positions:
            db.execute("INSERT INTO ext_state_roster VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       ("Q99", state, chamber, "Last Good", None, None, None, None, None, None, None, None, "old"))
        db.commit()
        before = db.execute("SELECT * FROM ext_state_roster ORDER BY state, chamber").fetchall()
        rows = [binding(i) for i in range(205)]
        count, failures, headers = 0, 0, []

        def open_page(request, timeout):
            nonlocal count, failures
            text = urllib.parse.parse_qs(urllib.parse.urlsplit(request.full_url).query)["query"][0]
            headers.append(dict(request.header_items()))
            if "COUNT(*)" in text:
                count += 1
                page = [{"count": {"type": "literal", "value": "1" if "wd:Q18220900" in text else "205"}}]
            else:
                offset = int(re.search(r"OFFSET (\d+)", text)[1])
                if "wd:Q18526194" in text and offset == 100:
                    failures += 1
                    return io.BytesIO(b'{"results":{"bindings":[{"p":')
                page = rows[:1] if "wd:Q18220900" in text else rows[offset:offset + 100]
            return io.BytesIO(json.dumps({"results": {"bindings": page}}).encode())

        with mock.patch.object(roster, "POSITIONS", positions), \
                mock.patch.object(roster.source_http, "urlopen", side_effect=open_page), \
                mock.patch.object(roster.time, "sleep"), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(json.JSONDecodeError):
                roster.fetch(db)
        self.assertEqual(failures, 4)  # Existing bounded retry policy applies per page.
        self.assertEqual(db.execute("SELECT * FROM ext_state_roster ORDER BY state, chamber").fetchall(), before)
        self.assertEqual(db.execute("SELECT count(*) FROM ext_ingest_log").fetchone()[0], 0)
        self.assertEqual(count, 3)
        self.assertTrue(all(row.get("User-agent") == roster.source_http.USER_AGENT for row in headers))


if __name__ == "__main__":
    unittest.main()
