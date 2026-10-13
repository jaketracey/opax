"""Offline inventory, licence review and per-period projection. No production client."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from .acquire import ROOT, INDEX, ORIGIN, robots_allowed, robots_rules

CC = "https://creativecommons.org/licenses/by/4.0/"


def text(node):
    return " ".join(node.get_text(" ", strip=True).split())


def name_key(name):
    # Strip only the published office title; no initials, nicknames or alias joins.
    return re.sub(r"^(?:The\s+)?Hon\.?\s+", "", " ".join(name.split()), flags=re.I).casefold()


def exact_holder(name, roster, paths):
    candidates = [p for p in roster if name_key(p["name"]) == name_key(name)
        and any(r.get("jurisdiction") == "vic" for r in p.get("representation", []))
        and not p.get("witness_name") and p.get("speaker_type") != "witness" and not p.get("speech_scope")]
    if len(candidates) != 1:
        return None
    p = candidates[0]
    href = paths.get(p["name"])
    if not href or not re.fullmatch(r"/subject/person/[a-z0-9-]+", href):
        return None
    return {"name": p["name"], "href": href, "pid": p.get("pid"),
        "method": "unique exact Victorian roster name after removing Hon title"}


def licence_review(copyright_body, source_body, copyright_receipt):
    policy = BeautifulSoup(copyright_body, "html.parser")
    policy_text = text(policy.find("main"))
    source = BeautifulSoup(source_body, "html.parser")
    # A grant on an unrelated host, a DGS-only grant, or an exception is insufficient.
    linked = any(urljoin(ORIGIN, a["href"]) == ORIGIN + "/copyright" for a in source.find_all("a", href=True))
    broad_grant = "All material provided on this website is provided under a" in policy_text
    cc_link = any(a["href"].rstrip("/") in {CC.rstrip("/"), CC + "legalcode"} for a in policy.find_all("a", href=True))
    main_text = text(source.find("main"))
    exception = bool(re.search(r"all rights reserved|permission (?:is )?required|not (?:covered|licensed)|third.party copyright|copyright exception", main_text, re.I))
    open_grant = linked and broad_grant and cc_link and not exception and copyright_receipt["status"] == 200
    return {"status": "open" if open_grant else "held", "name": "CC BY 4.0" if open_grant else "Reuse unverified",
        "url": CC if open_grant else None, "policy_url": ORIGIN + "/copyright",
        "content_owner": "State Government of Victoria; Department of Premier and Cabinet register",
        "scope": "Same-site website-material grant; DGS ownership sentence is not a DGS-only licence restriction.",
        "exceptions": ["images and branding, including Coat of Arms and government logo", "content supplied by third parties"],
        "reason": "Period page links the site-wide grant; DPC publishes the register as State Government material. No table-specific exception found." if open_grant else "Applicable open grant not established or page-specific exception detected",
        "policy_receipt": {"sha256": copyright_receipt["sha256"], "snapshot": copyright_receipt["checked_at"]}}


def period_from_page(body):
    main = BeautifulSoup(body, "html.parser").find("main")
    match = re.search(r"between (\d{1,2} \w+ \d{4}) (?:to|and) (\d{1,2} \w+ \d{4})", text(main))
    if not match:
        raise ValueError("Missing explicit source reporting period")
    dates = [datetime.strptime(x, "%d %B %Y").date().isoformat() for x in match.groups()]
    return {"id": dates[0] + "_" + dates[1], "start": dates[0], "end": dates[1],
        "label": " to ".join(match.groups())}


def parse_register(body, document, roster, paths):
    # This check precedes parsing any source row, including held-file fixtures.
    if document["licence"]["status"] != "open" or document["licence"]["url"] != CC:
        return []
    if hashlib.sha256(body).hexdigest() != document["receipt"]["sha256"]:
        raise ValueError("Register snapshot hash mismatch")
    main = BeautifulSoup(body, "html.parser").find("main")
    rows = []
    fields = {"minister": "office_holder", "parliamentary secretary": "office_holder", "portfolio": "portfolio",
        "description": "description", "name of donor": "giver", "date": "date",
        "estimated value": "estimated_value", "action taken": "action_taken"}
    for ti, table in enumerate(main.find_all("table"), 1):
        trs = table.find_all("tr")
        headers = [text(c).lower() for c in trs[0].find_all(["th", "td"], recursive=False)]
        if not headers or headers[0] not in {"minister", "parliamentary secretary"}:
            raise ValueError("Unrecognised source table; hold the period")
        role = "Minister" if headers[0] == "minister" else "Parliamentary secretary"
        if not {"portfolio", "description", "name of donor"}.issubset(headers):
            raise ValueError("Missing mandatory source fields")
        for ri, tr in enumerate(trs[1:], 1):
            cells = tr.find_all(["th", "td"], recursive=False)
            if len(cells) != len(headers) or any(c.get("rowspan") or c.get("colspan") for c in cells):
                raise ValueError("Unsupported merged/short row; hold the period")
            values = [text(c) for c in cells]
            row = {field: None for field in fields.values()}
            row.update({fields[h]: v or None for h, v in zip(headers, values) if h in fields})
            if not row["office_holder"]:
                raise ValueError("Missing office holder")
            locator = f"table-{ti}/row-{ri}"
            rows.append({**row, "id": document["id"] + "/" + locator, "register_id": document["id"],
                "period": document["period"]["label"], "role": role,
                "official": exact_holder(row["office_holder"], roster, paths),
                "source_url": document["url"], "source_locator": locator,
                "source_table_id": table.get("id") or f"table-{ti}", "source_row_id": tr.get("id") or f"row-{ri}",
                "snapshot": document["receipt"]["snapshot"], "sha256": document["receipt"]["sha256"],
                "licence": document["licence"]["name"], "licence_url": document["licence"]["url"]})
    if not rows or len(main.find_all("table")) != 2:
        raise ValueError("Expected both minister and parliamentary-secretary tables")
    return rows


def build(stage, roster_path=None, paths_path=None, dry_run=False):
    stage = Path(stage)
    ledger = json.loads((stage / "receipts.json").read_text())
    def body(receipt):
        b = (ROOT / receipt["snapshot_path"]).read_bytes()
        if hashlib.sha256(b).hexdigest() != receipt["sha256"]:
            raise ValueError("Receipt hash mismatch")
        return b
    receipts = {r["url"]: r for r in ledger["receipts"]}
    index = receipts.get(INDEX)
    if not index or index["status"] != 200:
        raise ValueError("Index unavailable; no complete inventory can be built")
    copyright_receipt = receipts.get(ORIGIN + "/copyright")
    if not copyright_receipt or copyright_receipt["status"] != 200:
        raise ValueError("Licence receipt unavailable")
    roster_path = roster_path or ROOT / "portal/public/parliamentarians.json"
    paths_path = paths_path or ROOT / "portal/public/person-paths.js"
    roster = json.loads(Path(roster_path).read_text())["people"]
    paths = json.loads(Path(paths_path).read_text().split("export const PERSON_PATHS = ", 1)[1].strip().rstrip(";"))["exact"]
    soup = BeautifulSoup(body(index), "html.parser").find("main")
    links = {urljoin(INDEX, a["href"]): text(a) for a in soup.find_all("a", href=True) if "Ministerial register of gifts" in text(a)}
    documents, registers, holds = [], [], []
    for url, label in links.items():
        receipt = receipts.get(url)
        if not receipt or receipt["status"] != 200 or receipt.get("challenge"):
            holds.append({"url": url, "label": label, "reason": "Collection stopped or source unavailable", "receipt": receipt})
            continue
        source = body(receipt)
        period = period_from_page(source)
        rights = licence_review(body(copyright_receipt), source, copyright_receipt)
        document = {"id": "vic-gifts-" + period["id"], "period": period, "url": url, "title": label,
            "format": "HTML", "licence": rights, "status": "cleared" if rights["status"] == "open" else "held",
            "receipt": {"sha256": receipt["sha256"], "snapshot": receipt["checked_at"]}}
        try:
            rows = parse_register(source, document, roster, paths)
        except ValueError as exc:
            document["status"] = "held"; document["hold_reason"] = str(exc); rows = []
        document["row_count"] = len(rows)
        document["role_counts"] = dict(Counter(row["role"] for row in rows))
        documents.append(document)
        registers.append({"schema": 1, "document": document, "rows": rows})
        if document["status"] == "held":
            holds.append({"url": url, "reason": document.get("hold_reason") or rights["reason"], "receipt": document["receipt"]})
        # Linked downloads are inventoried without requesting disallowed file paths.
        for a in BeautifulSoup(source, "html.parser").find("main").find_all("a", href=True):
            if "/sites/default/files/" in a["href"]:
                holds.append({"url": urljoin(url, a["href"]), "reason": "Download robots/licence requires separate review", "source_page": url})
    hub = {"schema": 1, "generated_at": max(r["checked_at"] for r in ledger["receipts"]),
        "source_index": INDEX, "attribution": "© Copyright State Government of Victoria",
        "changes": "Source table text normalised for whitespace and arranged by period; no endorsement implied.",
        "scope": "All three periods linked by the DPC ministerial register index at this snapshot. Agency staff gifts and MPs' ordinary returns are separate series.",
        "registers": registers, "holds": holds, "collection_stopped": ledger.get("stopped")}
    rows = [r for register in registers for r in register["rows"]]
    counts = {"periods": len(links), "html_pages": len(documents), "tables": len(registers) * 2,
        "rows": len(rows), "roles": dict(Counter(r["role"] for r in rows)),
        "linked_rows": sum(bool(r["official"]) for r in rows), "unlinked_rows": sum(not r["official"] for r in rows),
        "holds": len(holds), "source_receipts": len(ledger["receipts"])}
    if not dry_run:
        (stage / "registers").mkdir(exist_ok=True)
        for register in registers:
            (stage / "registers" / (register["document"]["id"] + ".json")).write_text(json.dumps(register, ensure_ascii=False, indent=2) + "\n")
        (stage / "inventory.json").write_text(json.dumps({"source_index": INDEX, "counts": counts, "documents": documents, "holds": holds}, ensure_ascii=False, indent=2) + "\n")
        (stage / "hub.json").write_text(json.dumps(hub, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(counts, indent=2))
    return hub


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", default="data/staged/vic-gifts")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    build(args.stage, dry_run=args.dry_run)
