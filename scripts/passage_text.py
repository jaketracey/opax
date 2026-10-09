"""Display-only passage cleanup; source text and evidence offsets stay immutable."""
import html
import json
from pathlib import Path
import re
import unicodedata

_BLOCKS = set('p div br li ul ol h1 h2 h3 h4 h5 h6 tr table blockquote section article header footer dd dt dl pre hr'.split())
_TAG = re.compile(r'''</?([a-z][\w:-]*)(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?/?>''', re.I)
_INLINE = '\x00'
def _roster_names():
    # Read the source roster directly: standalone Python exporters must not
    # depend on a portal build having generated the compact Worker projection.
    people = json.loads((Path(__file__).resolve().parents[1] / 'portal/public/parliamentarians.json').read_text())['people']
    full_names, surnames = set(), set()
    for person in people:
        name = re.sub(r'\s+', ' ', person.get('full') or person.get('name') or '')
        name = re.sub(r'^(?:(?:Senator|Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Hon\.?|Reverend|the)\s+)+', '', name, flags=re.I).strip()
        parts = name.split(' ')
        if sum(char.isalpha() for char in parts[-1]) >= 2:
            surnames.add(parts[-1])
        if len(parts) >= 2 and sum(char.isalpha() for char in parts[0]) >= 2 and any(char.islower() for char in parts[0]):
            full_names.add(name)
    longest = lambda values: sorted(values, key=lambda value: (-len(value), value))
    return dict(full_names=longest(full_names), surnames=longest(surnames),
                honorifics=['Senator', 'Mrs', 'Mr', 'Ms', 'Dr'],
                function_words=longest('was is has had and the until who said to of in on for that will would as at by from with when which'.split()))


_ROSTER = _roster_names()
_INTERJECTION = re.compile(r'(?<!\w)([^\W\d_]+?)(interjecting|interjections|interjection)(?!\w)', re.I)
_alternatives = lambda values: '|'.join(re.escape(v) for v in values)
_FIRST = ''.join(sorted({name[0] for name in _ROSTER['full_names'] + _ROSTER['honorifics']}))
_NAMES = re.compile(
    '(?=[' + re.escape(_FIRST) + '])' + r'(?P<name>(?P<full>' + _alternatives(_ROSTER['full_names']) + r')|(?:'
    + _alternatives(_ROSTER['honorifics']) + r') (?:' + _alternatives(_ROSTER['surnames'])
    + r'))(?P<function>' + _alternatives(_ROSTER['function_words']) + r')?'
)


def _word(char: str) -> bool:
    return bool(char) and (char.isalnum() or char == '_' or unicodedata.category(char).startswith('M'))


def repair_passage_joins(text: str) -> tuple[str, dict[str, int]]:
    """Only markers and complete roster names; never split general camel case."""
    counts = dict(interjection=0, before_name=0, after_name=0)

    def marker(match):
        before = text[match.start()-1] if match.start() else ''
        after = text[match.end():match.end()+1]
        if not match[1].isalpha() or _word(before) or _word(after):
            return match[0]
        counts['interjection'] += 1
        return match[1] + ' ' + match[2]

    text = _INTERJECTION.sub(marker, text)

    def name(match):
        before = text[match.start()-1] if match.start() else ''
        after = text[match.end():match.end()+1]
        if _word(after):
            return match[0]  # A name embedded in a longer word is not a match.
        prefix = bool(match['full']) and 'a' <= before <= 'z'
        # Other honorifics often introduce non-roster names (Mr Jenkinson,
        # Ms Erin). Only the requested Senator surname form is safe here.
        suffix = bool(match['function']) and bool(match['full'] or match['name'].startswith('Senator ')) and (prefix or not _word(before))
        counts['before_name'] += int(prefix)
        counts['after_name'] += int(suffix)
        return (' ' if prefix else '') + match['name'] + (' ' if suffix else '') + (match['function'] or '')

    return _NAMES.sub(name, text), counts


def normalize_passage(value: str) -> str:
    # Strip actual markup before decoding, so encoded literal tags remain text.
    text = re.sub(r'<!--[\s\S]*?-->', _INLINE, value or '')
    text = _TAG.sub(lambda m: '\n' if m[1].lower() in _BLOCKS else _INLINE, text)
    text = html.unescape(text)  # One pass: &amp;#38; remains &#38;.
    text = re.sub(r'(?<=\w)\x00+(?=\w)', ' ', text).replace(_INLINE, '')
    text, _ = repair_passage_joins(text)
    text = re.sub(r'[^\S\n]+', ' ', text)
    text = re.sub(r' *\n *', '\n', text)
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def passage_window(text: str, limit: int = 600, start: int = 0, end: int | None = None) -> str:
    """Window already-normalized text; the cap includes any cut markers."""
    if limit <= 0:
        return ''
    start = min(len(text), max(0, start))
    while start > 0 and not text[start - 1].isspace():
        start -= 1
    while start < len(text) and text[start].isspace():
        start += 1
    prefix = '… ' if text[:start].strip() else ''
    stop = min(len(text), end if end is not None else len(text), start + max(0, limit - len(prefix)))
    suffix = ' …' if text[stop:].strip() else ''
    stop = min(stop, start + max(0, limit - len(prefix) - len(suffix)))
    while stop > start and stop < len(text) and not text[stop].isspace() and not text[stop - 1].isspace():
        stop -= 1
    body = text[start:stop].strip()
    return (prefix + body + suffix).strip() if body else ('…' if text.strip() else '')


def evidence_excerpt(body: str, start: int, end: int) -> str:
    """Rebuild an old sidecar window against its unchanged source coordinates."""
    # Convert the original span to display coordinates before taking context.
    left = len(normalize_passage(body[:start]))
    right = len(normalize_passage(body[:end]))
    return passage_window(normalize_passage(body), start=max(0, left - 160), end=right + 160)
