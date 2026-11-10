"""Run with: python3 -m unittest discover -s tests -p test_access_cleanup.py

Data cleanup wave 1 (10 Nov 2026) rules for the ministerial diaries and access.json:

* interests-expenses-006 / registers-001: a printed meeting date that lies in the future, or
  more than a month after the diary's own period end while the diary's other rows sit in
  that period, is not used as the meeting date (parli.ingest.diary_dates). The row is kept
  and counted, the printed cell is kept, and the date is never rewritten; it cannot rank as
  the minister's newest meeting, and latest_pdf follows the diary's own period.
* interests-expenses-008 / registers-009: a minister's by_org list groups spacing variants of
  one organisation ("Unions NSW" / "UnionsNSW") and shows the commonest spelling.
"""

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from parli.ingest import diary_dates as D  # noqa: E402
from parli.ingest import money_diaries  # noqa: E402

TODAY = date(2026, 11, 10)


class DiaryDates(unittest.TestCase):
    def test_typo_year_after_a_corroborated_period_is_set_aside(self):
        # QLD Nicholls November 2025 diary prints "26 November 2026"; NSW AG Q4 2025 prints "9/12/2026"
        self.assertEqual(D.date_problem("2026-11-26", "2025-11-01", "2025-11-30", True, TODAY), "future date")
        self.assertEqual(D.date_problem("2026-12-09", "2025-10-01", "2025-12-31", True, TODAY), "future date")
        # NSW Toole Q4 2021 diary prints "24/11/2022": in the past, but a year after the period
        self.assertEqual(D.date_problem("2022-11-24", "2021-10-06", "2021-12-21", True, TODAY),
                         "after the diary's own period")
        self.assertIsNone(D.sane_date("2022-11-24", "2021-10-06", "2021-12-21", True, TODAY))

    def test_dates_inside_or_just_after_the_period_stand(self):
        self.assertIsNone(D.date_problem("2025-11-26", "2025-11-01", "2025-11-30", True, TODAY))
        self.assertIsNone(D.date_problem("2025-12-15", "2025-11-01", "2025-11-30", True, TODAY))  # month-end spill
        self.assertEqual(D.sane_date("2025-11-26", "2025-11-01", "2025-11-30", True, TODAY), "2025-11-26")

    def test_wrong_header_period_rejects_nothing(self):
        # a NSW header that states the wrong quarter: every row is out of period, so the
        # header is what is wrong and the printed dates stand
        dates = ["2020-04-02", "2020-05-11", "2020-06-30"]
        self.assertFalse(D.period_corroborated(dates, "2019-04-01", "2019-06-30"))
        self.assertIsNone(D.date_problem("2020-05-11", "2019-04-01", "2019-06-30", False, TODAY))
        # an inverted period (start after end) is never corroborated
        self.assertFalse(D.period_corroborated(["2022-05-05"], "2022-04-01", "2022-03-31"))

    def test_corroboration_by_the_diary_majority(self):
        dates = ["2025-10-02", "2025-11-14", "2025-12-01", "2026-12-09", None]
        self.assertTrue(D.period_corroborated(dates, "2025-10-01", "2025-12-31"))

    def test_typo_years_still_dropped(self):
        self.assertEqual(D.date_problem("2926-01-01", "2025-10-01", "2025-12-31", False, TODAY), "typo year")
        self.assertEqual(D.date_problem("2005-01-01", "2025-10-01", "2025-12-31", False, TODAY), "typo year")

    def test_loader_keeps_the_printed_cell(self):
        hdr = {"minister_name": "The Hon. Tim Nicholls MP", "period_start": "2025-11-01",
               "period_end": "2025-11-30", "period_label": "November 2025"}
        meetings = [{"meeting_date": d, "meeting_date_raw": raw, "org_lines": ["Org"], "purpose_lines": ["Visit"],
                     "pdf_page": 1, "row_order": i}
                    for i, (d, raw) in enumerate([("2025-11-03", "3 November 2025"), ("2025-11-20", "20 November 2025"),
                                                  ("2026-11-26", "26 November 2026")])]
        money_diaries._corroborate(hdr, meetings)
        self.assertTrue(hdr["period_corroborated"])
        rows = [money_diaries._meeting_row("qld", "qld_diary", hdr, "current", m, "https://x/y.pdf") for m in meetings]
        col = money_diaries.COLUMNS.index
        self.assertEqual([r[col("meeting_date")] for r in rows], ["2025-11-03", "2025-11-20", None])
        self.assertEqual(rows[2][col("meeting_date_raw")], "26 November 2026")


COLS = ["jurisdiction", "source", "minister_name", "minister_title", "period_start", "period_end", "period_label",
        "meeting_date", "meeting_date_raw", "organisation", "purpose", "source_url"]


def run_export(meetings):
    with tempfile.TemporaryDirectory() as d:
        db = Path(d) / "parli.db"
        con = sqlite3.connect(db)
        con.executescript(money_diaries.DDL)
        con.executemany(f"INSERT INTO ext_ministerial_meetings ({','.join(COLS)}) VALUES ({','.join('?' * len(COLS))})",
                        meetings)
        con.execute("CREATE TABLE ext_lobbyists (jurisdiction TEXT, register_id TEXT, trading_name TEXT)")
        con.execute("CREATE TABLE ext_lobbyist_clients (jurisdiction TEXT, lobbyist_name TEXT, client_name TEXT, "
                    "active INTEGER, date_added TEXT, date_ceased TEXT, lobbyist_register_id TEXT)")
        con.commit()
        con.close()
        money = Path(d) / "money.json"
        money.write_text(json.dumps({"nodes": [{"kind": "donor", "label": "Unions NSW"}]}))
        speakers = Path(d) / "speakers.json"
        speakers.write_text(json.dumps([["Tim Nicholls", 10]]))
        out = subprocess.run([sys.executable, str(ROOT / "scripts/export_access.py"), str(money), str(speakers)],
                             env={**os.environ, "OPAX_DB": str(db)}, capture_output=True, text=True, check=True)
        return json.loads(out.stdout)


class ExportAccess(unittest.TestCase):
    def test_typo_dated_row_neither_tops_recent_nor_picks_latest_pdf(self):
        nov = "https://cabinet.qld.gov.au/x/2025/november/timothy-nicholls.pdf"
        aug = "https://cabinet.qld.gov.au/x/2026/august/timothy-nicholls.pdf"
        q = lambda d, raw, org, url, ps, pe: ("qld", "qld_diary", "The Hon. Tim Nicholls MP", "Minister for Health",  # noqa: E731
                                              ps, pe, None, d, raw, org, "Visit", url)
        rows = [q("2025-11-03", "3 November 2025", "Peach Tree", nov, "2025-11-01", "2025-11-30"),
                q("2025-11-20", "20 November 2025", "AMA Queensland", nov, "2025-11-01", "2025-11-30"),
                q("2026-11-26", "26 November 2026", "Cairns & Hinterland HHS", nov, "2025-11-01", "2025-11-30"),
                q("2026-08-27", "27 August 2026", "Queensland Nurses Union", aug, "2026-08-01", "2026-08-31")]
        out = run_export(rows)
        m = out["ministers"]["tim nicholls"]
        self.assertEqual(m["meetings_total"], 4)
        self.assertEqual(m["recent"][0]["date"], "2026-08-27")
        self.assertTrue(all(r["date"] <= date.today().isoformat() for r in m["recent"]))
        self.assertEqual(m["latest_pdf"], aug)
        # "future date" until 26 Nov 2026, "after the diary's own period" from then on
        self.assertEqual(sum(out["meta"]["meeting_dates_set_aside"].values()), 1)

    def test_by_org_groups_spacing_variants(self):
        url = "https://www.nsw.gov.au/x/Premier-Q2-2023.pdf"
        n = lambda d, org: ("nsw", "nsw_diary", None, "Premier", "2023-04-01", "2023-06-30", "Q2 2023",  # noqa: E731
                            d, d, org, "Meeting", url)
        rows = [n("2023-05-0%d" % i, "Unions NSW") for i in range(1, 4)] + [n("2023-05-08", "UnionsNSW")]
        out = run_export(rows)
        minns = out["ministers"]["chris minns"]
        self.assertEqual(minns["by_org"][0], ["Unions NSW", 4])
        self.assertEqual(len(minns["by_org"]), 1)
        # donor matching still keys on norm(): only the spaced spelling meets the "Unions NSW" donor
        self.assertEqual(out["donors"]["Unions NSW"]["meetings_total"], 3)


if __name__ == "__main__":
    unittest.main()
