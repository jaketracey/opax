#!/usr/bin/env python3
"""Finish the enrichment passes in rid-scoped batches (docs: MIGRATION-ARAG.md "Enrichment").

Why batches: the whole-corpus labeler task of 2026-09-02 (2ff07426) read one 1.2 GB partition and
died in the platform worker ("cannot access local variable 'object'"), leaving 297,771 of 595,763
speeches labelled. The 2,000-speech sample ran clean, so the pass is redone as a sequence of
labeler tasks each filtered to a list of rids, one at a time (labelers cannot overlap), with a
checkpoint after every batch. Summaries (ask task, text field da-summary-t-body) follow the same
pattern over every speech the sample did not already cover.

Usage (from the bundle root, .env beside it):
  python3 scripts/arag_enrich_resume.py plan-labels        # enumerate unlabelled speech rids
  python3 scripts/arag_enrich_resume.py resume-labels      # run the label batches
  python3 scripts/arag_enrich_resume.py plan-summaries
  python3 scripts/arag_enrich_resume.py resume-summaries
  python3 scripts/arag_enrich_resume.py run-all            # all four, in order
  python3 scripts/arag_enrich_resume.py status
State: state/ next to this file (rid lists, checkpoint.json). Idempotent: a re-run picks up at the
next unfinished batch. Cost lands on the OpenRouter key in .env (BYOK), never platform compute.
"""
import json, os, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "scripts"))
from parli.arag import AragConfig, KbClient, load_dotenv, _request   # noqa: E402
from arag_enrich import build_parameters, build_summary_parameters   # noqa: E402

STATE = Path(__file__).resolve().parent / "state"; STATE.mkdir(exist_ok=True)
CKPT = STATE / "checkpoint.json"
BATCH = int(os.environ.get("ENRICH_BATCH", "25000"))
POLL = int(os.environ.get("ENRICH_POLL", "120"))
SPEECH = {"prop": "label", "labelset": "kind", "label": "speech"}

def log(*a):
    print(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), *a, flush=True)

def ckpt():
    return json.loads(CKPT.read_text()) if CKPT.exists() else {"labels": {"done": 0, "tasks": []}, "summaries": {"done": 0, "tasks": []}}

def save(c):
    CKPT.write_text(json.dumps(c, indent=1))

def catalog_rids(kb, fe, out: Path, sort_asc=True) -> list[str]:
    """Enumerate every resource matching `fe`, windowed on the platform `created` timestamp.

    Offset paging over the whole set degrades fast (page 300 of the NOT-labelled set took 40 s),
    while a 5-minute created window holds ~1,000 rows and pages in about a second. The corpus
    was indexed 2026-09-01 03:45Z .. 2026-09-03 19:18Z; walk that span in windows, page each
    window shallowly, checkpoint the window cursor so a re-run resumes."""
    from datetime import datetime, timedelta, timezone
    prog = out.with_suffix(".progress.json")
    state = json.loads(prog.read_text()) if prog.exists() else {"cursor": "2026-09-01T03:40:00Z", "rids": []}
    if state.get("complete"):
        return state["rids"]
    rids = state["rids"]
    cur = datetime.fromisoformat(state["cursor"].replace("Z", "+00:00"))
    end = datetime.now(timezone.utc) + timedelta(hours=1)
    step = timedelta(minutes=5)
    windows = 0
    while cur < end:
        nxt = cur + step
        win = {"prop": "created", "since": cur.strftime("%Y-%m-%dT%H:%M:%SZ"), "until": nxt.strftime("%Y-%m-%dT%H:%M:%SZ")}
        wfe = {"resource": {"and": [*(fe["resource"]["and"] if "and" in fe["resource"] else [fe["resource"]]), win]}}
        page = 0
        while True:
            body = {"filter_expression": wfe, "page_size": 200, "page_number": page, "sort": {"field": "created", "order": "asc"}}
            for attempt in range(5):
                try:
                    r = _request("POST", kb._rag("/catalog"), kb._headers, body); break
                except Exception as e:
                    log(f"  window {win['since']} page {page} attempt {attempt+1} failed: {str(e)[:160]}"); time.sleep(10 * (attempt + 1))
            else:
                raise SystemExit("catalog paging keeps failing")
            res = r.get("resources") or {}
            rids.extend(res.keys())
            if not (r.get("fulltext") or {}).get("next_page") or not res:
                break
            page += 1
        cur = nxt; windows += 1
        if windows % 24 == 0:   # every two hours of corpus time
            state.update(cursor=cur.strftime("%Y-%m-%dT%H:%M:%SZ"), rids=rids); prog.write_text(json.dumps(state))
            log(f"  {win['until']}: {len(rids):,} rids so far")
    state.update(cursor=cur.strftime("%Y-%m-%dT%H:%M:%SZ"), rids=rids, complete=True); prog.write_text(json.dumps(state))
    out.write_text(json.dumps(rids))
    return rids

def plan_labels(kb):
    fe = {"resource": {"and": [SPEECH, {"not": {"prop": "label", "labelset": "topic"}}]}}
    t0 = time.time()
    rids = catalog_rids(kb, fe, STATE / "unlabelled_rids.json")
    log(f"[plan-labels] {len(rids):,} unlabelled speeches ({time.time()-t0:.0f}s); "
        f"~{len(rids)/BATCH:.0f} batches of {BATCH:,}; est. cost ~${len(rids)*0.00016:.0f} at the 2026-09-01 sample rate")
    return rids

def plan_summaries(kb):
    rids = catalog_rids(kb, {"resource": SPEECH}, STATE / "speech_rids.json")
    sample = ROOT / "scripts" / "harness_runs" / "enrich_sample_rids.json"
    done = set(json.loads(sample.read_text())) if sample.exists() else set()
    todo = [r for r in rids if r not in done]
    (STATE / "unsummarised_rids.json").write_text(json.dumps(todo))
    log(f"[plan-summaries] {len(rids):,} speeches, {len(done)} already summarised by the sample, "
        f"{len(todo):,} to do; est. cost ~${len(todo)*0.000087:.0f}")
    return todo

def stale_configs(kb, prefix):
    t = kb.list_tasks()
    return [(c.get("id") or (c.get("task") or {}).get("id"), (c.get("parameters") or {}).get("name"))
            for c in (t.get("configs") or []) if str((c.get("parameters") or {}).get("name", "")).startswith(prefix)]

def wait_task(kb, task_id, name):
    """Poll until the task shows in done (completed or failed) — or until it vanishes."""
    t0 = time.time()
    while True:
        t = kb.list_tasks()
        for item in (t.get("done") or []):
            if item.get("id") == task_id or (item.get("parameters") or {}).get("name") == name:
                if item.get("failed"):
                    log(f"  task {name} FAILED after {(time.time()-t0)/60:.0f} min; log tail: "
                        f"{(item.get('log') or '')[-300:]!r}")
                    return False
                if item.get("completed"):
                    log(f"  task {name} completed in {(time.time()-t0)/60:.0f} min"); return True
        running = [i for i in (t.get("running") or []) if i.get("id") == task_id or (i.get("parameters") or {}).get("name") == name]
        if not running and time.time() - t0 > 600:
            # Not running and not done: the platform may list it only under configs. Inspect directly.
            try:
                r = _request("GET", kb._dp(f"/task/{task_id}/inspect"), kb._headers).get("request", {})
                if r.get("failed"): log(f"  task {name} FAILED (inspect): {(r.get('log') or '')[-300:]!r}"); return False
                if r.get("completed"): log(f"  task {name} completed (inspect)"); return True
            except Exception as e:
                log(f"  inspect failed: {str(e)[:120]}")
        time.sleep(POLL)

def run_batches(kb, stage, rids, task_kind, name_prefix, build):
    c = ckpt(); done = c[stage]["done"]
    batches = [rids[i:i + BATCH] for i in range(0, len(rids), BATCH)]
    log(f"[{stage}] {len(batches)} batches, resuming at {done}")
    for i in range(done, len(batches)):
        for tid, nm in stale_configs(kb, name_prefix):
            log(f"  removing stale config {nm} ({tid})"); kb.delete_task(tid)
        name = f"{name_prefix}-b{i:03d}"
        out = kb.start_task(task_kind, build(name, batches[i]), apply="EXISTING")
        tid = out.get("id") or (out.get("task") or {}).get("id") or ""
        log(f"  started {name}: {len(batches[i]):,} rids, task {tid or out}")
        c = ckpt(); c[stage]["tasks"].append({"batch": i, "name": name, "id": tid, "started": time.time()}); save(c)
        ok = wait_task(kb, tid, name)
        if not ok:
            log(f"[{stage}] stopping at batch {i}; fix and re-run to resume"); return False
        c = ckpt(); c[stage]["done"] = i + 1; save(c)
        for tid2, nm in stale_configs(kb, name_prefix):
            kb.delete_task(tid2)
    log(f"[{stage}] all {len(batches)} batches complete"); return True

def main():
    os.chdir(ROOT); load_dotenv(); kb = KbClient(AragConfig.from_env())
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        print(json.dumps(ckpt(), indent=1)); t = kb.list_tasks()
        for g in ("configs", "running", "done"):
            print(g, [((i.get("parameters") or {}).get("name"), i.get("completed"), i.get("failed")) for i in (t.get(g) or [])][-6:])
        return
    if cmd in ("plan-labels", "run-all"):
        plan_labels(kb)
    if cmd in ("resume-labels", "run-all"):
        rids = json.loads((STATE / "unlabelled_rids.json").read_text())
        if not run_batches(kb, "labels", rids, "labeler", "opax-topics", build_parameters): return
    if cmd in ("plan-summaries", "run-all"):
        plan_summaries(kb)
    if cmd in ("resume-summaries", "run-all"):
        todo = json.loads((STATE / "unsummarised_rids.json").read_text())
        run_batches(kb, "summaries", todo, "ask", "opax-summaries", build_summary_parameters)

if __name__ == "__main__":
    main()
