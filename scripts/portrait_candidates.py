"""The second identity fact required before accepting a portrait candidate.

Name matching generates candidates only. A dated Wikidata P39 term must also
cover the print's speech years in each house it speaks in. Committee-only and
mixed witness prints do not identify a parliamentarian.
"""
from scripts.roster_identity import agrees, weak

HOUSES = {"nsw_la", "nsw_lc", "vic_la", "vic_lc", "qld_la", "sa_ha", "sa_lc", "act_la",
          "representatives", "senate"}


def unique_portrait(candidates):
    """An imageless namesake still makes a print ambiguous."""
    if len(candidates) != 1:
        return None
    qid, candidate = next(iter(candidates.items()))
    return (qid, candidate) if candidate.get("img") else None


def candidate_problem(person, match, terms_by_chamber):
    if person.get("witness_rows"):
        return "print includes committee witnesses"
    houses = set(person.get("chambers") or []) & HOUSES
    if not houses:
        return "committee-only print has no verified house"
    if weak(person["name"]) and len(set(person.get("states") or [])) != 1:
        return "surname or initials print spans parliaments"
    if not agrees(person["name"], match["label"]):
        return "printed name does not agree with the portrait owner"
    if person.get("full") and not agrees(person["full"], match["label"]):
        return "roster full name conflicts with the portrait owner"
    first, last = person.get("first"), person.get("last")
    if not first or not last:
        return "print has no dated speech or roster evidence"
    for chamber in sorted(houses):
        terms = terms_by_chamber.get(chamber, [])
        # Terms can be adjacent, for example a re-election or a changed seat.
        if not all(any(start is not None and start <= year and (end is None or end >= year)
                       for start, end in terms) for year in range(first, last + 1)):
            return f"dated {chamber} service does not cover {first}-{last}"
    return None
