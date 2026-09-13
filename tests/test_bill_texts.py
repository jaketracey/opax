import json
import tempfile
import unittest
from pathlib import Path

from parli.ingest.bill_texts import (
    SourceFetcher, atomic_json, digest, discover, display_url, export_state,
    open_state, register_documents, resource_body, source_code, terminal_redirect,
    version_document, walk_version, publish_resource,
)

DOC = {"key": "au-federal-r7531", "title": "A Test Bill2026", "jurisdiction": "federal", "introduced": "2026-08-20", "parliament": 48, "sources": [{"kind": "billhome", "url": display_url("legislation/billhome/r7531")}]}
VERSION = "r7531_first-reps"


def page(number, body=None, version=VERSION):
    text = body or (f"Section{number} of the bill. This is the complete source wording for this test section.")
    return f'<title>ParlInfo - Clause{number}</title><dl><dt>System Id</dt><dd>legislation/bills/{version}/{number:04d}</dd><dt>Date</dt><dd>20/08/2026</dd></dl><div id="documentContent"><p>{text}</p></div><div id="footer">Footer</div>'


class FakeFetcher:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []
    def get(self, url, refresh=False):
        number = int(url.split("%22")[1].split("/")[-1]) if "/" in url.split("%22")[1] else None
        self.calls.append(number)
        response = self.responses[number]
        return {"url": url, "location": None, "fetched_at": "2026-09-13T00:00:00+00:00", **response}


def ok(number, **kwargs):
    body = page(number, **kwargs)
    return {"status": 200, "body": body, "sha256": digest(body)}


END = {"status": 301, "location": "/parlInfo/search/summary/summary.w3p", "body": ""}


class BillTextTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.db = open_state(self.root / "state.sqlite")
        register_documents(self.db, [DOC])
        self.db.execute("INSERT INTO bill_text_versions(bill_key,source_version,stage) VALUES(?,?,?)", (DOC["key"], VERSION, "first-reps"))
        self.db.commit()
    def tearDown(self):
        self.db.close()
        self.temp.cleanup()
    def version(self):
        return version_document(self.db, DOC["key"], VERSION)
    def test_contiguous_walk_and_verified_terminal_produce_complete_text(self):
        source = FakeFetcher({0: ok(0), 1: ok(1), 2: END})
        self.assertEqual(walk_version(self.db, DOC["key"], VERSION, source), "complete")
        doc = self.version()
        self.assertTrue(doc["complete"])
        self.assertEqual(len(doc["sections"]), 2)
        self.assertEqual(doc["text"], "\n\n".join(s["text"] for s in doc["sections"]))
        self.assertIn("complete source wording", doc["text"])
        self.assertEqual(doc["version"]["source_version"], VERSION)
        self.assertEqual(doc["version"]["date"], "2026-08-20")
    def test_http_failure_and_cap_never_count_as_complete(self):
        for ending in [{"status": 404}, {"status": 403}, {"status": 502}]:
            source = FakeFetcher({0: ok(0), 1: ending})
            self.assertEqual(walk_version(self.db, DOC["key"], VERSION, source), "incomplete")
            self.assertFalse(self.version()["complete"])
        self.assertEqual(walk_version(self.db, DOC["key"], VERSION, FakeFetcher({}), max_sections=1), "incomplete")
        self.assertIn("cap", self.version()["version"]["coverage_note"])
    def test_resume_reuses_successful_sections_and_retries_missing_one(self):
        walk_version(self.db, DOC["key"], VERSION, FakeFetcher({0: ok(0), 1: {"status": 503}}))
        source = FakeFetcher({1: ok(1), 2: END})
        self.assertEqual(walk_version(self.db, DOC["key"], VERSION, source), "complete")
        self.assertEqual(source.calls, [1, 2])
        self.assertEqual(walk_version(self.db, DOC["key"], VERSION, FakeFetcher({})), "unchanged")
    def test_wrong_identity_and_empty_sections_stay_incomplete(self):
        for first in [ok(0, version="r9999_first-reps"), {"status": 200, "body": "<html>Not a bill</html>"}]:
            self.assertEqual(walk_version(self.db, DOC["key"], VERSION, FakeFetcher({0: first})), "incomplete")
            self.assertFalse(self.version()["complete"])
            self.assertEqual(self.version()["sections"], [])
    def test_only_same_host_summary_redirect_is_end(self):
        url = display_url("legislation/bills/r7531_first-reps/0002")
        self.assertTrue(terminal_redirect({**END, "url": url}))
        for location in ["https://evil.test/parlInfo/search/summary/summary.w3p", "/login", "/parlInfo/search/display/display.w3p"]:
            self.assertFalse(terminal_redirect({**END, "url": url, "location": location}))
        self.assertEqual(walk_version(self.db, DOC["key"], VERSION, FakeFetcher({0: END})), "incomplete")
    def test_registry_join_uses_identity_and_rejects_conflicting_sources(self):
        self.assertEqual(source_code(DOC), "r7531")
        self.assertIsNone(source_code({**DOC, "key": "au-federal-r9999"}))
        self.assertIsNone(source_code({"key": "au-federal-alrc-55", "title": DOC["title"]}))
    def test_cached_billhome_discovers_versions_without_network(self):
        cache = self.root / "billhome"; cache.mkdir()
        (cache / "r7531.html").write_text('<table class="bills-progress"></table><a href="/parlInfo/download/legislation/bills/r7531_first-reps/a.pdf">Bill</a><a href="/parlInfo/download/legislation/bills/r7531_aspassed/b.pdf">Bill</a><a href="/parlInfo/download/legislation/bills/r9999_first-reps/a.pdf">Unrelated</a>')
        self.assertEqual(discover(self.db, DOC, FakeFetcher({}), cache), [VERSION, "r7531_aspassed"])
    def test_export_separates_stages_and_reports_partial_versions(self):
        walk_version(self.db, DOC["key"], VERSION, FakeFetcher({0: ok(0), 1: END}))
        self.db.execute("INSERT INTO bill_text_versions(bill_key,source_version,stage) VALUES(?,?,?)", (DOC["key"], "r7531_aspassed", "aspassed")); self.db.commit()
        summary = export_state(self.db, self.root / "out")
        manifest = json.loads((self.root / "out" / DOC["key"] / "index.json").read_text())
        self.assertEqual(summary["complete_versions"], 1)
        self.assertEqual(manifest["status"], "incomplete")
        self.assertEqual(manifest["default_version_id"], "r7531-first-reps")
        self.assertEqual(manifest["versions"][0]["source_version"], "r7531_aspassed")
        self.assertEqual(manifest["versions"][0]["status"], "unavailable")
        doc = json.loads((self.root / "out" / DOC["key"] / "r7531-first-reps.json").read_text())
        self.assertTrue(doc["complete"])
    def test_publisher_keeps_summary_slug_separate_and_hashes_semantic_content(self):
        with self.assertRaises(ValueError):
            resource_body(self.version(), DOC)
        walk_version(self.db, DOC["key"], VERSION, FakeFetcher({0: ok(0), 1: END}))
        doc = self.version(); body = resource_body(doc, DOC)
        self.assertEqual(body["slug"], "bill-text-au-federal-r7531-first-reps")
        self.assertEqual(body["texts"]["body"]["body"], doc["text"])
        self.assertIn({"labelset": "kind", "label": "bill_text"}, body["usermetadata"]["classifications"])
        self.assertEqual(body["extra"]["metadata"]["bill_key"], DOC["key"])
        doc["version"]["fetched_at"] = "later"
        self.assertEqual(resource_body(doc, DOC)["extra"]["metadata"]["content_hash"], body["extra"]["metadata"]["content_hash"])
        doc["sections"][-1]["text"] += " Changed."
        doc["text"] += " Changed."
        self.assertNotEqual(resource_body(doc, DOC)["extra"]["metadata"]["content_hash"], body["extra"]["metadata"]["content_hash"])
    def test_publication_cache_records_only_success_and_verify_bypasses(self):
        walk_version(self.db, DOC["key"], VERSION, FakeFetcher({0: ok(0), 1: END}))
        body = resource_body(self.version(), DOC)
        calls = []
        def push(*args):
            calls.append(args)
            return "created"
        self.assertEqual(publish_resource(self.db, None, body, None, push), "created")
        self.assertEqual(publish_resource(self.db, None, body, None, push), "cached")
        self.assertEqual(len(calls), 1)
        self.assertEqual(publish_resource(self.db, None, body, None, push, verify=True), "created")
        body["extra"]["metadata"]["content_hash"] = "changed"
        self.assertEqual(publish_resource(self.db, None, body, None, lambda *a: "failed:503"), "failed:503")
        self.assertEqual(publish_resource(self.db, None, body, None, push), "created")
        self.assertEqual(len(calls), 3)
        self.assertEqual(publish_resource(self.db, None, body, None, push, publication_scope="other-kb"), "created")
        self.assertEqual(len(calls), 4)
    def test_section_offsets_preserve_non_bmp_characters_and_boundaries(self):
        walk_version(self.db, DOC["key"], VERSION, FakeFetcher({0: ok(0, body="A bill with a symbol 😀 and a sufficiently long source paragraph to extract."), 1: ok(1), 2: END}))
        doc = self.version(); body = resource_body(doc, DOC)
        metadata = body["extra"]["metadata"]
        self.assertIn({"labelset": "bill_key", "label": DOC["key"]}, body["usermetadata"]["classifications"])
        encoded = doc["text"].encode("utf-16-le")
        for expected, section in zip(doc["sections"], metadata["sections"]):
            self.assertEqual(encoded[section["start"] * 2:section["end"] * 2].decode("utf-16-le"), expected["text"])
        doc["text"] += "inconsistent"
        with self.assertRaises(ValueError): resource_body(doc, DOC)
    def test_verified_legacy_identity_survives_reregister_and_drives_discovery(self):
        legacy = {**DOC, "key": "au-federal-alrc-55", "sources": []}
        register_documents(self.db, [legacy])
        self.db.execute("INSERT INTO bill_text_identity_links VALUES(?,?,?,?)", (legacy["key"], "r7531", "{}", "today")); self.db.commit()
        register_documents(self.db, [legacy])
        self.assertEqual(self.db.execute("SELECT code FROM bill_text_bills WHERE bill_key=?", (legacy["key"],)).fetchone()[0], "r7531")
        cache = self.root / "home"; cache.mkdir()
        (cache / "r7531.html").write_text('<table class="bills-progress"></table><a href="/parlInfo/download/legislation/bills/r7531_first-reps/a.pdf">Bill</a>')
        self.assertEqual(discover(self.db, legacy, FakeFetcher({}), cache), [VERSION])
    def test_reconciliation_requires_exact_title_and_earliest_introduction_date(self):
        from scripts.publish_bill_texts import exact_identity_match
        home = {"short_title": DOC["title"], "events": [{"stage": "introduced", "date": "2026-08-20"}, {"stage": "introduced", "date": "2026-08-21"}]}
        self.assertTrue(exact_identity_match(DOC, home, str.casefold))
        self.assertFalse(exact_identity_match({**DOC, "introduced": "2026-08-21"}, home, str.casefold))
        self.assertFalse(exact_identity_match({**DOC, "introduced": None}, home, str.casefold))
        self.assertFalse(exact_identity_match(DOC, {**home, "short_title": "A Similar Bill2026"}, str.casefold))
        self.assertFalse(exact_identity_match(DOC, {**home, "events": []}, str.casefold))
    def test_terminal_proof_must_account_for_every_stored_section(self):
        walk_version(self.db, DOC["key"], VERSION, FakeFetcher({0: ok(0), 1: ok(1), 2: END}))
        self.db.execute("DELETE FROM bill_text_sections WHERE section_no=1"); self.db.commit()
        self.assertFalse(self.version()["complete"])
        with self.assertRaises(ValueError): resource_body(self.version(), DOC)
        self.assertEqual(walk_version(self.db, DOC["key"], VERSION, FakeFetcher({1: ok(1), 2: END})), "complete")
        self.assertTrue(self.version()["complete"])
    def test_missing_identity_invalidates_cached_error_document_for_retry(self):
        source = FakeFetcher({0: {"status": 200, "body": page(0).replace("System Id", "Other field")}})
        invalidated = []
        source.invalidate = invalidated.append
        self.assertEqual(walk_version(self.db, DOC["key"], VERSION, source), "incomplete")
        self.assertEqual(len(invalidated), 1)
        self.assertFalse(self.version()["complete"])
        self.assertEqual(walk_version(self.db, DOC["key"], VERSION, FakeFetcher({0: ok(0), 1: END})), "complete")
    def test_crawl_bounded_source_gaps_and_operational_failures_have_distinct_exits(self):
        import contextlib
        import io
        from types import SimpleNamespace
        from unittest.mock import patch
        from scripts import publish_bill_texts as cli
        from parli.ingest.bill_texts import SourceBlocked
        args = SimpleNamespace(bills_dir=self.root, keys=None, parliaments=None, limit=None,
            state_dir=self.root, source_rate=0.7, browser_ua=True, refresh_discovery=False,
            home_cache=None, max_sections=10, export_every=25, output_dir=self.root / "out", source_attempts=3)
        for outcome, expected, attempts in [("incomplete", 2, 3), (RuntimeError("operational fault"), 1, 1), (SourceBlocked("blocked"), 130, 1)]:
            with patch.object(cli, "load_documents", return_value=[DOC]), patch.object(cli, "discover", return_value=[VERSION]), patch.object(cli, "walk_version", side_effect=outcome if isinstance(outcome, Exception) else None, return_value=outcome) as walker, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(cli.crawl(args, self.db), expected)
                self.assertEqual(walker.call_count, attempts)
    def test_legacy_discovery_distinguishes_source_refusal_and_exhausted_listing_gap(self):
        import contextlib
        import io
        import sys
        from types import SimpleNamespace
        from unittest.mock import patch
        from scripts import publish_bill_texts as cli
        from parli.ingest.bill_texts import SourceBlocked
        sys.path.insert(0, str(cli.ROOT / "scripts/bills_registry"))
        import bills_fetch as registry
        legacy = {**DOC, "key": "au-federal-alrc-55", "sources": []}
        args = SimpleNamespace(bills_dir=self.root, keys=None, parliaments=None, limit=None,
            state_dir=self.root, home_cache=self.root / "homes", registry_db=self.root / "missing.db", reconcile_network=True, source_rate=0.7)
        with patch.object(cli, "load_documents", return_value=[legacy]), patch.object(registry, "enumerate_parliament", side_effect=registry.bc.Blocked("source refused")):
            with self.assertRaises(SourceBlocked): cli.reconcile(args, self.db)
        with patch.object(cli, "load_documents", return_value=[legacy]), patch.object(registry, "enumerate_parliament", side_effect=RuntimeError("listing unavailable")), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cli.reconcile(args, self.db), 2)
        report = json.loads((self.root / "identity-reconciliation.json").read_text())
        self.assertEqual(len(report["source_errors"]), 1)
        self.assertEqual(report["records"][0]["status"], "unresolved")
        with patch.object(cli, "reconcile", return_value=2), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cli.finish_legacy(args, self.db), 2)
    def test_fetcher_rejects_download_and_external_endpoints(self):
        fetcher = SourceFetcher(self.root / "cache")
        for url in ["https://parlinfo.aph.gov.au/parlInfo/download/legislation/bills/a.pdf", "https://evil.test/parlInfo/search/display/x"]:
            with self.assertRaises(ValueError): fetcher.get(url)
        with self.assertRaisesRegex(ValueError, "browser-ua"):
            fetcher.get(display_url("legislation/billhome/r7531"))


if __name__ == "__main__": unittest.main()
