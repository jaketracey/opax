"""
parli.ingest.committee_transcript -- parse ParlInfo committee transcripts (no network, no database).

Covers the four ParlInfo committee datasets: `estimate` (Senate Estimates), `commsen` (other Senate
committees), `commrep` (House committees) and `commjnt` (Joint committees). They share one markup, so
one parser serves all of them.

What lives here:

  listing   the ParlInfo summary listing (`Dataset:commsen,commrep,commjnt,estimate Date:dd/mm/yyyy >> dd/mm/yyyy`):
            one <li class="result"> per fragment, with dataset, hearing id, fragment, date, committee and inquiry title.
  toc       fragment 0000 of a hearing: the Proof / Final status, committee name, date and the fragment ids.
  fragment  the turns of one transcript fragment. A turn is one speaker's uninterrupted words, with

              speaker_name  the label as the transcript prints it ("Mr KENNEDY", "Senator DAVID POCOCK", "CHAIR", "Ms Bullock")
              speaker_type  chair | member | witness, from the markup class (never guessed from an honorific)
              handbook_id   the Parliamentary Handbook id (PHID) in the member's link, e.g. 91219 = Ed Husic

            Parliamentarians' labels sit inside a link to `handbook/allmps/<PHID>`, so a member is identified by that id, not
            by a surname. Witnesses are `HPS-WitnessName` spans; the chair is `HPS-OfficeCommittee` ("CHAIR:") or a linked
            "CHAIR (Mr Husic):".
  witnesses the structured witness list that opens each non-estimates fragment ("BAUMGART, Mr Richard, Chief Adviser,
            Department of Social Services"), parsed into name, position and organisation.

The parser only reads what the page prints. Turning a label into a person_id, and a witness label into a full name,
is parli.ingest.committee_witnesses' job.
"""

from __future__ import annotations

import hashlib
import html as htmlmod
import re
from dataclasses import dataclass, field
from datetime import date
from html.parser import HTMLParser
from urllib.parse import quote

from parli.ingest.committee_witnesses import POSTNOMINALS, split_honorific

PARLINFO_BASE = "https://parlinfo.aph.gov.au"

DATASETS = ("estimate", "commsen", "commrep", "commjnt")

# ParlInfo dataset -> speeches.source / speeches.chamber
DATASET_MAP = {
    "estimate": "committee_senate",   # Senate Estimates
    "commsen": "committee_senate",    # other Senate committee hearings
    "commrep": "committee_house",     # House committee hearings
    "commjnt": "committee_joint",     # Joint committee hearings
}
CHAMBER_MAP = {
    "estimate": "senate_committee",
    "commsen": "senate_committee",
    "commrep": "house_committee",
    "commjnt": "joint_committee",
}
COMMITTEE_SOURCES = ("committee_senate", "committee_house", "committee_joint")
COMMITTEE_CHAMBERS = ("senate_committee", "house_committee", "joint_committee")

# The ParlInfo id of one hearing, and of one of its fragments.
HEARING_ID_RE = re.compile(r"committees/(estimate|commsen|commrep|commjnt)/(\d+)")
FRAGMENT_ID_RE = re.compile(r"committees/(estimate|commsen|commrep|commjnt)/(\d+)/(\d{4})")

TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class HearingMetadata:
    """One hearing (one sitting of one committee on one day), as far as the listing / TOC say."""
    hearing_id: str                    # "committees/commrep/29882"
    dataset: str                       # estimate | commsen | commrep | commjnt
    title: str = ""
    committee_name: str = ""
    inquiry_title: str = ""            # the listing's inquiry / bill / program title ("" when it has none)
    date: str = ""                     # YYYY-MM-DD
    url: str = ""
    category: str = ""                 # "HoR Committee Hansard", "Senate Estimates", ...
    status: str | None = None          # "Proof" | "Final" (from the TOC)
    fragment_ids: list[str] = field(default_factory=list)


@dataclass
class SpeechRecord:
    """One turn of a committee hearing."""
    speaker_name: str
    speaker_type: str                  # chair | member | witness | unknown
    text: str
    hearing_id: str                    # fragment level: "committees/commrep/29882/0001"
    committee_name: str
    date: str
    topic: str
    dataset: str
    handbook_id: str | None = None     # PHID of a parliamentarian's linked label
    named_as: str | None = None        # "CHAIR (Mr Husic)" -> "Mr Husic"


@dataclass
class ListingEntry:
    dataset: str
    hearing_num: str
    fragment: str
    date: str                          # YYYY-MM-DD
    committee: str
    inquiry: str
    category: str

    @property
    def hearing_id(self) -> str:
        return f"committees/{self.dataset}/{self.hearing_num}"


@dataclass
class ListingPage:
    entries: list[ListingEntry]
    total: int                         # "of N matches"
    first: int = 0
    last: int = 0


@dataclass
class WitnessEntry:
    """One line of the witness list at the top of a fragment."""
    raw: str
    surname: str
    name: str                          # "Michele Bullock"
    honorific: str | None
    honorific_class: str | None
    postnominals: str | None
    position: str | None
    organisation: str | None
    remote: bool = False               # "[by video link]"


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------

def _ddmmyyyy(d: date | str) -> str:
    if isinstance(d, str):
        d = date.fromisoformat(d)
    return d.strftime("%d/%m/%Y")


def listing_url(start: date | str, end: date | str, page: int = 0,
                datasets: tuple[str, ...] = DATASETS, res_count: int = 100) -> str:
    """The summary-listing URL for hearings dated start..end inclusive (ParlInfo's `Date:dd/mm/yyyy >> dd/mm/yyyy`)."""
    query = f"Dataset:{','.join(datasets)} Date:{_ddmmyyyy(start)} >> {_ddmmyyyy(end)}"
    return (f"{PARLINFO_BASE}/parlInfo/search/summary/summary.w3p;adv=yes;"
            f"orderBy=_fragment_number,doc_date-rev;page={int(page)};query={quote(query, safe='')};resCount={int(res_count)}")


def toc_url(hearing_id: str) -> str:
    return f"{PARLINFO_BASE}/parlInfo/search/display/display.w3p;query=Id%3A%22{quote(hearing_id, safe='')}/0000%22"


def fragment_url(hearing_id: str, fragment: str) -> str:
    q = quote(hearing_id, safe="").replace("/", "%2F")
    return (f"{PARLINFO_BASE}/parlInfo/search/display/display.w3p;db=COMMITTEES;"
            f"id={q}%2F{fragment};query=Id%3A%22{q}%2F0000%22")


_TITLE_RE = re.compile(r"^(?P<committee>.+?)\s+:\s+(?P<date>\d{2}/\d{2}/\d{4})\s*:?\s*(?P<inquiry>.*?)\s*$", re.S)


def parse_listing_title(title: str) -> tuple[str, str, str]:
    """'Standing Committee on Economics : 18/09/2026 : Review of the RBA Annual Report 2025 :' ->
    ('Standing Committee on Economics', '2026-09-18', 'Review of the RBA Annual Report 2025')."""
    t = SPACE_RE.sub(" ", htmlmod.unescape(title or "")).strip()
    m = _TITLE_RE.match(t)
    if not m:
        return t.rstrip(" :"), "", ""
    d, mo, y = m.group("date")[:2], m.group("date")[3:5], m.group("date")[6:]
    inquiry = m.group("inquiry").strip()
    inquiry = re.sub(r"\s*:\s*$", "", inquiry).strip()
    return m.group("committee").strip(), f"{y}-{mo}-{d}", inquiry


_RESULT_SPLIT_RE = re.compile(r'<li class="result')
_RESULT_ID_RE = re.compile(r"ID:\s*(committees/(?:estimate|commsen|commrep|commjnt)/\d+/\d{4})")
_RESULT_TITLE_RE = re.compile(r'<div class="sumLink"><a [^>]*>(.*?)</a>\s*(?:<span class="cat">\[(.*?)\]</span>)?', re.S)
_SUMMARY_RE = re.compile(r"Summary results:\s*([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)")


def _int(s: str) -> int:
    return int(s.replace(",", ""))


def parse_listing(page_html: str) -> ListingPage:
    """Every fragment result on one page of the summary listing, and the query's total."""
    m = _SUMMARY_RE.search(TAG_RE.sub("", page_html).replace("&#160;", " ").replace("\xa0", " "))
    total = _int(m.group(3)) if m else 0
    first, last = (_int(m.group(1)), _int(m.group(2))) if m else (0, 0)
    entries: list[ListingEntry] = []
    for block in _RESULT_SPLIT_RE.split(page_html)[1:]:
        idm = _RESULT_ID_RE.search(block)
        if not idm:
            continue
        fm = FRAGMENT_ID_RE.fullmatch(idm.group(1))
        tm = _RESULT_TITLE_RE.search(block)
        committee, day, inquiry = parse_listing_title(TAG_RE.sub("", tm.group(1)) if tm else "")
        category = htmlmod.unescape(tm.group(2)).strip() if tm and tm.group(2) else ""
        entries.append(ListingEntry(dataset=fm.group(1), hearing_num=fm.group(2), fragment=fm.group(3), date=day,
                                    committee=committee, inquiry=inquiry, category=category))
    return ListingPage(entries=entries, total=total, first=first, last=last)


def group_listing(entries: list[ListingEntry]) -> list[HearingMetadata]:
    """Fold fragment results into hearings, newest first."""
    hearings: dict[str, HearingMetadata] = {}
    for e in entries:
        h = hearings.get(e.hearing_id)
        if h is None:
            h = hearings[e.hearing_id] = HearingMetadata(
                hearing_id=e.hearing_id, dataset=e.dataset, title=e.committee, committee_name=e.committee,
                inquiry_title=e.inquiry, date=e.date, category=e.category,
                url=fragment_url(e.hearing_id, "0000"))
        if not h.inquiry_title and e.inquiry:
            h.inquiry_title = e.inquiry
        if not h.date and e.date:
            h.date = e.date
        if e.fragment != "0000" and e.fragment not in h.fragment_ids:
            h.fragment_ids.append(e.fragment)
    for h in hearings.values():
        h.fragment_ids.sort()
    return sorted(hearings.values(), key=lambda h: (h.date, h.hearing_id), reverse=True)


# ---------------------------------------------------------------------------
# TOC (fragment 0000)
# ---------------------------------------------------------------------------

@dataclass
class TocInfo:
    status: str | None
    committee_name: str
    date: str
    title: str
    fragment_ids: list[str]


def parse_toc(page_html: str, hearing_id: str) -> TocInfo:
    """The hearing's status (Proof / Final), committee, date and fragment ids from its table-of-contents page."""
    title = ""
    tm = re.search(r"<title>ParlInfo - (.*?)</title>", page_html)
    if tm:
        title = htmlmod.unescape(tm.group(1)).strip()
    committee = ""
    cm = re.search(r'<dt class="mdLabel">Committee Name</dt>\s*<dd class="mdValue"><p class="mdItem">(.*?)</p>',
                   page_html, re.S)
    if cm:
        committee = SPACE_RE.sub(" ", htmlmod.unescape(TAG_RE.sub("", cm.group(1)))).strip()
    day = ""
    dm = re.search(r'<dt class="mdLabel">Date</dt>\s*<dd class="mdValue"><p class="mdItem">(\d{2})-(\d{2})-(\d{4})</p>',
                   page_html, re.S)
    if dm:
        day = f"{dm.group(3)}-{dm.group(2)}-{dm.group(1)}"
    if not committee and title:
        committee = title.split(" : ")[0].strip()

    # The title block prints the status on its own last line: "... <br/>Review of ... Annual Report 2025<br/>Proof".
    status = None
    hm = re.search(r'class="hansardtitle">(.*?)</div>', page_html, re.S)
    if hm:
        lines = [SPACE_RE.sub(" ", htmlmod.unescape(TAG_RE.sub("", part))).strip()
                 for part in re.split(r"<br\s*/?>", hm.group(1))]
        lines = [ln for ln in lines if ln]
        if lines:
            sm = re.match(r"(proof|final)\b", lines[-1], re.I)
            if sm:
                status = sm.group(1).capitalize()

    q = quote(hearing_id, safe="").replace("/", "%2F")
    frags = {m.group(1) for m in re.finditer(rf"id={q}%2F(\d{{4}})", page_html, re.I)}
    frags |= {m.group(1) for m in re.finditer(
        rf"id=committees(?:%2F|/){re.escape(hearing_id.split('/')[1])}(?:%2F|/){re.escape(hearing_id.split('/')[2])}(?:%2F|/)(\d{{4}})",
        page_html, re.I)}
    frags.discard("0000")
    return TocInfo(status=status, committee_name=committee, date=day, title=title, fragment_ids=sorted(frags))


# ---------------------------------------------------------------------------
# Fragment: turns
# ---------------------------------------------------------------------------

_LABEL_CLASSES = {
    "HPS-OfficeCommittee": "chair",
    "HPS-MemberContinuation": "member",
    "HPS-MemberInterjecting": "member",
    "HPS-MemberQuestion": "member",
    "HPS-MemberWitness": "member",
    "HPS-WitnessName": "witness",
}
_STRUCTURAL_CLASSES = set(_LABEL_CLASSES) | {"HPS-GeneralBold"}
# Paragraph classes that carry speech. HPS-Small is an indented quotation inside someone's answer.
_CONTENT_PARAGRAPH_RE = re.compile(r'<p class="(?:HPS-Normal|HPS-Small)"[^>]*>(.*?)</p>', re.S)
_CHAIR_RE = re.compile(r"^(?:the\s+)?(?:acting\s+|deputy\s+)?chair(?:man|woman|person)?\b", re.I)
_PHID_RE = re.compile(r"handbook(?:%2F|/)allmps(?:%2F|/)([A-Za-z0-9]+)", re.I)
# Lines the reporter prints between speakers that belong to no one's speech.
_PROCEDURAL_RE = re.compile(
    r"^(?:committee|hearing|proceedings|sitting|the committee|the hearing)\s+(?:met|adjourned|suspended|resumed|commenced)\b"
    r"|^(?:short\s+)?suspension\b|^\[?\s*\d{1,2}\s*[:.]\s*\d{2}\s*\]?$", re.I)


class _Chunker(HTMLParser):
    """A paragraph as a flat list of (text, class of the innermost span, href of the enclosing link)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.chunks: list[tuple[str, str, str | None]] = []
        self._spans: list[str] = []
        self._links: list[str | None] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "span":
            self._spans.append(a.get("class") or "")
        elif tag == "a":
            self._links.append(a.get("href"))
        elif tag == "br":
            self.chunks.append((" ", self._spans[-1] if self._spans else "", None))

    def handle_endtag(self, tag):
        if tag == "span" and self._spans:
            self._spans.pop()
        elif tag == "a" and self._links:
            self._links.pop()

    def handle_data(self, data):
        self.chunks.append((data, self._spans[-1] if self._spans else "", self._links[-1] if self._links else None))


def _chunks(paragraph_html: str) -> list[tuple[str, str, str | None]]:
    c = _Chunker()
    c.feed(paragraph_html)
    c.close()
    return c.chunks


def _squash(text: str) -> str:
    return SPACE_RE.sub(" ", text.replace("\xa0", " ")).strip()


@dataclass
class _Label:
    name: str
    kind: str
    handbook_id: str | None
    named_as: str | None
    body: str


def _read_label(chunks: list[tuple[str, str, str | None]]) -> _Label | None:
    """The speaker label that opens a paragraph, or None when the paragraph is a continuation."""
    i = next((k for k, (t, _, _) in enumerate(chunks) if t.strip()), None)
    if i is None:
        return None
    text0, cls0, href0 = chunks[i]
    if cls0 not in _LABEL_CLASSES:
        return None
    m = _PHID_RE.search(href0 or "")
    phid = m.group(1) if m else None

    # Accumulate the label block: the label span, then only structural spans ("(", the name, "):") until the colon.
    head = text0
    k = i + 1
    colon = ":" in head
    while not colon and k < len(chunks):
        t, cls, href = chunks[k]
        if t.strip() and cls not in _STRUCTURAL_CLASSES:
            break
        if href and not phid:
            m2 = _PHID_RE.search(href)
            phid = m2.group(1) if m2 else None
        head += t
        k += 1
        colon = ":" in head
    if colon:
        label_part, _, rest = head.partition(":")
        body_chunks = [rest] + [t for t, _, _ in chunks[k:]]
    else:
        # No colon anywhere in the structural run: the label is just the first span; the body starts after it.
        label_part = text0
        body_chunks = [t for t, _, _ in chunks[i + 1:]]
        k = i + 1
    label_part = _squash(label_part)
    named_as = None
    pm = re.match(r"^(?P<lab>[^()]+?)\s*\((?P<par>[^)]*)\)?$", label_part)
    if pm and _CHAIR_RE.match(pm.group("lab").strip()):
        label_part = pm.group("lab").strip()
        named_as = _squash(pm.group("par")) or None
    kind = "chair" if _CHAIR_RE.match(label_part) else _LABEL_CLASSES[cls0]
    if kind == "chair" and label_part.lower().startswith("the "):
        label_part = label_part[4:]
    return _Label(name=label_part, kind=kind, handbook_id=phid, named_as=named_as, body=_squash("".join(body_chunks)).lstrip(": ").strip())


def _sum_link_pieces(content_html: str) -> list[str]:
    m = re.search(r'class="sumLink">(.*?)</span>', content_html, re.S)
    if not m:
        return []
    parts = re.split(r"<br\s*/?>", m.group(1))
    return [p for p in (_squash(htmlmod.unescape(TAG_RE.sub(" ", part))) for part in parts) if p]


def hearing_topic(committee: str, inquiry: str, sum_link_rest: list[str]) -> str:
    """'Committee - inquiry' (Senate Estimates: 'Committee - Additional Estimates 2025-2026 - DEFENCE PORTFOLIO - Agency').

    The committee's name stays in the topic because the site's committee labels and the knowledge box's `[topic]` prefix
    are read from it. The date the page also prints ("Committee 18/09/2026 Inquiry ...") is dropped, and the listing's
    inquiry title stands in when the page prints nothing after the date."""
    rest = [p for p in sum_link_rest if p]
    if not rest and inquiry:
        rest = [inquiry]
    parts = [committee] if committee else []
    parts += [p for p in rest if p.lower() != committee.lower()]
    return " - ".join(parts)


def parse_fragment(page_html: str, hearing: HearingMetadata, fragment_id: str,
                   carry: SpeechRecord | None = None) -> list[SpeechRecord]:
    """The turns of one transcript fragment.

    `carry` is the last turn of the previous fragment: a speech runs across fragment boundaries, and paragraphs that
    open a fragment without a label belong to that speaker. With no carry, paragraphs before the first label are dropped."""
    content_start = page_html.find('id="documentContent"')
    if content_start < 0:
        return []
    content_html = page_html[content_start:]
    doc_start = content_html.find('class="docDiv"')
    if doc_start < 0:
        return []
    doc_html = content_html[doc_start:]

    pieces = _sum_link_pieces(content_html)
    committee = hearing.committee_name or (pieces[0] if pieces else "")
    # pieces = [committee, date, *rest]; the date is dropped and the listing's inquiry title stands in when the page has none.
    rest = pieces[2:] if len(pieces) > 2 else []
    topic = hearing_topic(committee, hearing.inquiry_title, rest)

    turns: list[SpeechRecord] = []
    paras: list[list[str]] = []          # paragraphs per turn, joined at the end
    current: SpeechRecord | None = None
    frag_hearing_id = f"{hearing.hearing_id}/{fragment_id}"

    def start(name: str, kind: str, phid: str | None, named_as: str | None) -> SpeechRecord:
        rec = SpeechRecord(speaker_name=name, speaker_type=kind, text="", hearing_id=frag_hearing_id,
                           committee_name=committee, date=hearing.date, topic=topic, dataset=hearing.dataset,
                           handbook_id=phid, named_as=named_as)
        turns.append(rec)
        paras.append([])
        return rec

    for para_html in _CONTENT_PARAGRAPH_RE.findall(doc_html):
        chunks = _chunks(para_html)
        label = _read_label(chunks)
        if label is not None:
            current = start(label.name, label.kind, label.handbook_id, label.named_as)
            body = label.body
        else:
            body = _squash("".join(t for t, _, _ in chunks))
            if not body or (len(body) < 120 and _PROCEDURAL_RE.match(body)):
                continue          # a reporter's line ("Committee met at 09:30", "Proceedings suspended ..."), not speech
            if current is None:
                if carry is None:
                    # Before anyone has spoken: the In Attendance block of a Senate estimates fragment, or preamble.
                    # It belongs to no speaker (the old parser filed it under "UNKNOWN"); committee_witnesses reads
                    # the attendance block from the page itself.
                    continue
                # a speech that began in the previous fragment
                current = start(carry.speaker_name, carry.speaker_type, carry.handbook_id, carry.named_as)
        if body:
            paras[-1].append(body)

    out: list[SpeechRecord] = []
    for rec, parts in zip(turns, paras):
        rec.text = "\n\n".join(parts).strip()
        if rec.text:
            out.append(rec)
    return out


def fragment_hash(turns: list[SpeechRecord]) -> str:
    """Hash of what a fragment says (speaker label and text of every turn, in order), not of the page around it."""
    h = hashlib.sha256()
    for t in turns:
        h.update(t.speaker_name.encode("utf-8"))
        h.update(b"\t")
        h.update(t.text.encode("utf-8"))
        h.update(b"\n")
    return h.hexdigest()[:16]


def hearing_hash(fragment_hashes: dict[str, str]) -> str:
    h = hashlib.sha256()
    for frag in sorted(fragment_hashes):
        h.update(f"{frag}:{fragment_hashes[frag]}\n".encode("utf-8"))
    return h.hexdigest()[:16]


# ---------------------------------------------------------------------------
# Witness list
# ---------------------------------------------------------------------------

_START_WITNESS_RE = re.compile(r'<p class="HPS-StartWitness"[^>]*>(.*?)</p>', re.S)
_ORG_WORDS_RE = re.compile(
    r"\b(department|authority|agency|commission|commissioner|corporation|office of|council|board|bureau|limited|ltd|"
    r"pty|institute|university|association|federation|union|society|foundation|australia|australian|service|services|"
    r"private capacity|company|group|network|centre|center|college|school|hospital|police|force|bank|fund)\b", re.I)
_REMOTE_RE = re.compile(r"\s*\[(?:by|via)\s+[^\]]*\]\s*", re.I)


def surname_case(s: str) -> str:
    """'BULLOCK' -> 'Bullock', "O'LOUGHLIN" -> "O'Loughlin", 'MCDONALD' -> 'McDonald', 'LA RANCE' -> 'La Rance'."""
    out = []
    for word in s.split():
        if not word.isupper():
            out.append(word)
            continue
        parts = re.split(r"([-'’])", word)
        cased = []
        for p in parts:
            if p in {"-", "'", "’"}:
                cased.append(p)
            elif p.startswith("MC") and len(p) > 3:
                cased.append("Mc" + p[2:].capitalize())
            else:
                cased.append(p.capitalize())
        out.append("".join(cased))
    return " ".join(out)


def parse_witness_line(raw: str) -> WitnessEntry | None:
    """'EAGAR, Professor Kathleen (Kathy), Private capacity [by video link]' -> WitnessEntry."""
    text = SPACE_RE.sub(" ", htmlmod.unescape(TAG_RE.sub(" ", raw))).strip()
    if not text or "," not in text:
        return None
    remote = bool(_REMOTE_RE.search(text))
    text = _REMOTE_RE.sub(" ", text).strip(" ,")
    parts = [p.strip() for p in text.split(",")]
    surname_raw, second = parts[0], (parts[1] if len(parts) > 1 else "")
    if not surname_raw or not second:
        return None
    hon, cls, given_part = split_honorific(second)
    if not hon:
        return None            # a heading or a line that is not a person
    nick = re.search(r"\(([^)]+)\)", given_part)
    given = re.sub(r"\s*\([^)]*\)", "", given_part).strip()
    toks = given.split()
    post = []
    while len(toks) > 1 and toks[-1].isupper() and re.sub(r"[^A-Za-z]", "", toks[-1]).upper() in POSTNOMINALS:
        post.insert(0, toks.pop())
    given = " ".join(toks)
    first = nick.group(1).strip() if nick else given
    surname = surname_case(surname_raw)
    name = f"{first} {surname}".strip()
    tail = [p for p in parts[2:] if p]
    position = organisation = None
    if len(tail) == 1:
        if _ORG_WORDS_RE.search(tail[0]):
            organisation = tail[0]
        else:
            position = tail[0]
    elif len(tail) >= 2:
        position, organisation = ", ".join(tail[:-1]), tail[-1]
    return WitnessEntry(raw=text, surname=surname, name=name, honorific=hon.rstrip("."), honorific_class=cls,
                        postnominals=" ".join(post) or None, position=position, organisation=organisation, remote=remote)


def parse_witness_list(page_html: str) -> list[WitnessEntry]:
    """The witnesses named at the top of a fragment, in order (Senate estimates fragments have none; they carry an
    In Attendance block that parli.ingest.committee_witnesses.parse_attendance reads)."""
    out: list[WitnessEntry] = []
    for inner in _START_WITNESS_RE.findall(page_html):
        entry = parse_witness_line(inner)
        if entry:
            out.append(entry)
    return out
