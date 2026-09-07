#!/usr/bin/env python3
"""Export evidence-backed discovery cards from a read-only production snapshot.

    python3 scripts/export_discovery.py --ssh desktop --output portal/public/discovery.json

The database is opened mode=ro with query_only enabled. Filtered analysis tables
exist only in a separate in-memory connection. SSH streams source code to Python;
it does not install files or alter the source checkout/database on the host.
"""
import argparse
from collections import Counter
from contextlib import closing
from datetime import datetime, timezone
import importlib.util
import json
import math
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
from urllib.parse import quote

DEFAULT_DB = "/home/jake/.cache/autoresearch/parli.db"
# Match the current federal money export's public/internal funding exclusions.
PUBLIC_FUNDING_RE = re.compile(
    r"electoral commission|election funding|electoral office|"
    r"tax(ation)?\s+(office|authority)|\bato\b|\baec\b|\becq\b|"
    r"department of|australian agency|commonwealth of australia|electoral comm\b", re.I)
PARTY_WORD_RE = re.compile(
    r"\blabor\b|\bliberal\b|\bliberals\b|\bgreens\b|\bnationals\b|"
    r"\bone nation\b|\bunited australia\b|\bkatter\b|\bfamily first\b|"
    r"\bcentre alliance\b|\bcountry liberal\b|\blnp\b|\balp\b|"
    r"\bcormack foundation\b|\bjohn curtin house\b|\bfree enterprise foundation\b|"
    r"\bnational party\b|\bdemocrats\b", re.I)


def _analysis():
    if "opax_discovery_analysis" in sys.modules:
        return sys.modules["opax_discovery_analysis"]
    path = Path(__file__).resolve().parents[1] / "parli/analysis/discovery.py"
    spec = importlib.util.spec_from_file_location("opax_discovery_analysis", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def export_discovery(source, limit=60):
    started = time.monotonic()
    source.row_factory = sqlite3.Row
    source.execute("PRAGMA query_only=ON")
    source.execute("BEGIN")  # One consistent read snapshot across source tables.
    aliases = {r["alias_raw"]: r["entity_id"] for r in source.execute(
        "SELECT alias_raw, entity_id FROM ext_donor_aliases")}
    entities = {r["entity_id"]: dict(r) for r in source.execute(
        "SELECT entity_id, canonical_name, kind FROM ext_donor_entities")}
    work = sqlite3.connect(":memory:")
    work.row_factory = sqlite3.Row
    work.executescript("""
        CREATE TABLE donations (donation_id INTEGER PRIMARY KEY, donor_name TEXT,
            recipient TEXT, amount REAL, financial_year TEXT, source TEXT);
        CREATE TABLE contracts (contract_id TEXT PRIMARY KEY, supplier_name TEXT,
            agency TEXT, amount REAL, start_date TEXT, source TEXT);
    """)
    excluded = Counter()
    original_donations = {}
    eligible = source.execute("""
        SELECT donation_id, donor_name, recipient, recipient_canonical, amount,
               financial_year, industry, source FROM donations
        WHERE source = 'aec_annual' AND donation_type = 'direct'
          AND recipient_canonical IS NOT NULL AND TRIM(recipient_canonical) <> ''
          AND amount > 0
    """)
    candidate_count = 0
    for r in eligible:
        candidate_count += 1
        name = (r["donor_name"] or "").strip()
        ent = entities.get(aliases.get(name))
        canonical = ent["canonical_name"] if ent else name
        amount = float(r["amount"])
        if not name or not math.isfinite(amount):
            excluded["blank_or_invalid"] += 1
            continue
        if ent and ent["kind"] in {"government", "party_unit"}:
            excluded["government_or_party_entity"] += 1
            continue
        if (PUBLIC_FUNDING_RE.search(name) or PUBLIC_FUNDING_RE.search(canonical)
                or r["industry"] == "government"):
            excluded["public_funding"] += 1
            continue
        if (r["industry"] == "party_internal" or PARTY_WORD_RE.search(name)
                or PARTY_WORD_RE.search(canonical)):
            excluded["party_internal"] += 1
            continue
        work.execute("INSERT INTO donations VALUES (?, ?, ?, ?, ?, ?)",
                     (r["donation_id"], canonical, r["recipient_canonical"], amount,
                      r["financial_year"], r["source"]))
        original_donations[str(r["donation_id"])] = dict(r)
    contract_excluded = 0
    for r in source.execute("SELECT contract_id,supplier_name,agency,amount,start_date,source FROM contracts"):
        if r["amount"] is None or not math.isfinite(float(r["amount"])) or float(r["amount"]) <= 0:
            contract_excluded += 1
            continue
        work.execute("INSERT INTO contracts VALUES (?, ?, ?, ?, ?, ?)", tuple(r))
    result = _analysis().build_discoveries(work, limit=limit)
    for signal in result["signals"]:
        # A resolved DB entity need not have a published top-250 donor profile.
        signal["entity_url"] = None
        if signal["category"] == "donor_contract_overlap":
            signal["title"] = f"{signal['entity']} appears in party receipts and contracts"
            signal["summary"] = "An exact supplier-name match connects a canonical donor in annual AEC party-receipt disclosures with government contract awards."
        elif signal["category"] == "recipient_concentration":
            signal["summary"] = signal["summary"].replace("donation value", "annual AEC party-receipt value")
        for metric in signal["metrics"]:
            metric["label"] = metric["label"].replace("Recorded donations", "Recorded party receipts").replace("Donation records", "Party receipt records")
        for evidence in signal["evidence"]:
            if evidence["table"] == "donations":
                r = original_donations[evidence["record_id"]]
                evidence["label"] = (f"{r['donor_name']} → {r['recipient']}: ${r['amount']:,.2f}"
                                     f" · FY {r['financial_year'] or 'unknown'} · AEC annual receipt"
                                     f" · local record {r['donation_id']}")
                evidence["url"] = "https://transparency.aec.gov.au/"
                evidence["link_scope"] = "source_register"
            else:
                evidence["url"] = "https://www.tenders.gov.au/"
                evidence["link_scope"] = "source_register"
        if signal["category"] != "procurement_concentration":
            signal["caveats"].append("Annual party receipts are not all verified gifts; source donation_type=direct is an ingestion classification. State, election and referendum disclosures are excluded.")
    all_donations = source.execute("SELECT COUNT(*) FROM donations").fetchone()[0]
    all_contracts = source.execute("SELECT COUNT(*) FROM contracts").fetchone()[0]
    years = work.execute("SELECT MIN(financial_year), MAX(financial_year) FROM donations").fetchone()
    result["coverage"].update({
        "source_donation_rows": all_donations, "source_contract_rows": all_contracts,
        "eligible_annual_party_receipt_rows": candidate_count,
        "excluded_before_name_checks": all_donations - candidate_count,
        "excluded_receipt_rows": dict(excluded), "excluded_contract_rows": contract_excluded,
        "financial_year_from": years[0], "financial_year_to": years[1],
        "receipt_scope": "AEC annual returns to canonical parties, direct classification only",
        "snapshot_at": datetime.now(timezone.utc).isoformat(),
    })
    result["methodology"] = [
        "This snapshot uses annual AEC party-receipt records with a canonical party recipient and ingestion classification direct. These are disclosed receipts, not a verified gifts-only dataset.",
        "Associated-entity revenues, nonpolitical/employer/philanthropic/flagged records, public funding, government entities, internal party transfers and nonannual sources are excluded.",
        "Donor spellings use the current ext_donor_aliases/ext_donor_entities register. Supplier names then match a canonical donor name exactly after trimming/case folding; unresolved aliases and corporate-group relationships are not inferred.",
        "State, election and referendum disclosures are not added to annual federal receipts. Concentration includes all eligible classified and unclassified donors without a display-size floor.",
        "Amounts span all available reporting years. Annual receipts and contract awards are separate money flows and are never summed; matching names and periods do not establish causation or misconduct.",
        "Concentration requires at least two positive records and a largest-participant share of at least 25%. Cards alternate signal families and rank within each family by recorded value.",
        "Contracts reflect recorded award values, not expenditure, and are a partial corpus. Date errors and future start dates are possible; no timing inference is made.",
        "Source links open the official source register, not an individual receipt or notice. Evidence labels carry original reported names, row amounts and local source IDs; each is one example behind the aggregate.",
        "Reporting thresholds, incomplete coverage and duplicated/amended disclosures can affect totals. Absence of a signal is not evidence of absence.",
    ]
    result["generated_at"] = result["coverage"]["snapshot_at"]
    result["export_seconds"] = round(time.monotonic() - started, 3)
    source.rollback()
    work.close()
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ssh", help="Read-only database host, e.g. desktop")
    parser.add_argument("--db", default=DEFAULT_DB)
    parser.add_argument("--limit", type=int, default=60)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    if args.ssh:
        analysis = (Path(__file__).resolve().parents[1] / "parli/analysis/discovery.py").read_text()
        script = Path(__file__).read_text()
        payload = ("import sys,types\nmodule=types.ModuleType('opax_discovery_analysis')\n"
                   f"exec({analysis!r},module.__dict__)\nsys.modules['opax_discovery_analysis']=module\n"
                   f"sys.argv=['export_discovery.py','--db',{args.db!r},'--limit',{str(args.limit)!r}]\n"
                   f"exec({script!r},{{'__name__':'__main__'}})\n")
        completed = subprocess.run(["ssh", args.ssh, "python3", "-"], input=payload,
                                   text=True, capture_output=True, check=True)
        data = json.loads(completed.stdout)
    else:
        with closing(sqlite3.connect("file:" + quote(str(Path(args.db).expanduser()), safe="/") + "?mode=ro", uri=True)) as source:
            data = export_discovery(source, args.limit)
    output = json.dumps(data, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix(args.output.suffix + ".tmp")
        temporary.write_text(output)
        temporary.replace(args.output)
        print(f"Exported {len(data['signals'])} cards in {data['export_seconds']}s to {args.output}", file=sys.stderr)
    else:
        print(output, end="")


if __name__ == "__main__":
    main()
