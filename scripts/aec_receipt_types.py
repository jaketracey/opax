"""Add the recipient-side measure without changing the legacy graph contract."""
from collections import defaultdict

from parli.ingest.aec_receipts import FILES, normal_type, period_key
from scripts.aec_receipt_selection import load_selection


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
    }
    return graph
