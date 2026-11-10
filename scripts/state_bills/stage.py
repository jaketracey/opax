"""Offline state bill metadata projection. No bill/EM bodies are published.

Registry facts are separated from copyrighted summaries and document bodies.
Source wording for offices, dates, identifiers and stage labels is retained.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime
import hashlib
import io
import json
from pathlib import Path
import re
from urllib.parse import urljoin
from xml.etree import ElementTree as ET
import zipfile

from bs4 import BeautifulSoup

from scripts.corrections import apply as corrections
from scripts.state_bills.acquire import ROOT, ORIGINS

ACT_BASE = ORIGINS["act"] + "/parliamentary-business/in-the-chamber/"
ACT_RIGHTS = ORIGINS["act"] + "/functions/footer/reuse-policy"
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def text(tag):
    return re.sub(r"\s+", " ", tag.get_text(" ", strip=True)).strip()


def date(value):
    value = re.sub(r"\s+", " ", value.strip())
    for fmt in ("%d/%m/%Y", "%d-%m-%y", "%d %B %Y", "%d %b %Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def exact_sponsor(name, jurisdiction, roster, paths):
    key = lambda s: re.sub(r"\s+", " ", s.strip()).casefold()
    matches = [p for p in roster if any(r.get("jurisdiction") == jurisdiction for r in p.get("representation", [])) and key(p["name"]) == key(name or "")]
    if len(matches) != 1 or not paths.get(matches[0]["name"]):
        return None
    p = matches[0]
    return {"name": p["name"], "href": paths[p["name"]], "pid": p.get("pid")}


def provenance(r):
    return {"source_url": r["url"], "snapshot": r["snapshot"], "sha256": r["sha256"]}


def rights(j, r):
    return {"status": "metadata-only", "name": "Copyright Parliament of Tasmania; no open grant found" if j == "tas" else "CC BY-NC-ND 4.0; third-party exceptions",
        "policy_url": r["url"], "policy_receipt": provenance(r), "text_allowed": False,
        "metadata_basis": "Public registry facts and original document links; no summaries or document bodies reproduced",
        "hold_reason": "No applicable open licence established for bill or explanatory bodies" if j == "tas" else "Non-commercial/no-derivatives Assembly grant does not clear third-party bill and explanatory bodies"}


def document(label, url, source):
    low = label.lower()
    kind = "text" if any(x in low for x in ("as introduced", "as presented", "reprint", "bill as amended")) else "explanatory" if any(x in low for x in ("explanatory", "clause notes", "fact sheet", "second reading")) else "amendment" if "amendment" in low else "related"
    return {"kind": kind, "label": label, "url": url, "document_date": None,
        "body_status": "held", "body_reason": "Document-level reuse rights not cleared; original link only", **provenance(source)}


def tas_event_order(events):
    """Chronological order without inventing times.

    The source tables give a date but no time, so stages on the same day keep
    the order of the source table's rows (a stable sort on date). Across the two
    houses, the originating house's stages come first that day: a bill passes the
    first house before the second house reads it. A lapse notice (no house) is
    last on its day. Sorting on the stage name put "2nd Reading Agreed" before
    "2nd Reading moved" and "Negatived" before "Resumed".
    """
    seq = {id(e): i for i, e in enumerate(events)}
    firsts = sorted((e for e in events if e["house"] and e["stage"].lower() == "first reading"),
                    key=lambda e: (e["date"], seq[id(e)]))
    origin = firsts[0]["house"] if firsts else next((e["house"] for e in events if e["house"]), None)
    rank = lambda e: 2 if e["house"] is None else 0 if e["house"] == origin else 1
    return sorted(events, key=lambda e: (e["date"], rank(e), seq[id(e)]))


def tas_bill(body, receipt, licence, current_urls):
    main = BeautifulSoup(body, "html.parser").find("main")
    if not main or not main.find("h1"):
        raise ValueError("Missing Tasmania bill heading")
    title = text(main.find("h1"))
    match = re.search(r"\((?:Bill\s+)?(\d+)\s+[o0]f\s+(20\d{2})\)", title, re.I)
    if not match:
        # Older headings may carry their ID only in a subordinate heading.
        match = re.search(r"\((?:Bill\s+)?(\d+)\s+[o0]f\s+(20\d{2})\)", text(main), re.I)
    if not match:
        raise ValueError("Missing Tasmania source bill number: " + title)
    number, year = match.groups()
    content = text(main)
    parliament = re.search(r"(?:first introduced in (?:the )?|introduced into (?:the )?)(\d+)(?:st|nd|rd|th) Parliament", content, re.I)
    session = re.search(r"Parliament,\s*(\d+)(?:st|nd|rd|th) Session", content, re.I)
    sponsor, updated = None, None
    for p in main.find_all("p"):
        value = text(p)
        if value.lower().startswith("introduced by:"):
            sponsor = value.split(":", 1)[1].strip()
        if value.lower().startswith("last updated:"):
            updated = date(value.split(":", 1)[1])
    events, values = [], []
    for table in main.find_all("table"):
        headers = [text(c) for c in table.find_all("tr")[0].find_all(["th", "td"])]
        if len(headers) == 4 and "stage" in headers[0].lower():
            houses = [headers[0].split(" - ")[0], headers[2].split(" - ")[0]]
            offsets = [0, 2]
        elif len(headers) == 2 and "stage" in headers[0].lower():
            houses, offsets = [headers[0].split(" - ")[0]], [0]
        else:
            raise ValueError("Unrecognised Tasmania stages table")
        for tr in table.find_all("tr")[1:]:
            cells = [text(c) for c in tr.find_all(["th", "td"])]
            if len(cells) != len(headers):
                raise ValueError("Short/merged Tasmania stage row")
            for house, offset in zip(houses, offsets):
                stage, raw = cells[offset:offset + 2]
                stage = re.sub(r"\s*[*#]$", "", stage).strip()
                if stage and raw:
                    parsed = date(raw)
                    values.append({"house": house, "stage": stage, "value": raw})
                    if parsed:
                        events.append({"stage": stage, "date": parsed, "house": house, "date_raw": raw, **provenance(receipt)})
    lapse = re.search(r"Bill lapsed at prorogation on (?:\w+ )?(\d+ \w+ \d{4})", content, re.I)
    if lapse:
        events.append({"stage": "Lapsed at prorogation", "date": date(lapse[1]), "date_raw": lapse[1], "house": None, **provenance(receipt)})
    events = tas_event_order(events)
    first = [e for e in events if e["stage"].lower() == "first reading"]
    last = events[-1] if events else None
    if any(e["stage"].lower() == "royal assent" for e in events):
        status = "assented"
    elif lapse:
        status = "lapsed"
    elif any(e["stage"].lower() == "negatived" for e in events):
        status = "negatived"
    elif len({e["house"] for e in events if e["stage"].lower() == "third reading"}) == 2:
        status = "passed"
    elif receipt["url"] in current_urls:
        status = "before_parliament"
    else:
        status = "unknown"
    links = [document(text(a), urljoin(receipt["url"], a["href"]), receipt) for a in main.find_all("a", href=True)
        if re.search(r"\.(?:pdf|docx?)(?:$|\?)", a["href"], re.I)]
    return {"key": f"au-tas-{year}-{number}", "jurisdiction": "tas", "source_id": f"{number} of {year}", "number": number,
        "title": title, "parliament": int(parliament[1]) if parliament else None, "session": session[1] if session else None,
        "sponsor_name": sponsor, "introduced_date": first[0]["date"] if first else None,
        "introduction_basis": "Earliest published first reading", "originating_house": first[0]["house"] if first else None,
        "status": status, "status_as_of": receipt["snapshot"][:10], "source_updated_date": updated,
        "stage": last["stage"] if last else None, "last_action": last, "events": events, "stage_values": values,
        "sources": links, "licence": licence, "official": None, **provenance(receipt)}


def act_sections(body):
    soup = BeautifulSoup(body, "html.parser")
    result = []
    for h in soup.find_all("h4"):
        if "Bill" not in text(h):
            continue
        siblings = []
        for node in h.next_siblings:
            if getattr(node, "name", None) in ("h3", "h4"):
                break
            if getattr(node, "name", None):
                siblings.append(node)
        result.append((h, siblings))
    if not result:
        raise ValueError("No ACT bill sections")
    return result


def title_key(title):
    title = re.sub(r"\s*\[Act Citation:.*?\]", "", title, flags=re.I)
    key = re.sub(r"[^a-z0-9]", "", title.casefold())
    # Reviewed source spelling discrepancies; dates must still agree. Original
    # titles from each component are retained and shown beside the joined row.
    aliases = {"officeofthelegislationassembly": "officeofthelegislativeassembly",
        "firearmsfirearmprohibitionorders": "firearmsfirearmsprohibitionorders",
        "monitoringofplacesofdetermination": "monitoringofplacesofdetention",
        "evidencemiscellaneousprovisionamendment": "evidencemiscellaneousprovisionsamendment",
        # The 10th Assembly status list titles this bill "[No 2]"; its version-index
        # heading, summary heading and register page (db_68423) do not. The Act it
        # became is A2023-47, "Revenue Legislation Amendment Act 2023 [No 2]", and no
        # other 2023 Revenue Legislation Amendment Bill exists in either Assembly.
        "revenuelegislationamendmentbill2023no2": "revenuelegislationamendmentbill2023"}
    for source, target in aliases.items():
        key = key.replace(source, target)
    return key


def act_list(body, receipt):
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        doc = ET.fromstring(archive.read("word/document.xml"))
    result = {}
    categories = {"Before the Assembly": "before_parliament", "Bills Passed": "passed", "Agreement in Principle Negatived": "negatived", "Discharged/Withdrawn": "withdrawn", "Discharged /Withdrawn": "withdrawn", "Lapsed on Expiry of Assembly": "lapsed"}
    wt = lambda node: re.sub(r"\s+", " ", "".join(node.itertext())).strip()
    for table in doc.findall(".//w:tbl", NS):
        rows = table.findall("w:tr", NS)
        headers = [wt(c) for c in rows[0].findall("w:tc", NS)]
        category = headers[0]
        if category == "Inquired into by Committee":
            # These rows duplicate the main register; retain referral events.
            status = None
        elif category not in categories:
            raise ValueError("Unrecognised ACT list table: " + category)
        else:
            status = categories[category]
        for row in rows[1:]:
            cells = [wt(c) for c in row.findall("w:tc", NS)]
            if not cells or "Bill" not in cells[0]:
                continue
            if len(cells) != len(headers):
                raise ValueError("Short ACT list row")
            fields = dict(zip(headers[1:], cells[1:]))
            key = title_key(cells[0])
            item = result.setdefault(key, {"title": cells[0], "events": [], "status": "unknown", "introduced_date": None, "act_number": None})
            if status:
                item["status"] = status
            # The committee table repeats the bill's Introduced date: one bill has one
            # event per (stage, date, house), whichever table states it.
            seen = {(e["stage"], e["date"], e["house"]) for e in item["events"]}
            for field, value in fields.items():
                if field == "Introduced":
                    item["introduced_date"] = date(value)
                if field == "Act No":
                    item["act_number"] = value or None
                parsed = date(value)
                if parsed:
                    stage = {"Introduced": "Introduced", "Passed": "Passed", "LR": "Notified on Legislation Register", "Date Negatived": "Agreement in principle negatived", "Date Discharged / Withdrawn": "Discharged / withdrawn", "Date of Referral": "Referred to committee", "Report Presented": "Committee report presented"}.get(field, field)
                    if (stage, parsed, "Legislative Assembly") in seen:
                        continue
                    seen.add((stage, parsed, "Legislative Assembly"))
                    item["events"].append({"stage": stage, "date": parsed, "date_raw": value, "house": "Legislative Assembly", **provenance(receipt)})
    if not result:
        raise ValueError("Empty ACT status list")
    return result


def act_version_events(nodes, receipt):
    """Only dated, explicit lapse metadata; never infer expiry from a term/year."""
    pattern = re.compile(r"\[Lapsed on expiry of (?:the )?Assembly (\d{1,2} \w+ \d{4})\]", re.I)
    events = []
    seen = set()
    for node in nodes:
        for match in pattern.finditer(text(node)):
            parsed = date(match[1])
            if parsed and parsed not in seen:
                events.append({"stage": "Lapsed on expiry of Assembly", "date": parsed,
                    "date_raw": match[1], "house": "Legislative Assembly", **provenance(receipt)})
                seen.add(parsed)
    return events


ACT_REGISTER = "https://www.legislation.act.gov.au/b/"


def act_bill_id(url):
    """Register bill identifier of an ACT legislation register link, or None.

    "/b/db_65228", "/View/b/db_65228/20211109-77760/html/db_65228.html" and
    "/DownloadFile/b/db_65228/..." all name db_65228. Explanatory statements
    ("/es/") and Acts ("/a/") are different register items.
    """
    match = re.search(r"legislation\.act\.gov\.au/(?:(?:View|DownloadFile)/)?b/(db_\d+)(?:[/?#]|$)", url or "", re.I)
    return match[1] if match else None


def act_summary_for(key, volume_id, summaries):
    """The one summary heading for a version-index record, or (None, notes).

    Same title and same register identifier first. A numbered sibling ("... Bill
    2021 [No 2]") may take a heading the summary titles without its number, but
    only through the identifier. A title alone joins only when the summary has
    exactly one heading for it; a repeated title with no matching identifier
    gives no sponsor rather than another bill's.
    """
    same = summaries.get(key, [])
    if volume_id:
        hits = [e for e in same if e["id"] == volume_id]
        if not hits:
            base = re.sub(r"no\d+$", "", key)
            hits = [e for rows in summaries.values() for e in rows
                    if e["id"] == volume_id and re.sub(r"no\d+$", "", e["key"]) == base]
        if len(hits) == 1:
            return hits[0], []
    if len(same) == 1:
        return same[0], []
    if same:
        return None, ["The summary of bills repeats this title for different bills and none links this bill's register identifier; no presenter is shown."]
    return None, []


def act_bills(volume, summary, listing, receipts, parliament, licence):
    with zipfile.ZipFile(io.BytesIO(listing)) as archive:
        header_text = " ".join("".join(ET.fromstring(archive.read(n)).itertext()) for n in archive.namelist() if n.startswith("word/header"))
    list_date = re.search(r"\b(\d{1,2} \w+ 20\d{2})", header_text)
    if not list_date or not date(list_date[1]):
        raise ValueError("ACT list date unavailable")
    status_as_of = date(list_date[1])
    # The summary can repeat one title for different bills (the 10th Assembly
    # lists two "Civil Law (Sale of Residential Property) Amendment Bill 2021"
    # headings, Mr Rattenbury's db_65228 and Mr Cain's db_65229). Keep every
    # heading, with its register link, so a record is joined by identifier first.
    summaries = {}
    for heading, nodes in act_sections(summary):
        presented = next((text(n) for n in nodes if text(n).startswith("Presented by ")), None)
        sponsor = introduced = None
        if presented:
            match = re.fullmatch(r"Presented by (.+?)\s*[—–]\s*(\d+ \w+ \d{4})", presented)
            if not match:
                raise ValueError("Unrecognised ACT introduction: " + presented)
            sponsor, introduced = match[1], date(match[2])
        href = heading.find("a", href=True)["href"] if heading.find("a", href=True) else None
        key = title_key(text(heading))
        # A bill divided by the Assembly has no presenter of its own; its summary
        # names the bill it came from. Only that title is kept, never the prose.
        origin = next((m[1] for n in nodes for m in [re.search(r"\boriginally the (.+? Bill \d{4}(?: \[No\.? \d+\]| \(No\.? \d+\))?)", text(n))] if m), None)
        summaries.setdefault(key, []).append({"key": key, "title": text(heading), "sponsor": sponsor, "date": introduced,
                                              "href": href, "id": act_bill_id(href), "origin": origin})
    statuses = act_list(listing, receipts["list"])
    bills, matched, volume_seen = [], set(), {}
    for heading, nodes in act_sections(volume):
        title = text(heading)
        key = title_key(title)
        if key in volume_seen:
            # The current source repeats Liquor Amendment Bill 2025. One bill,
            # with all distinct original document links, remains in the export.
            volume_seen[key]["source_notes"].append("Version index repeats this bill heading; distinct document links combined.")
            existing_urls = {d["url"] for d in volume_seen[key]["sources"]}
            for node in nodes:
                for a in node.find_all("a", href=True):
                    if a["href"].startswith("http") and a["href"] not in existing_urls:
                        volume_seen[key]["sources"].append(document(text(a), a["href"], receipts["volume"]))
                        existing_urls.add(a["href"])
            continue
        heading_link = heading.find("a", href=True)
        volume_id = act_bill_id(heading_link["href"]) if heading_link else None
        if not volume_id:
            volume_id = next((act_bill_id(a["href"]) for n in nodes for a in n.find_all("a", href=True) if act_bill_id(a["href"])), None)
        entry, notes = act_summary_for(key, volume_id, summaries)
        sponsor, introduced = (entry["sponsor"], entry["date"]) if entry else (None, None)
        if entry and not sponsor and entry["origin"]:
            parent = [e for rows in summaries.values() for e in rows if e["title"] == entry["origin"] and e["sponsor"]]
            if len(parent) == 1:
                notes.append(f"The summary of bills gives no presenter for this bill. It was originally {entry['origin']}, presented by {parent[0]['sponsor']} on {parent[0]['date']}, and divided by resolution of the Assembly.")
        bill_url = None
        if entry and entry["href"] and (not volume_id or entry["id"] == volume_id):
            bill_url = entry["href"]
        elif volume_id:
            # The version index heading links the record's own register page. When
            # the summary links a different bill there, the record keeps its own.
            bill_url = ACT_REGISTER + volume_id
            if entry and entry["id"] and entry["id"] != volume_id:
                notes.append(f"The summary of bills links this title to {entry['id']}; the version index links {volume_id}, which is used.")
        status = statuses.get(key)
        if status:
            matched.add(key)
            if re.sub(r"\s*\[Act Citation:.*?\]", "", status["title"]).strip() != title:
                notes.append("Status-list title: " + status["title"])
            if introduced and status["introduced_date"] and introduced != status["introduced_date"]:
                notes.append(f"Summary presented date {introduced}; status-list introduced date {status['introduced_date']}. The status-list date is displayed; the sources disagree.")
            introduced = status["introduced_date"] or introduced
        links = []
        for node in nodes:
            for a in node.find_all("a", href=True):
                u = urljoin(receipts["volume"]["url"], a["href"])
                if not u.startswith("http"):
                    continue
                links.append(document(text(a), u, receipts["volume"]))
                if not bill_url and re.search(r"legislation.act.gov.au/b/", u):
                    bill_url = u
        source_id = bill_url.rsplit("/", 1)[-1] if bill_url else None
        events = list(status["events"]) if status else []
        existing = {(e["stage"], e["date"], e["house"]) for e in events}
        events.extend(e for e in act_version_events(nodes, receipts["volume"])
                      if (e["stage"], e["date"], e["house"]) not in existing)
        events.sort(key=lambda e: (e["date"], e["stage"]))
        last = events[-1] if events else None
        if last and last["date"] > status_as_of:
            notes.append("The source includes an action date later than its status-list heading date.")
        bills.append({"key": f"au-act-{parliament}-" + hashlib.sha256(key.encode()).hexdigest()[:16], "jurisdiction": "act", "source_id": source_id, "number": None,
            "title": title, "parliament": parliament, "session": None, "sponsor_name": sponsor, "introduced_date": introduced,
            "introduction_basis": "Presented date in Assembly summary/status register", "originating_house": "Legislative Assembly",
            "status": status["status"] if status else "unknown", "status_as_of": status_as_of,
            "source_updated_date": None, "stage": last["stage"] if last else None, "last_action": last, "act_number": status["act_number"] if status else None,
            "events": events, "stage_values": [], "sources": links, "licence": licence, "official": None,
            "bill_url": bill_url, "source_notes": notes, "metadata_receipts": [provenance(receipts[k]) for k in ("summary", "list")], **provenance(receipts["volume"])})
        volume_seen[key] = bills[-1]
    # A status row missing from the volume must remain visible in the inventory.
    unmatched = sorted(set(statuses) - matched)
    for k in unmatched:
        s = statuses[k]
        entry, _ = act_summary_for(k, None, summaries)
        sponsor, introduced, bill_url = (entry["sponsor"], entry["date"], entry["href"]) if entry else (None, None, None)
        source_id = bill_url.rsplit("/", 1)[-1] if bill_url else None
        events = sorted(s["events"], key=lambda e: (e["date"], e["stage"]))
        last = events[-1] if events else None
        bills.append({"key": f"au-act-{parliament}-" + hashlib.sha256(k.encode()).hexdigest()[:16], "jurisdiction": "act", "source_id": source_id, "number": None,
            "title": s["title"], "parliament": parliament, "session": None, "sponsor_name": sponsor, "introduced_date": introduced or s["introduced_date"],
            "introduction_basis": "Presented date in Assembly summary/status register", "originating_house": "Legislative Assembly", "status": s["status"],
            "status_as_of": status_as_of, "source_updated_date": None, "stage": last["stage"] if last else None, "last_action": last, "act_number": s["act_number"],
            "events": events, "stage_values": [], "sources": [], "licence": licence, "official": None, "bill_url": bill_url, "version_index_missing": True,
            "metadata_receipts": [provenance(receipts["summary"])], **provenance(receipts["list"])})
    by_id = Counter(b["source_id"] for b in bills if b["source_id"])
    for b in bills:
        if b["source_id"] and by_id[b["source_id"]] > 1:
            b.setdefault("source_notes", []).append("The source links this identifier from more than one bill title; bill records kept separate by title and Assembly.")
    return bills, [{"title": statuses[k]["title"], "reason": "Status-list bill absent from version index"} for k in unmatched]


def apply_corrections(dataset, bills):
    """Reviewed, evidenced one-off corrections (scripts/corrections/<dataset>.json).

    Used only where the parliament's own page mislinks. Each corrected value is
    marked on the record with its evidence, and the helper fails when the source
    value has changed, so a fixed source forces a fresh review.
    """
    # Corrections are reviewed code-side inputs, read from this checkout like the
    # projection code itself, whatever data root is being projected.
    for entry in corrections.apply(dataset, bills, key="key"):
        bill = next(b for b in bills if b["key"] == entry["id"])
        match = re.fullmatch(r"sources\[label=(.+)\]\.url", entry["field"])
        if match:
            doc = next(d for d in bill["sources"] if d["label"] == match[1])
            doc["correction"] = {k: entry[k] for k in ("from", "evidence_url", "finding", "reviewed")}
        was = act_bill_id(entry["from"]) or entry["from"]
        bill.setdefault("source_notes", []).append(
            f"Corrected link: the source links '{match[1] if match else entry['field']}' to {was}, a different bill; "
            f"the register page {entry['evidence_url']} gives the link used here.")


def build(j, root=ROOT, write=False):
    stage = root / "data/staged" / ("bills-" + j)
    ledger = json.loads((stage / "receipts.json").read_bytes())
    if ledger.get("stopped"):
        raise ValueError("Source collection stopped")
    receipts = {r["url"]: r for r in ledger["receipts"]}
    def body(r):
        data = (root / r["snapshot_path"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != r["sha256"] or r["status"] != 200 or r["challenge"]:
            raise ValueError("Invalid source receipt")
        return data
    if j == "tas":
        policy = receipts[ORIGINS[j] + "/"]
        if "Copyright © 2026 Parliament of Tasmania" not in text(BeautifulSoup(body(policy), "html.parser")):
            raise ValueError("Tasmania copyright notice changed")
        licence = rights(j, policy)
        index = receipts[ORIGINS[j] + "/bills"]
        current = {a["href"] for a in BeautifulSoup(body(index), "html.parser").find("main").find_all("a", href=True)}
        discovered = set()
        for r in receipts.values():
            if r["kind"] == "registry":
                discovered.update(a["href"] for a in BeautifulSoup(body(r), "html.parser").find("main").find_all("a", href=True) if "/bills/bills20" in a["href"] and "Bill" in text(a))
        missing = discovered - set(receipts)
        if missing:
            raise ValueError(f"{len(missing)} Tasmania detail pages missing")
        bills = [tas_bill(body(receipts[u]), receipts[u], licence, current) for u in sorted(discovered)]
        gaps = []
        scope = "Annual indexes 2024–2026; published Parliament/session identifiers retained. Current 52nd and previous 51st Parliament; no complete historical-series claim."
    else:
        policy = receipts[ACT_RIGHTS]
        if "CC BY-NC-ND 4.0" not in text(BeautifulSoup(body(policy), "html.parser")):
            raise ValueError("ACT reuse policy changed")
        licence, bills, gaps = rights(j, policy), [], []
        for parliament, prefix in [(11, ACT_BASE + "bills/"), (10, ACT_BASE + "previous-assemblies/tenth-assembly/")]:
            vr, sr, lr = receipts[prefix + "bills_volume"], receipts[prefix + "summary_of_bills"], receipts[prefix + "bills_list"]
            soup = BeautifulSoup(body(lr), "html.parser")
            doc_url = next(a["href"] for a in soup.find("table").find_all("a", href=True) if ".docx" in a["href"])
            dr = receipts[doc_url]
            rows, holes = act_bills(body(vr), body(sr), body(dr), {"volume": vr, "summary": sr, "list": dr}, parliament, licence)
            bills.extend(rows)
            gaps.extend({**g, "parliament": parliament} for g in holes)
        scope = "Current Eleventh and previous Tenth Assembly version indexes joined to published summaries and status lists. Source component dates differ; status dates are shown separately from acquisition."
    apply_corrections("bills-" + j, bills)
    roster = json.loads((root / "portal/public/parliamentarians.json").read_bytes())["people"]
    paths = json.loads((root / "portal/public/person-paths.js").read_text().split("export const PERSON_PATHS = ", 1)[1].strip().rstrip(";"))["exact"]
    for bill in bills:
        bill["official"] = exact_sponsor(bill["sponsor_name"], j, roster, paths)
    bills.sort(key=lambda b: (b["introduced_date"] or "", b["key"]), reverse=True)
    if len({b["key"] for b in bills}) != len(bills):
        raise ValueError("Duplicate state bill key")
    counts = {"bills": len(bills), "parliaments": dict(Counter(str(b["parliament"]) for b in bills)),
        "statuses": dict(Counter(b["status"] for b in bills)), "events": sum(len(b["events"]) for b in bills),
        "document_links": sum(len(b["sources"]) for b in bills), "held_bodies": sum(len(b["sources"]) for b in bills),
        "linked_sponsors": sum(bool(b["official"]) for b in bills), "missing_sponsors": sum(not b["sponsor_name"] for b in bills), "gaps": len(gaps)}
    hub = {"schema": 1, "jurisdiction": j, "generated_at": max(r["snapshot"] for r in receipts.values()),
        "source_index": ORIGINS[j] + "/bills" if j == "tas" else ACT_BASE + "bills", "scope": scope,
        "licence": licence, "counts": counts, "bills": bills, "gaps": gaps}
    inventory = {"schema": 1, "jurisdiction": j, "scope": scope, "counts": counts, "licence": licence,
        "source_pages": [provenance(r) for r in receipts.values() if r["kind"] != "robots"], "gaps": gaps}
    if write:
        for name, value in (("hub", hub), ("inventory", inventory)):
            (stage / (name + ".json")).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    return hub, inventory


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jurisdiction", choices=ORIGINS)
    args = parser.parse_args()
    hub, _ = build(args.jurisdiction, write=True)
    print(json.dumps(hub["counts"]))
