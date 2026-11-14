"""Shared receipt spelling lookup and explicit uncapped bracket identity recovery."""
import re
import json
from collections import defaultdict, Counter
from dataclasses import dataclass
from pathlib import Path

from scripts.donor_disclosure import clean_name, norm_exact

BRACKETS = re.compile(r"\(([^()\[\]]*)\)|\[([^()\[\]]*)\]")
ANNOTATION = re.compile(r"\b(?:see|notes?|pages?|annotations?)\b", re.I)
STATE = re.compile(r"\b(?:nsw|qld|vic|wa|sa|tas|act|nt|q|new south wales|queensland|victoria|"
                   r"western australia|south australia|tasmania|australian capital territory|northern territory)\b")
RETURNED = re.compile(r"\b(?:returned|refunded|refund|donations?\s+return)\b", re.I)
TRANSACTION = re.compile(r"\b(?:return\w*|refund\w*|loans?|lend\w*|repay\w*|repaid|reimburse\w*|"
                         r"revers\w*|cancel\w*|duplicates?|in[\s-]*kind|non[\s-]*cash)\b", re.I)
LEGAL_ENTITY = re.compile(r"\b(?:pty|ltd|limited|p\s*/\s*l|subsidiar\w*|franchise\w*|"
                          r"trustee\w*|trading|t\s*/\s*as|no\.?\s*\d+)\b", re.I)
SUFFIX = re.compile(r"\s+[-–—]\s*(donations?\s+return(?:ed)?|returned\s+donations?|refund(?:ed)?|loans?)\s*$", re.I)
RECEIPT_IDENTITY_RULE = (
    'Shared ReceiptDonorMatcher decisions for actual recipient disclosure spellings, '
    'using the reviewed money-identity-aliases.json independently of drawing membership. '
    'Transaction qualifiers retain their own identities; new legal entities stay separate '
    'and a new state spelling needs an existing reviewed branch. New personal middle-name '
    'recovery requires one plain base of matching known kind. Ambiguity is never broken '
    'by amount, year or map membership. Annotation restatements remain in review.')


def canonical_industries(db, selection):
    industries = defaultdict(Counter)
    for donor, amount, industry in db.execute(
            "SELECT donor_name,amount,industry FROM donations "
            "WHERE source IN ('aec_annual','aec_election','aec_referendum')"):
        if industry and industry not in ('other', 'unidentified'):
            industries[selection.entity(donor) or donor][industry] += amount or 0
    return {eid: 'unions' if selection.entity_kinds.get(eid) == 'union' else max(tags, key=tags.get)
            for eid, tags in industries.items()}


def reviewed_receipt_identities(db, selection):
    """Reviewed published identities, frozen independently of the drawing cap."""
    path = Path(__file__).resolve().parents[1] / 'portal/public/graph/money-identity-aliases.json'
    tags = canonical_industries(db, selection)
    return [{**n, 'aliases': receipt_identity_aliases(n),
             'industry': tags.get(selection.entity(n['label']), n.get('industry', 'other'))}
            for n in json.loads(path.read_text())['nodes']]


def transaction_parts(name):
    name = clean_name(name or '')
    parts = [m.group(1) or m.group(2) or '' for m in BRACKETS.finditer(name)]
    suffix = SUFFIX.search(name)
    return parts + ([suffix.group(1)] if suffix else [])


def has_transaction_qualifier(name):
    return any(TRANSACTION.search(part) for part in transaction_parts(name))


def transaction_key(name):
    return tuple(norm_exact(part) for part in transaction_parts(name) if TRANSACTION.search(part))


def receipt_identity_aliases(node):
    """A transaction-qualified spelling cannot be an alias of a plain donor."""
    return [name for name in node.get('aliases', []) if not has_transaction_qualifier(name)
            or transaction_key(name) == transaction_key(node['label'])]


def has_returned_qualifier(name):
    parts = transaction_parts(name)
    return any(RETURNED.search(part) and not LEGAL_ENTITY.search(part) for part in parts)


def bracket_fold_guard(name, kind, industry=None):
    """Brackets are not identity evidence when they describe a transaction/entity.

    Only an individual's interior middle-name form supplies additional identity
    recovery. Organisation descriptors (including acronyms, locations and business
    units) remain with their resolved entity; punctuation alone cannot prove that
    a franchise, subsidiary or branch is the same legal donor as a plain base.
    This rule never depends on whether either entity fits on the map.
    """
    name = clean_name(name)
    matches = list(BRACKETS.finditer(name))
    parts = [m.group(1) or m.group(2) or '' for m in matches]
    if any(TRANSACTION.search(part) for part in parts):
        return 'transaction_qualifier'
    if state_brackets(name):
        return 'state_branch'
    if any(LEGAL_ENTITY.search(part) for part in parts):
        return 'entity_qualifier'
    if kind == 'organisation' or industry not in (None, 'individual', 'other', 'unidentified'):
        return 'organisation_qualifier'
    if kind == 'individual' and matches and all(
            re.search(r'[A-Za-z]$', name[:m.start()].strip())
            and re.match(r'[A-Za-z]', name[m.end():].strip())
            and re.fullmatch(r"[A-Za-z][A-Za-z .'-]*", m.group(1) or m.group(2) or '')
            for m in matches):
        return None
    return 'identity_qualifier'


def has_receipt_annotation(name):
    """An instruction to consult an annotation is review evidence, not an alias."""
    return any(ANNOTATION.search(m.group(1) or m.group(2) or "")
               for m in BRACKETS.finditer(clean_name(name or "")))


def state_brackets(name):
    """Keep the exact normalised content of brackets naming an Australian state."""
    parts = [norm_exact(m.group(1) or m.group(2)) for m in BRACKETS.finditer(clean_name(name or ""))]
    return tuple(part for part in parts if STATE.search(part))


def bracketless_name(name):
    """Exact spelling key after removing complete, non-nested bracketed parts.

    Annotation-style brackets have no alias key. Keep malformed or nested brackets intact. Never drop an unbracketed middle
    name, company suffix, branch word or any other token.
    """
    name = clean_name(name or "")
    if has_receipt_annotation(name):
        return ""
    stripped = BRACKETS.sub(" ", name)
    return norm_exact(name if re.search(r"[()\[\]]", stripped) else stripped)


@dataclass(frozen=True)
class ReceiptDonorMatch:
    node_id: str | None
    method: str
    candidates: frozenset


class ReceiptDonorMatcher:
    """Existing raw/entity matches first; unique spelling fallbacks second.

    Index every label and alias against node ids, never a last-writer-wins
    dictionary. Two existing nodes keep their own exact matches even when their
    stripped keys collide. A new spelling that could name either stays out.
    Recipient/edge membership never breaks an identity tie.
    """

    def __init__(self, nodes, selection, reviewed_nodes=()):
        self.selection = selection
        self.entities = defaultdict(set)
        self.names = defaultdict(set)
        self.normalised = defaultdict(set)
        self.bracketless = defaultdict(set)
        self.bracket_states = defaultdict(lambda: defaultdict(set))
        self.base_names = defaultdict(set)
        self.nodes = {}
        self.kinds = {}
        self.cache = {}
        supplied = {n['id']: n for n in nodes}
        self.reviewed = {n['id']: n for n in reviewed_nodes}
        self.reviewed_lookup = {method: defaultdict(set) for method in ('entity', 'name', 'normalised', 'brackets')}
        for node in self.reviewed.values():
            for name in [node['label'], *node.get('aliases', [])]:
                for method, key in [('entity', selection.entity(name)), ('name', name),
                                    ('normalised', norm_exact(name)), ('brackets', bracketless_name(name))]:
                    if key:
                        self.reviewed_lookup[method][key].add(node['id'])
        for node in self.reviewed.values():
            if node['id'] in supplied:
                prior = supplied[node['id']]
                supplied[node['id']] = {**node, **prior, 'aliases': sorted(set(
                    [node['label'], *node.get('aliases', []), *prior.get('aliases', [])]) - {prior['label']})}
            else:
                supplied[node['id']] = node
        self.add_nodes(supplied.values())

    def add_nodes(self, nodes):
        selection = self.selection
        for node in nodes:
            if node["kind"] != "donor":
                continue
            self.nodes[node['id']] = node
            policy = self.reviewed.get(node['id'], node)
            labels = [policy['label'], *policy.get('aliases', [])]
            kinds = {selection.entity_kinds.get(selection.entity(name)) for name in labels}
            known = {'individual' if kind in ('individual', 'person') else 'organisation'
                     for kind in kinds if kind and kind != 'other'}
            self.kinds[node['id']] = next(iter(known)) if len(known) == 1 else (
                'individual' if not known and policy.get('industry') == 'individual' else
                'organisation' if not known and policy.get('industry') not in (None, 'other', 'unidentified') else None)
            for name in [node["label"], *node.get("aliases", [])]:
                self.names[name].add(node["id"])
                entity = selection.entity(name)
                if entity:
                    self.entities[entity].add(node["id"])
                for index, key in [(self.normalised, norm_exact(name)),
                                   (self.bracketless, bracketless_name(name))]:
                    if key:
                        index[key].add(node["id"])
                key = bracketless_name(name)
                if key:
                    self.bracket_states[key][node["id"]].add(state_brackets(name))
                # Folding has a direction: bracketed canonical label -> plain base.
                if bracketless_name(node['label']) == norm_exact(node['label']) and key == norm_exact(name):
                    self.base_names[key].add(node['id'])

    def _bracket_result(self, donor, candidates, reviewed=False):
        candidates = frozenset(candidates)
        states = state_brackets(donor)
        if len(candidates) == 1 and states and not reviewed:
            node = next(iter(candidates))
            if not any(not other or states == other for other in self.bracket_states[bracketless_name(donor)][node]):
                return ReceiptDonorMatch(None, 'state_mismatch', frozenset())
        if len(candidates) == 1:
            target = next(iter(candidates))
            node = self.reviewed[target] if reviewed else self.nodes[target]
            guard = bracket_fold_guard(donor, self.kinds[target], node.get('industry'))
            if has_transaction_qualifier(donor):
                return ReceiptDonorMatch(None, 'transaction_qualifier', frozenset())
            # Explicit published aliases remain identity evidence. A new legal
            # entity descriptor does not; a new branch needs an existing state
            # branch spelling, rather than just an unqualified national body.
            codes = {'new south wales':'nsw', 'queensland':'qld', 'q':'qld', 'victoria':'vic',
                     'western australia':'wa', 'south australia':'sa', 'tasmania':'tas',
                     'australian capital territory':'act', 'northern territory':'nt'}
            state_words = lambda name: {codes.get(m.group(), m.group()) for m in STATE.finditer(norm_exact(name))}
            reviewed_states = set().union(*(state_words(name) for name in [node['label'], *node.get('aliases', [])]))
            explicit_state = bool(reviewed_states) and state_words(donor) <= reviewed_states
            permitted = (guard is None or guard == 'state_branch' and explicit_state
                         or reviewed and guard == 'organisation_qualifier' and bool(node.get('aliases')))
            if not permitted:
                return ReceiptDonorMatch(None, guard, frozenset())
        return ReceiptDonorMatch(next(iter(candidates)) if len(candidates) == 1 else None, 'brackets', candidates)

    def _lookup(self, donor, allowed=None, reviewed=False):
        for method, index, key in [
            ('entity', self.entities, self.selection.entity(donor)),
            ('name', self.names, donor),
            ('normalised', self.normalised, norm_exact(donor)),
            ('brackets', self.bracketless, bracketless_name(donor)),
        ]:
            if reviewed:
                index = self.reviewed_lookup[method]
            candidates = frozenset(index.get(key, ()))
            if allowed is not None:
                candidates &= allowed
            if not candidates:
                continue
            if method == 'brackets':
                return self._bracket_result(donor, candidates, reviewed)
            if has_transaction_qualifier(donor):
                candidates = frozenset(c for c in candidates if norm_exact(self.nodes[c]['label']) == norm_exact(donor))
                if not candidates:
                    return ReceiptDonorMatch(None, 'transaction_qualifier', frozenset())
            return ReceiptDonorMatch(next(iter(candidates)) if len(candidates) == 1 else None, method, candidates)
        return ReceiptDonorMatch(None, 'unmatched', frozenset())

    def bracket_folds(self, active_ids=None):
        """Explicit uncapped identity recovery; ordinary match() never merges nodes.

        Use the same bracket normalisation and candidate ambiguity. Preserve
        transaction qualifiers, branches and separately resolved organisations.
        Require one plain base before checking kind; kind cannot break a tie.
        Only selected recipient identities participate, independent of map caps.
        """
        active = set(self.nodes) if active_ids is None else set(active_ids)
        folds, decisions = {}, []
        for source in sorted(active):
            node = self.nodes[source]
            key = bracketless_name(node['label'])
            if not key or key == norm_exact(node['label']):
                continue
            candidates = (self.base_names[key] & active) - {source}
            if not candidates:
                variants = self.bracketless[key] & active
                # Several bracketed identities with no plain anchor cannot pick
                # a base for each other. Keep and list the entire tied group.
                if len(variants) > 1:
                    candidates = variants
            # New entity folds retain the conservative guard; a reviewed lookup
            # above is the only way to preserve an existing organisation alias.
            result = ReceiptDonorMatch(next(iter(candidates)) if len(candidates) == 1 else None, 'brackets', frozenset(candidates))
            status = 'ambiguous' if len(result.candidates) > 1 else 'no_base'
            if result.method == 'state_mismatch':
                status = 'state_mismatch'
            elif result.node_id:
                target = result.node_id
                status = 'kind_mismatch'
                if self.kinds[source] and self.kinds[source] == self.kinds[target]:
                    status = bracket_fold_guard(node['label'], self.kinds[source], node.get('industry')) or 'folded'
                    if status == 'folded':
                        folds[source] = target
            decisions.append({'source': source, 'status': status, 'method': result.method,
                              'candidates': sorted(candidates), **({'target': folds[source]} if source in folds else {})})
        return folds, decisions

    def match(self, donor):
        if has_receipt_annotation(donor):
            return ReceiptDonorMatch(None, "annotation_review", frozenset())
        if donor not in self.cache:
            result = self._lookup(donor, self.reviewed.keys(), reviewed=True) if self.reviewed else self._lookup(donor)
            if result.method == 'unmatched':
                result = self._lookup(donor)
            self.cache[donor] = result
        return self.cache[donor]
