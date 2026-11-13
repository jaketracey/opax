import contextlib
import csv
import io
import json
import sqlite3
import sys
import subprocess
from pathlib import Path
import zipfile
from unittest import mock

import pytest

from parli.ingest import aec_receipts as receipts, donations
from parli.schema import init_db
from scripts import export_money_graph as exporter
from scripts.report_aec_receipt_types import report
from scripts.aec_receipt_selection import load_selection


def archive(key, entries=None):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        for name, spec in receipts.FILES[key].items():
            columns = list(dict.fromkeys(c for c in spec[:5] if c))
            if name == "Detailed Receipts.csv":
                columns.extend(("Return Type", "Receipt Type"))
            elif name in ("Capital Contributions.csv", "Detailed Discretionary Benefits.csv"):
                columns.append("Return Type")
            if name == "Senate Groups and Candidate Donations.csv":
                columns.append("Return Type (Candidate/Senate Group)")
            text = io.StringIO()
            writer = csv.DictWriter(text, fieldnames=columns)
            writer.writeheader()
            writer.writerows((entries or {}).get(name, []))
            z.writestr(name, text.getvalue())
    return out.getvalue()


def annual(kind="Donation Received", **extra):
    return {"Received From": "Example Mining Ltd", "Recipient Name": "Example Party",
            "Financial Year": "2020-2021", "Return Type": "Political Party Return",
            "Receipt Type": kind, "Value": "100.25", **extra}


def database(path):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    init_db(db)
    db.execute("ALTER TABLE donations ADD COLUMN recipient_canonical TEXT")
    return db


def load(db, key, entries):
    with zipfile.ZipFile(io.BytesIO(archive(key, entries))) as z:
        return receipts.load_archive(db, z, key, donations._read_csv_text, donations.parse_amount)


def export(path):
    out = io.StringIO()
    with mock.patch.object(exporter, "DB_PATH", str(path)), contextlib.redirect_stdout(out):
        exporter.main()
    return json.loads(out.getvalue())


def test_migration_is_additive_and_idempotent():
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE donations(donation_id,donor_name,amount,donation_type)")
    db.execute("INSERT INTO donations VALUES (9,'Example Ltd',123,'flagged_review')")
    receipts.migrate(db)
    receipts.migrate(db)
    assert db.execute("SELECT donation_id,amount,donation_type FROM donations").fetchone() == (9, 123, "flagged_review")
    assert set(receipts.DONATION_COLUMNS) <= {r[1] for r in db.execute("PRAGMA table_info(donations)")}


def test_direct_loaders_keep_real_aec_columns(tmp_path):
    db = database(tmp_path / "db")
    with zipfile.ZipFile(io.BytesIO(archive("AllAnnualData", {"Detailed Receipts.csv": [annual()]}))) as z:
        donations.load_annual_detailed_receipts(db, donations._read_csv_text(z, "Detailed Receipts.csv"))
    with zipfile.ZipFile(io.BytesIO(archive("AllElectionsData", {"Senate Groups and Candidate Donations.csv": [
        {"Event": "2025 Federal Election", "Name": "Example, Robin", "Donor Name": "Example Mining Ltd",
         "Gift Value": "250", "Return Type (Candidate/Senate Group)": "Candidate"},
        {"Event": "2025 Federal Election", "Name": "Example Group", "Donor Name": "Example Mining Ltd",
         "Gift Value": "150", "Return Type (Candidate/Senate Group)": "Senate Group"}]}))) as z:
        donations.load_election_candidate_donations(db, donations._read_csv_text(z, "Senate Groups and Candidate Donations.csv"))
    assert [tuple(r) for r in db.execute("SELECT receipt_type,return_type,recipient_kind FROM donations")] == [
        ("Donation Received", "Political Party Return", "political_party"),
        ("Donation Received", "Candidate", "candidate"), ("Donation Received", "Senate Group", "senate_group")]


def test_recipient_measure_never_adds_donor_declarations_and_preserves_equal_gifts(tmp_path):
    path = tmp_path / "db"
    db = database(path)
    donor = {"Financial Year": "2020-2021", "Donor Name": "Example Mining Ltd",
             "Donation Made To": "Example Party", "Value": "100.25"}
    entries = {"Detailed Receipts.csv": [annual(), annual(), annual("Other Receipt", Value="900"),
        annual("", Value="10"), annual("Unspecified", Value="20"), annual("Loan", Value="30")],
        "Donations Made.csv": [donor]}
    donations.process_zip(db, archive("AllAnnualData", entries), "AllAnnualData")
    # Complete archive set, including source rows that cannot belong to this party graph.
    load(db, "AllElectionsData", {"Senate Groups and Candidate Donations.csv": [
        {"Event": "2025 Federal Election", "Name": "Example Party", "Donor Name": "Example Mining Ltd",
         "Gift Value": "999", "Return Type (Candidate/Senate Group)": "Candidate"}]})
    load(db, "AllReferendumData", {})
    db.execute("UPDATE donations SET recipient_canonical='Labor',industry='mining'")
    db.commit()
    graph = export(path)
    edge = graph["edges"][0]
    assert edge["total"] == 1261  # legacy display rounds the 1260.75 all-record total
    assert edge["count"] == 7
    assert edge["by_type"] == {"donation_received": 200.5, "other_receipt": 900, "unknown": 10, "unspecified": 20, "loan": 30}
    assert edge["by_type_year"]["2020-21"]["donation_received"] == [200.5, 2]
    assert sum(edge["by_type"].values()) == 1160.5
    assert graph["meta"]["receipt_types"]["counts"]["exported_rows"] == 6
    assert all(n["by_type"] == edge["by_type"] for n in graph["nodes"])


def test_offline_backfill_reimport_keeps_types_ids_classifications_and_flags(tmp_path):
    path = tmp_path / "db"
    db = database(path)
    donations._insert_donation(db, "Example Mining Ltd", "Example Party", 100.25, "2020-21", "aec_annual")
    db.execute("UPDATE donations SET industry='mining',donation_type='flagged_review',recipient_canonical='Labor'")
    db.commit()
    before = tuple(db.execute("SELECT donation_id,industry,donation_type,amount FROM donations").fetchone())
    for key in receipts.FILES:
        (tmp_path / f"{key}.zip").write_bytes(archive(key, {"Detailed Receipts.csv": [annual()]} if key == "AllAnnualData" else {}))
    for _ in range(2):
        with mock.patch.object(donations, "CACHE_DIR", tmp_path), mock.patch.object(sys, "argv", [
            "donations", "--db", str(path), "--cache-only", "--backfill-types"]), mock.patch.object(donations.SESSION, "get", side_effect=AssertionError("offline")):
            donations.main()
        assert tuple(db.execute("SELECT donation_id,industry,donation_type,amount FROM donations").fetchone()) == before
        assert tuple(db.execute("SELECT receipt_type,return_type,recipient_kind,record_side FROM donations").fetchone()) == (
            "Donation Received", "Political Party Return", "political_party", "recipient_match")
        assert db.execute("SELECT COUNT(*) FROM aec_receipt_records").fetchone()[0] == 1


def test_ambiguous_legacy_type_is_not_guessed(tmp_path):
    db = database(tmp_path / "db")
    donations._insert_donation(db, "Example Mining Ltd", "Example Party", 100.25, "2020-21", "aec_annual")
    load(db, "AllAnnualData", {"Detailed Receipts.csv": [annual(), annual("Other Receipt")]})
    assert receipts.backfill_legacy(db) == {"updated": 0, "ambiguous": 1, "unmatched": 0}
    assert tuple(db.execute("SELECT receipt_type,record_side FROM donations").fetchone()) == (None, "ambiguous")


def test_schema_drift_preserves_snapshot(tmp_path):
    db = database(tmp_path / "db")
    load(db, "AllAnnualData", {"Detailed Receipts.csv": [annual()]})
    before = list(db.execute("SELECT * FROM aec_receipt_records"))
    with zipfile.ZipFile(io.BytesIO(archive("AllAnnualData"))) as original:
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as broken:
            for name in original.namelist():
                text = donations._read_csv_text(original, name)
                broken.writestr(name, text.replace("Receipt Type", "Lost Type") if name == "Detailed Receipts.csv" else text)
    with zipfile.ZipFile(data) as broken, pytest.raises(ValueError, match="missing columns"):
        receipts.load_archive(db, broken, "AllAnnualData", donations._read_csv_text, donations.parse_amount)
    assert list(db.execute("SELECT * FROM aec_receipt_records")) == before


@pytest.mark.parametrize("per_step", [False, True])
def test_paused_registry_prevents_request(tmp_path, monkeypatch, per_step):
    registry = tmp_path / (".cache/autoresearch/pipeline/source-access/aec.json" if per_step else ".cache/autoresearch/pipeline/source-access.json")
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps({"aec": {"host": "transparency.aec.gov.au", "status": "paused"}}))
    monkeypatch.setenv("HOME", str(tmp_path))
    with mock.patch.object(donations.SESSION, "get", side_effect=AssertionError("must not fetch")):
        with pytest.raises(donations.source_http.SourceRefused):
            donations.download_zip(donations.AEC_ZIPS["AllAnnualData"])


def test_removed_raw_row_does_not_leave_a_stale_legacy_type(tmp_path):
    db = database(tmp_path / "db")
    donations._insert_donation(db, "Example Mining Ltd", "Example Party", 100.25, "2020-21", "aec_annual")
    load(db, "AllAnnualData", {"Detailed Receipts.csv": [annual()]})
    receipts.backfill_legacy(db)
    load(db, "AllAnnualData", {})
    receipts.backfill_legacy(db)
    assert tuple(db.execute("SELECT receipt_type,record_side FROM donations").fetchone()) == (None, "unmatched")


@pytest.mark.parametrize("backfill_result", [0, 1])
def test_nightly_export_requires_successful_type_backfill(backfill_result):
    root = Path(__file__).resolve().parents[1]
    weekly = (root / "scripts/weekly_refresh.sh").read_text()
    block = weekly.split("  # nightly.sh calls this periodic path.")[1].split("  for j in qld vic tas;")[0]
    block = "  # nightly.sh calls this periodic path." + block
    result = subprocess.run(["bash"], input=f"""
    PY=python3
    DB=fixture.sqlite
    EXPORT=fixture-export
    run_step() {{ echo "$1"; if [ "$1" = aec_receipt_types ]; then return {backfill_result}; fi; }}
    log() {{ echo "$*"; }}
    {block}
    """, text=True, capture_output=True, check=True)
    lines = result.stdout.splitlines()
    assert lines[0] == "aec_receipt_types"
    assert ("x_money" in lines) == (backfill_result == 0)
    assert "scripts/weekly_refresh.sh" in (root / "scripts/vm/nightly.sh").read_text()


def test_graph_and_uncapped_report_share_per_name_exclusions_for_an_on_map_entity(tmp_path):
    path = tmp_path / "db"
    db = database(path)
    # Invented names, with the six amounts/types that exposed the alias leak.
    name = "Example Trades Council"
    party_spelling = "Example Trades Council T/A Labor Business Forum"
    amounts = [(30207, "Other Receipt"), (620000, "Other Receipt"), (145000, "Other Receipt"),
               (100000, "Donation Received"), (75000, "Donation Received"), (165000, "Other Receipt")]
    entries = [annual(Value="1000000", **{"Received From": name})] + [
        annual(kind, Value=str(amount), **{"Received From": party_spelling}) for amount, kind in amounts]
    donations.process_zip(db, archive("AllAnnualData", {"Detailed Receipts.csv": entries}), "AllAnnualData")
    load(db, "AllElectionsData", {})
    load(db, "AllReferendumData", {})
    db.execute("UPDATE donations SET recipient_canonical='Labor',industry='unions'")
    db.executescript("CREATE TABLE ext_donor_entities(entity_id,canonical_name,kind);"
                     "CREATE TABLE ext_donor_aliases(alias_raw,entity_id,confidence,method);")
    db.execute("INSERT INTO ext_donor_entities VALUES ('example-union',?,'union')", (name,))
    db.executemany("INSERT INTO ext_donor_aliases VALUES (?,'example-union',1,'exact')", [(name,), (party_spelling,)])
    db.commit()
    graph = export(path)
    comparison = report(db, tmp_path, graph)
    assert comparison['industries_full_party_receipts']['unions'] == comparison['industries_visible_graph_receipts']['unions']
    assert graph['edges'][0]['by_type'] == {'donation_received': 1000000}
    assert graph['meta']['receipt_types']['counts']['excluded_government_or_internal'] == 6
    assert comparison['full_party_receipts_exclusions']['government_or_internal'] == 6
    selection = load_selection(db)
    held = [r for r in entries if selection.exclusion(r['Received From'],r['Recipient Name'],float(r['Value']),r['Financial Year'],'political_party')]
    assert len(held) == 6
    assert sum(float(r['Value']) for r in held) == 1135207
    assert sum(float(r['Value']) for r in held if r['Receipt Type']=='Donation Received') == 175000


def test_party_return_counts_each_line_once_without_public_funding_or_branch_transfers(tmp_path):
    from parli.ingest import money_aec_extras
    from scripts import aec_receipt_types
    path = tmp_path / "db"
    db = database(path)
    # Invented party and payers. A gift the donor also declared (Donations Made)
    # must count once; public funding and the party's own branch stay out.
    party, payer = "Example Party", "Example Mining Ltd"
    branch, holdings, other = "Example Party Northern Branch", "Example Party Holdings Pty Ltd", "Other Party Federal Office"
    line = lambda donor, kind, value: annual(kind, Value=str(value), **{"Received From": donor, "Recipient Name": party})
    entries = {"Detailed Receipts.csv": [
        line(payer, "Donation Received", 1000), line("Example Bank Ltd", "Other Receipt", 500),
        line("Australian Electoral Commission", "Public Funding", 7000),  # public funding by name and type
        line("Example Treasury Trust", "Public Funding", 300),  # public funding by type only
        line(branch, "Other Receipt", 2000),  # a transfer within the party
        line(holdings, "Other Receipt", 4000),  # the party's associated entity: counted
        line(other, "Other Receipt", 600),  # another party's office: counted
    ], "Donations Made.csv": [{"Financial Year": "2020-2021", "Donor Name": payer, "Donation Made To": party, "Value": "1000"}]}
    donations.process_zip(db, archive("AllAnnualData", entries), "AllAnnualData")
    load(db, "AllElectionsData", {})
    load(db, "AllReferendumData", {})
    db.execute("UPDATE donations SET recipient_canonical=?,industry='mining'", (party,))
    db.executescript("CREATE TABLE ext_donor_entities(entity_id,canonical_name,kind);"
                     "CREATE TABLE ext_donor_aliases(alias_raw,entity_id,confidence,method);")
    for eid, name in (("example-branch", branch), ("example-holdings", holdings), ("other-office", other)):
        db.execute("INSERT INTO ext_donor_entities VALUES (?,?,'party_unit')", (eid, name))
        db.execute("INSERT INTO ext_donor_aliases VALUES (?,?,1,'exact')", (name, eid))
    db.execute("INSERT INTO associated_entities(entity_name,associated_party,financial_year,source) VALUES (?,?,'2020-21','aec_assoc_entity')",
               (holdings, party))
    db.commit()
    canon = lambda name: party if "example party" in (name or "").lower() else "Other Party" if "other party" in (name or "").lower() else None
    with mock.patch.object(aec_receipt_types, "canon_party", canon), mock.patch.object(money_aec_extras, "canon_party", canon):
        graph = export(path)
    node = next(n for n in graph["nodes"] if n["id"] == "party:" + party)
    assert node["return_by_type"] == {"donation_received": 1000, "other_receipt": 5100}
    assert node["return_by_type_year"] == {"2020-21": {"donation_received": [1000, 1], "other_receipt": [5100, 3]}}
    # The legacy total still holds the donor's own declaration of the same gift.
    assert node["total"] > sum(node["return_by_type"].values())
    meta = graph["meta"]["receipt_types"]
    assert meta["party_return_transfers"] == {party: [2000, 1]}
    assert meta["party_return_counts"]["excluded_public_funding"] == 2
    assert meta["party_return_counts"]["excluded_party_transfer"] == 1
    assert meta["party_return_counts"]["exported_rows"] == 4
    assert "transfers within the party" in meta["party_return_note"]
    assert all("return_by_type" not in n for n in graph["nodes"] if n["kind"] != "party")


def test_party_return_transfer_needs_the_payers_own_returns_in_the_same_node(tmp_path):
    from parli.ingest import money_aec_extras
    from scripts import aec_receipt_types
    path = tmp_path / "db"
    db = database(path)
    # Invented names. "Example Party Rural Wing" files its own return and has no
    # recipient mapping (as Country Labor had): its name reads as Example Party,
    # so its returns join that node and its payment to the party is a transfer.
    # "Sister Party Office" reads as a party with no node: its returns are counted
    # nowhere, so its payment is a receipt. "Example Party (North)" is mapped to
    # Example Party but reads as North Party, which is on the map (as the CLP is).
    party, rural, sister, north = "Example Party", "Example Party Rural Wing", "Sister Party Office", "Example Party (North)"
    line = lambda donor, recipient, kind, value: annual(kind, Value=str(value), **{"Received From": donor, "Recipient Name": recipient})
    entries = {"Detailed Receipts.csv": [
        line("Example Mining Ltd", party, "Donation Received", 1000),
        line(rural, party, "Other Receipt", 2000),  # payer's returns in this node: transfer
        line(sister, party, "Other Receipt", 300),  # payer's returns in no node: counted
        line("Example Farms Ltd", rural, "Donation Received", 50),  # the wing's own receipt joins the party
        line("Example Grocer Ltd", north, "Donation Received", 70),  # counted under North Party
        line("North Party Branch", north, "Other Receipt", 40),  # North Party's own unit: transfer there
        line(rural, north, "Other Receipt", 9),  # another node's unit: counted
        line("Example Mining Ltd", "North Party NT", "Donation Received", 5),
    ], "Donations Made.csv": [{"Financial Year": "2020-2021", "Donor Name": "Example Mining Ltd", "Donation Made To": "Quiet Party", "Value": "80"}]}
    donations.process_zip(db, archive("AllAnnualData", entries), "AllAnnualData")
    load(db, "AllElectionsData", {})
    load(db, "AllReferendumData", {})
    db.execute("UPDATE donations SET industry='mining', recipient_canonical=CASE recipient "
               "WHEN ? THEN ? WHEN ? THEN ? WHEN 'North Party NT' THEN 'North Party' WHEN 'Quiet Party' THEN 'Quiet Party' END",
               (party, party, north, party))
    db.executescript("CREATE TABLE ext_donor_entities(entity_id,canonical_name,kind);"
                     "CREATE TABLE ext_donor_aliases(alias_raw,entity_id,confidence,method);")
    for eid, name in (("rural", rural), ("sister", sister), ("north-branch", "North Party Branch")):
        db.execute("INSERT INTO ext_donor_entities VALUES (?,?,'party_unit')", (eid, name))
        db.execute("INSERT INTO ext_donor_aliases VALUES (?,?,1,'exact')", (name, eid))
    db.commit()

    def canon(name):
        low = (name or "").lower()
        return "North Party" if "north" in low else party if "example party" in low else "Sister Party" if "sister party" in low else None
    with mock.patch.object(aec_receipt_types, "canon_party", canon), mock.patch.object(money_aec_extras, "canon_party", canon):
        graph = export(path)
    nodes = {n["label"]: n for n in graph["nodes"] if n["kind"] == "party"}
    assert nodes[party]["return_by_type"] == {"donation_received": 1050, "other_receipt": 300}
    assert nodes["North Party"]["return_by_type"] == {"donation_received": 75, "other_receipt": 9}
    assert "return_by_type" not in nodes["Quiet Party"], "a node with no counted line keeps its record total"
    assert graph["meta"]["receipt_types"]["party_return_transfers"] == {party: [2000, 1], "North Party": [40, 1]}
    assert "only if the payer's own returns are counted in the same node" in graph["meta"]["receipt_types"]["party_return_note"]
