"""Enumerate ParlInfo billhome records for a set of parliaments and load them.

Two phases. The listing phase walks `Dataset:billhome ParliamentNumber:"N"`
100 records at a time and records every bill code the source reports, so the
parliament number on each row comes from source metadata rather than being
inferred from a date. The display phase reads each bill's homepage once and
writes bills_v2, its progress events, and the billhome source row.

Both phases are cache-first and resumable: a page already under
~/.cache/autoresearch/bills_v2 is read from disk, and a bill already in
bills_v2 with events is skipped unless --refresh is given.

  python3 bills_fetch.py --parliaments 44 45 46 47 48
"""

import argparse
import datetime
import html
import json
import re
import sys

import bills_common as bc

RESULT_RX = re.compile(
    r'<li class="result[^"]*">.*?value="(legislation/billhome/([^"]+))".*?'
    r'<div class="sumLink"><a href="([^"]*)"[^>]*>\s*(.*?)</a>.*?'
    r'<div class="sumMeta">(.*?)</div>', re.S)
META_DATE_RX = re.compile(r"Date:\s*(\d{2}/\d{2}/\d{4})")
META_SOURCE_RX = re.compile(r"Source:\s*<span title=\"([^\"]*)\"")

TAG_RX = {
    "short_title": re.compile(r"<short-title>(.*?)</short-title>", re.S),
    "type": re.compile(r"<type>(.*?)</type>", re.S),
    "status": re.compile(r"<status>(.*?)</status>", re.S),
    "portfolio": re.compile(r"<portfolio>(.*?)</portfolio>", re.S),
    "summary": re.compile(r"<summary>(.*?)</summary>", re.S),
    "chamber": re.compile(r"<originating-chamber>(.*?)</originating-chamber>", re.S),
}
SPONSOR_RX = re.compile(
    r'<sponsor(?:\s+id="(?P<id>[^"]*)")?(?:\s+party="(?P<party>[^"]*)")?\s*>'
    r'(?P<name>.*?)</sponsor>', re.S)
# "Originating house" when ParlInfo prints it as plain text, not a custom tag.
ORIG_PLAIN_RX = re.compile(
    r'Originating house</div></td>.*?font-size: 10pt;">(.*?)</div>', re.S)
PROGRESS_TABLE_RX = re.compile(
    r'<table class="bills-progress">(.*?)</table>', re.S)
PROGRESS_ROW_RX = re.compile(
    r'<tr class="bills-progress-(heading|key-item|item)"[^>]*>(.*?)</tr>', re.S)
TD_RX = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
EM_SECTION_RX = re.compile(
    r'<a name="ems"></a>.*?</b></p>(.*?)(?:<a name="srs">|<a name="proposedamendments">)',
    re.S)
DOC_ROW_RX = re.compile(r"<tr>(.*?)</tr>", re.S)
DOC_LABEL_RX = re.compile(r'<ul class="bills"><li>(.*?)</li></ul>', re.S)
DOC_HTML_LINK_RX = re.compile(
    r'href="display\.w3p;query=Id%3A%22([^"%]*(?:%2F[^"%]*)*)%22[^"]*"', re.S)
HOUSE_MAP = {"house of representatives": "representatives", "senate": "senate",
             "house of reps": "representatives"}


def text(s):
    """Strip tags and normalise whitespace/entities from a fragment."""
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def parse_listing(body):
    """(code, title, record_date, source) for every result row on a page."""
    out = []
    for m in RESULT_RX.finditer(body):
        pid, code, _href, title, meta = m.groups()
        d = META_DATE_RX.search(meta)
        s = META_SOURCE_RX.search(meta)
        out.append({
            "parlinfo_id": pid,
            "code": code,
            "title": text(title),
            "record_date": bc.iso_date(d.group(1)) if d else None,
            "source": text(s.group(1)) if s else None,
        })
    return out


def parse_billhome(body, code):
    """Everything the registry needs from one bill homepage."""
    rec = {"code": code, "events": [], "em_docs": []}
    for k, rx in TAG_RX.items():
        m = rx.search(body)
        rec[k] = text(m.group(1)) if m else None
    m = SPONSOR_RX.search(body)
    if m:
        rec["sponsor_name"] = text(m.group("name"))
        rec["sponsor_aph_id"] = m.group("id")
        rec["sponsor_party"] = m.group("party")
    else:
        rec["sponsor_name"] = rec["sponsor_aph_id"] = rec["sponsor_party"] = None
    if not rec["chamber"]:
        m = ORIG_PLAIN_RX.search(body)
        rec["chamber"] = text(m.group(1)) if m else None

    tbl = PROGRESS_TABLE_RX.search(body)
    if tbl:
        house = None
        for m in PROGRESS_ROW_RX.finditer(tbl.group(1)):
            kind, row = m.group(1), m.group(2)
            cells = [text(c) for c in TD_RX.findall(row)]
            if kind == "heading":
                house = HOUSE_MAP.get((cells[0] if cells else "").lower(),
                                      (cells[0] if cells else None))
                continue
            if len(cells) < 2 or not cells[0]:
                continue
            date = bc.iso_date(cells[1])
            if not date:
                continue
            extra = cells[2] if len(cells) > 2 and cells[2] not in ("", "\xa0") else ""
            raw = cells[0] + (f" ({extra})" if extra else "")
            rec["events"].append({
                "stage": bc.map_stage(cells[0]), "date": date,
                "house": house, "event_raw": raw})

    sec = EM_SECTION_RX.search(body)
    if sec:
        for row in DOC_ROW_RX.finditer(sec.group(1)):
            label_m = DOC_LABEL_RX.search(row.group(1))
            link_m = DOC_HTML_LINK_RX.search(row.group(1))
            if not link_m:
                continue
            import urllib.parse as up
            doc_id = up.unquote(link_m.group(1))
            rec["em_docs"].append({
                "label": text(label_m.group(1)) if label_m else "",
                "doc_id": doc_id})
    return rec


def em_kind(label):
    """Map the homepage's EM label to the contract's source kinds."""
    lab = (label or "").lower()
    if "revised" in lab:
        return "em_revised"
    if "supplementary" in lab or "addendum" in lab or "correction" in lab:
        return "em_supp"
    return "em"


def enumerate_parliament(p, max_pages=40, refresh=False, max_cache_age=0):
    """Every billhome record the source lists for one parliament."""
    query = f'Dataset:billhome ParliamentNumber:"{p}"'
    seen, rows = set(), []
    for page in range(max_pages):
        url = bc.listing_url(query, page=page)
        body, _path, _cached = bc.fetch(url, "listing", f"p{p}_page{page}", refresh=refresh, max_cache_age=max_cache_age)
        if not body:
            raise RuntimeError(f"Failed bill listing: parliament {p}, page {page}")
        batch = parse_listing(body)
        if not batch and "no results" not in body.lower() and "no records" not in body.lower():
            raise RuntimeError(f"Unrecognised bill listing: parliament {p}, page {page}")
        fresh = [r for r in batch if r["code"] not in seen]
        for r in fresh:
            seen.add(r["code"])
            r["parliament"] = p
            rows.append(r)
        print(f"  P{p} page {page}: {len(batch)} rows, {len(fresh)} new, "
              f"{len(rows)} total", flush=True)
        if len(batch) < 100:
            break
    return rows


def upsert(db, rec, listing, now):
    key = bc.bill_key(rec["code"])
    intro = [e["date"] for e in rec["events"] if e["stage"] == "introduced"]
    all_dates = [e["date"] for e in rec["events"] if e["date"]]
    introduced = min(intro) if intro else (min(all_dates) if all_dates else None)
    house = HOUSE_MAP.get((rec.get("chamber") or "").lower(),
                          (rec.get("chamber") or "").lower() or None)
    if not house and listing.get("source"):
        house = HOUSE_MAP.get(listing["source"].lower())
    status_as_of = max(all_dates) if all_dates else None
    title = rec.get("short_title") or listing.get("title")
    aliases = {"listing_title": listing.get("title"),
               "type": rec.get("type"),
               "sponsor_aph_id": rec.get("sponsor_aph_id"),
               "sponsor_party": rec.get("sponsor_party"),
               "summary": rec.get("summary")}
    db.execute(
        """INSERT INTO bills_v2 (bill_key, jurisdiction, source_system, source_id,
             parliament, session, title, short_title, aliases_json, introduced_date,
             originating_house, sponsor_name, sponsor_person_id, portfolio, status,
             status_raw, status_as_of, legacy_bill_id, updated_at)
           VALUES (?,'federal','parlinfo',?,?,NULL,?,?,?,?,?,?,NULL,?,?,?,?,NULL,?)
           ON CONFLICT(bill_key) DO UPDATE SET
             source_id=excluded.source_id, parliament=excluded.parliament,
             title=excluded.title, short_title=excluded.short_title,
             aliases_json=excluded.aliases_json,
             introduced_date=excluded.introduced_date,
             originating_house=excluded.originating_house,
             sponsor_name=excluded.sponsor_name, portfolio=excluded.portfolio,
             status=excluded.status, status_raw=excluded.status_raw,
             status_as_of=excluded.status_as_of, updated_at=excluded.updated_at""",
        (key, listing["parlinfo_id"], rec.get("parliament") or listing["parliament"],
         title, rec.get("short_title"), json.dumps(aliases, ensure_ascii=False),
         introduced, house, rec.get("sponsor_name"), rec.get("portfolio"),
         bc.map_status(rec.get("status")), rec.get("status"), status_as_of, now))

    url = bc.display_url(listing["parlinfo_id"])
    for e in rec["events"]:
        db.execute(
            """INSERT OR REPLACE INTO bill_events
               (bill_key, stage, date, house, event_raw, source_url)
               VALUES (?,?,?,?,?,?)""",
            (key, e["stage"], e["date"], e["house"], e["event_raw"], url))
    return key


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--parliaments", type=int, nargs="+",
                    default=[44, 45, 46, 47, 48])
    ap.add_argument("--refresh", action="store_true",
                    help="fetch fresh listings and homepages, including existing bills")
    ap.add_argument("--max-cache-age", type=int, default=0, help="reuse pages fetched within this many seconds when resuming a refresh")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    db = bc.connect_rw()

    listings = []
    for p in args.parliaments:
        print(f"Listing parliament {p}", flush=True)
        listings += enumerate_parliament(p, refresh=args.refresh, max_cache_age=args.max_cache_age)
    print(f"Listed {len(listings)} billhome records "
          f"across {len(args.parliaments)} parliaments", flush=True)

    have = {r[0] for r in db.execute(
        "SELECT bill_key FROM bills_v2 WHERE source_system='parlinfo'")}
    done = 0
    failures = 0
    for i, lst in enumerate(listings):
        key = bc.bill_key(lst["code"])
        if key in have and not args.refresh:
            continue
        if args.limit and done >= args.limit:
            break
        url = bc.display_url(lst["parlinfo_id"])
        try:
            body, path, cached = bc.fetch(url, "billhome", lst["code"], refresh=args.refresh, max_cache_age=args.max_cache_age)
        except bc.Blocked as e:
            print(f"BLOCKED: {e}", file=sys.stderr, flush=True)
            raise
        if not body or "<short-title>" not in body:
            failures += 1
            print(f"  ! {lst['code']}: no billhome body", flush=True)
            continue
        rec = parse_billhome(body, lst["code"])
        rec["parliament"] = lst["parliament"]
        upsert(db, rec, lst, now)
        db.execute(
            """INSERT OR REPLACE INTO bill_sources
               (bill_key, kind, source_id, url, document_date, fetched_at,
                licence, content_hash, cache_path, outline_text)
               VALUES (?,'billhome',?,?,?,?,?,?,?,NULL)""",
            (key, lst["parlinfo_id"], url, lst["record_date"], now,
             bc.LICENCE, bc.sha256(body), path))
        for d in rec["em_docs"]:
            db.execute(
                """INSERT OR IGNORE INTO bill_sources
                   (bill_key, kind, source_id, url, document_date, fetched_at,
                    licence, content_hash, cache_path, outline_text)
                   VALUES (?,?,?,?,NULL,NULL,?,NULL,NULL,NULL)""",
                (key, em_kind(d["label"]), d["doc_id"],
                 bc.display_url(d["doc_id"]), bc.LICENCE))
        db.commit()  # release the writer before fetching the next source page
        done += 1
        if done % 25 == 0:
            db.commit()
            print(f"  {done} loaded ({i+1}/{len(listings)}) {bc.stats()}",
                  flush=True)
    db.commit()
    n = db.execute("SELECT COUNT(*) FROM bills_v2 WHERE source_system='parlinfo'").fetchone()[0]
    e = db.execute("SELECT COUNT(*) FROM bill_events").fetchone()[0]
    print(f"DONE bills_v2(parlinfo)={n} bill_events={e} {bc.stats()}", flush=True)
    db.close()
    if failures:
        raise SystemExit(f"{failures} bill homepages failed to refresh")


if __name__ == "__main__":
    main()
