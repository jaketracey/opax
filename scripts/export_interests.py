#!/usr/bin/env python3
"""
Export the registers of members' interests (ext_interests on parli.db, see
docs/DATA-INTERESTS.md) as one static file the portal serves as-is for the
"Declared interests" section of person pages. Runs on the data box and writes
one small file per person plus an index (a single combined file would be
~760KB, most of it never read by any one page):

  mkdir -p /tmp/opax-interests-export
  scp scripts/export_interests.py portal/public/{access,fits}.json \
      portal/public/graph/money.json desktop:/tmp/opax-interests-export/
  ssh desktop 'rm -rf /tmp/interests && python3 /tmp/opax-interests-export/export_interests.py \
      --out /tmp/interests --money /tmp/opax-interests-export/money.json \
      --access /tmp/opax-interests-export/access.json --fits /tmp/opax-interests-export/fits.json'
  rsync -a --delete desktop:/tmp/interests/ portal/public/interests/

Without --out the combined object is printed to stdout (handy for analysis).

  interests/index.json
  {"_meta":    {"generated": "2026-09-02", "rows": 8237, "people": 244, ...},
   "_by_name": {"anthony albanese": "10007", "jessica pugh": "n-jessica-pugh", ...},
   "people":   {"10007": {"name": "Anthony Albanese", "total": 28}, ...}}

  interests/10007.json  (one per key; the combined stdout form nests these by key)
  {"name": "Anthony Albanese", "jurisdiction": "federal", "chamber": "house",
                "parliament": 48, "source_url": "https://static.aph.gov.au/.../Albanese_48P.pdf?...",
                "as_at": "2026-08-14", "statement_date": null,
                "total": 63, "ocr_rows": 0, "unread_pages": 10,
                "alterations": {"added": 12, "deleted": 3},
                "buckets": {"shareholdings": {"count": 3, "items": [
                   {"holder": "self", "description": "Australian Ethical Investments",
                    "kind": "statement", "date": null, "page": 2}, ...]}, ...}}}

  interests/recent.json
  {"meta": {"generated": "2026-09-04", "rows": 300, "available": 1660},
   "items": [{"id": 123, "person_id": "10007", "name": "Anthony Albanese",
              "bucket": "gifts", "kind": "addition", "date": "2026-08-14",
              "description": "...", "url": "https://...#page=12", "ties": [...]}, ...]}

Federal members are keyed by members.person_id, the same id photos/people.json
resolves a name to. Queensland members and the documents the loader could not
match to `members` are keyed by a name slug ("n-jessica-pugh"): the qld_la rows
in `members` are surname-only and collapse different people (qld_james is both
the Barron River and the Mulgrave member), and people.json carries no QLD ids
at all. `_by_name` maps every lowercased member name (straight and curly
apostrophe forms) to its key so the page can resolve either way.

Per bucket the items are the six most recent entries: alterations newest
first (by their submitted date), then statement rows in document order. The
count is the bucket's full row count. A row is one cell of the form, so a
comma list of eight memberships typed in one cell counts once; rows whose
every field is a nil placeholder ("Nil applicable") are dropped. Item
descriptions are the printed cell values joined with " · " and cut at ~120
characters. The page link is built client-side as source_url + "#page=" +
page; an item carries its own "url" only when it comes from a different
document than the person's primary one. Senate rows have no page (the
register is an HTML page). "ocr" is set on rows machine-read from a scan.
The newest 300 dated additions and deletions across every person are written
to recent.json without the six-per-bucket serving cap; a row also carries any
exact organisation matches made for the ties join below.

Every uncapped row in the eligible buckets is also compared with the names in
the federal money map, the lobbying firms in access.json and the registrants in
fits.json. Exact normalised names are the default; a deliberately small brand
list below covers short register spellings such as "Telstra" and "NAB". The
per-person file gains a `ties` array and `ties-by-donor.json` mirrors donor
matches for donor pages. Liabilities and the folded "other" bucket are omitted
from matching so ordinary bank accounts and mortgages do not become ties.
"""

import argparse
from collections import defaultdict
import json
import os
import re
import sqlite3
import sys
import unicodedata
from datetime import date

DB = "file:/home/jake/.cache/autoresearch/parli.db?mode=ro"
PER_BUCKET = 6
RECENT_LIMIT = 300
DESC_CHARS = 120

BUCKETS = ["shareholdings", "real_estate", "trusts", "directorships", "gifts",
           "travel", "memberships", "liabilities", "other"]
BUCKET_OF = {
    "shareholdings": "shareholdings", "real_estate": "real_estate", "trusts": "trusts",
    "directorships": "directorships", "gifts": "gifts", "travel": "travel",
    "memberships": "memberships", "liabilities": "liabilities",
    # the six fine-grained categories the brief folds into "other"
    "other": "other", "savings": "other", "investments": "other", "income": "other",
    "other_assets": "other", "partnerships": "other",
}
# cells the parser kept that are still a nil placeholder once read as a whole
NIL = re.compile(r"^\s*(?:nil(?:\s+applicable|\s+return)?|n/?a|not\s+applicable|none|nothing(?:\s+to\s+declare)?|-+)\s*\.?\s*$", re.I)
# form-structure fields that are labels, not content
LABEL_FIELDS = {"subclause", "item"}
WS = re.compile(r"\s+")
ORG_DROP = re.compile(r"\b(?:pty|ltd|limited|inc|incorporated|co|holdings)\b", re.I)
TICKER = re.compile(r"\(\s*(?:(?:asx|nsx)\s*:?\s*)?[a-z]{2,6}\s*\)", re.I)
LEADING_RELATION = re.compile(
    r"^(?:(?:shares?|shareholding|units?|membership|member|director(?:ship)?|office)\s+"
    r"(?:(?:held\s+)?(?:in|of|with)\s+)?|(?:gift|hospitality|travel|tickets?)\s+(?:from|by)\s+)", re.I)

# Conservative brand spellings seen in the registers. These are aliases, not
# fuzzy matches: each must resolve to an organisation actually present in the
# AEC money map, access.json or fits.json. Keep this list short and auditable.
CURATED_BRANDS = {
    "telstra": "Telstra Corporation Limited",
    "santos": "Santos Limited",
    "suncorp": "Suncorp Group Limited",
    "woodside": "Woodside Energy",
    "bhp": "BHP Group",
    "rio tinto": "Rio Tinto",
    "qantas": "Qantas",
    "westpac": "Westpac Banking Corporation",
    "anz": "Australia and New Zealand Banking Group Limited",
    "nab": "National Australia Bank",
    "cba": "Commonwealth Bank of Australia",
    "macquarie": "Macquarie Group Limited",
    "adani": "Adani Mining Pty Ltd",
    "bravus": "Adani Mining Pty Ltd",
    "hancock": "Hancock Prospecting Pty Ltd",
    "crown": "Crown Resorts Limited",
    "star": "The Star Entertainment Group Limited",
    "tabcorp": "Tabcorp Holdings Limited",
    "sportsbet": "Sportsbet",
    "minerals council": "Minerals Council of Australia",
    "clubs nsw": "Registered Clubs Association of NSW",
    "clubsnsw": "Registered Clubs Association of NSW",
    "aha": "Australian Hotels Association",
}

ELIGIBLE_TIE_BUCKETS = {
    "shareholdings", "real_estate", "trusts", "directorships", "gifts", "travel", "memberships"
}


def slug(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return "n-" + re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def norm_org(value):
    """The client money-map normalisation, with tickers stripped first."""
    s = TICKER.sub(" ", str(value or ""))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    s = ORG_DROP.sub(" ", s)
    s = re.sub(r"\bthe\b", " ", s)
    return WS.sub(" ", s).strip()


def row_values(fields_json, fallback):
    """Untruncated text cells and useful cell fragments for exact matching."""
    try:
        fields = json.loads(fields_json) if fields_json else {}
    except ValueError:
        fields = {}
    vals = [WS.sub(" ", str(v)).strip() for k, v in fields.items()
            if k not in LABEL_FIELDS and v and not NIL.match(str(v))]
    if not vals and fallback:
        vals = [WS.sub(" ", str(fallback)).strip()]
    out = []
    for value in vals:
        out.append(value)
        out.extend(x.strip() for x in re.split(r"\s*[;·•]\s*|\s+—\s+", value) if x.strip())
    cleaned = []
    for value in out:
        cleaned.append(value)
        relationless = LEADING_RELATION.sub("", value).strip(" ,;:-")
        if relationless and relationless != value:
            cleaned.append(relationless)
    return list(dict.fromkeys(cleaned))


def unique_index(pairs):
    """Name -> object, with ambiguous normalised names deliberately disabled."""
    index = {}
    identity = {}
    for name, value in pairs:
        key = norm_org(name)
        if not key:
            continue
        marker = value.get("id") or value.get("label") or value.get("organisation")
        if key in identity and identity[key] != marker:
            index[key] = None
        else:
            index[key] = value
            identity[key] = marker
    return index


def load_tie_registers(money_path, access_path, fits_path):
    with open(money_path, encoding="utf-8") as f:
        money = json.load(f)
    with open(access_path, encoding="utf-8") as f:
        access = json.load(f)
    with open(fits_path, encoding="utf-8") as f:
        fits = json.load(f)

    donors = [n for n in money.get("nodes", []) if n.get("kind") == "donor"]
    donor_index = unique_index(
        (name, node) for node in donors for name in [node.get("label"), *(node.get("aliases") or [])])
    edges = defaultdict(list)
    for edge in money.get("edges", []):
        source = edge.get("source")
        if not str(source).startswith("donor:"):
            continue
        edges[source].append({
            "party": str(edge.get("target") or "").removeprefix("party:"),
            "total": round(edge.get("total") or 0),
            "from": edge.get("firstYear"),
            "to": edge.get("lastYear"),
        })
    for source in edges:
        edges[source].sort(key=lambda x: (-x["total"], x["party"]))

    firms = {}
    for donor in (access.get("donors") or {}).values():
        for item in donor.get("lobbyists") or []:
            name = str(item.get("firm") or "").strip()
            key = norm_org(name)
            if key and not key.startswith("unlinked "):
                firm = firms.setdefault(key, {"organisation": name, "jurisdictions": []})
                if item.get("jurisdiction") and item["jurisdiction"] not in firm["jurisdictions"]:
                    firm["jurisdictions"].append(item["jurisdiction"])
    firm_index = unique_index((v["organisation"], v) for v in firms.values())

    fits_entities = {}
    for key, rows in (fits.get("by_entity") or {}).items():
        if not rows:
            continue
        display = next((r.get("registrant") for r in rows if r.get("registrant")), key)
        item = {"organisation": display, "url": next((r.get("url") for r in rows if r.get("url")), None)}
        fits_entities[norm_org(key)] = item
        fits_entities.setdefault(norm_org(display), item)
    fits_index = unique_index((k, v) for k, v in fits_entities.items())

    def registries_for(key):
        found = []
        donor = donor_index.get(key)
        if donor:
            found.append(("donor", donor))
        firm = firm_index.get(key)
        if firm:
            found.append(("lobbyist", firm))
        fit = fits_index.get(key)
        if fit:
            found.append(("fits", fit))
        return found

    curated = {}
    for alias, target in CURATED_BRANDS.items():
        hits = registries_for(norm_org(target)) or registries_for(norm_org(alias))
        if hits:
            curated[norm_org(alias)] = hits

    # Only gift/travel prose gets containment matching. Requiring at least two
    # significant tokens (or one explicit curated brand) avoids ordinary words.
    phrases = {}
    for index in (donor_index, firm_index, fits_index):
        for key, value in index.items():
            if value and len([w for w in key.split() if len(w) > 2]) >= 2:
                phrases[key] = registries_for(key)
    return donor_index, firm_index, fits_index, curated, phrases, edges


def match_tie(values, bucket, registries):
    donor_index, firm_index, fits_index, curated, phrases, _ = registries
    matches = []
    seen = set()
    for value in values:
        key = norm_org(value)
        if not key:
            continue
        candidates = []
        for kind, index in (("donor", donor_index), ("lobbyist", firm_index), ("fits", fits_index)):
            item = index.get(key)
            if item:
                candidates.append((kind, item))
        candidates.extend(curated.get(key, []))
        if bucket not in {"gifts", "travel"}:
            for brand, hits in curated.items():
                if key in {f"{brand} australia", f"{brand} group", f"{brand} corporation", f"{brand} bank"}:
                    candidates.extend(hits)
        if bucket in {"gifts", "travel"}:
            padded = f" {key} "
            for phrase, hits in phrases.items():
                marker = f" {phrase} "
                pos = padded.find(marker)
                prefix = padded[:pos].rstrip() if pos >= 0 else ""
                if pos >= 0 and re.search(
                        r"\b(?:provided by|courtesy of|guest of|sponsored by|gifted by|supplied by|"
                        r"paid for by|facilitated by|hosted by|from|provider of benefit was|"
                        r"provider of the benefit was)\s*$", prefix):
                    candidates.extend(hits)
            for brand, hits in curated.items():
                marker = f" {brand} "
                pos = padded.find(marker)
                prefix = padded[:pos].rstrip() if pos >= 0 else ""
                if pos >= 0 and re.search(
                        r"\b(?:provided by|courtesy of|guest of|sponsored by|gifted by|supplied by|"
                        r"paid for by|facilitated by|hosted by|from|provider of benefit was|"
                        r"provider of the benefit was)\s*$", prefix):
                    candidates.extend(hits)
        for kind, item in candidates:
            marker = item.get("id") or item.get("label") or item.get("organisation")
            identity = (kind, norm_org(marker))
            if identity not in seen:
                seen.add(identity)
                matches.append((kind, item))
    return matches


# register spellings that differ from the name the corpus (and photos/people.json) uses
ALIASES = {
    "alison brynes": ["alison byrnes"],       # aph index typo
    "rebeka sharkie": ["rebekha sharkie"],    # register typo
    "robert katter": ["bob katter"],
}


def name_keys(name):
    """Lowercased lookup forms: as printed, straight and curly apostrophes, known aliases."""
    n = WS.sub(" ", name).strip().lower()
    return {n, n.replace("’", "'"), n.replace("'", "’"), *ALIASES.get(n, [])}


def description(fields_json, fallback, max_chars=DESC_CHARS):
    fields = {}
    try:
        fields = json.loads(fields_json) if fields_json else {}
    except ValueError:
        pass
    vals = [WS.sub(" ", str(v)).strip() for k, v in fields.items()
            if k not in LABEL_FIELDS and v and not NIL.match(str(v))]
    if not vals and fields.get("item") and not NIL.match(str(fields["item"])):
        vals = [WS.sub(" ", str(fields["item"])).strip()]
    text = " · ".join(vals) if vals else WS.sub(" ", fallback or "").strip()
    # the parser joins columns with an em dash; the site's register uses a middle dot
    text = text.replace(" — ", " · ").replace("—", "-")
    if max_chars and len(text) > max_chars:
        cut = text[:max_chars].rsplit(" ", 1)[0]
        text = (cut if len(cut) > max_chars * 0.6 else text[:max_chars]).rstrip(" ,;:·") + "…"
    return text


def is_nil_row(fields_json, desc):
    try:
        fields = json.loads(fields_json) if fields_json else {}
    except ValueError:
        fields = {}
    vals = [str(v) for k, v in fields.items() if k not in LABEL_FIELDS and v]
    if vals:
        return all(NIL.match(v) for v in vals)
    return not desc or bool(NIL.match(desc))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out")
    parser.add_argument("--money", default="portal/public/graph/money.json")
    parser.add_argument("--access", default="portal/public/access.json")
    parser.add_argument("--fits", default="portal/public/fits.json")
    args = parser.parse_args()
    registries = load_tie_registers(args.money, args.access, args.fits)
    tie_flows = registries[-1]
    con = sqlite3.connect(DB, uri=True)
    con.row_factory = sqlite3.Row
    docs = {r["doc_id"]: dict(r) for r in con.execute(
        "SELECT doc_id, jurisdiction, chamber, parliament, person_id, member_name, member_name_raw, "
        "source_url, last_updated, statement_date, warnings FROM ext_interests_documents")}

    def key_for(d):
        pid = d["person_id"]
        if pid and d["jurisdiction"] == "federal":
            return str(pid)
        return slug(d["member_name"] or d["member_name_raw"])

    people = {}
    by_name = {}
    collisions = []
    # federal documents first: when two members share a name (Bob Katter in the House,
    # Robbie Katter in Queensland) the name key resolves to the federal one, and the
    # aliases above are federal spellings
    for d in sorted(docs.values(), key=lambda d: (d["jurisdiction"] != "federal", d["doc_id"])):
        k = key_for(d)
        d["key"] = k
        name = d["member_name"] or d["member_name_raw"]
        p = people.get(k)
        if p is None:
            unread = sum(1 for w in json.loads(d["warnings"] or "[]") if "not parsed" in w)
            p = people[k] = {
                "name": name, "jurisdiction": d["jurisdiction"], "chamber": d["chamber"],
                "parliament": d["parliament"], "source_url": d["source_url"].split("#")[0],
                "as_at": d["last_updated"], "statement_date": d["statement_date"],
                "total": 0, "ocr_rows": 0, "unread_pages": unread,
                "alterations": {"added": 0, "deleted": 0},
                "buckets": {b: {"count": 0, "items": []} for b in BUCKETS},
                "ties": [],
                "_rows": {b: [] for b in BUCKETS},
            }
        for nk in name_keys(name) if d["jurisdiction"] == "federal" else name_keys(name) - set(sum(ALIASES.values(), [])):
            if by_name.get(nk, k) != k:
                collisions.append((nk, by_name[nk], k))
                continue
            by_name[nk] = k

    n_rows = 0
    n_nil = 0
    reverse = defaultdict(list)
    recent = []
    for r in con.execute(
            "SELECT id, doc_id, holder, category, kind, fields_json, description, date_declared, page, ocr "
            "FROM ext_interests ORDER BY id"):
        d = docs.get(r["doc_id"])
        if d is None:
            continue
        if is_nil_row(r["fields_json"], r["description"]):
            n_nil += 1
            continue
        p = people[d["key"]]
        b = BUCKET_OF.get(r["category"], "other")
        n_rows += 1
        p["total"] += 1
        p["buckets"][b]["count"] += 1
        if r["ocr"]:
            p["ocr_rows"] += 1
        if r["kind"] == "addition":
            p["alterations"]["added"] += 1
        elif r["kind"] == "deletion":
            p["alterations"]["deleted"] += 1
        item = {"holder": r["holder"] or "unspecified", "description": description(r["fields_json"], r["description"]),
                "kind": r["kind"], "date": r["date_declared"], "page": r["page"]}
        if r["ocr"]:
            item["ocr"] = 1
        src = d["source_url"].split("#")[0]
        if src != p["source_url"]:
            item["url"] = src
        p["_rows"][b].append((r["id"], item))

        row_url = f"{src}#page={int(r['page'])}" if src and r["page"] else src
        recent_ties = []
        if b in ELIGIBLE_TIE_BUCKETS:
            matches = match_tie(row_values(r["fields_json"], r["description"]), b, registries)
            grouped = defaultdict(list)
            donor_keys = [norm_org(org.get("label")) for kind, org in matches if kind == "donor"]
            for kind, org in matches:
                org_key = norm_org(org.get("label") or org.get("organisation"))
                related_donor = next((k for k in donor_keys if k and
                                      (org_key.startswith(f"{k} ") or k.startswith(f"{org_key} "))), None)
                grouped[related_donor or org_key].append((kind, org))
            for group in grouped.values():
                group.sort(key=lambda x: {"donor": 0, "lobbyist": 1, "fits": 2}[x[0]])
                primary_kind, primary = group[0]
                donor = next((org for kind, org in group if kind == "donor"), None)
                organisation = (donor or primary).get("label") or (donor or primary).get("organisation")
                kinds = list(dict.fromkeys(kind for kind, _ in group))
                tie = {
                    "organisation": organisation,
                    "kind": primary_kind,
                    "kinds": kinds,
                    "register": {
                        "holder": r["holder"] or "unspecified",
                        "category": b,
                        "description": description(r["fields_json"], r["description"], None),
                        "kind": r["kind"],
                        "date": r["date_declared"],
                        "url": row_url,
                        "page": r["page"],
                    },
                }
                if primary_kind == "lobbyist" or any(kind == "lobbyist" for kind, _ in group):
                    lobby = next(org for kind, org in group if kind == "lobbyist")
                    tie["lobbyist_jurisdictions"] = lobby.get("jurisdictions", [])
                if primary_kind == "fits" or any(kind == "fits" for kind, _ in group):
                    fit = next(org for kind, org in group if kind == "fits")
                    if fit.get("url"):
                        tie["fits_url"] = fit["url"]
                if donor:
                    tie.update({
                        "donor_id": donor.get("id"),
                        "industry": donor.get("industry"),
                        "flows": tie_flows.get(donor.get("id"), []),
                    })
                recent_tie = {"organisation": organisation, "kind": primary_kind, "kinds": kinds}
                if donor:
                    recent_tie.update({
                        "donor_id": donor.get("id"),
                        "industry": donor.get("industry"),
                    })
                if tie.get("lobbyist_jurisdictions"):
                    recent_tie["lobbyist_jurisdictions"] = tie["lobbyist_jurisdictions"]
                if tie.get("fits_url"):
                    recent_tie["fits_url"] = tie["fits_url"]
                recent_ties.append(recent_tie)
                p["ties"].append(tie)
                if donor:
                    reverse[donor["label"]].append({
                        "id": d["key"], "name": p["name"], "jurisdiction": p["jurisdiction"],
                        "chamber": p["chamber"], "parliament": p["parliament"],
                        "holder": r["holder"] or "unspecified", "category": b,
                        "description": tie["register"]["description"], "kind": r["kind"],
                        "date": r["date_declared"], "url": row_url,
                    })

        if r["kind"] in {"addition", "deletion"} and r["date_declared"]:
            recent_item = {
                "id": r["id"], "person_id": d["key"], "name": p["name"],
                "jurisdiction": p["jurisdiction"], "chamber": p["chamber"],
                "parliament": p["parliament"], "holder": r["holder"] or "unspecified",
                "bucket": b, "kind": r["kind"], "date": r["date_declared"],
                "description": description(r["fields_json"], r["description"], None),
                "url": row_url, "page": r["page"],
            }
            if r["ocr"]:
                recent_item["ocr"] = 1
            if recent_ties:
                recent_item["ties"] = recent_ties
            recent.append(recent_item)

    # The source table retains some identical rows from successive document
    # snapshots. They are one printed alteration, so the public ledger lists
    # each person/date/category/text/source combination once.
    recent.sort(key=lambda r: (r["date"], r["id"]), reverse=True)
    recent_unique = []
    recent_seen = set()
    for item in recent:
        marker = (item["person_id"], item["date"], item["kind"], item["bucket"],
                  item["description"], item.get("url"))
        if marker in recent_seen:
            continue
        recent_seen.add(marker)
        recent_unique.append(item)
    recent = recent_unique

    for p in people.values():
        for b in BUCKETS:
            rows = p["_rows"][b]
            alts = sorted((x for x in rows if x[1]["kind"] != "statement"),
                          key=lambda x: (x[1]["date"] or "", x[0]), reverse=True)
            stmts = [x for x in rows if x[1]["kind"] == "statement"]
            items = [it for _, it in (alts + stmts)[:PER_BUCKET]]
            for it in items:
                if it["kind"] == "statement":
                    it.pop("date", None)  # the statement date is on the person
            p["buckets"][b]["items"] = items
        del p["_rows"]
        for b in [b for b, v in p["buckets"].items() if v["count"] == 0]:
            del p["buckets"][b]
        for k in ("statement_date", "as_at"):
            if p[k] is None:
                del p[k]
        if not p["unread_pages"]:
            del p["unread_pages"]
        if p["ties"]:
            p["ties"].sort(key=lambda t: (t["organisation"].lower(), t["register"]["category"],
                                           t["register"].get("date") or ""))
        else:
            del p["ties"]

    people = dict(sorted(((k, v) for k, v in people.items() if v["total"]), key=lambda kv: kv[1]["name"]))
    by_name = {n: k for n, k in by_name.items() if k in people}
    index = {
        "_meta": {
            "generated": date.today().isoformat(), "rows": n_rows, "nil_rows_dropped": n_nil,
            "people": len(people), "per_bucket": PER_BUCKET,
            "sources": {f"{d['chamber']}-{d['parliament']}": 0 for d in docs.values()},
        },
        "_by_name": dict(sorted(by_name.items())),
        "people": {k: {"name": v["name"], "total": v["total"],
                        **({"ties": len({t["organisation"] for t in v.get("ties", [])})}
                           if v.get("ties") else {})} for k, v in people.items()},
    }
    for d in docs.values():
        if d["key"] in people:
            index["_meta"]["sources"][f"{d['chamber']}-{d['parliament']}"] += 1

    out_dir = args.out
    dump = dict(ensure_ascii=False, separators=(",", ":"))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "index.json"), "w") as f:
            json.dump(index, f, **dump)
        for k, v in people.items():
            with open(os.path.join(out_dir, f"{k}.json"), "w") as f:
                json.dump(v, f, **dump)
        ties_by_donor = {
            "meta": {
                "generated": date.today().isoformat(),
                "source": "Registers of Members' and Senators' Interests, 48th Parliament, and Queensland Register of Members' Interests, 58th Parliament",
                "matching": "Exact normalised organisation names plus the curated brand aliases in scripts/export_interests.py",
                "donors": len(reverse),
                "rows": sum(len(rows) for rows in reverse.values()),
            },
            "donors": {name: sorted(rows, key=lambda r: (r["name"], r["category"], r.get("date") or ""))
                       for name, rows in sorted(reverse.items())},
        }
        with open(os.path.join(out_dir, "ties-by-donor.json"), "w") as f:
            json.dump(ties_by_donor, f, **dump)
        recent_export = {
            "meta": {
                "generated": date.today().isoformat(),
                "rows": min(len(recent), RECENT_LIMIT),
                "available": len(recent),
                "limit": RECENT_LIMIT,
                "source": "Registers of Members' and Senators' Interests, 48th Parliament, and Queensland Register of Members' Interests, 58th Parliament",
            },
            "items": recent[:RECENT_LIMIT],
        }
        with open(os.path.join(out_dir, "recent.json"), "w") as f:
            json.dump(recent_export, f, **dump)
    else:
        json.dump({**index, "people": people}, sys.stdout, **dump)
    print(f"[export_interests] {n_rows} rows ({n_nil} nil dropped), {len(people)} people, "
          f"{len(by_name)} name keys, {sum(len(p.get('ties', [])) for p in people.values())} ties "
          f"across {len(reverse)} donors, {len(recent)} dated alterations" +
          (f" -> {out_dir}/" if out_dir else ""), file=sys.stderr)
    for nk, kept, dropped in collisions:
        print(f"[export_interests] name collision: '{nk}' -> {kept} (also {dropped}, reachable only by id)", file=sys.stderr)


if __name__ == "__main__":
    main()
