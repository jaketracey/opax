"""Display-only passage cleanup; source text and evidence offsets stay immutable."""
import html
import re

_BLOCKS = set('p div br li ul ol h1 h2 h3 h4 h5 h6 tr table blockquote section article header footer dd dt dl pre hr'.split())
_TAG = re.compile(r'''</?([a-z][\w:-]*)(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?/?>''', re.I)
_INLINE = '\x00'
_JOINS = (
    (r'\b(Opposition senators)(?=interjecting\b)', r'\1 '),
    (r'\b(Senator Allison)(?=until\b)', r'\1 '),
    (r'\b(whistleblowers)(?=Andrew Wilkie\b)', r'\1 '),
    (r'\b([Ww]hen)(Malcolm Turnbull|Joe Hockey)was\b', r'\1 \2 was'),
)


def normalize_passage(value: str) -> str:
    # Strip actual markup before decoding, so encoded literal tags remain text.
    text = re.sub(r'<!--[\s\S]*?-->', _INLINE, value or '')
    text = _TAG.sub(lambda m: '\n' if m[1].lower() in _BLOCKS else _INLINE, text)
    text = html.unescape(text)  # One pass: &amp;#38; remains &#38;.
    text = re.sub(r'(?<=\w)\x00+(?=\w)', ' ', text).replace(_INLINE, '')
    # Audited losses from get_text(strip=True) in historical OpenAustralia rows.
    # Avoid general camel-case splitting: McDonald, eBay and acronyms are words.
    for pattern, replacement in _JOINS:
        text = re.sub(pattern, replacement, text)
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
