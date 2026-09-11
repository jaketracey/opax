"""Exposure drafts merge into the bills projection without the database.

    python3 -m unittest scripts/test_export_drafts.py
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_bills as eb  # noqa: E402

DRAFT = {
    "key": "au-federal-ed-test-2026",
    "title": "Test Amendment (Exposure) Bill 2026",
    "short_title": "Test Bill (exposure draft)",
    "jurisdiction": "federal",
    "parliament": 48,
    "released": "2026-09-08",
    "portfolio": "Communications",
    "status_as_of": "2026-09-08",
    "consultation": {"url": "https://example.gov.au/consult", "opens": "2026-09-08", "closes": "2026-10-01"},
    "sources": [{"kind": "exposure_draft", "url": "https://example.gov.au/draft.pdf", "document_date": "2026-09-08", "licence": "CC BY 4.0"}],
    "related": [{"kind": "bill", "key": "au-federal-r1", "relation": "predecessor", "title": "Old Bill 2024"}],
    "summary": {"version": 1, "basis": "text", "attribution": "Written by a model from the exposure draft text; not the record",
                "as_of": "2026-09-08", "sentences": ["One.", "Two.", "Three."], "changes": ["A."], "affected": "Everyone."},
}
BILL = {
    "key": "au-federal-r1", "title": "Old Bill 2024", "short_title": "Old Bill 2024", "aliases": [], "jurisdiction": "federal",
    "parliament": 47, "introduced": "2024-11-25", "originating_house": "representatives", "sponsor": "DANIEL, Zoe, MP",
    "sponsor_party": "Independent", "sponsor_person_id": None, "portfolio": None, "status": "lapsed", "status_as_of": "2025-03-28",
    "key_dates": [], "sources": [], "summary": None, "divisions": [], "speeches": [], "acts": [],
}


def seed(out: Path) -> None:
    docs = [BILL]
    index = {"generated_at": "2026-09-01T00:00:00+00:00", "count": 1, "meta": {"mode": "registry"},
             "bills": [eb.index_row(d) for d in docs]}
    eb.write_out(docs, index, out, None)


class DraftMergeTests(unittest.TestCase):
    def test_draft_doc_has_the_projection_shape(self):
        doc = eb.draft_doc(DRAFT)
        self.assertTrue(set(BILL) <= set(doc), set(BILL) - set(doc))
        self.assertEqual(doc["status"], eb.DRAFT_STATUS)
        self.assertEqual(doc["introduced"], "2026-09-08")
        self.assertIsNone(doc["originating_house"])
        self.assertEqual(doc["key_dates"][0]["stage"], "Exposure draft released")
        self.assertEqual(doc["consultation"]["closes"], "2026-10-01")
        self.assertEqual(doc["related"][0]["key"], "au-federal-r1")
        self.assertEqual(doc["divisions"], [])

    def test_merge_into_dir_is_idempotent_and_removes_withdrawn_drafts(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            seed(out)
            eb.merge_drafts_into_dir(out, [DRAFT])
            index = json.loads((out / "index.json").read_text())
            self.assertEqual(index["count"], 2)
            self.assertEqual(index["bills"][0]["key"], DRAFT["key"], "the newest release sorts first")
            self.assertEqual(index["bills"][0]["status"], eb.DRAFT_STATUS)
            self.assertTrue(index["bills"][0]["has_summary"])
            self.assertEqual(index["meta"]["exposure_drafts"], 1)
            self.assertTrue((out / f"{DRAFT['key']}.json").exists())

            eb.merge_drafts_into_dir(out, [DRAFT])
            index = json.loads((out / "index.json").read_text())
            self.assertEqual(index["count"], 2, "a second merge does not duplicate")

            eb.merge_drafts_into_dir(out, [])
            index = json.loads((out / "index.json").read_text())
            self.assertEqual(index["count"], 1)
            self.assertFalse((out / f"{DRAFT['key']}.json").exists(), "a withdrawn draft's file is removed")

    def test_registry_rows_are_never_touched(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            seed(out)
            before = (out / "au-federal-r1.json").read_text()
            eb.merge_drafts_into_dir(out, [DRAFT])
            self.assertEqual((out / "au-federal-r1.json").read_text(), before)

    def test_a_draft_that_became_a_bill_points_forward(self):
        doc = eb.draft_doc({**DRAFT, "became": "au-federal-r9"})
        self.assertEqual(doc["became"], "au-federal-r9")
        self.assertEqual(doc["status"], eb.DRAFT_STATUS)


if __name__ == "__main__":
    unittest.main()
