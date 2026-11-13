"""The office-pay builder, on instrument text small enough to check by hand.

    python3 -m unittest scripts/test_build_pay_offices.py

The fixture is the shape docx_lines() produces from a determination: paragraphs as
text and table rows as 'ROW | cell | cell'. Departments, offices, amounts and the
named holders are invented; no network is used.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_pay_offices as bpo  # noqa: E402

SECRETARIES = [
    "Remuneration Tribunal (Departmental Secretaries—Classification Structure and Terms and Conditions) Determination 2026",
    "Compilation No. 2",
    "Compilation date: 30 August 2026",
    "11 Classification structure",
    "ROW | Table 2A—Classification structure | ",
    "ROW | Column 1 Level | Column 2 Pay point | Column 3 Total remuneration (per year)",
    "ROW | Level 1 (the Prime Minister and Cabinet) |  | $1,000,000",
    "ROW | Level 2 (the Treasury) |  | $990,000",
    "ROW | Level 3 | 1 | $950,000",
    "ROW | Level 3 | 2 | $900,000",
    "(2) The following table (Table 2B) sets out the classification level ...",
    "ROW | Table 2B—Classification of offices of Secretary",
    "ROW | Level | Departments",
    "ROW | Level 1 | The Prime Minister and Cabinet",
    "ROW | Level 2 | The Treasury",
    "ROW | Level 3 | The following Departments: (a) Finance; (b) Lighthouses and Weather; (c) Attorney-General’s",
    "(3) A Secretary at level 1 or level 2 is entitled to ...",
]

FULL_TIME = [
    "Compilation date: 22 October 2026",
    "ROW | Table 2A—Total remuneration",
    "ROW | Column 1 Office | Column 2 Total remuneration (per year) | Column 3 Special provisions | Column 4 Travel tier",
    "ROW | Chair, Australian Lighthouse Authority | $800,000 |  | 1",
    "ROW | Deputy Chair, Australian Lighthouse Authority | $600,000 |  | 1",
    "ROW | Commonwealth Ombudsman | $500,000 |  | 1",
    "ROW | Chief Executive Officer, Kite Safety Agency | $400,000 | Table 2B, item 1 | 2",
    "ROW | Chief Executive Officer, Bell Ringing Agency | $300,000 | Table 2B, item 2 | 2",
    "ROW | Australian Electoral Officer for Somewhere | $200,000 |  | 2",
    "11 Special provisions for certain offices",
    "ROW | Table 2B—Special provisions for certain offices",
    "ROW | Item | Column 1 Office | Column 2 Special provision",
    "ROW | 1 | Chief Executive Officer, Kite Safety Agency | Total remuneration for Ms Wren Example is $450,000, for the initial term of her appointment.",
    "ROW | 2 | Chief Executive Officer, Bell Ringing Agency | Mr Rook Sample will receive a personal loading of $10,000 per year from 1 July 2024.",
    "12 Part-time work",
    "ROW | Table 3B—Superannuation salary for specified office holders",
    "ROW | Item | Column 1 Office or office holder | Column 2 Superannuation salary",
    "ROW | 1 | Dr Finch Placeholder, Commonwealth Ombudsman | $350,000",
    "ROW | 2 | Deputy Chair, Australian Lighthouse Authority | $420,000",
]

STATUTORY = [
    "Compilation date: 30 August 2026",
    "ROW | Table 2A—Total remuneration",
    "ROW | Column 1 Specified statutory office | Column 2 Total remuneration (per year)",
    "ROW | Commissioner of Taxation | $920,000",
]

PEO = [
    "Compilation date: 30 August 2026",
    "ROW | Table 2A—Classification structure and remuneration ranges",
    "ROW | Column 1 Classification | Column 2 Total remuneration range",
    "ROW | PEO band A | up to $200,000",
    "ROW | PEO band B | $180,000 to $300,000",
    "ROW | PEO band E | from $600,000",
    "13 Remuneration",
]


def sources():
    out = {}
    for key, date in [("secretaries", "2026-08-30"), ("full_time", "2026-10-22"), ("statutory", "2026-08-30"), ("peo", "2026-08-30")]:
        out[key] = {"id": key, "frl_id": f"F2026L0000{len(out)}", "compilation_id": f"F2026C0000{len(out)}", "compilation_no": 2,
                    "compilation_date": date, "registered": "2026-11-01", "title": f"{key} determination",
                    "url": f"https://www.legislation.gov.au/F2026L0000{len(out)}/latest/text", "publisher": "Federal Register of Legislation", "_doc": "x"}
    return out


class BuildPayOffices(unittest.TestCase):
    def setUp(self):
        self.data = bpo.build({"secretaries": SECRETARIES, "full_time": FULL_TIME, "statutory": STATUTORY, "peo": PEO}, sources(), "2026-11-13")
        self.rows = {r["office"]: r for r in self.data["offices"]}

    def test_meta_is_self_describing(self):
        meta = self.data["meta"]
        self.assertEqual(meta["as_of"], "2026-10-22")
        self.assertEqual([s["id"] for s in meta["sources"]], ["secretaries", "full_time", "statutory", "peo"])
        self.assertTrue(all("_doc" not in s for s in meta["sources"]))
        self.assertIn("superannuation", meta["measure"])
        frl = {s["id"]: s["frl_id"] for s in meta["sources"]}
        self.assertTrue(all(r["frl_id"] == frl[r["source"]] for r in self.data["offices"]))

    def test_fixed_secretaries_and_ranges(self):
        pmc = self.rows["Secretary of the Department of the Prime Minister and Cabinet"]
        self.assertEqual((pmc["amount"], pmc["classification"], pmc["kind"]), (1_000_000, "Level 1", "secretary"))
        self.assertEqual(self.rows["Secretary to the Treasury"]["amount"], 990_000)
        finance = self.rows["Secretary of the Department of Finance"]
        self.assertIsNone(finance["amount"])
        self.assertEqual((finance["min"], finance["max"]), (900_000, 950_000))
        self.assertIn("pay point", finance["special"])
        self.assertIn("finance", finance["keys"])
        self.assertIn("Attorney-General’s Department", [r["body"] for r in self.data["offices"]])
        self.assertIn("Secretary of the Department of Lighthouses and Weather", self.rows)

    def test_full_time_offices_and_heads(self):
        chair = self.rows["Chair, Australian Lighthouse Authority"]
        self.assertEqual((chair["amount"], chair["body"], chair["head"], chair["clause"]), (800_000, "Australian Lighthouse Authority", True, "s 10, Table 2A"))
        self.assertFalse(self.rows["Deputy Chair, Australian Lighthouse Authority"]["head"])
        self.assertFalse(self.rows["Australian Electoral Officer for Somewhere"]["head"])
        ombudsman = self.rows["Commonwealth Ombudsman"]
        self.assertIsNone(ombudsman["body"])
        self.assertIn("ombudsman", ombudsman["aliases"])
        self.assertEqual(self.rows["Commissioner of Taxation"]["kind"], "statutory_office")

    def test_holders_only_where_the_instrument_names_them(self):
        kite = self.rows["Chief Executive Officer, Kite Safety Agency"]["holder"]
        self.assertEqual((kite["name"], kite["amount"], kite["clause"], kite["checked"]), ("Wren Example", 450_000, "s 11, Table 2B item 1", "2026-11-13"))
        bell = self.rows["Chief Executive Officer, Bell Ringing Agency"]["holder"]
        self.assertEqual((bell["name"], bell["amount"]), ("Rook Sample", 310_000))
        self.assertEqual(self.rows["Commonwealth Ombudsman"]["holder"]["name"], "Finch Placeholder")
        self.assertNotIn("amount", self.rows["Commonwealth Ombudsman"]["holder"])
        # A Table 3B row naming an office, not a person, names nobody.
        self.assertNotIn("holder", self.rows["Deputy Chair, Australian Lighthouse Authority"])
        self.assertNotIn("holder", self.rows["Chair, Australian Lighthouse Authority"])
        self.assertTrue(all(r["holder"]["url"].startswith("https://www.legislation.gov.au/") for r in self.data["offices"] if "holder" in r))

    def test_peo_bands_are_ranges(self):
        bands = [r for r in self.data["offices"] if r["kind"] == "peo_band"]
        self.assertEqual([(b["classification"], b["min"], b["max"]) for b in bands],
                         [("PEO band A", None, 200_000), ("PEO band B", 180_000, 300_000), ("PEO band E", 600_000, None)])
        self.assertTrue(all(b["amount"] is None and not b["head"] for b in bands))

    def test_ranked_highest_first_with_bands_last(self):
        offices = [r["office"] for r in self.data["offices"]]
        self.assertEqual(offices[0], "Secretary of the Department of the Prime Minister and Cabinet")
        self.assertEqual(offices[1], "Secretary to the Treasury")
        self.assertEqual(offices[-1], "Principal Executive Office, band E")

    def test_compilation_date_must_agree_with_the_register(self):
        src = sources()
        src["peo"]["compilation_date"] = "2026-07-01"
        with self.assertRaises(ValueError):
            bpo.build({"peo": PEO}, src, "2026-11-13")

    def test_fold_matches_ask(self):
        self.assertEqual(bpo.fold("Attorney-General’s PM&C"), "attorney generals pm and c")


if __name__ == "__main__":
    unittest.main()
