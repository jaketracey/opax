import sqlite3
import tempfile
import unittest
from pathlib import Path

from parli.ingest.arag_sync import _patch_speech_text
from parli.ingest.speech_repair import repair


class DatabaseRepairTests(unittest.TestCase):
    def test_repair_adds_derived_columns_and_never_overwrites_raw_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "parli.db"
            db = sqlite3.connect(path)
            db.execute(
                """CREATE TABLE speeches (
                    speech_id INTEGER PRIMARY KEY, speaker_name TEXT, party TEXT,
                    source TEXT, topic TEXT, text TEXT
                )"""
            )
            raw = "Mr PHILIP DONATO ( Orange ) ( 22:2 5 :05 ): Few issues debated."
            db.execute(
                "INSERT INTO speeches VALUES (1286344,?,?,?,?,?)",
                ("Mr PHILIP DONATO", "UNKNOWN", "nsw_hansard", "Cost of Living", raw),
            )
            db.commit()
            db.close()

            result = repair(path, apply=True, batch_size=10, limit=None)
            self.assertEqual(result["counts"]["text_changed"], 1)
            self.assertEqual(result["counts"]["rows_updated"], 1)

            db = sqlite3.connect(path)
            row = db.execute(
                "SELECT speaker_name,party,text,text_clean,text_clean_rules,"
                "speaker_name_clean,party_canonical FROM speeches"
            ).fetchone()
            self.assertEqual(row[0], "Mr PHILIP DONATO")
            self.assertEqual(row[1], "UNKNOWN")
            self.assertEqual(row[2], raw)
            self.assertEqual(row[3], "Few issues debated.")
            self.assertIn("matching_speaker_banner", row[4])
            self.assertEqual(row[5], "Philip Donato")
            self.assertIsNone(row[6])
            db.close()

            rerun = repair(path, apply=True, batch_size=10, limit=None)
            self.assertEqual(rerun["counts"].get("rows_needing_update", 0), 0)
            self.assertEqual(rerun["counts"].get("rows_updated", 0), 0)


class KnowledgeBoxPatchTests(unittest.TestCase):
    def test_patch_sends_texts_only_and_captures_one_field_sample(self):
        db = sqlite3.connect(":memory:")
        db.row_factory = sqlite3.Row
        db.execute(
            """CREATE TABLE s (
                speech_id INTEGER, source TEXT, text TEXT, text_clean TEXT,
                text_clean_rules TEXT
            )"""
        )
        db.execute(
            "INSERT INTO s VALUES (1286344,'nsw_hansard','Mr DONATO: Before','After',"
            "'matching_speaker_banner')"
        )
        row = db.execute("SELECT * FROM s").fetchone()

        class FakeKb:
            def __init__(self):
                self.body = "Before"
                self.payloads = []

            def get_text_field_by_slug(self, slug, field_id):
                return {"value": {"body": self.body}}

            def patch_resource_by_slug(self, slug, body):
                self.payloads.append((slug, body))
                self.body = body["texts"]["body"]["body"]

        kb = FakeKb()
        result = _patch_speech_text(kb, row, capture_sample=True)
        self.assertEqual(result["status"], "patched")
        self.assertEqual(kb.payloads[0][0], "speech-1286344")
        self.assertEqual(set(kb.payloads[0][1]), {"texts"})
        self.assertEqual(kb.payloads[0][1]["texts"]["body"]["body"], "After")
        self.assertEqual(result["sample"]["kb_before"], "Before")
        self.assertEqual(result["sample"]["kb_after"], "After")


if __name__ == "__main__":
    unittest.main()
