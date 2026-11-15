# Federal roster re-verification, 16 November 2026

The federal seat roster was last reconciled against Parliament's own list on 4 September 2026
([DATA-MEMBERS.md](DATA-MEMBERS.md)). This is a second check of the same 226 people against a
different public source. It is a report: no roster data changes here. The one real difference
found is written up as a proposed accept-list group for review.

## Outcome

* **Who sits, in which house and for which seat agrees with the source**, person by person, for
  all 226.
* **One real difference in the shipped roster**: the row for Senator Chris Gatenby records no
  Senate seat. A proposed accept-list group is below.
* **One id to reconcile in the electorate release**: Senator Vanessa Bleyer is held there under
  a placeholder id, so she matches the source by name only.
* **The source is dated 11 September 2026.** It confirms the roster as it stood then, one week
  after the last sweep. It cannot confirm anything since. OPAX's own divisions to late October
  show no new member or senator, and nobody on the roster voting from a different house.
* **The Senate side holds to 13 November 2026** on data already in the repo: the
  Parliamentary Handbook records fetched that day flag all 76 senators as in the current
  Parliament. The repo holds no such later record for the 150 House members.

| | Shipped roster | Federal seat roster |
|---|---|---|
| People marked as sitting federally | 226 | 226 |
| Matched to the source by person id | 226 | 225 |
| Matched by name only (unverified) | 0 | 1 |
| (a) Current in OPAX, not in the source | 0 | 0 |
| (b) Current in the source, not in OPAX | 0 | 0 |
| (c) Same person, different seat, state, chamber or party | 1 | 0 |
| Party recorded under a different label, no change of party | 10 | 10 |

## Source

OpenAustralia's public member files at `https://data.openaustralia.org.au/members/`, which
need no key. Parliament's own site and ParlInfo were not fetched.

| File | Last modified (server) | SHA-256 |
|---|---|---|
| `people.xml` | 11 Sep 2026, 03:42 GMT | `fadb7d426abaa75f1b1985283cd20ae924e8c6e21db332b286d7936bfc4d2b23` |
| `representatives.xml` | 11 Sep 2026, 03:42 GMT | `a2415948a28922fb9337c72ab42bc5c72e17b0adc78db76e87799d253ae0315d` |
| `senators.xml` | 11 Sep 2026, 03:42 GMT | `4e45812d5c0f9006177ef412faaec18b4ff38d308d4d3fb37d5f032b0708ea8e` |

Fetched on 16 November 2026 (07:58 AEDT): the directory listing, then four files (the three
above and `divisions.xml`, which was not needed), one request every two seconds, user agent
`opax-improve-audit`. Every request returned 200; nothing was refused. The files are cached
outside the repo in `~/opax-work/roster-cache/oa/`.

The files list 226 people as still in office: 150 members and 76 senators (12 for each state,
2 for each territory). The latest change recorded inside them is 20 August 2026 (Vanessa Bleyer
entering the Senate for Tasmania, Peter Whish-Wilson leaving). They also hold the Farrer
by-election of 9 May 2026 (David Farley) and Chris Gatenby replacing Wendy Askew on 10 August
2026.

## What was compared

OPAX holds the sitting federal list in two places, and both were checked.

1. **The shipped roster**, `portal/public/parliamentarians.json`: every row with `current`,
   federal among its states, and no dated federal service that has ended. That is 226 rows.
   Two more rows carry `current` and a federal seat but are not federal claims: Mark Latham
   and Cory Bernardi sit in state upper houses now, and their dated federal service has an
   end date. They were left out.
2. **The federal seat roster** in the electorate release
   (`portal/public/electorates/`, people file, seats marked current): 226 seats, all dated
   4 September 2026. This is the list the "As at 4 Sep 2026" label was reading.

People were matched on the OpenAustralia person id (the roster's `pid`, the seat roster's
`legacy_person_id`), never on name alone. `scripts/roster_reverify.py` does the comparison and
is read-only; `scripts/test_roster_reverify.py` covers its rules.

## (a) Current in OPAX but not in the source

None, in either list.

## (b) Current in the source but not in OPAX

None, in either list.

## (c) Same person, different seat, state, chamber or party

One, in the shipped roster only.

| Person | Id | Field | OPAX | Source |
|---|---|---|---|---|
| Chris Gatenby | 11064 | Chamber and seat | none recorded | Senate, Tasmania (from 10 Aug 2026) |

The roster holds him as the surname print `Gatenby` (full name Chris Gatenby, `pid` 11064,
current, Liberal) with committee speeches only and an empty `representation`. The seat roster
already has him right: Senator for Tasmania, Liberal.

No seat, chamber or Senate state differs for anyone else. The source names a House seat by
division only, so the state of a House seat is not checked by it.

### Party labels that differ without a change of party

The same ten people in both lists. None is a change since 4 September; each is a difference in
what the two sources choose to record.

| Person | OPAX | Source | Why |
|---|---|---|---|
| Milton Dick | Labor | SPK | The source records the presiding office |
| Sue Lines | Labor | PRES | The source records the presiding office |
| Slade Brockman | Liberal | DPRES | The source records the presiding office |
| Scott Buchholz | LNP | Liberal | Queensland LNP: the source records the party room |
| Ted O'Brien | LNP | Liberal | Queensland LNP: the source records the party room |
| Michelle Landry | LNP | Nationals | Queensland LNP: the source records the party room |
| David Littleproud | LNP | Nationals | Queensland LNP: the source records the party room |
| Llew O'Brien | LNP | Nationals | Queensland LNP: the source records the party room |
| Susan McDonald | LNP | Nationals | Queensland LNP: the source records the party room |
| Matthew Canavan | Nationals | LNP | Queensland LNP: here OPAX records the party room and the source the party |

The 4 September sweep set these from Parliament's list on purpose (DATA-MEMBERS.md). Matthew
Canavan is the one that runs the other way; this source cannot say which label Parliament's
list uses for him today. The roster also writes Jacqui Lambie's party as `JLN` where the seat
roster writes Jacqui Lambie Network; that is one party under two labels inside OPAX.

## Name-only matches (unverified)

| Person | OPAX id | Source id | List |
|---|---|---|---|
| Vanessa Bleyer | `aph_25813` | 11065 | Federal seat roster |

The seat roster gave her a placeholder id on 4 September because OpenAustralia had not issued
one. It now has: 11065. The shipped roster already carries `pid` 11065 (accepted on 18 October
from the Parliamentary Handbook), so there she matches by id. The seat, state and party agree
in every copy. The id is the only thing out of step, and it shows in OPAX's own data: her
Senate votes are recorded under 11065 and her speeches under `aph_25813`.

## Is the source older than a known change?

The source was last modified on 11 September 2026. OPAX's own records run later, so they were
checked for a by-election, casual vacancy or defection the source could not know about.

* **Divisions** (shipped, `portal/public/divisions/`): 64 House divisions to 29 October and 168
  Senate divisions to 15 October, all since 4 September. Every person recorded voting is on the
  seat roster, in the house the roster gives. The one voter under an id the seat roster lacks
  is Vanessa Bleyer (above). No new member or senator appears.
* **Seats with no recorded vote since 4 September**: five. The Speaker does not vote. Vanessa
  Bleyer votes under her other id. That leaves three senators whose last recorded vote is 19
  or 20 August 2026: Corinne Mulholland, Claire Chandler and Dorinda Cox. The local copy of
  speeches (to 24 September) holds none from them after 20 August either. Absence from
  divisions is not evidence of a vacancy: the source lists all three as in office on 11
  September, and the Handbook records below flag all three as sitting on 13 November.
* **Handbook records already in the repo** (`scripts/handbook_party_service.json`, fetched 13
  November 2026 for the Senate vote-party check; no new request was made): all 76 senators
  on the roster are there by the same person id and flagged as in the current Parliament.
  The two senators who left in August (Wendy Askew, Peter Whish-Wilson) are flagged as not.
  The file covers people with Senate service only, so it says nothing about the House
  members who never sat in the Senate.
* **Party**: the party printed in a division is the party room for the Queensland LNP members,
  as in the table above. No other recorded party differs from the roster.

So no change is visible in OPAX's own data that the source predates. That is not the same as
the source confirming the roster for today: it stops at 11 September 2026, and only the
Senate has a later record (13 November) to lean on.

## Proposed accept-list group

One group, for the one real difference. It is not installed by this report, and it is not yet
in `scripts/roster_accept.json`: a group only applies when the box export shows exactly the
accepted value, so the reviewer should confirm the `to` value against a raw export
(`OPAX_ROSTER_ACCEPT=1 export_people.sh`) before adding it.

New evidence entry:

```json
"openaustralia-members": {
  "kind": "identity",
  "checked": "2026-11-16",
  "url": "https://data.openaustralia.org.au/members/senators.xml",
  "reason": "OpenAustralia members data files (last modified 2026-09-11), matched on the OpenAustralia person id. Re-verification of 16 Nov 2026: docs/roster-reverify-2026-11-16.md."
}
```

New record:

```json
"Gatenby": [{
  "evidence": "openaustralia-members",
  "note": "Person 11064 (Chris Gatenby): senator for Tasmania from 2026-08-10, Liberal Party, in office (senators.xml, lord/100973). The roster row recorded no federal seat.",
  "fields": {
    "representation": [[], [{
      "jurisdiction": "federal",
      "chamber": "senate",
      "electorate": "Tasmania",
      "state": "TASMANIA",
      "basis": "Recorded parliamentary roster; exact name and chamber match"
    }]]
  }
}]
```

Evidence:

* Source: `senators.xml`, office `lord/100973`, Tasmania, from 10 August 2026, Liberal Party,
  still in office; `people.xml` ties that office to person 11064, the row's `pid`.
* OPAX's divisions: 123 Senate divisions recorded for him (id 11064) from 17 August to 15
  October 2026, as Liberal.
* OPAX's seat roster: Senator for Tasmania, Liberal, as at 4 September 2026.
* `scripts/handbook_party_service.json` (Parliamentary Handbook, fetched 13 November 2026):
  id 324140, `pid` 11064, flagged as in the current Parliament.

The value is written the way the roster writes the other Tasmanian senators. Run in memory
against the shipped roster, the group passes the gate (`roster_accept.group_problem` returns
no problem, state pending) and installs when an export shows the value. It adds a seat and
removes nothing. It leaves `chambers` alone (that list follows the speeches held) and does not
rename the surname print; folding `Gatenby` into a full-name person is a separate review
(`scripts/roster_fold.py`).

## Follow-ups outside the accept list

* **Vanessa Bleyer's id.** The electorate release and the members table still use
  `aph_25813`; the roster and the divisions use 11065. Re-keying the seat roster and her
  speeches to 11065 is a change to the electorate export and the database, not to the roster.
* **`current` is per person.** Mark Latham and Cory Bernardi are current for state seats and
  also list a past federal seat. Their dated service makes that clear, but a reader of
  `current` alone could take them for federal members.

## What could not be verified

* The 150 House members after 11 September 2026, the source's date. OPAX's divisions to 29
  October show the same people voting, but that is not a roster.
* The 76 senators after 13 November 2026, and between 11 September and that date by anything
  but the Handbook flag.
* The party label Parliament's own list gives the seven Queensland LNP members and the three
  presiding officers. This source records them differently by design.
* The state of each House seat (the source names the division only).
* Speeches after 24 September 2026: the local database copy stops there, so new speakers were
  looked for in divisions only.

## Verification date

Recorded in `scripts/roster_verification.json`: checked 16 November 2026, verified to 11
September 2026 (the Senate cross-checked to 13 November), with the counts above and the one
open difference. Nothing on the site reads
or displays that file, and the seat roster's own date (4 September 2026) is unchanged, since
this source cannot vouch for a later one.

## Run it again

```sh
mkdir -p ~/opax-work/roster-cache/oa && cd ~/opax-work/roster-cache/oa
for f in people.xml representatives.xml senators.xml; do
  curl -sS -A opax-improve-audit -D "$f.headers" -o "$f" "https://data.openaustralia.org.au/members/$f"
  sleep 2
done
cd - && python3 scripts/roster_reverify.py --source ~/opax-work/roster-cache/oa
```
