import importlib.util
import copy
import json
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "publish_grant_venue_notes.py"
SPEC = importlib.util.spec_from_file_location("publish_grant_venue_notes", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

INPUT = Path(__file__).parents[1] / "portal" / "public" / "research" / "grant-locations.json"
IDS = {"mlci-invitation-067", "mlci-invitation-070"}


def candidate_records():
    data = json.loads(INPUT.read_text())
    records = data.get("records", data) if isinstance(data, dict) else data
    selected = [r for r in records if r.get("id") in IDS]
    assert {r["id"] for r in selected} == IDS
    return selected


def test_jabiru_candidate_records_build_two_safe_derived_rows():
    records = candidate_records()
    rows = [MODULE.build_row(record) for record in records]
    assert [r["slug"] for r in rows] == [
        "grant-site-evidence-mlci-invitation-067",
        "grant-site-evidence-mlci-invitation-070",
    ]
    for row, record in zip(rows, records):
        metadata = row["extra"]["metadata"]
        assert metadata["canonical_invitation_id"] == record["id"]
        assert metadata["canonical_award_id"] is None
        assert metadata["counts_as_invitation"] is False
        assert metadata["counts_as_award"] is False
        assert metadata["payment_verified"] is False
        assert metadata["source_record_snapshot_date"] == "2025-11-14"
        assert "not a new award" in row["texts"]["t-body"]["body"]
        assert "surveyed" in row["texts"]["t-body"]["body"]
        assert "Major and Local Community Infrastructure Program (MLCIP)" in row["texts"]["t-body"]["body"]
        assert "Original invitation snapshot: 2025-11-14" in row["texts"]["t-body"]["body"]
        assert record["sites"][0]["electorate_2025"] == "Lingiari"


def test_selection_is_explicit_and_missing_ids_fail():
    records = candidate_records()
    assert [MODULE.build_row(r)["slug"] for r in records if r["id"] == "mlci-invitation-067"] == [
        "grant-site-evidence-mlci-invitation-067"
    ]
    try:
        MODULE.main(["--locations", str(INPUT), "--ids", "mlci-invitation-999"])
    except SystemExit as error:
        assert "absent" in str(error)
    else:
        raise AssertionError("missing IDs must fail closed")

    try:
        MODULE.main(["--locations", str(INPUT), "--write", "--receipt-dir", "/tmp/unused-receipts"])
    except SystemExit as error:
        assert error.code == 2
    else:
        raise AssertionError("--write must require explicit IDs")


def test_unverified_paid_nan_and_out_of_bounds_records_are_rejected():
    record = candidate_records()[0]
    cases = []
    unverified = copy.deepcopy(record)
    unverified["verification"]["status"] = "pending"
    cases.append(unverified)
    paid = copy.deepcopy(record)
    paid["payment_verified"] = True
    cases.append(paid)
    nan_coordinate = copy.deepcopy(record)
    nan_coordinate["sites"][0]["latitude"] = float("nan")
    cases.append(nan_coordinate)
    out_of_bounds = copy.deepcopy(record)
    out_of_bounds["sites"][0]["longitude"] = 200
    cases.append(out_of_bounds)
    for invalid in cases:
        try:
            MODULE.build_row(invalid)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid record must be rejected")
