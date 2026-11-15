"""The party a sitting federal member or senator sits for now, changed on dated public sources.

A member who leaves or joins a party between exports has the old `party_now` in the shipped roster, and the box's
members table has it too until someone corrects it there. Most sitting members are folded people (their surname
print merged into them, scripts/roster_fold.py), and the accept list pins every identity field of a folded person,
`party_now` included (scripts/roster_accept.py, FOLD_FIELDS), so no ordinary identity group can carry the change.

This is the one rule that may: an accept-list group under evidence with `"rule": "sitting-party"` writes `party_now`,
for a person the evidence names, and only when all of this holds (group_problem):

  - the group's field is `party_now`, moving from the party the evidence gives to the party it gives;
  - where the evidence says the person `keeps` the old label (a Queensland LNP member's party room: the label
    stays true of them, it is just not the party they were elected for), the group also writes `parties`, and
    only by adding that one label to the list the row has (or to its `party`, when it has no list). Nothing is
    removed from the list, so the party's page still lists the person, as it does the other LNP members;
  - the shipped row is current, federal, and carries the OpenAustralia id the evidence gives for that name;
  - the evidence cites at least two sources for the change, each with an http(s) address and the date it was
    published or last updated (the day it was read, for a page that carries no date, said so in `says`), from at
    least two different sites; none of them is www.aph.gov.au or ParlInfo
    (the standing source rule, docs/SOURCES-ACCESS.md);
  - the new party is the name the sources use, written out: not an office (SPK, PRES), not empty.

It lifts the folded-person pin for those fields only. Every other protection still holds the group: a pinned
witness split, a party pinned or corrected in scripts/roster_service.json, a dated party (`affiliations`), a
reviewed alias. `party` and `recorded_parties` are the record of what the speeches carry and are never written
here, so the page leads with the new party and still says what the person was recorded as before.

    "evidence": {"sitting-party-2026-11-16": {"kind": "identity", "rule": "sitting-party", "checked": "2026-11-16",
        "url": "docs/roster-reverify-2026-11-16.md", "reason": "...",
        "people": {"Zali Steggall": {"pid": "10941", "from": "Independent", "to": "Community Strong Australia",
            "sources": [{"url": "https://...", "date": "2026-06-25", "says": "..."}, ...]}}}}
    "records": {"Zali Steggall": [{"evidence": "sitting-party-2026-11-16",
        "fields": {"party_now": ["Independent", "Community Strong Australia"]}}]}
"""
import re
from urllib.parse import urlsplit

RULE = "sitting-party"
FIELDS = {"party_now"}
KEPT_FIELDS = {"party_now", "parties"}
BARRED_HOSTS = ("aph.gov.au",)
OFFICES = {"SPK", "PRES", "DPRES", "CWM"}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _host(url):
    host = (urlsplit(url).hostname or "").lower()
    return host.removeprefix("www.")


def source_problem(sources):
    """None when `sources` are at least two dated public sources on two sites, else why not."""
    if not isinstance(sources, list) or len(sources) < 2:
        return "a change of party needs at least two sources"
    hosts = set()
    for s in sources:
        if not (isinstance(s, dict) and _text(s.get("url")) and _text(s.get("says"))
                and isinstance(s.get("date"), str) and DATE.match(s["date"])):
            return "each source needs a url, a date (YYYY-MM-DD) and what it says"
        parts = urlsplit(s["url"])
        host = _host(s["url"])
        if parts.scheme not in ("http", "https") or not host:
            return "each source needs an http(s) address"
        if any(host == barred or host.endswith("." + barred) for barred in BARRED_HOSTS):
            return "a source is on aph.gov.au, which the source rule bars"
        hosts.add(host)
    if len(hosts) < 2:
        return "the sources are all on one site"
    return None


def group_problem(name, group, row, evidence):
    """None when `group` may write `party_now` on the shipped `row` under `evidence` (an entry with RULE)."""
    fields = group.get("fields") or {}
    people = evidence.get("people")
    person = people.get(name) if isinstance(people, dict) else None
    if not isinstance(person, dict):
        return "the evidence does not name this person"
    keeps = person.get("keeps")
    if set(fields) != (KEPT_FIELDS if keeps is not None else FIELDS):
        return ("a sitting-party group that keeps the old label writes party_now and parties, and nothing else"
                if keeps is not None else "a sitting-party group writes party_now and nothing else")
    old, new = fields["party_now"]
    if not (_text(person.get("from")) and _text(person.get("to")) and _text(person.get("pid"))):
        return "the evidence needs the person's pid and the party before and after"
    if (old, new) != (person["from"], person["to"]) or old == new:
        return "the group's parties are not the evidence's"
    if new.strip() != new or new in OFFICES:
        return "the new party is not a party name"
    why = source_problem(person.get("sources"))
    if why:
        return why
    if keeps is not None:
        had, has = fields["parties"]
        if keeps != old:
            return "the label kept is not the party being replaced"
        if had is not None and not (isinstance(had, list) and had and keeps not in had):
            return "the parties list already holds the label, or is not a list"
        if has != [*(had or [new]), keeps]:
            return "parties may only gain the label kept, after the ones it has"
    if row is None:
        return None  # judged without a roster: the row checks run when there is one
    if keeps is not None and fields["parties"][0] is None and row.get("party") != new:
        return "with no parties list, the row's party must be the new party"
    if not row.get("current") or "federal" not in (row.get("states") or []):
        return "not a sitting federal member or senator"
    if str(row.get("pid") or "") != person["pid"]:
        return "the shipped row does not carry the evidence's pid"
    return None
