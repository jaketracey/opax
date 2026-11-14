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


def test_retained_donor_figures_select_recipient_rows_once_without_a_drawing_graph(tmp_path):
    from scripts.export_donor_disclosures import attach_selected_federal_receipts
    db = database(tmp_path / 'db')
    entries = {'Detailed Receipts.csv': [annual(Value='100'), annual(Value='100'),
        annual('Other Receipt', Value='40'), annual('Loan', Value='30'), annual('Public Funding', Value='900')],
        'Donations Made.csv': [{'Financial Year': '2020-2021', 'Donor Name': 'Example Mining Ltd',
                               'Donation Made To': 'Example Party', 'Value': '100'}]}
    donations.process_zip(db, archive('AllAnnualData', entries), 'AllAnnualData')
    load(db, 'AllElectionsData', {})
    load(db, 'AllReferendumData', {})
    db.execute("UPDATE donations SET recipient_canonical='Labor',industry='mining'")
    node = {'label': 'Example Mining Ltd', 'total': 999999, 'count': 99}
    attach_selected_federal_receipts(db, [node])
    assert (node['total'], node['count']) == (270, 4)
    assert node['by_type'] == {'donation_received': 200, 'loan': 30, 'other_receipt': 40}
    assert node['by_type_year']['2020-21']['donation_received'] == [200, 2], 'equal recipient rows stay distinct'
    absent = {'label': 'No Recipient Receipt', 'total': 999, 'count': 1}
    attach_selected_federal_receipts(db, [absent])
    assert absent['by_type'] == {} and 'total' not in absent and 'count' not in absent
    db.execute('DELETE FROM aec_receipt_files')
    with pytest.raises(ValueError, match='Complete cached'):
        attach_selected_federal_receipts(db, [node])


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


def test_receipt_alias_fallback_counts_once_and_reports_ambiguous_rows(tmp_path):
    from scripts.aec_receipt_types import attach_receipt_types
    from scripts.audit_donor_receipt_aliases import audit
    from scripts.reconcile_aec_receipts import audit as reconcile
    db = database(tmp_path / "db")
    db.executescript("CREATE TABLE ext_donor_aliases(alias_raw,entity_id);"
                     "CREATE TABLE ext_donor_entities(entity_id,kind);")
    donations._insert_donation(db, "Alex Hart", "Example Party", 100, "2020-21", "aec_annual")
    db.execute("UPDATE donations SET recipient_canonical='Labor'")
    lines = [("Alex Hart", 100), ("Alex (Morgan) Hart", 20), ("ALEX HART", 30), ("Alex,  Hart.", 40),
             ("Alex (Morgan Hart", 50), ("Jordan (Riley) Vale", 60), ("Jordan Vale", 70),
             ("Jordan (Quinn) Vale", 80), ("JORDAN (QUINN) VALE", 10),
             ("Alex (see note page 18) Hart", 100)]
    load(db, "AllAnnualData", {"Detailed Receipts.csv": [
        annual(Value=str(amount), **{"Received From": name}) for name, amount in lines]})
    load(db, "AllElectionsData", {})
    load(db, "AllReferendumData", {})
    nodes = [{"id": "party:Labor", "kind": "party", "label": "Labor"}] + [
        {"id": id, "kind": "donor", "label": name, "total": 999} for id, name in
        [("alex", "Alex Hart"), ("jordan", "Jordan Vale"), ("other", "Jordan (Quinn) Vale")]]
    graph = {"meta": {}, "nodes": nodes, "edges": [
        {"source": source, "target": "party:Labor", "total": 999} for source in ["alex", "jordan", "other"]]}
    attach_receipt_types(db, graph)
    assert [e["by_type"] for e in graph["edges"]] == [
        {"donation_received": 190}, {"donation_received": 70}, {"donation_received": 90}]
    assert all(e["total"] == 999 for e in graph["edges"])
    assert graph["nodes"][0]["by_type"] == {"donation_received": 350}
    cells = graph["edges"][0]["by_type_year"]["2020-21"]["donation_received"]
    assert cells == [190, 4]
    counts = graph["meta"]["receipt_types"]["counts"]
    assert counts["exported_rows"] == 7
    assert counts["excluded_donor_or_edge_outside_map"] == 2
    assert counts["excluded_flagged_review"] == 1
    matching = graph["meta"]["receipt_types"]["donor_matching"]
    assert matching["by_result"]["ambiguous"] == [1, 60]
    assert matching["by_result"]["unmatched"] == [1, 50]
    assert matching["by_result"]["annotation_review"] == [1, 100]
    assert len(matching["exceptions"]) == 1
    assert matching["exceptions"][0]["candidate_nodes"] == 2
    result = audit(db, graph)
    assert result["counts"]["before_unmatched_node"] == {"rows": 6, "aud": 210}
    assert result["counts"]["after_unmatched_node"] == {"rows": 2, "aud": 110}
    assert result["counts"]["newly_exported"] == {"rows": 4, "aud": 100}
    assert "existing_match_changed" not in result["counts"]
    # Independent CSV/Decimal calculation, with no production matching imports.
    archive_path = tmp_path / "annual.zip"
    archive_path.write_bytes(archive("AllAnnualData", {"Detailed Receipts.csv": [
        annual(Value=str(amount), **{"Received From": name}) for name, amount in lines]}))
    assert reconcile(db, archive_path, graph, report(db, tmp_path, graph))["exported_rows"] == 7
    # The party cap cannot choose between donors or create a missing edge.
    graph["edges"] = graph["edges"][:1]
    attach_receipt_types(db, graph)
    assert graph["meta"]["receipt_types"]["counts"]["exported_rows"] == 4
    assert graph["meta"]["receipt_types"]["donor_matching"]["by_result"]["ambiguous"] == [1, 60]


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


def test_party_return_counts_flagged_gifts_spelling_variant_entities_payroll_and_unions(tmp_path):
    from parli.ingest import money_aec_extras
    from scripts import aec_receipt_types
    path = tmp_path / "db"
    db = database(path)
    party, rival = "Example Party", "Rival Party"
    line = lambda donor, value, kind="Other Receipt", recipient=party: annual(kind, Value=str(value), **{"Received From": donor, "Recipient Name": recipient})
    entries = {"Detailed Receipts.csv": [
        line("Example Minerals Pty Ltd", 5000, "Donation Received"),  # flagged as an outlier elsewhere, a real gift here
        line("Example Party Holdings", 400),  # associated entity, spelt unlike the AEC return
        line("Example Party - NATIONAL", 300),  # the party's own office with a branch label: transfer
        line("ECSA", 70),  # public money by abbreviation
        line("Deputy Commissioner of Taxation", 60),  # a tax refund
        line("Example Commission Agents Pty Ltd", 50),  # a company named Commission: counted
        line("Parliament of NSW", 40),  # payroll levies, a government payer: counted
        line("Parliament of Ruritania", 30),  # a foreign parliament: still government money
        line("Example Shire Employees Union", 20),  # a union the resolver calls government: counted
        line("Example Retail Ltd", 10, "Donation Received", rival),
    ]}
    donations.process_zip(db, archive("AllAnnualData", entries), "AllAnnualData")
    load(db, "AllElectionsData", {})
    load(db, "AllReferendumData", {})
    db.execute("UPDATE donations SET industry='mining', recipient_canonical=CASE recipient WHEN ? THEN ? ELSE ? END", (rival, rival, party))
    db.execute("UPDATE donations SET donation_type='flagged_review' WHERE donor_name='Example Minerals Pty Ltd'")
    db.executescript("CREATE TABLE ext_donor_entities(entity_id,canonical_name,kind);"
                     "CREATE TABLE ext_donor_aliases(alias_raw,entity_id,confidence,method);"
                     "CREATE TABLE IF NOT EXISTS ext_aec_returns(entity_name,source_file);")
    for eid, name, kind in (("holdings", "Example Party Holdings", "party_unit"), ("office", "Example Party - NATIONAL", "party_unit"),
                            ("nsw", "Parliament of NSW", "government"), ("ruritania", "Parliament of Ruritania", "government"),
                            ("shire-union", "Example Shire Employees Union", "government")):
        db.execute("INSERT INTO ext_donor_entities VALUES (?,?,?)", (eid, name, kind))
        db.execute("INSERT INTO ext_donor_aliases VALUES (?,?,1,'exact')", (name, eid))
    db.execute("INSERT INTO ext_aec_returns VALUES ('Example Party Holding Pty. Limited as Trustee for the Example Party Trust',"
               "'Associated Entity Returns.csv')")
    db.commit()

    def canon(name):  # reads the branch label as another party, as canon_party read " - NATIONAL"
        name = name or ""
        return rival if name.endswith("- NATIONAL") or "rival" in name.lower() else party if "example party" in name.lower() else None
    with mock.patch.object(aec_receipt_types, "canon_party", canon), mock.patch.object(money_aec_extras, "canon_party", canon):
        graph = export(path)
    node = next(n for n in graph["nodes"] if n["id"] == "party:" + party)
    assert node["return_by_type"] == {"donation_received": 5000, "other_receipt": 400 + 50 + 40 + 20}
    assert graph["meta"]["receipt_types"]["party_return_transfers"] == {party: [300, 1]}
    assert graph["meta"]["receipt_types"]["party_return_counts"]["excluded_public_funding"] == 3
    assert "Payments made through parliament and council payrolls are counted as receipts" in graph["meta"]["receipt_types"]["party_return_note"]
    # The shared outlier flag still holds for the capped map cells.
    assert graph["meta"]["receipt_types"]["counts"]["excluded_flagged_review"] == 1


def test_party_return_public_money_matches_whole_words():
    from scripts.aec_receipt_types import party_return_public
    for name in ("ECSA", "EFA", "ACT Election Commission", "Australian Electoral Commisssion", "Deputy Commissioner of Taxation",
                 "Australian Government Solicitor", "DCIS Northern Territory Government", "Special Minister of State"):
        assert party_return_public(name, None, "Other Receipt"), name
    for name in ("Example Commission Agents Pty Ltd", "Efacon Pty Ltd", "Ecsaw Holdings", "Commonwealth Example Bank",
                 "Legislative Assembly of Queensland", "Brisbane City Council", "Example Workers Union"):
        assert not party_return_public(name, None, "Other Receipt"), name
    assert party_return_public("Example Workers Union", "union", "Public Funding"), "the receipt type still decides"


def test_without_ext_aec_returns_the_pinned_names_still_count_an_associated_entity(tmp_path, capsys):
    from parli.ingest import money_aec_extras
    from scripts import aec_receipt_types
    path = tmp_path / "db"
    db = database(path)
    party, holdings = "Example Party", "Example Party Holdings"  # spelt unlike the AEC return
    entries = {"Detailed Receipts.csv": [
        annual("Other Receipt", Value="400", **{"Received From": holdings, "Recipient Name": party}),
        annual("Donation Received", Value="100", **{"Received From": "Example Retail Ltd", "Recipient Name": party})]}
    donations.process_zip(db, archive("AllAnnualData", entries), "AllAnnualData")
    load(db, "AllElectionsData", {})
    load(db, "AllReferendumData", {})
    db.execute("UPDATE donations SET industry='retail', recipient_canonical=?", (party,))
    db.executescript("CREATE TABLE ext_donor_entities(entity_id,canonical_name,kind);"
                     "CREATE TABLE ext_donor_aliases(alias_raw,entity_id,confidence,method);"
                     "DROP TABLE IF EXISTS ext_aec_returns;")
    db.execute("INSERT INTO ext_donor_entities VALUES ('holdings',?,'party_unit')", (holdings,))
    db.execute("INSERT INTO ext_donor_aliases VALUES (?,'holdings',1,'exact')", (holdings,))
    db.commit()
    canon = lambda name: party if "example party" in (name or "").lower() else None
    pinned = lambda: ["Example Party Holding Pty. Limited as Trustee for the Example Party Trust"]
    with mock.patch.object(aec_receipt_types, "canon_party", canon), mock.patch.object(money_aec_extras, "canon_party", canon), \
            mock.patch.object(aec_receipt_types, "pinned_associated_names", pinned):
        graph = export(path)
    node = next(n for n in graph["nodes"] if n["id"] == "party:" + party)
    assert node["return_by_type"] == {"donation_received": 100, "other_receipt": 400}
    meta = graph["meta"]["receipt_types"]
    assert meta["party_return_transfers"] == {}
    assert meta["party_return_associated_names"] == "pinned"
    assert "aec_associated_entity_names.json" in meta["party_return_note"]
    assert "WARNING no ext_aec_returns table" in capsys.readouterr().err


def test_the_pinned_associated_names_are_the_party_owned_entities_that_decide_a_line():
    from scripts.aec_receipt_types import entity_keys, pinned_associated_names
    names = pinned_associated_names()
    assert len(names) == len(set(names)) and names == sorted(names)
    shorts = {entity_keys(n)[1] for n in names}
    for payer in ("Labor Resources Pty Ltd", "ALP Holdings", "Labor Services & Holdings Trust", "Labor Campaign Investment Pty Ltd",
                  "National Free Enterprise Foundation", "Pilliwinks as trustee for the National Party Foundation Trust"):
        assert entity_keys(payer)[1] in shorts, payer


def test_aec_extras_selects_the_liberal_democrats_and_the_libertarian_party_under_the_name_lodged():
    from parli.ingest import money_aec_extras as extras
    from scripts import export_state_money as state
    lodged = {
        "Liberal Democratic Party": "Liberal Democratic Party",
        "Liberal Democratic Party (NSW Branch)": "Liberal Democratic Party",
        "LIBERAL DEMOCRATIC PARTY LDP": "Liberal Democratic Party",
        "Liberal Democrats": "Liberal Democratic Party",
        "Libertarian Party": "Libertarian Party",
        "Libertarian Party of Queensland": "Libertarian Party",
        "Libertarian (formerly Liberal Democrats)": "Libertarian Party",
        # Not this party: the Liberal Party's own SA return, and the DLP stays held out.
        "Liberal Party of Australia (SA Division) (LDP-SA)": "Liberal",
        "Democratic Labour Party": None,
        "LDP Administration Limited": None,
    }
    for name, canon in lodged.items():
        assert extras.canon_party(name) == canon, name
    # One money-map node under the current name, answering to the former names.
    assert extras.current_party("Liberal Democratic Party") == "Libertarian Party"
    assert extras.current_party("Labor") == "Labor"
    assert extras.PARTY_FORMER_NAMES == {"Libertarian Party": ["Liberal Democratic Party", "Liberal Democrats"]}
    # export_state_money is streamed alone, so it keeps a copy: the copy must agree.
    assert [(rx.pattern, c) for rx, c in state.OWN_PARTIES] == [(rx.pattern, c) for rx, c in extras._OWN_PARTIES]
    assert state.PARTY_RENAMED == extras.PARTY_RENAMED and state.PARTY_FORMER_NAMES == extras.PARTY_FORMER_NAMES
    for name in ("Liberal Democrats", "Libertarian Party of Queensland"):
        assert state.own_party(name) == "Libertarian Party"
    assert state.own_party("Liberal Party of Australia") is None


def renamed_party_fixture(tmp_path):
    """An invented party under two names: 'Fixture Liberty Party' renamed 'Fixture Freedom Party'.
    The donations table leaves both unbucketed (recipient_canonical NULL), as it does the LDP."""
    path = tmp_path / "db"
    db = database(path)
    old, new, branch = "Fixture Liberty Party", "Fixture Freedom Party", "Fixture Liberty Party (North Branch)"
    line = lambda donor, recipient, kind, value, fy: annual(kind, Value=str(value), **{
        "Received From": donor, "Recipient Name": recipient, "Financial Year": fy})
    entries = {"Detailed Receipts.csv": [
        line("Example Mining Ltd", old, "Donation Received", 1000, "2020-2021"),
        line("Example Farms Ltd", branch, "Donation Received", 50, "2020-2021"),
        line("Australian Electoral Commission", old, "Public Funding", 700, "2020-2021"),
        line("Example Mining Ltd", new, "Donation Received", 300, "2023-2024"),
        line(branch, new, "Other Receipt", 200, "2023-2024"),  # its own branch: a transfer
        line("Example Mining Ltd", "Example Party", "Donation Received", 5000, "2020-2021"),
    ], "Donations Made.csv": [
        # The donor's own declaration of the 2020-21 gift: in the legacy total, never in the return cells.
        {"Financial Year": "2020-2021", "Donor Name": "Example Mining Ltd", "Donation Made To": old, "Value": "1000"}]}
    donations.process_zip(db, archive("AllAnnualData", entries), "AllAnnualData")
    load(db, "AllElectionsData", {})
    load(db, "AllReferendumData", {})
    db.execute("UPDATE donations SET industry='mining', recipient_canonical=CASE recipient WHEN 'Example Party' THEN 'Example Party' END")
    db.executescript("CREATE TABLE ext_donor_entities(entity_id,canonical_name,kind);"
                     "CREATE TABLE ext_donor_aliases(alias_raw,entity_id,confidence,method);")
    db.execute("INSERT INTO ext_donor_entities VALUES ('fixture-north',?,'party_unit')", (branch,))
    db.execute("INSERT INTO ext_donor_aliases VALUES (?,'fixture-north',1,'exact')", (branch,))
    db.commit()
    return path, old, new


@contextlib.contextmanager
def renamed_party_rules(on=True):
    import re
    from parli.ingest import money_aec_extras
    from scripts import aec_receipt_types
    own = [(re.compile(r"\bfixture freedom\b", re.I), "Fixture Freedom Party"),
           (re.compile(r"\bfixture liberty\b", re.I), "Fixture Liberty Party")] if on else []
    former = {"Fixture Freedom Party": ["Fixture Liberty Party", "Fixture Liberty"]}
    with mock.patch.object(money_aec_extras, "_OWN_PARTIES", own), \
            mock.patch.object(money_aec_extras, "PARTY_RENAMED", {"Fixture Liberty Party": "Fixture Freedom Party"}), \
            mock.patch.object(money_aec_extras, "PARTY_FORMER_NAMES", former), \
            mock.patch.object(exporter, "PARTY_FORMER_NAMES", former), \
            mock.patch.object(aec_receipt_types, "PARTY_FORMER_NAMES", former):
        yield


def test_a_renamed_party_is_one_node_with_its_former_name_as_an_alias_and_each_receipt_once(tmp_path):
    path, old, new = renamed_party_fixture(tmp_path)
    with renamed_party_rules():
        graph = export(path)
    parties = {n["id"]: n for n in graph["nodes"] if n["kind"] == "party"}
    assert "party:" + old not in parties, "no node under the former name"
    node = parties["party:" + new]
    assert node["label"] == new
    assert node["aliases"] == ["Fixture Liberty Party", "Fixture Liberty"]
    # Each receipt once, from the party's own returns under both names: the donor's declaration of the
    # same 2020-21 gift, public funding and the branch's transfer are not added.
    assert node["return_by_type"] == {"donation_received": 1350}
    assert node["return_by_type_year"] == {"2020-21": {"donation_received": [1050, 2]},
                                           "2023-24": {"donation_received": [300, 1]}}
    assert node["return_by_name"] == {old: [1050, 2, "2020-21", "2020-21"], new: [300, 1, "2023-24", "2023-24"]}
    meta = graph["meta"]
    assert meta["receipt_types"]["party_return_transfers"][new] == [200, 1]
    assert "return_by_name" in meta["receipt_types"]["party_return_note"]
    assert node["total"] > sum(node["return_by_type"].values())
    # Its donors count it like any other party's: one flow, typed from the party's own returns, each receipt
    # once (the 2020-21 gift the donor also declared is not added twice in the typed cells).
    flows = {e["source"]: e for e in graph["edges"] if e["target"] == "party:" + new}
    assert sorted(flows) == ["donor:example farms", "donor:example mining"]
    assert flows["donor:example mining"]["by_type"] == {"donation_received": 1300}
    assert flows["donor:example mining"]["by_type_year"] == {"2020-21": {"donation_received": [1000, 1]}, "2023-24": {"donation_received": [300, 1]}}
    assert flows["donor:example farms"]["by_type"] == {"donation_received": 50}, "a gift to a former-name branch joins the one node"
    # A donor whose only rows are to the party still gets its spelling and its return references.
    farms = next(n for n in graph["nodes"] if n["id"] == "donor:example farms")
    assert farms["source_name"] == "Example Farms Ltd"
    assert [(r["return_type"], r["year"]) for r in farms["returnReferences"]] == [("AEC annual return", "2020-2021")]
    assert all("aliases" not in n and "return_by_name" not in n for n in parties.values() if n["id"] != "party:" + new)


def test_selecting_the_renamed_party_moves_only_its_node_its_donors_and_their_flows_to_it(tmp_path):
    path, _, new = renamed_party_fixture(tmp_path)
    with renamed_party_rules(on=False):
        before = export(path)
    with renamed_party_rules():
        after = export(path)
    added = {n["id"] for n in after["nodes"]} - {n["id"] for n in before["nodes"]}
    # The party, and a donor that gave only to it (on this uncapped fixture map every donor is drawn).
    assert added == {"party:" + new, "donor:example farms"}
    assert {n["id"] for n in before["nodes"]} <= {n["id"] for n in after["nodes"]}, "no donor leaves the map"
    old_edges = {(e["source"], e["target"]): e for e in before["edges"]}
    new_edges = {(e["source"], e["target"]): e for e in after["edges"]}
    assert set(new_edges) - set(old_edges) == {("donor:example mining", "party:" + new), ("donor:example farms", "party:" + new)}
    assert all(new_edges[k] == v for k, v in old_edges.items()), "every existing flow is unchanged"
    before_nodes = {n["id"]: n for n in before["nodes"]}
    moved = [n["id"] for n in after["nodes"] if n["id"] not in added and n != before_nodes[n["id"]]]
    assert moved == ["donor:example mining"], "only the party's donor moves"
    donor_before, donor_after = before_nodes["donor:example mining"], next(n for n in after["nodes"] if n["id"] == "donor:example mining")
    flow = new_edges[("donor:example mining", "party:" + new)]
    # The donor gains exactly its flow to the party: legacy record cells and typed cells alike.
    assert donor_after["total"] - donor_before["total"] == flow["total"]
    assert donor_after["count"] - donor_before["count"] == flow["count"]
    assert sum(donor_after["by_type"].values()) - sum(donor_before["by_type"].values()) == sum(flow["by_type"].values()) == 1300


def test_independent_csv_reconciliation_counts_a_renamed_partys_unbucketed_receipts(tmp_path):
    import re
    from scripts import reconcile_aec_receipts as verifier
    path, _, new = renamed_party_fixture(tmp_path)
    db = sqlite3.connect(path)
    rows = [annual(kind, Value=str(amount), **{"Received From": donor, "Recipient Name": recipient,
            "Financial Year": year}) for donor, recipient, amount, year, kind in db.execute(
                "SELECT donor_name,recipient,amount,financial_year,receipt_type FROM aec_receipt_records "
                "WHERE source_file='Detailed Receipts.csv'")]
    raw = tmp_path / "annual.zip"
    raw.write_bytes(archive("AllAnnualData", {"Detailed Receipts.csv": rows}))
    with renamed_party_rules(), mock.patch.object(verifier, "OWN_PARTIES", [
            (re.compile(r"\bfixture (?:liberty|freedom)\b", re.I), new)]):
        graph = export(path)
        result = verifier.audit(db, raw, graph, report(db, tmp_path, graph))
    assert result["exported_rows"] == 4


def test_public_funding_is_excluded_by_receipt_type_whatever_the_payer_is_called():
    """A34/A35: Public Funding is never a donor, also under a spelling no name rule knows ("NSW Efa")."""
    from scripts.aec_receipt_selection import ReceiptSelection
    from scripts.export_interests import receipt_figures
    selection = ReceiptSelection(aliases={}, exact={}, entity_kinds={}, recipient_party={"Example Party": "Example"}, flagged=set())
    args = ("Zed Funding Body", "Example Party", 50000.0, "2010-11", "political_party")
    # The name matches no public-funding or party pattern, so only the type can exclude it.
    assert selection.exclusion(*args) is None
    assert selection.exclusion(*args, receipt_type="Donation Received") is None
    assert selection.exclusion(*args, receipt_type="Other Receipt") is None
    assert selection.exclusion(*args, receipt_type="Public Funding") == "public_funding"
    # The exporter's copy of the portal rule: a published Public Funding cell counts in no figure.
    flow = {"by_type": {"donation_received": 100.0, "public_funding": 50000.0},
            "by_type_year": {"2010-11": {"public_funding": [50000.0, 1]}, "2011-12": {"donation_received": [100.0, 1]}}}
    assert receipt_figures(flow) == {"total": 100.0, "count": 1, "firstYear": 2011, "lastYear": 2011, "typed": True}
    only = {"by_type": {"public_funding": 50000.0}, "by_type_year": {"2010-11": {"public_funding": [50000.0, 1]}}}
    assert receipt_figures(only) == {"total": 0, "count": 0, "firstYear": None, "lastYear": None, "typed": True}


def test_a_reexported_public_funding_payer_keeps_its_typed_cell_and_its_label(tmp_path):
    """A35 review P2: the next export must not leave a Public Funding-only payer with an empty
    by_type and its old total, which turned the portal's label back into "declared on its own
    donor return". The cell stays typed public_funding; no figure counts it."""
    from scripts.export_interests import receipt_figures
    path = tmp_path / "db"
    db = database(path)
    entries = [annual(Value="5000"),
               annual("Public Funding", Value="900000", **{"Received From": "Zed Funding Body", "Financial Year": "2010-2011"})]
    donations.process_zip(db, archive("AllAnnualData", {"Detailed Receipts.csv": entries}), "AllAnnualData")
    load(db, "AllElectionsData", {})
    load(db, "AllReferendumData", {})
    db.execute("UPDATE donations SET recipient_canonical='Labor',industry='finance'")
    db.commit()
    graph = export(path)
    edge = next(e for e in graph["edges"] if e["source"] == "donor:zed funding body")
    node = next(n for n in graph["nodes"] if n["id"] == "donor:zed funding body")
    assert edge["by_type"] == {"public_funding": 900000} and node["by_type"] == {"public_funding": 900000}
    assert edge["by_type_year"] == {"2010-11": {"public_funding": [900000, 1]}}
    assert receipt_figures(edge)["total"] == 0
    # The uncapped report still counts it nowhere.
    assert report(db, tmp_path, graph)["full_party_receipts_exclusions"].get("public_funding") == 1
    # The portal's own rule, on the re-exported records.
    root = Path(__file__).resolve().parents[1] / "portal" / "public" / "donor-disclosure.js"
    script = ("const m=await import(process.argv[1]);const [e,n]=JSON.parse(process.argv[2]);"
              "console.log(JSON.stringify([m.publicFundingOnly(e),m.hasPartyReceipts(e),m.notListedLine(n)===m.PUBLIC_FUNDING_ONLY,"
              "m.receiptGraph({meta:{},nodes:[n,{id:e.target,kind:'party',label:'Labor'}],edges:[e]}).edges.length]))")
    out = subprocess.run(["node", "--input-type=module", "-e", script, root.as_uri(), json.dumps([edge, node])],
                         capture_output=True, text=True, check=True)
    assert json.loads(out.stdout) == [True, False, True, 0]


def test_uncapped_money_export_is_independent_of_drawing_cap_and_keeps_receipt_rules(tmp_path):
    from scripts.export_money_receipts import export_receipts
    path = tmp_path / 'db'
    db = database(path)
    entries = {'Detailed Receipts.csv': [
        annual(Value='1000', **{'Received From': 'Example Major Energy Ltd'}),
        annual(Value='150', **{'Received From': 'Example Small Energy Ltd'}),
        annual('Other Receipt', Value='900', **{'Received From': 'Example Small Energy Ltd'}),
        annual('Loan', Value='800', **{'Received From': 'Example Small Energy Ltd'}),
        annual('Public Funding', Value='700', **{'Received From': 'Example Opaque Payer'}),
        annual(Value='600', **{'Received From': 'Electoral Commission Example'}),
        annual(Value='500', **{'Received From': 'Labor Branch Example'}),
    ], 'Donations Made.csv': [{'Financial Year': '2020-2021', 'Donor Name': 'Example Small Energy Ltd',
                              'Donation Made To': 'Example Party', 'Value': '150'}]}
    donations.process_zip(db, archive('AllAnnualData', entries), 'AllAnnualData')
    load(db, 'AllElectionsData', {})
    load(db, 'AllReferendumData', {})
    db.execute("UPDATE donations SET recipient_canonical='Labor',industry='fossil_fuels'")
    db.commit()
    with mock.patch.object(exporter, 'TOP_DONORS', 1):
        capped = export(path)
    for node in capped['nodes']:
        if node['kind'] == 'donor':
            node['group'] = 'retail'  # drawing cluster disagrees with canonical fossil_fuels
    full, summary = export_receipts(db, capped)
    no_donors = {**capped, 'nodes': [n for n in capped['nodes'] if n['kind'] == 'party'], 'edges': []}
    _, with_no_map_edges = export_receipts(db, no_donors)
    assert summary == with_no_map_edges
    assert summary['industries']['fossil_fuels'] == {'Labor': 1150}
    small = next(n for n in full['nodes'] if n['label'] == 'Example Small Energy Ltd')
    assert small['by_type'] == {'donation_received': 150, 'loan': 800, 'other_receipt': 900}
    assert small['by_type_year']['2020-21']['donation_received'] == [150, 1]
    assert full['meta']['uncapped'] is True
    assert all('group' not in n for n in full['nodes'] if n['kind'] == 'donor')
    assert all(n['group'] == 'retail' for n in capped['nodes'] if n['kind'] == 'donor'), 'drawing metadata stays untouched'
    assert not any(n['label'] in ('Example Opaque Payer', 'Electoral Commission Example', 'Labor Branch Example')
                   and n.get('by_type', {}).get('donation_received') for n in full['nodes'])


def test_uncapped_bracket_fold_preserves_each_receipt_and_does_not_depend_on_map_membership(tmp_path):
    from scripts.export_money_receipts import export_receipts
    path = tmp_path / 'db'
    db = database(path)
    entries = {'Detailed Receipts.csv': [annual(Value='100', **{'Received From': 'Example Person'}),
        annual('Other Receipt', Value='10', **{'Received From': 'Example Person'}),
        annual(Value='65', **{'Received From': 'Example (Middle) Person'})]}
    donations.process_zip(db, archive('AllAnnualData', entries), 'AllAnnualData')
    load(db, 'AllElectionsData', {})
    load(db, 'AllReferendumData', {})
    db.execute("UPDATE donations SET recipient_canonical='Labor',industry='individual'")
    db.execute('CREATE TABLE ext_donor_entities(entity_id,canonical_name,kind)')
    db.execute('CREATE TABLE ext_donor_aliases(alias_raw,entity_id,confidence,method)')
    for eid, label in [('base', 'Example Person'), ('bracket', 'Example (Middle) Person')]:
        db.execute('INSERT INTO ext_donor_entities VALUES (?,?,?)', (eid, label, 'individual'))
        db.execute('INSERT INTO ext_donor_aliases VALUES (?,?,?,?)', (label, eid, 1, 'fixture'))
    db.commit()
    with mock.patch.object(exporter, 'TOP_DONORS', 1):
        capped = export(path)
    no_donors = {**capped, 'nodes': [n for n in capped['nodes'] if n['kind'] == 'party'], 'edges': []}
    snapshots = []
    for graph in [capped, no_donors]:
        full, summary = export_receipts(db, graph)
        counted = [n for n in full['nodes'] if n['kind'] == 'donor' and n.get('count')]
        assert len(counted) == 1
        [node] = counted
        assert node['label'] == 'Example Person'
        assert (node['total'], node['count']) == (175, 3)
        assert node['by_type'] == {'donation_received': 165, 'other_receipt': 10}
        assert 'Example (Middle) Person' in node['aliases']
        assert summary['industries']['individual'] == {'Labor': 165}
        assert full['meta']['bracket_aliases']['counts']['folded'] == 1
        assert 'Example' not in json.dumps(full['meta']['bracket_aliases'])
        snapshots.append((full['edges'], summary))
    assert snapshots[0] == snapshots[1]


def test_retained_donor_export_uses_uncapped_selection_and_keeps_receipt_types(tmp_path):
    from scripts.export_donor_disclosures import disclosure_catalog
    path = tmp_path / 'db'
    db = database(path)
    rows = {'Detailed Receipts.csv': [annual(Value='150'), annual('Other Receipt', Value='900'),
                                     annual('Loan', Value='800'), annual('Public Funding', Value='700')],
            'Donations Made.csv': [{'Financial Year': '2020-2021', 'Donor Name': 'Example Mining Ltd',
                                   'Donation Made To': 'Example Party', 'Value': '150'}]}
    donations.process_zip(db, archive('AllAnnualData', rows), 'AllAnnualData')
    load(db, 'AllElectionsData', {})
    load(db, 'AllReferendumData', {})
    db.execute("UPDATE donations SET recipient_canonical='Labor',industry='mining'")
    db.commit()
    candidate = {'id': 'donor:example', 'label': 'Example Mining Ltd', 'kind': 'donor', 'aliases': [], 'references': []}
    db.execute('CREATE TABLE ext_donations(donor_name,amount,financial_year,source,source_record_id,source_url,disclosure_type,jurisdiction,recipient_party)')
    [retained] = disclosure_catalog(db, [candidate])['donors']
    assert (retained['total'], retained['count']) == (1850, 3)
    assert retained['by_type'] == {'donation_received': 150, 'other_receipt': 900, 'loan': 800}
    assert retained['by_type_year']['2020-21']['donation_received'] == [150, 1]


@pytest.mark.parametrize('name,qualifier,base_value,base_count,qualified_value,qualified_count,kind', [
    ('Alex Hart', 'Donation Returned', 5000, 1, 20000, 1, 'Donation Received'),
    ('Jordan Vale', 'Loan', 55000, 7, 23750, 8, 'Other Receipt'),
])
def test_uncapped_qualified_transactions_keep_their_own_identity(
        tmp_path, name, qualifier, base_value, base_count, qualified_value, qualified_count, kind):
    """Invented identities reproduce both reviewed live amounts, without private names."""
    from scripts.export_money_receipts import export_receipts
    path = tmp_path / 'db'
    db = database(path)
    qualified = f'{name} ({qualifier})'
    rows = [annual(Value=str(base_value), **{'Received From': name}) for _ in range(base_count)]
    rows += [annual(kind, Value=str(qualified_value), **{'Received From': qualified})
             for _ in range(qualified_count)]
    donations.process_zip(db, archive('AllAnnualData', {'Detailed Receipts.csv': rows}), 'AllAnnualData')
    load(db, 'AllElectionsData', {})
    load(db, 'AllReferendumData', {})
    db.execute("UPDATE donations SET recipient_canonical='Labor',industry='individual'")
    db.commit()
    graph = export(path)
    without_map = {**graph, 'nodes': [n for n in graph['nodes'] if n['kind'] == 'party'], 'edges': []}
    for drawing in [graph, without_map]:
        full, summary = export_receipts(db, drawing)
        by_name = {n['label']: n for n in full['nodes']}
        assert (by_name[name]['total'], by_name[name]['count']) == (base_value * base_count, base_count)
        assert qualified not in by_name[name]['aliases']
        assert (by_name[qualified]['total'], by_name[qualified]['count']) == (qualified_value * qualified_count, qualified_count)
        assert by_name[qualified]['by_type'] == {
            'donation_received' if kind == 'Donation Received' else 'other_receipt': qualified_value * qualified_count}
        assert full['meta']['bracket_aliases']['counts']['transaction_qualifier'] == 1
        if qualifier == 'Donation Returned':
            assert summary['industries']['individual'] == {'Labor': 5000}
            assert by_name[qualified]['donation_exclusions']['by_type'] == {'donation_received': 20000}
        else:
            assert 'donation_exclusions' not in by_name[qualified]
