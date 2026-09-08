"""Conservative publication gates, separate from raw candidate extraction."""
import re

GENERIC_ALIASES = {
    'our community', 'the farm', 'economic development', 'vocational education and training',
    'australian public service', 'public service', 'local government', 'regional development',
    'the treasury', 'the government', 'federal government', 'state government',
    'commonwealth government', 'the department', 'the council', 'social services',
    'community services', 'national security', 'foreign affairs', 'family services',
}
SUFFIXES={'pty','ltd','limited','proprietary','inc','incorporated','co','company'}
NOISE=SUFFIXES | {'the','and','of','australia','australian','services','group'}


def words(value):
    return tuple(re.findall(r'[^\W_]+',str(value or '').casefold()))


def publishable_alias(quote,name):
    q=words(quote); n=words(name)
    if ' '.join(q) in GENERIC_ALIASES or len(q)<2:
        return False
    if q[0] in {'our','your','their','this','these','those'} and not set(q)&SUFFIXES:
        return False
    if any(phrase in ' '.join(n) for phrase in ['inter agency transfers','accounts receivable','receipts and payments']):
        return False
    # Loose historical aliases can connect unrelated entities. Publish full
    # canonical names and their corporate-suffix variants; review others.
    qcore=set(q)-SUFFIXES-{'the'}; ncore=set(n)-SUFFIXES-{'the'}
    return bool(qcore-NOISE) and qcore==ncore
