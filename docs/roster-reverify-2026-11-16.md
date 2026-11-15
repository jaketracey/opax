# Federal roster re-verification, 16 November 2026

The federal seat roster was last reconciled against Parliament's own list on 4 September 2026
([DATA-MEMBERS.md](DATA-MEMBERS.md)). This is a second check of the same 226 people against
other public sources. It is a report: no roster data changes here. The one real difference
found is written up as a proposed accept-list group for review, and the questions the sources
could not settle are listed under "Needs a human check".

Source rule for this pass: Parliament's own site and ParlInfo were not fetched, by any route.
The base is OpenAustralia's public member files, cross-checked against the AEC's by-election
pages, announcements found through ordinary web search, and records already in the repo.

## Outcome

* **Who sits, in which house and for which seat agrees with OpenAustralia**, person by person,
  for all 226. OpenAustralia's files are dated 11 September 2026.
* **No by-election since Farrer (9 May 2026)** on the AEC's pages, and no resignation, vacancy
  or change of party taking effect since 4 September was found in announcements, with the
  exceptions listed under "Needs a human check".
* **One real difference in the shipped roster**: the row for Senator Chris Gatenby records no
  Senate seat. Three sources agree he is a senator for Tasmania. A proposed accept-list group
  is below.
* **One id out of step in the electorate release**: Senator Vanessa Bleyer is held there under
  a placeholder id. The reviewed correction for it is already merged; the shipped release has
  not been rebuilt from it.
* **Four questions need a human check**: Jonathon Duniam's seat, the party of Zali Steggall
  and Allegra Spender, Matthew Canavan's party label, and Corinne Mulholland's seat.

| | Shipped roster | Federal seat roster |
|---|---|---|
| People marked as sitting federally | 226 | 226 |
| Matched to the source by person id | 226 | 225 |
| Matched by name only (unverified) | 0 | 1 |
| (a) Current in OPAX, not in the source | 0 | 0 |
| (b) Current in the source, not in OPAX | 0 | 0 |
| (c) Same person, different seat, state, chamber or party | 1 | 0 |
| Party recorded under a different label, no change of party | 10 | 10 |
| Needs a human check (people) | 5 | 5 |

## Needs a human check

Each is a specific person and a specific question, where the sources disagree or the base
source is older than something reported since.

1. **Jonathon Duniam, senator for Tasmania (Liberal). Is he still a senator, and has Sarah
   Courtney been appointed in his place?**
   OpenAustralia says in office, as at 11 September 2026. The Handbook records in the repo
   flag him as in the current Parliament, as at 13 November 2026. OPAX's divisions have him
   voting to 15 October, the last Senate division held. Against that: he announced in June
   2026 that he would resign before the end of the year, gave his valedictory speech on 14
   October, and Pulse Tasmania (15 October 2026) says he "has bowed out of federal politics"
   without giving a resignation date. Wikipedia still showed him as incumbent on 5 November
   and Sarah Courtney as "Senator designate, assuming office TBA" on 3 October. If he has
   resigned, the roster has one senator too many for Tasmania, or one to replace.
2. **Zali Steggall (Warringah) and Allegra Spender (Wentworth). Does Parliament's list give
   their party as Independent or as Community Strong Australia?**
   OPAX and OpenAustralia (11 September 2026) both say Independent, and OPAX's divisions to 29
   October print Independent. They announced the party on 25 June 2026, and Wikipedia (13
   November 2026) says the AEC registered it on 2 October 2026 and counts two House seats for
   it. The AEC's register page (updated 6 November 2026) loads its list by script, so the
   registration was not confirmed from the AEC here. The announcement predates the 4 September
   sweep; the registration does not.
3. **Matthew Canavan, senator for Queensland. Does Parliament's list give his party as The
   Nationals or as the Liberal National Party?**
   OPAX says Nationals (set from Parliament's list on 4 September). OpenAustralia (11
   September 2026) and the party printed in OPAX's divisions to 15 October say LNP. The six
   other Queensland LNP people differ the other way round (table below), so his label is the
   odd one out. Not a change of party; a question of which label is right.
4. **Corinne Mulholland, senator for Queensland (Labor). Is she still a senator?**
   OpenAustralia's data file (11 September 2026) and the Handbook records in the repo (13
   November 2026) both say yes, and no announcement of a resignation was found. But OPAX holds
   no vote from her since 19 August 2026 and no speech in August or September, They Vote For You
   lists her absent in September, and a search result for her page on openaustralia.org was
   titled "former Senator". That page refused the fetch (403), so the title could not be
   checked and no further request was made to that site. Most likely leave; worth one look.

Two more senators have no recorded vote since 20 August 2026 (Claire Chandler, Dorinda Cox).
No source disagrees about them: OpenAustralia and the Handbook records both have them in
office, and nothing was found reporting a departure. They are not listed above.

## Sources

### Base: OpenAustralia's member files

`https://data.openaustralia.org.au/members/`, which needs no key.

| File | Last modified (server) | SHA-256 |
|---|---|---|
| `people.xml` | 11 Sep 2026, 03:42 GMT | `fadb7d426abaa75f1b1985283cd20ae924e8c6e21db332b286d7936bfc4d2b23` |
| `representatives.xml` | 11 Sep 2026, 03:42 GMT | `a2415948a28922fb9337c72ab42bc5c72e17b0adc78db76e87799d253ae0315d` |
| `senators.xml` | 11 Sep 2026, 03:42 GMT | `4e45812d5c0f9006177ef412faaec18b4ff38d308d4d3fb37d5f032b0708ea8e` |

Fetched on 16 November 2026 (07:58 AEDT): the directory listing, then four files (the three
above and `divisions.xml`, which was not needed), one request every two seconds, user agent
`opax-improve-audit`. Every request returned 200. The files are cached outside the repo in
`~/opax-work/roster-cache/oa/`.

The files list 226 people as still in office: 150 members and 76 senators (12 for each state,
2 for each territory). The latest change recorded inside them is 20 August 2026 (Vanessa Bleyer
entering the Senate for Tasmania). They also hold the Farrer by-election of 9 May 2026 (David
Farley) and Chris Gatenby replacing Wendy Askew, dated 10 August 2026.

### Cross-check 1: AEC by-elections

Four requests to www.aec.gov.au on 16 November 2026, two seconds apart, same user agent, all
200 (`robots.txt` first; none of the paths is disallowed). Cached in
`~/opax-work/roster-cache/aec/`.

| Page | What it shows | SHA-256 |
|---|---|---|
| [By-elections](https://www.aec.gov.au/Elections/supplementary_by_elections/) | "By-elections since 1901": the most recent is Farrer, 9 May 2026, One Nation (previously Liberal) | `b9e684112befbf39ca763a29420c91ecbfcdb847c5d17d332579b341ed7f1123` |
| [Media releases, 2026](https://www.aec.gov.au/media/2026/) | Latest release 26 October 2026. Nothing since 4 September announces a by-election, a writ or a declaration; the only by-election items are Farrer's | `a2bd45df5eda9b1e73ada76fc2260146f0292de9d28bb675e001cc75f7639a65` |
| [Register of political parties](https://www.aec.gov.au/Parties_and_Representatives/Party_Registration/Registered_parties/) | Updated 6 November 2026; the list itself loads by script and was not read | `0bc2268b124c4a4e548fc57eec36b77c1e54c5c912c24fdba57204f3e7485419` |

So the AEC shows no House seat changing hands since Farrer. OPAX and OpenAustralia both have
David Farley (One Nation) in Farrer.

### Cross-check 2: announcements since 4 September 2026

Ordinary web search (eleven queries on 16 November 2026 for federal resignations, by-elections,
casual vacancies, defections and changes of party since September 2026, and for the named
people below), then the pages read. Dates are the page's own.

| What | Source and date | Bearing on the roster |
|---|---|---|
| Jonathon Duniam to leave the Senate; valedictory given 14 October | [Pulse Tasmania, 15 Oct 2026](https://pulsetasmania.com.au/news/tasmanian-liberal-senator-jonno-duniam-bows-out-after-a-decade/); [ABC, 16 Jun 2026](https://www.abc.net.au/news/2026-06-16/jonathon-duniam-senator-lee-hanson-one-nation/106798566); [ABC, 8 Aug 2026](https://www.abc.net.au/news/2026-08-08/liberals-select-senate-replacements-for-tasmanians-duniam-askew/107012632); [Wikipedia, Jonathon Duniam, edited 5 Nov 2026](https://en.wikipedia.org/wiki/Jonathon_Duniam); [Wikipedia, Sarah Courtney, edited 3 Oct 2026](https://en.wikipedia.org/wiki/Sarah_Courtney) | Human check 1 |
| Community Strong Australia: announced 25 June 2026, registered 2 October 2026 | [Wikipedia, edited 13 Nov 2026](https://en.wikipedia.org/wiki/Community_Strong_Australia); [The New Daily, 25 Jun 2026](https://www.thenewdaily.com.au/news/politics/australian-politics/2026/06/25/teal-party-independents-steggall) | Human check 2 |
| Chris Gatenby chosen by a joint sitting of the Tasmanian Parliament on 13 August 2026, in place of Wendy Askew (resigned 10 August) | [Pulse Tasmania, 13 Aug 2026](https://pulsetasmania.com.au/news/chris-gatenby-confirmed-as-tasmanias-newest-liberal-senator/); [Wikipedia, Chris Gatenby, edited 2 Sep 2026](https://en.wikipedia.org/wiki/Chris_Gatenby) | Second source for the proposed group |
| Vanessa Bleyer chosen by a joint sitting on 20 August 2026, in place of Peter Whish-Wilson | [Wikipedia, Vanessa Bleyer, edited 11 Oct 2026](https://en.wikipedia.org/wiki/Vanessa_Bleyer) | Agrees with the roster |
| Membership changes of the 48th Parliament | [Wikipedia, 48th Parliament of Australia, edited 5 Nov 2026](https://en.wikipedia.org/wiki/48th_Parliament_of_Australia) | Every dated change is before 4 September and already in OPAX: Cox to Labor, Stacey to Bell, Joyce to One Nation, Ley to Farley, Tyrrell to Labor, Askew to Gatenby, Whish-Wilson to Bleyer. The only later entry is Duniam, "late 2026" |
| Larissa Waters stepped down as Greens leader (28 Sep 2026); David Shoebridge elected leader (30 Sep 2026) | Same page | A change of office, not of seat or party. No roster change |
| Matthew Canavan to seek preselection for Capricornia; Michelle Landry to retire at the next election | [Wikipedia, Matt Canavan](https://en.wikipedia.org/wiki/Matt_Canavan), reported November 2026 | Intentions for the next election. No roster change |
| Corinne Mulholland | [Wikipedia](https://en.wikipedia.org/wiki/Corinne_Mulholland) and [They Vote For You](https://theyvoteforyou.org.au/people/senate/queensland/corinne_mulholland) show her as a senator, absent from divisions in September 2026 | Human check 4 |

No report was found of any other federal member or senator resigning, dying, or leaving or
joining a party since 4 September 2026. A search that finds nothing is weak evidence; it is
recorded here as that and no more. Wikipedia is used as a pointer to what to check, not as an
authority. Two pages on www.openaustralia.org.au (the website, not the data host) refused the
fetch with 403; nothing more was requested from that site.

### Cross-check 3: records already in the repo

* **Senate, to 13 November 2026**: `scripts/handbook_party_service.json`, built from the
  Parliamentary Handbook's records of service and fetched on 13 November 2026 for the Senate
  vote-party check. No new request was made for this report. All 76 senators on the roster
  are in it under the same person id and flagged as in the current Parliament. The two who
  left in August (Wendy Askew, Peter Whish-Wilson) are flagged as not. The file covers people
  with Senate service only, so it says nothing about House members who never sat there.
* **Divisions** (`portal/public/divisions/`): 64 House divisions to 29 October and 168 Senate
  divisions to 15 October, all since 4 September. Every person recorded voting is on the seat
  roster, in the house the roster gives. The one voter under an id the seat roster lacks is
  Vanessa Bleyer (below). No new member or senator appears. Five seats have no recorded vote
  since 4 September: the Speaker, who does not vote; Vanessa Bleyer, who votes under her
  other id; and Corinne Mulholland, Claire Chandler and Dorinda Cox (above).

## How far each house is verified

| House | People | Verified by | To |
|---|---|---|---|
| Senate | 76 | OpenAustralia, by person id | 11 Sep 2026 |
| Senate | 76 | Handbook records in the repo (`scripts/handbook_party_service.json`), by person id | 13 Nov 2026 |
| House | 150 | OpenAustralia, by person id | 11 Sep 2026 |
| House | 150 | No by-election on the AEC's pages; no resignation or change of party found in announcements; the same people voting in OPAX's divisions | 16 Nov 2026 (AEC), 29 Oct 2026 (divisions) |

For the House after 11 September there is no member-by-member list to match against. What
there is, is three independent places a change would show, and none shows one. A member who
resigned in the last few days, with no by-election yet called, would not appear in any of them.

## What was compared

OPAX holds the sitting federal list in two places, and both were checked.

1. **The shipped roster**, `portal/public/parliamentarians.json`: every row with `current`,
   federal among its states, and no dated federal service that has ended. That is 226 rows.
   Two more rows carry `current` and a federal seat but are not federal claims: Mark Latham
   and Cory Bernardi sit in state upper houses now, and their dated federal service has an
   end date. They were left out.
2. **The federal seat roster** in the electorate release
   (`portal/public/electorates/`, people file, seats marked current): 226 seats, all dated
   4 September 2026.

People were matched on the OpenAustralia person id (the roster's `pid`, the seat roster's
`legacy_person_id`), never on name alone. `scripts/roster_reverify.py` does the comparison and
is read-only; `scripts/test_roster_reverify.py` covers its rules.

## (a) Current in OPAX but not in the source

None, in either list. (Jonathon Duniam and Corinne Mulholland are current in both; whether
they still should be is under "Needs a human check".)

## (b) Current in the source but not in OPAX

None, in either list.

## (c) Same person, different seat, state, chamber or party

One, in the shipped roster only.

| Person | Id | Field | OPAX | Source |
|---|---|---|---|---|
| Chris Gatenby | 11064 | Chamber and seat | none recorded | Senate, Tasmania |

The roster holds him as the surname print `Gatenby` (full name Chris Gatenby, `pid` 11064,
current, Liberal) with committee speeches only and an empty `representation`. The seat roster
already has him right: Senator for Tasmania, Liberal.

No seat, chamber or Senate state differs for anyone else. OpenAustralia names a House seat by
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
| Matthew Canavan | Nationals | LNP | The other way round: human check 3 |

The 4 September sweep set these from Parliament's list on purpose (DATA-MEMBERS.md). The roster
also writes Jacqui Lambie's party as `JLN` where the seat roster writes Jacqui Lambie Network;
that is one party under two labels inside OPAX.

## Name-only matches (unverified)

| Person | OPAX id | Source id | List |
|---|---|---|---|
| Vanessa Bleyer | `aph_25813` | 11065 | Federal seat roster |

The seat roster gave her a placeholder id on 4 September because OpenAustralia had not issued
one. It now has: 11065. The shipped roster already carries `pid` 11065 (accepted on 18 October
from the Parliamentary Handbook), so there she matches by id. The seat, state and party agree
in every copy.

## Proposed accept-list group: Chris Gatenby

Proposed because three sources agree, two of them independent of OpenAustralia:

1. **OpenAustralia** (11 September 2026): `senators.xml`, office `lord/100973`, Tasmania,
   Liberal Party, still in office; `people.xml` ties that office to person 11064, the row's
   `pid`.
2. **Parliamentary Handbook records in the repo** (`scripts/handbook_party_service.json`,
   fetched 13 November 2026): Handbook id 324140, `pid` 11064, in the Senate file and flagged
   as in the current Parliament.
3. **The appointment as reported**: a joint sitting of the Tasmanian Parliament chose him on
   13 August 2026 to fill Wendy Askew's vacancy
   ([Pulse Tasmania, 13 Aug 2026](https://pulsetasmania.com.au/news/chris-gatenby-confirmed-as-tasmanias-newest-liberal-senator/)).

OPAX's own records agree: 123 Senate divisions recorded for him (id 11064) from 17 August to
15 October 2026, as Liberal, and the seat roster has him as Senator for Tasmania.

The sources differ on one thing the group does not write: OpenAustralia dates his service from
10 August 2026 (the day Wendy Askew resigned), the joint sitting was on 13 August.

It is not installed by this report, and it is not yet in `scripts/roster_accept.json`: a group
only applies when the box export shows exactly the accepted value, so the reviewer should
confirm the `to` value against a raw export (`OPAX_ROSTER_ACCEPT=1 export_people.sh`) before
adding it.

New evidence entry:

```json
"openaustralia-members": {
  "kind": "identity",
  "checked": "2026-11-16",
  "url": "https://data.openaustralia.org.au/members/senators.xml",
  "reason": "OpenAustralia members data files (last modified 2026-09-11), matched on the OpenAustralia person id, and a second source named in each group's note. Re-verification of 16 Nov 2026: docs/roster-reverify-2026-11-16.md."
}
```

New record:

```json
"Gatenby": [{
  "evidence": "openaustralia-members",
  "note": "Person 11064 (Chris Gatenby): senator for Tasmania, Liberal Party, in office (senators.xml, lord/100973). Second source: Parliamentary Handbook id 324140 in scripts/handbook_party_service.json (fetched 2026-11-13), in the current Parliament; chosen by a joint sitting of the Tasmanian Parliament on 2026-08-13 (Pulse Tasmania, 13 Aug 2026). The roster row recorded no federal seat.",
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

The value is written the way the roster writes the other Tasmanian senators. Run in memory
against the shipped roster, the group passes the gate (`roster_accept.group_problem` returns
no problem, state pending) and installs when an export shows the value. It adds a seat and
removes nothing. It leaves `chambers` alone (that list follows the speeches held) and does not
rename the surname print; folding `Gatenby` into a full-name person is a separate review
(`scripts/roster_fold.py`).

No group is proposed for anyone under "Needs a human check": none of those has two sources
agreeing on a change.

## Proposed fix: Vanessa Bleyer's id in the electorate release

The electorate release is not covered by the roster accept list. Its reviewed path for ids is
`scripts/corrections/member-ids.json`, read by `parli/ingest/electorates.py` (the federal
roster snapshot) and `scripts/export_interests.py`.

The correction this needs is **already there, reviewed on 10 November 2026** (finding
members-electorates-012, commit `0e9e817c4`):

```json
{"id": "aph_25813", "field": "person_id", "from": "aph_25813", "to": "11065", ...}
```

Its evidence is OpenAustralia's `people.csv` row and the Handbook id 25813. This report adds a
third agreeing source: `people.xml` of 11 September 2026 has person 11065, Vanessa Bleyer, and
`senators.xml` ties her Senate seat for Tasmania to that person.

So nothing new needs review. What is left is to rebuild from the correction, on the box and not
by hand:

* the electorate release. The shipped one (`db4a3cd54d53c143`, generated 15 November 2026)
  still files her under `aph_25813`, five days after the correction was reviewed. Worth
  finding out why before the next snapshot: either that release was not rebuilt from the
  members table, or the correction is not reaching the snapshot;
* the interests index (`portal/public/interests/index.json` still maps her name to
  `aph_25813`);
* her speeches in the database, which sit under `aph_25813` while her votes sit under 11065.

After that she matches by id in both lists and the name-only count is zero.

## Other follow-ups

* **`current` is per person.** Mark Latham and Cory Bernardi are current for state seats and
  also list a past federal seat. Their dated service makes that clear, but a reader of
  `current` alone could take them for federal members.

## What could not be verified

* The four questions under "Needs a human check".
* The House, member by member, after 11 September 2026 (see "How far each house is verified").
* The party label Parliament's own list gives the three presiding officers and the Queensland
  LNP members. OpenAustralia records them differently by design.
* The state of each House seat (OpenAustralia names the division only).
* Speeches after 24 September 2026: the local database copy stops there, so new speakers were
  looked for in divisions only.
* The AEC's register of parties, which loads by script.

## Verification date

Recorded in `scripts/roster_verification.json`: checked 16 November 2026, with each source's
own date, the counts above, the one open difference and the four open questions. Nothing on the
site reads or displays that file, and the seat roster's own date (4 September 2026) is
unchanged, since no source here can vouch for the whole roster at a later one.

## Run it again

```sh
mkdir -p ~/opax-work/roster-cache/oa && cd ~/opax-work/roster-cache/oa
for f in people.xml representatives.xml senators.xml; do
  curl -sS -A opax-improve-audit -D "$f.headers" -o "$f" "https://data.openaustralia.org.au/members/$f"
  sleep 2
done
cd - && python3 scripts/roster_reverify.py --source ~/opax-work/roster-cache/oa
```
