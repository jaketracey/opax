"""Add the recipient-side measure without changing the legacy graph contract."""
from collections import defaultdict

from parli.ingest.aec_receipts import FILES, normal_type, period_key
from parli.ingest.money_aec_extras import canon_party
from scripts.aec_receipt_selection import load_selection
from scripts.export_money_graph import PUBLIC_FUNDING_RE, load_associated_register, norm_key

PARTY_RETURN_NOTE = (
    "return_by_type and return_by_type_year on a federal party node count the itemised receipts in the party's own "
    "annual returns (AEC Detailed Receipts, Political Party Return), each receipt line once and all receipt types, so a "
    "gift the donor also declared is never added twice. A return is counted under the party its name reads as when "
    "that party is on the map, otherwise under the existing recipient mapping (so Country Labor Party is counted with "
    "Labor and Country Liberal Party (NT) on its own, as the AEC's Party Group has them). Left out: public funding "
    "(receipt type Public Funding, a public-funding or government payer name, or a payer the resolver knows as a "
    "government body), flagged data-quality outliers, blank or non-positive lines, and transfers within the party. "
    "A line is a transfer within the party only if the payer's own returns are counted in the same node: the payer "
    "is a party unit, the same rule places it in this node, and it is not on the AEC associated-entity register. "
    "That money was counted when the paying branch received it, so it is left out rather than keyed; "
    "party_return_transfers gives it per party as [AUD, lines]. A payer whose returns are counted in another node, "
    "or in none, is counted as a receipt, as are associated entities. Amounts under the disclosure threshold are not "
    "itemised by the AEC and are not here, so these figures are well below the AEC's Total Receipts. A node with no "
    "counted line has no return fields. Unlike the legacy total, count and byYear, these fields hold no donor-side "
    "declarations; unlike by_type on a party node, they are not capped to donors drawn on the map."
)


def receipt_cells():
    return {"by_type": defaultdict(float), "by_type_year": defaultdict(lambda: defaultdict(lambda: [0.0, 0]))}


def add_receipt(agg, receipt_type, period, amount):
    kind = normal_type(receipt_type)
    agg["by_type"][kind] += amount
    cell = agg["by_type_year"][period_key(period) or "undated"][kind]
    cell[0] += amount
    cell[1] += 1


def receipt_fields(agg):
    # Preserve cents: unlike the legacy display totals these cells are a measure.
    return {"by_type": {k: round(v, 2) for k, v in sorted(agg["by_type"].items())},
            "by_type_year": {y: {k: [round(v[0], 2), v[1]] for k, v in sorted(types.items())}
                             for y, types in sorted(agg["by_type_year"].items())}}


def attach_receipt_types(db, graph):
    have = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='aec_receipt_records'").fetchone()
    files = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='aec_receipt_files'").fetchone()
    expected = {(archive, name) for archive, names in FILES.items() for name in names}
    if not have or not files or {tuple(r) for r in db.execute("SELECT archive,source_file FROM aec_receipt_files")} != expected:
        graph["meta"]["receipt_types"] = {"available": False, "reason": "Complete cached AEC receipt backfill required"}
        return graph
    selection = load_selection(db)
    node_for_entity, node_for_name = {}, {}
    for n in graph["nodes"]:
        if n["kind"] != "donor":
            continue
        for name in [n["label"], *n.get("aliases", [])]:
            node_for_name[name] = n["id"]
            eid = selection.entity(name)
            if eid:
                node_for_entity[eid] = n["id"]
    by_edge, by_node = defaultdict(receipt_cells), defaultdict(receipt_cells)
    edge_keys = {(e["source"], e["target"]) for e in graph["edges"] if not e.get("grant") and not e.get("flow")}
    counts = defaultdict(int)
    for donor, recipient, amount, period, kind, recipient_kind in db.execute(
        "SELECT donor_name,recipient,amount,financial_year,receipt_type,recipient_kind FROM aec_receipt_records WHERE record_side='recipient'"):
        counts["recipient_rows"] += 1
        reason = selection.exclusion(donor, recipient, amount, period, recipient_kind)
        if reason:
            counts["excluded_" + reason] += 1
            continue
        source = node_for_entity.get(selection.entity(donor)) or node_for_name.get(donor)
        key = (source, "party:" + selection.recipient_party[recipient])
        if key not in edge_keys:
            counts["excluded_donor_or_edge_outside_map"] += 1
            continue
        add_receipt(by_edge[key], kind, period, amount)
        add_receipt(by_node[source], kind, period, amount)
        add_receipt(by_node[key[1]], kind, period, amount)
        counts["exported_rows"] += 1
    for edge in graph["edges"]:
        key = (edge["source"], edge["target"])
        if key in edge_keys:
            edge.update(receipt_fields(by_edge[key]))
    for node in graph["nodes"]:
        if node["kind"] in ("donor", "party"):
            node.update(receipt_fields(by_node[node["id"]]))
    party_counts, transfers = attach_party_returns(db, graph, selection)
    years = sorted({period_key(r[0]) for r in db.execute(
        "SELECT DISTINCT financial_year FROM aec_receipt_records WHERE source_file='Detailed Receipts.csv'") if r[0]})
    graph["meta"]["receipt_types"] = {
        "schema": 1,
        "available": True,
        "annual_financial_years": years,
        "measure": "Recipient-side itemised receipts only. Donor-side declarations are cross-checks, never added. Equal rows within a recipient file are retained as disclosed.",
        "legacy_totals": "total, count and byYear are unchanged legacy all-record aggregates. They include donor declarations and must not be used as the typed receipt measure.",
        "fields": "by_type contains AUD amounts; by_type_year maps financial year (short form) or election/referendum event to type: [AUD, row count]. Node cells sum visible receipt edges only, unlike legacy party node totals.",
        "normalisation": "AEC labels lowercased, punctuation/whitespace replaced with underscores. Donation Received = donation_received. Blank = unknown. Unspecified remains unspecified. No inference of loans from Other Receipt.",
        "scope": "Political Party Return recipients with an exact unambiguous existing party mapping, and donor-party edges on this map. Other recipient kinds remain in aec_receipt_records. This is a capped donor map, not all AEC receipts.",
        "selection": "aec_receipt_selection.ReceiptSelection.exclusion is shared with the uncapped report: recipient-side positive itemised party receipts, exact recipient mapping, no reviewed outliers, government/party-unit entities or public-funding/party-name donor spellings. Map edge membership is the additional cap.",
        "donation_type": "donation_received",
        "counts": dict(counts),
        "party_return_note": PARTY_RETURN_NOTE,
        "party_return_counts": party_counts,
        "party_return_transfers": transfers,
    }
    return graph


def party_node(selection, parties, name):
    """The party node whose total counts this filer's returns.

    A party return is counted under the party its name reads as (the AEC
    extras grammar, canon_party) when that party is on the map, otherwise under
    the existing recipient mapping. The AEC's own Party Group agrees for the
    three filers where the two differ: Country Labor Party is grouped with
    Labor, The ACT Greens with the Greens, and Country Liberal Party (NT) with
    no other party. The same function places a payer, so "the payer's own
    returns are counted in this node" is one test.
    """
    read = canon_party(name)
    if read and "party:" + read in parties:
        return "party:" + read
    mapped = selection.recipient_party.get(name)
    return "party:" + mapped if mapped else None


def party_return_exclusion(selection, register, parties, donor, recipient, amount, period, receipt_type, recipient_kind):
    """(node, why the line stays out of return_by_type or None when it counts)."""
    if not donor or not recipient or not amount or amount <= 0:
        return None, "blank_or_nonpositive"
    node = party_node(selection, parties, recipient) if recipient_kind == "political_party" else None
    if not node:
        return None, "nonparty_or_unmapped_recipient"
    if node not in parties:
        return node, "party_not_on_map"
    if (donor, recipient, period_key(period), amount) in selection.flagged:
        return node, "flagged_review"
    entity = selection.entity(donor)
    kind = selection.entity_kinds.get(entity)
    if normal_type(receipt_type) == "public_funding" or PUBLIC_FUNDING_RE.search(donor) \
            or PUBLIC_FUNDING_RE.search(norm_key(donor)) or kind == "government":
        return node, "public_funding"
    # A transfer within the party: a party unit whose own returns this node
    # already counts, and not an associated entity (those file no party return).
    if kind == "party_unit" and party_node(selection, parties, donor) == node \
            and not ({entity, norm_key(donor)} - {None, ""}) & register.keys():
        return node, "party_transfer"
    return node, None


def attach_party_returns(db, graph, selection):
    """The party's whole return, each line once: new fields beside the capped by_type cells."""
    parties = {n["id"]: n for n in graph["nodes"] if n["kind"] == "party"}
    register = load_associated_register(db, selection.aliases, selection.exact)
    cells, counts = defaultdict(receipt_cells), defaultdict(int)
    transfers = defaultdict(lambda: [0.0, 0])
    for donor, recipient, amount, period, kind, recipient_kind in db.execute(
            "SELECT donor_name,recipient,amount,financial_year,receipt_type,recipient_kind FROM aec_receipt_records "
            "WHERE record_side='recipient' AND source_file='Detailed Receipts.csv'"):
        node, reason = party_return_exclusion(selection, register, parties, donor, recipient, amount, period, kind, recipient_kind)
        if reason:
            counts["excluded_" + reason] += 1
            if reason == "party_transfer":
                transfers[node][0] += amount
                transfers[node][1] += 1
            continue
        add_receipt(cells[node], kind, period, amount)
        counts["exported_rows"] += 1
    for node_id, node in parties.items():
        # A node with no counted line gets no fields, so readers keep its record total, never $0.
        if node_id not in cells:
            continue
        fields = receipt_fields(cells[node_id])
        node["return_by_type"], node["return_by_type_year"] = fields["by_type"], fields["by_type_year"]
    return dict(sorted(counts.items())), {k[6:]: [round(v[0], 2), v[1]] for k, v in sorted(transfers.items())}
