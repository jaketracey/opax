#!/usr/bin/env python3
"""
Export the registers of members' interests (ext_interests on parli.db, see
docs/DATA-INTERESTS.md) as one static file the portal serves as-is for the
"Declared interests" section of person pages. Runs on the data box and writes
one small file per person plus an index (a single combined file would be
~760KB, most of it never read by any one page):

  scp scripts/export_interests.py desktop:/tmp/
  ssh desktop 'rm -rf /tmp/interests && python3 /tmp/export_interests.py --out /tmp/interests'
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
"""

import json
import os
import re
import sqlite3
import sys
import unicodedata
from datetime import date

DB = "file:/home/jake/.cache/autoresearch/parli.db?mode=ro"
PER_BUCKET = 6
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


def slug(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return "n-" + re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


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


def description(fields_json, fallback):
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
    if len(text) > DESC_CHARS:
        cut = text[:DESC_CHARS].rsplit(" ", 1)[0]
        text = (cut if len(cut) > DESC_CHARS * 0.6 else text[:DESC_CHARS]).rstrip(" ,;:·") + "…"
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
                "_rows": {b: [] for b in BUCKETS},
            }
        for nk in name_keys(name) if d["jurisdiction"] == "federal" else name_keys(name) - set(sum(ALIASES.values(), [])):
            if by_name.get(nk, k) != k:
                collisions.append((nk, by_name[nk], k))
                continue
            by_name[nk] = k

    n_rows = 0
    n_nil = 0
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

    people = dict(sorted(((k, v) for k, v in people.items() if v["total"]), key=lambda kv: kv[1]["name"]))
    by_name = {n: k for n, k in by_name.items() if k in people}
    index = {
        "_meta": {
            "generated": date.today().isoformat(), "rows": n_rows, "nil_rows_dropped": n_nil,
            "people": len(people), "per_bucket": PER_BUCKET,
            "sources": {f"{d['chamber']}-{d['parliament']}": 0 for d in docs.values()},
        },
        "_by_name": dict(sorted(by_name.items())),
        "people": {k: {"name": v["name"], "total": v["total"]} for k, v in people.items()},
    }
    for d in docs.values():
        if d["key"] in people:
            index["_meta"]["sources"][f"{d['chamber']}-{d['parliament']}"] += 1

    out_dir = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    dump = dict(ensure_ascii=False, separators=(",", ":"))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "index.json"), "w") as f:
            json.dump(index, f, **dump)
        for k, v in people.items():
            with open(os.path.join(out_dir, f"{k}.json"), "w") as f:
                json.dump(v, f, **dump)
    else:
        json.dump({**index, "people": people}, sys.stdout, **dump)
    print(f"[export_interests] {n_rows} rows ({n_nil} nil dropped), {len(people)} people, "
          f"{len(by_name)} name keys" + (f" -> {out_dir}/" if out_dir else ""), file=sys.stderr)
    for nk, kept, dropped in collisions:
        print(f"[export_interests] name collision: '{nk}' -> {kept} (also {dropped}, reachable only by id)", file=sys.stderr)


if __name__ == "__main__":
    main()
