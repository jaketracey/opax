"""Conservative receipt-to-node lookup, without changing donor identities."""
import re
from collections import defaultdict
from dataclasses import dataclass

from scripts.donor_disclosure import clean_name, norm_exact

BRACKETS = re.compile(r"\(([^()\[\]]*)\)|\[([^()\[\]]*)\]")
ANNOTATION = re.compile(r"\b(?:see|notes?|pages?|annotations?)\b", re.I)
STATE = re.compile(r"\b(?:nsw|qld|vic|wa|sa|tas|act|nt|q|new south wales|queensland|victoria|"
                   r"western australia|south australia|tasmania|australian capital territory|northern territory)\b")


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
        self.cache = {}
        for node in nodes:
            if node["kind"] != "donor":
                continue
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
                    states = state_brackets(donor)
                    if method == "brackets" and len(candidates) == 1 and states:
                        node = next(iter(candidates))
                        if not any(not other or states == other for other in self.bracket_states[key][node]):
                            result = ReceiptDonorMatch(None, "state_mismatch", frozenset())
                            break
                    result = ReceiptDonorMatch(next(iter(candidates)) if len(candidates) == 1 else None,
                                               method, candidates)
                    break
            self.cache[donor] = result
        return self.cache[donor]
