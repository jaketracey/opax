"""Display-only passage cleanup; source text and evidence offsets stay immutable."""
import html
import json
from pathlib import Path
import re
import unicodedata

_BLOCKS = set('p div br li ul ol h1 h2 h3 h4 h5 h6 tr table blockquote section article header footer dd dt dl pre hr'.split())
_TAGS = _BLOCKS | set('a abbr acronym address area audio b base bdi bdo big body button canvas caption center cite code col colgroup data datalist del details dfn dialog em embed fieldset figcaption figure font form head html i iframe img input ins kbd label legend link main map mark menu meta meter nav noscript object optgroup option output param picture progress q rp rt ruby s samp script select slot small source span strike strong style sub summary sup tbody td template textarea tfoot th thead time title track tt u var video wbr'.split())
_WHITESPACE = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
_SPACE = re.compile('[' + re.escape(_WHITESPACE) + ']+')
_HORIZONTAL = re.compile('[' + re.escape(_WHITESPACE.replace('\n', '')) + ']+')
_TAG_HEAD = re.compile(r'</?([a-z][a-z0-9]*)', re.I | re.A)
_ENTITY = re.compile(r'&(?:#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);')
_INLINE = '\x00'
_TITLES = re.compile(r'^(?:(?:Senator|Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Hon\.?|Reverend|the)\s+)+', re.I)
def _roster_names():
    # Read the source roster directly: standalone Python exporters must not
    # depend on a portal build having generated the compact Worker projection.
    people = json.loads((Path(__file__).resolve().parents[1] / 'portal/public/parliamentarians.json').read_text())['people']
    full_names, surnames, name_tokens = set(), set(), set()
    for person in people:
        for value in (person.get('full'), person.get('name')):
            name_tokens.update(token.lower() for token in _SPACE.split(_TITLES.sub('', value or '').strip(_WHITESPACE)) if token)
        name = _SPACE.sub(' ', person.get('full') or person.get('name') or '')
        name = _TITLES.sub('', name).strip(_WHITESPACE)
        parts = name.split(' ')
        if sum(char.isalpha() for char in parts[-1]) >= 2:
            surnames.add(parts[-1])
        if len(parts) >= 2 and sum(char.isalpha() for char in parts[0]) >= 2 and any(char.islower() for char in parts[0]):
            full_names.add(name)
    longest = lambda values: sorted(values, key=lambda value: (-len(value), value))
    return dict(full_names=longest(full_names), surnames=longest(surnames), name_tokens=longest(name_tokens),
                honorifics=['Senator', 'Mrs', 'Mr', 'Ms', 'Dr'],
                function_words=longest('was has had and until who said of for that will would from with when which'.split()))


_ROSTER = _roster_names()
_NAME_TOKENS = set(_ROSTER['name_tokens']) | {name.lower() for name in _ROSTER['surnames']}
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
        if match['function'] and (match['name'].split(' ')[-1] + match['function']).lower() in _NAME_TOKENS:
            return match[0]
        prefix = bool(match['full']) and 'a' <= before <= 'z'
        # Other honorifics often introduce non-roster names (Mr Jenkinson,
        # Ms Erin). Only the requested Senator surname form is safe here.
        suffix = bool(match['function']) and bool(match['full'] or match['name'].startswith('Senator ')) and (prefix or not _word(before))
        counts['before_name'] += int(prefix)
        counts['after_name'] += int(suffix)
        return (' ' if prefix else '') + match['name'] + (' ' if suffix else '') + (match['function'] or '')

    return _NAMES.sub(name, text), counts


def _strip_markup(text: str) -> str:
    """Scan each candidate once, including unterminated tags and comments."""
    parts, cursor, copied = [], 0, 0
    while True:
        at = text.find('<', cursor)
        if at < 0:
            break
        if text.startswith('<!--', at):
            end = text.find('-->', at + 4)
            if end < 0:
                break
            stop, replacement = end + 3, _INLINE
        else:
            head = _TAG_HEAD.match(text, at)
            if not head or head[1].lower() not in _TAGS:
                cursor = at + 1
                continue
            stop = head.end()
            if stop < len(text) and text[stop] not in _WHITESPACE + '/>':
                cursor = stop
                continue
            quote = ''
            while stop < len(text):
                char = text[stop]
                if quote:
                    if char == quote:
                        quote = ''
                elif char in ('"', "'"):
                    quote = char
                elif char in '<>':
                    break
                stop += 1
            if stop == len(text):
                break
            if text[stop] == '<':
                cursor = stop
                continue
            stop += 1
            replacement = '\n' if head[1].lower() in _BLOCKS else _INLINE
        parts.extend((text[copied:at], replacement))
        copied = cursor = stop
    parts.append(text[copied:])
    return ''.join(parts)


def _decode_entity(match):
    entity = match[0]
    if entity.startswith('&#'):
        digits = entity[2:-1]
        try:
            code = int(digits[1:], 16) if digits[:1].lower() == 'x' else int(digits)
        except ValueError:
            return '\ufffd'
        if code == 0 or 0xd800 <= code <= 0xdfff or code > 0x10ffff:
            return '\ufffd'
        # HTML's Windows-1252 C1 remap; retain other controls/noncharacters,
        # matching entities.decodeHTMLStrict rather than html.unescape.
        if 0x80 <= code <= 0x9f:
            return html.unescape(entity)
        return chr(code)
    return html.entities.html5.get(entity[1:], entity)


def normalize_passage(value: str) -> str:
    # Strip actual known markup before one strict, semicolon-only entity pass.
    text = _ENTITY.sub(_decode_entity, _strip_markup(value or ''))
    text = re.sub(r'(?<=\w)\x00+(?=\w)', ' ', text).replace(_INLINE, '')
    text, _ = repair_passage_joins(text)
    text = _HORIZONTAL.sub(' ', text)
    text = re.sub(r' *\n *', '\n', text)
    return re.sub(r'\n{3,}', '\n\n', text).strip(_WHITESPACE)


def passage_window(text: str, limit: int = 600, start: int = 0, end: int | None = None) -> str:
    """Window normalized text with UTF-16 offsets/cap, including cut markers."""
    if limit <= 0:
        return ''
    data = text.encode('utf-16-le', 'surrogatepass')
    length = len(data) // 2
    char = lambda at: chr(data[2 * at] | data[2 * at + 1] << 8)
    take = lambda a, b=length: data[2*a:2*b].decode('utf-16-le', 'surrogatepass')
    start = min(length, max(0, start))
    end = min(length, max(0, end if end is not None else length))
    while start > 0 and char(start - 1) not in _WHITESPACE:
        start -= 1
    while start < length and char(start) in _WHITESPACE:
        start += 1
    prefix = '… ' if take(0, start).strip(_WHITESPACE) else ''
    stop = min(length, end, start + max(0, limit - len(prefix)))
    suffix = ' …' if take(stop).strip(_WHITESPACE) else ''
    stop = min(stop, start + max(0, limit - len(prefix) - len(suffix)))
    while stop > start and stop < length and char(stop) not in _WHITESPACE and char(stop - 1) not in _WHITESPACE:
        stop -= 1
    body = take(start, stop).strip(_WHITESPACE)
    return (prefix + body + suffix).strip(_WHITESPACE) if body else ('…' if text.strip(_WHITESPACE) else '')


def evidence_excerpt(body: str, start: int, end: int) -> str:
    """Rebuild an old sidecar window against its unchanged source coordinates."""
    # Convert the original span to display coordinates before taking context.
    left = len(normalize_passage(body[:start]).encode('utf-16-le', 'surrogatepass')) // 2
    right = len(normalize_passage(body[:end]).encode('utf-16-le', 'surrogatepass')) // 2
    return passage_window(normalize_passage(body), start=max(0, left - 160), end=right + 160)
