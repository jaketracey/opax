"""The reviewed Franklin votes have identity evidence, but no dated party."""
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import audit_franklin_vote_parties as audit
import vote_parties as V


class FranklinPartyReview(unittest.TestCase):
    def setUp(self):
        self.doc = json.loads(audit.VOTES.read_text())
        # Freeze only the old snapshot's two roster rows; all other evidence is
        # loaded from the actual tracked rules, service records and official lists.
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        fields = list(self.doc["cached_terms"][0])
        self.db.execute("CREATE TABLE ext_state_roster (" + ",".join(fields) + ")")
        self.db.executemany("INSERT INTO ext_state_roster VALUES (" + ",".join("?" for _ in fields) + ")",
                            [[row[field] for field in fields] for row in self.doc["cached_terms"]])
        self.evidence = V.load_evidence(db=self.db)

    def test_all_32_reviewed_votes_stay_blank_with_the_held_evidence(self):
        before = deepcopy(self.doc)
        result = audit.review(self.doc, self.evidence)
        self.assertEqual(result["votes"], 32)
        self.assertEqual(result["labelled"], 0)
        self.assertEqual(result["outcomes"], {"no-dated-party": 32})
        self.assertEqual(len({row["key"] for row in result["rows"]}), 32)
        self.assertTrue(all(row["party"] is None for row in result["rows"]))
        self.assertEqual(min(row["date"] for row in result["rows"]), "2025-11-27")
        self.assertEqual(max(row["date"] for row in result["rows"]), "2026-09-24")
        self.assertEqual(self.doc, before, "the audit must not mutate recovered votes")

    def test_a_future_reviewed_party_period_would_fill_through_the_same_rules(self):
        # Hypothetical evidence tests the audit path, not a claim about Franklin.
        self.evidence.append(V.entry("service", "nsw_lc", ("name", "ben franklin"), ["Ben Franklin"],
                                     "Fixture Party", "2025-11-27", "2026-09-24"))
        result = audit.review(self.doc, self.evidence)
        for row in result["rows"]:
            self.assertEqual(row["party"], None if row["date"] == "2026-09-24" else "Fixture Party")
            self.assertEqual(row["reason"], "evidence-ends-before-date" if row["date"] == "2026-09-24" else "filled")


if __name__ == "__main__":
    unittest.main()
