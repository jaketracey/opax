# Data cleanup sweep, wave 2a (11 Nov 2026)

Two lanes that needed no VM database writes. Worker code and one hand-exported data release.

## Victorian person pages: party from the verified seat roster (`dc/w2-vicparty`)

Every Victorian MP page's meta description read "Party not recorded". `parliamentarians.json` has no party for 159 of 169 Victorian people, and the Worker used only that file. The electorate release already holds a verified Victorian roster (Parliament of Victoria member pages, as at 9 Sep 2026) with each member's party.

- New shared module `portal/public/roster-party.js`, read by the Worker (`portal/src/seo-content.ts`, JSON-LD in `portal/src/index.ts`) and the app (`portal/public/app.js` through `electorates.js`).
- The fallback is used only when the person record has no party, their recorded seat matches exactly one verified entry in the same jurisdiction and chamber, and exactly one representative is them (by `legacy_person_id` where both sides have one, otherwise exact full name, never a surname). Anything else shows no party; an existing party keeps its wording.
- Wording: "Labor (parliamentary roster as at 9 Sep 2026)".
- 140 Victorian people gain a party. Other states have no verified rosters and are unchanged.
- Allan, Pearson: Labor. Battin, Newbury, Jess Wilson: Liberal. Read: Greens.
- Tests: `portal/test/roster-party.test.mjs`.
- Not built: the generator route (a Victorian official-roster snapshot in `scripts/roster_state_evidence.json` plus a reviewed `roster_accept.json` from a box export). The Worker fallback follows each new electorate release in the meantime.

## Electorate service records join OPAX people by OpenAustralia id (`dc/w2-identity`)

The builder (`parli/ingest/electorates.py`) joined OpenAustralia service records (legal names, e.g. "William Richard Shorten") to members-table people only on an equal name, so members known by a short first name became a second person with no `legacy_person_id`. A five-name table patched Burke, Hawke, Zappia, Bowen and Katter.

- The builder now reads OpenAustralia `people.csv` (pinned to the commit and digest `scripts/export_profile_links.py` checks); the OPAX id is 10000 plus the person count. When the members table holds that id, the record joins that person and gains the legal names as aliases. The five-name table is gone.
- Bill Shorten 10580 and Bob Sercombe 10571, from `people.csv` rows 580 and 571 and the members table. Display names follow the members table; legal names are aliases. Shorten's 2019 and 2022 Maribyrnong candidacies now link to him.
- Release `efa7410c3fe2a90c` (was `b56417062ccc33cf`, kept for readers on a cached manifest), rebuilt with `scripts/relink_electorate_people.py`, which re-runs only person linking and refuses a changed `representatives.csv`. With the old code it reproduces the old release byte for byte.
- Service-record people with `legacy_person_id`: 390 of 562 before, 436 of 560 after. With aliases: 166 to 302. Candidacies with a person: 505 to 513 of 3,447. Elected candidacies with no person: 7 to 0.
- 124 service-record people still have no id: OpenAustralia people the members table does not hold (56 served after 1998, e.g. Mark Latham, Cheryl Kernot, Peter Reith).
- Person ids change for Shorten, Sercombe and 48 other historical people (old OpenAustralia-only ids replaced by members-table ids).
- New check `validate_data.py electorates`, run on request (no nightly group carries this release).

## For Jake

- Alan Gordon Griffiths (OpenAustralia 10268) left the House on 29 Jan 1996, before the earliest speeches the database holds, so he has no roster entry, portrait or profile. The Worker adds release-only people to the directory only when they are current members. Showing former members with no speeches is a product decision.
- Victorian MPs now also show the existing "Receipt sources to their party" tables on their server-rendered pages, with the same caveat federal members get. The election hub (`/vic-election-2026`) is unchanged.
- The Victorian roster is dated 9 Sep 2026. A party change before 28 Nov shows only after the electorate release is refreshed.
