"""Conservative publication gates, separate from raw candidate extraction."""
import re

GENERIC_ALIASES = {
    'our community', 'the farm', 'economic development', 'vocational education and training',
    'australian public service', 'public service', 'local government', 'regional development',
    'the treasury', 'the government', 'federal government', 'state government',
    'commonwealth government', 'the department', 'the council', 'social services',
    'community services', 'national security', 'foreign affairs', 'family services',
}

# Source-backed semantic review: docs/operations/alias-quality-review.json.
# Only the ambiguous bare phrase is withheld; complete legal names remain eligible.
REVIEWED_AMBIGUOUS_PHRASES = {
    'order in',
    'in control',
    'department of foreign',
    'water resources',
    'on the line',
    'full support',
    'private company',
    'that works',
    'department of immigration and',
    'national park',
    'main roads',
    'council of australian',
    'mineral resources',
    'capital equipment',
    'building and construction industry',
    'market access',
    'professional development',
    'business leaders',
    'from the front',
    'have limited',
    'sense of security',
    'australian institute',
    'queensland state government',
    'behind closed doors',
    'the sacred',
    'new law',
    'professional services',
    'primary health care',
    'international education',
    'organisation for economic co-operation',
    'equal access',
    'natural resource management',
    'medical staff',
    'forward it',
    'australian college',
    'teachers federation',
    'australian business and',
    'rehabilitation services',
    'technical and further education',
    'australian experience',
}
# Second source-backed review: alias-quality-review-second.json.
REVIEWED_AMBIGUOUS_PHRASES.update({
    'national roads',
    'rural bank',
    'group training',
    'project management',
    'public purpose',
    'the waves',
    'the big picture',
    'international standard',
    'medical devices',
    'bank interest',
    'transport service',
    'medical training',
    'maintain australia',
    'social outcomes',
    'australian council for',
    'practical outcomes',
    'the glue',
    'department of the prime minister',
    'company director',
    'the australian association of',
    'division 5',
    'the leading edge',
    'melbourne conference',
    'national association of',
    'proper business',
    'let australia',
    'the lounge',
    'study group',
    'advanced technology',
    'department of education, employment',
    'all aged care',
    'community broadcasting',
    'breath of fresh air',
    'shipping containers',
    'labor council',
    'safe and healthy',
    'david smith',
})
SUFFIXES={'pty','ltd','limited','proprietary','inc','incorporated','co','company'}
NOISE=SUFFIXES | {'the','and','of','australia','australian','services','group'}


def words(value):
    return tuple(re.findall(r'[^\W_]+',str(value or '').casefold()))


REVIEWED_AMBIGUOUS_KEYS = {words(value) for value in REVIEWED_AMBIGUOUS_PHRASES}


def publishable_alias(quote,name):
    q=words(quote); n=words(name)
    if ' '.join(q) in GENERIC_ALIASES or q in REVIEWED_AMBIGUOUS_KEYS or len(q)<2:
        return False
    if q[0] in {'our','your','their','this','these','those'} and not set(q)&SUFFIXES:
        return False
    if any(phrase in ' '.join(n) for phrase in ['inter agency transfers','accounts receivable','receipts and payments']):
        return False
    # Loose historical aliases can connect unrelated entities. Publish full
    # canonical names and their corporate-suffix variants; review others.
    qcore=set(q)-SUFFIXES-{'the'}; ncore=set(n)-SUFFIXES-{'the'}
    return bool(qcore-NOISE) and qcore==ncore


def publishable_programme(quote,name):
    # Programme names are often generic phrases. Require a complete name with
    # a programme marker before treating prose as a named-programme mention.
    q=words(quote);n=words(name)
    markers={'program','programme','scheme','initiative','fund','allowance','scholarships','strategy','grants'}
    return q==n and len(q)>=3 and bool(set(q)&markers)
