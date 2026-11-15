"""The "On this day" index (scripts/build_on_this_day.py).

Invented bills prove the rules: every dated division and speech is listed once under its
month and day, oldest first, with nothing ranked or dropped; every calendar date has a
file. The committed files are checked for shape and size.
"""
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_on_this_day as B


def bill(key, divisions=(), speeches=(), short_title=None):
    return {"key": key, "title": f"Invented {key} Bill", "short_title": short_title,
            "divisions": list(divisions), "speeches": list(speeches)}


def division(key, date, stage="Second reading", house="representatives"):
    return {"key": key, "date": date, "house": house, "stage": stage,
            "url": f"https://theyvoteforyou.org.au/divisions/{house}/{date}/1"}


def speech(slug, date, speaker="Invented Speaker"):
    return {"slug": slug, "speaker": speaker, "party": "Invented Party", "date": date,
            "brief": "A machine-written line the index must not carry."}


BILLS = [
    bill("au-federal-r10", [division("federal-representatives-20", "2019-11-15"),
                            division("federal-representatives-3", "2019-11-15", stage=None)],
         [speech("speech-200", "2019-11-15"), speech("speech-30", "2019-11-15")]),
    bill("au-federal-r9", [division("federal-representatives-20", "2019-11-15")],
         [speech("speech-200", "2019-11-15"), speech("speech-5", "2014-11-15T10:00:00"),
          speech("speech-6", ""), speech("speech-7", "2020-02-29", speaker=" ")],
         short_title="Invented Short Bill"),
    bill("au-federal-s2", [division("federal-senate-1", "2024-02-29", house="senate")]),
]


class Collect(unittest.TestCase):
    def setUp(self):
        self.days = B.collect(BILLS)

    def test_every_calendar_date_has_an_entry(self):
        self.assertEqual(len(self.days), 366)
        self.assertIn("02-29", self.days)
        self.assertEqual(self.days["01-01"], {"divisions": [], "speeches": [], "bills": {}})

    def test_rows_are_oldest_first_then_in_number_order(self):
        day = self.days["11-15"]
        self.assertEqual([d["key"] for d in day["divisions"]],
                         ["federal-representatives-3", "federal-representatives-20"])
        self.assertEqual([s["slug"] for s in day["speeches"]],
                         ["speech-5", "speech-30", "speech-200"])
        self.assertEqual(day["speeches"][0]["date"], "2014-11-15")

    def test_a_record_under_several_bills_is_listed_once_under_the_first_in_register_order(self):
        day = self.days["11-15"]
        shared = [d for d in day["divisions"] if d["key"] == "federal-representatives-20"]
        self.assertEqual(len(shared), 1)
        self.assertEqual(shared[0]["bill"], "au-federal-r9")
        self.assertEqual([s["bill"] for s in day["speeches"] if s["slug"] == "speech-200"],
                         ["au-federal-r9"])
        # The order the bills are read in makes no difference.
        self.assertEqual(B.collect(list(reversed(BILLS))), self.days)

    def test_each_bill_is_named_once_a_file_by_its_short_title_when_it_has_one(self):
        self.assertEqual(self.days["11-15"]["bills"], {
            "au-federal-r9": "Invented Short Bill", "au-federal-r10": "Invented au-federal-r10 Bill"})

    def test_rows_carry_the_record_and_nothing_about_party_or_machine_text(self):
        day = self.days["11-15"]
        self.assertEqual(set(day["divisions"][0]), {"key", "date", "house", "stage", "bill", "url"})
        self.assertIsNone(day["divisions"][0]["stage"])
        self.assertEqual(set(day["speeches"][0]), {"slug", "date", "speaker", "bill"})
        self.assertNotIn("Invented Party", json.dumps(self.days))
        self.assertNotIn("machine-written", json.dumps(self.days))

    def test_undated_or_unattributed_speeches_are_left_out_and_29_february_stands_alone(self):
        slugs = {s["slug"] for d in self.days.values() for s in d["speeches"]}
        self.assertEqual(slugs, {"speech-5", "speech-30", "speech-200"})
        self.assertEqual([d["key"] for d in self.days["02-29"]["divisions"]], ["federal-senate-1"])
        self.assertEqual(self.days["02-28"]["divisions"], [])

    def test_a_division_without_a_date_stops_the_build(self):
        with self.assertRaises(B.IndexError_):
            B.collect([bill("au-federal-r1", [division("federal-representatives-1", "")])])


class Files(unittest.TestCase):
    def write(self, folder):
        (folder / "index.json").write_text(json.dumps({"generated_at": "2026-10-04T16:27:54+00:00"}))
        for b in BILLS:
            (folder / f"{b['key']}.json").write_text(json.dumps(b))

    def test_build_check_and_rebuild(self):
        with tempfile.TemporaryDirectory() as tmp:
            bills, out = Path(tmp) / "bills", Path(tmp) / "out"
            bills.mkdir()
            self.write(bills)
            args = ["--bills", str(bills), "--out", str(out)]
            self.assertEqual(B.main(args + ["--check"]), 1)
            self.assertEqual(B.main(args), 0)
            self.assertEqual(B.main(args + ["--check"]), 0)
            self.assertEqual(len(list(out.glob("*.json"))), 366)
            day = json.loads((out / "11-15.json").read_text())
            self.assertEqual(day["schema_version"], 1)
            self.assertEqual(day["day"], "11-15")
            self.assertEqual(day["generated_at"], "2026-10-04T16:27:54+00:00")
            self.assertEqual(day["sources"]["divisions"]["publisher"], "They Vote For You")
            self.assertEqual(len(day["divisions"]), 2)
            # A stray file is removed, a changed one is caught.
            (out / "13-01.json").write_text("{}")
            (out / "11-15.json").write_text("{}")
            self.assertEqual(B.main(args + ["--check"]), 1)
            self.assertEqual(B.main(args), 0)
            self.assertFalse((out / "13-01.json").exists())
            self.assertEqual(B.main(args + ["--check"]), 0)

    def test_no_bill_files_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            bills, out = Path(tmp) / "bills", Path(tmp) / "out"
            bills.mkdir()
            (bills / "index.json").write_text(json.dumps({"generated_at": "2026-10-04T00:00:00+00:00"}))
            self.assertEqual(B.main(["--bills", str(bills), "--out", str(out)]), 2)
            self.assertFalse(out.exists())


class Published(unittest.TestCase):
    """The committed files. They may lag a bills refresh (the nightly export does not
    rebuild them yet), so this checks their shape, not equality with a rebuild."""

    def test_every_date_has_a_small_well_formed_file(self):
        paths = sorted(B.OUT.glob("*.json"))
        self.assertEqual([p.name for p in paths], [f"{day}.json" for day in B.all_days()])
        sizes = [p.stat().st_size for p in paths]
        self.assertLess(max(sizes), 64_000)
        self.assertLess(sum(sizes), 4_000_000)
        seen = {"divisions": set(), "speeches": set()}
        for path in paths:
            day = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(day["schema_version"], B.SCHEMA_VERSION)
            self.assertEqual(day["day"], path.stem)
            for kind, ident in (("divisions", "key"), ("speeches", "slug")):
                rows = day[kind]
                self.assertEqual(rows, sorted(rows, key=lambda r: (r["date"], B.natural(r[ident]))))
                for row in rows:
                    self.assertEqual(row["date"][5:], path.stem)
                    self.assertIn(row["bill"], day["bills"])
                    self.assertNotIn(row[ident], seen[kind])
                    seen[kind].add(row[ident])
            for row in day["speeches"]:
                self.assertTrue(row["speaker"].strip())
                self.assertEqual(set(row), {"slug", "date", "speaker", "bill"})
        self.assertGreater(len(seen["divisions"]), 3000)
        self.assertGreater(len(seen["speeches"]), 10000)


if __name__ == "__main__":
    unittest.main()
