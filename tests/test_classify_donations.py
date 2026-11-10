"""Offline regressions for OPAX's donor industry grouping rules."""
import contextlib
import io
import sqlite3
import unittest

from parli.ingest.classify_donations import (
    INDUSTRY_KEYWORDS, classify_donations, classify_donor_name,
)


# The same cases exercise the ingest helper and the SQL update. None means the
# name supplies no keyword evidence, rather than an inferred replacement sector.
CASES = {
    "Crown Castle Australia": "telecom",
    "Crown Equipment Pty Ltd": None,
    "CROWN RESORTS LIMITED": "gambling",
    "Crown Melbourne Limited": "gambling",
    "Crown Perth": "gambling",
    "Crown Sydney Gaming Pty Ltd": "gambling",
    "Crown Entertainment Group Holdings": "gambling",
    "Wargaming Australia": None,
    "Tattsfield Design": None,
    "Kenora Design": None,
    "Lotteriesque Design": None,
    "Australian Youth Climate Coalition": None,
    "Mineralist Studio": None,
    "Capricorn Coast Sand and Soil": None,
    "Queensland Gaskets Pty Ltd": None,
    "VULY TRAMPOLINES PTY LTD": None,
    "Sara Prendergast": None,
    "Sustainability Wise Pty Ltd": None,
    "Banksia Strategic Partners Pty Ltd": None,
    "Tranzmile Pty Ltd": None,
    "Actualisation Group Pty Ltd": None,
    "Asuria People Services Pty Ltd": None,
    "Ranjini Somasundaram": None,
    "Australian Publishers Association": None,
    "Publishing and Broadcasting Ltd": "media",
    "Publishing & Broadcasting Limited": "media",
    "Rheinmetall Defence Australia Pty Ltd": "defence",
    "Medibank Health Solutions": "health",
    "Hospitality Tasmania": "hospitality",
    "Wesfarmers Limited": "retail",
    "Coleslaw Design": None,
    "Swine Services": None,
    "Metal Recycling Pty Ltd": None,
    "Reconstruction Workshop": None,
    "Decapitation Design": None,
    "Gallens Studio": None,
    "Adoptus Design": None,
    "Broche Design": None,
    "Insecurity Design": None,
    "Fairport Ceramics": None,
    "Suezanne Design": None,
    "Nonadult Entertainment": None,
    "Australia Energy Windfarm Pty Ltd": None,
    "(Sportsbet), Pty Ltd": "gambling",
    "ClubsNSW": "gambling",
    "Australian Gaming Council": "gambling",
    "Australian Lotteries Pty Ltd": "gambling",
    "Tatts Group": "gambling",
    "Keno (Australia) Pty Ltd": "gambling",
    "Tabcorp Holdings Limited": "gambling",
    "Mineralogy Pty Ltd": "mining",
    "Minerals Council of Australia": "mining",
    "Mineral Resources Limited": "mining",
    "Centennial Coal": "mining",
    "Yancoal Australia": "mining",
    "BHP Billiton Limited": "mining",
    "BP Australia": "fossil_fuels",
    "BP": "fossil_fuels",
    " bp ": "fossil_fuels",
    "Ampol Limited": "fossil_fuels",
    "Southern Oil Refining Pty Ltd": "fossil_fuels",
    "Allgas Energy Pty Ltd": "fossil_fuels",
    "Elgas Limited": "fossil_fuels",
    "Consolidated Properties Group Pty Ltd": "property",
    "Adco Constructions Pty Ltd": "property",
    "ANZ Banking Group Limited": "finance",
    "NAB Limited": "finance",
    "Allianz Australia Limited": "finance",
    "Birubi Investments Pty Ltd": "finance",
    "Banks Pty Ltd": "finance",
    "PricewaterhouseCoopers": "finance",
    "Smith Solicitors": "legal",
    "Australian Hotels Association": "hospitality",
    "NT Pubco Pty Ltd": "hospitality",
    "The Community and Public Sector Union": "unions",
    "Liquor Hospitality & Miscellaneous Workers Union": "unions",
    "Unions NSW": "unions",
    "BRUCK TEXTILES PTY LTD": "unions",
    "SDAE Qld": "unions",
    "Novartis Pharmaceuticals Australia Pty Ltd": "pharmacy",
    "GlaxoSmithKline Australia Pty": "pharmacy",
    "Abbott Laboratories": "pharmacy",
    "Australian Distillers Association": "alcohol",
    "Treasury Wine Estates": "alcohol",
    "Meta Platforms Australia": "tech",
    "Australian Agricultural Company Limited": "agriculture",
    "Brazil Farming Pty Ltd": "agriculture",
    "Ridley Agriproducts Pty Ltd": "agriculture",
    "Graincorp Operations Ltd": "agriculture",
    "Nolan Meats Pty Ltd": "agriculture",
    "Woolworths Group Limited": "agriculture",
    "Wilson Security": "security",
    "Airlines of Tasmania Pty Ltd": "transport",
    "Sydney Airports Corporation Limited": "transport",
    "Global Educational Supplies & Services Pty Ltd": "education",
    "Independent Schools Queensland Ltd": "education",
    None: "unidentified",
    " N/A ": "unidentified",
    "--": "unidentified",
    "AB": "unidentified",
    "": "unidentified",
}


class ClassifyDonationsTests(unittest.TestCase):
    def test_each_keyword_still_matches_its_industry_as_complete_words(self):
        for industry, keywords in INDUSTRY_KEYWORDS.items():
            for keyword in keywords:
                with self.subTest(industry=industry, keyword=keyword):
                    self.assertEqual(classify_donor_name(keyword + " Pty Ltd"), industry)

    def test_ingest_name_groupings(self):
        for name, expected in CASES.items():
            with self.subTest(name=name):
                self.assertEqual(classify_donor_name(name), expected)

    def test_database_pass_handles_more_names_than_one_sql_parameter_batch(self):
        with contextlib.closing(sqlite3.connect(":memory:")) as db:
            db.execute("CREATE TABLE donations (donor_name TEXT, industry TEXT, donor_type TEXT)")
            db.executemany("INSERT INTO donations VALUES (?, NULL, 'organisation')",
                           [(f"Crown Resorts Branch {i}",) for i in range(1100)])
            with contextlib.redirect_stdout(io.StringIO()):
                counts = classify_donations(db)
            self.assertEqual(counts["gambling"], 1100)
            self.assertEqual(db.execute(
                "SELECT COUNT(*) FROM donations WHERE industry = 'gambling'"
            ).fetchone()[0], 1100)

    def test_sql_pass_matches_helper_and_preserves_amounts_and_existing_labels(self):
        with contextlib.closing(sqlite3.connect(":memory:")) as db:
            db.execute("""CREATE TABLE donations (
                donor_name TEXT, industry TEXT, donor_type TEXT, amount REAL
            )""")
            # Repeated names and fractional amounts exercise all matching rows.
            rows = [(name, None, "organisation", amount)
                    for name in CASES for amount in (1234.56, 789.01)]
            rows += [("Crown Resorts Limited", "other", "organisation", 12.34),
                     ("Sara Prendergast", None, "individual", 56.78)]
            db.executemany("INSERT INTO donations VALUES (?, ?, ?, ?)", rows)
            before = db.execute("SELECT rowid, donor_name, donor_type, amount FROM donations").fetchall()
            with contextlib.redirect_stdout(io.StringIO()):
                counts = classify_donations(db)
                second_counts = classify_donations(db)
            actual = db.execute("SELECT industry FROM donations ORDER BY rowid").fetchall()
            expected = [industry for industry in CASES.values() for _ in range(2)] + ["other", "individual"]
            self.assertEqual([r[0] for r in actual], expected)
            self.assertEqual(counts["gambling"], 24)
            self.assertEqual(counts["individual"], 1)
            self.assertTrue(all(count == 0 for count in second_counts.values()))
            self.assertEqual(db.execute(
                "SELECT rowid, donor_name, donor_type, amount FROM donations"
            ).fetchall(), before)


if __name__ == "__main__":
    unittest.main()
