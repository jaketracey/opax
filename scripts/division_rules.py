"""Publication rules shared by the division and vote exporters.

  office codes   TVFY puts a presiding officer's office (PRES, DPRES, SPK, CWM ...)
                 in its party field. An office says nothing about the person's
                 affiliation, so it is never published as a party: the member row
                 carries it as `office` and has no party unless a dated one is
                 known (parli/ingest/federal_affiliations.py OFFICE_MARKERS).
  party labels   one display label per party, so tallies do not split one party
                 into two groups ("JLN" and "Jacqui Lambie Network").
  placeholders   TVFY summary placeholders are not the question put; publish no
                 question rather than the placeholder.
  duplicates     a division TheyVoteForYou has marked as a duplicate, with a link
                 to the division it repeats, is kept for provenance but flagged and
                 left out of member vote counts. The flag needs the marker, the
                 linked original and an identical named vote set.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from parli.ingest.federal_affiliations import OFFICE_MARKERS  # noqa: E402

PARTY_LABELS = {
    "pauline hanson's one nation party": "One Nation",
    "pauline hanson's one nation": "One Nation",
    "jln": "Jacqui Lambie Network",
}

PLACEHOLDER_QUESTIONS = frozenset({"No motion text available", "Long debate text truncated."})

# TVFY's own words when it marks a division as a repeat of another one.
DUPLICATE_TEXT = re.compile(
    r"^\s*(?:This (?:division )?is (?:a duplicate|a duplication|identical) (?:of|to)\b"
    r"|See the edited version of \[this division\])", re.I)
DUPLICATE_NAME = re.compile(r"(?:\(DUPLICATE\)|[-—]\s*DUPLICATE|\bDUPLICATE)\s*$")
_PUBLICWHIP_LINK = re.compile(
    r"division\.php\?date=(\d{4}-\d\d-\d\d)&(?:amp;)?number=(\d+)&(?:amp;)?house=(representatives|senate)")
_TVFY_LINK = re.compile(r"theyvoteforyou\.org\.au/divisions/(representatives|senate)/(\d{4}-\d\d-\d\d)/(\d+)")


def office_code(party: str | None) -> str | None:
    """The office a presiding-officer code names, or None for a real party label."""
    if isinstance(party, str) and party.strip().casefold() in OFFICE_MARKERS:
        return party.strip()
    return None


def party_label(party: str | None) -> str | None:
    if not isinstance(party, str) or not party.strip():
        return None
    party = party.strip()
    return PARTY_LABELS.get(party.casefold(), party)


def publishable_member(member: dict, tvfy_page_ids: bool = False) -> dict:
    """Office codes out of `party`, one label per party.

    `tvfy_page_ids`: the members were read from a TVFY division page, whose
    bare person ids ("11007") ext_votes spells "tvfy_11007"; use that one
    spelling so joins on person_id find them."""
    party = member.get("party")
    office = office_code(party)
    if office:
        member.pop("party", None)
        member["office"] = office
    elif party is not None:
        label = party_label(party)
        if label:
            member["party"] = label
        else:
            member.pop("party", None)
    pid = member.get("person_id")
    if tvfy_page_ids and isinstance(pid, str) and pid.isdigit():
        member["person_id"] = f"tvfy_{pid}"
    return member


def canonical_person_id(pid) -> str | None:
    if pid is None:
        return None
    pid = str(pid)
    return f"tvfy_{pid}" if pid.isdigit() else pid


def publishable_question(question: str | None) -> str | None:
    if isinstance(question, str) and question.strip() in PLACEHOLDER_QUESTIONS:
        return None
    return question


def duplicate_link(name: str | None, text: str | None) -> tuple[str, str, int] | None:
    """(house, date, number) of the division TVFY says this one repeats, or None.

    Both the marker and a parseable link to the original are required."""
    marked = bool(DUPLICATE_TEXT.match(text or "")) or bool(DUPLICATE_NAME.search((name or "").strip()))
    if not marked:
        return None
    m = _PUBLICWHIP_LINK.search(text or "")
    if m:
        return m.group(3), m.group(1), int(m.group(2))
    m = _TVFY_LINK.search(text or "")
    if m:
        return m.group(1), m.group(2), int(m.group(3))
    return None


def tvfy_slot(url: str | None) -> tuple[str, str, int] | None:
    """(house, date, number) from a TVFY division URL, the federal records' source_url."""
    m = _TVFY_LINK.search(url or "")
    return (m.group(1), m.group(2), int(m.group(3))) if m else None


def vote_set(rows) -> frozenset:
    """The (person, vote) pairs that make two divisions the same recorded vote."""
    return frozenset((str(pid), vote) for pid, vote in rows if pid is not None and vote in ("aye", "no"))


def find_duplicates(divisions: dict, votes: dict) -> dict:
    """{duplicate key: original key} for flagged repeats that prove out.

    divisions: key -> (house, date, number, name, text); votes: key -> vote_set.
    A marked division is a duplicate only when its link resolves to another
    published division that is not itself marked, and both have the same
    non-empty named vote set."""
    by_slot = {(h, d, n): k for k, (h, d, n, _, _) in divisions.items() if n is not None}
    marked = {k: duplicate_link(name, text) for k, (_, _, _, name, text) in divisions.items()}
    out = {}
    for key, link in marked.items():
        original = by_slot.get(link) if link else None
        if not original or original == key or marked.get(original):
            continue
        if votes.get(key) and votes.get(key) == votes.get(original):
            out[key] = original
    return out
