#!/usr/bin/env python3
"""Source-only summaries for OPAX official report pages (pilot).

    python3 -I scripts/report_summaries/summarise.py run --slug <report slug> [--slug ...]
    python3 -I scripts/report_summaries/summarise.py check --slug <report slug>   (mechanical re-check, no writes)
    python3 -I scripts/report_summaries/summarise.py estimate [--pilot-dir data/report-summaries]

A summary is built only from the report's own text, read from the local text
cache the ingest already holds (never fetched here, never from opax.com.au).
The model sees the report's pages with PDF page markers and must return:

* `own_summary`: where the report's own executive summary or overview sits;
* `overview`: 3 to 6 plain-English sentences, each citing PDF pages and
  carrying an exact supporting excerpt from a cited page;
* `findings`: up to 5 of the body's own findings, opinions or conclusions,
  quoted verbatim with a page.

Every item is then checked mechanically against the source pages (`check`):
the excerpt must be on a cited page, names must appear on a cited page, a
sentence naming a person in adverse terms must rest on a stated finding or
opinion, a sentence must not turn allegation, evidence or submission text into
a finding, and house style rules apply. Anything that fails is dropped and
recorded under `dropped`; nothing the checker cannot verify is published.

The OpenRouter key is read from a .dev.vars file and is never printed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "portal" / "public"
OUT = ROOT / "data" / "report-summaries"
CACHE = Path("~/.cache/autoresearch").expanduser()
INTEGRITY_TEXT = CACHE / "integrity-commissions" / "text"
RC_TEXT = CACHE / "royal-commissions" / "text"
AGENCY_TEXT = CACHE / "agency-reports" / "text"

MODEL = os.environ.get("OPAX_SUMMARY_MODEL", "anthropic/claude-haiku-5.5")
VERIFY_MODEL = os.environ.get("OPAX_SUMMARY_VERIFY_MODEL", "google/gemini-3.5-flash-lite")
PROMPT_VERSION = "report-summaries-pilot-20261112"
LABEL = "Generated summary: written by a model from the report text and checked against the cited pages."
FINDINGS_LABEL = "In the body's own words"
MAX_ROUNDS = 3
BUDGET_CHARS = 200_000  # about 85k input tokens per call, below the long-context price tier
HEAD = re.compile(
    r"^\W*(executive summary|summary of (?:findings|conclusions|recommendations)|summary|overview|"
    r"key (?:findings|messages|themes)|findings|conclusions?|foreword|commissioner'?s? (?:overview|foreword|introduction)|"
    r"chair'?s? (?:foreword|message|report)|year in review|the year at a glance|at a glance|introduction)\b",
    re.I | re.M)

ORG_WORDS = {
    "commission", "commissioner", "department", "office", "act", "royal", "australia", "australian", "government",
    "council", "police", "service", "services", "authority", "scheme", "parliament", "committee", "court",
    "tribunal", "ombudsman", "agency", "board", "inquiry", "report", "minister", "ministerial", "premier",
    "state", "commonwealth", "territory", "victoria", "victorian", "queensland", "new", "south", "wales",
    "western", "northern", "tasmania", "tasmanian", "capital", "health", "centre", "university", "group",
    "limited", "ltd", "pty", "corporation", "operation", "investigation", "independent", "integrity",
    "corruption", "national", "anti", "crime", "legislative", "assembly", "house", "senate", "labor",
    "liberal", "party", "branch", "electorate", "chapter", "volume", "part", "appendix", "recommendation",
    "recommendations", "finding", "findings", "the", "and", "of", "for", "in", "on", "fund", "program",
    "unit", "division", "bureau", "institute", "network", "hospital", "school", "city", "shire", "water",
    "crown", "casino", "resorts", "melbourne", "sydney", "perth", "brisbane", "adelaide", "hobart", "darwin",
    "canberra", "public", "sector", "law", "enforcement", "conduct", "standards", "code", "statement", "values",
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
    "november", "december", "robodebt", "centrelink", "dss", "ato", "tax", "home", "affairs", "executive",
    "senior", "anti-corruption", "staff", "member", "members", "officer", "officers", "director", "general",
    "secretary", "chief", "deputy", "assistant", "attorney", "attorney-general", "treasury", "finance", "defence",
    "social", "community", "family", "families", "child", "children", "mental", "disability", "veterans",
    "forensic", "dna", "laboratory", "science", "sciences", "union", "commonwealth's", "nation", "first", "nations",
    "aboriginal", "torres", "strait", "islander", "safety", "emergency", "fire", "rescue", "ambulance", "transport",
    "roads", "planning", "environment", "education", "justice", "corrections", "prison", "prisons", "budget",
}
TITLED = re.compile(r"\b(?:Mr|Ms|Mrs|Miss|Dr|Professor|Prof|Councillor|Cr|Sir|Dame|Justice|Judge|Senator|Detective|"
                    r"Sergeant|Constable|Inspector|Superintendent|Commander)\.?\s+[A-Z][a-zA-Z'\u2019-]+(?:\s+[A-Z][a-zA-Z'\u2019-]+)?")
ADVERSE = re.compile(r"\b(corrupt\w*|misconduct|dishonest\w*|breach\w*|fraud\w*|improper\w*|lied|false\w*|"
                     r"unlawful\w*|deceiv\w*|mislead\w*|misus\w*|engaged in|failed to|knowingly)\b", re.I)
FINDING_WORDS = re.compile(r"\b(f[io]und\w*|finds?|findings?|opinion|satisfied|conclu\w+|determined|is of the view|"
                           r"was of the view|formed the view|affirmative finding)\b", re.I)
ALLEGATION_SRC = re.compile(r"\b(alleg\w*|submi\w*|submission\w*|evidence|told|claimed|counsel assisting|"
                            r"witness\w*|testif\w*|complain\w*)\b", re.I)
ALLEGATION_SENT = re.compile(r"\b(alleg\w*|submi\w*|evidence|examin\w*|investigat\w*|consider\w*|inquir\w*|"
                             r"told|said|heard|complain\w*|claim\w*|report\w*)\b", re.I)
BANNED = ["controversial", "unfortunately", "fortunately", "sadly", "radical", "extreme ", "common sense",
          "sensible", "landmark", "draconian", "so-called", "finally", "long overdue", "damning", "scathing",
          "shocking", "disgraceful", "explosive", "bombshell", "in short", "this summary",
          "supplied pages", "pages supplied", "the supplied", "the pages provided", "provided pages"]
FIRST_PERSON = re.compile(r"\b(I|[Ww]e|[Oo]ur|[Uu]s|[Mm]y)\b")
DASH = re.compile(r"—|\s–\s|\s--\s")
SHINGLE = 15
QUOTED = re.compile(r'["\u201c]([^"\u201d]{3,400})["\u201d]')


# ---------------------------------------------------------------------------
# text helpers

def norm(text: str) -> str:
    t = unicodedata.normalize("NFKC", text or "")
    t = t.replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"')
    t = t.replace("­", "")
    t = re.sub(r"[‐-―−]", "-", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip().casefold()


def dehyphen(text: str) -> str:
    return re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", text or "")


def norm_variants(text: str) -> tuple[str, str]:
    return norm(text), norm(dehyphen(text))


def contains(page_text: str, quote: str) -> bool:
    q = norm(quote).strip(" .\"'")
    if len(q) < 12:
        return False
    a, b = norm_variants(page_text)
    if q in a or q in b:
        return True
    # tolerate the PDF's line-break artefacts: compare with all non-word characters squashed
    squash = lambda s: re.sub(r"[^\w]+", "", s)
    return squash(q) in squash(a) or squash(q) in squash(b)


def locate(quote: str, pages: list[str], allowed: list[int]) -> list[int]:
    """Supplied pages (1-based) whose text, alone or joined to the next page, holds the quote."""
    hits = [n for n in allowed if contains(pages[n - 1], quote)]
    if hits:
        return hits
    # a quote that runs over a page break is cited to the page it starts on
    return [n for n in allowed if n < len(pages)
            and contains(pages[n - 1] + "\n" + pages[n], quote)]


def words(s: str) -> list[str]:
    return re.findall(r"[\w'-]+", norm(s))


def shingles(tokens: list[str], n: int | None = None) -> set[tuple[str, ...]]:
    n = n or SHINGLE
    return {tuple(tokens[i:i + n]) for i in range(len(tokens) - n + 1)}


def slug_part(value: str) -> str:
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", str(value).lower()))


NAME_SEQ = re.compile(r"\b([A-Z][a-zA-Z'’-]+(?:\s+(?:[A-Z]\.\s*)?[A-Z][a-zA-Z'’-]+)+)\b")


def name_like(sentence: str) -> list[str]:
    """Capitalised multi-word sequences that are not obviously organisations or titles."""
    out = []
    for m in NAME_SEQ.finditer(sentence):
        seq = m.group(1)
        toks = [t.strip("'’").lower() for t in seq.split()]
        if any(t in ORG_WORDS for t in toks):
            continue
        out.append(seq)
    return out


# ---------------------------------------------------------------------------
# sources

def load_pages(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    pages = data.get("pages") if isinstance(data, dict) else data
    return [p if isinstance(p, str) else (p or {}).get("text", "") for p in pages]


def candidates() -> list[dict]:
    """Every report record that has its source text in the local cache, with what OPAX already shows."""
    rows: list[dict] = []
    for f in sorted((PUBLIC / "royal-commissions").glob("commission-*.json")):
        c = json.loads(f.read_text())["commission"]
        reps = [r for r in c.get("reports") or [] if any((RC_TEXT / f"{x.get('sha256')}.json").exists()
                                                          for x in r.get("files") or [] if x.get("sha256"))]
        if not reps:
            rows.append({"slug": f"royal-commission-{slug_part(c['id'])}", "type": "royal_commission",
                         "subtype": c.get("inquiry_type"), "title": c["name"], "text": None,
                         "own_summary_on_page": False, "reason": "no report text held"})
            continue
        order = {"final_report": 0, "interim_report": 1, "progress_report": 2}
        rep = sorted(reps, key=lambda r: (order.get(r["kind"], 9), -(int((r.get("date") or "0")[:4] or 0))))[0]
        fil = next(x for x in rep["files"] if x.get("sha256") and (RC_TEXT / f"{x['sha256']}.json").exists())
        rows.append({"slug": f"royal-commission-{slug_part(c['id'])}", "type": "royal_commission",
                     "subtype": c.get("inquiry_type"), "title": c["name"], "document": rep["title"],
                     "url": fil["url"], "sha256": fil["sha256"], "text": str(RC_TEXT / f"{fil['sha256']}.json"),
                     "rights": rep.get("rights"), "own_summary_on_page": False,
                     "body": c["name"], "jurisdiction": c.get("jurisdiction")})
    for f in sorted((PUBLIC / "integrity-reports").glob("reports-*.json")):
        d = json.loads(f.read_text())
        for r in d["records"]:
            doc = next((x for x in r.get("documents") or [] if x.get("sha256")
                        and (INTEGRITY_TEXT / f"{x['sha256']}.json").exists()), None)
            own = len(r.get("summary") or "") > 200 or bool(r.get("findings"))
            rows.append({"slug": f"integrity-report-{slug_part(r['id'])}", "type": "integrity_report",
                         "subtype": r["report_type"], "title": r["title"], "document": (doc or {}).get("title"),
                         "url": (doc or {}).get("url") or r.get("pdf_url"), "sha256": (doc or {}).get("sha256"),
                         "text": str(INTEGRITY_TEXT / f"{doc['sha256']}.json") if doc else None,
                         "rights": (d.get("licence") or {}).get("status"), "own_summary_on_page": own,
                         "body": d.get("name"), "body_short": d.get("short"), "jurisdiction": r.get("jurisdiction"),
                         "opax_summary": r.get("summary"), "opax_findings": len(r.get("findings") or []),
                         "reason": None if doc else "no report text held"})
    g = json.loads((PUBLIC / "agency-reports" / "index.json").read_text())
    for d in g["documents"]:
        p = AGENCY_TEXT / f"{d.get('sha256')}.json"
        rows.append({"slug": f"agency-report-{slug_part(d['id'])}", "type": "agency_report", "subtype": d.get("kind"),
                     "title": f"{d['agency']} {d.get('reporting_year')} {d.get('kind')}", "document": d.get("kind"),
                     "url": d.get("source_url"), "sha256": d.get("sha256"), "text": str(p) if p.exists() else None,
                     "rights": None, "own_summary_on_page": False, "body": d["agency"],
                     "jurisdiction": d.get("jurisdiction")})
    return rows


def find(slug: str) -> dict:
    for r in candidates():
        if r["slug"] == slug:
            return r
    raise SystemExit(f"unknown report slug: {slug}")


def select_pages(pages: list[str], budget: int = BUDGET_CHARS) -> list[int]:
    """1-based PDF page numbers to send: everything if it fits, else front matter plus summary-style sections."""
    live = [i + 1 for i, p in enumerate(pages) if p.strip()]
    if sum(len(pages[i - 1]) for i in live) <= budget:
        return live
    picked: list[int] = []
    seen: set[int] = set()
    used = 0

    def take(n: int) -> bool:
        nonlocal used
        if n in seen or n < 1 or n > len(pages) or not pages[n - 1].strip():
            return True
        if used + len(pages[n - 1]) > budget:
            return False
        seen.add(n)
        picked.append(n)
        used += len(pages[n - 1])
        return True

    for n in range(1, 31):
        take(n)
    heads = [i + 1 for i, p in enumerate(pages) if HEAD.search(p[:400])]
    for h in heads:
        for n in range(h, h + 12):
            if not take(n):
                break
    for n in range(31, len(pages) + 1):  # fill the rest of the budget in order
        if not take(n):
            break
    return sorted(picked)


# ---------------------------------------------------------------------------
# model call

SCHEMA = {
    "name": "report_summary",
    "description": "A source-only, neutral summary of one official report, with page citations.",
    "parameters": {
        "type": "object",
        "properties": {
            "own_summary": {
                "type": "object",
                "properties": {
                    "present": {"type": "boolean"},
                    "heading": {"type": "string", "description": "the heading exactly as printed"},
                    "first_page": {"type": "integer"},
                    "last_page": {"type": "integer"},
                },
                "required": ["present"],
            },
            "overview": {
                "type": "array", "minItems": 3, "maxItems": 6,
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string"},
                        "pages": {"type": "array", "items": {"type": "integer"}, "minItems": 1, "maxItems": 3},
                        "support": {"type": "string"},
                        "people": {"type": "array", "items": {"type": "string"},
                                   "description": "every individual person named in this sentence, as written; empty if none"},
                    },
                    "required": ["text", "pages", "support", "people"],
                },
            },
            "findings": {
                "type": "array", "maxItems": 5,
                "items": {
                    "type": "object",
                    "properties": {
                        "quote": {"type": "string"},
                        "page": {"type": "integer"},
                        "kind": {"type": "string", "enum": ["finding", "opinion", "conclusion", "recommendation"]},
                    },
                    "required": ["quote", "page", "kind"],
                },
            },
        },
        "required": ["own_summary", "overview", "findings"],
    },
}

RULES = """You write a short, neutral, source-only summary of one Australian official report for OPAX, a
public-record site. Use ONLY the report pages supplied below. Each page starts with a marker
"=== PDF page N ===" and N is the page number you cite. Cite N from the marker, never the page number
printed inside the report text.

overview: 4 to 6 sentences of plain English (Australian spelling, no em dashes, no first person, no
judgement words such as damning, shocking, landmark or welcome). In order where the text allows: who
made the report and what it was asked to do; what it examined; what it concluded, found or
recommended (if it made recommendations, one sentence says how many and what they are about). Each
sentence cites 1 to 3 PDF page numbers and gives `support`: an excerpt of 8 to 30
words copied character for character from one of the cited pages that backs the sentence.
Paraphrase, except that when a sentence reports a finding, opinion, conclusion or recommendation you
should give the body's own words inside double quotation marks, copied exactly from a cited page (at
most 30 words in quotation marks per sentence). Outside quotation marks, never copy a run of 12 or
more words from the report (the report's own name does not count).

Findings and allegations: state a finding, opinion or conclusion only as the body itself states it,
and attribute it ("The Commission found", "IBAC formed the view"). Never present allegations,
evidence, submissions, witness accounts, complaints or counsel assisting's submissions as findings.
If the report examined allegations, say it examined them, not that they were true.

People: prefer roles to names. Name an individual only when the cited page records the body's own
finding, opinion or formal role about that person, and say nothing about them beyond what that page
states. Never name witnesses, complainants or people the report makes no finding about.

findings: up to 5 of the body's own stated findings, opinions or conclusions, each a complete sentence
copied exactly as printed (at most 60 words) with its PDF page, the most significant first, and only
about the matters the report was asked to examine. Never quote
a finding made by another body (such as an auditor or court), a submission or a witness. Leave the list empty if the
supplied pages state none. Recommendations may be included only as the body's own wording.

own_summary: whether the report has its own executive summary, overview, summary of findings or
similar section; if so its heading exactly as printed and its first and last PDF pages.

If the supplied pages do not support something, leave it out; never write about the pages themselves
or say what they do not contain. Do not add context from outside the
pages."""


def api_key() -> str:
    for cand in (ROOT / "portal" / ".dev.vars", ROOT.parent / "ask-r2-said" / "portal" / ".dev.vars"):
        if cand.exists():
            m = re.search(r"^OPENROUTER_API_KEY=(.*)$", cand.read_text(), re.M)
            if m:
                return m.group(1).strip().strip('"')
    raise SystemExit("no OPENROUTER_API_KEY in a .dev.vars file")


def call_model(prompt: str, repair: str | None = None, model: str = MODEL, schema: dict = SCHEMA,
               system: str = RULES) -> tuple[dict, dict]:
    messages = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
    if repair:
        messages.append({"role": "user", "content": repair})
    body = {
        "model": model,
        "max_tokens": 3000,
        "temperature": 0,
        "messages": messages,
        "tools": [{"type": "function", "function": schema}],
        "tool_choice": {"type": "function", "function": {"name": schema["name"]}},
        "usage": {"include": True},
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
        headers={"content-type": "application/json", "authorization": f"Bearer {api_key()}",
                 "HTTP-Referer": "https://opax.com.au", "X-Title": "OPAX report summaries"})
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.load(r)
            break
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read()[:300]!r}"
        except Exception as e:  # noqa: BLE001
            last = str(e)[:300]
        time.sleep(min(5 * 2 ** attempt, 60))
    else:
        raise RuntimeError(f"model call failed: {last}")
    msg = (data.get("choices") or [{}])[0].get("message", {})
    calls = msg.get("tool_calls") or []
    if not calls:
        raise RuntimeError("model returned no tool call")
    usage = data.get("usage") or {}
    return json.loads(calls[0]["function"]["arguments"]), {
        "model": data.get("model") or model, "provider": data.get("provider"),
        "prompt_tokens": usage.get("prompt_tokens"), "completion_tokens": usage.get("completion_tokens"),
        "cost_usd": usage.get("cost"),
    }


# ---------------------------------------------------------------------------
# checks

def _list(value) -> list[dict]:
    """Tool arguments sometimes arrive with a list serialised as a string."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return []
    return [v for v in value or [] if isinstance(v, dict)]


def check(raw: dict, pages: list[str], sent: list[int], rec: dict) -> dict:
    """Keep only what verifies against the source pages; record everything dropped and why."""
    sent_set = set(sent)
    title_names = {norm(n) for n in name_like(rec.get("title") or "")}
    corpus_tokens = shingles(words(" ".join(pages[n - 1] for n in sent)))
    kept, dropped = [], []
    for item in _list(raw.get("overview")):
        text = (item.get("text") or "").strip()
        cited = [p for p in item.get("pages") or [] if isinstance(p, int)]
        support = item.get("support") or ""
        why = []
        moved = None
        cited_text = "\n".join(pages[p - 1] for p in cited if p in sent_set)
        if not cited or any(p not in sent_set for p in cited) or not contains(cited_text, support):
            # A wrong page number is corrected to the page that actually holds the excerpt (the
            # verifier then judges the sentence against that page); an excerpt found nowhere fails.
            hits = locate(support, pages, sent)
            if hits:
                moved = {"from": cited, "to": hits[:1]}
                cited = hits[:1] + [p for p in cited if p in sent_set and p != hits[0]][:2]
                cited_text = "\n".join(pages[p - 1] for p in cited)
            else:
                why.append("support excerpt not found on any supplied page")
        nwords = len(words(support))
        if not 5 <= nwords <= 40:
            why.append(f"support excerpt is {nwords} words")
        people = [p for p in item.get("people") or [] if isinstance(p, str) and p.strip()]
        people += [m.group(0) for m in TITLED.finditer(text)]
        cited_norm = norm(dehyphen(cited_text))
        for nm in dict.fromkeys(name_like(text) + people):
            if norm(nm) not in cited_norm and norm(nm) not in title_names:
                why.append(f"name {nm!r} not on the cited pages")
        if people and ADVERSE.search(text) and not FINDING_WORDS.search(support):
            why.append("adverse statement about a named person without a stated finding in the support")
        if ALLEGATION_SRC.search(support) and not ALLEGATION_SENT.search(text) and not FINDING_WORDS.search(support):
            why.append("support is allegation, evidence or submission text but the sentence states it as fact")
        if DASH.search(text):
            why.append("em dash")
        low = text.lower()
        if any(b in low for b in BANNED):
            why.append("banned phrase")
        if FIRST_PERSON.search(QUOTED.sub(" ", text)):
            why.append("first person")
        quoted = QUOTED.findall(text)
        for qt in quoted:
            if not contains(cited_text, qt) and len(words(qt)) >= 3:
                why.append(f"quoted words not on the cited pages: {qt[:60]!r}")
            if len(words(qt)) > 35:
                why.append("more than 30 words in quotation marks")
        bare = QUOTED.sub(" ", text)
        for nm in (rec.get("title"), rec.get("body"), rec.get("document")):
            if nm:
                bare = re.sub(re.escape(nm), " ", bare, flags=re.I)
        if shingles(words(bare)) & corpus_tokens:
            why.append(f"copies a run of {SHINGLE}+ words from the report")
        entry = {"text": text, "pages": cited, "support": support, "people": people,
                 **({"page_corrected": moved} if moved else {})}
        (dropped if why else kept).append({**entry, **({"why": why} if why else {})})
    quotes, qdrop = [], []
    for f in _list(raw.get("findings")):
        p, q = f.get("page"), (f.get("quote") or "").strip()
        why = []
        moved = None
        hits = locate(q, pages, sent)
        if not hits:
            why.append("quote not found on any supplied page")
        elif p not in hits:
            moved, p = {"from": p, "to": hits[0]}, hits[0]
        if len(words(q)) > 70:
            why.append("quote longer than 60 words")
        if len(words(q)) < 6:
            why.append("quote shorter than 6 words")
        if not re.search(r"[.?!;:)\"\u201d\u2019']$", q):
            why.append("quote does not end as a complete statement")
        entry = {"quote": q, "page": p, "kind": f.get("kind"), **({"page_corrected": moved} if moved else {})}
        (qdrop if why else quotes).append({**entry, **({"why": why} if why else {})})
    own = raw.get("own_summary") or {}
    if isinstance(own, str):
        try:
            own = json.loads(own)
        except json.JSONDecodeError:
            own = {}
    own_out = None
    if own.get("present") and isinstance(own.get("first_page"), int):
        fp = own["first_page"]
        head = own.get("heading") or ""
        if 1 <= fp <= len(pages) and head and norm(head) in norm(dehyphen(pages[fp - 1][:3000])):
            own_out = {"heading": head, "first_page": fp, "last_page": own.get("last_page") or fp}
        else:
            dropped.append({"own_summary": own, "why": ["heading not found on its first page"]})
    return {"overview": kept, "findings": quotes, "own_summary": own_out, "dropped": dropped + qdrop}


VERIFY_SCHEMA = {
    "name": "verify_sentences",
    "description": "Judge each summary sentence strictly against the report pages it cites.",
    "parameters": {
        "type": "object",
        "properties": {"verdicts": {"type": "array", "items": {"type": "object", "properties": {
            "id": {"type": "integer"},
            "supported": {"type": "string", "enum": ["yes", "partly", "no"],
                          "description": "yes only if the cited pages state every claim in the sentence"},
            "allegation_as_finding": {"type": "boolean",
                                      "description": "true if the sentence presents an allegation, evidence, submission or witness account as a finding or fact"},
            "person_beyond_source": {"type": "boolean",
                                     "description": "true if the sentence says anything about a named person that the cited pages do not state"},
            "neutral": {"type": "boolean", "description": "false if the sentence uses judgement or emotive wording the report does not"},
            "readable": {"type": "boolean", "description": "false if the sentence is ungrammatical, garbled or hard to follow"},
            "note": {"type": "string"},
        }, "required": ["id", "supported", "allegation_as_finding", "person_beyond_source", "neutral", "readable"]}},
            "quote_verdicts": {"type": "array", "items": {"type": "object", "properties": {
                "id": {"type": "integer"},
                "own_words": {"type": "boolean",
                              "description": "true only if the quote is the reporting body's own finding, opinion, conclusion or recommendation, not a submission, evidence, witness account, allegation, or another body's finding"},
                "complete": {"type": "boolean", "description": "true if the quote reads as a complete statement on its own"},
                "note": {"type": "string"},
            }, "required": ["id", "own_words", "complete"]}}},
        "required": ["verdicts", "quote_verdicts"],
    },
}
VERIFY_RULES = """You check summary sentences against the official report pages they cite. You are strict.
A sentence is supported only if the cited pages themselves state every claim in it (names, numbers,
dates, who found what). Inference, outside knowledge or a claim from an uncited page is not support.
Flag any sentence that turns an allegation, evidence, submission, complaint or witness account into a
finding or fact, or that says anything about a named person beyond what the cited pages state.
For each quote, say whether it is the reporting body's OWN finding, opinion, conclusion or
recommendation as stated on its page (not a submission, evidence, witness account, allegation, or a
finding by another body such as an auditor or court), and whether it reads as a complete statement."""


def verify(kept: list[dict], pages: list[str], quotes: list[dict] | None = None, body: str = "") -> tuple[list[dict], list[dict], dict, list[dict]]:
    quotes = quotes or []
    if not kept and not quotes:
        return kept, [], {}, quotes
    cited = sorted({p for s in kept for p in s["pages"]} | {q["page"] for q in quotes})
    prompt = (f"Reporting body: {body}\n\nReport pages:\n\n"
              + "\n\n".join(f"=== PDF page {n} ===\n{pages[n - 1].strip()}" for n in cited)
              + "\n\nSentences to check:\n" + "\n".join(
                  f"{i}. {s['text']} [cites PDF pages {', '.join(map(str, s['pages']))}]" for i, s in enumerate(kept))
              + "\n\nQuotes to check:\n" + "\n".join(
                  f"{i}. \"{q['quote']}\" [PDF page {q['page']}]" for i, q in enumerate(quotes)))
    raw, usage = call_model(prompt, model=VERIFY_MODEL, schema=VERIFY_SCHEMA, system=VERIFY_RULES)
    qv = {v.get("id"): v for v in _list(raw.get("quote_verdicts"))}
    qok = []
    qbad = []
    for i, q in enumerate(quotes):
        v = qv.get(i) or {}
        why = []
        if not v:
            why.append("verifier returned no verdict")
        elif not v.get("own_words"):
            why.append(f"verifier: not the body's own finding ({v.get('note') or ''})".strip())
        if v and v.get("complete") is False:
            q = {**q, "verifier_note": "verifier read this as incomplete; kept because it ends as printed"}
        (qbad if why else qok).append({**q, **({"why": why} if why else {})})
    verdicts = {v.get("id"): v for v in _list(raw.get("verdicts"))}
    ok, bad = [], []
    for i, s in enumerate(kept):
        v = verdicts.get(i)
        why = []
        if not v:
            why.append("verifier returned no verdict")
        else:
            if v.get("supported") != "yes":
                why.append(f"verifier: support {v.get('supported')} ({v.get('note') or ''})".strip())
            if v.get("allegation_as_finding"):
                why.append("verifier: allegation presented as finding")
            if v.get("person_beyond_source"):
                why.append("verifier: says more about a named person than the pages state")
            if v.get("neutral") is False:
                why.append("verifier: not neutral")
            if v.get("readable") is False:
                why.append("verifier: not readable")
        (bad if why else ok).append({**s, **({"why": why} if why else {})})
    return ok, bad + qbad, usage, qok


# ---------------------------------------------------------------------------
# commands

def cite(rec: dict, page: int) -> dict:
    return {"url": rec["url"], "document": rec.get("document") or rec["title"], "page": page}


def build(rec: dict, pages: list[str], sent: list[int], checked: dict, usage: dict) -> dict:
    ov = checked["overview"]
    status = "ready" if len(ov) >= 2 else "withheld"
    return {
        "schema": 1,
        "slug": rec["slug"],
        "report_type": rec["type"],
        "subtype": rec.get("subtype"),
        "title": rec["title"],
        "body": rec.get("body"),
        "jurisdiction": rec.get("jurisdiction"),
        "source": {"url": rec["url"], "document": rec.get("document"), "sha256": rec.get("sha256"),
                   "pages": len(pages), "pages_read": len(sent), "rights": rec.get("rights")},
        "already_on_page": bool(rec.get("own_summary_on_page")),
        "own_summary": None if not checked["own_summary"] else {
            **checked["own_summary"],
            "label": "The report's own summary",
            "link": f"{rec['url']}#page={checked['own_summary']['first_page']}",
        },
        "summary": {
            "status": status,
            "label": LABEL,
            "sentences": [{"text": s["text"], "cites": [cite(rec, p) for p in s["pages"]], "support": s["support"]}
                          for s in ov],
        },
        # Where the report page already lists findings extracted at ingest, those stay the record and no
        # generated selection is shown beside them.
        "findings": ({"label": FINDINGS_LABEL, "source": "already on the report page", "items": [],
                      "unused_selection": [{"quote": f["quote"], "kind": f["kind"], "cite": cite(rec, f["page"])}
                                           for f in checked["findings"]]}
                     if rec.get("opax_findings") else
                     {"label": FINDINGS_LABEL, "source": "selected by the model, quoted verbatim and checked",
                      "items": [{"quote": f["quote"], "kind": f["kind"], "cite": cite(rec, f["page"])}
                                for f in checked["findings"]]}),
        "dropped": checked["dropped"],
        "generation": {"model": usage.get("model"), "provider": usage.get("provider"), "prompt_version": PROMPT_VERSION,
                       "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
                       "prompt_tokens": usage.get("prompt_tokens"), "completion_tokens": usage.get("completion_tokens"),
                       "input_chars": sum(len(pages[n - 1]) for n in sent), "calls": usage.get("calls", 1),
                       "verifier": usage.get("verify"),
                       "cost_usd": usage.get("cost_usd")},
    }


def cmd_run(args) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "raw").mkdir(exist_ok=True)
    total = 0.0
    for slug in args.slug:
        rec = find(slug)
        if not rec.get("text"):
            print(f"{slug}: skipped ({rec.get('reason')})")
            continue
        pages = load_pages(Path(rec["text"]))
        sent = select_pages(pages)
        prompt = (f"Report: {rec['title']}\nPublished by: {rec.get('body')}\nDocument: {rec.get('document')}\n"
                  f"PDF pages in the document: {len(pages)}; pages supplied: {len(sent)}\n\n"
                  + "\n\n".join(f"=== PDF page {n} ===\n{pages[n - 1].strip()}" for n in sent))
        # Up to three rounds: write, check mechanically, verify independently; if fewer than four
        # sentences survive, hand the model every rejection and its reason and ask again. The round
        # with the most surviving sentences is kept. Nothing that failed a check is published.
        usage = {"prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0, "calls": 0,
                 "verify": {"model": VERIFY_MODEL, "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0}}
        best = None
        repair = None
        for _round in range(MAX_ROUNDS):
            raw, u = call_model(prompt, repair=repair)
            usage["calls"] += 1
            usage["model"], usage["provider"] = u.get("model"), u.get("provider")
            for k in ("prompt_tokens", "completion_tokens", "cost_usd"):
                usage[k] += u.get(k) or 0
            checked = check(raw, pages, sent, rec)
            ok, bad, vu, qok = verify(checked["overview"], pages, checked["findings"], rec.get("body") or "")
            for k in ("prompt_tokens", "completion_tokens", "cost_usd"):
                usage["verify"][k] += vu.get(k) or 0
            checked["overview"], checked["findings"], checked["dropped"] = ok, qok, checked["dropped"] + bad
            if best is None or (len(ok), len(qok)) > (len(best[1]["overview"]), len(best[1]["findings"])):
                best = (raw, checked)
            if len(ok) >= 4:
                break
            failed = [d for d in checked["dropped"] if "text" in d or "quote" in d]
            repair = ("Your previous answer:\n" + json.dumps(raw, ensure_ascii=False)
                      + "\n\nChecks against the report pages rejected these items:\n"
                      + json.dumps(failed, ensure_ascii=False, indent=1)
                      + "\nCall the tool again with the complete answer: keep what passed, and fix or replace each "
                        "rejected item so it is fully stated on the pages it cites. Copy support excerpts and quotes "
                        "character for character, and paraphrase outside quotation marks.")
        raw, checked = best
        usage["cost_usd"] += usage["verify"]["cost_usd"]
        (OUT / "raw" / f"{slug}.json").write_text(json.dumps({"raw": raw, "usage": usage}, indent=1, ensure_ascii=False))
        doc = build(rec, pages, sent, checked, usage)
        (OUT / f"{slug}.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        total += usage.get("cost_usd") or 0
        print(f"{slug}: {doc['summary']['status']} kept={len(doc['summary']['sentences'])} "
              f"findings={len(doc['findings']['items'])} dropped={len(doc['dropped'])} "
              f"tokens={usage.get('prompt_tokens')}/{usage.get('completion_tokens')} cost=${usage.get('cost_usd')}")
    print(f"total cost ${total:.4f}")
    return 0


def cmd_check(args) -> int:
    for slug in args.slug:
        rec = find(slug)
        pages = load_pages(Path(rec["text"]))
        sent = select_pages(pages)
        raw = json.loads((OUT / "raw" / f"{slug}.json").read_text())
        checked = check(raw["raw"], pages, sent, rec)  # mechanical checks only; the verifier is not re-run
        print(f"{slug}: kept={len(checked['overview'])} findings={len(checked['findings'])} dropped={len(checked['dropped'])}")
    return 0


BULK_TYPES = {
    "royal_commission": None,
    "integrity_report": {"investigation_report", "special_report", "public_inquiry_report", "prevention_research_report"},
}


def cmd_estimate(args) -> int:
    done = [json.loads(p.read_text()) for p in OUT.glob("*.json")]
    gens = [d["generation"] for d in done if d.get("generation", {}).get("prompt_tokens")]
    if not gens:
        raise SystemExit("run the pilot first")
    tpc = sum(g["prompt_tokens"] for g in gens) / sum(g["input_chars"] for g in gens)
    out_tok = sum(g["completion_tokens"] for g in gens) / len(gens)
    cost_in = sum(g["cost_usd"] or 0 for g in gens) / max(1, sum(g["prompt_tokens"] + 5 * g["completion_tokens"] for g in gens))
    per_tok_in = cost_in  # cost per weighted token: input + 5x output (Haiku 5.5 price ratio)
    rows = candidates()
    tiers: dict[str, dict] = {}
    for r in rows:
        key = r["type"] if r["type"] != "integrity_report" else f"integrity_report/{r['subtype']}"
        t = tiers.setdefault(key, {"records": 0, "own_summary_on_page": 0, "text_held": 0, "in_scope": 0,
                                    "input_tokens": 0, "est_usd": 0.0})
        t["records"] += 1
        t["own_summary_on_page"] += bool(r.get("own_summary_on_page"))
        if not r.get("text"):
            continue
        t["text_held"] += 1
        allowed = BULK_TYPES.get(r["type"], "no")
        if allowed == "no" or (allowed is not None and r["subtype"] not in allowed):
            if not args.include_agency or r["type"] != "agency_report":
                continue
        pages = load_pages(Path(r["text"]))
        chars = sum(len(pages[n - 1]) for n in select_pages(pages))
        tok = chars * tpc
        t["in_scope"] += 1
        t["input_tokens"] += int(tok)
        t["est_usd"] += (tok + 5 * out_tok) * per_tok_in
    total = sum(t["est_usd"] for t in tiers.values())
    print(json.dumps({"tokens_per_char": round(tpc, 4), "avg_output_tokens": int(out_tok),
                      "usd_per_weighted_token": per_tok_in, "tiers": tiers, "total_usd": round(total, 2)}, indent=1))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run"); r.add_argument("--slug", action="append", required=True)
    c = sub.add_parser("check"); c.add_argument("--slug", action="append", required=True)
    e = sub.add_parser("estimate"); e.add_argument("--include-agency", action="store_true")
    args = ap.parse_args()
    return {"run": cmd_run, "check": cmd_check, "estimate": cmd_estimate}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
