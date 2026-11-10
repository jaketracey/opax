"""Provisional member ids that a reviewed correction ties to the person's OpenAustralia id.

A senator or member who arrives before OpenAustralia lists them gets a provisional id from their
APH Handbook PHID ('aph_25813'). Once OpenAustralia assigns the person id ('11065') the members
table can hold both rows for one person, and every export keyed on the id splits them: the
electorate release and the interests register filed Vanessa Bleyer under aph_25813 while the
roster has 11065 (members-electorates-012, registers-008). scripts/corrections/member-ids.json
holds the reviewed pairs, each with its source; nothing here guesses one from a name.

Readers: parli/ingest/electorates.py (the federal roster snapshot) and scripts/export_interests.py.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.corrections import apply as corrections  # noqa: E402

DATASET = "member-ids"


def aliases(entries=None):
    """{provisional id: OpenAustralia id} from the reviewed corrections."""
    entries = corrections.load(DATASET) if entries is None else entries
    return {e["id"]: e["to"] for e in entries if e["field"] == "person_id"}


def canonical(person_id, entries=None):
    """The OpenAustralia id for a reviewed provisional id; any other id unchanged."""
    return aliases(entries).get(str(person_id), person_id) if person_id is not None else None


def members(rows, entries=None):
    """members-table rows with reviewed provisional ids re-keyed, and the twin rows this makes merged.

    Two rows merge only when the re-keyed id, name, chamber and electorate all agree; the merged row
    keeps the first non-empty value of each field in input order (so a provisional row's entry date
    survives). Rows the corrections do not name pass through untouched."""
    entries = corrections.load(DATASET) if entries is None else entries
    present = {str(r.get("person_id")) for r in rows}
    rows = [dict(r) for r in rows]
    for r in rows:
        r["person_id"] = str(r.get("person_id"))
    corrections.apply(DATASET, rows, key="person_id", entries=[e for e in entries if e["id"] in present])
    reviewed = set(aliases(entries).values())
    out, seen = [], {}
    for r in rows:
        key = (r["person_id"], r.get("full_name"), r.get("chamber"), r.get("electorate"))
        if r["person_id"] in reviewed and key in seen:
            kept = seen[key]
            for field, value in r.items():
                if kept.get(field) in (None, "") and value not in (None, ""):
                    kept[field] = value
            continue
        seen[key] = r
        out.append(r)
    return out
