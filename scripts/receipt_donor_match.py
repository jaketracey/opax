"""Shared receipt spelling lookup and explicit uncapped bracket identity recovery."""
import re
from collections import defaultdict
from dataclasses import dataclass

from scripts.donor_disclosure import clean_name, norm_exact

BRACKETS = re.compile(r"\(([^()\[\]]*)\)|\[([^()\[\]]*)\]")
ANNOTATION = re.compile(r"\b(?:see|notes?|pages?|annotations?)\b", re.I)
STATE = re.compile(r"\b(?:nsw|qld|vic|wa|sa|tas|act|nt|q|new south wales|queensland|victoria|"
                   r"western australia|south australia|tasmania|australian capital territory|northern territory)\b")
RETURNED = re.compile(r"\b(?:returned|refunded)\b", re.I)
TRANSACTION = re.compile(r"\b(?:return\w*|refund\w*|loans?|lend\w*|repay\w*|repaid|reimburse\w*|"
                         r"revers\w*|cancel\w*|duplicates?|in[\s-]*kind|non[\s-]*cash)\b", re.I)
LEGAL_ENTITY = re.compile(r"\b(?:pty|ltd|limited|p\s*/\s*l|subsidiar\w*|franchise\w*|"
                          r"trustee\w*|trading|t\s*/\s*as|no\.?\s*\d+)\b", re.I)


def has_returned_qualifier(name):
    parts = [m.group(1) or m.group(2) or '' for m in BRACKETS.finditer(clean_name(name or ''))]
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

    def __init__(self, nodes, selection):
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
        for node in nodes:
            if node["kind"] != "donor":
                continue
            self.nodes[node['id']] = node
            labels = [node['label'], *node.get('aliases', [])]
            kinds = {selection.entity_kinds.get(selection.entity(name)) for name in labels}
            known = {'individual' if kind in ('individual', 'person') else 'organisation'
                     for kind in kinds if kind and kind != 'other'}
            self.kinds[node['id']] = next(iter(known)) if len(known) == 1 else (
                'individual' if not known and node.get('industry') == 'individual' else
                'organisation' if not known and node.get('industry') not in (None, 'other', 'unidentified') else None)
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

    def _bracket_result(self, donor, candidates):
        candidates = frozenset(candidates)
        states = state_brackets(donor)
        if len(candidates) == 1 and states:
            node = next(iter(candidates))
            if not any(not other or states == other for other in self.bracket_states[bracketless_name(donor)][node]):
                return ReceiptDonorMatch(None, 'state_mismatch', frozenset())
        return ReceiptDonorMatch(next(iter(candidates)) if len(candidates) == 1 else None, 'brackets', candidates)

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
            result = self._bracket_result(node['label'], candidates)
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
            result = ReceiptDonorMatch(None, "unmatched", frozenset())
            for method, index, key in [
                ("entity", self.entities, self.selection.entity(donor)),
                ("name", self.names, donor),
                ("normalised", self.normalised, norm_exact(donor)),
                ("brackets", self.bracketless, bracketless_name(donor)),
            ]:
                candidates = frozenset(index.get(key, ()))
                if candidates:
                    # Do not use state filtering to choose between existing nodes.
                    # A unique node still needs a compatible alias: NSW cannot
                    # reach it solely through a QLD spelling. An unqualified
                    # spelling retains the existing organisation/branch model.
                    if method == "brackets":
                        result = self._bracket_result(donor, candidates)
                        break
                    result = ReceiptDonorMatch(next(iter(candidates)) if len(candidates) == 1 else None,
                                               method, candidates)
                    break
            self.cache[donor] = result
        return self.cache[donor]
