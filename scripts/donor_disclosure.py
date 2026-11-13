"""Attach disclosure spelling, references and resolver evidence without hiding names.

The existing donor resolver remains authoritative. Rule matches are candidates;
only exact or curated matches at confidence 1 carry a profile link.

This module also holds the rules every federal money reader shares, so the map,
the disclosure catalogue and the grants donor summaries cannot drift apart:

* AEC_SOURCES / AEC_SOURCE_SQL: the federal `donations` rows that come from the
  AEC Transparency Register itself. The table also holds a third-party copy of
  AEC annual returns (`icacpls`, 2010-11 to 2017-18, which duplicates the AEC
  rows it was copied from) and Queensland ECQ state disclosures (`qld_ecq`, which
  belong to graph/money.qld.json and are read there from ext_donations). Neither
  may be counted or cited as an AEC return (findings money-donations-001, -004).
* clean_name: display form of a disclosed name. The AEC CSVs carry HTML entities
  ("&amp;", "&#39;", "&#160;") and an older load left cp1252 mojibake ("â€“");
  published labels, aliases and references show the decoded text. Joins still
  use the raw stored string (money-donations-011).
* norm_exact: the resolver's exact-tier key (parli/ingest/donor_entities.py keeps
  an identical copy), used to resolve a spelling loaded after the resolver last
  ran when it differs from a resolved alias only by case or punctuation.
"""
import html
import re
import unicodedata
from collections import defaultdict
from urllib.parse import quote

AEC_SOURCES = ("aec_annual", "aec_election", "aec_referendum")
AEC_SOURCE_SQL = "source IN ('aec_annual','aec_election','aec_referendum')"

def own_party_recipients(db) -> dict:
    """Rule 10: recipient spelling -> money-map party, for AEC rows with no canonical
    recipient whose name reads as a party selected in its own right."""
    from parli.ingest.money_aec_extras import current_party, own_party  # noqa: PLC0415
    out = {}
    if "recipient" not in {r[1] for r in db.execute("PRAGMA table_info(donations)")}:
        return out
    for (recipient,) in db.execute(
            f"SELECT DISTINCT recipient FROM donations WHERE (recipient_canonical IS NULL OR recipient_canonical = '') "
            f"AND {AEC_SOURCE_SQL}"):
        party = current_party(own_party(recipient))
        if party:
            out[recipient] = party
    return out


RETURN_TYPES = {"aec_annual": "AEC annual return", "aec_election": "AEC election return",
                "aec_referendum": "AEC referendum return", "vic_vec": "VEC donation return",
                "tas_tec": "TEC disclosure"}

# Mojibake: UTF-8 bytes read as cp1252 leave a lead byte (Â, Ã, â) followed by a
# cp1252 continuation character. Only such strings are re-decoded.
_MOJIBAKE = re.compile("[\u00c2\u00c3\u00e2][\u0080-\u00bf\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030"
                       "\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161"
                       "\u203a\u0153\u017e\u0178]")


# Only a complete, semicolon-terminated entity is decoded: html.unescape alone
# also reads "&not", "&reg" or "&para" without a semicolon, which a company name
# such as "Smith &Regal" must keep.
_ENTITY = re.compile(r"&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});")


def clean_name(name):
    """Decoded display form of a disclosed name: HTML entities (also double
    escaped) and cp1252 mojibake repaired, non-breaking spaces and runs of
    whitespace collapsed. Anything else is left exactly as disclosed."""
    if not isinstance(name, str):
        return name
    s = name
    for _ in range(2):
        t = _ENTITY.sub(lambda m: html.unescape(m.group(0)), s)
        if t == s:
            break
        s = t
    if _MOJIBAKE.search(s):
        try:
            s = s.encode("cp1252").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return re.sub(r"\s+", " ", s.replace("\u00a0", " ")).strip()


def norm_exact(name):
    """Case, punctuation, whitespace, '&'->'and', apostrophes joined (the
    resolver's exact tier; keep in step with parli/ingest/donor_entities.py)."""
    s = unicodedata.normalize("NFKD", clean_name(name or "")).encode("ascii", "ignore").decode("ascii").lower()
    s = s.replace("&", " and ").replace("+", " and ")
    s = re.sub(r"['’`´]", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def exact_alias_index(aliases):
    """{norm_exact key: entity_id} for keys that point at ONE entity only; a key
    two entities share (a person and a company split by the resolver) is left out."""
    seen = defaultdict(set)
    for raw, eid in aliases.items():
        seen[norm_exact(raw)].add(eid)
    return {k: next(iter(v)) for k, v in seen.items() if k and len(v) == 1}


def resolve_alias(name, aliases, exact_index):
    """Entity id for a raw donor name: its own alias row, else a resolved alias
    that differs from it only by case or punctuation (the resolver's exact tier,
    for spellings loaded after it last ran). None when neither holds."""
    if name in aliases:
        return aliases[name]
    return exact_index.get(norm_exact(name))


def _dedupe(names, drop=()):
    out, seen = [], {clean_name(d) for d in drop}
    for n in names:
        c = clean_name(n)
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def attach_donor_disclosures(db, graph, jurisdiction):
    have={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    aliases = {r[0]: {"entity_id": r[1], "confidence": r[2], "method": r[3]}
               for r in db.execute("SELECT alias_raw,entity_id,confidence,method FROM ext_donor_aliases")} if "ext_donor_aliases" in have else {}
    entities = {r[0]: {"name": r[1], "kind": r[2]}
                for r in db.execute("SELECT entity_id,canonical_name,kind FROM ext_donor_entities")} if "ext_donor_entities" in have else {}
    exact_index = exact_alias_index({k: v["entity_id"] for k, v in aliases.items()})

    def evidence_for(name):
        if name in aliases:
            return aliases[name]
        eid = exact_index.get(norm_exact(name))
        # Case or punctuation only: the confidence the resolver's exact tier gives.
        return {"entity_id": eid, "confidence": 1, "method": "exact"} if eid else None

    by_entity = defaultdict(list)
    for name, evidence in aliases.items():
        by_entity[evidence["entity_id"]].append(name)
    records = defaultdict(list)
    if jurisdiction == "federal":
        # AEC returns only: see AEC_SOURCES.
        # export_money_graph rule 10: rows to a party the table leaves unbucketed count as the map counts them.
        own = sorted(own_party_recipients(db))
        own_sql = f" OR recipient IN ({','.join('?' * len(own))})" if own else ""
        rows = db.execute("SELECT donor_name,amount,financial_year,source,donation_id,donation_type "
                          f"FROM donations WHERE amount>0 AND (recipient_canonical IS NOT NULL{own_sql}) "
                          f"AND donation_type!='flagged_review' AND {AEC_SOURCE_SQL}", own)
        for name, amount, year, source, row_id, kind in rows:
            records[name].append((amount, year, source, None, "https://transparency.aec.gov.au/", kind))
    else:
        # export_state_money rule 9: a gift with no recipient_party whose recipient reads as a party
        # selected in its own right (the Libertarian Party) is counted there, so it is referenced here.
        from parli.ingest.money_aec_extras import own_party  # noqa: PLC0415
        recipient = "recipient" if "recipient" in {c[1] for c in db.execute("PRAGMA table_info(ext_donations)")} else "NULL"
        rows = db.execute("SELECT donor_name,amount,financial_year,source,source_record_id,source_url,disclosure_type,"
                          f"recipient_party,{recipient} FROM ext_donations WHERE jurisdiction=? AND amount>0",
                          (jurisdiction,))
        for name, amount, year, source, record_id, url, kind, party, recipient in rows:
            if party or own_party(recipient):
                records[name].append((amount, year, source, record_id, url, kind))
    # A spelling loaded after the resolver last ran joins the entity it matches exactly.
    for name in list(records):
        eid = exact_index.get(norm_exact(name)) if name not in aliases else None
        if eid:
            by_entity[eid].append(name)
    for node in graph["nodes"]:
        if node.get("kind") != "donor":
            continue
        profile_name=clean_name(node["label"])
        names = {node["label"], *node.get("aliases", [])}
        candidates = {e["entity_id"] for e in (evidence_for(n) for n in names) if e}
        candidates.update(eid for eid, e in entities.items() if e["name"] in names)
        if node.get("entity_id") in entities:
            candidates.add(node["entity_id"])
        for eid in candidates:
            names.update(by_entity[eid])
        totals = {name: sum(r[0] for r in records[name]) for name in sorted(names) if records[name]}
        if totals:
            node["source_name"] = clean_name(max(totals, key=totals.get))
            node["lookup_names"] = [profile_name]
            # One spelling is shown as filed. A node that rolls several spellings
            # up (a union's branches, a company's variants) keeps its canonical
            # label: the biggest spelling is one branch, not the whole entity
            # (money-donations-007). source_name and aliases keep every spelling.
            if len({clean_name(n) for n in totals}) == 1:
                node["label"] = node["source_name"]
            else:
                node["label"] = profile_name
            node["aliases"] = _dedupe(sorted(totals), drop=[node["label"]])
        else:
            node["label"] = profile_name
            node["aliases"] = _dedupe(node.get("aliases", []), drop=[profile_name])
        if node.pop("_summarise_disclosures", False):
            source_rows=[r for name in totals for r in records[name]]
            node["has_disclosure_rows"]=bool(source_rows)
            if source_rows:
                years=[int(str(r[1])[:4]) for r in source_rows if str(r[1])[:4].isdigit()]
                node.update(total=sum(r[0] for r in source_rows), count=len(source_rows),
                            firstYear=min(years) if years else None, lastYear=max(years) if years else None,
                            industry="individual" if any(entities[eid]["kind"]=="person" for eid in candidates) else "other")
        evidence = [evidence_for(n) for n in totals]
        confident = bool(evidence) and len(candidates) == 1 and all(
            e and e["confidence"] == 1 and e["method"] in ("exact", "curated") for e in evidence)
        method = "curated" if confident and any(e["method"] == "curated" for e in evidence) else "exact" if confident else "rule" if evidence else "unresolved"
        node["match"] = {"confidence": 1 if confident else min([e["confidence"] for e in evidence if e] or [0]),
                         "method": method, "entity_id": next(iter(candidates)) if len(candidates) == 1 else None,
                         "href": "/subject/donor/" + quote(profile_name, safe="") if confident else None}
        refs = {}
        for name in totals:
            for amount, year, source, record_id, url, kind in records[name]:
                # Never the raw source key: an unknown source is a generic return.
                return_type = RETURN_TYPES.get(source) or ("ECQ " + (kind or "disclosure") if source == "qld_ecq" else "Disclosure return")
                ref = {"source_name": clean_name(name), "return_type": return_type, "year": year, "url": url}
                if record_id:
                    ref["transaction_id"] = record_id
                refs.setdefault((ref["source_name"], return_type, year, url), ref)
        node["returnReferences"] = list(refs.values()) or [{"return_type": graph["meta"].get("sourceShort", "Disclosure return"),
                                                          "year": node.get("firstYear"), "url": graph["meta"].get("source_url", "https://transparency.aec.gov.au/")}]
        if not confident:
            node.pop("profileUrl", None)
    return graph
