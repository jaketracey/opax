#!/usr/bin/env python3
"""
Generate the portal's investigation reports from the knowledge box.

Each report is a set of questions asked of the corpus via /ask (grounded,
cited, synchronous); answers + sources are written as static JSON into
portal/public/reports/, which the Worker serves as assets. Re-run any time
the corpus grows, then `wrangler deploy` from portal/ to publish.

  python3 scripts/generate_reports.py                # all topics
  python3 scripts/generate_reports.py gambling housing  # subset

Uses ARAG_* from .env. Query-time cost only (generative model is pinned to
the cheapest tier on the KB) — this does NOT trigger enrichment.
"""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parli.arag import AragConfig, AragError, KbClient, load_dotenv  # noqa: E402

OUT_DIR = Path(__file__).resolve().parent.parent / "portal" / "public" / "reports"

REPORTS: dict[str, dict] = {
    "gambling": {
        "title": "Gambling",
        "blurb": "What parliament says about poker machines, online wagering and gambling reform.",
        "questions": [
            "What have MPs said about gambling reform and poker machine regulation?",
            "What arguments have been made against tighter gambling regulation, and by whom?",
            "What has been said about the influence of the gambling industry on politics?",
        ],
    },
    "climate": {
        "title": "Climate & Energy",
        "blurb": "The climate debate on the record: targets, coal, renewables and carbon pricing.",
        "questions": [
            "What positions have MPs taken on climate change action and emissions targets?",
            "What has been said in parliament about coal mining and the transition to renewable energy?",
            "How have MPs discussed carbon pricing and its repeal?",
        ],
    },
    "housing": {
        "title": "Housing",
        "blurb": "Decades of affordability promises, negative gearing fights and supply debates.",
        "questions": [
            "What have MPs said about housing affordability and home ownership?",
            "What positions have been taken on negative gearing and property tax concessions?",
            "What has parliament said about social and public housing supply?",
        ],
    },
    "indigenous": {
        "title": "First Nations",
        "blurb": "Reconciliation, the Voice, Closing the Gap and native title, in parliament's own words.",
        "questions": [
            "What have MPs said about reconciliation and recognition of First Nations peoples?",
            "What was said in parliament about the Voice to Parliament referendum?",
            "How has parliament discussed Closing the Gap outcomes?",
        ],
    },
    "immigration": {
        "title": "Immigration",
        "blurb": "Border policy, offshore detention and migration levels across the decades.",
        "questions": [
            "What positions have MPs taken on asylum seekers and offshore detention?",
            "What has been said about immigration levels and skilled migration?",
        ],
    },
    "media": {
        "title": "Media Ownership",
        "blurb": "Concentration, regulation and the platforms: parliament on the press.",
        "questions": [
            "What have MPs said about media ownership concentration in Australia?",
            "What was said about the news media bargaining code and tech platforms?",
        ],
    },
}


# ---------------------------------------------------------------------------
# Evidence-brief layer, ported from vccmhw-monorepo's evidenceBrief.ts
# grounding pattern: find() the corpus's real sources, hand the model that
# NUMBERED list, and require every structured item to carry a source_ref back
# to one of those sources. Anything untraceable is dropped, never rendered —
# fewer tiles beats an invented number.
# ---------------------------------------------------------------------------

# NB: a custom user prompt REPLACES the platform's template wholesale, so it
# must carry the {question} and {context} placeholders itself — without them
# the model receives instructions with no question and no sources.
BRIEF_PROMPT = (
    "You are preparing an evidence brief for a time-pressed reader — a journalist, "
    "researcher or voter — from the Australian parliamentary record. "
    "Write three to five tight paragraphs answering the question below from the provided "
    "context: the strongest, most decision-relevant findings first, then how the debate has "
    "shifted over time, the sharpest points of disagreement, and what was promised "
    "versus what was reported to have happened, as far as the context supports them. "
    "ALWAYS synthesise the best answer you can from the provided context — never respond "
    "that there is not enough data. Be precise with any figures the sources give and never "
    "invent numbers. Attribute claims to speakers or parties when the sources do. "
    "Plain Markdown paragraphs only — no headings and no bullet lists.\n\n"
    "CONTEXT FROM THE RECORD:\n{context}\n\n"
    "QUESTION: {question}\n\n"
    "THE BRIEF:"
)


def resource_summary(resource: dict) -> dict:
    meta = ((resource.get("extra") or {}).get("metadata")) or {}
    collabs = (resource.get("origin") or {}).get("collaborators") or []
    labels = {
        c.get("labelset"): c.get("label")
        for c in ((resource.get("usermetadata") or {}).get("classifications") or [])
    }
    snippet = ""
    for field in (resource.get("fields") or {}).values():
        for para in (field.get("paragraphs") or {}).values():
            text = (para.get("text") or "").replace("\n", " ")
            if len(text) > len(snippet):
                snippet = text
    return {
        "slug": resource.get("slug") or "",
        "title": resource.get("title"),
        "speaker": collabs[0] if collabs else None,
        "party": labels.get("party"),
        "state": labels.get("state"),
        "date": meta.get("date"),
        "snippet": snippet[:240],
    }


def numbered_sources(kb: KbClient, query: str, top_k: int = 24) -> tuple[dict, list[str]]:
    """find() real sources and number them for source-grounded generation."""
    res = kb.find(query, top_k=top_k, show=["basic", "origin", "extra"])
    srcs: dict[int, dict] = {}
    lines: list[str] = []
    n = 0
    for resource in ((res.get("resources") or {})).values():
        s = resource_summary(resource)
        if not s["slug"] or s["slug"].startswith("da-"):
            continue
        n += 1
        srcs[n] = s
        who = " · ".join(x for x in [s["speaker"], s["party"], (s["date"] or "")[:10]] if x)
        lines.append(f"[{n}] {s['title']}{f' ({who})' if who else ''} — {s['snippet']}")
    return srcs, lines


STATS_SCHEMA = {
    "name": "key_figures",
    "description": (
        "Key figures on the topic, taken ONLY from the provided numbered sources. "
        "Every figure must appear verbatim in a source — never estimate, invent, "
        "average or extrapolate. If the sources contain no genuine figures, return "
        "an empty list; fewer verifiable figures are always better than more."
    ),
    "parameters": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "stats": {
                "type": "array",
                "maxItems": 6,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "value": {"type": "string", "description": "The figure exactly as stated, short — e.g. '1 in 5', '34%', '$1.1 billion'. A bare year is not a figure."},
                        "label": {"type": "string", "description": "What it measures, ten words or fewer, sentence case."},
                        "detail": {"type": "string", "description": "One short sentence of context from the source (who said it, when, about what)."},
                        "source_ref": {"type": "integer", "description": "The [n] of the provided source the figure comes from."},
                    },
                    "required": ["value", "label", "detail", "source_ref"],
                },
            },
        },
        "required": ["stats"],
    },
}

POSITIONS_SCHEMA = {
    "name": "party_positions",
    "description": (
        "Where each party stands on the topic, drawn ONLY from the provided numbered "
        "sources — attribute a position to a party only when a source shows one of its "
        "parliamentarians taking it. Never infer or invent a position. Return an empty "
        "list rather than guess."
    ),
    "parameters": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "positions": {
                "type": "array",
                "maxItems": 6,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "party": {"type": "string", "description": "Party name as the source gives it (e.g. Labor, Liberal, Greens, Nationals, Independent)."},
                        "position": {"type": "string", "description": "One or two sentences stating the position taken in the source, in plain language."},
                        "source_ref": {"type": "integer", "description": "The [n] of the provided source that evidences the position."},
                    },
                    "required": ["party", "position", "source_ref"],
                },
            },
        },
        "required": ["positions"],
    },
}

_BARE_YEAR = __import__("re").compile(r"^\s*(19|20)\d{2}\s*$")


def openrouter_tool_call(schema: dict, prompt: str) -> dict:
    """Structured extraction DIRECTLY against OpenRouter (@preset/opax).

    ARAG's answer_json_schema uses forced tool_choice, which DeepSeek's
    thinking mode rejects ("Thinking mode does not support this tool_choice"),
    and ARAG's reasoning_effort plumbing did not clear it (412). Calling
    OpenRouter directly with reasoning_effort="none" is verified to work, and
    the grounding is unchanged: the numbered KB sources ride in the prompt and
    every item must trace back via source_ref or it is dropped.
    """
    import re as _re
    import urllib.request

    env = (Path(__file__).resolve().parent.parent / ".env").read_text()
    key = _re.search(r"^OPENROUTER_API_KEY=(.*)$", env, _re.M).group(1).strip()
    name = schema["name"]
    body = {
        "model": "@preset/opax",
        "max_tokens": 1600,
        "temperature": 0,
        "reasoning_effort": "none",
        "messages": [{"role": "user", "content": prompt}],
        "tools": [{"type": "function", "function": {
            "name": name, "description": schema["description"],
            "parameters": schema["parameters"],
        }}],
        "tool_choice": {"type": "function", "function": {"name": name}},
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)
    calls = (data.get("choices") or [{}])[0].get("message", {}).get("tool_calls") or []
    if not calls:
        return {}
    try:
        return json.loads(calls[0]["function"]["arguments"])
    except (KeyError, json.JSONDecodeError):
        return {}


def gen_key_stats(kb: KbClient, title: str, srcs: dict, lines: list[str]) -> list[dict]:
    if not lines:
        return []
    query = (
        f'Extract the key figures a reader needs on "{title}" in Australian politics. '
        "Below are real numbered sources from the parliamentary record. Report ONLY figures "
        "that appear in those sources, exactly as stated — never estimate or invent — and set "
        "source_ref to the number of the source each figure comes from. If the sources contain "
        "no genuine figures, return an empty list.\n\nSOURCES:\n" + "\n".join(lines)
    )
    stats = (openrouter_tool_call(STATS_SCHEMA, query)).get("stats") or []
    seen: set[str] = set()
    out = []
    for s in stats:
        ref = s.get("source_ref")
        value = (s.get("value") or "").strip()
        if ref not in srcs or not value:
            continue  # must trace to a real source
        if not any(ch.isdigit() for ch in value) or _BARE_YEAR.match(value):
            continue  # a "figure" without a number isn't one
        key = f"{value}|{s.get('label', '')}".lower()
        if key in seen:
            continue
        seen.add(key)
        src = srcs[ref]
        out.append({
            "value": value,
            "label": (s.get("label") or "").strip(),
            "detail": (s.get("detail") or "").strip(),
            "slug": src["slug"],
            "source_title": src["title"],
        })
    return out[:6]


def gen_positions(kb: KbClient, title: str, srcs: dict, lines: list[str]) -> list[dict]:
    if not lines:
        return []
    query = (
        f'Where does each party stand on "{title}"? Below are real numbered sources from the '
        "Australian parliamentary record, each tagged with its speaker and party. Report a "
        "position for a party ONLY when one of the sources shows a parliamentarian of that "
        "party taking it, and set source_ref to that source's number. One entry per party. "
        "Return an empty list rather than infer.\n\nSOURCES:\n" + "\n".join(lines)
    )
    positions = (openrouter_tool_call(POSITIONS_SCHEMA, query)).get("positions") or []
    seen_parties: set[str] = set()
    out = []
    for p in positions:
        ref = p.get("source_ref")
        party = (p.get("party") or "").strip()
        text = (p.get("position") or "").strip()
        if ref not in srcs or not party or not text:
            continue
        if party.lower() in seen_parties:
            continue
        seen_parties.add(party.lower())
        src = srcs[ref]
        out.append({
            "party": party,
            "position": text,
            "slug": src["slug"],
            "source_title": src["title"],
            "speaker": src["speaker"],
            "date": src["date"],
        })
    return out[:6]


def key_moments(kb: KbClient, title: str, limit: int = 6) -> list[dict]:
    """Retrieval-only: notable speeches to read, no generation involved."""
    res = kb.find(f"{title} landmark speech major reform announcement second reading", top_k=15, show=["basic", "origin", "extra"])
    seen_speakers: set[str] = set()
    out = []
    for resource in ((res.get("resources") or {})).values():
        s = resource_summary(resource)
        if not s["slug"] or s["slug"].startswith("da-"):
            continue
        speaker_key = (s["speaker"] or s["slug"]).lower()
        if speaker_key in seen_speakers:
            continue  # a reading list, not one member's greatest hits
        seen_speakers.add(speaker_key)
        s.pop("snippet", None)
        out.append(s)
        if len(out) >= limit:
            break
    return out


def build_section(kb: KbClient, question: str) -> dict:
    res = kb.ask(question, citations=True, top_k=20)
    sources = []
    for rid, resource in ((res.get("retrieval_results") or {}).get("resources") or {}).items():
        slug = resource.get("slug") or ""
        if slug.startswith("da-"):
            continue
        meta = ((resource.get("extra") or {}).get("metadata")) or {}
        collabs = (resource.get("origin") or {}).get("collaborators") or []
        labels = {
            c.get("labelset"): c.get("label")
            for c in ((resource.get("usermetadata") or {}).get("classifications") or [])
        }
        sources.append({
            "slug": slug,
            "title": resource.get("title"),
            "speaker": collabs[0] if collabs else None,
            "party": labels.get("party"),
            "state": labels.get("state"),
            "date": meta.get("date"),
        })
    return {
        "question": question,
        "answer": res.get("answer") or "",
        "sources": sources,
    }


def main() -> None:
    load_dotenv()
    stats_only = "--stats-only" in sys.argv
    picked = [a for a in sys.argv[1:] if not a.startswith("--")] or list(REPORTS)
    kb = KbClient(AragConfig.from_env())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    stats_path = Path(__file__).resolve().parent / "report_stats.json"
    all_stats = json.loads(stats_path.read_text()) if stats_path.exists() else {}

    counters = kb.counters()
    index = []
    idx_path = OUT_DIR / "index.json"
    if idx_path.exists():
        index = json.loads(idx_path.read_text()).get("reports", [])

    for slug in picked:
        cfg = REPORTS[slug]
        # Keep previously generated narrative when only refreshing stats.
        prior_path = OUT_DIR / f"{slug}.json"
        prior = json.loads(prior_path.read_text()) if prior_path.exists() else {}
        sections = prior.get("sections", [])
        brief = prior.get("brief")
        stats_from_record = prior.get("key_stats", [])
        positions = prior.get("positions", [])
        moments = prior.get("key_moments", [])
        if not stats_only:
            print(f"[{slug}] evidence brief + {len(cfg['questions'])} questions...")
            t0 = time.time()
            try:
                # The prose lead: cited ask with the evidence-brief prompt.
                # Some topics come back 200-but-empty under the custom prompt;
                # the platform's default template is the reliable fallback.
                brief_q = f"What does the parliamentary record show about {cfg['title'].lower()}?"
                res = kb.ask(brief_q, citations=True, prompt=BRIEF_PROMPT, top_k=20)
                answer = (res.get("answer") or "").strip()
                if not answer:
                    print("  brief empty under custom prompt - retrying with default template")
                    res = kb.ask(
                        f"{brief_q} Cover the strongest findings, how the debate has shifted "
                        "over time, and the sharpest points of disagreement.",
                        citations=True, top_k=20)
                    answer = (res.get("answer") or "").strip()
                brief = {"question": brief_q, "answer": answer}
                print(f"  brief {'ok' if answer else 'EMPTY'} ({time.time() - t0:.0f}s)")
            except AragError as e:
                print(f"  brief FAILED ({e.status})", file=sys.stderr)
            # Numbered real sources ground the structured extractions; every
            # emitted item must trace back to one of them or it is dropped.
            try:
                srcs, lines = numbered_sources(kb, cfg["blurb"] or cfg["title"])
                stats_from_record = gen_key_stats(kb, cfg["title"], srcs, lines)
                print(f"  key figures: {len(stats_from_record)} traced")
                positions = gen_positions(kb, cfg["title"], srcs, lines)
                print(f"  positions: {len(positions)} traced")
            except AragError as e:
                print(f"  structured extraction FAILED ({e.status})", file=sys.stderr)
            try:
                moments = key_moments(kb, cfg["title"])
                print(f"  key moments: {len(moments)}")
            except AragError as e:
                print(f"  key moments FAILED ({e.status})", file=sys.stderr)
            sections = []
            for q in cfg["questions"]:
                t0 = time.time()
                try:
                    sections.append(build_section(kb, q))
                    print(f"  ok ({time.time() - t0:.0f}s): {q[:60]}")
                except AragError as e:
                    print(f"  FAILED ({e.status}): {q[:60]}", file=sys.stderr)
        report = {
            "slug": slug,
            "title": cfg["title"],
            "blurb": cfg["blurb"],
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "corpus_resources": counters.get("resources"),
            "stats": all_stats.get(slug),
            "brief": brief,
            "key_stats": stats_from_record,
            "positions": positions,
            "key_moments": moments,
            "sections": sections,
        }
        prior_path.write_text(json.dumps(report, indent=1))
        index = [r for r in index if r["slug"] != slug] + [{
            "slug": slug, "title": cfg["title"], "blurb": cfg["blurb"],
            "updated": report["generated_at"],
        }]

    index.sort(key=lambda r: r["slug"])
    idx_path.write_text(json.dumps({"reports": index}, indent=1))
    print(f"Wrote {len(picked)} report(s) + index to {OUT_DIR}")
    print("Publish with: cd portal && npx wrangler deploy")


if __name__ == "__main__":
    main()
