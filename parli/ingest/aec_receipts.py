"""AEC receipt provenance and offline, non-destructive legacy backfill.

The CSV record ordinal is the identity, not (donor, recipient, value): equal gifts can
occur more than once. Donor declarations are retained only for cross-checks.
"""
import csv
import io
import re
from collections import defaultdict


DONATION_COLUMNS = ("receipt_type", "return_type", "recipient_kind", "record_side", "source_file")
DDL = """
CREATE TABLE IF NOT EXISTS aec_receipt_records (
    archive TEXT NOT NULL,
    source_file TEXT NOT NULL,
    source_row INTEGER NOT NULL,
    source TEXT NOT NULL,
    donor_name TEXT NOT NULL,
    recipient TEXT NOT NULL,
    amount REAL,
    financial_year TEXT,
    receipt_type TEXT,
    receipt_type_basis TEXT NOT NULL,
    return_type TEXT,
    recipient_kind TEXT,
    record_side TEXT NOT NULL,
    gift_date TEXT,
    PRIMARY KEY (archive, source_file, source_row)
);
CREATE INDEX IF NOT EXISTS ix_aec_receipts_side ON aec_receipt_records(record_side);
CREATE TABLE IF NOT EXISTS aec_receipt_files (
    archive TEXT NOT NULL,
    source_file TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    PRIMARY KEY (archive, source_file)
);
"""

# filename: donor, recipient, amount, period, date, side, implicit type, implicit return kind
FILES = {
    "AllAnnualData": {
        "Detailed Receipts.csv": ("Received From", "Recipient Name", "Value", "Financial Year", None, "recipient", None, None),
        "Donations Made.csv": ("Donor Name", "Donation Made To", "Value", "Financial Year", "Date", "cross_check", "Donation Received", None),
        "Donor Donations Received.csv": ("Donation Received From", "Name", "Value", "Financial Year", "Date", "cross_check", "Donation Received", "Donor Return"),
        "Third Party Donations Received.csv": ("Donation Received From", "Name", "Value", "Financial Year", "Date", "recipient", "Donation Received", "Third Party Return"),
        "Capital Contributions.csv": ("Contributor", "Name", "Value", "Financial Year", None, "separate", "Capital Contribution", None),
        "Detailed Discretionary Benefits.csv": ("Received From", "Name", "Value", "Financial Year", "Date", "separate", "Discretionary Benefit", None),
    },
    "AllElectionsData": {
        "Donor Donations Made.csv": ("Donor Name", "Donated To", "Donated To Gift Value", "Event", "Donated To Date Of Gift", "cross_check", "Donation Received", None),
        "Donor Donations Received.csv": ("Gift From Name", "Donor Name", "Gift From Gift Value", "Event", "Gift From Date Of Gift", "cross_check", "Donation Received", "Donor Return"),
        "Senate Groups and Candidate Donations.csv": ("Donor Name", "Name", "Gift Value", "Event", "Date Of Gift", "recipient", "Donation Received", None),
        "Third Party Return Donations Made.csv": ("Third Party Name", "Name", "Donation Value", "Event", "Date Of Donation", "cross_check", "Donation Received", None),
        "Third Party Return Donations Received.csv": ("Donor Name", "Third Party Name", "Gift Value", "Event", "Date Of Gift", "recipient", "Donation Received", "Third Party Return"),
    },
    "AllReferendumData": {
        "Referendum Donations Made.csv": ("Donor Name", "Donated to name", "Value", "Event", "Date", "cross_check", "Donation Received", None),
        "Referendum Entity Donations Received.csv": ("Donor name", "Name", "Value", "Event", "Date", "recipient", "Donation Received", "Referendum Entity Return"),
    },
}

KINDS = {
    "Political Party Return": "political_party",
    "Associated Entity Return": "associated_entity",
    "Significant Third Party Return": "significant_third_party",
    "Political Campaigner Return": "political_campaigner",
    "Third Party Return": "third_party",
    "Member of HOR Return": "member_of_parliament",
    "Member of House of Representatives Return": "member_of_parliament",
    "Senator Return": "member_of_parliament",
    "Candidate": "candidate",
    "Senate Group": "senate_group",
    "Donor Return": "donor",
    "Referendum Entity Return": "referendum_entity",
}
SOURCES = {"AllAnnualData": "aec_annual", "AllElectionsData": "aec_election", "AllReferendumData": "aec_referendum"}


def normal_type(value):
    """Mechanical normalisation only. Never reinterpret Other Receipt as a loan."""
    return re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_") or "unknown"


def period_key(value):
    """Match the historical DB's shortened financial years to the raw spelling."""
    return re.sub(r"^(\d{4})-(?:19|20)(\d{2})$", r"\1-\2", value or "")


def migrate(db):
    columns = {r[1] for r in db.execute("PRAGMA table_info(donations)")}
    if "state" not in columns:
        db.execute("ALTER TABLE donations ADD COLUMN state TEXT DEFAULT 'federal'")
    for name in DONATION_COLUMNS:
        if name not in columns:
            db.execute(f"ALTER TABLE donations ADD COLUMN {name} TEXT")
    db.executescript(DDL)


def load_archive(db, zf, archive, read_text, parse_amount):
    """Replace one complete cached archive; preserve repeated recipient rows."""
    expected = FILES[archive]
    missing = set(expected) - set(zf.namelist())
    if missing:
        raise ValueError(f"{archive}: missing receipt files: {sorted(missing)}")
    records, file_counts = [], []
    for filename, (dc, rc, ac, yc, datec, side, implicit, return_kind) in expected.items():
        start_count = len(records)
        reader = csv.DictReader(io.StringIO(read_text(zf, filename)))
        required = {dc, rc, ac, yc}
        if filename == "Detailed Receipts.csv":
            required.update(("Receipt Type", "Return Type"))
        if filename == "Senate Groups and Candidate Donations.csv":
            required.add("Return Type (Candidate/Senate Group)")
        if not required <= set(reader.fieldnames or []):
            raise ValueError(f"{archive}/{filename}: missing columns {sorted(required - set(reader.fieldnames or []))}")
        for number, row in enumerate(reader, 2):
            donor, recipient = row[dc].strip(), row[rc].strip()
            # Retain blank-name rows in provenance for raw reconciliation; exporters exclude them.
            rt = (row.get("Return Type") or row.get("Return Type (Candidate/Senate Group)") or return_kind or "").strip() or None
            receipt = row.get("Receipt Type", implicit)
            records.append((archive, filename, number, SOURCES[archive], donor, recipient,
                            parse_amount(row[ac]), row[yc].strip() or None,
                            receipt.strip() if receipt else None, "column" if "Receipt Type" in row else "file",
                            rt, KINDS.get(rt), side, row.get(datec) if datec else None))
        file_counts.append((archive, filename, len(records) - start_count))
    db.execute("DELETE FROM aec_receipt_records WHERE archive=?", (archive,))
    db.executemany("INSERT INTO aec_receipt_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", records)
    db.execute("DELETE FROM aec_receipt_files WHERE archive=?", (archive,))
    db.executemany("INSERT INTO aec_receipt_files VALUES (?,?,?)", file_counts)
    return len(records)


def backfill_legacy(db):
    """Exact keys only; prefer the recipient declaration, hold conflicting types.

    The old importer discarded file identity and gift dates. Where multiple
    types share its key we cannot recover which row survived its deduplication.
    Keep those legacy rows unknown; the complete provenance table is authoritative.
    """
    candidates = defaultdict(lambda: defaultdict(set))
    for r in db.execute("SELECT source,donor_name,recipient,amount,financial_year,receipt_type,return_type,recipient_kind,record_side,source_file FROM aec_receipt_records"):
        key = (*r[:4], period_key(r[4]))
        candidates[key][r[8]].add(tuple(r[5:]))
    updated, ambiguous, unmatched = 0, 0, 0
    changes = []
    for r in db.execute("SELECT donation_id,source,donor_name,recipient,amount,financial_year,source_file,record_side,receipt_type,return_type,recipient_kind FROM donations WHERE source IN ('aec_annual','aec_election','aec_referendum')"):
        sides = candidates.get((*r[1:5], period_key(r[5])))
        if not sides:
            unmatched += 1
            changes.append((None, None, None, "unmatched", None, r[0]))
            continue
        # A fresh loader knows its actual file and type. An old row has no
        # recoverable file identity, even when its amounts match one declaration.
        if r[7] in ("recipient", "cross_check", "separate") and (r[8], r[9], r[10], r[7], r[6]) in sides.get(r[7], set()):
            updated += 1
            continue
        options = next(sides[s] for s in ("recipient", "cross_check", "separate") if s in sides)
        if len(options) != 1:
            ambiguous += 1
            changes.append((None, None, None, "ambiguous", None, r[0]))
            continue
        recovered = next(iter(options))
        changes.append((*recovered[:3], recovered[3] + "_match", recovered[4], r[0]))
        updated += 1
    db.executemany("UPDATE donations SET receipt_type=?,return_type=?,recipient_kind=?,record_side=?,source_file=? WHERE donation_id=?", changes)
    return {"updated": updated, "ambiguous": ambiguous, "unmatched": unmatched}
