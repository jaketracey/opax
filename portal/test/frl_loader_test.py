"""Offline, stubbed-HTTP FRL ingestion/export gates. No live source requests."""
import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from parli.ingest.frl_instruments import acquire, atomic_json, Held, PoliteSession, SCOPE, ROOT as LOADER_ROOT
from scripts.export_instruments import check_budget, plan_export, export


def title(i):
    return {"id": f"F2026L{i:05d}", "name": f"Exemption for Jane Citizen {i}",
            "collection": "LegislativeInstrument", "isInForce": True, "status": "InForce",
            "isPrincipal": True, "makingDate": "2026-01-02T00:00:00", "asMadeRegisteredAt": "2026-01-03T01:02:03",
            "administeringDepartments": [{"name": "Example department", "portfolio": "Example"}],
            "versions": [{"registerId": f"F2026L{i:05d}", "isCurrent": True, "isLatest": True,
                          "start": "2026-01-10T00:00:00", "registeredAt": "2026-01-03T01:02:03", "compilationNumber": "0"}],
            "statusHistory": [], "nameHistory": [], "statusPossibleFuture": []}


class HTTP:
    def __init__(self, rows, fail_offset=None, final_count=None, omit_expanded=None):
        self.rows, self.calls, self.requests = rows, [], 0
        self.fail_offset, self.final_count = fail_offset, final_count
        self.counts = 0
        self.omit_expanded = omit_expanded or set()

    def json(self, params):
        self.calls.append(params); self.requests += 1
        if "$skip" not in params:
            self.counts += 1
            n = self.final_count if self.counts > 1 and self.final_count is not None else len(self.rows)
            return {"@odata.count": n, "value": self.rows[:1]}
        offset = params["$skip"]
        if offset == self.fail_offset: raise Held("Stubbed interrupted HTTP")
        rows = copy.deepcopy(self.rows[offset:offset + params["$top"]])
        if "$expand" in params:
            rows = [r for r in rows if r["id"] not in self.omit_expanded]
        else:
            for row in rows:
                row.pop("versions", None); row.pop("administeringDepartments", None)
        return {"@odata.count": len(self.rows), "value": rows}



class FRLTests(unittest.TestCase):
    def setUp(self):
        (ROOT / "scripts/state/frl").mkdir(parents=True, exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=ROOT / "scripts/state/frl")
        self.base = Path(self.tmp.name); self.out = self.base / "snapshot.json"; self.cp = self.base / "checkpoint"

    def tearDown(self): self.tmp.cleanup()

    def test_ordered_paging_reconciles_every_id_and_keeps_public_fields(self):
        rows = [title(i) for i in range(101)]; rows[0]["statusHistory"] = [{"reasons": [{"affect": "Disallow", "affectedByTitle": {"titleId": "F2026L99999"}}]}]
        http = HTTP(rows); snapshot = acquire(http, self.out, self.cp)
        self.assertEqual(snapshot["count"], 101); self.assertEqual(snapshot["titles"], rows)
        pages = [p for p in http.calls if "$expand" in p]
        self.assertEqual([p["$skip"] for p in pages], [0, 100])
        self.assertTrue(all(p["$orderby"] == "id" and p["$top"] <= 100 for p in http.calls))
        self.assertTrue(all(p["$filter"].startswith(SCOPE) for p in http.calls))
        self.assertEqual(http.requests, 6)

    def test_resume_and_idempotence(self):
        rows = [title(i) for i in range(101)]
        with self.assertRaises(Held): acquire(HTTP(rows, fail_offset=100), self.out, self.cp)
        self.assertFalse(self.out.exists())
        http = HTTP(rows); acquire(http, self.out, self.cp)
        self.assertEqual([p["$skip"] for p in http.calls if "$expand" in p], [100])
        before = self.out.read_bytes(); acquire(HTTP(rows), self.out, self.cp)
        self.assertEqual(self.out.read_bytes(), before)

    def test_expansion_omission_never_drops_a_title_or_changes_skip(self):
        rows = [title(i) for i in range(201)]
        http = HTTP(rows, omit_expanded={rows[99]["id"], rows[101]["id"]})
        snapshot = acquire(http, self.out, self.cp)
        self.assertEqual(snapshot["count"], 201)
        self.assertEqual(snapshot["metadata_coverage"]["expanded_titles"], 199)
        self.assertEqual(snapshot["metadata_coverage"]["missing_expansion_ids"], [rows[99]["id"], rows[101]["id"]])
        self.assertEqual([p["$skip"] for p in http.calls if "$expand" in p], [0, 100, 200])
        self.assertNotIn("versions", snapshot["titles"][99])
        self.assertFalse(snapshot["titles"][99]["_opax_metadata"]["expansion_returned"])
        self.assertEqual(snapshot["titles"][100]["versions"], rows[100]["versions"])

    def test_next_week_fetches_new_metadata_even_when_count_unchanged(self):
        rows = [title(1)]; acquire(HTTP(rows), self.out, self.cp)
        rows[0]["administeringDepartments"][0]["portfolio"] = "Changed portfolio"
        http = HTTP(rows); snapshot = acquire(http, self.out, self.cp)
        self.assertEqual(http.requests, 4)
        self.assertEqual(snapshot["titles"][0]["administeringDepartments"][0]["portfolio"], "Changed portfolio")

    def test_duplicates_and_moving_count_refuse_write(self):
        rows = [title(i) for i in range(101)]; rows[-1] = copy.deepcopy(rows[-2])
        with self.assertRaises(Held): acquire(HTTP(rows), self.out, self.cp)
        self.assertFalse(self.out.exists())
        with self.assertRaises(Held): acquire(HTTP([title(1)], final_count=2), self.out, self.base / 'other')
        self.assertFalse(self.out.exists())

    def test_empty_and_shrink_guard_keep_last_good_bytes(self):
        atomic_json(self.out, {"count": 100, "titles": [title(i) for i in range(100)]})
        original = self.out.read_bytes()
        for rows in ([], [title(i) for i in range(97)]):
            with self.assertRaises(Held): acquire(HTTP(rows), self.out, self.cp)
            self.assertEqual(self.out.read_bytes(), original)
        snapshot = acquire(HTTP([title(i) for i in range(98)]), self.out, self.cp)
        self.assertEqual(snapshot["count"], 98)

    def test_backoff_and_budget_count_each_http_attempt(self):
        replies = iter([subprocess.CompletedProcess([], 0, b'HTTP/2 429\r\nRetry-After: 7\r\n\r\nbusy\n429', b''),
                        subprocess.CompletedProcess([], 0, b'HTTP/2 503\r\n\r\nbusy\n503', b''),
                        subprocess.CompletedProcess([], 0, b'HTTP/2 200\r\n\r\n{}\n200', b'')])
        sleeps = []
        with patch('parli.ingest.frl_instruments.subprocess.run', side_effect=lambda *a, **k: next(replies)):
            session = PoliteSession(sleep=sleeps.append, clock=lambda: 0)
            self.assertEqual(session.get('https://api.prod.legislation.gov.au/v1/titles'), b'{}')
            self.assertEqual(session.requests, 3); self.assertIn(7, sleeps); self.assertIn(10, sleeps)
        with patch('parli.ingest.frl_instruments.subprocess.run') as http:
            with self.assertRaises(Held): PoliteSession(initial_requests=600).get('https://api.prod.legislation.gov.au/v1/titles')
            http.assert_not_called()

    def test_export_budget_and_projection_preserve_source_values(self):
        row = title(1); row['versions'].append({"registerId": "F2025L00001", "isLatest": False, "isCurrent": False})
        snapshot = {"scope": SCOPE, "count": 1, "odata_count": 1, "metadata_only": True, "generated_at": "2026-10-09T00:00:00Z", "titles": [row]}
        payloads, manifest = plan_export(snapshot)
        self.assertLessEqual(len(payloads), 400); self.assertLessEqual(sum(map(len, payloads.values())), 25_000_000)
        self.assertEqual(manifest['lookup'], {'F2026L00001': 0})
        self.assertEqual(json.loads(payloads['index.json'])['records'][0][4], None)
        with self.assertRaises(Held): check_budget({str(i): b'{}' for i in range(401)})
        with self.assertRaises(Held): check_budget({'big': b'x' * 25_000_001})
        atomic_json(self.out, snapshot); dest = self.base / 'export'; export(self.out, dest)
        before = {p.name: p.read_bytes() for p in dest.iterdir()}; export(self.out, dest)
        self.assertEqual(before, {p.name: p.read_bytes() for p in dest.iterdir()})
        atomic_json(self.out, {**snapshot, 'count': 0, 'odata_count': 0, 'titles': []})
        with self.assertRaises(Held): export(self.out, dest)
        self.assertEqual(before, {p.name: p.read_bytes() for p in dest.iterdir()})


if __name__ == '__main__': unittest.main()
