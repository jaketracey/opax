"""OpenAustralia people.csv rows with their APH (Parliamentary Handbook) ids read as text.

people.csv column two is the APH id. Six rows hold an id a spreadsheet turned into a
number before it reached OpenAustralia ('7E4' became '70000'), so the Handbook has no
such id and every join on it misses: Amanda Vanstone's profile link pointed at MPID
70000, and Kathy Sullivan's pay record had no OPAX pid. The source rows themselves are
damaged, so the reviewed corrections in scripts/corrections/oa-people.json put them
right, one row at a time, each checked against the Handbook. A row that no longer holds
the damaged value stops the reader (scripts/corrections/apply.py) until it is reviewed.

Both readers of the file use this: scripts/build_pay.py and scripts/export_profile_links.py.
"""
import csv
import io
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.corrections import apply as corrections  # noqa: E402

DATASET = "oa-people"
# What a spreadsheet makes of '<digit>E4': five digits, a non-zero digit and four zeros.
EXPONENT_DAMAGE = re.compile(r"[1-9]0000")


def rows(csv_text, entries=None):
    """[(OA row number as text, APH id as text, [names])] for every person row, corrected.

    `entries` overrides the reviewed correction file (tests). The OPAX pid is 10000 plus
    the row number (OpenAustralia lib/person.rb)."""
    out = []
    for row in csv.reader(io.StringIO(csv_text)):
        if len(row) < 3 or not row[0].strip().isdigit():
            continue
        names = [n.strip() for n in (row[2], *row[4:]) if n.strip()]
        out.append({"id": row[0].strip(), "aph_id": row[1].strip(), "names": names})
    entries = corrections.load(DATASET) if entries is None else entries
    present = {r["id"] for r in out}
    # A row the file lacks has nothing to correct (a test fixture, a trimmed copy); a row that no
    # longer holds the damaged value still stops here for review.
    corrections.apply(DATASET, out, key="id", entries=[e for e in entries if e["id"] in present])
    return [(r["id"], r["aph_id"], r["names"]) for r in out]


def suspect(aph_id):
    """True for an id with the spreadsheet-exponent shape that no correction has explained."""
    return bool(EXPONENT_DAMAGE.fullmatch(aph_id or ""))
