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
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
import json
import math
import re
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parli.arag import AragConfig, AragError, KbClient, _request, load_dotenv  # noqa: E402

OUT_DIR = Path(__file__).resolve().parent.parent / "portal" / "public" / "reports"

REPORTS: dict[str, dict] = {
    "gambling": {
        "title": "Gambling",
        "blurb": "What parliament says about poker machines, online wagering and gambling reform.",
        "topic": "gambling",
        "subject": "gambling",
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
        "subject": "climate and energy",
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
        "subject": "housing",
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
        "subject": "First Nations",
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
        "subject": "immigration",
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
        "subject": "media ownership",
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

# Every v2 section is a DATE-FILTERED ask, and a filtered ask is a narrow,
# mixed context the platform's default template refuses outright ("Not enough
# data to answer this.") two runs in three — measured on prod and recorded in
# MIGRATION-ARAG.md. The Worker's own askPayload template is the version that
# was fixed against that behaviour, so v2 reuses it verbatim rather than
# re-deriving it: it states the retrieval contract, reserves the refusal for a
# truly empty record, and forbids the "Based on the provided context" opener
# the owner rejected in v1.
WINDOW_SYSTEM = (
    "You are OPAX, a research assistant over the Australian parliamentary record. "
    "You answer strictly from the passages provided, citing them. You never invent facts."
)
WINDOW_PROMPT = (
    "Passages from the record (a speech is the named speaker's own words; first-person "
    "text is theirs). Every passage was delivered in an Australian parliament {period}.\n"
    "{context}\n\n"
    "Question: {question}\n\n"
    "Instructions: Answer from whichever passages address the question, quoting or closely "
    "paraphrasing them. Quotation marks mean the words inside them are copied from a "
    "passage EXACTLY, unbroken and unedited — no tightening, no joining two sentences, no "
    "ellipsis, no bracketed change. If you would have to alter the words at all, paraphrase "
    "them with no quotation marks instead. "
    "Ignore passages that are off-topic; answer from the ones that apply "
    "even if only a few do or they address it only in part. If some passages mention the "
    "subject only briefly, report what they say and note that the record is limited. "
    "Name the speakers and their parties wherever the passages do, and name the parliament "
    "every time it is not the Commonwealth — never \"the same parliament\", since consecutive "
    "passages are usually from different ones. Be exact with figures and never invent one. "
    "Every passage is one member's own words, including what it says about their opponents: "
    "report a characterisation of another party as that member's claim about them, never as "
    "that party's own position and never as established fact. "
    "Begin with the answer itself. Never open with a preamble such as \"Based on the provided "
    "context\", \"According to the passages\" or \"The context shows\": the reader knows the "
    "answer comes from the record. Do not explain how the passages are numbered, ordered or "
    "provided. Write two to four tight paragraphs of plain Markdown — no headings. "
    "Only if NO passage mentions the subject at all, reply exactly: "
    "The record retrieved for this question does not discuss it."
)

REFUSAL = "The record retrieved for this question does not discuss it."

# The window the reports call "now". Everything in `now` is filtered to it, and
# the last era stops the day before so the two never double-count a speech.
NOW_SINCE = "2024-07-01"

ERAS = (
    {"label": "1993–2009", "from": "1993-01-01", "to": "2009-12-31",
     "period": "between 1993 and 2009"},
    {"label": "2010–2019", "from": "2010-01-01", "to": "2019-12-31",
     "period": "between 2010 and 2019"},
    {"label": "2020–2024", "from": "2020-01-01", "to": "2024-06-30",
     "period": "between 2020 and the middle of 2024"},
)

# `/api/tide`'s decades, and its method: a topic's count over the decade's
# labelled speeches. Federal only, for the same reason the endpoint defaults
# there — the state archives start at different dates, so an all-parliament
# share measures the mix of sources as much as the mix of subjects.
TIDE_DECADES = (
    {"decade": "1990s", "label": "1993–99"},
    {"decade": "2000s", "label": "2000s"},
    {"decade": "2010s", "label": "2010s"},
    {"decade": "2020s", "label": "2020–26"},
)

# Paid calls, counted for the budget line at the end of a run.
ASKS: "Counter[str]" = Counter()


def resource_summary(resource: dict) -> dict:
    meta = ((resource.get("extra") or {}).get("metadata")) or {}
    collabs = (resource.get("origin") or {}).get("collaborators") or []
    labels = {
        c.get("labelset"): c.get("label")
        for c in ((resource.get("usermetadata") or {}).get("classifications") or [])
    }
    snippet = ""
    passages: list[str] = []
    for field in (resource.get("fields") or {}).values():
        for para in (field.get("paragraphs") or {}).values():
            text = re.sub(r"\s+", " ", (para.get("text") or "")).strip()
            if not text:
                continue
            passages.append(text)
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
        # The retrieved passages, whole. This is the text the model is shown
        # AND the text a claimed figure is checked against, so the check is
        # over exactly the evidence the model had.
        "passage": " ".join(passages),
    }


def numbered_sources(kb: KbClient, query: str, top_k: int = 24,
                     filter_expression: dict | None = None,
                     chars: int = 900) -> tuple[dict, list[str]]:
    """find() real sources and number them for source-grounded generation.

    `chars` is how much of each source's retrieved passage the model sees. v1
    showed 240 characters, which is enough to name a source but not enough to
    read a figure out of it with its base attached — the reversed-denominator
    tile the reviewer found came from a truncated passage."""
    res = kb.find(query, top_k=top_k, show=["basic", "origin", "extra"],
                  filter_expression=filter_expression)
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
        body = (s["passage"] or s["snippet"])[:chars]
        lines.append(f"[{n}] {s['title']}{f' ({who})' if who else ''} — {body}")
    return srcs, lines


STATS_SCHEMA = {
    "name": "key_figures",
    "description": (
        "Statistics on the topic, taken ONLY from the provided numbered sources. "
        "A statistic is a NUMBER MEASURED AGAINST A STATED BASE: a share, a rate, a "
        "proportion, or a count the source itself sets against a total. A number with "
        "no base stated in the source — a fund's size, a bare year, the name of a rule "
        "— is not a statistic and must not be returned. Every figure must appear "
        "verbatim in its source; never estimate, invent, average or extrapolate. "
        "Return an empty list rather than pad it: fewer verifiable figures are always "
        "better than more."
    ),
    "parameters": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "stats": {
                "type": "array",
                # More candidates than the six a report can show: the support
                # check drops most of what a model offers, and a run that
                # returns exactly six ships two.
                "maxItems": 10,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "value": {"type": "string", "description": "The figure exactly as the source states it, short — e.g. '1 in 5', '34%', '$1.1 billion'. A bare year is not a figure."},
                        "numerator": {"type": "string", "description": "Just the number in the figure, digits as the source writes them — '1', '34', '1.1 billion'. No unit, no currency sign."},
                        "denominator": {"type": "string", "description": "What the number is measured AGAINST, as the source states it: a number with its unit ('5', '19 targets', '2,600 homes') or the named base ('Australia's prison population', 'metropolitan newspaper circulation'). If the source states no base for this number, DO NOT return the figure at all."},
                        "unit": {"type": "string", "description": "The unit of the numerator: 'per cent', 'dollars', 'people', 'homes', 'targets', 'tonnes', 'votes', 'years' …"},
                        "measure": {"type": "string", "description": "What the numerator counts, ten words or fewer, sentence case, INCLUDING the base when the figure is a share — e.g. 'First Nations share of the prison population'. Never reverse the two: say which group is the part and which is the whole, the way the source does."},
                        "jurisdiction": {"type": "string", "description": "The parliament or place the figure describes — 'Australia', 'Victoria', 'New South Wales', 'Queensland', 'South Australia'."},
                        "as_of": {"type": "string", "description": "The year or date the figure describes, as the source gives it: 'YYYY' or 'YYYY-MM-DD'."},
                        "detail": {"type": "string", "description": "One short sentence of context from the source (who said it, when, about what)."},
                        "source_ref": {"type": "integer", "description": "The [n] of the provided source the figure comes from."},
                    },
                    "required": ["value", "numerator", "denominator", "unit", "measure",
                                 "jurisdiction", "as_of", "detail", "source_ref"],
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
    # A structured extraction is the LAST thing a report run does with a dozen
    # paid asks already banked. A transient 429 or 5xx here must cost the
    # block, never the run: retry a few times, then hand back nothing.
    data: dict = {}
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.load(r)
            break
        except Exception as error:  # noqa: BLE001 - any transport failure
            if attempt == 3:
                print(f"  {name} extraction gave up: {str(error)[:120]}", file=sys.stderr)
                return {}
            time.sleep(min(5 * 2 ** attempt, 60))
    calls = (data.get("choices") or [{}])[0].get("message", {}).get("tool_calls") or []
    if not calls:
        return {}
    try:
        return json.loads(calls[0]["function"]["arguments"])
    except (KeyError, json.JSONDecodeError):
        return {}


# ---------------------------------------------------------------------------
# Key figures: a tile survives only if the passage it cites actually carries
# the number AND the base it is measured against, close enough together to be
# the same claim. v1 asked for a value and a free sentence, and the free
# sentence is where a tile can quietly reverse its denominator — "27% of the
# prison population" and "27% of First Nations people" read the same to a
# model and mean opposite things. v2 makes the model hand over the parts, then
# checks the parts against the text.
# ---------------------------------------------------------------------------

_NUMBER = re.compile(r"\d[\d,\.]*")
_SCALE = ("billion", "million", "thousand", "trillion")
_STOPWORDS = {
    "about", "after", "against", "among", "australia", "australian", "australias",
    "because", "before", "being", "between", "during", "every", "first", "other",
    "their", "there", "these", "those", "through", "total", "under", "which",
    "while", "whole", "would", "years",
}


def _fold(text: str) -> str:
    """Lower-case, strip thousands separators, collapse whitespace."""
    return re.sub(r"\s+", " ", re.sub(r"(?<=\d),(?=\d)", "", str(text or "").casefold()))


def _numbers(text: str) -> list[str]:
    """The distinct numeric tokens in a string, comma-free."""
    return [n.rstrip(".") for n in _NUMBER.findall(_fold(text))]


def _content_words(text: str) -> list[str]:
    words = re.findall(r"[a-z]{5,}", _fold(text))
    return [w for w in words if w not in _STOPWORDS]


def _positions(haystack: str, needle: str) -> list[int]:
    out, start = [], 0
    while True:
        index = haystack.find(needle, start)
        if index < 0:
            return out
        out.append(index)
        start = index + 1


def _number_positions(haystack: str, number: str) -> list[int]:
    """Where a number occurs as a number — '27' must not match inside '270'."""
    return [m.start() for m in re.finditer(rf"(?<![\d.]){re.escape(number)}(?![\d])", haystack)]


def stat_support(stat: dict, passage: str) -> str | None:
    """Why this figure fails its passage, or None when the passage carries it.

    The proximity rule is the anti-reversal guard: a number and the base it is
    claimed to be a share of have to occur in the same breath of the record,
    not merely somewhere in the same speech."""
    text = _fold(passage)
    if not text:
        return "no passage"
    numerator = str(stat.get("numerator") or "")
    denominator = str(stat.get("denominator") or "")
    if not denominator.strip():
        return "no denominator"
    # "24,561 students out of ... students" is not a base, it is the unit said
    # twice. A denominator has to add something the numerator does not have.
    unit_words = set(_content_words(stat.get("unit")) or _fold(stat.get("unit")).split())
    denominator_words = set(_content_words(denominator))
    if not _numbers(denominator) and (
            _fold(denominator).strip() == _fold(stat.get("unit")).strip()
            or (denominator_words and denominator_words <= unit_words)):
        return "the denominator only repeats the unit"
    # A total is not a statistic. "$16 billion in revenue contributed to the
    # economy" and "almost 14,000 active businesses" are real numbers truly in
    # the record, and neither is measured against anything: the schema asks for
    # a base and the model hands back the subject again in longer words. A
    # denominator therefore has to be either a share's named base or a total
    # with a number of its own.
    share = ("per cent" in _fold(stat.get("unit"))
             or "%" in str(stat.get("value") or "")
             or "%" in _fold(stat.get("unit")))
    if not share and not _numbers(denominator):
        return "the passage states no total for this number to be measured against"
    numbers = _numbers(numerator)
    if not numbers:
        return "numerator carries no number"
    if _BARE_YEAR.match(numerator.strip()) or _BARE_YEAR.match(str(stat.get("value") or "").strip()):
        return "a bare year is not a figure"
    hits = _number_positions(text, numbers[0])
    if not hits:
        return f"numerator {numbers[0]} not in the passage"
    # A scaled numerator must carry its scale word: "1.1" alone in a passage
    # about 1.1 per cent does not support "$1.1 billion".
    for scale in _SCALE:
        if scale in _fold(numerator) or scale in _fold(stat.get("value")):
            if scale not in text:
                return f"scale word '{scale}' not in the passage"
    anchors: list[int] = []
    for number in _numbers(denominator):
        found = _number_positions(text, number)
        if not found:
            return f"denominator {number} not in the passage"
        anchors.extend(found)
    for word in _content_words(denominator):
        anchors.extend(_positions(text, word))
    if not anchors:
        return "denominator has nothing checkable in the passage"
    if min(abs(a - h) for a in anchors for h in hits) > 240:
        return "the number and its base are not in the same passage of text"
    # A share is the case where reversing the part and the whole is both easy
    # and invisible, so it gets the strict rule: the record has to join this
    # number to THIS base, in one breath, with the word that joins them.
    # ("27 per cent of the national prison population" passes; the same passage
    # does not support "27 per cent of Aboriginal people".)
    if share:
        for hit in hits:
            window = text[max(0, hit - 40):hit + 60]
            if " of " not in window and not window.startswith("of "):
                continue
            if any(a for a in anchors if max(0, hit - 40) <= a < hit + 60):
                return None
        return "the passage does not say this number is a share of that base"
    return None


def compose_stat_label(stat: dict) -> str:
    """The tile's label, built from the fields — never a free sentence.

    A share whose measure does not already name its base gets it appended, so
    a tile can never show a percentage of something it does not name."""
    measure = re.sub(r"\s+", " ", str(stat.get("measure") or "")).strip(" .")
    denominator = re.sub(r"\s+", " ", str(stat.get("denominator") or "")).strip(" .")
    if not measure:
        return ""
    share = "per cent" in _fold(stat.get("unit")) or "%" in str(stat.get("value") or "")
    named = any(word in _fold(measure) for word in _content_words(denominator))
    if share and denominator and not named and not _numbers(denominator):
        measure = f"{measure} as a share of {denominator}"
    return measure[0].upper() + measure[1:]


# A figure said in a state parliament is a figure about that state, unless the
# record says otherwise. The model does not see which chamber it is reading and
# writes "Australia" by default, which turns a Victorian question about
# Victorian social housing into a national statistic.
_NATIONAL_MARKERS = re.compile(
    r"\b(?:australia|australian|australia's|national|nationally|nationwide|"
    r"commonwealth|federal|the country)\b", re.I)
_NATIONAL_JURISDICTIONS = {"australia", "national", "commonwealth", "nationwide", ""}


def settle_jurisdiction(stat: dict, source: dict, passage: str) -> str:
    """The jurisdiction the tile should carry, given who was speaking."""
    claimed = str(stat.get("jurisdiction") or "").strip()
    state = str(source.get("state") or "").strip().casefold()
    if claimed.casefold() not in _NATIONAL_JURISDICTIONS:
        return claimed                       # the model named a place; trust it
    if state in ("", "federal"):
        return claimed or "Australia"
    if _NATIONAL_MARKERS.search(passage or ""):
        return claimed or "Australia"        # a state member quoting a national figure
    return PARLIAMENT_NAMES.get(state, state.upper())


def gen_key_stats(kb: KbClient, title: str, srcs: dict, lines: list[str],
                  report: dict | None = None) -> tuple[list[dict], list[dict]]:
    """Returns (kept, dropped). Dropped rows carry the reason, for the report."""
    if not lines:
        return [], []
    query = (
        f'Extract the statistics a reader needs on "{title}" in Australian politics. '
        "Below are real numbered sources from the parliamentary record, each printed with "
        "the passage it was retrieved on. Report ONLY figures that appear in those passages, "
        "exactly as stated, and ONLY where the passage also states what the figure is measured "
        "against. Give the numerator, that base as the denominator, and the unit, and set "
        "source_ref to the number of the source. Never reverse the part and the whole. A number "
        "the passage sets against nothing — a total spent, a headcount, a fund's size — is not "
        "wanted however striking it is. If the passages contain no such figures, return an "
        "empty list."
        "\n\nSOURCES:\n" + "\n".join(lines)
    )
    stats = (openrouter_tool_call(STATS_SCHEMA, query)).get("stats") or []
    ASKS["key_stats"] += 1
    seen: set[str] = set()
    kept: list[dict] = []
    dropped: list[dict] = []

    def drop(stat: dict, reason: str) -> None:
        dropped.append({
            "value": (stat.get("value") or "").strip(),
            "measure": (stat.get("measure") or "").strip(),
            "reason": reason,
        })

    for stat in stats:
        ref = stat.get("source_ref")
        value = (stat.get("value") or "").strip()
        if ref not in srcs or not value:
            drop(stat, "does not trace to a provided source")
            continue
        source = srcs[ref]
        reason = stat_support(stat, source.get("passage") or source.get("snippet") or "")
        if reason:
            drop(stat, reason)
            continue
        label = compose_stat_label(stat)
        if not label:
            drop(stat, "no measure to label the tile with")
            continue
        key = _fold(f"{value}|{label}")
        if key in seen:
            drop(stat, "duplicate of a figure already kept")
            continue
        seen.add(key)
        kept.append({
            "value": value,
            "label": label,
            "numerator": str(stat.get("numerator") or "").strip(),
            "denominator": str(stat.get("denominator") or "").strip(),
            "unit": str(stat.get("unit") or "").strip(),
            "jurisdiction": settle_jurisdiction(
                stat, source, source.get("passage") or source.get("snippet") or ""),
            "as_of": str(stat.get("as_of") or "").strip(),
            "detail": str(stat.get("detail") or "").strip(),
            "slug": source["slug"],
            "source_title": source["title"],
        })
    return kept[:6], dropped


def gen_positions(kb: KbClient, title: str, srcs: dict, lines: list[str],
                  window: str = "now") -> list[dict]:
    """Where the parties stand. v2 draws only on the `now` window, so a party
    is never shown holding a position it has since abandoned."""
    if not lines:
        return []
    query = (
        f'Where does each party stand on "{title}"? Below are real numbered sources from the '
        "Australian parliamentary record, each tagged with its speaker and party. Report a "
        "position for a party ONLY when one of the sources shows a parliamentarian of that "
        "party taking it, and set source_ref to that source's number. A question put to a "
        "minister is the questioner's position, never the minister's. One entry per party. "
        "Return an empty list rather than infer.\n\nSOURCES:\n" + "\n".join(lines)
    )
    positions = (openrouter_tool_call(POSITIONS_SCHEMA, query)).get("positions") or []
    ASKS["positions"] += 1
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
            "window": window,
        })
    return out[:6]


LEDE_SCHEMA = {
    "name": "lede",
    "description": (
        "A short opening for a report on the Australian parliamentary record, in exactly "
        "three paragraphs, written ONLY from the findings, eras, figures and positions "
        "supplied below — no outside knowledge, nothing invented."
    ),
    "parameters": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "now_paragraph": {
                "type": "string",
                "description": (
                    "STRICT MAXIMUM 55 WORDS — count them. What parliament is arguing "
                    "about NOW: name the largest debates below and give the main lines of "
                    "argument across the NOW findings — who wants what, and the sharpest "
                    "disagreement. PAST TENSE ONLY: 'argued', 'said', 'proposed', never "
                    "'is arguing' or 'is debating'. No preamble: begin directly with the "
                    "substance. Two or three sentences, not more."
                ),
            },
            "arc_paragraph": {
                "type": "string",
                "description": (
                    "STRICT MAXIMUM 55 WORDS — count them. How the argument has moved "
                    "since 1993: one SHORT sentence for each era given, in order, ending "
                    "with the direction the tide of attention shows. Past tense throughout."
                ),
            },
            "figures_paragraph": {
                "type": "string",
                "description": (
                    "STRICT MAXIMUM 55 WORDS — count them. The two or three strongest key "
                    "figures, each with the base it is measured against, and each party's "
                    "CURRENT position in one SHORT clause. Present tense for the parties' "
                    "positions."
                ),
            },
        },
        "required": ["now_paragraph", "arc_paragraph", "figures_paragraph"],
    },
}


def _plain(text: str) -> str:
    """Fold to letters, digits and single spaces, so a curly quote or an OCR
    double space cannot fail a match that a reader would call identical."""
    return re.sub(r"[^a-z0-9 ]+", " ", re.sub(r"\s+", " ", str(text or "").casefold())).strip()


def raw_source_text(kb: KbClient, slug: str, cache: dict) -> str:
    """The speech behind a source, as it reads, fetched once. Free."""
    if slug in cache:
        return cache[slug]
    body = ""
    try:
        resource = kb.get_resource_by_slug(slug, show="basic&show=values")
        for name, field in (((resource.get("data") or {}).get("texts")) or {}).items():
            if name.startswith("da-"):        # the generated summary, not the record
                continue
            body += " " + ((field.get("value") or {}).get("body") or "")
    except AragError:
        body = ""
    cache[slug] = re.sub(r"\s+", " ", body).strip()
    return cache[slug]


def tide_direction(tide_rows: list[dict]) -> str:
    """A plain-language line on how a topic's share of the federal record has
    moved by decade — computed here, not asked for, because it is arithmetic
    the pipeline already holds and a model restating a share as a fresh
    sentence is exactly the kind of drift a report should not introduce."""
    rows = [r for r in (tide_rows or []) if r.get("decade")]
    if len(rows) < 2:
        return ""
    shares = [(r["decade"], float(r.get("share") or 0.0)) for r in rows]
    parts = ", ".join(f"{decade} {share * 100:.1f}%" for decade, share in shares)
    first, last = shares[0][1], shares[-1][1]
    if last > first * 1.1:
        direction = "risen"
    elif last < first * 0.9:
        direction = "fallen"
    else:
        direction = "stayed roughly level"
    return (f"TIDE — share of the labelled federal record on this topic, by decade: "
            f"{parts}. Attention has {direction}.")


LEDE_PARAGRAPH_WORDS = 60   # 3 paragraphs x 60 words = the owner's 180-word ceiling
# A boundary allows closing quotes/brackets after the punctuation before the
# whitespace it looks for — a quoted claim inside the lede ends '"decrease
# supply."' (period THEN closing quote), and without this a period like that
# never counts as a boundary at all, mirroring `_SENTENCE_END` elsewhere.
_CLAUSE_END = re.compile(r"[.!?;][\"'’”)\]]*(?=\s|$)")
_SOFT_BREAK = re.compile(r"[.!?;,][\"'’”)\]]*(?=\s|$)")
_END_PUNCT = re.compile(r"([.!?;,])([\"'’”)\]]*)$")


def _fit_spans(text: str, boundary: "re.Pattern[str]", limit: int) -> str:
    """The longest prefix of `text`, cut only at a `boundary` match, that does
    not exceed `limit` words — or "" if not even the first piece fits."""
    spans: list[tuple[int, int]] = []
    start = 0
    for match in boundary.finditer(text):
        spans.append((start, match.end()))
        start = match.end()
    if text[start:].strip():
        spans.append((start, len(text)))
    kept, count = "", 0
    for piece_start, piece_end in spans:
        words = len(text[piece_start:piece_end].split())
        if count + words > limit:
            break
        kept, count = text[:piece_end].strip(), count + words
    return kept


def _close_sentence(kept: str) -> str:
    """Swap a trailing `;` or `,` for a full stop, keeping any closing quote
    or bracket that followed it. A real `.!?` is left exactly as it is."""
    match = _END_PUNCT.search(kept)
    if match and match.group(1) in ";,":
        return kept[:match.start(1)] + "." + match.group(2)
    return kept


def cap_paragraph_words(text: str, limit: int = LEDE_PARAGRAPH_WORDS) -> str:
    """Trim to the last full sentence, clause or (failing that) comma-phrase
    at or under the word limit.

    The owner asked for a lede of about 120 to 180 words, and a model's own
    word count is not reliable enough to hit that on instructions alone — both
    exemplars came back at 265 and 303 words on the first try despite an
    explicit per-paragraph target in the prompt and the schema. This is the
    mechanical backstop, in the same spirit as `tide_direction()`: never trust
    the model for arithmetic a script can just do.

    Three tiers, each tried only when the one before it found nothing that
    fit: `.!?;` boundaries first; failing that — the paragraph's very first
    sentence alone is already over budget — `,` as well, so a 58-word opening
    sentence still yields a clean phrase instead of nothing; only when not
    even the first comma-phrase fits does it fall back to a hard word cut."""
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(text.split()) <= limit:
        return text
    for boundary in (_CLAUSE_END, _SOFT_BREAK):
        kept = _fit_spans(text, boundary, limit)
        if kept:
            return _close_sentence(kept)
    return " ".join(text.split()[:limit]).rstrip(",;:") + "."


def lede_sources(sections: list[dict], eras: list[dict], cap: int = 12) -> list[dict]:
    """The union of the `now` sections' and eras' own CITED sources, capped.

    The lede's citation list therefore points only at records the report
    actually went to, not at a fresh retrieval — the same sources a reader has
    already seen argued from, gathered in one place. Each already carries the
    passage its own section or era found for it."""
    seen: dict[str, dict] = {}
    for block in list(sections) + list(eras):
        for source in block.get("sources") or []:
            slug = source.get("slug")
            if not slug or not source.get("cited") or slug in seen or len(seen) >= cap:
                continue
            seen[slug] = {
                **{k: source.get(k) for k in
                   ("slug", "title", "speaker", "party", "state", "date", "passage")},
                "cited": True,
            }
    return list(seen.values())


def gen_lede(kb: KbClient, title: str, now: dict, over_time: dict,
            key_stats: list[dict] | None = None, positions: list[dict] | None = None) -> dict:
    """A ~150-word, three-paragraph opening built over the WHOLE report.

    The first version shipped three sentences, each a different speech's own
    summary — read together they were not an opening for the report, they
    were three unrelated quotations (the owner: "does this feel like an
    appropriate opening for the whole first nations report?", "we need a
    summary of the ENTIRE picture, not just a tiny bit"). This version reads
    every block the report already built — the `now` sections' own answers,
    the era answers, the kept key stats, the tide and the party positions —
    and asks for three short paragraphs over that material and nothing else:
    what parliament argues about now, how the argument has moved since 1993,
    and where the figures and the parties stand today.

    The lede no longer settles its own citations sentence by sentence. Its
    source list is the union of the `now` sections' and eras' own CITED
    sources (`lede_sources()`), capped at 12; its markers come from the same
    free, verbatim pass every other answer earns them from (`anchor_block()`,
    run by `cite_report()`) — a sentence that quotes the record verbatim earns
    a marker, a synthesised sentence does not, and that is correct: a
    three-paragraph summary of a dozen asks is mostly paraphrase, and a report
    should never claim a source for words that source did not supply."""
    sections = now.get("sections") or []
    eras = over_time.get("eras") or []
    srcs = lede_sources(sections, eras)
    if not srcs:
        return {}

    findings = "\n\n".join(
        f"NOW — {s['question']}\n{s['answer']}" for s in sections if s.get("answer"))
    era_findings = "\n\n".join(
        f"ERA {e.get('label')} ({e.get('from')} to {e.get('to')}) — {e.get('question')}\n"
        f"{e.get('answer')}"
        for e in eras if e.get("answer"))
    debates = "\n".join(
        f"- {d['title']} ({d['count']} speeches, {d['first']} to {d['last']})"
        for d in sorted(now.get("discovered") or [], key=lambda d: -(d.get("count") or 0))[:5])
    tide_line = tide_direction(over_time.get("tide") or [])
    stats_lines = "\n".join(
        f"- {s['value']} — {s['label']} ({s.get('jurisdiction', '')}, {s.get('as_of', '')})"
        for s in (key_stats or [])[:3]) or "(no verified figures to draw on)"
    position_lines = "\n".join(
        f"- {p['party']}: {p['position']}" for p in (positions or [])
    ) or "(no confirmed party positions to draw on)"

    query = (
        f'Open a report on "{title}" in the Australian parliament. Use ONLY the material '
        "below — the report's own findings, nothing outside it. Write exactly three short "
        "paragraphs, in this order: (1) what parliament is arguing about now, naming the "
        "largest debates and the main lines of argument in the NOW findings — who wants "
        "what, and the sharpest disagreement; (2) how the argument has moved since 1993, "
        "one short sentence per era, ending with the direction the tide of attention shows; "
        "(3) the strongest figures, each with its base, and where each party currently "
        "stands, one short clause each. PAST TENSE for paragraphs 1 and 2 — what was argued, "
        "said and proposed, never 'is arguing' or 'is debating' — and PRESENT TENSE only for "
        "the parties' positions in paragraph 3. THE WHOLE OPENING MUST BE 120 TO 180 WORDS TOTAL — "
        "55 WORDS OR FEWER IN EACH PARAGRAPH. Write tightly: a plain clause beats a long "
        "one, and a detail that will not fit is a detail to cut, not a reason to run long. "
        "Do not open with any preamble, and never write 'this report', 'based on', 'the "
        "record shows' or any other description of the report or its sources — begin "
        "directly with what parliament is doing. Quote a source's exact words, in quotation "
        "marks, only where a finding below already does; never invent a quotation.\n\n"
        f"DEBATES NOW BEFORE PARLIAMENT:\n{debates}\n\n{findings}\n\n{era_findings}\n\n"
        f"{tide_line}\n\nKEY FIGURES:\n{stats_lines}\n\nPARTY POSITIONS:\n{position_lines}"
    )
    result = openrouter_tool_call(LEDE_SCHEMA, query)
    ASKS["lede"] += 1
    paragraphs = [
        cap_paragraph_words(re.sub(r"\s+", " ", str(result.get(key) or "")).strip())
        for key in ("now_paragraph", "arc_paragraph", "figures_paragraph")
    ]
    if not any(paragraphs):
        return {}
    return {"text": "\n\n".join(p for p in paragraphs if p), "sources": srcs}


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


# ---------------------------------------------------------------------------
# v2: discovery. The live debates are FOUND in the record, never guessed, so a
# report cannot go quietly stale while parliament argues about something its
# author never thought to ask about.
#
# The enumeration runs over /catalog, not /find: /catalog returns every
# resource carrying the topic label, /find returns at most the 200 best
# matches for a query. The cost is one catalog page per 200 rows (about a
# second each, ~90 pages for the largest topic) and nothing else — retrieval
# is free.
#
# PLATFORM QUIRK, verified live 2026-09-05: /catalog's `created` prop is INDEX
# time, so a catalog date window selects by when the speech was loaded, not by
# when it was spoken (the whole corpus was indexed over three days in September
# 2026). /find and /ask read the same prop as origin.created, the speech date.
# Discovery therefore takes its dates from each row's own extra.metadata.date
# and windows client-side; the ASKS use `created` since/until, where it means
# what it says.
# ---------------------------------------------------------------------------

ROWS_CACHE = Path(__file__).resolve().parent / "state" / "reports"

# Recurring House and chamber furniture. These are real titles carrying real
# topic labels, and they are the single largest source of noise in discovery:
# a report that asked "what has parliament said about Statements by Members?"
# would be asking about the shape of the day, not the subject.
# Compared after normalise_debate(), so punctuation is already gone
# ("Governor-General's Speech" folds to "governorgenerals speech").
_PROCEDURAL_DEBATES = {
    "addressinreply", "address in reply", "adjournment", "adjournment debate",
    "answers", "answers to questions", "appropriation bill", "bills", "budget",
    "budget reply", "business", "business of the house", "committee",
    "committees", "condolences", "condolence motions", "constituency statements",
    "documents", "first speech", "government performance",
    "governorgenerals speech", "grievance debate", "maiden speech",
    "matters of public importance", "matters of public interest",
    "matters of urgency", "members statements", "ministerial statement",
    "ministerial statements", "ministers statements", "motion", "motions",
    "motions by leave", "notices", "order of business", "papers",
    "personal explanations", "petitions", "petitions received",
    "points of order",
    "private members business", "procedural motions", "program", "questions",
    "questions on notice", "questions without notice", "sessional orders",
    "standing and sessional orders", "standing orders", "statements",
    "statements by members", "statements by senators",
    "suspension of standing orders", "tabling of documents",
    "take note of answers", "valedictory", "votes and proceedings",
}
_PROCEDURAL_PREFIXES = (
    "constituency statements", "matters of public", "members statements",
    "members' statements", "ministerial statements", "ministers statements",
    "minister's statements", "ninety second statements", "questions without notice",
    "statements by", "take note of", "three minute constituency",
)
# Titles that are a chamber's own geography, not a subject: Victorian members'
# statements file under the speaker's upper-house region.
_HEADING_SUFFIXES = (" region", " electorate")
# The archival OCR leaves split words behind ("Appr Opr Iation (Parl Iament) B
# Ill"). A stranded capital letter standing as its own word is the reliable
# tell, and no real debate title contains one.
_OCR_SPLIT = re.compile(r"(?<![\w'’])[B-HJ-Z](?![\w'’])")
_READING_SUFFIX = re.compile(
    r"\s*[-—:]\s*(?:second|third|first)\s+reading\s*$", re.I)


def normalise_debate(title: str) -> str:
    """Fold a debate title for comparison: case, spacing and punctuation."""
    return re.sub(r"[^a-z0-9 ]+", "", re.sub(r"\s+", " ", str(title or "")).casefold()).strip()


def is_procedural_debate(title: str) -> bool:
    """True for chamber furniture, geography headings and OCR wreckage."""
    compact = re.sub(r"\s+", " ", str(title or "")).strip(" .:-—")
    folded = normalise_debate(compact)
    if not folded or folded in _PROCEDURAL_DEBATES:
        return True
    if any(folded.startswith(prefix) for prefix in _PROCEDURAL_PREFIXES):
        return True
    if any(folded.endswith(suffix.strip()) for suffix in (s.strip() for s in _HEADING_SUFFIXES)):
        return True
    if _OCR_SPLIT.search(compact):
        return True
    return len(compact) < 4 or len(compact) > 160


def debate_subject(title: str) -> str:
    """The debate's subject: its title without the reading-stage suffix."""
    return re.sub(r"\s+", " ", _READING_SUFFIX.sub("", str(title or ""))).strip(" .,;:—-")


_NAMED_INSTRUMENT = re.compile(
    r"\b(?:Bill|Act|Amendment|Scheme|Fund|Commission|Inquiry)\b")


def carries_subject(title: str, cfg: dict) -> bool:
    """True when the heading already says what the report is about."""
    folded = _fold(title)
    terms = [t.casefold() for t in cfg.get("relevance_terms", ())]
    terms.append(str(cfg.get("subject") or cfg["title"]).casefold())
    return any(term in folded for term in terms if term)


def debate_question(title: str, cfg: dict | None = None) -> str:
    """A discovered debate, asked in plain words.

    A chamber heading is only as specific as the chamber needed it to be.
    'Energy policy' is a real 42-speech group inside the housing label, and
    asked as it stands it returns an answer about electricity prices in a
    housing report. A heading that names no instrument and carries none of the
    report's own words is therefore anchored to the report's subject, which is
    the frame the reader is reading it in anyway. A bill names itself."""
    subject = debate_subject(title)
    named = _NAMED_INSTRUMENT.search(subject)
    if named and not re.match(r"(?i)^(?:the|a|an)\b", subject):
        subject = f"the {subject}"
    if cfg and not named and not carries_subject(subject, cfg):
        anchor = str(cfg.get("subject") or cfg["title"])
        return f"What has parliament said about {subject} and {anchor}?"
    return f"What has parliament said about {subject}?"


def is_topic_echo(title: str, cfg: dict) -> bool:
    """True when the debate title only repeats the report's own subject.

    'Housing' is genuinely the largest heading in the housing record, so it
    belongs in `discovered`; asking 'What has parliament said about housing?'
    is the report's own curated question with the serial numbers filed off."""
    words = [w for w in normalise_debate(title).split() if w]
    if not words or len(words) > 3:
        return False
    terms = {t.casefold() for t in cfg.get("relevance_terms", ())}
    terms.add(cfg["title"].casefold())
    return all(any(w in term or term in w for term in terms) for w in words)


def catalog_rows(kb: KbClient, topic: str, refresh: bool = False) -> list[dict]:
    """Every labelled speech on a topic, with its speech date, speaker and party.

    Cached on disk: one enumeration serves discovery for `now`, all three eras
    and the voices tally, and a `--only` rerun should not pay for it again."""
    ROWS_CACHE.mkdir(parents=True, exist_ok=True)
    path = ROWS_CACHE / f"rows-{topic}.json"
    if path.exists() and not refresh:
        cached = json.loads(path.read_text())
        return cached["rows"]
    clauses = [
        {"prop": "label", "labelset": "kind", "label": "speech"},
        {"prop": "label", "labelset": "topic", "label": topic},
    ]
    rows: list[dict] = []
    page = 0
    while True:
        result = _request("POST", kb._rag("/catalog"), kb._headers, {
            "filter_expression": {"resource": {"and": clauses}},
            "page_size": 200,
            "page_number": page,
            "show": ["basic", "origin", "extra"],
            "sort": {"field": "created", "order": "asc"},
        })
        resources = result.get("resources") or {}
        for resource in resources.values():
            meta = ((resource.get("extra") or {}).get("metadata")) or {}
            collabs = (resource.get("origin") or {}).get("collaborators") or []
            labels = {
                c.get("labelset"): c.get("label")
                for c in ((resource.get("usermetadata") or {}).get("classifications") or [])
            }
            slug = resource.get("slug") or ""
            if not slug or slug.startswith("da-"):
                continue
            rows.append({
                "slug": slug,
                "title": resource.get("title"),
                "date": str(meta.get("date") or "")[:10],
                "speaker": collabs[0] if collabs else None,
                "party": labels.get("party"),
                "state": labels.get("state"),
            })
        if not (result.get("fulltext") or {}).get("next_page") or not resources:
            break
        page += 1
    path.write_text(json.dumps({
        "topic": topic,
        "enumerated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rows": rows,
    }))
    return rows


def in_window(rows: list[dict], since: str, until: str | None = None) -> list[dict]:
    return [
        r for r in rows
        if r["date"] and r["date"] >= since and (not until or r["date"] <= until)
    ]


def discover_debates(rows: list[dict], cfg: dict, since: str, until: str | None,
                     limit: int = 8, min_count: int = 3) -> list[dict]:
    """The largest real debates in a window, grouped by debate title."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in in_window(rows, since, until):
        title = debate_title(row["title"], row["speaker"], row["date"])
        if not title or is_hollow_title(title) or is_procedural_debate(title):
            continue
        groups[title].append(row)
    ranked = sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    out = []
    for title, members in ranked:
        if len(members) < min_count:
            break
        dates = sorted(m["date"] for m in members)
        parliaments = sorted({
            PARLIAMENT_NAMES.get(str(m.get("state") or ""), str(m.get("state") or "").upper())
            for m in members if m.get("state")
        })
        out.append({
            "title": title,
            "count": len(members),
            "first": dates[0],
            "last": dates[-1],
            "parliaments": parliaments,
            "search": search_link(debate_subject(title), cfg["topic"], dates[0], dates[-1]),
        })
        if len(out) >= limit:
            break
    return out


def search_link(query: str, topic: str, first: str, last: str) -> str:
    """A portal search that reproduces the discovered debate.

    The Worker's filterExpression only accepts YEARS for from/to, so the link
    carries years even though discovery works to the day."""
    params = {"q": query, "topic": topic, "from": first[:4], "to": last[:4]}
    return "/search?" + "&".join(
        f"{k}={urllib.parse.quote_plus(v)}" for k, v in params.items() if v)


# Words that carry no subject, so two titles that differ only in these are the
# same debate to a retriever.
_TITLE_STOPWORDS = frozenset({
    "a", "an", "and", "of", "on", "the", "to", "for", "no", "nos", "second",
    "reading", "bill", "bills", "act", "amendment", "amendments",
})


def _subject_tokens(title: str) -> set[str]:
    return {w for w in normalise_debate(debate_subject(title)).split()
            if w and w not in _TITLE_STOPWORDS}


def dedupe_subjects(titles: list[str], floor: int = 3) -> list[str]:
    """Drop a title whose subject words are all inside a bigger debate's.

    The NSW record since mid-2024 holds both 'Environmental Planning and
    Assessment Amendment Bill 2025' (43 speeches) and 'Environmental Planning
    and Assessment Amendment (Planning System Reforms) Bill 2025' (66). Whether
    or not they are two bills, one question retrieves the other's passages and
    the report prints the same answer twice.

    Titles arrive largest first, so the bigger debate keeps its question. A
    short title is never folded into a long one — 'Treaty' sits inside
    'Statewide Treaty Bill 2025' and is its own standing debate — which is what
    `floor` is for."""
    kept: list[str] = []
    kept_tokens: list[set[str]] = []
    for title in titles:
        tokens = _subject_tokens(title)
        if len(tokens) >= floor and any(tokens <= seen for seen in kept_tokens):
            continue
        kept.append(title)
        kept_tokens.append(tokens)
    return kept


def window_questions(cfg: dict, discovered: list[dict], limit: int = 8) -> list[str]:
    """Discovery seeds the questions; the report's curated spine keeps its place.

    Discovered debates lead — the owner's brief is that the report follows the
    live argument — but a report whose eight largest debates are all one state's
    bills would otherwise lose every question that gives it its identity, so the
    curated questions are guaranteed their slots in the middle."""
    titles = [d["title"] for d in discovered if not is_topic_echo(d["title"], cfg)]
    found = [debate_question(t, cfg) for t in dedupe_subjects(titles)]
    curated = [period_question(q) for q in cfg["questions"]]
    lead = max(0, limit - len(curated))
    ordered = found[:min(5, lead)] + curated + found[min(5, lead):]
    seen: set[str] = set()
    out = []
    for question in ordered:
        key = normalise_debate(question)
        if key in seen:
            continue
        seen.add(key)
        out.append(question)
        if len(out) >= limit:
            break
    return out


def period_question(question: str, period: str = "since July 2024") -> str:
    """Put the window in the question so the answer is explicitly about it."""
    if re.search(r"\b(?:since|between|during|in the (?:19|20)\d0s)\b", question, re.I):
        return question
    return re.sub(r"\?\s*$", f" {period}?", question.strip())


def era_question(cfg: dict, era: dict, discovered: list[dict]) -> str:
    """One question per era, named after the era's own biggest debates."""
    # A compound bill title runs to 140 characters and misdirects retrieval as
    # much as it informs it; a truncated one names a bill that does not exist.
    # Long titles are simply left out of the list.
    titles = dedupe_subjects(
        [d["title"] for d in discovered if not is_topic_echo(d["title"], cfg)])
    subjects = [s for s in (debate_subject(t) for t in titles) if len(s) <= 80][:3]
    # The report's subject, spelled the way a reader spells it: "First Nations",
    # not the lowercased title.
    stem = (f"How did parliament argue about {cfg.get('subject') or cfg['title'].lower()} "
            f"{era['period']}?")
    if not subjects:
        return stem
    listed = subjects[0] if len(subjects) == 1 else (
        ", ".join(subjects[:-1]) + " and " + subjects[-1])
    return f"{stem} The debates of the period included {listed}."


def window_clauses(topic: str, since: str | None, until: str | None) -> dict:
    """The /find and /ask filter for a topic inside a date window.

    `created` is the speech date on this path. The two not-clauses mirror the
    Worker's: a title field holds only 'Name — date' and matches as retrieval
    noise, and da-summary-t-body is a model's own paraphrase, which must never
    come back as a source for a model to read."""
    clauses: list[dict] = [
        {"prop": "label", "labelset": "kind", "label": "speech"},
        {"prop": "label", "labelset": "topic", "label": topic},
    ]
    if since or until:
        clauses.append({
            "prop": "created",
            **({"since": f"{since}T00:00:00Z"} if since else {}),
            **({"until": f"{until}T23:59:59Z"} if until else {}),
        })
    clauses.append({"not": {"prop": "field", "type": "generic"}})
    clauses.append({"not": {"prop": "field", "type": "text", "name": "da-summary-t-body"}})
    return {"field": {"and": clauses}}


# --- passages and citation markers -------------------------------------------
# Two things every answer owes its reader: the passage behind each source, and
# a superscript in the line of the prose that says WHICH source a claim came
# from. The portal's ask page gets both from the platform — the citations map
# is `paragraph id -> [[start, end], …]` into the answer text, and app.js turns
# those spans into numbered <sup> buttons against the source list. Reports are
# generated once and read forever, so they carry the same two things in the
# file: `sources[].passage` and `sources[].answer_ranges`.
#
# A report that was generated before this existed cannot be re-asked for its
# ranges without paying for the answer again, so there is a second, free way to
# earn a marker: the words. An answer sentence that quotes the record verbatim
# names its own source — if the quoted phrase is in exactly one of the
# section's records, that record is where those words were said. Nothing is
# ever guessed: a sentence that quotes nothing, or quotes something two records
# share, gets no marker at all.

PASSAGE_CHARS = 400
QUOTE_MIN_WORDS = 3      # "will decrease supply" is checkable; "the plan" is not
RUN_MIN_WORDS = 7        # an unquoted sentence must share a long verbatim run
_ANSWER_QUOTE = re.compile(r"[\"“]([^\"“”]{12,400})[\"”]")
_SENTENCE_END = re.compile(r"[.!?][\"”’')\]]*(?=\s|$)|\n+")


def dedupe_ranges(ranges: list[list[int]]) -> list[list[int]]:
    """Sorted, without repeats. Two citations of the same span mark it once."""
    return [list(span) for span in sorted({(int(a), int(b)) for a, b in ranges})]


class Records:
    """Speech text, read once and shared across every block that cites it.

    Raw for a passage a reader will see, folded for a match a reader would
    call identical. Reading the record is free, so the only cost is time, and
    prefetch() spends it in parallel."""

    def __init__(self, kb: KbClient):
        self.kb = kb
        self._raw: dict[str, str] = {}
        self._folded: dict[str, str] = {}

    def raw(self, slug: str) -> str:
        return raw_source_text(self.kb, slug, self._raw)

    def folded(self, slug: str) -> str:
        if slug not in self._folded:
            self._folded[slug] = _plain(self.raw(slug))
        return self._folded[slug]

    def prefetch(self, slugs: list[str]) -> None:
        wanted = [s for s in dict.fromkeys(slugs) if s and s not in self._raw]
        if not wanted:
            return
        with ThreadPoolExecutor(max_workers=8) as pool:
            for slug, text in zip(wanted, pool.map(
                    lambda s: raw_source_text(self.kb, s, {}), wanted)):
                self._raw[slug] = text


def _loose(needle: str) -> "re.Pattern[str]":
    """A pattern matching this phrase across any punctuation or line breaks.

    The record is OCR'd Hansard: it doubles spaces, breaks lines mid-sentence
    and writes '11:43 :47'. A quotation a reader would call identical must
    still match, so only the letters and digits are anchored."""
    words = [w for w in re.split(r"[^A-Za-z0-9]+", needle) if w]
    return re.compile(r"[^A-Za-z0-9]+".join(re.escape(w) for w in words), re.I)


def trim_passage(text: str, around: str = "", limit: int = PASSAGE_CHARS) -> str:
    """A quotable passage: the words the answer leaned on, in one paragraph.

    With a quotation to centre on, the window opens at the sentence that
    carries it, so the reader sees the quote in its own context rather than the
    paragraph's opening throat-clearing."""
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(text) <= limit:
        return text
    start = 0
    if around:
        found = _loose(around).search(text)
        if found:
            head = text.rfind(". ", 0, found.start())
            start = head + 2 if head != -1 and found.start() - head < limit else found.start()
            start = max(0, min(start, len(text) - limit))
    end = start + limit
    if end < len(text):                       # never cut a word in half
        space = text.rfind(" ", start, end)
        end = space if space > start else end
    return ("…" if start else "") + text[start:end].strip() + ("…" if end < len(text) else "")


def masked_for_sentences(text: str) -> str:
    """The text with sentence-enders inside quotation marks hidden.

    A quoted passage runs to several sentences, and a marker belongs after the
    quotation, not inside it."""
    chars = list(text)
    for match in _ANSWER_QUOTE.finditer(text):
        start, end = match.start(1), match.end(1)
        # The quotation's OWN last full stop still ends the sentence that
        # carries it — the marker belongs after the closing quotation mark,
        # not swallowed into whatever follows.
        last = end - 1
        while last > start and chars[last].isspace():
            last -= 1
        for i in range(start, end):
            if chars[i] in ".!?\n" and i != last:
                chars[i] = "·"
    return "".join(chars)


def sentence_spans(text: str) -> list[tuple[int, int]]:
    """Every sentence of an answer as a [start, end) span of the answer text."""
    masked = masked_for_sentences(text)
    spans: list[tuple[int, int]] = []
    start = 0
    for match in _SENTENCE_END.finditer(masked):
        end = match.end()
        if text[start:end].strip():
            spans.append((start, end))
        start = end
    if text[start:].strip():
        spans.append((start, len(text)))
    return spans


def longest_verbatim_run(sentence: str, body: str) -> int:
    """How many consecutive words of this sentence appear verbatim in the record.

    `body` is already folded by _plain() and padded with spaces, so a run only
    matches on whole words."""
    tokens = _plain(sentence).split()
    best = 0
    for i in range(len(tokens)):
        if best >= len(tokens) - i:
            break
        j = i + best + 1
        while j <= len(tokens) and f" {' '.join(tokens[i:j])} " in body:
            best, j = j - i, j + 1
    return best


def anchor_block(records: Records, block: dict, key: str = "answer",
                 mark: bool = True) -> dict[str, dict[str, str]]:
    """Mark up an answer from the words themselves. Free: no ask, no guess.

    Returns the quotation that earned each source its marker, which is also the
    passage that source should show. A sentence is attributed only when the
    evidence is verbatim AND unambiguous: exactly one of the block's records
    holds it."""
    text = str(block.get(key) or "")
    sources = block.get("sources") or []
    if not text or not sources:
        return {}
    # Every retrieved record is a candidate, not just the ones the platform
    # cited: a quotation verbatim in a retrieved record is proof of where the
    # words were said whatever the citation map says. Ambiguity is broken
    # towards the cited records, and only towards a single one of them.
    records.prefetch([s.get("slug") or "" for s in sources])
    folded = {s["slug"]: f" {records.folded(s['slug'])} " for s in sources if s.get("slug")}
    folded = {slug: body for slug, body in folded.items() if body.strip()}
    flagged = {s["slug"] for s in sources if s.get("cited")}

    def settle(holders: list[str]) -> str:
        if len(holders) == 1:
            return holders[0]
        narrowed = [slug for slug in holders if slug in flagged]
        return narrowed[0] if len(narrowed) == 1 else ""

    marks: dict[str, list[list[int]]] = defaultdict(list)
    quotes: dict[str, dict[str, str]] = defaultdict(lambda: {"quote": "", "text": ""})

    def evidence(slug: str, sentence: str, quote: str = "") -> None:
        if quote and not quotes[slug]["quote"]:
            quotes[slug]["quote"] = quote
        quotes[slug]["text"] = (quotes[slug]["text"] + " " + sentence).strip()

    for start, end in sentence_spans(text):
        sentence = text[start:end]
        found = [q for q in _ANSWER_QUOTE.findall(sentence)
                 if len(q.split()) >= QUOTE_MIN_WORDS]
        for quote in found:
            holder = settle([slug for slug, body in folded.items()
                             if f" {_plain(quote)} " in body])
            if not holder:
                continue
            marks[holder].append([start, end])
            evidence(holder, sentence, quote)
        if found:
            continue
        # No quotation to check. A long enough verbatim run is still proof, so
        # long as one record alone carries it.
        runs = {slug: longest_verbatim_run(sentence, body) for slug, body in folded.items()}
        best = max(runs.values(), default=0)
        holder = settle([slug for slug, run in runs.items() if run == best])
        if best >= RUN_MIN_WORDS and holder:
            marks[holder].append([start, end])
            evidence(holder, sentence)
    if not mark:                # evidence only, for choosing passages
        return dict(quotes)
    for source in sources:
        if marks.get(source.get("slug")):
            source["answer_ranges"] = dedupe_ranges(
                (source.get("answer_ranges") or []) + marks[source["slug"]])
    if marks:
        block["cite_method"] = "verbatim"
    return dict(quotes)


def paragraph_pool(kb: KbClient, query: str, filter_expression: dict | None = None,
                   top_k: int = 20) -> dict[str, list[str]]:
    """The retrieved paragraphs behind a question, best first, by slug. Free."""
    res = kb.find(query, top_k=top_k, show=["basic", "origin", "extra"],
                  filter_expression=filter_expression)
    pool: dict[str, list[str]] = {}
    for resource in ((res.get("resources") or {})).values():
        slug = resource.get("slug") or ""
        if not slug or slug.startswith("da-"):
            continue
        scored: list[tuple[float, str]] = []
        for field in (resource.get("fields") or {}).values():
            for para in (field.get("paragraphs") or {}).values():
                text = re.sub(r"\s+", " ", (para.get("text") or "")).strip()
                if text:
                    scored.append((float(para.get("score") or 0.0), text))
        pool[slug] = [text for _, text in sorted(scored, key=lambda row: -row[0])]
    return pool


def chunked(text: str, size: int = PASSAGE_CHARS) -> list[str]:
    """A record cut into passage-sized pieces on sentence boundaries."""
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    out: list[str] = []
    piece = ""
    for start, end in sentence_spans(text) or [(0, len(text))]:
        sentence = text[start:end]
        if piece and len(piece) + len(sentence) > size:
            out.append(piece.strip())
            piece = ""
        piece += sentence
    if piece.strip():
        out.append(piece.strip())
    return out


def closest_paragraph(paragraphs: list[str], sentences: str) -> str:
    """The retrieved paragraph that shares most of its words with the answer.

    Retrieval ranks a paragraph against the QUESTION; a source that earned a
    marker should show the paragraph behind that particular claim instead —
    the whole record is often a debate with a dozen speakers in it."""
    wanted = set(_content_words(sentences))
    if not wanted:
        return ""
    scored = [(len(wanted & set(_content_words(p))), -i, p)
              for i, p in enumerate(paragraphs)]
    best = max(scored, default=(0, 0, ""))
    return best[2] if best[0] >= 2 else ""


def attach_passages(records: Records, block: dict, pool: dict[str, list[str]],
                    quotes: dict[str, dict[str, str]]) -> int:
    """Give every source the passage the answer leaned on. Free.

    In order of preference: the retrieved paragraph that carries the quotation
    this source was marked for; the quotation in its own context, read from the
    record; the retrieved paragraph closest to the sentences it was marked for;
    the best-scoring retrieved paragraph; the head of the record."""
    filled = 0
    sources = block.get("sources") or []
    records.prefetch([s.get("slug") or "" for s in sources
                      if not pool.get(s.get("slug") or "")])
    for source in sources:
        slug = source.get("slug") or ""
        evidence = quotes.get(slug) or {}
        quote, sentences = evidence.get("quote") or "", evidence.get("text") or ""
        existing = (source.get("passage") or "").strip()
        # A passage that does not carry the quotation its source was cited for
        # is the wrong passage, however good it looked against the question.
        if existing and (not quote or _loose(quote).search(existing)):
            filled += 1
            continue
        if not slug:
            continue
        paragraphs = pool.get(slug) or []
        passage = ""
        if quote:
            pattern = _loose(quote)
            passage = next((p for p in paragraphs if pattern.search(p)), "")
            if not passage:
                passage = records.raw(slug)
        if not passage and sentences:
            # The marked claim may be nowhere near the paragraphs retrieval
            # ranked for the question, so the record itself is searched too.
            passage = (closest_paragraph(paragraphs, sentences)
                       or closest_paragraph(chunked(records.raw(slug)), sentences))
        if not passage and paragraphs:
            passage = paragraphs[0]
        if not passage:
            passage = records.raw(slug)
        source["passage"] = trim_passage(passage, quote)
        filled += bool(source["passage"])
    return filled


def cite_block(records: Records, block: dict, *, query: str,
               filter_expression: dict | None, key: str = "answer") -> tuple[int, int]:
    """Markers and passages for one answer, without asking anything.

    An answer whose markers came from the platform keeps them: its ranges are
    the generator's own record of what the answer cited, and the words are only
    ever the fallback. The words are still read either way, because a source's
    passage should carry the quotation that source was cited for."""
    marked_already = any(s.get("answer_ranges") for s in block.get("sources") or [])
    quotes = anchor_block(records, block, key=key, mark=not marked_already)
    pool = paragraph_pool(records.kb, query, filter_expression) if block.get("sources") else {}
    filled = attach_passages(records, block, pool, quotes)
    marked = sum(1 for s in block.get("sources") or [] if s.get("answer_ranges"))
    return marked, filled


def cite_report(kb: KbClient, slug: str, report: dict, since: str) -> dict[str, int]:
    """Every answer in a report gets its markers and every source its passage.

    Free — retrieval and record reads only — so it can be run over a report
    that was generated before either existed, and re-run whenever the page
    wants a different passage length."""
    cfg = REPORTS[slug]
    records = Records(kb)
    topic = cfg["topic"]
    tally = Counter()
    now = report.get("now") or {}
    window = now.get("since") or since
    blocks: list[tuple[str, dict, str, dict | None]] = []
    for index, section in enumerate(now.get("sections") or [], 1):
        blocks.append((f"now #{index}", section, "answer",
                       window_clauses(topic, window, None)))
    for era in (report.get("over_time") or {}).get("eras") or []:
        blocks.append((f"era {era.get('label')}", era, "answer",
                       window_clauses(topic, era.get("from"), era.get("to"))))
    for index, section in enumerate(report.get("sections") or [], 1):
        # v1's three unfiltered sections. The live page renders them today.
        blocks.append((f"section #{index}", section, "answer", None))
    for name, block, key, clauses in blocks:
        marked, filled = cite_block(
            records, block, query=block.get("question") or cfg["title"],
            filter_expression=clauses, key=key)
        sources = len(block.get("sources") or [])
        tally["blocks"] += 1
        tally["marked"] += bool(marked)
        tally["sources"] += sources
        tally["passages"] += filled
        print(f"  {name}: {marked}/{sources} sources marked, {filled} passages"
              f" [{block.get('cite_method') or 'none'}]")
    lede = report.get("lede") or {}
    if (lede.get("text") or "").strip() and lede.get("sources"):
        # The lede now draws on the whole record, eras included, so its
        # fallback retrieval pool is not windowed to `now` the way a section's
        # or an era's own is.
        marked, filled = cite_block(
            records, lede, query=cfg["blurb"] or cfg["title"],
            filter_expression=None, key="text")
        # A lede source is one of the sections' or eras' own, so a passage
        # already found there stands in for one the lede pass could not.
        known = {s["slug"]: s.get("passage") for _, block, _, _ in blocks
                 for s in block.get("sources") or [] if s.get("slug")}
        for source in lede["sources"]:
            source.setdefault("cited", True)   # a lede lists only what it used
            if not (source.get("passage") or "").strip():
                source["passage"] = known.get(source.get("slug")) or ""
                filled += bool(source["passage"])
        tally["blocks"] += 1
        tally["marked"] += bool(marked)
        tally["sources"] += len(lede["sources"])
        tally["passages"] += filled
        print(f"  lede: {marked}/{len(lede['sources'])} sources marked, {filled} passages"
              f" [{lede.get('cite_method') or 'none'}]")
    return dict(tally)


def ranges_from(value: object, shift: int, length: int) -> list[list[int]]:
    """The platform's citation ranges for one paragraph, as the portal reads them.

    A citations entry is `"<rid>/f/<field>/…": [[start, end], …]`, and the
    offsets are into the answer the platform returned. Sections store the
    answer STRIPPED, so leading whitespace has to come off the offsets too."""
    out: list[list[int]] = []
    for span in value if isinstance(value, list) else []:
        if not isinstance(span, (list, tuple)) or len(span) != 2:
            continue
        start, end = span
        if not isinstance(start, int) or not isinstance(end, int):
            continue
        start, end = start - shift, end - shift
        start, end = max(0, start), min(length, end)
        if end > start:
            out.append([start, end])
    return out


def cited_paragraph(resource: dict, cited_ids: set[str]) -> str:
    """The paragraph the answer actually leaned on: the CITED one when the
    platform names it, otherwise the longest retrieved passage. Mirrors the
    Worker's askPayload, which prefers a cited paragraph over a merely
    retrieved one for the snippet it shows beside the answer."""
    best = ""
    for field in (resource.get("fields") or {}).values():
        for pid, para in (field.get("paragraphs") or {}).items():
            text = re.sub(r"\s+", " ", (para.get("text") or "")).strip()
            if not text:
                continue
            if pid in cited_ids:
                return text
            if len(text) > len(best):
                best = text
    return best


def ask_sources(res: dict, answer: str = "") -> list[dict]:
    """Cited sources first, each flagged, so a section can be checked by eye.

    Each source also carries the passage behind it and, when the platform
    returned citation ranges, the spans of the answer it evidences — the same
    two things the ask page shows: a quotable passage and a superscript."""
    citations = res.get("citations") or {}
    cited_ids = {key.split("/")[0] for key in citations}
    raw = res.get("answer") or ""
    shift = len(raw) - len(raw.lstrip())
    spans: dict[str, list[list[int]]] = defaultdict(list)
    for key, value in citations.items():
        spans[key.split("/")[0]] += ranges_from(value, shift, len(answer))
    sources = []
    for rid, resource in ((res.get("retrieval_results") or {}).get("resources") or {}).items():
        slug = resource.get("slug") or ""
        if not slug or slug.startswith("da-"):
            continue
        summary = resource_summary(resource)
        sources.append({
            "slug": slug,
            "title": resource.get("title"),
            "speaker": summary["speaker"],
            "party": summary["party"],
            "state": summary["state"],
            "date": summary["date"],
            "cited": rid in cited_ids,
            "passage": trim_passage(cited_paragraph(resource, set(citations))),
            "answer_ranges": dedupe_ranges(spans.get(rid) or []),
        })
    sources.sort(key=lambda s: (not s["cited"], str(s.get("date") or "")))
    return sources


def build_section(kb: KbClient, question: str, *, topic: str | None = None,
                  since: str | None = None, until: str | None = None,
                  period: str = "") -> dict:
    """One window-filtered, cited ask. This is the unit the budget counts."""
    if topic:
        prompt = WINDOW_PROMPT.replace("{period}", period or "in the period asked about")
        res = kb.ask(question, citations=True, prompt=prompt, system=WINDOW_SYSTEM,
                     top_k=20, show=["basic", "origin", "extra"],
                     filter_expression=window_clauses(topic, since, until))
    else:
        res = kb.ask(question, citations=True, prompt=SECTION_PROMPT, top_k=20,
                     show=["basic", "origin", "extra"])
    ASKS["ask"] += 1
    answer = (res.get("answer") or "").strip()
    section = {
        "question": question,
        "answer": answer,
        "sources": ask_sources(res, answer),
        "asked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    if any(s["answer_ranges"] for s in section["sources"]):
        section["cite_method"] = "platform"
    else:
        # The platform does not always return ranges with an answer. Rather
        # than ship a section the page cannot mark up, fall back to the words.
        anchor_block(Records(kb), section)
    return section


def merge_surname_variants(counts: "Counter[str]") -> dict[str, str]:
    """Map a surname-only speaker onto its full name, but only when it is safe.

    The sources alternate between 'Lidia Thorpe' and 'Thorpe' for the same
    person, which splits a voices tally in two. Merging on a surname is the
    classic misattribution trap, so it happens ONLY when exactly one full name
    in this topic's own tally ends with that surname — two Thorpes and both
    forms stay apart."""
    full_by_surname: dict[str, list[str]] = defaultdict(list)
    for name in counts:
        parts = name.split()
        if len(parts) > 1:
            full_by_surname[parts[-1].casefold()].append(name)
    merged: dict[str, str] = {}
    for name in counts:
        parts = name.split()
        if len(parts) != 1:
            continue
        candidates = full_by_surname.get(parts[0].casefold()) or []
        if len(candidates) == 1:
            merged[name] = candidates[0]
    return merged


def voices(rows: list[dict], since: str | None = None, until: str | None = None,
           limit: int = 8) -> list[dict]:
    """Who actually speaks on the topic in a window, counted from the catalog."""
    scoped = in_window(rows, since, until) if since else rows
    raw: Counter[str] = Counter()
    parties: dict[str, Counter] = defaultdict(Counter)
    for row in scoped:
        speaker = str(row.get("speaker") or "").strip()
        if not speaker:
            continue
        raw[speaker] += 1
        if row.get("party"):
            parties[speaker][row["party"]] += 1
    merged = merge_surname_variants(raw)
    counts: Counter[str] = Counter()
    for speaker, count in raw.items():
        counts[merged.get(speaker, speaker)] += count
    for short, full in merged.items():
        parties[full].update(parties[short])
    out = []
    for speaker, count in counts.most_common(limit):
        party = parties[speaker].most_common(1)
        out.append({
            "speaker": speaker,
            "party": party[0][0] if party else None,
            "count": count,
        })
    return out


def tide(kb: KbClient, topic: str) -> list[dict]:
    """Topic share of labelled speeches by decade — /api/tide's method.

    Federal only, for the endpoint's own reason: the state Hansards start at
    different dates, so an all-parliament share tracks the mix of sources as
    much as the mix of subjects."""
    speech = {"prop": "label", "labelset": "kind", "label": "speech"}
    federal = {"prop": "label", "labelset": "state", "label": "federal"}

    def total(clauses: list[dict]) -> int:
        result = _request("POST", kb._rag("/catalog"), kb._headers, {
            "filter_expression": {"resource": {"and": clauses}}, "page_size": 0,
        })
        return (result.get("fulltext") or {}).get("total") or 0

    out = []
    for entry in TIDE_DECADES:
        decade = {"prop": "label", "labelset": "decade", "label": entry["decade"]}
        base = [speech, federal, decade]
        labelled = total([*base, {"prop": "label", "labelset": "topic"}])
        count = total([*base, {"prop": "label", "labelset": "topic", "label": topic}])
        out.append({
            "decade": entry["label"],
            "count": count,
            "labelled": labelled,
            "share": round(count / labelled, 5) if labelled else 0.0,
        })
    return out


BLOCKS = ("now", "over-time", "stats", "positions", "voices", "lede",
          "key-moments", "sections", "cites")


def build_now(kb: KbClient, slug: str, rows: list[dict], since: str) -> dict:
    """The live debate: what parliament is arguing about in the window, found."""
    cfg = REPORTS[slug]
    discovered = discover_debates(rows, cfg, since, None)
    questions = window_questions(cfg, discovered)
    print(f"[{slug}] now: {len(discovered)} debates discovered, {len(questions)} questions")
    for entry in discovered:
        print(f"    {entry['count']:5d}  {entry['first']}..{entry['last']}  {entry['title'][:70]}")
    sections = []
    for question in questions:
        t0 = time.time()
        try:
            section = build_section(
                kb, question, topic=cfg["topic"], since=since,
                period=f"on or after {since}")
            sections.append(section)
            state = "REFUSED" if section["answer"].startswith(REFUSAL[:24]) else "ok"
            print(f"  {state} ({time.time() - t0:.0f}s): {question[:66]}")
        except AragError as error:
            print(f"  FAILED ({error.status}): {question[:66]}", file=sys.stderr)
    return {"since": since, "discovered": discovered, "sections": sections}


def redo_sections(kb: KbClient, slug: str, now: dict, wanted: list[int]) -> dict:
    """Re-ask named `now` sections in place, leaving the rest of the block alone."""
    cfg = REPORTS[slug]
    sections = list(now.get("sections") or [])
    since = now.get("since") or NOW_SINCE
    for index in wanted:
        if not 1 <= index <= len(sections):
            print(f"  no section {index} to redo", file=sys.stderr)
            continue
        question = sections[index - 1]["question"]
        t0 = time.time()
        try:
            sections[index - 1] = build_section(
                kb, question, topic=cfg["topic"], since=since,
                period=f"on or after {since}")
            print(f"  redone ({time.time() - t0:.0f}s) #{index}: {question[:60]}")
        except AragError as error:
            print(f"  FAILED ({error.status}) #{index}: {question[:60]}", file=sys.stderr)
    return {**now, "sections": sections}


def build_over_time(kb: KbClient, slug: str, rows: list[dict],
                    moments: list[dict]) -> dict:
    """Three era answers, the decade tide, and the existing reading list."""
    cfg = REPORTS[slug]
    eras = []
    for era in ERAS:
        discovered = discover_debates(rows, cfg, era["from"], era["to"], limit=4)
        question = era_question(cfg, era, discovered)
        t0 = time.time()
        try:
            section = build_section(
                kb, question, topic=cfg["topic"], since=era["from"], until=era["to"],
                period=era["period"])
        except AragError as error:
            print(f"  FAILED ({error.status}): {era['label']}", file=sys.stderr)
            continue
        state = "REFUSED" if section["answer"].startswith(REFUSAL[:24]) else "ok"
        print(f"  {era['label']} {state} ({time.time() - t0:.0f}s): {question[:60]}")
        eras.append({
            "label": era["label"],
            "from": era["from"],
            "to": era["to"],
            "question": section["question"],
            "answer": section["answer"],
            "sources": section["sources"],
            "asked_at": section["asked_at"],
        })
    tide_rows = tide(kb, cfg["topic"])
    print("  tide: " + ", ".join(
        f"{t['decade']} {t['share'] * 100:.1f}%" for t in tide_rows))
    return {"eras": eras, "tide": tide_rows, "tide_scope": "federal",
            "key_moments": moments}


def now_sources(kb: KbClient, cfg: dict, since: str) -> tuple[dict, list[str]]:
    """Numbered sources from the `now` window, for positions."""
    return numbered_sources(
        kb, cfg["blurb"] or cfg["title"], top_k=24,
        filter_expression=window_clauses(cfg["topic"], since, None))


def topic_sources(kb: KbClient, cfg: dict, since: str | None = None) -> tuple[dict, list[str]]:
    """Numbered sources for key figures, from a window or the whole record.

    The query asks for the SHAPE of a usable figure, not for figures. A narrow
    window is thick with targets and totals — "1.2 million homes", "$32
    billion" — and a passage that states no base yields a stat the support
    check then throws away, so the window's query leans on the words that
    introduce a share."""
    query = (f"{cfg['title']}: per cent of, share of, proportion of, out of, "
             f"one in — figures given with the total they are measured against")
    return numbered_sources(
        kb, query, top_k=24,
        filter_expression=window_clauses(cfg["topic"], since, None))


def build_key_stats(kb: KbClient, cfg: dict, since: str) -> tuple[list[dict], list[dict]]:
    """Key figures, from the `now` window and the whole record in one ask.

    A report whose brief is the live argument should not lead with a tile from
    2007 — but a narrow window is thick with targets and totals ("1.2 million
    homes", "$32 billion") and thin on figures that state their own base, so a
    window-only ask can keep nothing at all. Both pools are retrieved (free)
    and numbered into one prompt, so the model chooses from all of it and each
    tile records which pool it came from. One paid call either way."""
    now_srcs, now_lines = topic_sources(kb, cfg, since)
    all_srcs, all_lines = topic_sources(kb, cfg, None)
    srcs = dict(now_srcs)
    lines = list(now_lines)
    offset = max(now_srcs or [0])
    by_slug = {s["slug"] for s in now_srcs.values()}
    for ref, source in all_srcs.items():
        if source["slug"] in by_slug:
            continue
        srcs[offset + ref] = source
        lines.append(re.sub(r"^\[\d+\]", f"[{offset + ref}]", all_lines[ref - 1]))
    kept, dropped = gen_key_stats(kb, cfg["title"], srcs, lines)
    windows = {s["slug"]: "now" for s in now_srcs.values()}
    for stat in kept:
        stat["window"] = windows.get(stat["slug"], "all")
    return kept, dropped


def report_path(slug: str) -> Path:
    return OUT_DIR / f"{slug}.json"


def load_prior(slug: str) -> dict:
    path = report_path(slug)
    return json.loads(path.read_text()) if path.exists() else {}


def budget_line() -> str:
    total = sum(ASKS.values())
    detail = ", ".join(f"{name} {count}" for name, count in sorted(ASKS.items()))
    return f"Paid calls this run: {total}" + (f" ({detail})" if detail else "")


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", nargs="*", help="report slugs (all when omitted)")
    parser.add_argument("--stats-only", action="store_true", help="refresh embedded static stats")
    parser.add_argument(
        "--only", choices=BLOCKS,
        help="refresh only one report block and preserve every other field",
    )
    parser.add_argument(
        "--since", default=NOW_SINCE,
        help=f"start of the `now` window, YYYY-MM-DD (default {NOW_SINCE})")
    parser.add_argument(
        "--refresh-rows", action="store_true",
        help="re-enumerate the topic's speeches from the catalog (free, ~1-2 min a topic)")
    parser.add_argument(
        "--redo", type=int, nargs="+", metavar="N",
        help="with --only now: re-ask just these sections, 1-based, keeping their "
             "questions and every other section (1 paid call each)")
    args = parser.parse_args()
    if args.redo and args.only != "now":
        parser.error("--redo only applies to --only now")
    if args.stats_only and args.only:
        parser.error("--stats-only and --only cannot be combined")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.since):
        parser.error("--since must be YYYY-MM-DD")
    unknown = sorted(set(args.reports) - set(REPORTS))
    if unknown:
        parser.error(f"unknown report slug(s): {', '.join(unknown)}")
    picked = args.reports or list(REPORTS)
    kb = KbClient(AragConfig.from_env())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stats_path = Path(__file__).resolve().parent / "report_stats.json"
    all_stats = json.loads(stats_path.read_text()) if stats_path.exists() else {}

    # --- one block at a time, everything else preserved --------------------
    if args.only:
        for slug in picked:
            cfg = REPORTS[slug]
            path = report_path(slug)
            if not path.exists():
                parser.error(f"{path} must exist for --only")
            report = json.loads(path.read_text())
            needs_rows = args.only in ("now", "over-time", "voices")
            rows = catalog_rows(kb, cfg["topic"], args.refresh_rows) if needs_rows else []
            if needs_rows:
                print(f"[{slug}] {len(rows):,} labelled speeches on {cfg['topic']}")
            if args.only == "stats":
                report["stats"] = all_stats.get(slug)
                kept, dropped = build_key_stats(kb, cfg, args.since)
                report["key_stats"] = kept
                report["key_stats_dropped"] = dropped
                print(f"[{slug}] key figures: {len(kept)} kept, {len(dropped)} dropped")
                for row in dropped:
                    print(f"    dropped {row['value']!r}: {row['reason']}")
            elif args.only == "positions":
                srcs, lines = now_sources(kb, cfg, args.since)
                report["positions"] = gen_positions(kb, cfg["title"], srcs, lines)
                print(f"[{slug}] positions: {len(report['positions'])} traced")
            elif args.only == "voices":
                report["voices"] = {
                    "now": voices(rows, args.since),
                    "all": voices(rows),
                }
                print(f"[{slug}] voices: now {len(report['voices']['now'])}, "
                      f"all {len(report['voices']['all'])}")
            elif args.only == "lede":
                report["lede"] = gen_lede(
                    kb, cfg["title"], report.get("now") or {}, report.get("over_time") or {},
                    report.get("key_stats") or [], report.get("positions") or [])
                print(f"[{slug}] lede: {len((report['lede'] or {}).get('text') or '')} chars, "
                      f"{len((report['lede'] or {}).get('sources') or [])} sources")
            elif args.only == "cites":
                print(f"[{slug}] marking answers and filling passages (free)")
                tally = cite_report(kb, slug, report, args.since)
                print(f"[{slug}] cites: {tally.get('marked', 0)}/{tally.get('blocks', 0)} "
                      f"answers marked, {tally.get('passages', 0)}/{tally.get('sources', 0)} "
                      f"sources carry a passage")
            elif args.only == "now" and args.redo:
                # One bad answer in eight should cost one ask, not eight. The
                # question and the window are the ones already in the file, so
                # the section is re-asked exactly as it was first asked.
                report["now"] = redo_sections(
                    kb, slug, report.get("now") or {}, args.redo)
            elif args.only == "now":
                report["now"] = build_now(kb, slug, rows, args.since)
            elif args.only == "over-time":
                report["over_time"] = build_over_time(
                    kb, slug, rows, report.get("key_moments") or [])
            elif args.only == "key-moments":
                print(f"[{slug}] retrieving and checking key speeches...")
                report["key_moments"] = key_moments(kb, slug)
                report.setdefault("over_time", {})["key_moments"] = report["key_moments"]
                print(f"  key moments: {len(report['key_moments'])}")
            else:  # sections — the v1 block, kept so the live page keeps working
                sections = []
                for question in cfg["questions"]:
                    t0 = time.time()
                    try:
                        sections.append(build_section(kb, question))
                        print(f"[{slug}] ok ({time.time() - t0:.0f}s): {question[:60]}")
                    except AragError as error:
                        print(f"[{slug}] FAILED ({error.status}): {question[:60]}", file=sys.stderr)
                report["sections"] = sections
            report["version"] = 2
            report["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            path.write_text(json.dumps(report, indent=1) + "\n")
        print(f"Wrote {args.only} for {len(picked)} report(s). {budget_line()}")
        return

    # --- a whole report ----------------------------------------------------
    counters = kb.counters()
    index = []
    idx_path = OUT_DIR / "index.json"
    if idx_path.exists():
        index = json.loads(idx_path.read_text()).get("reports", [])

    for slug in picked:
        cfg = REPORTS[slug]
        prior = load_prior(slug)
        if args.stats_only:
            report = {**prior, "stats": all_stats.get(slug)}
            report_path(slug).write_text(json.dumps(report, indent=1) + "\n")
            print(f"[{slug}] embedded audited static stats")
            continue

        rows = catalog_rows(kb, cfg["topic"], args.refresh_rows)
        print(f"[{slug}] {len(rows):,} labelled speeches on {cfg['topic']}")

        # v1's prose lead and its three unfiltered sections stay in the file so
        # the live page keeps working until the v2 page lands. They are not
        # re-asked here: v2's `now` and `lede` replace them, and re-asking them
        # would double the budget for prose no reader will see.
        report = {
            **prior,
            "slug": slug,
            "title": cfg["title"],
            "blurb": cfg["blurb"],
            "version": 2,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "corpus_resources": counters.get("resources"),
            "stats": all_stats.get(slug),
            "voices": {"now": voices(rows, args.since), "all": voices(rows)},
        }

        # Checkpoint after every block. A whole report is a dozen paid asks and
        # the platform 429s hard when other jobs share the account: a failure
        # in the last block must not throw away the first eleven.
        def checkpoint(**blocks: object) -> None:
            report.update(blocks)
            report["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            report_path(slug).write_text(json.dumps(report, indent=1) + "\n")

        checkpoint()
        checkpoint(now=build_now(kb, slug, rows, args.since))

        moments = prior.get("key_moments") or []
        try:
            moments = key_moments(kb, slug)
            print(f"  key moments: {len(moments)}")
        except AragError as error:
            print(f"  key moments FAILED ({error.status})", file=sys.stderr)
        checkpoint(key_moments=moments)
        checkpoint(over_time=build_over_time(kb, slug, rows, moments))

        try:
            kept, dropped = build_key_stats(kb, cfg, args.since)
            print(f"  key figures: {len(kept)} kept, {len(dropped)} dropped")
            for row in dropped:
                print(f"    dropped {row['value']!r}: {row['reason']}")
        except AragError as error:
            print(f"  key figures FAILED ({error.status})", file=sys.stderr)
            kept, dropped = prior.get("key_stats") or [], []
        checkpoint(key_stats=kept, key_stats_dropped=dropped)

        try:
            now_srcs, now_lines = now_sources(kb, cfg, args.since)
            positions = gen_positions(kb, cfg["title"], now_srcs, now_lines)
            print(f"  positions: {len(positions)} traced")
        except AragError as error:
            print(f"  positions FAILED ({error.status})", file=sys.stderr)
            positions = prior.get("positions") or []
        checkpoint(positions=positions)

        try:
            lede = gen_lede(kb, cfg["title"], report["now"], report["over_time"], kept, positions)
        except AragError as error:
            print(f"  lede FAILED ({error.status})", file=sys.stderr)
            lede = prior.get("lede") or {}
        print(f"  lede: {len((lede or {}).get('text') or '')} chars, "
              f"{len((lede or {}).get('sources') or [])} sources")
        checkpoint(lede=lede)

        # Markers and passages last, over the whole document: the paid blocks
        # already carry the platform's, and this fills anything they left —
        # v1's carried-over sections, a lede source, an answer the platform
        # returned without citation ranges. Free.
        print(f"[{slug}] marking answers and filling passages (free)")
        tally = cite_report(kb, slug, report, args.since)
        print(f"  cites: {tally.get('marked', 0)}/{tally.get('blocks', 0)} answers marked, "
              f"{tally.get('passages', 0)}/{tally.get('sources', 0)} sources carry a passage")
        checkpoint()

        index = [r for r in index if r["slug"] != slug] + [{
            "slug": slug, "title": cfg["title"], "blurb": cfg["blurb"],
            "updated": report["generated_at"],
        }]
        print(f"[{slug}] done. {budget_line()}")

    index.sort(key=lambda r: r["slug"])
    idx_path.write_text(json.dumps({"reports": index}, indent=1))
    print(f"Wrote {len(picked)} report(s) + index to {OUT_DIR}")
    print(budget_line())
    print("Publish with: cd portal && npx wrangler deploy")


if __name__ == "__main__":
    main()
