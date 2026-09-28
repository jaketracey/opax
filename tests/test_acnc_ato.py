"""Run with: python -m unittest discover -s tests -p test_acnc_ato.py

parli.ingest.acnc_ato: licence resolution, resource picking, row building for the three sources,
the staged-replace guard, the ATO late-lodger rule and --check-updated, all against small local
fixtures (no network: CKAN and the file downloads are stubbed).
"""

import csv
import io
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import openpyxl

from parli.ingest import acnc_ato as A
from parli.ingest.ext_common import ExtWriter


def ds(source=A.SRC_AIS, year="2024", key=None, resource_id="res-1", modified="2026-09-27T19:00:00.000000", fmt="csv"):
    return A.Dataset(
        source=source, key=key or f"{source}{year}", year=year, package_id="pkg", package_name="pkg-name", title="t",
        dataset_url="https://data.gov.au/data/dataset/pkg-name", resource_id=resource_id, resource_name="r",
        resource_url="https://example.invalid/f", resource_format=fmt, snapshot_date="2026-09-27",
        dataset_modified=modified, licence="CC BY 3.0 AU", licence_url="https://creativecommons.org/licenses/by/3.0/au/",
        licence_note="as stated on the data.gov.au dataset record",
        record_url="https://data.gov.au/data/dataset/corporate-transparency/resource/" + resource_id)


class Licences(unittest.TestCase):
    def test_ckan_ids_map_to_the_version_the_record_states(self):
        for lid, label in [("cc-by", "CC BY 3.0 AU"), ("cc-by-2.5", "CC BY 2.5 AU"), ("cc-by-4.0", "CC BY 4.0")]:
            got = A.ckan_licence({"license_id": lid}, None)
            self.assertEqual(got[0], label)
            self.assertIn("data.gov.au dataset record", got[2])

    def test_unspecified_falls_back_to_the_acnc_statement_and_says_so(self):
        label, url, note = A.ckan_licence({"license_id": "notspecified"}, "acnc")
        self.assertEqual(label, "CC BY 4.0")
        self.assertIn("https://www.acnc.gov.au/copyright", note)
        self.assertIn("does not state a licence", note)

    def test_no_licence_and_no_publisher_statement_is_refused(self):
        self.assertIsNone(A.ckan_licence({"license_id": "notspecified"}, None))
        self.assertIsNone(A.ckan_licence({}, None))

    def test_share_alike_is_not_accepted(self):
        self.assertIsNone(A.ckan_licence({"license_id": "cc-by-sa"}, None))
        self.assertIsNone(A.ckan_licence({"license_id": "cc-by-sa"}, "acnc"))
        self.assertIsNone(A.ckan_licence({"license_id": "other-closed"}, "acnc"))
        self.assertEqual(A.ckan_licence({}, "acnc")[0], "CC BY 4.0")
        # the publisher fallback is for an unstated licence, not a different one: share-alike stays refused
        self.assertIsNone(A.ckan_licence({"license_id": "cc-by-sa"}, None))
        self.assertIsNone(A.ckan_licence({"license_id": "cc-by-sa"}, "acnc"))
        self.assertIsNone(A.ckan_licence({"license_id": "other-closed"}, "acnc"))
        self.assertEqual(A.ckan_licence({}, "acnc")[0], "CC BY 4.0")


class Discovery(unittest.TestCase):
    def test_years_are_parsed_from_titles(self):
        self.assertEqual(A.ais_year_of("ACNC 2024 Annual Information Statement (AIS) Data"), 2024)
        self.assertEqual(A.ais_year_of("ACNC 2013 Annual Information Statement data"), 2013)
        self.assertIsNone(A.ais_year_of("ACNC Registered Charities"))
        self.assertEqual(A.income_year_of("2023-24 Report of Entity Tax Information"), "2023-24")
        self.assertEqual(A.income_year_of("2013-14 Report of Entity Tax Information"), "2013-14")

    def test_main_data_file_is_csv_and_never_the_programs_group_or_notes_files(self):
        res = [
            {"name": "Explanatory notes", "format": "PDF", "url": "https://x/notes.pdf", "size": 1},
            {"name": "datadotgov_ais24_programs", "format": "CSV", "url": "https://x/p.csv", "size": 30000},
            {"name": "datadotgov_ais24_group_members", "format": "XLSX", "url": "https://x/g.xlsx", "size": 66},
            {"name": "datadotgov_ais24", "format": "XLSX", "url": "https://x/a.xlsx", "size": 22000},
            {"name": "datadotgov_ais24", "format": "CSV", "url": "https://x/a.csv", "size": 38000},
        ]
        self.assertEqual(A.pick_data_resource(res)["url"], "https://x/a.csv")
        self.assertEqual(A.pick_data_resource(res[:4])["url"], "https://x/a.xlsx")
        self.assertIsNone(A.pick_data_resource(res[:3]))

    def test_discover_uses_ckan_urls_and_takes_the_latest_ais_years(self):
        pk = lambda name, title, lic, url, mod: {  # noqa: E731
            "id": name, "name": name, "title": title, "license_id": lic, "metadata_modified": mod,
            "resources": [{"id": f"{name}-r", "name": "data", "format": "CSV", "url": url, "size": "100", "last_modified": mod}]}
        reg = pk("acnc-register", "ACNC Registered Charities", "cc-by", "https://x/register.csv", "2026-09-27T19:57:00")
        ais = [pk(f"ais{y}", f"ACNC {y} Annual Information Statement Data", "cc-by" if y < 2024 else "notspecified",
                  f"https://x/ais{y}.csv", "2026-09-27T19:58:00") for y in (2022, 2023, 2024)]
        ato = {"id": "ato", "name": "corporate-transparency", "title": "Corporate Tax Transparency", "license_id": "cc-by",
               "metadata_modified": "2025-10-01T21:08:32", "resources": [
                   {"id": "a1", "name": "2023-24 Report of Entity Tax Information", "format": "excel (.xlsx)", "url": "https://x/a.xlsx"},
                   {"id": "a2", "name": "2022-23 Report of Entity Tax Information", "format": "excel (.xlsx)", "url": "https://x/b.xlsx"},
                   {"id": "a3", "name": "User guide", "format": "PDF", "url": "https://x/c.pdf"}]}

        def fake_ckan(session, action, **params):
            if action == "package_show":
                return reg if params["id"] == A.REGISTER_PKG else ato
            return {"results": ais}

        with mock.patch.object(A, "ckan", fake_ckan):
            out = A.discover(None, ("register", "ais", "ato"), ais_years="2")
        keys = [d.key for d in out]
        self.assertEqual(keys, ["register", "ais2024", "ais2023", "ato2023-24", "ato2022-23"])
        by = {d.key: d for d in out}
        self.assertEqual(by["ais2024"].licence, "CC BY 4.0")
        self.assertEqual(by["ais2023"].licence, "CC BY 3.0 AU")
        self.assertEqual(by["register"].resource_url, "https://x/register.csv")
        self.assertTrue(by["ato2023-24"].record_url.endswith("/resource/a1"))
        with mock.patch.object(A, "ckan", fake_ckan):
            allyears = A.discover(None, ("ais",), ais_years="all")
            explicit = A.discover(None, ("ais",), ais_years="2022,2024")
        self.assertEqual([d.key for d in allyears], ["ais2024", "ais2023", "ais2022"])
        self.assertEqual([d.key for d in explicit], ["ais2024", "ais2022"])


class Helpers(unittest.TestCase):
    def test_abn_digits(self):
        self.assertEqual(A.abn_digits("11 000 073 870"), "11000073870")
        self.assertEqual(A.abn_digits(11000073870), "11000073870")
        self.assertEqual(A.abn_digits(11000073870.0), "11000073870")
        self.assertIsNone(A.abn_digits("1234"))            # never padded into an ABN
        self.assertIsNone(A.abn_digits(1234567890))
        self.assertIsNone(A.abn_digits(None))
        self.assertIsNone(A.abn_digits("123456789012"))
        self.assertTrue(A.is_reporting_group_abn("91111111234"))
        self.assertFalse(A.is_reporting_group_abn("11000073870"))

    def test_numbers_keep_zero_and_drop_blanks(self):
        self.assertEqual(A.num("0"), 0.0)
        self.assertIsNone(A.num(""))
        self.assertIsNone(A.num(None))
        self.assertEqual(A.num("1,234"), 1234.0)
        self.assertEqual(A.num("(500)"), -500.0)

    def test_guard(self):
        A.check_guard("x", 0, 10)
        A.check_guard("x", 100, 90)
        with self.assertRaisesRegex(RuntimeError, "empty"):
            A.check_guard("x", 100, 0)
        with self.assertRaisesRegex(RuntimeError, "under 90%"):
            A.check_guard("x", 100, 89)
        A.check_guard("x", 100, 50, allow_shrink=True)
        with self.assertRaisesRegex(RuntimeError, "empty"):
            A.check_guard("x", 100, 0, allow_shrink=True)


REGISTER_HEADER = ["ABN", "Charity_Legal_Name", "Other_Organisation_Names", "Town_City", "State", "Postcode",
                   "Charity_Website", "Registration_Date", "Date_Organisation_Established", "Charity_Size",
                   "Number_of_Responsible_Persons", "Financial_Year_End", "Operates_in_NSW", "Operates_in_VIC",
                   "Operating_Countries", "PBI", "HPC", "Advancing_Education",
                   "Promote_or_oppose_a_change_to_law__government_poll_or_prac", "Advancing_natual_environment",
                   "Aboriginal_or_TSI", "Children", "other_gender_identities"]


def reg_row(abn, name, **kw):
    base = dict.fromkeys(REGISTER_HEADER, "")
    base.update({"ABN": abn, "Charity_Legal_Name": name, "State": "NSW", "Charity_Size": "Large", "Registration_Date": "03/12/2012"})
    base.update(kw)
    return base


class RegisterRows(unittest.TestCase):
    def test_rows(self):
        rows = [
            reg_row("11000073870", "Integricare Limited", PBI="Y", Operates_in_NSW="Y", Operates_in_VIC="Y",
                    Advancing_Education="Y", Advancing_natual_environment="Y", Children="Y"),
            reg_row("", "Withheld Charity"),
            reg_row("11000073870", "Integricare Limited (again)"),
            reg_row("12345678901", "Advocacy Inc", HPC="Y", Charity_Size="",
                    Promote_or_oppose_a_change_to_law__government_poll_or_prac="Y"),
        ]
        out, stats = A.build_charity_rows(rows, ds(A.SRC_REGISTER, None), "now")
        self.assertEqual(stats, {"read": 4, "no_abn": 1, "duplicate_abn": 1})
        self.assertEqual(len(out), 2)
        col = {c: i for i, c in enumerate(A.CHARITY_COLS)}
        a, b = out
        self.assertEqual((a[col["abn"]], a[col["size"]], a[col["pbi"]], a[col["hpc"]]), ("11000073870", "Large", 1, 0))
        self.assertEqual(a[col["purposes"]], "Advancing education; Advancing the natural environment")
        self.assertEqual(a[col["operating_states"]], "NSW; VIC")
        self.assertEqual(a[col["beneficiaries"]], "Children")
        self.assertEqual(a[col["registration_date"]], "2012-12-03")
        self.assertEqual(a[col["source_url"]], "https://www.acnc.gov.au/charity/charities?search=11000073870")
        self.assertIsNone(b[col["size"]])
        self.assertEqual((b[col["hpc"]], b[col["advocacy"]]), (1, 1))
        self.assertEqual(a[col["advocacy"]], 0)
        self.assertEqual(len(a), len(A.CHARITY_COLS))


AIS_HEADER = ["abn", "charity name", "registration status", "charity size", "basic religious charity", "date ais received",
              "fin report from", "fin report to", "cash or accrual", "revenue from government", "donations and bequests",
              "revenue from goods and services", "revenue from investments", "all other revenue", "total revenue",
              "other income", "total gross income", "employee expenses", "total expenses", "net surplus/deficit",
              "total assets", "total liabilities", "net assets/liabilities", "total full time equivalent staff",
              "staff - volunteers", "Number of Key Management Personnel", "Total paid to Key Management Personnel"]


def ais_row(abn, name, **kw):
    base = dict.fromkeys(AIS_HEADER, "")
    base.update({"abn": abn, "charity name": name, "registration status": "Registered", "charity size": "Large",
                 "fin report from": "01/07/2023", "fin report to": "30/06/2024", "revenue from government": "12638727",
                 "donations and bequests": "134403", "total revenue": "17505079", "other income": "366059",
                 "total gross income": "17871138", "total expenses": "18492195", "total assets": "24551925"})
    base.update(kw)
    return base


class AisRows(unittest.TestCase):
    def test_rows(self):
        rows = [
            ais_row("11000073870", "Integricare Limited"),
            ais_row("91111111234", "Some ACNC Group"),
            ais_row("", "No ABN"),
            ais_row("22000000000", "Basic Religious", **{"basic religious charity": "Y", "revenue from government": "",
                                                       "total revenue": "", "total gross income": ""}),
            ais_row("11000073870", "Integricare Limited dupe"),
            ais_row("33000000000", "Revoked", **{"registration status": "Voluntarily Revoked No Longer Operating"}),
        ]
        out, stats = A.build_ais_rows(rows, ds(), "now")
        self.assertEqual(stats, {"read": 6, "no_abn": 1, "reporting_groups": 1, "duplicate_abn": 1, "no_financials": 1})
        col = {c: i for i, c in enumerate(A.AIS_COLS)}
        first = out[0]
        self.assertEqual((first[col["abn"]], first[col["ais_year"]]), ("11000073870", 2024))
        self.assertEqual(first[col["revenue_from_government"]], 12638727.0)
        self.assertEqual(first[col["total_revenue"]], 17505079.0)
        self.assertEqual(first[col["total_gross_income"]], 17871138.0)
        self.assertEqual(first[col["fin_report_to"]], "2024-06-30")
        rel = out[1]
        self.assertEqual(rel[col["basic_religious_charity"]], 1)
        self.assertIsNone(rel[col["total_revenue"]])     # no figure: None, never 0
        self.assertEqual(out[2][col["registration_status"]], "Voluntarily Revoked No Longer Operating")

    def test_missing_required_column_refuses_the_year(self):
        rows = [{"abn": "11000073870", "charity name": "X"}]
        with self.assertRaisesRegex(ValueError, "required columns"):
            A.build_ais_rows(rows, ds(), "now")

    def test_zero_government_revenue_is_kept_as_zero(self):
        out, _ = A.build_ais_rows([ais_row("11000073870", "X", **{"revenue from government": "0"})], ds(), "now")
        self.assertEqual(out[0][A.AIS_COLS.index("revenue_from_government")], 0.0)


class AtoRows(unittest.TestCase):
    def test_income_tax_sheet_with_blank_amounts_and_prrt_tab(self):
        sheets = {
            "Information": [("Corporate tax transparency",)],
            "Income tax details": [
                ("Name", "ABN", "Total income $", "Taxable income $", "Tax payable $", "Income year"),
                ("WOOLWORTHS GROUP LIMITED", 88000014675, 56596759405, 2702605198, 767268429, "2023-24"),
                ("LOSS MAKER PTY LTD", 11111111111, 150000000, None, None, "2023-24"),
                ("NO ABN BIDCO PTY LTD", None, 112972764, None, None, "2023-24"),
                ("LATE LODGER PTY LTD", 22222222222, 300000000, 1000, 300, "2022-23"),
            ],
            "PRRT details": [("Name", "ABN", "PRRT Payable $"),
                             ("WOOLWORTHS GROUP LIMITED", 88000014675, 5), ("ESSO AUSTRALIA", 62091829819, 351898218)],
        }
        income, prrt, stats = A.parse_ato_workbook(sheets, "2023-24")
        self.assertEqual(stats["income_rows"], 4)
        self.assertEqual(stats["no_abn"], 1)
        rows = A.build_ato_rows(income, prrt, ds(A.SRC_ATO, "2023-24", resource_id="r24"), "now")
        col = {c: i for i, c in enumerate(A.ATO_COLS)}
        by = {r[col["entity_name"]]: r for r in rows}
        w = by["WOOLWORTHS GROUP LIMITED"]
        self.assertEqual((w[col["total_income"]], w[col["taxable_income"]], w[col["tax_payable"]], w[col["prrt_payable"]]),
                         (56596759405.0, 2702605198.0, 767268429.0, 5.0))
        loss = by["LOSS MAKER PTY LTD"]
        self.assertIsNone(loss[col["taxable_income"]])      # blank stays blank, not zero
        self.assertIsNone(loss[col["tax_payable"]])
        self.assertIsNone(by["NO ABN BIDCO PTY LTD"][col["abn"]])
        # the workbook's own income-year column wins over the file's year (late lodgers)
        self.assertEqual(by["LATE LODGER PTY LTD"][col["income_year"]], "2022-23")
        esso = by["ESSO AUSTRALIA"]
        self.assertEqual((esso[col["section"]], esso[col["prrt_payable"]], esso[col["total_income"]]), ("prrt_only", 351898218.0, None))
        self.assertEqual(len(w), len(A.ATO_COLS))

    def test_sheet_selection_for_older_layouts(self):
        head = ("Name", "ABN", "Total Income $", "Taxable Income $", "Tax Payable $")
        combined = {"December": [head, ("A", 1, 1, 1, 1)],
                    "Combined": [("Income tax information for 2013-14",) , head, ("A PTY LTD", 11111111111, 10, 5, 2), ("B PTY LTD", 22222222222, 20, None, None)]}
        income, _, _ = A.parse_ato_workbook(combined, "2013-14")
        self.assertEqual([r[0] for r in income], ["A PTY LTD", "B PTY LTD"])   # header found on row 2, Combined preferred
        per_year = {"2015-16": [head, ("NEW", 33333333333, 5, 1, 1)], "2014-15": [head, ("OLD", 44444444444, 5, 1, 1)]}
        income, _, _ = A.parse_ato_workbook(per_year, "2015-16")
        self.assertEqual([r[0] for r in income], ["NEW"])                       # only the file's own year sheet
        with self.assertRaisesRegex(ValueError, "no income tax sheet"):
            A.parse_ato_workbook({"Something": [head]}, "2019-20")


def write_xlsx(path: Path, sheets: dict[str, list[tuple]]):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for r in rows:
            ws.append(list(r))
    wb.save(path)


def write_csv(path: Path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader()
        for r in rows:
            w.writerow(r)


class LoadIntoDatabase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.db = self.dir / "parli.db"
        self.writer = ExtWriter(db_path=self.db)

    def tearDown(self):
        self.tmp.cleanup()

    def q(self, sql, *params):
        db = sqlite3.connect(self.db)
        try:
            return db.execute(sql, params).fetchall()
        finally:
            db.close()

    def fake_download(self, files):
        return lambda session, d, cache, refresh=False: files[d.resource_id]

    def test_ato_late_lodgers_survive_the_load_of_the_year_they_are_labelled_with(self):
        head = ("Name", "ABN", "Total income $", "Taxable income $", "Tax payable $", "Income year")
        f24 = self.dir / "a24.xlsx"
        f23 = self.dir / "a23.xlsx"
        write_xlsx(f24, {"Income tax details": [head,
                                                ("MAIN24 PTY LTD", 11111111111, 500, 10, 3, "2023-24"),
                                                ("LATE PTY LTD", 22222222222, 400, 5, 1, "2022-23")]})
        write_xlsx(f23, {"Income tax details": [head, ("MAIN23 PTY LTD", 33333333333, 450, 9, 2, "2022-23")]})
        files = {"r24": f24, "r23": f23}
        d24 = ds(A.SRC_ATO, "2023-24", resource_id="r24")
        d23 = ds(A.SRC_ATO, "2022-23", resource_id="r23")
        with mock.patch.object(A, "download", self.fake_download(files)):
            A.load_dataset(d24, None, self.writer, self.dir)
            A.load_dataset(d23, None, self.writer, self.dir)        # would delete LATE if replace were by income year
            names = sorted(r[0] for r in self.q("SELECT entity_name FROM ext_ato_tax_transparency"))
            self.assertEqual(names, ["LATE PTY LTD", "MAIN23 PTY LTD", "MAIN24 PTY LTD"])
            # reloading one resource replaces only that resource's rows
            A.load_dataset(d24, None, self.writer, self.dir)
        self.assertEqual(self.q("SELECT COUNT(*) FROM ext_ato_tax_transparency")[0][0], 3)

    def test_guard_refuses_a_shrunk_or_empty_reload_and_leaves_the_loaded_rows(self):
        rows = [ais_row(f"{10000000000 + i}", f"Charity {i}") for i in range(20)]
        f1, f2, f3 = self.dir / "1.csv", self.dir / "2.csv", self.dir / "3.csv"
        write_csv(f1, AIS_HEADER, rows)
        write_csv(f2, AIS_HEADER, rows[:10])
        write_csv(f3, AIS_HEADER, [ais_row("91111111111", "Only a group")])
        d = ds(A.SRC_AIS, "2024", resource_id="r")
        with mock.patch.object(A, "download", lambda s, dd, c, refresh=False: f1):
            A.load_dataset(d, None, self.writer, self.dir)
        with mock.patch.object(A, "download", lambda s, dd, c, refresh=False: f2):
            with self.assertRaisesRegex(RuntimeError, "under 90%"):
                A.load_dataset(d, None, self.writer, self.dir)
        with mock.patch.object(A, "download", lambda s, dd, c, refresh=False: f3):
            with self.assertRaisesRegex(RuntimeError, "empty"):
                A.load_dataset(d, None, self.writer, self.dir, allow_shrink=True)
        self.assertEqual(self.q("SELECT COUNT(*) FROM ext_acnc_ais")[0][0], 20)
        with mock.patch.object(A, "download", lambda s, dd, c, refresh=False: f2):
            A.load_dataset(d, None, self.writer, self.dir, allow_shrink=True)
        self.assertEqual(self.q("SELECT COUNT(*) FROM ext_acnc_ais")[0][0], 10)

    def test_ais_years_replace_independently_and_are_idempotent(self):
        f = self.dir / "a.csv"
        write_csv(f, AIS_HEADER, [ais_row("11000073870", "X")])
        with mock.patch.object(A, "download", lambda s, dd, c, refresh=False: f):
            for _ in range(2):
                A.load_dataset(ds(A.SRC_AIS, "2024", resource_id="r24"), None, self.writer, self.dir)
                A.load_dataset(ds(A.SRC_AIS, "2023", resource_id="r23"), None, self.writer, self.dir)
        self.assertEqual(self.q("SELECT ais_year, COUNT(*) FROM ext_acnc_ais GROUP BY 1 ORDER BY 1"), [(2023, 1), (2024, 1)])
        row = self.q("SELECT licence, licence_note, snapshot_date, dataset_modified, source_url, dataset_url FROM ext_acnc_ais LIMIT 1")[0]
        self.assertEqual(row[0], "CC BY 3.0 AU")
        self.assertTrue(all(row[1:]))

    def test_check_updated_loads_only_what_the_publisher_changed(self):
        reg_file = self.dir / "reg.csv"
        ais_file = self.dir / "ais.csv"
        write_csv(reg_file, REGISTER_HEADER, [reg_row("11000073870", "Integricare Limited")])
        write_csv(ais_file, AIS_HEADER, [ais_row("11000073870", "Integricare Limited")])
        state = {"mod": "2026-09-27T19:00:00.000000"}

        def fake_discover(session, want, ais_years="3"):
            return [ds(A.SRC_REGISTER, None, key="register", resource_id="reg", modified=state["mod"]),
                    ds(A.SRC_AIS, "2024", resource_id="ais24", modified="2026-09-27T20:00:00.000000")]

        files = {"reg": reg_file, "ais24": ais_file}
        argv = ["--db", str(self.db), "--check-updated", "--cache", str(self.dir)]
        with mock.patch.object(A, "discover", fake_discover), mock.patch.object(A, "_session", lambda: None), \
                mock.patch.object(A, "download", self.fake_download(files)):
            self.assertEqual(A.main(argv), 0)                       # first run: nothing loaded yet, both stale
            self.assertEqual(self.q("SELECT COUNT(*) FROM ext_acnc_charities")[0][0], 1)
            self.assertEqual(self.q("SELECT COUNT(*) FROM ext_acnc_ais")[0][0], 1)
            n_log = self.q("SELECT COUNT(*) FROM ext_ingest_log")[0][0]
            self.assertEqual(A.main(argv), 0)                       # second: nothing changed, nothing written
            self.assertEqual(self.q("SELECT COUNT(*) FROM ext_ingest_log")[0][0], n_log)
            state["mod"] = "2026-10-04T19:00:00.000000"             # the register changes at the publisher
            self.assertEqual(A.main(argv), 0)
            loads = self.q("SELECT table_name FROM ext_ingest_log ORDER BY id")[n_log:]
            self.assertEqual(loads, [("ext_acnc_charities",)])      # only the register reloaded
            self.assertEqual(self.q("SELECT MAX(dataset_modified) FROM ext_acnc_charities")[0][0], state["mod"])

    def test_an_unsupported_layout_is_skipped_with_a_warning_and_is_not_a_failure(self):
        good = self.dir / "good.csv"
        write_csv(good, AIS_HEADER, [ais_row("11000073870", "X")])
        odd = self.dir / "odd.csv"
        write_csv(odd, ["abn", "charity name"], [{"abn": "11000073870", "charity name": "X"}])   # required columns missing

        def fake_discover(session, want, ais_years="3"):
            return [ds(A.SRC_AIS, "2024", resource_id="odd"), ds(A.SRC_AIS, "2023", resource_id="good")]

        with mock.patch.object(A, "discover", fake_discover), mock.patch.object(A, "_session", lambda: None), \
                mock.patch.object(A, "download", self.fake_download({"odd": odd, "good": good})):
            code = A.main(["--db", str(self.db), "--cache", str(self.dir)])
        self.assertEqual(code, 0)
        self.assertEqual(self.q("SELECT ais_year FROM ext_acnc_ais"), [(2023,)])

    def test_a_failed_dataset_does_not_block_the_others_and_exits_nonzero(self):
        good = self.dir / "good.csv"
        write_csv(good, AIS_HEADER, [ais_row("11000073870", "X")])

        def fake_download(session, d, cache, refresh=False):
            if d.resource_id == "broken":
                raise RuntimeError("download incomplete")
            return good

        def fake_discover(session, want, ais_years="3"):
            return [ds(A.SRC_AIS, "2024", resource_id="broken"), ds(A.SRC_AIS, "2023", resource_id="good")]

        with mock.patch.object(A, "discover", fake_discover), mock.patch.object(A, "_session", lambda: None), \
                mock.patch.object(A, "download", fake_download):
            code = A.main(["--db", str(self.db), "--cache", str(self.dir)])
        self.assertEqual(code, 2)
        self.assertEqual(self.q("SELECT ais_year FROM ext_acnc_ais"), [(2023,)])

    def test_status_writes_nothing(self):
        def fake_discover(session, want, ais_years="3"):
            return [ds(A.SRC_AIS, "2024", resource_id="x")]

        with mock.patch.object(A, "discover", fake_discover), mock.patch.object(A, "_session", lambda: None):
            self.assertEqual(A.main(["--db", str(self.db), "--status"]), 0)
        self.assertFalse(self.db.exists())


if __name__ == "__main__":
    unittest.main()
