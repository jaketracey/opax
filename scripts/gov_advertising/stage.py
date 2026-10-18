"""Offline reviewed-table staging. Never fetch, publish or write a database.

Finance access is currently held. The CSV adapter is a synthetic-tested contract
for reviewed table transcriptions, not a claim to parse an unseen Finance PDF.
Original document, table transcription and licence receipts must all be joined.
"""
from collections import Counter
import csv
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
SERIES = "https://www.finance.gov.au/publications/reports/advertising"
OPEN_LICENCES = {"https://creativecommons.org/licenses/by/3.0/au/", "https://creativecommons.org/licenses/by/4.0/"}
CATEGORIES = ("media", "campaign_development", "gst", "other")


def sha(body):
    return hashlib.sha256(body).hexdigest()


def finance_url(value):
    return isinstance(value, str) and value.startswith("https://www.finance.gov.au/") and not re.search(r"[\s<>\"]", value)


def cleared(document):
    rights, receipt = document.get("licence", {}), document.get("receipt", {})
    policy = rights.get("receipt", {})
    valid_url = lambda url: finance_url(url) if document.get('jurisdiction', 'Federal') == 'Federal' else (
        document.get('jurisdiction') == 'VIC' and isinstance(url, str)
        and re.fullmatch(r'https://www\.vic\.gov\.au/[^\s<>"\']+', url) is not None)
    return (document.get("status") == "reviewed" and valid_url(document.get("url"))
            and re.fullmatch(r"[a-f0-9]{64}", document.get("sha256", "")) is not None
            and receipt.get("status") == 200 and receipt.get("robots_allowed") is True
            and receipt.get("challenge") is False and receipt.get("sha256") == document["sha256"]
            and bool(receipt.get("snapshot"))
            and rights.get("status") == "open" and rights.get("url") in OPEN_LICENCES
            and rights.get("reviewed") is True and rights.get("scope_sha256") == document["sha256"]
            and valid_url(rights.get("policy_url")) and policy.get("status") == 200
            and re.fullmatch(r"[a-f0-9]{64}", policy.get("sha256", "")) is not None
            and bool(policy.get("snapshot")) and bool(rights.get("terms"))
            and not re.search(r"non.?commercial|no.?derivatives|\bNC\b|\bND\b|all rights reserved|prior written permission|without permission", rights["terms"], re.I)
            and rights.get("exceptions_reviewed") is True)


def cents(value, multiplier):
    try:
        number = Decimal(value.replace(",", "").replace("$", "").strip()) * Decimal(str(multiplier)) * 100
    except InvalidOperation as exc:
        raise ValueError("Invalid published amount") from exc
    if not number.is_finite() or number < 0 or number != number.to_integral_value():
        raise ValueError("Amount must resolve to non-negative whole cents")
    return int(number)


def parse_table(body, document):
    # Crucially precedes even CSV decoding: held bytes can never become rows.
    if not cleared(document):
        return [], {"status": "held", "reason": "Source access or document licence is not cleared"}
    if sha(body) != document.get("table_sha256"):
        raise ValueError("Table transcription hash mismatch")
    year = document["financial_year"]
    if not re.fullmatch(r"\d{4}-\d{2}", year) or int(year[-2:]) != (int(year[:4]) + 1) % 100:
        raise ValueError("Invalid financial year")
    multiplier = document["amount_multiplier"]
    if multiplier not in (1, 1000, 1_000_000) or not document.get("basis") or not document.get("measure"):
        raise ValueError("Explicit source units, GST basis and expenditure scope required")
    reader = csv.DictReader(io.StringIO(body.decode("utf-8-sig")))
    required = {"financial_year", "entity", "campaign", "total", "source_locator"}
    if not required.issubset(reader.fieldnames or []) or set(reader.fieldnames) - required - set(CATEGORIES):
        raise ValueError("Unsupported table columns; hold for review")
    rows, seen = [], set()
    for source in reader:
        if None in source or any(not (source.get(k) or "").strip() for k in required) or source["financial_year"] != year:
            raise ValueError("Missing source coordinate or mismatched financial year")
        locator = source["source_locator"].strip()
        if not re.search(r"(?:page|table|p\.)\s*\S+", locator, re.I):
            raise ValueError("Page or table reference required")
        identity = (document["sha256"], locator)
        if identity in seen:
            raise ValueError("Duplicate document/table row coordinate")
        seen.add(identity)
        categories = {key: cents(source[key], multiplier) if source.get(key, "").strip() else None for key in CATEGORIES}
        total = cents(source["total"], multiplier)
        if document.get("categories_complete") and sum(v or 0 for v in categories.values()) != total:
            raise ValueError("Campaign categories do not reconcile")
        rows.append({"id": document["id"] + ":" + str(len(rows) + 1), "financial_year": year,
                     "entity": source["entity"].strip(), "campaign": source["campaign"].strip(),
                     "categories_cents": categories, "total_cents": total, "basis": document["basis"],
                     "measure": document["measure"], "source_url": document["url"], "source_locator": locator,
                     "snapshot": document["receipt"]["snapshot"], "sha256": document["sha256"],
                     "table_sha256": document["table_sha256"], "licence": document["licence"]})
    if not rows:
        raise ValueError("Empty cleared table cannot replace a register")
    total, expected = sum(r["total_cents"] for r in rows), document["report_total_cents"]
    if not isinstance(expected, int) or isinstance(expected, bool) or expected < 0:
        raise ValueError("Report's own total is required")
    # Any rounding allowance must be separately reviewed and shown in the output.
    tolerance = document.get("rounding_tolerance_cents", 0)
    quantum = document.get("published_quantum_cents", 1)
    if not isinstance(tolerance, int) or tolerance < 0 or not isinstance(quantum, int) or quantum < 1 or tolerance > (len(rows) + 1) * quantum // 2:
        raise ValueError("Invalid rounding allowance")
    if tolerance and not document.get("rounding_note"):
        raise ValueError("Rounding allowance requires a published note")
    if abs(total - expected) > tolerance:
        raise ValueError("Campaign rows do not reconcile to the report total")
    return rows, {"status": "reconciled", "financial_year": year, "rows": len(rows),
                  "sum_cents": total, "report_total_cents": expected, "difference_cents": total - expected,
                  "tolerance_cents": tolerance, "rounding_note": document.get("rounding_note"),
                  "source_locator": document["total_source_locator"]}


def projection(inventory, root=ROOT):
    rows, documents, reconciliation, seen = [], [], [], set()
    for document in inventory["documents"]:
        if not cleared(document):
            continue
        # Different file formats of the same report must never double count.
        if document["financial_year"] in seen:
            raise ValueError("More than one reviewed report for a financial year")
        seen.add(document["financial_year"])
        original = (root / document["original_path"]).resolve()
        table = (root / document["table_path"]).resolve()
        if not original.is_relative_to(root.resolve()) or not table.is_relative_to(root.resolve()):
            raise ValueError("Source paths must stay inside this checkout")
        if sha(original.read_bytes()) != document["sha256"]:
            raise ValueError("Original report hash mismatch")
        parsed, result = parse_table(table.read_bytes(), document)
        rows.extend(parsed)
        documents.append({k: document[k] for k in ("id", "financial_year", "url", "sha256", "licence", "basis", "measure", "receipt")})
        reconciliation.append(result)
    return {"schema": 1, "generated_at": inventory["generated_at"], "source_url": SERIES,
            "documents": documents, "rows": rows, "reconciliation": reconciliation,
            "counts": {"rows": len(rows), "years": dict(sorted(Counter(r["financial_year"] for r in rows).items()))}}


if __name__ == "__main__":
    stage = ROOT / "data/staged/gov-advertising"
    inventory = json.loads((stage / "inventory.json").read_text())
    output = projection(inventory)
    (stage / "hub.json").write_text(json.dumps(output, indent=2) + "\n")
    print(json.dumps({**output["counts"], "held_documents": len(inventory["documents"]) - len(output["documents"]),
                      "reconciliation": "not performed" if not output["rows"] else "passed", "production_writes": 0}))
