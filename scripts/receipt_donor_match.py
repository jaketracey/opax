"""Conservative receipt-to-node lookup, without changing donor identities."""
import re
from collections import defaultdict
from dataclasses import dataclass

from scripts.donor_disclosure import clean_name, norm_exact


def bracketless_name(name):
    """Exact spelling key after removing complete, non-nested bracketed parts.

    Keep malformed or nested brackets intact. Never drop an unbracketed middle
    name, company suffix, branch word or any other token.
    """
    name = clean_name(name or "")
    stripped = re.sub(r"\([^()\[\]]*\)|\[[^()\[\]]*\]", " ", name)
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

    def match(self, donor):
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
                    result = ReceiptDonorMatch(next(iter(candidates)) if len(candidates) == 1 else None,
                                               method, candidates)
                    break
            self.cache[donor] = result
        return self.cache[donor]
