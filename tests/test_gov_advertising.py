"""Synthetic public-agency campaign tables; no private names or network."""
import copy
import json
from pathlib import Path
import unittest
import tempfile
import urllib.error
from unittest.mock import patch

from scripts.gov_advertising.stage import ROOT, cleared, parse_table, projection, sha
from scripts.gov_advertising.probe import Probe

BODY = (ROOT / "tests/fixtures/gov-advertising/campaigns.csv").read_bytes()


def fixture():
    digest = sha(BODY)
    url = "https://www.finance.gov.au/sites/default/files/synthetic-campaigns.csv"
    return {"id": "synthetic-2024-25", "financial_year": "2024-25", "url": url, "format": "CSV",
            "status": "reviewed", "sha256": digest, "table_sha256": digest,
            "amount_multiplier": 1, "basis": "GST exclusive", "measure": "Campaign total",
            "categories_complete": True, "report_total_cents": 40000,
            "total_source_locator": "page 10 table 1 total",
            "original_path": "tests/fixtures/gov-advertising/campaigns.csv",
            "table_path": "tests/fixtures/gov-advertising/campaigns.csv",
            "receipt": {"status": 200, "robots_allowed": True, "challenge": False, "sha256": digest, "snapshot": "2026-10-15T00:00:00Z"},
            "licence": {"status": "open", "name": "CC BY 4.0", "url": "https://creativecommons.org/licenses/by/4.0/",
                        "policy_url": url, "reviewed": True, "scope_sha256": digest, "exceptions_reviewed": True,
                        "terms": "Synthetic fixture grant; attribution required; branding and third-party material excluded.",
                        "receipt": {"status": 200, "sha256": digest, "snapshot": "2026-10-15T00:00:00Z"}}}


class CampaignTests(unittest.TestCase):
    def test_refusal_retains_only_receipt_and_stops_host_across_restarts(self):
        with tempfile.TemporaryDirectory(prefix="opax-gov-refusal-") as folder:
            path = Path(folder)
            probe = Probe(path / "receipts.json", path / "cache")
            body = b'<html><title>Access denied</title><script src="/cdn-cgi/challenge-platform/test"></script></html>'
            from io import BytesIO
            with patch.object(probe.opener, "open", side_effect=urllib.error.HTTPError("https://www.example.gov.au/robots.txt", 403, "Forbidden", {}, BytesIO(body))) as request:
                result = probe.get("https://www.example.gov.au/robots.txt", "robots")
                self.assertEqual(result["status"], 403)
                self.assertTrue(result["challenge"])
                self.assertEqual(result["sha256"], sha(body))
                self.assertEqual(list((path / "cache").iterdir()), [])
                self.assertIsNone(probe.get("https://www.example.gov.au/report"))
                self.assertEqual(request.call_count, 1)
            resumed = Probe(path / "receipts.json", path / "cache")
            with patch.object(resumed.opener, "open", side_effect=AssertionError("Stopped host retried")):
                self.assertIsNone(resumed.get("https://www.example.gov.au/report"))

    def test_reset_stops_without_retry_or_captured_error_body(self):
        with tempfile.TemporaryDirectory(prefix="opax-gov-reset-") as folder:
            path = Path(folder)
            probe = Probe(path / "receipts.json", path / "cache")
            with patch.object(probe.opener, "open", side_effect=ConnectionResetError()):
                result = probe.get("https://www.example.gov.au/robots.txt", "robots")
            self.assertIsNone(result["status"])
            self.assertEqual(result["error"], "ConnectionResetError")
            self.assertEqual(result["bytes"], 0)
            self.assertTrue(result["stopped"])
            self.assertEqual(list((path / "cache").iterdir()), [])

    def test_rows_categories_coordinates_and_report_reconciliation(self):
        rows, result = parse_table(BODY, fixture())
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["categories_cents"], {"media": 10000, "campaign_development": 5000, "gst": None, "other": None})
        self.assertEqual(result["sum_cents"], 40000)
        self.assertEqual(result["difference_cents"], 0)
        self.assertEqual(result["source_locator"], "page 10 table 1 total")
        self.assertEqual(rows[1]["source_locator"], "page 10 table 1 row 2")

    def test_source_hashes_and_totals_fail_closed(self):
        for key, value in [("report_total_cents", 39999), ("table_sha256", "0" * 64), ("amount_multiplier", 2), ("rounding_tolerance_cents", 99999)]:
            document = fixture(); document[key] = value
            with self.assertRaises(ValueError):
                parse_table(BODY, document)
        changed = BODY.replace(b"150.00", b"151.00")
        document = fixture(); document["table_sha256"] = sha(changed)
        with self.assertRaisesRegex(ValueError, "categories"):
            parse_table(changed, document)

    def test_duplicates_missing_coordinates_year_and_extra_private_fields_rejected(self):
        mutations = [BODY + BODY.splitlines(keepends=True)[1], BODY.replace(b"page 10 table 1 row 1", b"unknown"),
                     BODY.replace(b"2024-25", b"2023-24", 1), BODY.replace(b"source_locator", b"private_contact")]
        for body in mutations:
            document = fixture(); document["table_sha256"] = sha(body)
            with self.assertRaises(ValueError):
                parse_table(body, document)

    def test_document_licence_access_and_scope_gates_precede_parsing(self):
        changes = [lambda d: d.update(status="held"), lambda d: d["licence"].update(status="held"),
                   lambda d: d["licence"].update(url="https://creativecommons.org/licenses/by-nc-nd/4.0/"),
                   lambda d: d["licence"].update(scope_sha256="0" * 64), lambda d: d["licence"].update(reviewed=False),
                   lambda d: d["receipt"].update(status=403), lambda d: d["receipt"].update(challenge=True),
                   lambda d: d["licence"]["receipt"].update(status=403)]
        changes.append(lambda d: d["licence"].update(terms="CC BY-NC-ND; no commercial reuse without permission"))
        for change in changes:
            document = fixture(); change(document)
            self.assertFalse(cleared(document))
            self.assertEqual(parse_table(b"\xff NOT A TABLE", document)[0], [])

    def test_held_documents_never_open_or_export_and_duplicate_formats_fail(self):
        document = fixture(); document["status"] = "held"; document["campaign"] = "HELD CONTENT SENTINEL"
        inventory = {"generated_at": "2026-10-15T00:00:00Z", "documents": [document]}
        with patch.object(Path, "read_bytes", side_effect=AssertionError("Held source opened")):
            hub = projection(inventory)
        self.assertEqual(hub["rows"], [])
        self.assertEqual(hub["documents"], [])
        self.assertNotIn("HELD CONTENT SENTINEL", json.dumps(hub))
        inventory["documents"] = [fixture()]
        self.assertEqual(projection(inventory)["counts"]["years"], {"2024-25": 2})
        inventory["documents"].append(copy.deepcopy(fixture()))
        with self.assertRaisesRegex(ValueError, "financial year"):
            projection(inventory)

    def test_actual_held_inventory_has_no_exported_rows(self):
        inventory = json.loads((ROOT / "data/staged/gov-advertising/inventory.json").read_text())
        self.assertTrue(all(d["status"] == "held" for d in inventory["documents"]))
        self.assertEqual(projection(inventory)["counts"]["rows"], 0)


if __name__ == "__main__":
    unittest.main()
