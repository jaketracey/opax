"""Offline FRL regressions: every HTTP response and clock is stubbed."""
import copy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from parli.ingest import frl_instruments as loader
from parli.ingest.frl_instruments import acquire, atomic_json, Held, PoliteSession, SCOPE, quiet_window
from scripts.export_instruments import check_budget, plan_export, export
sys.path.insert(0, str(ROOT / 'scripts/vm'))
from validate_data import check_instruments

QUIET = datetime(2026, 10, 9, 11, tzinfo=timezone.utc)  # 22:00 Melbourne, 21:00 AEST.


def title(i):
    return {"id": f"F2026L{i:05d}", "name": f"Exemption for Jane Citizen {i}",
            "collection": "LegislativeInstrument", "isInForce": True, "status": "InForce",
            "isPrincipal": True, "makingDate": "2026-01-02T00:00:00", "asMadeRegisteredAt": "2026-01-03T01:02:03",
            "administeringDepartments": [{"name": "Example department", "portfolio": "Example"}],
            "versions": [{"registerId": f"F2026L{i:05d}", "isCurrent": True, "isLatest": True,
                          "start": "2026-01-10T00:00:00", "registeredAt": "2026-01-03T01:02:03", "compilationNumber": "0"}],
            "statusHistory": [], "nameHistory": [], "statusPossibleFuture": []}


def snapshot(rows, downloaded=QUIET.isoformat()):
    return {"schema": 1, "scope": SCOPE, "count": len(rows), "odata_count": len(rows), "metadata_only": True,
            "generated_at": downloaded, "downloaded_at": downloaded, "titles": rows,
            "metadata_coverage": {"expanded_titles": len(rows), "missing_expansion_ids": []}}


class HTTP:
    def __init__(self, rows, fail_offset=None, final_count=None, expansion=None, started=QUIET, individual=None):
        self.rows, self.calls, self.requests = rows, [], 0
        self.fail_offset, self.final_count, self.expansion = fail_offset, final_count, expansion
        self.individual, self.individual_calls = individual, []
        self.counts, self.expansions, self.started = 0, 0, started
        self.sleep = lambda _: None

    def now(self): return self.started

    def json(self, params):
        self.calls.append(params.copy()); self.requests += 1
        if "$skip" not in params:
            self.counts += 1
            n = self.final_count if self.counts > 1 and self.final_count is not None else len(self.rows)
            return {"@odata.count": n, "value": copy.deepcopy(self.rows[:1])}
        offset = params["$skip"]
        if offset == self.fail_offset: raise Held("Stubbed interrupted HTTP")
        rows = copy.deepcopy(self.rows[offset:offset + params["$top"]])
        if "$expand" in params:
            self.expansions += 1
            if self.expansion: rows = self.expansion(rows, self.expansions)
        else:
            for row in rows:
                row.pop("versions", None); row.pop("administeringDepartments", None)
        return {"@odata.count": len(self.rows), "value": rows}

    def title_json(self, key, params):
        self.calls.append({"entity": key, **params}); self.requests += 1
        self.individual_calls.append((key, params.copy()))
        if self.individual is None: raise Held("Stubbed individual HTTP failure")
        return copy.deepcopy(self.individual(key))


class FRLTests(unittest.TestCase):
    def setUp(self):
        (ROOT / "scripts/state/frl").mkdir(parents=True, exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=ROOT / "scripts/state/frl")
        self.base = Path(self.tmp.name); self.out = self.base / "snapshot.json"; self.cp = self.base / "checkpoint"

    def tearDown(self): self.tmp.cleanup()

    def test_ordered_paging_reconciles_every_id_and_keeps_public_fields(self):
        rows = [title(i) for i in range(101)]; rows[0]["statusHistory"] = [{"reasons": [{"affect": "Disallow", "affectedByTitle": {"titleId": "F2026L99999"}}]}]
        http = HTTP(rows); result = acquire(http, self.out, self.cp)
        self.assertEqual(result["count"], 101); self.assertEqual(result["titles"], rows)
        self.assertEqual([p["$skip"] for p in http.calls if "$expand" in p], [0, 100])
        self.assertTrue(all(p["$orderby"] == "id" and p["$top"] <= 100 for p in http.calls))
        self.assertTrue(all(p["$filter"].startswith(SCOPE) for p in http.calls))
        self.assertEqual(http.requests, 6)

    def test_resume_only_within_same_window_and_query(self):
        rows = [title(i) for i in range(101)]
        with self.assertRaises(Held): acquire(HTTP(rows, fail_offset=100), self.out, self.cp)
        self.assertFalse(self.out.exists())
        http = HTTP(rows); acquire(http, self.out, self.cp)
        self.assertEqual([p["$skip"] for p in http.calls if "$expand" in p], [100])
        before = self.out.read_bytes(); acquire(HTTP(rows), self.out, self.cp)
        self.assertEqual(self.out.read_bytes(), before)

    def test_201_count_does_not_hide_stale_membership_after_window_expiry(self):
        rows = [title(i) for i in range(201)]
        with self.assertRaises(Held): acquire(HTTP(rows, fail_offset=100), self.out, self.cp)
        changed = [r for r in rows if r['id'] != 'F2026L00005'] + [title(500)]
        http = HTTP(changed, started=QUIET + timedelta(days=1))
        result = acquire(http, self.out, self.cp)
        ids = {r['id'] for r in result['titles']}
        self.assertEqual(result['count'], 201)
        self.assertEqual(ids, {r['id'] for r in changed})
        self.assertNotIn('F2026L00005', ids); self.assertIn('F2026L00101', ids)
        self.assertEqual([p['$skip'] for p in http.calls if '$expand' in p], [0, 100, 200])
        self.assertTrue((self.base / 'checkpoint.previous/titles-000000.json').exists())

    def test_week_two_and_three_auto_rotate_instead_of_permanent_block(self):
        with self.assertRaises(Held): acquire(HTTP([title(i) for i in range(101)], fail_offset=100), self.out, self.cp)
        # Week 2 restarts successfully, but suffers an independent late interruption.
        with self.assertRaises(Held): acquire(HTTP([title(i) for i in range(201)], fail_offset=200, started=QUIET + timedelta(days=7)), self.out, self.cp)
        self.assertTrue((self.cp / 'page-000100.json').exists())
        http = HTTP([title(i) for i in range(202)], started=QUIET + timedelta(days=14))
        result = acquire(http, self.out, self.cp)
        self.assertEqual(result['count'], 202)
        self.assertEqual([p['$skip'] for p in http.calls if '$expand' in p], [0, 100, 200])
        previous = json.loads((self.base / 'checkpoint.previous/config.json').read_text())
        self.assertEqual(previous['count'], 201)  # most recent evidence only

    def test_scope_fingerprint_covers_filter_fields_expand_and_count(self):
        for key in ('SCOPE', 'FIELDS', 'EXPAND'):
            with self.subTest(key=key):
                cp = self.base / key
                with self.assertRaises(Held): acquire(HTTP([title(i) for i in range(101)], fail_offset=100), self.out, cp)
                old = json.loads((cp / 'config.json').read_text())
                with patch.object(loader, key, getattr(loader, key) + ' changed'):
                    acquire(HTTP([title(i) for i in range(101)]), self.out, cp)
                new = json.loads((cp / 'config.json').read_text())
                self.assertNotEqual(old['fingerprint'], new['fingerprint'])
                self.assertTrue(cp.with_name(cp.name + '.previous').exists())
        cp = self.base / 'count'
        with self.assertRaises(Held): acquire(HTTP([title(i) for i in range(101)], fail_offset=100), self.out, cp)
        acquire(HTTP([title(i) for i in range(102)]), self.out, cp)
        self.assertTrue(cp.with_name(cp.name + '.previous').exists())

    def test_legacy_checkpoint_is_archived_without_reusing_any_rows(self):
        self.cp.mkdir(); atomic_json(self.cp / 'config.json', {'count': 1, 'scope': SCOPE, 'expand': loader.EXPAND, 'page_size': 100})
        atomic_json(self.cp / 'page-000000.json', {'@odata.count': 1, 'value': [title(999)]})
        http = HTTP([title(1)]); result = acquire(http, self.out, self.cp)
        self.assertEqual(result['titles'], [title(1)]); self.assertEqual(http.requests, 4)
        self.assertTrue((self.base / 'checkpoint.previous/page-000000.json').exists())

    def test_expansion_omission_retries_then_preserves_last_snapshot(self):
        acquire(HTTP([title(i) for i in range(201)]), self.out, self.cp)
        before = self.out.read_bytes()
        http = HTTP([title(i) for i in range(201)], expansion=lambda rows, _: rows[:-1])
        with self.assertRaisesRegex(Held, 'incomplete after 3 attempts'): acquire(http, self.out, self.cp)
        self.assertEqual(http.expansions, 3); self.assertEqual(self.out.read_bytes(), before)
        self.assertFalse((self.cp / 'complete.json').exists())

    def test_omitted_parent_resolves_from_its_own_individual_expansion(self):
        rows = [title(i) for i in range(101)]; key = rows[99]['id']
        http = HTTP(rows, expansion=lambda page, _: [r for r in page if r['id'] != key],
                    individual=lambda requested: next(r for r in rows if r['id'] == requested))
        result = acquire(http, self.out, self.cp)
        self.assertEqual(result['count'], 101); self.assertEqual(result['titles'], rows)
        self.assertEqual(http.expansions, 4); self.assertEqual(http.requests, 9)
        self.assertEqual(http.individual_calls, [(key, {'$expand': loader.EXPAND})])
        run = json.loads((self.base / 'run-receipt.json').read_text())
        self.assertEqual(run['individual_fetch_ids'], [key])
        evidence = json.loads((self.cp / 'individual-fetches.json').read_text())
        self.assertEqual(evidence[key]['status'], 'complete')
        self.assertEqual(evidence[key]['response'], rows[99])
        self.assertEqual(json.loads((self.cp / 'page-000000.json').read_text())['_opax_individual_ids'], [key])
        self.assertTrue(plan_export(result)[1]['complete'])

    def test_failed_individual_expansion_holds_and_preserves_snapshot(self):
        rows = [title(i) for i in range(101)]; key = rows[99]['id']
        acquire(HTTP(rows), self.out, self.cp); before = self.out.read_bytes()
        http = HTTP(rows, expansion=lambda page, _: [r for r in page if r['id'] != key])
        with self.assertRaisesRegex(Held, 'individual .* failed'): acquire(http, self.out, self.cp)
        self.assertEqual(http.individual_calls, [(key, {'$expand': loader.EXPAND})])
        self.assertEqual(self.out.read_bytes(), before)
        self.assertFalse((self.cp / 'complete.json').exists())
        evidence = json.loads((self.cp / 'individual-fetches.json').read_text())
        self.assertEqual(evidence[key]['status'], 'failed')

    def test_individual_response_cannot_fill_another_id_or_missing_fields(self):
        for response in (title(999), {k:v for k,v in title(1).items() if k != 'versions'}, None):
            with self.subTest(response=response):
                http = HTTP([title(1)], expansion=lambda page, _: [], individual=lambda _: response)
                with self.assertRaises(Held): acquire(http, self.out, self.cp)
                self.assertFalse(self.out.exists())
                self.assertEqual(len(http.individual_calls), 1)

    def test_individual_recovery_cap_is_fifty_across_pages(self):
        rows = [title(i) for i in range(101)]
        # Exactly fifty is allowed. The next page's one omission exceeds the cap.
        http = HTTP(rows, expansion=lambda page, _: [r for r in page if int(r['id'][-5:]) >= 50 and int(r['id'][-5:]) < 100],
                    individual=lambda key: next(r for r in rows if r['id'] == key))
        with self.assertRaisesRegex(Held, 'More than 50'): acquire(http, self.out, self.cp)
        self.assertEqual(len(http.individual_calls), 50)
        self.assertFalse(self.out.exists())
        self.assertEqual(len(json.loads((self.cp / 'individual-fetches.json').read_text())), 50)

    def test_more_than_fifty_omitted_ids_holds_before_individual_reads(self):
        rows = [title(i) for i in range(100)]
        http = HTTP(rows, expansion=lambda page, _: page[51:], individual=lambda _: title(1))
        with self.assertRaisesRegex(Held, 'More than 50'): acquire(http, self.out, self.cp)
        self.assertEqual(http.individual_calls, []); self.assertFalse(self.out.exists())

    def test_single_entity_uses_shared_polite_transport_and_same_expansion(self):
        key = 'F2026L00001'; reply = copy.deepcopy(title(1))
        session = PoliteSession(now=lambda: QUIET)
        with patch.object(session, 'get', return_value=json.dumps(reply).encode()) as get:
            self.assertEqual(session.title_json(key, {'$expand': loader.EXPAND}), reply)
            from urllib.parse import parse_qs, urlsplit
            url = get.call_args.args[0]
            self.assertEqual(urlsplit(url).path, f"/v1/titles('{key}')")
            self.assertEqual(parse_qs(urlsplit(url).query), {'$expand': [loader.EXPAND]})

    def test_empty_wrong_parent_and_missing_field_expansions_all_hold(self):
        def missing_field(rows, _): rows[0].pop('versions'); return rows
        cases = [lambda rows, _: [], lambda rows, _: [title(999)], missing_field]
        for i, expansion in enumerate(cases):
            with self.subTest(case=i):
                http = HTTP([title(1)], expansion=expansion)
                with self.assertRaises(Held): acquire(http, self.out, self.base / f'case-{i}')
                self.assertEqual(http.expansions, 3); self.assertFalse(self.out.exists())

    def test_transient_bad_expansion_recovers_by_retry(self):
        http = HTTP([title(1)], expansion=lambda rows, n: [] if n < 3 else rows)
        result = acquire(http, self.out, self.cp)
        self.assertEqual(http.expansions, 3)
        self.assertEqual(result['metadata_coverage'], {'expanded_titles': 1, 'missing_expansion_ids': []})

    def test_malformed_expansion_json_is_retried(self):
        class Malformed(HTTP):
            def json(inner, params):
                result = super(Malformed, inner).json(params)
                if '$expand' in params and inner.expansions < 3:
                    raise json.JSONDecodeError('stubbed invalid JSON', '', 0)
                return result
        http = Malformed([title(1)])
        self.assertEqual(acquire(http, self.out, self.cp)['count'], 1)
        self.assertEqual(http.expansions, 3)

    def test_explicit_empty_fields_are_legitimate_source_evidence(self):
        row = title(1); row['versions'] = []; row['administeringDepartments'] = []
        result = acquire(HTTP([row]), self.out, self.cp)
        self.assertEqual(result['titles'][0], row)
        self.assertTrue(plan_export(result)[1]['complete'])

    def test_bad_cached_expansion_is_retried(self):
        rows = [title(i) for i in range(101)]
        with self.assertRaises(Held): acquire(HTTP(rows, fail_offset=100), self.out, self.cp)
        atomic_json(self.cp / 'page-000000.json', {'@odata.count': 101, 'value': []})
        http = HTTP(rows); acquire(http, self.out, self.cp)
        self.assertEqual([p['$skip'] for p in http.calls if '$expand' in p], [0, 100])

    def test_duplicates_and_moving_count_refuse_write(self):
        rows = [title(i) for i in range(101)]; rows[-1] = copy.deepcopy(rows[-2])
        with self.assertRaises(Held): acquire(HTTP(rows), self.out, self.cp)
        self.assertFalse(self.out.exists())
        with self.assertRaises(Held): acquire(HTTP([title(1)], final_count=2), self.out, self.base / 'other')
        self.assertFalse(self.out.exists())

    def test_empty_and_shrink_guard_keep_last_good_bytes(self):
        atomic_json(self.out, snapshot([title(i) for i in range(100)])); original = self.out.read_bytes()
        for rows in ([], [title(i) for i in range(97)]):
            with self.assertRaises(Held): acquire(HTTP(rows), self.out, self.cp)
            self.assertEqual(self.out.read_bytes(), original)
        self.assertEqual(acquire(HTTP([title(i) for i in range(98)]), self.out, self.cp)['count'], 98)

    def test_latest_download_advances_attribution_even_if_content_unchanged(self):
        acquire(HTTP([title(1)]), self.out, self.cp)
        result = acquire(HTTP([title(1)], started=QUIET + timedelta(days=7)), self.out, self.cp)
        self.assertEqual(result['generated_at'], QUIET.isoformat())
        self.assertEqual(result['downloaded_at'], (QUIET + timedelta(days=7)).isoformat())
        manifest = plan_export(result)[1]
        self.assertIn('16 October 2026', manifest['attribution']['dated'])
        self.assertEqual(manifest['generated_at'], result['downloaded_at'])

    def test_dst_quiet_window_is_intersection_and_boundaries_are_blocked(self):
        for stamp in ('2026-10-09T09:59:59+00:00', '2026-10-09T21:00:00+00:00', '2026-10-09T21:59:59+00:00'):
            with self.subTest(stamp=stamp), self.assertRaises(Held): quiet_window(datetime.fromisoformat(stamp))
        expected = {'start': '2026-10-09T10:00:00+00:00', 'end': '2026-10-09T21:00:00+00:00'}
        self.assertEqual(quiet_window(datetime.fromisoformat('2026-10-09T10:00:00+00:00')), expected)
        self.assertEqual(quiet_window(datetime.fromisoformat('2026-10-09T20:59:59+00:00')), expected)

    def test_standard_time_quiet_window(self):
        self.assertEqual(quiet_window(datetime.fromisoformat('2026-07-09T11:00:00+00:00')),
                         {'start': '2026-07-09T10:00:00+00:00', 'end': '2026-07-09T22:00:00+00:00'})

    def test_busy_window_blocks_before_policy_probes_and_every_publisher_request(self):
        busy = datetime.fromisoformat('2026-10-09T21:30:00+00:00')
        with patch.object(loader.subprocess, 'run') as transport:
            session = PoliteSession(now=lambda: busy)
            with self.assertRaises(Held): session.access_policy()
            for path in ('https://www.legislation.gov.au/robots.txt', 'https://www.legislation.gov.au/terms-of-use', loader.API):
                with self.assertRaises(Held): session.get(path)
            transport.assert_not_called(); self.assertEqual(session.requests, 0)

    def test_spacing_crosses_busy_boundary_without_making_request(self):
        current = [datetime.fromisoformat('2026-10-09T20:59:59+00:00')]
        def sleep(_): current[0] += timedelta(seconds=2)
        with patch.object(loader.subprocess, 'run') as transport:
            session = PoliteSession(now=lambda: current[0], sleep=sleep, clock=lambda: 0)
            with self.assertRaises(Held): session.get(loader.API)
            transport.assert_not_called(); self.assertEqual(session.requests, 0)

    def test_request_cannot_cross_into_a_later_quiet_window(self):
        current = [QUIET]
        reply = subprocess.CompletedProcess([], 0, b'HTTP/2 200\r\n\r\n{}\n200', b'')
        with patch.object(loader.subprocess, 'run', return_value=reply) as transport:
            session = PoliteSession(now=lambda: current[0], sleep=lambda _: None, clock=lambda: 0)
            session.get(loader.API)
            current[0] += timedelta(days=1)
            with self.assertRaisesRegex(Held, 'quiet window expired'): session.get(loader.API)
            self.assertEqual(transport.call_count, 1)

    def test_backoff_and_budget_count_each_http_attempt(self):
        replies = iter([subprocess.CompletedProcess([], 0, b'HTTP/2 429\r\nRetry-After: 7\r\n\r\nbusy\n429', b''),
                        subprocess.CompletedProcess([], 0, b'HTTP/2 503\r\n\r\nbusy\n503', b''),
                        subprocess.CompletedProcess([], 0, b'HTTP/2 200\r\n\r\n{}\n200', b'')])
        sleeps = []
        with patch.object(loader.subprocess, 'run', side_effect=lambda *a, **k: next(replies)):
            session = PoliteSession(sleep=sleeps.append, clock=lambda: 0, now=lambda: QUIET)
            self.assertEqual(session.get(loader.API), b'{}')
            self.assertEqual(session.requests, 3); self.assertIn(7, sleeps); self.assertIn(10, sleeps)
        with patch.object(loader.subprocess, 'run') as http:
            with self.assertRaises(Held): PoliteSession(initial_requests=600, now=lambda: QUIET).get(loader.API)
            http.assert_not_called()

    def test_acts_busy_guard_runs_before_publisher_or_database_access(self):
        from parli.ingest import words_parlinfo as acts
        busy = datetime.fromisoformat('2026-10-09T21:30:00+00:00')
        session = PoliteSession(now=lambda: busy)
        args = SimpleNamespace(rps=.7, db='unused', skip=0, limit=None)
        with patch.object(acts, 'FRLSession', return_value=session), patch.object(acts, 'connect_db') as db, patch.object(loader.subprocess, 'run') as transport, patch.object(loader, 'quiet_window', wraps=quiet_window) as guard:
            with self.assertRaises(Held): acts.run_frl_acts(args)
            db.assert_not_called(); transport.assert_not_called(); guard.assert_called_once()

    def test_acts_guard_checks_again_after_spacing_crosses_busy_boundary(self):
        from parli.ingest import words_parlinfo as acts
        current = [datetime.fromisoformat('2026-10-09T20:59:59+00:00')]
        def sleep(_): current[0] += timedelta(seconds=2)
        session = PoliteSession(now=lambda: current[0], sleep=sleep, clock=lambda: 0)
        args = SimpleNamespace(rps=.7, db='unused', skip=0, limit=None)
        with patch.object(acts, 'FRLSession', return_value=session), patch.object(acts, 'connect_db'), patch.object(acts, 'ensure_table'), patch.object(loader.subprocess, 'run') as transport:
            with self.assertRaises(Held): acts.run_frl_acts(args)
            transport.assert_not_called(); self.assertEqual(session.requests, 0)

    def test_acts_quiet_run_uses_guarded_transport_with_stubbed_api_and_db(self):
        from parli.ingest import words_parlinfo as acts
        session = PoliteSession(now=lambda: QUIET, sleep=lambda _: None, clock=lambda: 0)
        args = SimpleNamespace(rps=.7, db='unused', skip=0, limit=None)
        row = {'id':'C2026A00001','name':'Fixture Act','makingDate':'2026-01-01','isPrincipal':True,'isInForce':True}
        body = json.dumps({'@odata.count':1,'value':[row]}).encode()
        reply = subprocess.CompletedProcess([],0,b'HTTP/2 200\r\n\r\n'+body+b'\n200',b'')
        with patch.object(acts, 'FRLSession', return_value=session), patch.object(acts, 'connect_db') as db, patch.object(acts, 'ensure_table'), patch.object(acts, 'upsert', return_value=1) as store, patch.object(loader.subprocess, 'run', return_value=reply):
            db.return_value.execute.return_value.fetchone.return_value = (1,0,0)
            acts.run_frl_acts(args)
            self.assertEqual(session.requests, 1)
            self.assertGreaterEqual(session.delay,2)
            self.assertEqual(store.call_args.args[2][0]['act_id'],row['id'])

    def test_export_budget_projection_and_release_gate(self):
        row = title(1); staged = snapshot([row])
        payloads, manifest = plan_export(staged)
        self.assertLessEqual(len(payloads), 400); self.assertLessEqual(sum(map(len, payloads.values())), 25_000_000)
        self.assertEqual(manifest['lookup'], {'F2026L00001': 0})
        self.assertEqual(json.loads(payloads['index.json'])['records'][0][4], None)
        with self.assertRaises(Held): check_budget({str(i): b'{}' for i in range(401)})
        with self.assertRaises(Held): check_budget({'big': b'x' * 25_000_001})
        atomic_json(self.out, staged); dest = self.base / 'export'; export(self.out, dest)
        self.assertEqual(check_instruments(dest, compare_head=False), [])
        ready=json.loads((dest / 'ready.json').read_text())
        self.assertEqual(ready,{'complete':True,'count':1,'export_date':staged['downloaded_at'][:10]})
        for wrong in ({**ready,'complete':False},{**ready,'count':2},{**ready,'export_date':'2026-10-08'}):
            atomic_json(dest / 'ready.json',wrong)
            self.assertEqual(check_instruments(dest,compare_head=False),['instruments readiness flag mismatch'])
        atomic_json(dest / 'ready.json',ready)
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/check_instruments_release.py'), '--directory', str(dest)], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        before = {p.name: p.read_bytes() for p in dest.iterdir()}; export(self.out, dest)
        self.assertEqual(before, {p.name: p.read_bytes() for p in dest.iterdir()})
        atomic_json(self.out, {**staged, 'count': 0, 'odata_count': 0, 'titles': []})
        with self.assertRaises(Held): export(self.out, dest)
        self.assertEqual(before, {p.name: p.read_bytes() for p in dest.iterdir()})
        manifest['metadata_coverage']['expanded_titles'] = 0
        atomic_json(dest / 'manifest.json', manifest)
        self.assertIn('incomplete', check_instruments(dest, compare_head=False)[0])
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/check_instruments_release.py'), '--directory', str(dest)], capture_output=True)
        self.assertEqual(result.returncode, 1); self.assertIn(b'incomplete', result.stderr)

    def test_export_refuses_incomplete_expansion_receipt_or_missing_fields(self):
        for missing in ('receipt', 'versions', 'administeringDepartments'):
            with self.subTest(missing=missing):
                staged = snapshot([title(1)])
                if missing == 'receipt': staged['metadata_coverage']['missing_expansion_ids'] = ['F2026L00001']
                else: staged['titles'][0].pop(missing)
                with self.assertRaisesRegex(Held, 'Incomplete'): plan_export(staged)


if __name__ == '__main__': unittest.main()
