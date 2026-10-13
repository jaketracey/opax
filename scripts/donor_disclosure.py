"""Attach disclosure spelling, references and resolver evidence without hiding names.

The existing donor resolver remains authoritative. Rule matches are candidates;
only exact or curated matches at confidence 1 carry a profile link.
"""
from collections import defaultdict
from urllib.parse import quote


def attach_donor_disclosures(db, graph, jurisdiction):
    have={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    aliases = {r[0]: {"entity_id": r[1], "confidence": r[2], "method": r[3]}
               for r in db.execute("SELECT alias_raw,entity_id,confidence,method FROM ext_donor_aliases")} if "ext_donor_aliases" in have else {}
    entities = {r[0]: {"name": r[1], "kind": r[2]}
                for r in db.execute("SELECT entity_id,canonical_name,kind FROM ext_donor_entities")} if "ext_donor_entities" in have else {}
    by_entity = defaultdict(list)
    for name, evidence in aliases.items():
        by_entity[evidence["entity_id"]].append(name)
    records = defaultdict(list)
    if jurisdiction == "federal":
        rows = db.execute("SELECT donor_name,amount,financial_year,source,donation_id,donation_type "
                          "FROM donations WHERE amount>0 AND recipient_canonical IS NOT NULL "
                          "AND donation_type!='flagged_review'")
        for name, amount, year, source, row_id, kind in rows:
            records[name].append((amount, year, source, None, "https://transparency.aec.gov.au/", kind))
    else:
        rows = db.execute("SELECT donor_name,amount,financial_year,source,source_record_id,source_url,disclosure_type "
                          "FROM ext_donations WHERE jurisdiction=? AND amount>0 AND recipient_party IS NOT NULL",
                          (jurisdiction,))
        for name, amount, year, source, record_id, url, kind in rows:
            records[name].append((amount, year, source, record_id, url, kind))
    for node in graph["nodes"]:
        if node.get("kind") != "donor":
            continue
        profile_name=node["label"]
        names = {node["label"], *node.get("aliases", [])}
        candidates = {aliases[n]["entity_id"] for n in names if n in aliases}
        candidates.update(eid for eid, e in entities.items() if e["name"] in names)
        if node.get("entity_id") in entities:
            candidates.add(node["entity_id"])
        for eid in candidates:
            names.update(by_entity[eid])
        totals = {name: sum(r[0] for r in records[name]) for name in sorted(names) if records[name]}
        if totals:
            node["source_name"] = max(totals, key=totals.get)
            node["lookup_names"] = [node["label"]]
            node["aliases"] = sorted(totals)
            node["label"] = node["source_name"]
            node["aliases"] = [n for n in node["aliases"] if n != node["label"]]
        if node.pop("_summarise_disclosures", False):
            source_rows=[r for name in totals for r in records[name]]
            node["has_disclosure_rows"]=bool(source_rows)
            if source_rows:
                years=[int(str(r[1])[:4]) for r in source_rows if str(r[1])[:4].isdigit()]
                node.update(total=sum(r[0] for r in source_rows), count=len(source_rows),
                            firstYear=min(years) if years else None, lastYear=max(years) if years else None,
                            industry="individual" if any(entities[eid]["kind"]=="person" for eid in candidates) else "other")
        evidence = [aliases.get(n) for n in totals]
        confident = bool(evidence) and len(candidates) == 1 and all(
            e and e["confidence"] == 1 and e["method"] in ("exact", "curated") for e in evidence)
        method = "curated" if confident and any(e["method"] == "curated" for e in evidence) else "exact" if confident else "rule" if evidence else "unresolved"
        node["match"] = {"confidence": 1 if confident else min([e["confidence"] for e in evidence if e] or [0]),
                         "method": method, "entity_id": next(iter(candidates)) if len(candidates) == 1 else None,
                         "href": "/subject/donor/" + quote(profile_name, safe="") if confident else None}
        refs = {}
        for name in totals:
            for amount, year, source, record_id, url, kind in records[name]:
                return_type = {"aec_annual": "AEC annual return", "aec_election": "AEC election return",
                               "aec_referendum": "AEC referendum return", "qld_ecq": "ECQ " + (kind or "disclosure"),
                               "vic_vec": "VEC donation return", "tas_tec": "TEC disclosure"}.get(source, source or "Disclosure return")
                ref = {"source_name": name, "return_type": return_type, "year": year, "url": url}
                if record_id:
                    ref["transaction_id"] = record_id
                refs.setdefault((name, return_type, year, url), ref)
        node["returnReferences"] = list(refs.values()) or [{"return_type": graph["meta"].get("sourceShort", "Disclosure return"),
                                                          "year": node.get("firstYear"), "url": graph["meta"].get("source_url", "https://transparency.aec.gov.au/")}]
        if not confident:
            node.pop("profileUrl", None)
    return graph
