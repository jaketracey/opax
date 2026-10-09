"""Money exports on temporary databases seeded from committed money JSON only."""
import contextlib
import copy
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest import mock

from scripts import export_money_graph as federal
from scripts import export_state_money as state

ROOT = Path(__file__).resolve().parents[1]
TOKENS = json.loads((ROOT / "docs/design/design-tokens.json").read_text())["party"]
PARTY_TOKENS = {"Labor": "labor", "Liberal": "liberal", "Nationals": "nationals", "LNP": "lnp",
                "Greens": "greens", "One Nation": "oneNation", "Independent": "independent"}


class PartyColourTests(unittest.TestCase):
    def test_both_exporters_load_every_party_dot_from_the_tokens(self):
        for exporter in (federal, state):
            colours = exporter.load_party_colours()
            for party, token in {**PARTY_TOKENS, "Other": "other"}.items():
                self.assertEqual(colours[party], TOKENS[token]["dot"])

    def test_token_edits_are_read_including_independent_and_other(self):
        changed = {**TOKENS, "independent": {"dot": "#123456"}, "other": {"dot": "#654321"}}
        for exporter in (federal, state):
            with mock.patch.object(Path, "read_text", return_value=json.dumps({"party": changed})):
                colours = exporter.load_party_colours()
            self.assertEqual(colours["Independent"], "#123456")
            self.assertEqual(colours["Other"], "#654321")

    def test_stdin_loads_tokens_from_the_export_hosts_checkout(self):
        for exporter in (federal, state):
            with mock.patch.object(exporter, "__file__", "<stdin>"), mock.patch.object(Path, "cwd", return_value=ROOT):
                self.assertEqual(exporter.load_party_colours(), exporter.PARTY_COLOURS)

    def test_federal_and_all_public_state_exports_change_only_disagreeing_colours(self):
        for jurisdiction in ("federal", "qld", "vic", "tas"):
            filename = "money.json" if jurisdiction == "federal" else f"money.{jurisdiction}.json"
            committed = json.loads((ROOT / "portal/public/graph" / filename).read_text())
            party_nodes = [n for n in committed["nodes"] if n["kind"] == "party"]
            old_colours = {n["label"]: n["colour"] for n in party_nodes}
            exporter = federal if jurisdiction == "federal" else state
            with self.subTest(jurisdiction=jurisdiction), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "fixture.sqlite"
                with sqlite3.connect(path) as db:
                    db.executescript("""
                        CREATE TABLE donations(donor_name, recipient_canonical, amount, financial_year,
                            industry, donor_type, donation_type);
                        CREATE TABLE ext_donations(donor_name, recipient_party, amount, financial_year,
                            industry, donor_type, disclosure_type, is_political_donation, election, jurisdiction);
                    """)
                    for n in party_nodes:
                        args = ("Fixture donor", n["label"], n["total"], "2025-26", "finance", "company")
                        db.execute("INSERT INTO donations VALUES (?,?,?,?,?,?,?)", (*args, "donation"))
                        db.execute("INSERT INTO ext_donations VALUES (?,?,?,?,?,?,?,?,?,?)",
                                   (*args, "gift", 1, None, jurisdiction))
                def run():
                    out = io.StringIO()
                    with mock.patch.object(exporter, "DB_PATH", str(path)), \
                            mock.patch("sys.argv", ["export", jurisdiction]), \
                            contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
                        exporter.main()
                    return json.loads(out.getvalue())
                with mock.patch.object(exporter, "PARTY_COLOURS", {**exporter.PARTY_COLOURS, **old_colours}):
                    before = run()
                after = run()
            expected = copy.deepcopy(before)
            for n in expected["nodes"]:
                if n["kind"] != "party":
                    continue
                token = PARTY_TOKENS.get(n["label"], "other")
                n["colour"] = TOKENS[token]["dot"]
            self.assertEqual(after, expected, "no totals, edges, non-party colours or shapes change")
            for n in after["nodes"]:
                if n["kind"] == "party":
                    self.assertEqual(n["colour"], TOKENS[PARTY_TOKENS.get(n["label"], "other")]["dot"])
            lnp = next((n for n in after["nodes"] if n["label"] == "LNP"), None)
            if lnp:
                self.assertEqual(lnp["colour"], old_colours["LNP"])


if __name__ == "__main__":
    unittest.main()
