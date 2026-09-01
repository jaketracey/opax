#!/usr/bin/env python3
"""
OPAX enrichment (ARAG Data-Augmentation) — topic labeler on OUR OpenRouter key.

Every LLM call this registers carries an explicit openai_compat key config
(OpenRouter URL + OPENROUTER_API_KEY from .env), so classification inference
bills to our OpenRouter account — NOT Progress's model pool. The model id is
deliberately the bare `deepseek/deepseek-v4-flash` (no provider pin): batch
classification tolerates quantised hosts, which are ~5-6x cheaper than the
first-party pin the user-facing /ask path uses.

  python3 scripts/arag_enrich.py plan            # show taxonomy + config (key redacted)
  python3 scripts/arag_enrich.py sample-summaries [N]   # summarise N sampled speeches
  python3 scripts/arag_enrich.py start-full-summaries   # WHOLE CORPUS - typed confirm
  python3 scripts/arag_enrich.py sample [N]      # label N sampled speeches (default 2000)
  python3 scripts/arag_enrich.py status          # configs/running/done
  python3 scripts/arag_enrich.py eval [M]        # inspect labels on M sampled docs
  python3 scripts/arag_enrich.py start-full      # WHOLE CORPUS — typed confirm, load must be done
  python3 scripts/arag_enrich.py stop <task-id>  # remove a task config

Field notes honoured: labelers run one at a time; parameters.llm.model is
always pinned (unpinned tasks 200 then fail silently).
"""

import json
import os
import random
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from parli.arag import AragConfig, KbClient, load_dotenv  # noqa: E402

# ---------------------------------------------------------------------------
# The taxonomy. Topics deliberately MIRROR the AEC donation-industry taxonomy
# (money.json clusters) so donation industries and speech topics join — the
# OPAX cross-reference — plus civic topics with no industry twin.
# ---------------------------------------------------------------------------

TOPICS: list[tuple[str, str, list[str]]] = [
    ("gambling", "Gambling, poker machines, casinos, wagering, betting advertising and gambling harm.",
     ["The proliferation of poker machines in clubs is devastating families in my electorate.",
      "The Interactive Gambling Bill imposes a moratorium on online casinos."]),
    ("financial-services", "Banks, insurance, superannuation, financial regulation and consumer credit.",
     ["Bank branch closures are abandoning rural communities.",
      "The superannuation guarantee must rise to secure retirement incomes."]),
    ("mining-energy", "Mining, coal, gas, oil, resources projects and energy markets.",
     ["This coal mine will bring thousands of jobs to the Hunter.",
      "Gas prices on the east coast are crushing manufacturers."]),
    ("climate-environment", "Climate change, emissions targets, renewables, conservation, water and environmental protection.",
     ["Australia must adopt a credible 2030 emissions target.",
      "The Murray-Darling plan is failing downstream communities."]),
    ("property-construction", "Property development, construction industry, planning and building regulation.",
     ["Developers are land-banking while approvals sit idle.",
      "Combustible cladding must be removed from residential towers."]),
    ("housing", "Housing affordability, home ownership, rents, social and public housing.",
     ["First home buyers are locked out by investor tax concessions.",
      "The public housing waiting list has doubled in a decade."]),
    ("health", "Hospitals, Medicare, aged care, mental health, pharmaceuticals and private health insurance.",
     ["Bulk billing rates are collapsing in the outer suburbs.",
      "The PBS listing of this medicine will save families thousands."]),
    ("media-communications", "Media ownership, broadcasting, journalism, telecommunications and digital platforms.",
     ["Cross-media ownership laws protect diversity of voices.",
      "The NBN rollout has left regional towns on failing copper."]),
    ("hospitality-alcohol", "Hotels, clubs, alcohol, liquor licensing and tourism.",
     ["Lockout laws have gutted the city's live music venues.",
      "Tourism operators need support after the downturn."]),
    ("defence-security", "Defence, national security, veterans, intelligence and policing.",
     ["The submarine contract must guarantee local build jobs.",
      "Veterans are waiting months for their claims to be processed."]),
    ("agriculture", "Farming, live exports, drought, biosecurity and regional industries.",
     ["Drought-affected farmers need freight subsidies now.",
      "Live export standards have failed and must be overhauled."]),
    ("unions-workplace", "Industrial relations, unions, wages, workplace safety and employment conditions.",
     ["Penalty rate cuts take money from the lowest-paid workers.",
      "This bill strips unions of their right to represent members."]),
    ("immigration", "Immigration, asylum seekers, detention, citizenship and multicultural affairs.",
     ["Children do not belong in immigration detention.",
      "Skilled migration settings are leaving regional employers short."]),
    ("indigenous-affairs", "First Nations peoples, reconciliation, native title, Closing the Gap and the Voice.",
     ["The gap in Indigenous life expectancy is a national shame.",
      "Native title rights must not be extinguished by this amendment."]),
    ("tax-budget", "Taxation, the budget, GST, deficits and fiscal policy.",
     ["The GST is a regressive tax on the families least able to pay.",
      "These tax cuts flow overwhelmingly to the highest earners."]),
    ("education", "Schools, universities, TAFE, childcare and research funding.",
     ["School funding must follow need, not privilege.",
      "University fee increases will price students out of degrees."]),
    ("welfare-social", "Social security, pensions, disability support, NDIS and community services.",
     ["Raising the rate of JobSeeker is an economic necessity.",
      "NDIS participants face constant reassessment anxiety."]),
    ("integrity-democracy", "Political integrity, corruption, donations, lobbying, elections and accountability.",
     ["A federal integrity commission with teeth is overdue.",
      "Donation disclosure thresholds hide the money that matters."]),
    ("infrastructure-transport", "Roads, rail, ports, public transport and infrastructure investment.",
     ["The rail link has been promised at five successive elections.",
      "Freight bottlenecks at the port are costing exporters."]),
    ("justice-law", "Courts, criminal law, civil liberties, consumer law and legal system.",
     ["Mandatory sentencing removes judicial discretion.",
      "Whistleblower protections in this bill are hollow."]),
    ("foreign-affairs", "Foreign policy, trade agreements, aid, defence alliances and international relations.",
     ["The free trade agreement trades away local jobs.",
      "Our aid budget is at its lowest share on record."]),
]

TASK_SAMPLE = "opax-topics-sample"
TASK_FULL = "opax-topics"
SUMMARY_SAMPLE = "opax-summaries-sample"
SUMMARY_FULL = "opax-summaries"

SUMMARY_PROMPT = (
    "You are summarising one Australian parliamentary speech for a public "
    "accountability site. In one or two plain sentences, state what the speaker "
    "argued or announced and any concrete positions, figures or names — neutral "
    "register, no opinions, no 'the speaker says' framing, no preamble. "
    "Text of the speech:\n{context}"
)


def build_summary_parameters(name: str, rids: list[str] | None) -> dict:
    """An `ask` DA task generating a per-speech summary field, billed to OUR
    OpenRouter key exactly like the labeler."""
    params: dict = {
        "name": name,
        "on": 1,
        "operations": [{
            "ask": {
                "question": "",
                "destination": "summary",
                "user_prompt": SUMMARY_PROMPT,
            },
        }],
        "llm": build_parameters(name, None)["llm"],
    }
    if rids:
        params["filter"] = {"rids": rids}
    return params


def openrouter_key() -> str:
    env = {}
    envfile = ROOT / ".env"
    for line in envfile.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"')
    key = env.get("OPENROUTER_API_KEY", "")
    if not key:
        sys.exit("OPENROUTER_API_KEY missing from .env — enrichment must bill to our key, refusing to run.")
    return key


def build_parameters(name: str, rids: list[str] | None) -> dict:
    """The labeler task config. The llm block carries OUR OpenRouter key
    explicitly, so inference never falls back to platform compute."""
    params: dict = {
        "name": name,
        "on": 1,  # whole fields — speeches are short single-field resources
        "operations": [{
            "label": {
                "ident": "topic",
                "description": (
                    "Classify this Australian parliamentary speech into the policy topics it "
                    "substantively discusses. Choose every topic that is a real subject of the "
                    "speech, not merely mentioned in passing. Procedural business with no policy "
                    "content gets no label."
                ),
                "multiple": True,
                "labels": [
                    {"label": label, "description": desc, "examples": examples}
                    for label, desc, examples in TOPICS
                ],
            },
        }],
        "llm": {
            "model": "openai-compatible",
            "provider": "openai_compat",
            "keys": {
                "openai_compat": {
                    "key": openrouter_key(),
                    "url": "https://openrouter.ai/api/v1",
                    # Bare slug on purpose: batch classification is fine on the
                    # cheap quantised hosts; /ask keeps the first-party preset.
                    "model_id": "deepseek/deepseek-v4-flash",
                },
            },
        },
    }
    if rids:
        params["filter"] = {"rids": rids}
    return params


def redacted(params: dict) -> dict:
    p = json.loads(json.dumps(params))
    if p.get("llm", {}).get("keys", {}).get("openai_compat", {}).get("key"):
        p["llm"]["keys"]["openai_compat"]["key"] = "<OPENROUTER_API_KEY from .env>"
    return p


def sample_rids(cfg: AragConfig, n: int) -> list[str]:
    """Random-ish sample of speech resource ids via the catalog (paginated)."""
    rids: list[str] = []
    page = 0
    while len(rids) < n * 3 and page < 200:  # oversample then shuffle
        raw = _catalog_page(cfg, page)
        got = [rid for rid, r in raw.items() if (r.get("slug") or "").startswith("speech-")]
        if not got and page > 0:
            break
        rids.extend(got)
        page += 1
    random.shuffle(rids)
    return rids[:n]


def _catalog_page(cfg: AragConfig, page: int) -> dict:
    url = (f"https://{cfg.zone}.rag.progress.cloud/api/v1/kb/{cfg.kb_id}"
           f"/catalog?page_number={page}&page_size=100")
    req = urllib.request.Request(url, headers={
        "x-nuclia-serviceaccount": f"Bearer {cfg.kb_token}",
        "user-agent": "opax-enrich/1.0",
    })
    with urllib.request.urlopen(req, timeout=60) as res:
        return (json.load(res).get("resources")) or {}


def load_still_running() -> bool:
    import subprocess
    r = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "desktop",
         'kill -0 "$(cat /tmp/arag_sync.pid 2>/dev/null)" 2>/dev/null && echo RUNNING || echo STOPPED'],
        capture_output=True, text=True, timeout=30)
    return "RUNNING" in r.stdout


def main() -> None:
    load_dotenv()
    cfg = AragConfig.from_env()
    kb = KbClient(cfg)
    cmd = sys.argv[1] if len(sys.argv) > 1 else "plan"

    if cmd == "plan":
        print(f"{len(TOPICS)} topics; labelset ident 'topic'; multi-label; whole-field.")
        print(json.dumps(redacted(build_parameters(TASK_FULL, None)), indent=1)[:3000])

    elif cmd == "sample":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 2000
        existing = kb.list_tasks()
        if any(c.get("parameters", {}).get("name", "").startswith("opax-topics")
               for c in (existing.get("configs") or []) + (existing.get("running") or [])):
            sys.exit("A topics task config already exists — labelers run one at a time. See `status`.")
        rids = sample_rids(cfg, n)
        (ROOT / "scripts" / "harness_runs").mkdir(exist_ok=True)
        (ROOT / "scripts" / "harness_runs" / "enrich_sample_rids.json").write_text(json.dumps(rids))
        print(f"sampled {len(rids)} speech rids (persisted for eval)")
        params = build_parameters(TASK_SAMPLE, rids)
        out = kb.start_task("labeler", params, apply="EXISTING")
        print("started:", json.dumps(out)[:400])

    elif cmd == "sample-summaries":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 500
        saved = ROOT / "scripts" / "harness_runs" / "enrich_sample_rids.json"
        rids = (json.loads(saved.read_text())[:n] if saved.exists() else sample_rids(cfg, n))
        print(f"summarising {len(rids)} sampled speeches")
        out = kb.start_task("ask", build_summary_parameters(SUMMARY_SAMPLE, rids), apply="EXISTING")
        print("started:", json.dumps(out)[:300])

    elif cmd == "start-full-summaries":
        if not os.environ.get("OPAX_ENRICH_NOW") and load_still_running():
            sys.exit("Bulk load is still RUNNING - full summaries wait for load completion.")
        print("This summarises the WHOLE speech corpus (~519K docs) on the OpenRouter key (~$45).")
        typed = input("Type 'summarise the corpus' to confirm: ").strip()
        if typed != "summarise the corpus":
            sys.exit("Aborted.")
        out = kb.start_task("ask", build_summary_parameters(SUMMARY_FULL, None), apply="ALL")
        print("started:", json.dumps(out)[:300])

    elif cmd == "status":
        t = kb.list_tasks()
        for group in ("configs", "running", "done"):
            items = t.get(group) or []
            print(f"{group}: {len(items)}")
            for item in items:
                pid = item.get("id") or (item.get("task") or {}).get("id")
                nm = (item.get("parameters") or {}).get("name")
                comp = item.get("completion") or item.get("status") or ""
                print(f"  - id={pid} name={nm} {json.dumps(comp)[:200]}")

    elif cmd == "eval":
        # Per-label facet probes: /find with the generated labelset filter —
        # this is also the proof the labels work as search facets.
        import urllib.parse
        probe_labels = ["gambling", "tax-budget", "health", "indigenous-affairs",
                        "immigration", "financial-services", "integrity-democracy"]
        print("label facet probes (top matches per label):")
        for lab in probe_labels:
            body = json.dumps({
                "query": "the", "top_k": 3, "features": ["keyword"],
                "show": ["basic"],
                "filter_expression": {"field": {"prop": "label", "labelset": "topic", "label": lab}},
            }).encode()
            req = urllib.request.Request(
                f"https://{cfg.zone}.rag.progress.cloud/api/v1/kb/{cfg.kb_id}/find",
                data=body, method="POST",
                headers={"x-nuclia-serviceaccount": f"Bearer {cfg.kb_token}",
                         "content-type": "application/json", "user-agent": "opax-enrich/1.0"})
            try:
                with urllib.request.urlopen(req, timeout=60) as res:
                    found = json.load(res)
                titles = [r.get("title", "?") for r in (found.get("resources") or {}).values()]
                print(f"  {lab:22} {len(titles)} shown: {'; '.join(t[:45] for t in titles)}")
            except Exception as e:
                print(f"  {lab:22} probe error: {e}")
        print()
        m = int(sys.argv[2]) if len(sys.argv) > 2 else 12
        saved = ROOT / "scripts" / "harness_runs" / "enrich_sample_rids.json"
        rids = json.loads(saved.read_text()) if saved.exists() else sample_rids(cfg, 400)
        random.shuffle(rids)
        shown = 0
        for rid in rids:
            if shown >= m:
                break
            url = (f"https://{cfg.zone}.rag.progress.cloud/api/v1/kb/{cfg.kb_id}"
                   f"/resource/{rid}?show=basic")
            req = urllib.request.Request(url, headers={
                "x-nuclia-serviceaccount": f"Bearer {cfg.kb_token}",
                "user-agent": "opax-enrich/1.0"})
            try:
                with urllib.request.urlopen(req, timeout=30) as res:
                    r = json.load(res)
            except Exception:
                continue
            classifications = []
            for block in ("usermetadata", "computedmetadata"):
                meta = r.get(block) or {}
                for c in meta.get("classifications") or []:
                    if c.get("labelset") == "topic":
                        classifications.append(c.get("label"))
            fieldmeta = r.get("fieldmetadata") or []
            if classifications:
                shown += 1
                print(f"{r.get('title','?')[:70]}  ->  {classifications}")
        if not shown:
            print("No topic labels found on sampled docs yet — task may still be running "
                  "(see `status`), or labels may live under a different metadata block; "
                  "inspect one labeled resource raw if status says done.")

    elif cmd == "start-full":
        if not os.environ.get("OPAX_ENRICH_NOW") and load_still_running():
            sys.exit("Bulk load is still RUNNING on desktop — full enrichment waits for load "
                     "completion so every speech gets labeled exactly once.")
        print(f"This labels the WHOLE speech corpus (~519K docs) on the OpenRouter key.")
        typed = input("Type 'label the corpus' to confirm: ").strip()
        if typed != "label the corpus":
            sys.exit("Aborted.")
        out = kb.start_task("labeler", build_parameters(TASK_FULL, None), apply="ALL")
        print("started:", json.dumps(out)[:400])

    elif cmd == "stop":
        kb.delete_task(sys.argv[2])
        print("removed", sys.argv[2])

    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
