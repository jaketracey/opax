"""Promotion gates against copies of the reviewed snapshot; no source requests."""
from contextlib import redirect_stdout, redirect_stderr
from io import StringIO
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

from scripts.promote_hub_data import ROOT, ASSETS, digest, promote, public_budget_projection


class PromoteHubDataTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="opax-promote-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        shutil.copytree(ROOT / "data/staged", self.root / "data/staged", ignore=shutil.ignore_patterns("audit", "instruments"))
        (self.root / "parli/ingest").mkdir(parents=True)
        (self.root / "parli/ingest/user-agent.json").symlink_to(ROOT / "parli/ingest/user-agent.json")
        public = self.root / "portal/public"
        public.mkdir(parents=True)
        for name in ("votes.json", "parliamentarians.json", "person-paths.js"):
            (public / name).symlink_to(ROOT / "portal/public" / name)

    def edit(self, hub, name, mutate):
        path = self.root / "data/staged" / hub / name
        data = json.loads(path.read_bytes())
        mutate(data)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

    def run_promotion(self, hubs, **options):
        errors = StringIO()
        with redirect_stdout(StringIO()), redirect_stderr(errors):
            code = promote(hubs, self.root, **options)
        return code, errors.getvalue()

    def existing_asset(self, hub):
        target = self.root / "portal/public" / ASSETS[hub]
        self.assertEqual(self.run_promotion([hub])[0], 0)
        before = target.read_bytes()
        return target, before

    def test_promotes_both_and_keeps_votes_bytes(self):
        before = (self.root / "portal/public/votes.json").read_bytes()
        self.assertEqual(self.run_promotion(list(ASSETS))[0], 0)
        self.assertEqual(self.run_promotion(list(ASSETS), check_public=True)[0], 0)
        self.assertEqual((self.root / "portal/public/votes.json").read_bytes(), before)
        for hub in ASSETS:
            public = json.loads((self.root / "portal/public" / ASSETS[hub]).read_bytes())
            staged = json.loads((self.root / "data/staged" / hub / "hub.json").read_bytes())
            manifest = public.pop("promotion")
            if hub == "budget":
                staged["portfolio_indexes"] = [p for p in staged["portfolio_indexes"] if p.get("status") != "held"]
            self.assertEqual(public, staged)
            self.assertEqual(len(manifest["input_sha256"]), 64)

    def test_state_bill_held_text_or_forged_licence_never_replaces_asset(self):
        for hub in ("bills-tas", "bills-act"):
            for field, value in (("body", "HELD BILL TEXT"), ("licence", {"status": "open", "text_allowed": True})):
                with self.subTest(hub=hub, field=field):
                    target, before = self.existing_asset(hub)
                    original = (self.root / "data/staged" / hub / "hub.json").read_bytes()
                    self.edit(hub, "hub.json", lambda d: d["bills"][0].update({field: value}))
                    # Even an input with renewed review hashes must match the
                    # metadata projection of the retained authoritative bytes.
                    stage = self.root / "data/staged" / hub
                    self.edit(hub, "review.json", lambda d: d["inputs"].update({"hub.json": digest((stage / "hub.json").read_bytes())}))
                    code, error = self.run_promotion([hub])
                    self.assertEqual(code, 1)
                    self.assertIn("source-projection", error)
                    self.assertEqual(target.read_bytes(), before)
                    self.assertNotIn(b"HELD BILL TEXT", target.read_bytes())
                    (stage / "hub.json").write_bytes(original)
                    self.edit(hub, "review.json", lambda d: d["inputs"].update({"hub.json": digest(original)}))

    def test_state_bill_hash_and_stopped_collection_gates(self):
        for hub in ("bills-tas", "bills-act"):
            target, before = self.existing_asset(hub)
            self.edit(hub, "receipts.json", lambda d: d.update(stopped={"reason": "HTTP 403"}))
            code, error = self.run_promotion([hub])
            self.assertEqual(code, 1)
            self.assertIn("source-receipt", error)
            self.assertEqual(target.read_bytes(), before)

    def test_held_access_and_licence_indexes_in_staged_input_are_dropped(self):
        indexes = [
            {"id": "fixture-held-access", "url": "https://treasury.gov.au/fixture-access", "status": "held"},
            {"id": "fixture-held-licence", "url": "https://treasury.gov.au/fixture-licence", "licence": {"status": "blocked"}},
        ]
        self.edit("budget", "inventory.json", lambda d: (d["portfolio_indexes"].extend(indexes), d["counts"].update(portfolio_indexes=307)))
        self.edit("budget", "hub.json", lambda d: d["portfolio_indexes"].extend(indexes))
        stage = self.root / "data/staged/budget"
        # This fixture represents a reviewed staged snapshot containing holds.
        self.edit("budget", "review.json", lambda d: d["inputs"].update({name: digest((stage / name).read_bytes()) for name in ("inventory.json", "hub.json")}))
        self.assertEqual(self.run_promotion(["budget"])[0], 0)
        data = (self.root / "portal/public/budget/data.json").read_text()
        for index in indexes:
            self.assertNotIn(index["id"], data)
            self.assertNotIn(index["url"], data)
        hub = json.loads(data)
        self.assertEqual(hub["promotion"]["counts"]["held_portfolio_indexes_excluded"], 40)
        self.assertEqual(len(hub["portfolio_indexes"]), 267)

    def test_held_identity_leaking_through_other_fields_refuses_and_preserves_asset(self):
        target, before = self.existing_asset("budget")
        held = json.loads((self.root / "data/staged/budget/inventory.json").read_bytes())["held"][0]
        for identity in (held["id"], held["url"]):
            with self.subTest(identity=identity), mock.patch("scripts.promote_hub_data.public_budget_projection",
                    side_effect=lambda hub: {**public_budget_projection(hub), "scope": "Fixture reference " + identity}):
                code, errors = self.run_promotion(["budget"])
                self.assertEqual(code, 1)
                self.assertIn("held-output:", errors)
                self.assertEqual(target.read_bytes(), before)

    def test_unfiltered_held_index_output_refuses_without_creating_asset(self):
        with mock.patch("scripts.promote_hub_data.public_budget_projection", side_effect=lambda hub: hub):
            code, errors = self.run_promotion(["budget"])
        self.assertEqual(code, 1)
        self.assertIn("held-output:", errors)
        self.assertFalse((self.root / "portal/public/budget").exists())

    def test_tampered_hash_refuses_each_hub_and_preserves_last_good_asset(self):
        for hub in ASSETS:
            target, before = self.existing_asset(hub)
            if hub == "budget":
                self.edit(hub, "aggregates.json", lambda d: d[0].update(sha256="0" * 64))
            else:
                self.edit(hub, "receipts.json", lambda d: d["receipts"][0].update(sha256="0" * 64))
            code, errors = self.run_promotion([hub])
            self.assertEqual(code, 1)
            self.assertIn("hash:", errors)
            self.assertEqual(target.read_bytes(), before)

    def test_held_period_refuses_without_creating_assets(self):
        self.edit("vic-gifts", "inventory.json", lambda d: d["holds"].append({"reason": "fixture hold"}))
        code, errors = self.run_promotion(["vic-gifts"])
        self.assertEqual(code, 1)
        self.assertIn("held-period:", errors)
        self.assertFalse((self.root / "portal/public/vic-gifts").exists())

    def test_count_mismatch_refuses_each_hub_without_creating_assets(self):
        for hub, key in (("budget", "aggregate_rows"), ("vic-gifts", "rows")):
            self.edit(hub, "inventory.json", lambda d: d["counts"].update({key: 999}))
            code, errors = self.run_promotion([hub])
            self.assertEqual(code, 1)
            self.assertIn("counts:", errors)
            self.assertFalse((self.root / "portal/public" / hub).exists())

    def test_unreviewed_change_refused_and_other_hub_still_promoted(self):
        self.edit("budget", "review.json", lambda d: d["inputs"].update({"hub.json": "0" * 64}))
        code, errors = self.run_promotion(list(ASSETS))
        self.assertEqual(code, 1)
        self.assertIn("review-hash:", errors)
        self.assertFalse((self.root / "portal/public/budget").exists())
        self.assertTrue((self.root / "portal/public/vic-gifts/data.json").exists())

    def test_held_budget_row_is_rejected(self):
        held = json.loads((self.root / "data/staged/budget/inventory.json").read_bytes())["held"][0]
        self.edit("budget", "aggregates.json", lambda d: d[0].update(document_id=held["id"]))
        code, errors = self.run_promotion(["budget"])
        self.assertEqual(code, 1)
        self.assertIn("held-row:", errors)

    def test_held_budget_release_is_rejected(self):
        self.edit("budget", "inventory.json", lambda d: d["releases"][0].update(status="held"))
        code, errors = self.run_promotion(["budget"])
        self.assertEqual(code, 1)
        self.assertIn("held-period:", errors)

    def test_missing_publication_licence_receipt_is_rejected(self):
        self.edit("budget", "inventory.json", lambda d: d["documents"][0]["licence"].update(document_url="https://budget.gov.au/fixture-missing.pdf"))
        code, errors = self.run_promotion(["budget"])
        self.assertEqual(code, 1)
        self.assertIn("licence-receipt:", errors)

    def test_official_link_is_rechecked_against_unique_victorian_roster(self):
        self.edit("vic-gifts", "hub.json", lambda d: d["registers"][0]["rows"][0]["official"].update(href="/subject/person/fixture-other"))
        # Keep the register copy consistent, to reach the identity gate.
        hub = json.loads((self.root / "data/staged/vic-gifts/hub.json").read_bytes())
        register = hub["registers"][0]
        path = self.root / "data/staged/vic-gifts/registers" / (register["document"]["id"] + ".json")
        path.write_text(json.dumps(register))
        code, errors = self.run_promotion(["vic-gifts"])
        self.assertEqual(code, 1)
        self.assertIn("official-links:", errors)


if __name__ == "__main__":
    unittest.main()
