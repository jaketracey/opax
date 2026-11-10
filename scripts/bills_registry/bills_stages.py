"""Lifecycle order for the exporter's status and key_dates vocabulary.

Stages repeat in the other chamber. Compare the furthest recorded stage, never
the last array element: a second reading in the other house is forward progress.
Lapsed is a terminal disposition; reopening it requires review. Negatived
(defeated on a vote, bills-003) is terminal too.

A key_dates row flagged `negatived` records a defeated question, so a negatived
third reading is not passage of that house (bills-004).
"""

BILL_STAGE_ORDER = {
    "unknown": -2,
    "exposure_draft": -1,
    "before_house": 0,
    "before_parliament": 0,
    "introduced": 1,
    "first_reading": 1,
    "second_reading": 2,
    "committee": 3,
    "third_reading": 4,
    "passed_one_house": 5,
    "passed_both": 6,
    "passed": 6,
    "royal_assent": 7,
    "assent": 7,
    "assented": 7,
    "rejected": 7,
    "withdrawn": 7,
    "lapsed": 7,
    "negatived": 7,
}


def stage_signature(stage: dict) -> tuple:
    return (stage.get("stage"), stage.get("house"), stage.get("date"))


def lifecycle(doc: dict, negatived: frozenset | set = frozenset()) -> int:
    """Furthest lifecycle rank. `negatived` names extra (stage, house, date)
    signatures to treat as defeated, so the guard can rank a copy published
    before the flag existed the same way as the corrected one."""
    stages = [s for s in doc.get("key_dates", [])
              if not s.get("negatived") and stage_signature(s) not in negatived]
    rank = max([BILL_STAGE_ORDER.get(doc.get("status"), -2)] +
               [BILL_STAGE_ORDER.get(s.get("stage"), -2) for s in stages])
    passed_houses = {s.get("house") for s in stages if s.get("stage") == "third_reading"
                     and s.get("house") in ("representatives", "senate")}
    if passed_houses:
        rank = max(rank, BILL_STAGE_ORDER["passed_both" if len(passed_houses) == 2 else "passed_one_house"])
    return rank
