import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

from scripts.vic_gifts.acquire import Collector, ROOT, robots_allowed, robots_rules
from scripts.vic_gifts.stage import CC, exact_holder, licence_review, parse_register, period_from_page

FIXTURE = Path(__file__).parent / "fixtures/vic-gifts/register.html"
BODY = FIXTURE.read_bytes()
RECEIPT = {"status": 200, "sha256": hashlib.sha256(BODY).hexdigest(), "checked_at": "2026-10-14T00:00:00Z"}
POLICY = b'<main>All material provided on this website is provided under a <a href="https://creativecommons.org/licenses/by/4.0/legalcode">Creative Commons Attribution 4.0 International licence</a>, except images, branding and content supplied by third parties.</main>'
ROSTER = [{"name": name, "representation": [{"jurisdiction": "vic"}]} for name in ["Example Member", "Other Member", "Jamie Resident"]]
PATHS = {p["name"]: "/subject/person/" + p["name"].lower().replace(" ", "-") for p in ROSTER}


def document():
    period = period_from_page(BODY)
    return {"id": "vic-gifts-" + period["id"], "period": period,
        "url": "https://www.vic.gov.au/2024-25-ministerial-register-gifts-benefits-and-hospitality",
        "licence": licence_review(POLICY, BODY, RECEIPT),
        "receipt": {"sha256": RECEIPT["sha256"], "snapshot": RECEIPT["checked_at"]}}


class VictorianGiftsTests(unittest.TestCase):
    def test_fields_missing_fields_and_provenance(self):
        rows = parse_register(BODY, document(), ROSTER, PATHS)
        self.assertEqual(len(rows), 3)
        row = rows[0]
        self.assertEqual(row["description"], "Tickets from Jamie Resident, 2 March 2025 & hospitality")
        self.assertEqual(row["portfolio"], "Example portfolio")
        self.assertEqual((row["date"], row["estimated_value"], row["action_taken"]), ("2 March 2025", "$250 (estimated)", "Retained"))
        self.assertEqual(row["source_locator"], "table-1/row-1")
        self.assertEqual(row["source_row_id"], "entry-1")
        self.assertEqual(row["sha256"], RECEIPT["sha256"])
        self.assertEqual(rows[2]["role"], "Parliamentary secretary")
        self.assertIsNone(rows[2]["date"])
        self.assertIsNone(rows[2]["estimated_value"])
        self.assertIsNone(rows[2]["action_taken"])
        self.assertEqual(rows[1]["description"], "Nil")
        self.assertNotIn("address", row)

    def test_blocked_file_is_never_parsed_or_projected(self):
        d = document(); d["licence"]["status"] = "held"
        self.assertEqual(parse_register(b"not even HTML", d, ROSTER, PATHS), [])
        d["licence"]["status"] = "open"; d["licence"]["url"] = "https://example.test/restricted"
        self.assertEqual(parse_register(BODY, d, ROSTER, PATHS), [])

    def test_owner_scope_and_page_exceptions_fail_closed(self):
        self.assertEqual(licence_review(POLICY, BODY, RECEIPT)["status"], "open")
        scoped = POLICY.replace(b"All material provided on this website", b"Material produced by DGS")
        self.assertEqual(licence_review(scoped, BODY, RECEIPT)["status"], "held")
        self.assertEqual(licence_review(POLICY, BODY.replace(b"Gifts accepted", b"All rights reserved. Gifts accepted"), RECEIPT)["status"], "held")
        self.assertEqual(licence_review(POLICY, BODY.replace(b'href="/copyright"', b'href="https://example.test/copyright"'), RECEIPT)["status"], "held")

    def test_exact_officials_only_and_no_giver_entities(self):
        rows = parse_register(BODY, document(), ROSTER, PATHS)
        self.assertEqual(rows[0]["official"]["name"], "Example Member")
        self.assertIsNone(rows[1]["official"])
        self.assertEqual(rows[0]["giver"], "Jamie Resident")
        self.assertNotIn("giver_entity", rows[0])
        self.assertNotIn("giver_href", rows[0])
        self.assertEqual({r["official"]["name"] for r in rows if r["official"]}, {"Example Member", "Other Member"})
        for name in ["E Member", "Example M", "Example Member (return annotation)"]:
            self.assertIsNone(exact_holder(name, ROSTER, PATHS))
        self.assertIsNone(exact_holder("Example Member", ROSTER + [ROSTER[0]], PATHS))
        self.assertIsNone(exact_holder("Example Member", [{**ROSTER[0], "witness_name": "fixture"}], PATHS))

    def test_hash_and_unsupported_tables_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            parse_register(BODY + b"changed", document(), ROSTER, PATHS)
        changed = BODY.replace(b'<td>The Hon', b'<td rowspan="2">The Hon')
        d = document(); d["receipt"]["sha256"] = hashlib.sha256(changed).hexdigest()
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            parse_register(changed, d, ROSTER, PATHS)

    def test_repeated_robots_groups_and_file_globs(self):
        rules = robots_rules('User-agent: *\nCrawl-delay: 2\nDisallow: /preview/*\nUser-agent: *\nDisallow: /sites/default/files/*.pdf\n', "OPAXBot/1.0")
        self.assertFalse(robots_allowed("https://www.vic.gov.au/sites/default/files/2025/test.pdf", rules))
        self.assertFalse(robots_allowed("https://www.vic.gov.au/preview/test", rules))
        self.assertTrue(robots_allowed("https://www.vic.gov.au/ministerial-register", rules))

    def test_refusal_receipt_stops_all_following_requests(self):
        with tempfile.TemporaryDirectory(prefix="vic-gifts-test-", dir=ROOT / "data/staged") as out:
            collector = Collector(out); collector.rules = []
            collector.opener.open = lambda *a, **kw: (_ for _ in ()).throw(urllib.error.HTTPError(a[0].full_url, 403, "Forbidden", {}, io.BytesIO(b"Forbidden")))
            with self.assertRaises(SystemExit): collector.get("https://www.vic.gov.au/register", "period")
            self.assertEqual(collector.ledger["stopped"]["status"], 403)
            with self.assertRaises(SystemExit): collector.get("https://www.vic.gov.au/copyright", "licence")
            self.assertEqual(len(collector.ledger["receipts"]), 1)
            self.assertEqual(json.loads(Path(out, "receipts.json").read_text())["receipts"][0]["status"], 403)

    def test_challenge_200_stops_collection(self):
        with tempfile.TemporaryDirectory(prefix="vic-gifts-test-", dir=ROOT / "data/staged") as out:
            collector = Collector(out); collector.rules = []
            response = io.BytesIO(b'<html><title>Just a moment...</title></html>'); response.status = 200; response.headers = {}
            collector.opener.open = lambda *a, **kw: response
            with self.assertRaises(SystemExit): collector.get("https://www.vic.gov.au/register", "period")
            self.assertTrue(collector.ledger["receipts"][0]["challenge"])
            with self.assertRaises(SystemExit): Collector(out).get("https://www.vic.gov.au/other", "period")


if __name__ == "__main__":
    unittest.main()
