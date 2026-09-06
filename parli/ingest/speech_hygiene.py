"""Conservative, traceable normalization for parliamentary speech records.

The source ``text`` and attribution columns remain immutable evidence.  These
helpers produce derived values for ``text_clean``, ``speaker_name_clean`` and
``party_canonical`` and are shared by repair and knowledge-box sync paths.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from typing import Optional

from parli.ingest.speaker_names import normalize_speaker


PARTY_ALIASES: dict[str, str] = {}
for canonical, aliases in {
    "Labor": ["ALP", "Australian Labor Party", "Labor"],
    "Liberal": ["LP", "LIB", "Liberal Party", "Liberal"],
    "Nationals": ["NP", "Nats", "NATS", "NPA", "National Party", "NatsWA", "CP", "Nationals"],
    "LNP": ["LNP", "Liberal National Party"],
    "Independent": ["IND", "Ind", "Ind.", "Independent"],
    "Greens": ["AG", "Australian Greens", "Greens"],
    "Country Liberal Party": ["CLP", "Country Liberal Party"],
    "Katter's Australian Party": ["KAP", "Katter's Australian Party"],
    "Centre Alliance": ["NXT", "CA", "Centre Alliance"],
    "United Australia Party": ["PUP", "UAP", "United Australia Party"],
    "One Nation": [
        "One Nation", "PHON", "Pauline Hanson's One Nation",
        "Pauline Hanson's One Nation Party",
    ],
    "Australian Democrats": ["Australian Democrats", "AD"],
    "DLP": ["DLP", "Democratic Labor Party"],
    "Family First": ["Family First", "Family First Party", "FF"],
    "JLN": ["JLN", "Jacqui Lambie Network"],
}.items():
    for alias in aliases:
        PARTY_ALIASES[alias.casefold()] = canonical


_NUMERIC_ENTITY_RE = re.compile(r"&#(?:\d+|x[0-9a-f]+);", re.I)
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_HYPHEN_WRAP_RE = re.compile(r"(?<=\w)-[ \t]*\r?\n[ \t]*(?=\w)")
_SOFT_WRAP_RE = re.compile(r"(?<=[a-z,;])[ \t]*\r?\n[ \t]*(?=[a-z])")
_HORIZONTAL_RUN_RE = re.compile(r"[^\S\r\n]{3,}")
_BLANK_RUN_RE = re.compile(r"(?:[ \t]*\r?\n){3,}")
_LEADING_BRACKET_TIME_RE = re.compile(
    r"^[ \t]*\[[ \t]*\d{1,2}(?:[.:][ \t]*\d{2})(?:[.:][ \t]*\d{2})?"
    r"(?:[ \t]*(?:a\.?m\.?|p\.?m\.?))?[ \t]*\][ \t]*(?:\.-|-|:)?[ \t]*",
    re.I,
)

_HONORIFIC = r"(?:(?:the[ \t]+)?hon(?:ourable)?\.?|mr\.?|mrs\.?|ms\.?|miss|dr\.?|prof\.?|senator|sen\.?|madam|rev\.?)"
_PAREN_TIME_BANNER_RE = re.compile(
    rf"^[ \t]*(?P<name>{_HONORIFIC}[ \t]+[^():\n]{{1,100}}?)"
    r"[ \t]*(?:\([^()\n]{1,100}\)[ \t]*)+"
    r"\([ \t]*\d[\d \t]*:[ \t]*\d[\d \t]*(?::[ \t]*\d[\d \t]*)?[ \t]*\)"
    r"[ \t]*(?::|[—–-])[ \t]*",
    re.I,
)
_BRACKET_TIME_BANNER_RE = re.compile(
    rf"^[ \t]*(?P<name>{_HONORIFIC}[ \t]+[^\[\n:]{{1,160}}?)"
    r"[ \t]*(?:\([^()\n]{1,120}\)[ \t]*)?"
    r"\[[ \t]*\d{1,2}(?:[.:][ \t]*\d{2})(?:[.:][ \t]*\d{2})?"
    r"(?:[ \t]*(?:a\.?m\.?|p\.?m\.?))?[ \t]*\][ \t]*:[ \t]*",
    re.I,
)
_ROLE_BANNER_RE = re.compile(
    r"^[ \t]*(?P<name>(?:the[ \t]+|mr[ \t]+|madam[ \t]+)?"
    r"(?:acting[ \t]+|deputy[ \t]+|temporary[ \t]+)?"
    r"(?:speaker|president|chair(?:man)?)[ \t]*\([^\n)]+\))[ \t]*:[ \t]*",
    re.I,
)
_SIMPLE_BANNER_RE = re.compile(
    rf"^[ \t]*(?P<name>{_HONORIFIC}[ \t]+[^():\n]{{1,150}}?)[ \t]*:[ \t]*",
    re.I,
)

_MOJIBAKE_REPLACEMENTS = {
    "â€™": "’", "â€˜": "‘", "â€œ": "“", "â€": "”",
    "â€“": "–", "â€”": "—", "â€¦": "…", "â€¢": "•",
    "Â ": "\u00a0", "Â£": "£", "Â°": "°", "ï»¿": "",
}

_KNOWN_SPLITS = (
    (re.compile(r"(?i)\bpar[ \t]*\r?\n[ \t]*liament\b"), "parliament"),
    (re.compile(r"(?i)\bgovern[ \t]*\r?\n[ \t]*ment\b"), "government"),
    (re.compile(r"(?i)\bdepart[ \t]*\r?\n[ \t]*ment\b"), "department"),
    (re.compile(r"(?i)\brepresen[ \t]*\r?\n[ \t]*tatives\b"), "representatives"),
    (re.compile(r"(?i)\bnotwith-stand-ing\b"), "notwithstanding"),
)

# Audited literal joins only. A general lowercase/uppercase splitter corrupts
# proper nouns and acronyms and is deliberately not used.
_KNOWN_MISSING_SPACES = (
    (re.compile(r"\bof(?=Senator\b)"), "of "),
    (re.compile(r"\bfor(?=Health\b)"), "for "),
    (re.compile(r"\bthe(?=Votes and Proceedings\b)"), "the "),
)

# openaustralia's scrape drops the space before a capitalised word about one
# row in four ("theAustralian", "byMr Gray", "ofParliament House"; measured
# 2026-09-06 on an 8,000-row sample: 23% of rows, 'Australian' and 'Senator'
# two thirds of the hits). The split is safe only where the capitalised word
# is one that never legitimately follows a lowercase run inside a single
# token: the honorifics and the parliamentary nouns below. Anything camel-cased
# in the wild (McDonald, eBay, YouTube) has a second half outside this list.
_GLUED_WORD_RE = re.compile(
    r"(?<=[a-z]{2})(?=(?:Australian|Australia|Australians|Senator|Senators|Mr|Mrs|Ms|Dr|The|Prime|Parliament|"
    r"Parliamentary|House|Government|Governments|Opposition|Minister|Ministers|Bill|Bills|Labor|Liberal|Liberals|"
    r"Greens|Nationals|National|Commonwealth|Treasurer|Speaker|President|Deputy|Leader|Member|Members|Senate|"
    r"Federal|Budget|Honourable|Coalition|Chair|Madam|Committee|Department|Minister|Motion|Question|Acting)\b)"
)

_TAGGED_INTERJECTION_RE = re.compile(
    r"<interjection\b[^>]*>(?P<body>.*?)</interjection\s*>", re.I | re.S
)
_DASH_INTERJECTION_RE = re.compile(
    r"[—–-][ \t]*(?P<who>(?:Mr\.?|Mrs\.?|Ms\.?|Senator|The Hon\.?)"
    r"[ \t]+[A-Za-z][A-Za-z .’'\-]{1,80}|Honourable members)"
    r"[ \t]+interjecting[ \t]*[—–-]",
    re.I,
)
_HONOURABLE_INTERJECTING_RE = re.compile(r"\bHonourable members interjecting\b", re.I)
_PAREN_STAGE_RE = re.compile(
    r"\((?P<label>interjection|inaudible|unidentified speaker)(?P<detail>[^)]*)\)", re.I
)


@dataclass(frozen=True)
class CleanedSpeech:
    text: str
    rules: tuple[str, ...]


def clean_party(raw: object) -> Optional[str]:
    """Return one canonical party label, never an office or composite history."""
    if not raw or not isinstance(raw, str):
        return None
    return PARTY_ALIASES.get(raw.strip().casefold())


def clean_speaker_name(raw: object) -> Optional[str]:
    if not isinstance(raw, str):
        return None
    return normalize_speaker(raw)


def _same_speaker(banner: str, row_speaker: object) -> bool:
    banner_name = clean_speaker_name(banner)
    row_name = clean_speaker_name(row_speaker)
    if not banner_name or not row_name:
        return False
    a = re.sub(r"[^a-z0-9]+", " ", banner_name.casefold()).strip()
    b = re.sub(r"[^a-z0-9]+", " ", row_name.casefold()).strip()
    if a == b:
        return True
    # Some sources identify a member only by surname. Treat a single-token
    # row attribution as a match only to the banner's final token.
    return (len(b.split()) == 1 and a.split()[-1:] == [b]) or (
        len(a.split()) == 1 and b.split()[-1:] == [a]
    )


def _replace_preserving_case(match: re.Match[str], replacement: str) -> str:
    original = match.group(0)
    if original[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def _normalize_topic(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def _strip_matching_banner(text: str, speaker_name: object) -> tuple[str, bool]:
    for pattern in (
        _PAREN_TIME_BANNER_RE,
        _BRACKET_TIME_BANNER_RE,
        _ROLE_BANNER_RE,
        _SIMPLE_BANNER_RE,
    ):
        match = pattern.match(text)
        if match and _same_speaker(match.group("name"), speaker_name):
            return text[match.end():], True
    return text, False


def _strip_topic_header(text: str, source: str, topic: Optional[str]) -> tuple[str, bool]:
    if not topic or not topic.strip():
        return text, False
    value = topic.strip()

    # A separate first line is structural evidence. Never turn a heading-only
    # row into empty text.
    lines = text.splitlines(keepends=True)
    if len(lines) > 1 and _normalize_topic(lines[0]) == _normalize_topic(value):
        rest = "".join(lines[1:]).lstrip()
        if rest:
            return rest, True

    # NSW often concatenates an upper-case topic heading and the first speech
    # sentence on one line. Requiring the exact upper-case source topic avoids
    # the old `Documents` / `Documents are tabled` false positive.
    upper = value.upper()
    if source == "nsw_hansard" and len(value.split()) >= 2 and text.startswith(upper):
        boundary = text[len(value): len(value) + 1]
        rest = text[len(value):].lstrip(" :-–—\t")
        if boundary and not boundary.isalnum() and rest:
            return rest, True

    # OpenAustralia may put one all-caps bill title on its own line while the
    # topic contains a semicolon-delimited list of bills.
    if len(lines) > 1:
        first = lines[0].strip()
        letters = [c for c in first if c.isalpha()]
        components = {_normalize_topic(part) for part in value.split(";")}
        if letters and all(c.isupper() for c in letters) and _normalize_topic(first) in components:
            rest = "".join(lines[1:]).lstrip()
            if rest:
                return rest, True
    return text, False


def clean_speech_text_with_rules(
    text: object,
    source: str = "",
    topic: Optional[str] = None,
    speaker_name: object = None,
) -> CleanedSpeech:
    """Return idempotently cleaned text plus every rule that changed it."""
    value = text if isinstance(text, str) else ""
    rules: list[str] = []

    def apply(name: str, updated: str) -> None:
        nonlocal value
        if updated != value:
            value = updated
            rules.append(name)

    if _NUMERIC_ENTITY_RE.search(value):
        apply("numeric_html_entity", html.unescape(value))

    if any(token in value for token in _MOJIBAKE_REPLACEMENTS):
        updated = value
        for bad, good in _MOJIBAKE_REPLACEMENTS.items():
            updated = updated.replace(bad, good)
        apply("mojibake", updated)

    if _CONTROL_RE.search(value):
        apply("control_character", _CONTROL_RE.sub(" ", value))

    updated, changed = _strip_matching_banner(value, speaker_name)
    if changed:
        apply("matching_speaker_banner", updated)

    if _LEADING_BRACKET_TIME_RE.match(value):
        apply("leading_timestamp", _LEADING_BRACKET_TIME_RE.sub("", value, count=1))

    # Existing source splits sometimes leave punctuation before the body.
    trimmed = value.lstrip(": ").lstrip("—- ").lstrip()
    apply("leading_delimiter", trimmed)

    updated, changed = _strip_topic_header(value, source, topic)
    if changed:
        apply("duplicate_topic_header", updated)

    if _TAGGED_INTERJECTION_RE.search(value):
        apply(
            "interjection_markup",
            _TAGGED_INTERJECTION_RE.sub(
                lambda m: f"[Interjection: {re.sub(r'\\s+', ' ', m.group('body')).strip()}]",
                value,
            ),
        )
    if _HONOURABLE_INTERJECTING_RE.search(value):
        apply(
            "interjection_markup",
            _HONOURABLE_INTERJECTING_RE.sub("[Interjection: Honourable members]", value),
        )
    if _DASH_INTERJECTION_RE.search(value):
        apply(
            "interjection_markup",
            _DASH_INTERJECTION_RE.sub(lambda m: f" [Interjection: {m.group('who').strip()}] ", value),
        )
    if _PAREN_STAGE_RE.search(value):
        apply(
            "interjection_markup",
            _PAREN_STAGE_RE.sub(
                lambda m: "[" + m.group("label").title() + m.group("detail").strip() + "]",
                value,
            ),
        )

    if _HYPHEN_WRAP_RE.search(value):
        apply("line_end_hyphenation", _HYPHEN_WRAP_RE.sub("-", value))

    for pattern, replacement in _KNOWN_SPLITS:
        if pattern.search(value):
            apply(
                "known_ocr_word_split",
                pattern.sub(lambda m, r=replacement: _replace_preserving_case(m, r), value),
            )

    for pattern, replacement in _KNOWN_MISSING_SPACES:
        if pattern.search(value):
            apply("audited_missing_space", pattern.sub(replacement, value))

    if source == "openaustralia" and _GLUED_WORD_RE.search(value):
        apply("glued_capitalised_word", _GLUED_WORD_RE.sub(" ", value))

    if _SOFT_WRAP_RE.search(value):
        apply("soft_line_wrap", _SOFT_WRAP_RE.sub(" ", value))

    if _HORIZONTAL_RUN_RE.search(value):
        apply("horizontal_whitespace", _HORIZONTAL_RUN_RE.sub(" ", value))
    if _BLANK_RUN_RE.search(value):
        apply("blank_line_run", _BLANK_RUN_RE.sub("\n\n", value))

    if source == "committee_senate" and topic:
        prefix = f"[{topic}] "
        if not value.startswith(prefix):
            apply("committee_topic_context", prefix + value)

    apply("edge_whitespace", value.strip())
    return CleanedSpeech(value, tuple(dict.fromkeys(rules)))


def clean_speech_text(
    text: object,
    source: str = "",
    topic: Optional[str] = None,
    speaker_name: object = None,
) -> str:
    return clean_speech_text_with_rules(text, source, topic, speaker_name).text


def legacy_clean_speech_text(
    text: object,
    source: str = "",
    topic: Optional[str] = None,
) -> str:
    """The pre-hygiene KB mapping, used only to select necessary patches."""
    value = text if isinstance(text, str) else ""
    if "&#" in value:
        value = html.unescape(value)
    value = value.lstrip(": ").lstrip("—- ").lstrip()
    if source == "nsw_hansard" and topic and value.startswith(topic.upper()):
        value = value[len(topic):].lstrip()
    if source == "committee_senate" and topic:
        value = f"[{topic}] {value}"
    return value
