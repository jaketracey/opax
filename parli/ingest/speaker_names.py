import re

# Postnominals seen in the corpus (zenodo 'Lastname, Firstname, MP'; occasional others)
_POSTNOMINALS = {"MP", "MLC", "MLA", "MHR", "AM", "AO", "OAM", "SC", "KC", "QC", "CSC"}
# Comma segments that are neither a name nor a postnominal: 'Katter, Bob, Jnr, MP' (the son of a
# former member of the same name) and 'Bird, Sharon, MEMBER OF PARLIAMENT' are two-segment prints.
_SUFFIX_SEGMENTS = {"JNR", "JR", "SNR", "SR", "MEMBER OF PARLIAMENT"}

_HONORIFIC_RE = re.compile(
    r"^(?:(?:The\s+)?(?:Right\s+|Rt\.?\s+)?Hon(?:ourable|\.)?|Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Prof\.?|Senator|Sen\.?|Madam|"
    r"Reverend|Rev\.?)\s+",
    re.IGNORECASE,
)

# Office labels that are not a person's name (compared after honorific strip, lowercased,
# leading 'the ' removed)
_ROLE_LABELS = {
    "speaker", "deputy speaker", "acting speaker", "temporary speaker",
    "president", "deputy president", "acting president", "deputy-president",
    "chair", "deputy chair", "acting chair", "chairman",
    "clerk", "clerk assistant", "acting clerk",
    "unknown", "stage direction", "business start", "honourable members",
    # Hansard's group interjection labels: a side of the chamber, not a member
    "honourable member", "an honourable member", "government members", "government member",
    "a government member", "opposition members", "opposition member", "an opposition member",
}

# What is left once the honorifics are stripped from a print that never named anyone: a bare title
# ('Mr', 'Senator', 'The Hon.') or a parse fragment the NSW Hansard split leaves ('ON', 'ER' from
# 'Mr SPEAK ER'; a lone 'de'). Lowercased, dots dropped.
_NOT_A_NAME = {
    "mr", "mrs", "ms", "miss", "dr", "prof", "hon", "the hon", "honourable", "the honourable", "right hon",
    "the right hon", "rt hon", "senator", "sen", "madam", "rev", "reverend", "sir", "dame",
    "on", "er", "de",
}
# Committees' own anonymised labels for protected witnesses ('Witness A', 'Witness 6'): legitimate
# source labels a speech can keep, but not a person for a people directory.
_ANONYMISED_RE = re.compile(r"^witness\s+(?:[a-z]|\d{1,3})$", re.IGNORECASE)


def non_person_name(name: str | None) -> bool:
    """True when a normalised speaker name is not a person: a group label ('Government members'),
    a bare honorific ('Mr', 'Senator'), a parse fragment ('On', 'Er') or an anonymised witness
    ('Witness A'). The roster (scripts/export_parliamentarians.py) and the speaker directory
    (scripts/export_speakers.py) both leave these out, by this one rule."""
    key = re.sub(r"\s+", " ", (name or "").replace(".", " ")).strip().lower()
    if not key:
        return True
    return (key in _NOT_A_NAME or re.sub(r"^the ", "", key) in _ROLE_LABELS
            or bool(_ANONYMISED_RE.match(key)))

# 'Mr DEPUTY SPEAKER (Mr Nehl)' / 'The Acting Speaker (Daniela De Martino)':
# the real person is inside the parentheses.
_ROLE_WITH_NAME_RE = re.compile(
    r"^(?:the\s+|mr\s+|madam\s+)?(?:acting\s+|deputy\s+|temporary\s+)?"
    r"(?:speaker|president|chair(?:man)?)\s*\((?P<inner>[^)]+)\)\s*$",
    re.IGNORECASE,
)


def _recase_token(tok: str) -> str:
    """Title-case an ALL-CAPS name token; leave initials and mixed case alone."""
    if re.fullmatch(r"(?:[A-Z]\.)+[A-Z]?\.?", tok):         # dotted initials: 'K.A.' stays
        return tok
    if re.fullmatch(r"Mc[A-Z]{2,}", tok):                   # McCLELLAND -> McClelland
        return "Mc" + tok[2:].capitalize()
    if re.fullmatch(r"Mac[A-Z]{2,}", tok):
        return "Mac" + tok[3:].capitalize()
    if not tok.isupper() or len(tok) <= 1:
        # already mixed case: only fix lowercase after O'/D' ('O’brien' -> 'O’Brien')
        return re.sub(r"^([OD]['’])([a-z])", lambda m: m.group(1) + m.group(2).upper(), tok)
    parts = re.split(r"([-'’])", tok)                       # keep hyphens/apostrophes
    out = []
    for p in parts:
        if p in {"-", "'", "’"}:
            out.append(p)
        elif p.startswith("MC") and len(p) > 2:
            out.append("Mc" + p[2:].capitalize())
        else:
            out.append(p.capitalize())
    return "".join(out)


def normalize_speaker(raw: str) -> str | None:
    """Map any source's speaker_name string to a 'Firstname Lastname' display form.

    Handles the formats observed per source:
      zenodo           'Grace, Elizabeth, MP' / 'Champion, Nick MP' / 'TRUSS,MP'
      nsw_hansard      'Mr GARETH WARD' / 'The Hon. DON HARWIN' / 'Dr M. O'NEILL (Coogee)—'
      committee_senate 'Senator HUME' / 'Senator BARBARA POCOCK' / 'Mr Pye' (witnesses)
      vic_hansard      'Tim Richardson' / 'Ms Kealy' / 'The Acting Speaker (Paul Hamer)'
      sa_hansard       'Mr TEAGUE' / 'The Hon. K.A. HILDYARD'
      wragge_xml       'Mr PRICE' / 'Mrs ELIZABETH GRACE'
      qld_hansard      'Ms FENTIMAN' / 'Hon. SJ HINCHLIFFE'
      act_hansard      'Ms Castley' / 'Mr Deputy Speaker' (honorific + surname, surname title-cased)
      openaustralia    'Susan Templeman' (already clean)

    Returns None for office/procedural labels ('SPEAKER', 'The Chair', 'UNKNOWN',
    'stage direction') and unusable fragments. Sources that record surname only
    ('Mr TEAGUE', 'Senator HUME') come back as the cased surname ('Teague');
    recovering the first name requires the person_id -> members join, not this function.
    """
    if raw is None:
        return None
    s = raw.strip().rstrip("—–-").rstrip(",. ").strip()
    if len(s) < 2:
        return None

    # 'SPEAKER, The' -> 'The SPEAKER'
    m = re.fullmatch(r"(.+?),\s*The", s, flags=re.IGNORECASE)
    if m:
        s = "The " + m.group(1)

    # role label that carries the actual person in parentheses -> use that person
    m = _ROLE_WITH_NAME_RE.match(s)
    if m:
        return normalize_speaker(m.group("inner"))

    # drop remaining parentheticals: electorate '(Coogee)', region '(Western Victoria)',
    # full given names '(Anthony Charles)', suffix '(Jr)', trailing role '(The DEPUTY SPEAKER)'
    s = re.sub(r"\s*\([^)]*\)?", "", s).strip()

    # comma segments; drop postnominal-only segments ('MP', incl. unspaced 'TRUSS,MP')
    # and postnominal tokens stuck on a segment's end ('Champion, Nick MP')
    segs = [seg.strip() for seg in s.split(",") if seg.strip()]
    segs = [seg for seg in segs if seg.upper().rstrip(".") not in _POSTNOMINALS | _SUFFIX_SEGMENTS]
    segs = [re.sub(r"\s+(?:" + "|".join(_POSTNOMINALS) + r")$", "", seg) for seg in segs]
    segs = [seg for seg in segs if seg]
    if not segs:
        return None
    if len(segs) == 2:                                      # 'Lastname, Firstname' -> swap
        s = f"{segs[1]} {segs[0]}"
    else:
        s = " ".join(segs)

    s = re.sub(r"^By\s+", "", s)                            # vic petitions: 'By Ms Ryan'
    s = re.sub(r"^r\s+(?=[A-Z])", "", s)                    # NSW OCR damage: 'r MARK TAYLOR'

    # a group label that starts like a title ('Honourable members') is a label, not 'members'
    if re.sub(r"^the\s+", "", s.lower()) in _ROLE_LABELS:
        return None

    # strip honorifics repeatedly ('The Hon. K.A. HILDYARD', 'Senator BARBARA POCOCK')
    prev = None
    while prev != s:
        prev = s
        s = _HONORIFIC_RE.sub("", s).strip()
    if not s:
        return None

    if re.sub(r"^the\s+", "", s.lower()) in _ROLE_LABELS:
        return None
    # a bare title or a fragment ('Mr', 'Senator', 'ON'); an anonymised witness keeps its label
    if non_person_name(s) and not _ANONYMISED_RE.match(s.strip()):
        return None

    tokens = s.split()
    out = []
    for i, tok in enumerate(tokens):
        # undotted leading initials with no vowels ('SJ HINCHLIFFE') stay uppercase;
        # 'ST' is the St-Clair-style name particle, not initials
        if i == 0 and len(tokens) > 1 and tok != "ST" and re.fullmatch(r"[B-DF-HJ-NP-TV-XZ]{2,3}", tok):
            out.append(tok)
        else:
            out.append(_recase_token(tok))
    return " ".join(out) or None
