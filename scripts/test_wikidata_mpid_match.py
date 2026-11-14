"""plan() in wikidata_mpid_match.py: only current, full-named members without a portrait, and only through a
single APH MP ID for their pid. Invented names."""
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.wikidata_mpid_match import file_title, free_licence, parliament_source, plan


class Plan(unittest.TestCase):
    def test_matches_only_by_one_mp_id(self):
        people = [
            {"name": "Tessa Quill", "pid": "90001", "current": True},     # wanted
            {"name": "Quill", "pid": "90001", "current": True},           # surname print: never
            {"name": "Oren Vale", "pid": "90002", "current": True},       # already has a face
            {"name": "Ida Marsh", "pid": "90003", "current": False},      # not current
            {"name": "Pia Brook", "pid": None, "current": True},          # no pid, no MP ID
            {"name": "Rex Dunmore", "pid": "90004", "current": True},     # two MP IDs on one pid
        ]
        pay = {"AAA1": {"pid": "90001"}, "BBB2": {"pid": "90002"}, "CCC3": {"pid": "90004"}, "DDD4": {"pid": "90004"}}
        wanted, report = plan(people, {"oren vale": "90002"}, pay)
        self.assertEqual({k: v["name"] for k, v in wanted.items()}, {"AAA1": "Tessa Quill"})
        self.assertEqual(report["Quill"], "single-name print, left alone")
        self.assertIn("no APH MP ID", report["Pia Brook"])
        self.assertIn("several MP IDs", report["Rex Dunmore"])
        self.assertNotIn("Oren Vale", report)
        self.assertNotIn("Ida Marsh", report)



def ext(**fields):
    return {k: {"value": v} for k, v in fields.items()}


class ParliamentSource(unittest.TestCase):
    """An invented Commons file sourced from a parliament site is refused, whatever its licence tag."""

    def test_official_sources_are_refused(self):
        aph = ext(Credit='<a href="https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=ZZ9">Source</a>',
                  Artist="Australian Government", LicenseShortName="CC BY 4.0")
        self.assertIn("aph.gov.au", parliament_source(aph))
        for credit in ("https://parlinfo.aph.gov.au/parlInfo/download/handbook/allmps/ZZ9/upload_ref_binary/zz9.jpg",
                       "https://www.parliament.vic.gov.au/members/tessa-quill/",
                       "<a href='https://www.parliament.nsw.gov.au/members/Pages/profiles/quill.aspx'>NSW</a>",
                       "https://www.parliament.act.gov.au/members/quill",
                       "Parliamentary Education Office, peo.gov.au",
                       "Department of Parliamentary Services", "From ParlInfo"):
            self.assertIsNotNone(parliament_source(ext(Credit=credit)), credit)
        self.assertIsNotNone(parliament_source(ext(Credit="Own work", Artist="Parliament of Queensland")))

    def test_ordinary_sources_pass(self):
        for meta in (ext(Credit="Own work", Artist="Ada Fixture", ImageDescription="Tessa Quill at a conference, 2026"),
                     ext(Credit='<a href="https://example.org/tessa-quill">Fixture party website</a>', Artist="Fixture Party"),
                     ext(Credit="https://notaph.gov.au.example.org/x"), {}):
            self.assertIsNone(parliament_source(meta), meta)

    def test_parliament_at_work_redistributions_are_refused(self):
        for description in ("Portrait from Parliament @ Work", "Parliament@Work", "Parliament&nbsp;@&nbsp;Work",
                            "Parliament <span>@</span> Work"):
            self.assertIsNotNone(parliament_source(ext(ImageDescription=description)), description)
        self.assertIsNotNone(parliament_source(ext(
            Credit='<a href="https://www.parliament.curriculum.edu.au/parl.php3?ID=999">Image</a>'
        )))

    def test_file_title(self):
        self.assertEqual(file_title("http://commons.wikimedia.org/wiki/Special:FilePath/Tessa%20Quill%20(2026).jpg"),
                         "File:Tessa Quill (2026).jpg")

    def test_only_explicit_free_licences_pass(self):
        for licence in ["CC BY 4.0", "CC BY-SA 2.5 au", "Public domain", "CC0", "GFDL"]:
            self.assertTrue(free_licence(licence), licence)
        for licence in ["CC BY-NC 4.0", "CC BY-ND 4.0", "CC BY 4.0 NC", "CC BY 9.9", "CC", "Attribution", "Publicity rights"]:
            self.assertFalse(free_licence(licence), licence)


if __name__ == "__main__":
    unittest.main()
