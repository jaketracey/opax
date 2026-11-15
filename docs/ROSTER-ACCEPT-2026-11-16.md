# Roster accept review, 16 November 2026

Follows the federal roster re-verification of the same day
([roster-reverify-2026-11-16.md](roster-reverify-2026-11-16.md), draft PR #444). That report found one
real difference and left four questions for a human check. The hub resolved three of the four. This
review applies the result through `scripts/roster_accept.json`, in one commit with the roster.

Sources: ordinary web pages fetched on 16 November 2026 (one request every two seconds, user agent
`opax-improve-audit`, every request 200), the AEC's register of political parties, OpenAustralia's
public member files, and records already in the repo. **www.aph.gov.au and ParlInfo were not
fetched.** The pages are cached outside the repo in `~/opax-work/roster-cache/web/`.

## Result

| Person | Field | From | To | Evidence |
|---|---|---|---|---|
| Zali Steggall (Warringah) | `party_now` | Independent | Community Strong Australia | `sitting-party-2026-11-16` |
| Allegra Spender (Wentworth) | `party_now` | Independent | Community Strong Australia | `sitting-party-2026-11-16` |
| Matthew Canavan (senator, Queensland) | `party_now` | Nationals | LNP | `sitting-party-2026-11-16` |
| Matthew Canavan | `parties` | none | LNP, Nationals | same group |
| Chris Gatenby (row `Gatenby`) | `representation` | none | Senate, Tasmania | `sitting-seat-2026-11-16` |

Four records, four groups, all installed (`python3 scripts/roster_accept.py --check`: 737 records, 848
groups, 848 applied, 0 problems). No row is added or dropped, no speech count moves, and the roster's
`meta` is unchanged. No protection field is touched (name, full, prints, speech scope and basis, dated
party, identity basis, aliases, identity evidence).

No change: Corinne Mulholland. Not resolved: Jonathon Duniam (below).

## Each change and its sources

### Zali Steggall and Allegra Spender: Community Strong Australia

* [ABC News, 25 June 2026](https://www.abc.net.au/news/2026-06-25/allegra-spender-and-zali-steggall-form-centrist-party/106839026):
  "Teals Allegra Spender and Zali Steggall form new political party Community Strong Australia". At
  that date the party "was yet to be formally registered".
* [AEC, Register of political parties](https://www.aec.gov.au/Parties_and_Representatives/Party_Registration/Registered_parties/),
  file of 6 November 2026: **Community Strong Australia, registered 2 October 2026**, registered
  abbreviation "Community Strong", marked as a parliamentary party.
* [The Conversation, 26 June 2026](https://theconversation.com/teal-independents-new-party-presents-an-opportunity-and-a-risk-286237):
  "So far, Steggall and Spender are the only teals to have joined the party."

The party is registered, so the label is the registered name with no qualifier. `party` stays
Independent: it is what their speeches carry, and the page says "formerly Independent" from it. A
Guardian article of 25 June was not found by search and is not cited.

### Matthew Canavan: LNP, with the Nationals as his party room

* [ABC News, 2 November 2026](https://www.abc.net.au/news/2026-11-02/federal-politics-nationals-leader-matt-canavan-capricornia/107335062):
  the Nationals leader "holds the number two spot on the Liberal National Party of Queensland (LNP)
  Senate ticket". The same article reports his plan to seek preselection for Capricornia, which
  changes nothing yet.
* OpenAustralia `senators.xml` (last modified 11 September 2026): Queensland, Liberal National Party,
  in office since 1 July 2014.
* [LNP profile](https://www.lnp.org.au/mattcanavan), undated, read 16 November 2026: "Leader of the
  Nationals ... Senator for Queensland".

The roster records Queensland LNP members under LNP and keeps the party room in `parties` (David
Littleproud: LNP, with `parties` LNP and Nationals). Canavan's row now has the same shape, so he
leads with LNP and is still listed on the Nationals page. The Handbook file in the repo
(`scripts/handbook_party_service.json`) records him as Nationals, which is where the 4 September
label came from. A Guardian article of 23 October was not found by search and is not cited.

### Chris Gatenby: senator for Tasmania

* OpenAustralia `senators.xml` and `people.xml` (11 September 2026): person 11064, Tasmania, Liberal
  Party, in office.
* [ABC News live blog, 17 August 2026](https://www.abc.net.au/news/2026-08-17/federal-politics-live-blog-august-7/107044768),
  11:02am: "Chris Gatenby, Tasmania's newest senator, has been sworn in. He replaces Wendy Askew".
  [Yahoo News Australia, 17 August 2026](https://au.news.yahoo.com/australia-newest-senator-sworn-010513146.html)
  reports the same.
* [Pulse Tasmania, 13 August 2026](https://pulsetasmania.com.au/news/chris-gatenby-confirmed-as-tasmanias-newest-liberal-senator/):
  confirmed by a joint sitting of the Tasmanian Parliament that morning.
* `scripts/handbook_party_service.json` (fetched 13 November 2026): Handbook id 324140, in the current
  Parliament.

The row had an empty `representation`. It now has the Senate seat, written as the roster writes the
other Tasmanian senators. `chambers` is left alone (it follows the speeches held), and the surname
print `Gatenby` is not renamed or folded; that is a separate review (`scripts/roster_fold.py`).

### Corinne Mulholland: no change

Still a Labor senator for Queensland. [Queensland Labor's page](https://queenslandlabor.org/corinne-mulholland/)
(undated, read 16 November 2026) lists her as "Senator". OpenAustralia (11 September) and the Handbook
file (13 November) agree. The "former Senator" page title that raised the question is how
openaustralia.org titles its senator pages in search results generally: the same title appears for
Chris Gatenby, who was sworn in on 17 August.

## Jonathon Duniam: unchanged, recheck weekly

No dated source for his resignation or for Sarah Courtney's appointment was found, so nothing is
applied.

* He announced on 14 June 2026 that he would resign before the end of the year
  ([ABC, 16 June 2026](https://www.abc.net.au/news/2026-06-16/jonathon-duniam-senator-lee-hanson-one-nation/106798566)).
  Sarah Courtney was chosen as the Liberal replacement on 8 August
  ([ABC, 8 August 2026](https://www.abc.net.au/news/2026-08-08/liberals-select-senate-replacements-for-tasmanians-duniam-askew/107012632)).
  He gave his valedictory speech on 14 October
  ([Pulse Tasmania, 15 October 2026](https://pulsetasmania.com.au/news/tasmanian-liberal-senator-jonno-duniam-bows-out-after-a-decade/)).
* OPAX's divisions have him voting on 15 October, the last Senate division held. The Handbook file
  (13 November) still flags him as in the current Parliament. Wikipedia showed him as incumbent on 5
  November and Courtney as "designate, assuming office TBA" on 3 October.
* The Tasmanian Parliament's site was tried for a joint-sitting record. Its sitting calendar and
  votes load from a path its `robots.txt` disallows (`/_designs/`), so that was not fetched. A search
  of the site finds the joint sittings of 13 and 20 August (Gatenby, Bleyer) and none since.

**Backlog: recheck weekly until dated.** Look for (1) a joint sitting of the Tasmanian Parliament
choosing a senator in place of Jonathon Duniam, in the House of Assembly Hansard or Votes and
Proceedings, and (2) a report of Sarah Courtney being sworn in. When both dates exist, apply two
things in one reviewed commit: Duniam's row loses `current` (an end to his service, which needs a
rule of its own, since an accept-list group may not remove an identity value), and Sarah Courtney
gains a federal Senate row for Tasmania (a new row with a Handbook id, or a link from her existing
Tasmanian row).

## What the gate needed

Three of the four people (Steggall, Spender, Canavan) are folded people: their surname print was
merged into them (`prints`). The accept list pins every identity field of a folded person,
`party_now` and `parties` included, so the judge held these as ordinary identity groups ("a folded
person: party_now stay as shipped"). 99 of the 226 sitting federal people are folded, so no change of
party by any of them could pass.

This review adds one narrow rule, in the way the dated list service was added on 14 November:
`sitting-party` evidence (`scripts/roster_sitting_party.py`, wired into `roster_accept.group_problem`).
A group under it may write `party_now` on a folded person, and only when:

* the evidence names the person, their OpenAustralia id, and the party before and after, and the
  group's values are exactly those;
* the shipped row is current, federal, and carries that id;
* the evidence cites at least two dated sources on two different sites, none on aph.gov.au;
* nothing else is written, except that where the evidence says the person keeps the old label (a
  party room), `parties` gains that one label and loses nothing.

Every other protection still holds such a group: a pinned witness split, a party pinned in
`scripts/roster_service.json`, a dated party, a reviewed alias. `scripts/test_roster_sitting_party.py`
covers the rule (7 tests). Chris Gatenby's row is not folded and passes as an ordinary identity group.

The groups were installed by `roster_accept.apply()` against a copy of the shipped rows carrying the
accepted values, so the judge passed each one; nothing was typed into the roster. A later export that
still shows the old party leaves them installed (the shipped value is the accepted one).

## A party that was not in the data

"Community Strong Australia" appeared nowhere before this. What was checked, and what had to be added:

| Where a party shows | Before any code change | Added |
|---|---|---|
| Party chip and label | Rendered with the neutral dot and the raw name | An entry in `labels.js` (`PARTY_MAP`, `PARTY_NAMES`), code CSA, the neutral "other" colour. The registered abbreviation "Community Strong" resolves to the same party |
| Dot on its own (rows that print the party nearby) | **No dot**: that helper draws one only for a party in the map | Fixed by the same entry |
| Party page `/subject/party/community-strong-australia` | Built automatically from `party_now`: 2 sitting members, no divisions, no money | Nothing |
| Party directory | Listed automatically | Nothing |
| "2 marked current in the directory" link on the party page | **Opened an empty list**: the people directory filtered on `party` and `parties` only, and offered no option for the party | The filter now matches `party_now` too, and a party that is only ever a party now is offered as an option. Counts of the existing options are unchanged. This also fixes the same empty link for Australia's Voice (Fatima Payman) |
| Person pages | "Community Strong Australia · formerly Independent" | Nothing |
| Independents page | Both still listed, under other members, each marked "now Community Strong Australia"; its sitting count falls from 13 to 11 | Nothing |
| Votes | Division rows keep the party printed on the day (Independent). No "voted against party" output reads the roster | Nothing |
| Apps | Decode an unknown party (no party enum; neutral colour, full name) | Nothing; see the limit below |

No new colour was invented: the design tokens have eight party colours and minor parties share the
neutral one. `portal/test/party-new-label.test.mjs` renders each of these in the real shell.

## Limits, and what is left for the box

* **The electorate release still says Independent and Nationals.** The seat pages for Warringah,
  Wentworth and the Queensland Senate, and the apps' member rows (which prefer the seat's party over
  `party_now`), read the electorate release, built on the box from the members table. Until that
  table is corrected and a release rebuilt, a person page and their seat page will disagree. The
  same rebuild carries Vanessa Bleyer's id (see the re-verification report).
* **`pay.json`** takes `party_now` at the next weekly refresh, so Steggall and Spender move out of
  the Independent figures there, and out of Ask's answers about independents' pay.
* **The members table on the box** should get the same three party corrections, so a later raw
  export agrees with the roster instead of being held against it.
