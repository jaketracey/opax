"""The NSW diary hand table names people by the name their person page holds."""
import json
import unittest
from pathlib import Path

from scripts import export_access

PUBLIC = Path(__file__).resolve().parents[1] / "portal" / "public"


class NswMinisterNameTests(unittest.TestCase):
    def test_kamper_is_his_parliamentary_name(self):
        # search-hubs-006 / registers-003: 'Steve Kamper' joined no person page, so 704 meetings
        # linked to the bare people index. Source: NSW Parliament member page, memberId=124.
        self.assertEqual(export_access.NSW_SURNAMES["Kamper"], "Stephen Kamper")

    def test_every_hand_mapped_minister_has_a_speaker_page(self):
        speakers = {name for name, _ in json.loads((PUBLIC / "speakers.json").read_text())}
        missing = sorted(v for v in export_access.NSW_SURNAMES.values() if v not in speakers)
        self.assertEqual(missing, [])


if __name__ == "__main__":
    unittest.main()
