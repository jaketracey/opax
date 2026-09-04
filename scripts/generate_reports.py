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

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
import re
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
        "topic": "gambling",
        "relevance_terms": (
            "gambling", "wagering", "betting", "poker machine", "casino", "gaming",
        ),
        "key_moment_questions": [
            "Which substantive speeches drove poker-machine reform, harm minimisation, precommitment or cashless-card policy?",
            "Which major speeches changed the regulation of online wagering, gambling credit or inducements?",
            "What important parliamentary speeches followed casino inquiries or royal commissions into Crown or Star?",
            "Which speeches mattered in the debate over sports-betting advertising and children's exposure to gambling ads?",
            "Which members made the case for or against the Interactive Gambling Act and later online-gambling reforms?",
            "Which ministers, opposition spokespeople or crossbenchers led landmark debates about gambling harm and addiction?",
            "Which speeches exposed the influence of clubs, casinos, bookmakers or gambling-industry political donations?",
            "Which major bill speeches addressed wagering taxes, racing regulation or national gambling reform?",
        ],
        "questions": [
            "What have MPs said about gambling reform and poker machine regulation?",
            "What arguments have been made against tighter gambling regulation, and by whom?",
            "What has been said about the influence of the gambling industry on politics?",
        ],
    },
    "climate": {
        "title": "Climate & Energy",
        "blurb": "The climate debate on the record: targets, coal, renewables and carbon pricing.",
        "topic": "climate-environment",
        "relevance_terms": (
            "climate", "emission", "renewable", "carbon", "coal", "energy", "greenhouse",
        ),
        "key_moment_questions": [
            {
                "question": "Which substantive speeches led the Carbon Pollution Reduction Scheme bills and the first national emissions-trading legislation?",
                "query": "Carbon Pollution Reduction Scheme bills emissions trading renewable investment 2009",
                "year": "2009",
                "fallback_title": "Carbon Pollution Reduction Scheme Bills 2009",
            },
            {
                "question": "Which major speeches made the government's case after repeal of the carbon price?",
                "query": "Greg Hunt carbon price repeal electricity prices emissions reduction fund",
                "speaker": "Greg Hunt",
                "year": "2015",
                "fallback_title": "The case for carbon price repeal",
            },
            {
                "question": "Which leaders, ministers or crossbenchers led the Climate Change Bill 2022 and its legislated emissions targets?",
                "query": "Climate Change Bill 2022 43 per cent emissions target net zero",
                "year": "2022",
                "fallback_title": "Climate Change Bill 2022",
            },
            "Which landmark speeches led Renewable Energy Target amendment bills and the 20 per cent renewable target?",
            "Which speeches defined the political fight over new coal mines and the transition from fossil fuels?",
            {
                "question": "Which ministers, shadow ministers or crossbenchers drove the Safeguard Mechanism (Crediting) Amendment Bill reforms?",
                "query": "Safeguard Mechanism Crediting Amendment Bill industrial emitters baseline decline",
                "year": "2023",
                "fallback_title": "Safeguard Mechanism reforms",
            },
            "Which major speeches linked bushfires, droughts or floods to climate action and adaptation?",
            "Which substantive speeches shaped the National Energy Guarantee, electricity reliability and energy prices?",
        ],
        "questions": [
            "What positions have MPs taken on climate change action and emissions targets?",
            "What has been said in parliament about coal mining and the transition to renewable energy?",
            "How have MPs discussed carbon pricing and its repeal?",
        ],
    },
    "housing": {
        "title": "Housing",
        "blurb": "Decades of affordability promises, negative gearing fights and supply debates.",
        "topic": "housing",
        "relevance_terms": (
            "housing", "home", "rent", "tenant", "homeless", "mortgage", "property",
            "negative gearing",
        ),
        "key_moment_questions": [
            {
                "question": "Which substantive speeches led the Housing Australia Future Fund Bill 2023 and its passage?",
                "query": "Housing Australia Future Fund Bill 2023 social affordable housing passage",
                "year": "2023",
                "fallback_title": "Housing Australia Future Fund Bill 2023",
            },
            {
                "question": "Which leaders or shadow ministers made landmark cases for changing negative gearing or capital-gains tax concessions?",
                "query": "negative gearing capital gains tax concessions housing affordability election policy",
                "year": "2016",
                "fallback_title": "Negative gearing and capital gains tax",
            },
            "Which ministers made major budget or bill announcements about social and public housing construction?",
            "Which important speeches addressed rental affordability, tenant protections or rent increases?",
            "Which major speeches set policy for first-home buyers and home ownership?",
            "Which ministers, opposition spokespeople or crossbenchers led debates about housing supply and planning reform?",
            "Which landmark speeches addressed homelessness and the national housing crisis?",
            "Which bill or agreement speeches changed Commonwealth-state affordable-housing policy?",
        ],
        "questions": [
            "What have MPs said about housing affordability and home ownership?",
            "What positions have been taken on negative gearing and property tax concessions?",
            "What has parliament said about social and public housing supply?",
        ],
    },
    "indigenous": {
        "title": "First Nations",
        "blurb": "Reconciliation, the Voice, Closing the Gap and native title, in parliament's own words.",
        "topic": "indigenous-affairs",
        "relevance_terms": (
            "indigenous", "aboriginal", "torres strait", "first nations", "native title",
            "stolen generation", "uluru", "voice",
        ),
        "key_moment_questions": [
            {
                "question": "Which substantive crossbench speech answered the National Apology to the Stolen Generations in 2008?",
                "query": "Andrew Bartlett national apology stolen generations 13 February 2008",
                "speaker": "Andrew Bartlett",
                "year": "2008",
                "fallback_title": "Apology to Australia's Indigenous Peoples",
            },
            "Which leaders and ministers made the defining speeches on the Uluru Statement, the Voice and the 2023 referendum?",
            {
                "question": "Which prime ministers, opposition leaders or First Nations members delivered major Closing the Gap statements?",
                "query": "major Closing the Gap statement targets outcomes prime minister opposition First Nations",
                "fallback_title": "Closing the Gap statement",
            },
            "Which landmark speeches led the Native Title Amendment (Reform) Bill and other reforms to the burden of proof and agreement-making?",
            "Which major speeches demanded implementation of the Royal Commission into Aboriginal Deaths in Custody, including removal of hanging points and decriminalisation of public drunkenness?",
            {
                "question": "Which ministers or shadow ministers led the debate over the Northern Territory Intervention and Stronger Futures?",
                "query": "Nigel Scullion Northern Territory Intervention emergency response bills 2007",
                "speaker": "Nigel Scullion",
                "fallback_title": "Northern Territory Emergency Response Bills",
            },
            {
                "question": "Which substantive speeches advanced treaty, Makarrata or truth-telling in Australian parliaments?",
                "query": "K.J. Maher treaty Makarrata truth-telling First Nations South Australia",
                "speaker": "K.J. Maher",
                "fallback_title": "Treaty and truth-telling",
            },
            {
                "question": "Which leaders or crossbenchers made major speeches on constitutional recognition of First Nations peoples?",
                "query": "constitutional recognition Indigenous Voice Uluru Statement referendum",
                "speaker": "Linda Burney",
                "fallback_title": "Constitutional recognition and the Uluru Statement",
            },
        ],
        "questions": [
            "What have MPs said about reconciliation and recognition of First Nations peoples?",
            "What was said in parliament about the Voice to Parliament referendum?",
            "How has parliament discussed Closing the Gap outcomes?",
        ],
    },
    "immigration": {
        "title": "Immigration",
        "blurb": "Border policy, offshore detention and migration levels across the decades.",
        "topic": "immigration",
        "relevance_terms": (
            "immigration", "migration", "asylum", "refugee", "detention", "visa", "border",
            "people smuggl", "nauru", "manus", "citizenship", "multicultural",
        ),
        "key_moment_questions": [
            {
                "question": "Which substantive speeches shaped the Tampa, Border Protection Bill and asylum-seeker debates?",
                "query": "Tampa Border Protection Bill asylum seekers 2001",
                "year": "2001",
                "fallback_title": "The Tampa and Border Protection Bill",
            },
            "Which ministers or shadow ministers led major Migration Act debates on offshore detention in Nauru and Manus Island?",
            {
                "question": "Which important bill speeches introduced, defended or repealed the medical-transfer or Medevac law?",
                "query": "Medevac medical transfer law Nauru Manus Migration Amendment bill",
                "year": "2019",
                "fallback_title": "The Medevac law",
            },
            "Which landmark Migration Amendment speeches changed policy on children and families in immigration detention?",
            "Which ministers or opposition spokespeople announced major changes to skilled-migration program levels?",
            "Which substantive Australian Citizenship Bill speeches shaped citizenship and multicultural policy?",
            "Which major Migration Act speeches addressed boat turnbacks, temporary protection visas and Operation Sovereign Borders?",
            "Which leaders or ministers made defining speeches on refugee resettlement and the humanitarian intake?",
        ],
        "questions": [
            "What positions have MPs taken on asylum seekers and offshore detention?",
            "What has been said about immigration levels and skilled migration?",
        ],
    },
    "media": {
        "title": "Media Ownership",
        "blurb": "Concentration, regulation and the platforms: parliament on the press.",
        "topic": "media-communications",
        "relevance_terms": (
            "media", "press", "journalis", "broadcast", "abc", "sbs", "news", "newspaper",
            "social media", "platform",
        ),
        "key_moment_questions": [
            "Which substantive speeches led the Broadcasting Services Amendment media ownership bills and cross-media concentration changes?",
            {
                "question": "Which ministers, shadow ministers or crossbenchers drove the Treasury Laws Amendment News Media and Digital Platforms Mandatory Bargaining Code Bill?",
                "query": "News Media Digital Platforms Mandatory Bargaining Code Bill Google Facebook journalism",
                "year": "2021",
                "fallback_title": "News Media Bargaining Code",
            },
            "Which landmark speeches defended or challenged the funding and independence of the ABC and SBS?",
            "Which important bill speeches advanced press freedom, journalist-source protection or public-interest journalism?",
            {
                "question": "Which leaders or crossbenchers called for a royal commission or Senate inquiry into media diversity and ownership?",
                "query": "media diversity ownership concentration royal commission Senate inquiry",
                "year": "2020",
                "fallback_title": "Media diversity and ownership inquiry",
            },
            "Which major speeches shaped regulation of social-media platforms, misinformation or online safety?",
            "Which substantive speeches changed broadcasting law for streaming services and digital platforms?",
            "Which ministers or opposition spokespeople made major interventions on regional and local journalism?",
        ],
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

SECTION_PROMPT = (
    "Answer the question from the Australian parliamentary record supplied below. "
    "Open directly with the strongest finding; never mention 'the provided context', "
    "'the context', source limitations, or these instructions. Synthesize the range of "
    "positions and attribute them to speakers or parties where the record does. Be precise "
    "with figures and do not invent facts. Use plain Markdown paragraphs or short bullets "
    "when they genuinely make competing positions easier to scan.\n\n"
    "PARLIAMENTARY RECORD:\n{context}\n\n"
    "QUESTION: {question}\n\n"
    "ANSWER:"
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


PARLIAMENT_NAMES = {
    "federal": "Federal",
    "nsw": "NSW",
    "vic": "Victoria",
    "sa": "South Australia",
    "qld": "Queensland",
}
_BARE_DEBATE_TITLES = {
    "adjournment", "answers to questions", "bills", "business", "committee",
    "committees", "documents", "governor-general's speech", "legislation amendment bill",
    "matters of public importance", "matters of urgency", "ministerial statements",
    "motion", "motions", "notices", "petitions", "private members' business",
    "points of order", "questions", "questions on notice", "statements by senators",
    "questions without notice", "statements", "valedictory", "votes and proceedings",
}
_ROLE_PATTERNS = (
    (1.45, "leader", re.compile(
        r"\b(?:prime minister|premier|chief minister|leader of the opposition|"
        r"opposition leader|party leader)\b", re.I)),
    (1.35, "minister", re.compile(
        r"\b(?:deputy prime minister|deputy premier|shadow minister|minister for|"
        r"assistant minister|attorney-general|treasurer)\b", re.I)),
)


def debate_title(raw_title: str | None, speaker: str | None, date: str | None) -> str:
    """Return the debate name, stripping the ingest's speaker/date wrapper."""
    parts = [p.strip() for p in str(raw_title or "").split(" — ")]
    if speaker and parts and parts[0].casefold() == speaker.strip().casefold():
        parts.pop(0)
    iso_date = str(date or "")[:10]
    if parts and re.fullmatch(r"\d{4}-\d{2}-\d{2}", parts[-1]) and parts[-1] == iso_date:
        parts.pop()
    title = " — ".join(p for p in parts if p).strip()
    return re.sub(r"([a-z])’S\b", r"\1’s", title)


def is_hollow_title(title: str | None) -> bool:
    """True for headings and transcript artefacts that are not debate names."""
    compact = re.sub(r"\s+", " ", str(title or "")).strip(" .:-—")
    folded = compact.casefold()
    if not compact or folded in _BARE_DEBATE_TITLES:
        return True
    if len(compact) > 240 or re.search(r"\b(?:division record|senate division)\b", folded):
        return True
    if re.search(r"\b(?:point of order|question on notice)\b", folded):
        return True
    if folded.startswith("questions without notice"):
        return True
    committee_words = re.search(
        r"\b(?:estimates?|committee transcript|committee hearing|public hearing)\b", folded)
    letters = [c for c in compact if c.isalpha()]
    uppercase_share = (sum(c.isupper() for c in letters) / len(letters)) if letters else 0
    return bool(committee_words and (len(compact) > 90 or uppercase_share > 0.45))


# Above this the "speech" is a whole day's combined debate stored as one
# record by an archival source (the 2008 Apology sits in one 132,000-character
# item): a reading list wants one member's words, so those are skipped.
MAX_KEY_SPEECH_CHARS = 45_000


def is_hollow_speech(text: str | None, min_chars: int = 1500) -> bool:
    """True for short, procedural or boilerplate speech fields, and for
    combined-debate records too long to be one speech."""
    compact = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(compact) < min_chars or len(compact) > MAX_KEY_SPEECH_CHARS:
        return True
    opening = compact[:420]
    if re.search(
        r"\b(?:point of order|the answer to the honourable member(?:'s|’s) question is|"
        r"the committee met at|division required)\b", opening, re.I):
        return True
    if re.search(r"^I move\s*:?[\s\S]{0,160}?\b(?:Senate|House) take note\b", opening, re.I) and re.search(
        r"\b(?:informal arrangements|limit the time|clerks|procedures?|leave granted)\b",
        compact[:1400], re.I):
        return True
    move = re.search(
        r"\bI move\s*:?[\s\S]{0,220}?\b(?:bill be now read a second time|that the motion be agreed to)\b[.!]?",
        compact, re.I)
    if move and len(re.sub(r"\W+", "", compact[move.end():])) < 650:
        return True
    if len(compact) < 1800 and re.search(
        r"\b(?:motion agreed to|question resolved in the affirmative|bill read a second time)\b\W*$",
        compact, re.I):
        return True
    return False


def is_hollow_brief(brief: str | None) -> bool:
    """True when the machine brief is absent or merely describes procedure."""
    compact = re.sub(r"\s+", " ", str(brief or "")).strip()
    if len(compact) < 120:
        return True
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", compact) if s]
    if len(sentences) <= 2 and re.search(
        r"\b(?:the speaker|the member|the senator)\s+(?:moved|tabled|presented|asked|answered|"
        r"seconded|noted)\b", compact, re.I):
        return True
    if len(sentences) <= 2 and re.fullmatch(
        r"(?:the )?speaker moved (?:the )?second reading of (?:a|the) bill\.?",
        compact, re.I):
        return True
    if re.search(
        r"\b(?:senate business|extended sitting hours|suspend standing orders|procedural motion)\b",
        compact, re.I,
    ):
        return True
    if re.search(
        r"\b(?:requested further details from|asked the minister for (?:an )?(?:update|details)|"
        r"requested an update from)\b", compact, re.I,
    ):
        return True
    return False


def brief_matches_topic(brief: str | None, terms: tuple[str, ...] | list[str]) -> bool:
    """Require the machine brief itself—not just its field label—to name the subject."""
    folded = str(brief or "").casefold()
    return any(term.casefold() in folded for term in terms)


def retrieval_score(resource: dict) -> float:
    """Best reranked paragraph score carried by a /find resource."""
    scores = []
    for field in (resource.get("fields") or {}).values():
        for para in (field.get("paragraphs") or {}).values():
            score = para.get("score")
            if isinstance(score, (int, float)):
                scores.append(float(score))
    return max(scores, default=0.0)


def resource_labels(resource: dict) -> dict[str, str]:
    return {
        c.get("labelset"): c.get("label")
        for c in ((resource.get("usermetadata") or {}).get("classifications") or [])
        if c.get("labelset") and c.get("label")
    }


def load_parliamentarians() -> dict[str, dict]:
    path = OUT_DIR.parent / "parliamentarians.json"
    people = (json.loads(path.read_text()).get("people") or []) if path.exists() else []
    out: dict[str, dict] = {}
    for person in people:
        for name in (person.get("name"), person.get("full")):
            if name:
                out.setdefault(name.strip().casefold(), person)
    return out


def role_weight(title: str, text: str, speaker: str | None,
                parliamentarians: dict[str, dict]) -> tuple[float, str]:
    """Weight leadership visible in the record; public membership is a small prior."""
    header = text[:420]
    speaker_name = str(speaker or "").strip()
    speaker_pattern = re.escape(speaker_name.split()[-1]) if speaker_name else r"(?!)"
    for weight, label, pattern in _ROLE_PATTERNS:
        role = pattern.search(header)
        if role and (
            re.search(speaker_pattern, header, re.I)
            and abs(role.start() - (re.search(speaker_pattern, header, re.I) or role).start()) < 180
        ):
            return weight, label
        if re.search(rf"\b(?:as|I am)\s+(?:the\s+)?{pattern.pattern}", header, re.I):
            return weight, label
    if re.search(r"\bI move\s*:?[\s\S]{0,220}?\bbill be now read a second time\b", text[:1200], re.I):
        return 1.30, "bill mover"
    person = parliamentarians.get(str(speaker or "").strip().casefold())
    if person and person.get("current"):
        return 1.14, "parliamentarian"
    if person and int(person.get("speeches") or 0) >= 100:
        return 1.08, "parliamentarian"
    return 1.0, "speaker"


def why_line(title: str, state: str | None, date: str | None, text: str) -> str:
    """Build a short, generation-free reason from the record's own metadata."""
    year = str(date or "")[:4]
    parliament = PARLIAMENT_NAMES.get(str(state or ""), str(state or "").upper())
    short = re.sub(r"\s+-\s+(?:second|third) reading\s*$", "", title, flags=re.I)
    short = re.sub(r"\s+", " ", short).strip()
    if len(short) > 78:
        short = short[:75].rsplit(" ", 1)[0] + "…"
    if re.search(r"\bsecond reading\b", title, re.I) or re.search(
            r"\bbill be now read a second time\b", text[:1200], re.I):
        reason = f"Second reading, {short}"
    elif re.search(r"\bapolog", title, re.I):
        reason = f"National apology debate, {parliament}"
    elif re.search(r"\bclosing the gap\b", title, re.I):
        reason = f"Closing the Gap statement, {parliament}"
    elif re.search(r"\bbudget\b", title, re.I):
        reason = f"Budget debate, {parliament}"
    else:
        reason = f"{short}, {parliament}" if parliament else short
    return f"{reason}, {year}" if year else reason


def select_key_moments(candidates: list[dict], limit: int = 8) -> list[dict]:
    """Greedy relevance ranking with explicit year and parliament spread."""
    remaining = sorted(candidates, key=lambda c: c["base_score"], reverse=True)
    chosen: list[dict] = []
    speakers: set[str] = set()
    years: set[str] = set()
    states: set[str] = set()
    decades: set[str] = set()
    queries: set[int] = set()
    titles: set[str] = set()

    def eligible(candidate: dict) -> bool:
        speaker = str(candidate.get("speaker") or candidate["slug"]).casefold()
        year = str(candidate.get("date") or "")[:4]
        title = str(candidate.get("title") or "").casefold()
        return speaker not in speakers and bool(year) and year not in years and title not in titles

    while remaining and len(chosen) < limit:
        available = [c for c in remaining if eligible(c)]
        if not available:
            break
        uncovered = [c for c in available if set(c.get("query_indexes") or []) - queries]
        if uncovered:
            available = uncovered
        elif len(chosen) >= 6:
            break
        # Guarantee a second parliament before optimising the rest of the mix.
        if len(chosen) == 1 and len(states) == 1:
            alternatives = [c for c in available if c.get("state") not in states]
            if alternatives:
                available = alternatives

        def spread_score(candidate: dict) -> float:
            year = int(str(candidate["date"])[:4])
            distance = min((abs(year - int(y)) for y in years), default=10)
            multiplier = 1.0 + min(distance, 10) * 0.018
            if candidate.get("state") not in states:
                multiplier *= 1.18
            if str(year)[:3] not in decades:
                multiplier *= 1.10
            if set(candidate.get("query_indexes") or []) - queries:
                multiplier *= 1.05
            return candidate["base_score"] * multiplier

        pick = max(available, key=spread_score)
        chosen.append(pick)
        remaining.remove(pick)
        speakers.add(str(pick.get("speaker") or pick["slug"]).casefold())
        year = str(pick["date"])[:4]
        years.add(year)
        decades.add(year[:3])
        states.add(str(pick.get("state") or ""))
        titles.add(str(pick.get("title") or "").casefold())
        queries.update(pick.get("query_indexes") or [])

    return sorted(chosen, key=lambda c: (str(c.get("date") or ""), c["title"]))


def key_moments(kb: KbClient, report_slug: str, limit: int = 8) -> list[dict]:
    """Retrieve, reject and rank a report's substantive speeches without generation."""
    cfg = REPORTS[report_slug]
    clauses = [
        {"prop": "label", "labelset": "kind", "label": "speech"},
        {"prop": "label", "labelset": "topic", "label": cfg["topic"]},
        {"not": {"prop": "field", "type": "generic"}},
    ]
    candidates: dict[str, dict] = {}
    for query_index, configured in enumerate(cfg["key_moment_questions"]):
        spec = configured if isinstance(configured, dict) else {"question": configured}
        question = spec.get("query") or spec["question"]
        query_clauses = list(clauses)
        if spec.get("speaker"):
            query_clauses.insert(-1, {
                "prop": "origin_collaborator", "collaborator": spec["speaker"],
            })
        if spec.get("year"):
            year = spec["year"]
            query_clauses.insert(-1, {
                "prop": "created",
                "since": f"{year}-01-01T00:00:00Z",
                "until": f"{year}-12-31T23:59:59Z",
            })
        result = kb.find(
            question,
            top_k=20,
            filter_expression={"field": {"and": query_clauses}},
            show=["basic", "origin", "extra"],
        )
        for rid, resource in (result.get("resources") or {}).items():
            summary = resource_summary(resource)
            if not summary["slug"] or summary["slug"].startswith("da-"):
                continue
            title = debate_title(resource.get("title"), summary["speaker"], summary["date"])
            if is_hollow_title(title):
                fallback = spec.get("fallback_title")
                folded = re.sub(r"\s+", " ", title).strip(" .:-—").casefold()
                replaceable = not title or folded in _BARE_DEBATE_TITLES or len(title) > 240
                if fallback and replaceable:
                    title = fallback
                else:
                    continue
            labels = resource_labels(resource)
            candidate = candidates.setdefault(rid, {
                **summary,
                "resource": rid,
                "title": title,
                "chamber": labels.get("chamber"),
                "retrieval_score": 0.0,
                "query_indexes": [],
            })
            candidate["retrieval_score"] = max(
                candidate["retrieval_score"], retrieval_score(resource))
            candidate["query_indexes"].append(query_index)

    parliamentarians = load_parliamentarians()

    def hydrate(candidate: dict) -> dict | None:
        try:
            body_data = kb.get_resource_text(candidate["resource"], "body")
        except AragError:
            return None
        body = (((body_data.get("value") or {}).get("body")) or "").strip()
        if is_hollow_speech(body):
            return None
        try:
            brief_data = kb.get_resource_text(candidate["resource"], "da-summary-t-body")
        except AragError:
            return None
        brief = (((brief_data.get("value") or {}).get("body")) or "").strip()
        if is_hollow_brief(brief) or not brief_matches_topic(brief, cfg["relevance_terms"]):
            return None
        weight, role = role_weight(candidate["title"], body, candidate.get("speaker"), parliamentarians)
        candidate.update({
            "brief": brief,
            "why": why_line(candidate["title"], candidate.get("state"), candidate.get("date"), body),
            "role": role,
            "length": len(body),
            "base_score": candidate["retrieval_score"] * math.log(len(body)) * weight,
        })
        return candidate

    # Per-field reads are small and independent. A bounded pool keeps a report
    # run practical without turning it into an unbounded request fan-out.
    with ThreadPoolExecutor(max_workers=8) as pool:
        hydrated = [c for c in pool.map(hydrate, candidates.values()) if c]
    selected = select_key_moments(hydrated, limit=limit)
    public_keys = (
        "resource", "slug", "title", "speaker", "party", "state", "chamber",
        "date", "brief", "why", "role", "length",
    )
    return [{key: candidate.get(key) for key in public_keys} for candidate in selected]


def build_section(kb: KbClient, question: str) -> dict:
    res = kb.ask(question, citations=True, prompt=SECTION_PROMPT, top_k=20)
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", nargs="*", help="report slugs (all when omitted)")
    parser.add_argument("--stats-only", action="store_true", help="refresh embedded static stats")
    parser.add_argument(
        "--only", choices=("key-moments", "sections", "stats"),
        help="refresh only one report block and preserve every other field",
    )
    args = parser.parse_args()
    if args.stats_only and args.only:
        parser.error("--stats-only and --only cannot be combined")
    unknown = sorted(set(args.reports) - set(REPORTS))
    if unknown:
        parser.error(f"unknown report slug(s): {', '.join(unknown)}")
    stats_only = args.stats_only
    picked = args.reports or list(REPORTS)
    kb = KbClient(AragConfig.from_env())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stats_path = Path(__file__).resolve().parent / "report_stats.json"
    all_stats = json.loads(stats_path.read_text()) if stats_path.exists() else {}

    if args.only:
        ask_count = 0
        for slug in picked:
            cfg = REPORTS[slug]
            prior_path = OUT_DIR / f"{slug}.json"
            if not prior_path.exists():
                parser.error(f"{prior_path} must exist for --only")
            report = json.loads(prior_path.read_text())
            if args.only == "stats":
                report["stats"] = all_stats.get(slug)
                print(f"[{slug}] embedded audited static stats")
            elif args.only == "key-moments":
                print(f"[{slug}] retrieving and checking key speeches...")
                report["key_moments"] = key_moments(kb, slug)
                print(f"  key moments: {len(report['key_moments'])}")
            else:
                sections = []
                for question in cfg["questions"]:
                    t0 = time.time()
                    try:
                        sections.append(build_section(kb, question))
                        ask_count += 1
                        print(f"[{slug}] ok ({time.time() - t0:.0f}s): {question[:60]}")
                    except AragError as error:
                        print(f"[{slug}] FAILED ({error.status}): {question[:60]}", file=sys.stderr)
                report["sections"] = sections
            prior_path.write_text(json.dumps(report, indent=1) + "\n")
        print(f"Wrote {args.only} for {len(picked)} report(s); /ask calls: {ask_count}")
        return

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
                moments = key_moments(kb, slug)
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
