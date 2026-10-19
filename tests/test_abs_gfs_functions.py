"""Synthetic fixtures preserve the official purpose hierarchy and education layout."""
import copy
from contextlib import redirect_stdout, redirect_stderr
import hashlib
from io import StringIO
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from scripts.abs_gfs import functions as f
from scripts.abs_gfs.check import checked_projection
from scripts.abs_gfs.stage import projection
from test_abs_gfs import document


def grid():
    return [["Australian Bureau of Statistics"], ["55120DO003_202425"], ["Release"],
            ["Table 4 New South Wales State General Government Expenses by Purpose"],
            [None, "2023-24", "2024-25"], [None, "$m", "$m"],
            ["General public services"], ["Public debt transactions", 1, 2],
            ["Other general public services", 3, 4], ["Total general public services", 4, 6],
            ["Environmental Protection", 7, 8], ["Education"],
            ["Pre-primary, primary and secondary education", 10, 11], ["Tertiary education", 20, 21],
            ["Other education", 30, 31], ["Total education", 60, 63], [None], ["Total Expenses", 71, 77]]


class FunctionTest(unittest.TestCase):
    def test_official_hierarchy_labels_cells_and_absent_codes(self):
        rows = f.parse_sheet(grid(), "Table_4", document())
        self.assertEqual(len(rows), 18)
        self.assertEqual(rows[0]["cell"], "B8")
        self.assertEqual(rows[0]["group"], "Public debt transactions")
        self.assertEqual(rows[0]["division"], "General public services")
        self.assertTrue(all(r["division_code"] is None and r["group_code"] is None for r in rows))
        self.assertIn("Environmental Protection", [r["function_as_published"] for r in rows])
        self.assertEqual([r["value"] for r in rows if r["function_level"] == "total"], [71, 77])
        self.assertFalse(any(r["division"] == "Defence" for r in rows))

    def test_checks_are_diagnostics_and_use_only_one_group_and_year(self):
        rows = f.parse_sheet(grid(), "Table_4", document())
        headlines = [{**r, "measure": "expenses"} for r in rows if r["function_level"] == "total"]
        before = copy.deepcopy(rows)
        checks = f.reconcile(rows, headlines)
        self.assertEqual(rows, before)
        self.assertEqual(len(checks), 8)
        self.assertTrue(all(c["status"] == "pass" for c in checks))
        # Keep the rounded published cell rather than replacing it with the component sum.
        rows[-1]["value"] += 1
        checks = f.reconcile(rows, headlines)
        self.assertTrue(any(c["status"] == "fail" for c in checks if c["identity"] == "function_total_to_headline_expenses"))
        self.assertTrue(all(c["status"] == "pass" for c in checks if c["identity"] == "function_divisions_to_published_total"))

    def test_missing_values_not_zero_and_unavailable_check_never_passes(self):
        g = grid(); g[7][1] = "np"; g[7][2] = 0
        rows = f.parse_sheet(g, "Table_4", document())
        self.assertIsNone(rows[0]["value"]); self.assertEqual(rows[0]["source_marker"], "np")
        self.assertEqual(rows[1]["value"], 0)
        self.assertIn("unavailable", [c["status"] for c in f.reconcile(rows, [])])

    def test_layout_unit_marker_and_missing_published_total_fail(self):
        for mutate in [lambda g:g[5].__setitem__(1, "$bn"), lambda g:g[7].__setitem__(1, True),
                       lambda g:g[7].__setitem__(1, float('nan')), lambda g:g[7].__setitem__(0, "Unknown group"),
                       lambda g:g.pop()]:
            g=grid(); mutate(g)
            with self.assertRaises(ValueError): f.parse_sheet(g, "Table_4", document())

    def test_education_keeps_own_labels_and_excludes_context_assets_and_grants(self):
        d=document();d.update(id="55120DO095_202425",dimensions=None,sheets=[{"sheet":"Table_16","title":"Table 16 - Education, Australian Capital Territory Government"}])
        g=[[None],[None],[None],[d["sheets"][0]["title"]],[None],[None,"2024-25"],[None," $m"],
           ["Operating expenses on education, by purpose"],["School education",10],["Tertiary education",20],
           ["Other education",30],["Total operating expenses on education, by purpose",60],
           ["Net acquisition of non-financial assets"],["Unrelated",999]]
        rows=f.parse_sheet(g,"Table_16",d)
        self.assertEqual(len(rows),4);self.assertTrue(all(r["level_of_government"] == "State" for r in rows))
        self.assertEqual(rows[0]["group"],"School education")
        for sheet in ["Table_18","Table_19","Table_2","Table_3"]:
            self.assertEqual(f.parse_sheet(g,sheet,d),[])

    def test_held_and_invented_consolidations_never_export(self):
        d=document();rows=f.parse_sheet(grid(),"Table_4",d)
        inventory={"snapshot":"2026-10-17","release":"2024-25","release_date":"2026-04-21","workbooks":[d]}
        invented={**rows[0],"level_of_government":"All levels of government","value":99999}
        self.assertNotIn(invented,projection(inventory,[],[*rows,invented])["function_rows"])
        for mutate in [lambda d:d.update(status="held"),lambda d:d["licence"].update(workbook_reviewed=False),lambda d:d["receipt"].update(challenge=True)]:
            held=copy.deepcopy(d);mutate(held)
            self.assertEqual(f.parse_sheet(grid(),"Table_4",held),[])
            self.assertEqual(projection({**inventory,"workbooks":[held]},[],rows)["function_rows"],[])

    def test_real_staged_totals_match_headlines_without_basis_adjustment(self):
        from scripts.abs_gfs.stage import ROOT
        hub,counts=checked_projection(ROOT/"data/staged/abs-gfs")
        self.assertEqual(counts["function_rows"],4340)
        self.assertEqual(counts["function_reconciliation"],{"pass":1040})
        totals=[r for r in hub["function_rows"] if r["function_level"]=="total"]
        self.assertEqual(len(totals),200)
        self.assertTrue(all(r["workbook"]!='55120DO095_202425.xlsx' or r["sheet"]!='Table_19' for r in hub["function_rows"]))
        self.assertEqual(len({f.key(r) for r in hub["function_rows"]}),4340)

    def test_promoter_round_trip_and_changed_input_or_pending_review_hold(self):
        from scripts.promote_hub_data import ROOT,INPUTS,promote
        with tempfile.TemporaryDirectory(prefix="opax-function-test-") as scratch:
            root=Path(scratch);stage=root/"data/staged/abs-gfs"
            shutil.copytree(ROOT/"data/staged/abs-gfs",stage)
            public=root/"portal/public";public.mkdir(parents=True)
            votes=(ROOT/"portal/public/votes.json").read_bytes();(public/"votes.json").write_bytes(votes)
            review={"status":"approved","reviewed_commit":"synthetic-function-review-fixture", "inputs":{p:hashlib.sha256((stage/p).read_bytes()).hexdigest() for p in INPUTS["abs-gfs"]}}
            (stage/"review.json").write_text(json.dumps(review))
            with redirect_stdout(StringIO()),redirect_stderr(StringIO()):
                self.assertEqual(promote(["abs-gfs"],root,dry_run=True),0)
                self.assertFalse((public/"government-finance").exists())
                self.assertEqual(promote(["abs-gfs"],root),0)
                self.assertEqual(promote(["abs-gfs"],root,check_public=True),0)
                target=public/"government-finance/data.json";before=target.read_bytes()
                self.assertEqual(len(json.loads(before)["function_rows"]),4340)
                (stage/"function-summary.json").write_text('{}')
                self.assertEqual(promote(["abs-gfs"],root),1)
                self.assertEqual(target.read_bytes(),before)
                review["status"]="pending";(stage/"review.json").write_text(json.dumps(review))
                self.assertEqual(promote(["abs-gfs"],root),1)
            self.assertEqual((public/"votes.json").read_bytes(),votes)


if __name__ == "__main__":
    unittest.main()
