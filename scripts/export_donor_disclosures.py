"""Source-backed donor names referenced outside the bounded money graphs.

Reads the existing resolver and raw disclosures without modifying the corpus.
Reference-only candidates remain unlinked and never assert a donation amount.
"""
import argparse
import hashlib
import json
import os
import sqlite3
from pathlib import Path
from urllib.parse import quote

try:
    from scripts.donor_disclosure import attach_donor_disclosures, clean_name
except ModuleNotFoundError:
    from donor_disclosure import attach_donor_disclosures, clean_name

ROOT = Path(__file__).resolve().parents[1]


def published_references(public):
    candidates = {}

    def add(name, entity_id=None, aliases=(), references=(), source_path=None):
        if not isinstance(name, str) or not name.strip():
            return
        key = name.casefold().strip()
        item = candidates.setdefault(key, {"id": "donor:" + (entity_id or hashlib.sha256(key.encode()).hexdigest()[:20]),
                                          "label": name, "kind": "donor", "aliases": [], "references": []})
        if entity_id:
            item["entity_id"] = entity_id
        item["aliases"] = sorted(set(item["aliases"]) | {a for a in aliases if isinstance(a, str) and not a.isdigit()})
        item["references"].extend(references)
        if source_path:item["source_path"]=str(source_path.relative_to(public))

    def visit(value, source_path):
        if isinstance(value, dict):
            donor = value.get("d")
            if isinstance(donor, dict) and donor.get("e") and donor.get("n"):
                refs = []
                for grant in value.get("grants", [])[:1]:
                    refs.append({"return_type": "GrantConnect source record; electoral identity unconfirmed",
                                 "year": grant.get("fy") or str(grant.get("s") or "")[:4],
                                 "transaction_id": grant.get("id"),
                                 "url": "https://www.grants.gov.au/Ga/Show/" + grant["guid"] if grant.get("guid") else "https://www.grants.gov.au/Ga/List"})
                add(donor["n"], donor["e"], [donor.get("on")], refs, source_path)
            for key, child in value.items():
                if key == "donors" and isinstance(child, dict):
                    for name in child:
                        add(name, source_path=source_path)
                if key == "top_donors" and isinstance(child, list):
                    for row in child:
                        if row and isinstance(row[0], str):
                            add(row[0], source_path=source_path)
                if isinstance(child, (dict, list)):
                    visit(child, source_path)
        elif isinstance(value, list):
            for child in value:
                visit(child, source_path)

    for donor in indexed_off_map(public):
        add(donor["label"], donor["entity_id"], donor["aliases"])

    paths = [public / "access.json", public / "graph/grants.federal.json", public / "graph/grants.qld.json"]
    paths += sorted((public / "grants").glob("*/shard-*.json"))
    paths += sorted((public / "reports").glob("*.json"))
    for path in paths:
        if path.exists():
            visit(json.loads(path.read_text()), path)
    return list(candidates.values())


MONEY_GRAPHS = ["graph/money.json", "graph/money.qld.json", "graph/money.vic.json", "graph/money.tas.json"]


def attach_selected_federal_receipts(db, nodes):
    """Retained donor pages use the map's receipt selection without its drawing cap.

    The legacy donations table also contains donor-side declarations. Identity and
    source references still come from that table, but its sum is never a receipt
    figure. Equal recipient rows are genuine disclosed lines and remain separate.
    """
    from collections import defaultdict
    from parli.ingest.aec_receipts import FILES
    from scripts.aec_receipt_selection import load_selection
    from scripts.aec_receipt_types import add_receipt, receipt_cells, receipt_fields
    from scripts.export_money_graph import year_of

    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    expected = {(archive, name) for archive, names in FILES.items() for name in names}
    if not {'aec_receipt_records', 'aec_receipt_files'} <= tables or {
            tuple(r) for r in db.execute('SELECT archive,source_file FROM aec_receipt_files')} != expected:
        raise ValueError('Complete cached AEC receipt backfill required for retained donor figures')
    selection = load_selection(db)
    cells = defaultdict(receipt_cells)
    for donor, recipient, amount, period, kind, recipient_kind in db.execute(
            "SELECT donor_name,recipient,amount,financial_year,receipt_type,recipient_kind "
            "FROM aec_receipt_records WHERE record_side='recipient'"):
        if selection.exclusion(donor, recipient, amount, period, recipient_kind, receipt_type=kind):
            continue
        eid = selection.entity(donor)
        add_receipt(cells[('entity', eid) if eid else ('name', donor)], kind, period, amount)
    for node in nodes:
        eid = (node.get('match') or {}).get('entity_id') or selection.entity(node['label'])
        keys = {('entity', eid)} if eid else set()
        # Keep the published exact spellings too, as the map's name lookup does.
        # A resolved alias is already in its entity cell, never added twice.
        for name in [node['label'], node.get('source_name'), *node.get('aliases', []), *node.get('lookup_names', [])]:
            if not name:
                continue
            resolved = selection.entity(name)
            if not resolved:
                keys.add(('name', name))
            elif not eid:
                keys.add(('entity', resolved))
        selected = receipt_cells()
        for key in keys:
            for kind, amount in cells[key]['by_type'].items():
                selected['by_type'][kind] += amount
            for period, types in cells[key]['by_type_year'].items():
                for kind, (amount, count) in types.items():
                    selected['by_type_year'][period][kind][0] += amount
                    selected['by_type_year'][period][kind][1] += count
        typed = receipt_fields(selected)
        for field in ('total', 'count', 'byYear', 'firstYear', 'lastYear'):
            node.pop(field, None)
        node.update(typed)
        if not typed['by_type']:
            continue
        years = defaultdict(lambda: [0, 0])
        for period, types in typed['by_type_year'].items():
            year = year_of(period)
            if year:
                for amount, count in types.values():
                    years[str(year)][0] += amount
                    years[str(year)][1] += count
        node.update(total=round(sum(typed['by_type'].values()), 2),
                    count=sum(c[1] for t in typed['by_type_year'].values() for c in t.values()),
                    byYear={y: [round(c[0], 2), c[1]] for y, c in sorted(years.items())},
                    firstYear=min(map(int, years)) if years else None,
                    lastYear=max(map(int, years)) if years else None)
    return nodes


def indexed_off_map(public):
    """Donors the published index holds that the current money maps no longer draw.

    A donor can leave a map when another donor's gifts push it past the 250 cap. Its
    page and search result come from the index, so it is carried here as a candidate:
    its returns are summed from the database like any referenced donor's, and
    build_donor_index keeps it. A published donor page stays reachable.
    """
    index_path = public / "graph/donor-index.json"
    if not index_path.exists():
        return []
    drawn = set()
    for path in MONEY_GRAPHS:
        if (public / path).exists():
            graph = json.loads((public / path).read_text())
            for n in graph.get("nodes", []):
                if n.get("kind") == "donor":
                    drawn.update(name.casefold().strip() for name in [n.get("label"), n.get("source_name"), *n.get("lookup_names", [])] if name)
    out = []
    for n in json.loads(index_path.read_text()).get("donors", []):
        if n.get("kind") == "reference":
            continue
        names = [name for name in [n.get("label"), n.get("source_name"), *n.get("lookup_names", [])] if isinstance(name, str) and name.strip()]
        if not names or any(name.casefold().strip() in drawn for name in names):
            continue
        eid = (n.get("match") or {}).get("entity_id")
        out.append({"label": names[0], "entity_id": eid, "aliases": [*names[1:], *n.get("aliases", [])]})
    return out


def disclosure_catalog(db, candidates):
    donors = []
    for jurisdiction in ["federal", "qld", "vic", "tas"]:
        graph = {"meta": {"sourceShort": jurisdiction.upper() + " disclosure returns"},
                 "nodes": [{**n, "aliases": list(n["aliases"]), "_summarise_disclosures": True} for n in candidates]}
        attach_donor_disclosures(db, graph, jurisdiction)
        if jurisdiction == 'federal':
            attach_selected_federal_receipts(db, graph['nodes'])
        # Candidates are keyed by spelling, so two spellings of one resolved entity
        # come back as two identical records; publish one (money-donations-009).
        by_entity = {}
        for node in graph["nodes"]:
            if not node.pop("has_disclosure_rows", False):
                continue
            eid = (node.get("match") or {}).get("entity_id")
            first = by_entity.get(eid) if eid else None
            if first is not None and first.get("total") == node.get("total"):
                # Same entity, same returns: keep the first record and every name the other answered to.
                first["lookup_names"] = sorted({*first.get("lookup_names", []), *node.get("lookup_names", [])})
                first["aliases"] = sorted({*first.get("aliases", []), *node.get("aliases", [])} - {first["label"]})
                continue
            node["jurisdiction"] = jurisdiction
            node["id"] += ":" + jurisdiction
            node.pop("references", None)
            node.pop("entity_id", None)
            node.pop("source_path", None)
            donors.append(node)
            if eid:
                by_entity.setdefault(eid, node)
    # A resolver hint with no actual return is a source reference, not proof of a donation.
    covered = {name.casefold().strip() for n in donors for name in [n["label"], *n.get("lookup_names", [])]}
    references = []
    for candidate in candidates:
        label = clean_name(candidate["label"])
        if label.casefold().strip() in covered:
            continue
        refs = candidate["references"][:1] or [{"return_type":"Source export; electoral return unconfirmed", "url":"https://opax.com.au/"+candidate.get("source_path","methods")}]
        references.append({"id": candidate["id"], "label": label, "source_name": label,
                           "jurisdiction": "federal", "kind": "reference",
                           "lookup_names": sorted({clean_name(a) for a in candidate["aliases"]}),
                           "match": {"confidence": 0, "method": "unresolved", "href": None},
                           "returnReferences": refs,
                           "source_note": "Source reference only; no matching electoral return established."})
    return {"version": 2, "receiptSelection": "aec_receipt_selection.ReceiptSelection; uncapped recipient receipts only; donor declarations and public funding excluded", "donors": donors, "references": references}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=os.environ.get("OPAX_DB", str(ROOT / "parli.db")))
    parser.add_argument("--public", default=str(ROOT / "portal/public"))
    args = parser.parse_args()
    db = sqlite3.connect("file:" + quote(str(Path(args.db).resolve()), safe="/") + "?mode=ro", uri=True)
    db.execute("PRAGMA query_only=ON")
    try:
        result = disclosure_catalog(db, published_references(Path(args.public)))
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    finally:
        db.close()


if __name__ == "__main__":
    main()
