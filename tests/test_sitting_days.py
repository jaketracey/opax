"""Federal sitting calendar for the app's Today line (scripts/build_sitting_days.py).

The fixture is an excerpt of the Parliament's published 2026 calendar
(Parliamentary_Sittings_2026.ics, retrieved 13 November 2026): sittings of both houses,
House-only and Senate-only weeks, the Budget sitting, an estimates hearing, Senate cut-off
dates and public holidays.
"""
from datetime import date
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_sitting_days as S

FIXTURE = ROOT / "tests/fixtures/sitting_days/sittings_2026_excerpt.ics"
PUBLISHED = ROOT / "portal/public/parliament/sitting-days.json"
HUB_CALENDAR = ROOT / "scripts/hubs/sitting-2026.json"
URL = S.URL_TEMPLATE.format(year=2026)

BOTH = {"house": True, "senate": True}
HOUSE = {"house": True, "senate": False}
SENATE = {"house": False, "senate": True}
EXPECTED = {
    "2026-01-19": BOTH, "2026-01-20": BOTH,
    "2026-02-03": BOTH, "2026-02-04": BOTH, "2026-02-05": BOTH,
    "2026-02-09": HOUSE, "2026-02-10": HOUSE, "2026-02-11": HOUSE, "2026-02-12": HOUSE,
    "2026-05-12": BOTH, "2026-05-13": BOTH, "2026-05-14": BOTH,
    "2026-10-26": HOUSE, "2026-10-27": HOUSE, "2026-10-28": HOUSE, "2026-10-29": HOUSE,
    "2026-11-16": SENATE, "2026-11-17": SENATE, "2026-11-18": SENATE, "2026-11-19": SENATE,
    "2026-11-23": BOTH, "2026-11-24": BOTH, "2026-11-25": BOTH, "2026-11-26": BOTH,
}


def calendar(*events, header="X-WR-TIMEZONE:Australia/Sydney"):
    body = "".join(f"BEGIN:VEVENT\n{e}\nEND:VEVENT\n" for e in events)
    return f"BEGIN:VCALENDAR\nVERSION:2.0\n{header}\n{body}END:VCALENDAR\n"


def sitting(start, end, summary="Parliament Sitting - Both Houses",
            description="House of Representatives and Senate sitting days"):
    return f"DTSTART;VALUE=DATE:{start}\nDTEND;VALUE=DATE:{end}\nSUMMARY:{summary}\nDESCRIPTION:{description}"


class ParseCalendarTests(unittest.TestCase):
    def test_fixture_gives_dated_house_and_senate_flags(self):
        days = S.parse_calendar(FIXTURE.read_text(), 2026)
        self.assertEqual(days, EXPECTED)
        self.assertEqual(list(days), sorted(days))

    def test_end_date_is_exclusive_and_non_sittings_are_ignored(self):
        days = S.parse_calendar(FIXTURE.read_text(), 2026)
        self.assertNotIn("2026-01-21", days)  # DTEND of the 19-20 January sitting
        self.assertNotIn("2026-06-05", days)  # "Budget Estimates" hearing, not a sitting
        for holiday in ("2026-01-01", "2026-11-03", "2026-12-25"):
            self.assertNotIn(holiday, days)

    def test_crlf_and_folded_lines(self):
        text = FIXTURE.read_text().replace("\n", "\r\n").replace(
            "DESCRIPTION:Senate sitting days", "DESCRIPTION:Senate sitt\r\n ing days")
        self.assertEqual(S.parse_calendar(text, 2026), EXPECTED)

    def test_overlapping_events_combine_chambers(self):
        text = calendar(sitting("20260302", "20260303", "House Sitting Only", "House of Representatives sitting days"),
                        sitting("20260302", "20260303", "Senate Sitting Only", "Senate sitting days"))
        self.assertEqual(S.parse_calendar(text, 2026), {"2026-03-02": BOTH})

    def test_missing_end_is_one_day(self):
        text = calendar("DTSTART;VALUE=DATE:20260302\nSUMMARY:Senate Sitting Only\nDESCRIPTION:Senate sitting days")
        self.assertEqual(S.parse_calendar(text, 2026), {"2026-03-02": SENATE})

    def test_refuses_what_it_does_not_understand(self):
        cases = {
            "unknown sitting": calendar(sitting("20260302", "20260303", "Parliament Sitting - Joint", "Joint sitting")),
            "summary disagrees": calendar(sitting("20260302", "20260303", "Senate Sitting Only")),
            "timed event": calendar("DTSTART:20260302T090000\nDTEND:20260302T170000\n"
                                    "SUMMARY:Senate Sitting Only\nDESCRIPTION:Senate sitting days"),
            "other year": calendar(sitting("20271230", "20271231")),
            "crosses year": calendar(sitting("20261231", "20270102")),
            "backwards": calendar(sitting("20260305", "20260302")),
            "timezone": calendar(sitting("20260302", "20260303"), header="X-WR-TIMEZONE:Australia/Perth"),
            "unterminated": "BEGIN:VCALENDAR\nBEGIN:VEVENT\n" + sitting("20260302", "20260303") + "\n",
            "not a calendar": "<html><title>Object moved</title></html>",
        }
        for name, text in cases.items():
            with self.subTest(name), self.assertRaises(S.CalendarError):
                S.parse_calendar(text, 2026)


class BuildTests(unittest.TestCase):
    def years(self, next_year=None):
        years = {2026: {"status": "published", "url": URL, "body": FIXTURE.read_bytes(), "last_modified": "2026-09-14"}}
        years[2027] = next_year or {"status": "not_published", "url": S.URL_TEMPLATE.format(year=2027)}
        return years

    def test_unpublished_next_year_is_recorded_not_guessed(self):
        doc = S.build(self.years(), date(2026, 11, 13), min_days=10)
        self.assertEqual(doc["schema_version"], 1)
        self.assertEqual(doc["published"], "2026-11-13")
        self.assertEqual(doc["timezone"], "Australia/Sydney")
        self.assertEqual(doc["coverage"], {"first": "2026-01-01", "last": "2026-12-31"})
        self.assertEqual(doc["expires"], "2026-12-31")
        self.assertEqual(doc["days"], [{"date": d, **f} for d, f in EXPECTED.items()])
        published, missing = doc["years"]
        self.assertEqual(published["sitting_days"], {"house": 20, "senate": 16, "either": 24})
        self.assertEqual(published["source"]["publisher"], "Parliament of Australia")
        self.assertEqual(published["source"]["url"], URL)
        self.assertEqual(published["source"]["published"], "2026-09-14")
        self.assertEqual(published["source"]["retrieved"], "2026-11-13")
        self.assertRegex(published["source"]["sha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(missing, {"year": 2027, "status": "not_published", "checked": "2026-11-13",
                                   "url": S.URL_TEMPLATE.format(year=2027)})

    def test_two_published_years_extend_coverage_and_expiry(self):
        body = calendar(*[sitting(f"202702{d:02}", f"202702{d + 1:02}") for d in range(1, 12)]).encode()
        doc = S.build(self.years({"status": "published", "url": "u", "body": body}), date(2026, 11, 13), min_days=10)
        self.assertEqual(doc["coverage"], {"first": "2026-01-01", "last": "2027-12-31"})
        self.assertEqual(doc["expires"], "2027-12-31")
        self.assertEqual(doc["days"][-1], {"date": "2027-02-11", **BOTH})
        self.assertIsNone(doc["years"][1]["source"]["published"])

    def test_refuses_missing_current_year_and_thin_parse(self):
        years = self.years()
        years[2026] = {"status": "not_published", "url": URL}
        with self.assertRaises(S.CalendarError):
            S.build(years, date(2026, 11, 13))
        with self.assertRaisesRegex(S.CalendarError, "only 24 sitting days"):
            S.build(self.years(), date(2026, 11, 13), min_days=25)

    def test_shrink_guard(self):
        doc = S.build(self.years(), date(2026, 11, 13), min_days=10)
        previous = {"years": [{"year": 2026, "status": "published"}, {"year": 2027, "status": "published"}]}
        with self.assertRaisesRegex(S.CalendarError, r"\[2027\]"):
            S.guard_shrink(previous, doc)
        S.guard_shrink({"years": [{"year": 2025, "status": "published"}, {"year": 2026, "status": "published"}]}, doc)
        S.guard_shrink(None, doc)


class FakeResponse:
    def __init__(self, status, body=b"", headers=None):
        self.status_code, self.content, self.headers = status, body, headers or {}
        self.is_redirect = status in (301, 302, 303, 307, 308) and "Location" in self.headers


class FakeSession:
    def __init__(self, response):
        self.response, self.calls = response, []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response


class FetchTests(unittest.TestCase):
    def test_published_calendar_and_last_modified_in_sydney(self):
        session = FakeSession(FakeResponse(200, b"BEGIN:VCALENDAR", {"Last-Modified": "Sun, 13 Sep 2026 23:08:36 GMT"}))
        got = S.fetch_year(session, 2026, URL)
        self.assertEqual(got, {"status": "published", "body": b"BEGIN:VCALENDAR", "last_modified": "2026-09-14"})
        self.assertEqual(session.calls[0][0], URL)
        self.assertIs(session.calls[0][1]["allow_redirects"], False)

    def test_missing_calendar_is_not_published(self):
        for response in (FakeResponse(404), FakeResponse(302, b"", {"Location": "/Help/404"})):
            self.assertEqual(S.fetch_year(FakeSession(response), 2027, URL), {"status": "not_published"})

    def test_other_status_or_redirect_stops(self):
        for response in (FakeResponse(500), FakeResponse(302, b"", {"Location": "/elsewhere.ics"})):
            with self.assertRaises(SystemExit):
                S.fetch_year(FakeSession(response), 2026, URL)


class MainTests(unittest.TestCase):
    def test_offline_build_writes_and_failure_keeps_previous_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "sitting-days.json"
            good = Path(tmp) / "2026.ics"
            good.write_text(FIXTURE.read_text())
            nxt = Path(tmp) / "2027.ics"
            nxt.write_text(calendar(*[sitting(f"202702{d:02}", f"202702{d + 1:02}") for d in range(1, 22)]))
            argv = ["--out", str(out), "--today", "2026-11-13", "--ics", f"2026={good}", "--ics", f"2027={nxt}"]
            self.assertEqual(S.main(argv), 0)
            written = out.read_text()
            self.assertEqual(json.loads(written)["coverage"]["last"], "2027-12-31")
            good.write_text(calendar(sitting("20260302", "20260303", "Senate Sitting Only")))
            self.assertEqual(S.main(argv), 1)
            self.assertEqual(out.read_text(), written)


class PublishedFileTests(unittest.TestCase):
    """The committed portal file the app reads."""

    @classmethod
    def setUpClass(cls):
        cls.doc = json.loads(PUBLISHED.read_text())

    def test_shape_and_dates(self):
        doc = self.doc
        self.assertEqual(doc["schema_version"], 1)
        self.assertEqual(doc["timezone"], "Australia/Sydney")
        first, last = doc["coverage"]["first"], doc["coverage"]["last"]
        self.assertTrue(first.endswith("-01-01") and last.endswith("-12-31"))
        self.assertLessEqual(doc["published"], doc["expires"])
        self.assertLessEqual(doc["expires"], last)
        dates = [d["date"] for d in doc["days"]]
        self.assertEqual(dates, sorted(set(dates)))
        for day in doc["days"]:
            self.assertEqual(set(day), {"date", "house", "senate"})
            self.assertTrue(first <= day["date"] <= last, day)
            self.assertIs(type(day["house"]), bool)
            self.assertIs(type(day["senate"]), bool)
            self.assertTrue(day["house"] or day["senate"], day)
            self.assertLess(date.fromisoformat(day["date"]).weekday(), 5, day)

    def test_years_and_sources(self):
        doc = self.doc
        published = [y for y in doc["years"] if y["status"] == "published"]
        self.assertTrue(published)
        self.assertEqual(int(doc["coverage"]["first"][:4]), published[0]["year"])
        self.assertEqual(int(doc["coverage"]["last"][:4]), published[-1]["year"])
        for year in doc["years"]:
            self.assertIn(year["status"], {"published", "not_published"})
            self.assertTrue(year["url"].startswith("https://static.aph.gov.au/") if "url" in year
                            else year["source"]["url"].startswith("https://static.aph.gov.au/"))
        for year in published:
            source = year["source"]
            self.assertEqual(source["publisher"], "Parliament of Australia")
            self.assertRegex(source["published"], r"^\d{4}-\d{2}-\d{2}$")
            self.assertRegex(source["sha256"], r"^[0-9a-f]{64}$")
            days = [d for d in doc["days"] if d["date"].startswith(str(year["year"]))]
            self.assertEqual(year["sitting_days"], {"house": sum(d["house"] for d in days),
                                                    "senate": sum(d["senate"] for d in days),
                                                    "either": len(days)})

    def test_agrees_with_the_reviewed_hub_calendar(self):
        """scripts/hubs/sitting-2026.json drives the bills/divisions cadence; the two must not drift."""
        hub = json.loads(HUB_CALENDAR.read_text())
        days = {d["date"]: d for d in self.doc["days"]}
        if str(hub["year"]) not in {str(y["year"]) for y in self.doc["years"] if y["status"] == "published"}:
            self.skipTest("hub year is outside the published coverage")
        for period in hub["periods"]:
            start, end = date.fromisoformat(period["start"]), date.fromisoformat(period["end"])
            for offset in range((end - start).days + 1):
                key = date.fromordinal(start.toordinal() + offset).isoformat()
                self.assertIn(key, days)
                self.assertEqual(days[key]["house"], "representatives" in period["houses"], key)
                self.assertEqual(days[key]["senate"], "senate" in period["houses"], key)


if __name__ == "__main__":
    unittest.main()
