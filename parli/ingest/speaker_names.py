import re

# Postnominals seen in the corpus (zenodo 'Lastname, Firstname, MP'; occasional others)
_POSTNOMINALS = {"MP", "MLC", "MLA", "MHR", "AM", "AO", "OAM", "SC", "KC", "QC", "CSC"}

_HONORIFIC_RE = re.compile(
    r"^(?:(?:The\s+)?Hon\.?|Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Prof\.?|Senator|Sen\.?|Madam|Rev\.?)\s+",
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
}

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
    segs = [seg for seg in segs if seg.upper().rstrip(".") not in _POSTNOMINALS]
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

    # strip honorifics repeatedly ('The Hon. K.A. HILDYARD', 'Senator BARBARA POCOCK')
    prev = None
    while prev != s:
        prev = s
        s = _HONORIFIC_RE.sub("", s).strip()
    if not s:
        return None

    if re.sub(r"^the\s+", "", s.lower()) in _ROLE_LABELS:
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
