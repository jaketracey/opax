"""One eligibility rule for typed party receipts, before any map donor cap."""
from collections import defaultdict
from dataclasses import dataclass

from parli.ingest.aec_receipts import period_key
from scripts.donor_disclosure import exact_alias_index, own_party_recipients, resolve_alias
from scripts.export_money_graph import PARTY_WORD_RE, PUBLIC_FUNDING_RE


@dataclass
class ReceiptSelection:
    aliases: dict
    exact: dict
    entity_kinds: dict
    recipient_party: dict
    flagged: set

    def entity(self, donor):
        return resolve_alias(donor, self.aliases, self.exact)

    def exclusion(self, donor, recipient, amount, period, recipient_kind, side="recipient"):
        """None means eligible in BOTH exports; map membership is applied later.

        Per-name exclusions still apply when an eligible canonical entity has
        another spelling on the map. Entity membership never overrides them.
        """
        if side != "recipient":
            return "not_recipient_side"
        if not donor or not recipient or not amount or amount <= 0:
            return "blank_or_nonpositive"
        if (donor, recipient, period_key(period), amount) in self.flagged:
            return "flagged_review"
        if recipient_kind != "political_party" or recipient not in self.recipient_party:
            return "nonparty_or_unmapped_recipient"
        if (self.entity_kinds.get(self.entity(donor)) in ("government", "party_unit")
                or PUBLIC_FUNDING_RE.search(donor) or PARTY_WORD_RE.search(donor)):
            return "government_or_internal"
        return None


def load_selection(db):
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    aliases = dict(db.execute("SELECT alias_raw,entity_id FROM ext_donor_aliases")) if "ext_donor_aliases" in tables else {}
    kinds = dict(db.execute("SELECT entity_id,kind FROM ext_donor_entities")) if "ext_donor_entities" in tables else {}
    parties, flagged = defaultdict(set), set()
    for donor, recipient, party, period, amount, flag in db.execute(
        "SELECT donor_name,recipient,recipient_canonical,financial_year,amount,donation_type FROM donations "
        "WHERE source IN ('aec_annual','aec_election','aec_referendum')"):
        if party:
            parties[recipient].add(party)
        if flag == "flagged_review":
            flagged.add((donor, recipient, period_key(period), amount))
    # export_money_graph rule 10: recipients the table leaves unbucketed that read as a party
    # selected in its own right (the Liberal Democrats / Libertarian Party), under its current name.
    for recipient, party in own_party_recipients(db).items():
        parties[recipient].add(party)
    return ReceiptSelection(aliases, exact_alias_index(aliases), kinds,
                            {name: next(iter(values)) for name, values in parties.items() if len(values) == 1}, flagged)
