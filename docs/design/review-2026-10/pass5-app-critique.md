# Pass 5 app critique: sweep and ranked list

11 October 2026. Design lead's critique of the iOS app's 1.0 candidate against `DESIGN-REVIEW-2026-10.md` (on `design/review`): section 2 (the seven principles and two state rules), section 5.2 (the component spec) and D1–D6, plus `docs/design/TOKENS.md`. Claude design-lead pass; no Codex review. Read-only on code: nothing tracked under `mobile/` was edited.

## Summary

| Priority | Meaning | Count |
|---|---|---|
| **P1** | Breaks a principle on a high-traffic screen | 4 |
| **P2** | An inconsistency with the system | 22 |
| **P3** | Polish | 17 |
| | **Total** | **43** |

Counts include the AX5 section (3 × P2, 2 × P3) and the iPad section (2 × P2, 2 × P3).

Passes 2B to 4F landed well on the screens their lanes owned. Today is six blocks with one colour moment, and at AX5 the edition now starts on the first screen. The profile says identity once, with a three-figure strip. The bill page titles divisions by stage and puts the question behind a disclosure. Ask meets concept 5. Reports carry one machine label and numeral citations. Public money is one list. Money figures are dated and sourced. Apart from the party codes on topic pages (P2-14), no uppercase label or filled party chip came back on any screen of the 282 captured. Dark mode renders light everywhere, as decided (`dark-01-today` is pixel-identical to `01-today`).

The findings cluster in three places:

- **Files no pass 3/4 lane owned:**
  - the records reader and bill-text reader (`features/records/*`);
  - the people directory and catalog states (`directories/DirectoryScreen.tsx`, `CatalogState.tsx`);
  - the electorate outline (`electorate-map/OutlineMap.tsx`).

  They still draw the deprecated provenance recipes (kicker, "View original", ⓘ, separate date lines). The ratchet test allows them, because it only stops counts rising.
- **Search after submitting.** Concept 4 ("the first result on the first screen") was not met. Nine controls still stand before the first result.
- **Shared-component seams:**
  - every source sheet reads "As at / As at 4 September 2026", with one date for many sources;
  - source names carry ISO dates and pipeline words ("AEC 2019-05-18 tcp votes and 14 more");
  - the title role scales without a cap at AX5;
  - iPad split panes still open empty.

**Nothing here blocks 1.0.0 (34).** The release notes at the end list two items to confirm and say why the rest wait for 1.0.1.

## Method

- **Build.**
  - Worktree `design/p5-app-sweep` = `ios/integration-b33` `02f04f00c` fast-forwarded to `ios/ax5-figures` `4ca3ea2ba`: the same code as App Store 1.0.0 (34).
  - Real `npm ci` under Node 24.
  - One e2e Release simulator build through the build gate (build number 33, `OPAX_HIDE_COMMUNITY=1`); `qa-static` passed.
- **Devices,** one at a time under the shared lock, in the granted block (11 Oct, 14:11–15:37 AEDT):
  - iPhone 17 Pro `26CF02F0` (iOS 26.5): Large text light, system dark, and AX5;
  - OPAX QA iPad 13 `C6B3765F`: landscape, Full-Screen Apps (restored to Windowed Apps afterwards).
- **Data.**
  - The fixture server only. 0 requests went outside the allow-list.
  - A private proxy answered every official portrait with the fixture's own 404, so people show OPAX's blank circle. 480 portraits were withheld and none was captured.
  - Donor names are pixelated in the 21 kept frames that showed them. Money list mode and a donor's money record were not captured.
  - No audio, VoiceOver, speech, Talk call or volume change.
- **Flows.**
  - The pass 3/4 lanes' private capture flows, adapted: the consent step for Ask, Settings toggles removed, donor frames dropped.
  - New flows for the 1.0 surfaces, the records reader, AX5 search and Ask, the iPad extras and dark mode.
- **Not capturable.**
  - **The neutral evaluative reply.** The app has no client-side handling. Its Ask fixture has no evaluative reply, and the Worker change lives on `web/ask-citations`, not on `main` (see 1.0 notes).
  - **Community.** It is hidden in this build, as in release.
  - The iPad records reader was captured in the Search pane (`18e`) rather than standalone.
- **Not findings.**
  - The iPad status bar's "◀ Settings" breadcrumb (harness).
  - Report this answer's "Source record: Report this answer" screen. That is the e2e stand-in for the in-app browser; the journey asserts the support URL.
  - Fixture text: the synthetic reader layout fixture, and "Pinned public source extracts; local fixture matching…" in the search sheet.

## Captures

All captures are in the git-ignored `mobile/private/design-p5-app/` of the worktree; `MANIFEST.md` there lists all 282 frames, with device, flow and masking.

- `captures/iphone/`, `iphone2/` (follow-up run): standard size, light.
- `captures/dark/`: Today, profile and bill with the system set to dark.
- `captures/ax5/`: AX5.
- `captures/ipad/`, `ipad2/`: iPad 13 landscape. Landscape frames are rotated upright; `36-today-portrait` and `38-bill-top-portrait` are portrait.
- `view/`: the contact sheets the review was read from.
- `flows/`, `groups/`, `device-session.sh`, `results.log`: the harness, rerunnable for the after shots.

Frame IDs follow the build 32 baseline, plus:

- `40-ask-consent*`;
- `41-ask-report-*`;
- `dark-*`;
- the lanes' extras: `16*` public money, `18*` leads, `19*` declarations, `20*` follows, `39*` topics, `48`/`49` Explore tools.

## Guard census

`tests/deprecated-recipes.test.ts` lets a file's count fall but never rise. These adapters are still drawn, almost all in files that no pass 3/4 lane owned:

| Recipe | Sites |
|---|---|
| `AsAtLine` | `records/BillTextReader.tsx` ×2, `records/DocumentReader.tsx` ×2, `CatalogState.tsx`, `directories/DirectoryScreen.tsx` |
| `ViewOriginal` | `records/BillTextReader.tsx`, `records/DocumentReader.tsx`, `reports/TodayReports.tsx` |
| `InfoButton` | `electorate-map/OutlineMap.tsx`, `directories/DirectoryScreen.tsx` |
| `SourceLink` | `electorate-map/OutlineMap.tsx`, `explore/PhotoCredits.tsx` ×2 |
| `StaleNotice` | `RecordStatus.tsx`, `CatalogState.tsx`, `directories/DirectoryScreen.tsx` |
| `Section info` | `records/*` ×6, `ask/Options.tsx`, `search/FiltersSheet.tsx`, `reports/TodayReports.tsx` ×2 |
| `numberOfLines` clamp | `today/DeclarationRow.tsx:140` (the README forbids clamps) |

Each fix lane below lowers the baseline in `tests/fixtures/deprecated-recipes.json` for the files it clears.

## Ranked list

Frame paths are relative to `mobile/private/design-p5-app/captures/`. "Lane" refers to the fix lanes at the end.

### P1: breaks a principle on a high-traffic screen

**P1-1. Search: nine controls before the first result, which sits under the tab bar.**

- **Frames:** `iphone/p3d_iphone-18-search-passages/18-search-passages.png`; at AX5, `ax5/p5_ax5-search/18-search-passages*.png` (the first result is two screens down).
- **What is drawn before the first record:**
  1. field label ("Find source records");
  2. the field;
  3. a Kind row;
  4. a navy "Search records" pill;
  5. a Filters row with an icon tile;
  6. "1 record · Relevance ⌄ · share";
  7. Passages / Briefs;
  8. "Summarise these records";
  9. a Machine-written pill.

  The first result's kind line sits at about y = 775 of 874 pt, behind the floating tab bar. The build 32 baseline counted "about 9 controls" too.
- **Breaks:**
  - principle 5 (one primary action; everything else under ⋯);
  - principle 3 (the query form keeps asking after it has been answered);
  - concept 4's stated goal.
- **Fix (`features/Search.tsx`, `features/search/Results.tsx`):**
  - Once a query has been submitted, collapse the query form:
    - the field keeps the query, with the kind as its leading scope ("Records ▾" inside the field's leading slot);
    - the Kind row and the "Search records" pill go;
    - the keyboard's Search key submits.
  - Move Filters into the count line ("1 record · Relevance ⌄ · Filters"), and the share into ⋯.
  - Keep the Passages / Briefs segmented control.
  - Move "Summarise these records" below the first three results, as a row with its machine pill.

  Target: the first result's title on the first screen at Large on the 17 Pro.
- **Lane:** A.

**P1-2. Records reader: never migrated (kicker, View original, three drawn actions, icon-tile speaker).**

- **Frames:** `iphone/p5_reader-17-24-30/24-records-reader.png`, `24-records-reader-p2.png`; iPad `ipad/p4e_ipad-3-search/18e-search-result-in-pane.png`.
- **What is drawn:**
  - a teal "Speech" kicker above the title;
  - the speaker as a 36 pt icon tile with "More by this speaker", not a PersonRow with the portrait circle;
  - "Speech date 18 Aug 2026" and "House of Representatives · Federal" as two meta lines;
  - a bare "View original" link;
  - "Cite" and "Copy link" drawn as a text-button row;
  - "Ask about this" as an icon-tile row;
  - "Similar speeches" as another icon-tile row.

  The bill block inside it has its own SourceLine, while the record itself has none.
- **Why P1:** every search result and every speech citation in Ask lands here.
- **Breaks:**
  - principle 3 (no kicker; one meta line);
  - principle 4 (one SourceLine per block, with View original inside its sheet);
  - principle 5 (one primary; Cite, Copy link and Share under ⋯);
  - the PersonRow spec.
- **Fix (`features/records/DocumentReader.tsx`, `RecordActions.tsx`, `CitationScreen.tsx`, `RecentRecords.tsx`, `BillTextReader.tsx`):**
  - Drop the kicker, and put the kind in the meta line: "Speech · House of Representatives · 18 Aug 2026".
  - Draw the speaker with `PersonRow` (portrait 44, PartyLabel).
  - Replace `AsAtLine` / `ViewOriginal` / `Section info` with one `SourceLine` per block (`originals`, `notes`, `licence`).
  - Put Cite, Copy link and Share under the header's ⋯ (one `RecordActions` implementation, the pass 1 "built twice" item).
  - Keep "Ask about this" as the block's one drawn action, as a plain LinkRow without an icon tile.
  - Lower the ratchet for these files.
- **Lane:** A.

**P1-3. Bill page: the ⋯ button wraps onto its own line, and the navy primary is a navigation.**

- **Frames:** `iphone/p3c_p3c-iphone/12-bill-top.png`, `20-r7534-001.png` (both bills; standard size on the 17 Pro). The iPad pane fits the row.
- **What is drawn:** "Read the bill text" (a navy pill with an icon) and "+ Follow" fill the row, and the 44 pt ⋯ circle drops alone to a second line.
- **Breaks:**
  - principle 5 ("Navigation is a row or a link, not a button");
  - consistent spacing (the most-visited record page reads as broken);
  - concept 3 (actions are Follow and Ask about this).
- **Fix (`features/bills/BillDetail.tsx`, header actions ~l. 499–530):**
  - Make the action row Follow (toggle `Button on`) plus ⋯, on one line.
  - Move "Read the bill text" to a LinkRow directly under the meta line ("Bill text, as introduced ›"), or into the In short block's foot beside the explanatory memorandum.
  - "Ask about this" stays under ⋯ (as now) or becomes the one secondary pill.
  - Re-shoot at Large on the 17 Pro and the 16e (iOS 18.4, narrower).
- **Lane:** C.

**P1-4. MP profile: the portrait wears a party-coloured ring.**

- **Frames:** `iphone/p3b_iphone-04-profile/04-profile-top.png`, `ipad/p3b_ipad-04-profile/04-profile-top.png`, `ax5/.../04-profile-top.png`, `dark/p5_dark/dark-04-profile-top.png`. The ring is 3 pt in the party's dot colour, and it shows even around the blank circle.
- **Breaks:** principle 1 ("Party colour is a dot beside a party name, never a fill, a series or a mood"). The PartyLabel two lines below already carries the colour.
- **Fix:** drop `ring={partyDot(identity.party)}` at `features/Person.tsx:222`. The portrait keeps its hairline. Leave the `ring` prop in `design/people.tsx` for lane D to retire once nothing uses it.
- **Lane:** B.

### P2: inconsistencies

**P2-1. Profile: three sections that each hold one "Show …" row.**

- **Frames:** `iphone/p3b_iphone-04-profile/05-profile-votes.png`, `06-profile-pay.png`, `04-profile-strip-jump-pay.png`; on iPad, see P2-21.
- **What is drawn:** "What they talk about / Show topics", "Latest indexed speeches / Show speeches" and "News headlines / Show news". Each is a full section (rule, accent mark, serif heading) around a single on-demand row.
- **Breaks:**
  - principle 3 (a section title never repeats its own first row);
  - section anatomy (a section is a block of content).
- **Fix (`features/people/Sections.tsx`):**
  - Make one section, "More from the record", with three LinkRows: Topics, Latest speeches, News headlines.
  - Each row loads in place when tapped, as now.
  - A loaded block replaces its row with its own section.
- **Lane:** B.

**P2-2. Profile: the first block is the party's receipts.**

- **Frames:** `iphone/p3b_iphone-04-profile/04-profile-top.png` (Party receipts directly under the header strip; its first line says "Party disclosures, not this person's finances.").
- **Breaks:** principle 4's caveat logic. The page leads with money that it says isn't the person's own, ahead of the person's votes, interests and pay.
- **Fix (`features/Person.tsx`, block order):**
  - Order the blocks as: Voting record → Declared interests → Pay for the posts held → Claimed expenses → Party receipts → More from the record.
  - Keep the caveat as the one inline line beside the receipts.
- **Decision:** this is an ordering call, so the orchestrator should confirm it with Jake. It mirrors the web person page, where the association line sits beside party receipts (web pass 5, P1-2).
- **Lane:** B.

**P2-3. Today: the foot's source line gives the oldest feed date for the whole page.**

- **Frames:** `iphone/p3a_iphone-today/01-today-foot.png` ("Updated 4 Sep 2026 · ParlInfo bill records and 2 more", on a page whose edition is 4 Oct and whose bills were introduced 17 Sep); `01-today-sources-sheet.png` ("As at 4 September 2026" once, for three feeds).
- **Breaks:** principle 4 (a source line says when *its* figures were current). Today's two feed blocks (New in parliament, Just declared) have no source line of their own, so the page line reads as "this page is a month old".
- **Fix (`features/today/Foot.tsx`, `features/today/TodayBlock.tsx`):**
  - Give New in parliament and Just declared each a `SourceLine` at their foot with their own as-at date.
  - The foot keeps the independence statement and the edition's source.
  - If one page line stays, date it with the newest feed and list each source with its own date in the sheet (see P2-4).
- **Lane:** C (Today); the sheet half is lane D.

**P2-4. Source sheets: "As at / As at 4 September 2026", one date for many sources, and "Licence: See source terms".**

- **Frames:** every sheet. For example:
  - `iphone/p3a_iphone-today/01-today-sources-sheet.png`;
  - `p3b_iphone-04-profile/04-profile-source-sheet.png`;
  - `p3c_p3c-iphone/14b-bill-source-sheet.png`;
  - `p4c_iphone-19-declarations/19-declarations-source-sheet.png`.
- **What is drawn:**
  - The "As at" heading is followed by a value that starts "As at" again.
  - Multi-source sheets show one as-at date.
  - The profile sheet lists "OPAX existing parliamentary person identifiers" as an original record (with ↗), and its licence reads "See source terms" without a link.
- **Breaks:**
  - principle 3 (a label never repeats its value);
  - principle 4 (the sheet lists each original with its as-at);
  - plain language.
- **Fix (`design/source.tsx` ~l. 380–390):**
  - Value-only dates under the heading ("4 September 2026").
  - Accept per-source dates (`sources: {name, asOf, url}[]`) and draw "Source · date" rows when they differ.
  - The licence row links to Sources and licences, anchored at the dataset.
  - Callers stop passing OPAX-internal datasets as `originals`; they go in notes ("Matched to OPAX's people list").
- **Lane:** D, then each lane's callers.

**P2-5. Source names carry ISO dates, pipeline words and full document titles.**

- **Frames:**
  - `iphone/p3b_iphone-02-your-mp/03-your-mp-chosen.png` ("AEC 2019-05-18 candidates");
  - `p3b_iphone-10-electorate/10-electorate.png` and `-p3` ("AEC 2019-05-18 tcp votes and 14 more", three times);
  - `03-your-mp-chosen-p2.png` and the profile pay block ("Parliamentary Library: The base salary for senators and members (Background Note, 17 August 2012) and 5 more": three lines);
  - `iphone2/p4a_p5-money-iphone/16j-agencies.png` ("Latest contract notice per amendment lineage").
- **Breaks:**
  - the date rule (no ISO dates);
  - plain language;
  - the SourceLine anatomy ("date · source name", one line where it fits).
- **Fix:**
  - Add `sourceLabel()` to `design/format.ts` (lane D): short publisher names ("AEC election results", "Parliamentary Library", "AusTender"), with the full title kept for the sheet.
  - Callers pass `{ label, title }`: `features/Electorate.tsx`, `your-mp/Evidence.tsx`, `your-mp/RepresentativeRows.tsx`, `people/FinancialBlocks.tsx` (lane B), and `money-public/*` (lane C).
  - "tcp" (two-candidate preferred) never reaches the screen.
- **Lanes:** D (helper), B, C.

**P2-6. Party page: "193" said twice, and two dates and a licence in one source line.**

- **Frames:** `iphone/p3b_iphone-09-party/09-party.png`; the iPad frame matches.
- **What is drawn:**
  - Members shows a "193" display figure, then a first row "Current members 193 ›".
  - Its SourceLine reads "Updated 9 Sep 2026 · OPAX parliamentary roster and 3 more · Roster as at 4 Sep 2026" (the build 32 two-date complaint, still there).
  - Receipts' line ends "AEC disclosure returns, CC BY 4.0".
  - "current members with current evidence" is pipeline wording.
- **Breaks:** principle 3; principle 4 (one date; the licence lives in the sheet).
- **Fix (`features/Party.tsx`):**
  - Keep the figure ("193 current members") and retitle the row "Member list ›", with no count.
  - One date on the line; the roster date goes into the sheet's per-source dates (P2-4).
  - Move the licence into `licence`.
- **Lane:** B.

**P2-7. Electorate: the outline keeps ⓘ + View original, the Census is named three times, and three source lines are identical.**

- **Frames:** `iphone/p3b_iphone-10-electorate/10-electorate-p2.png`, `-p4`; `ipad/p3b_ipad-10-electorate/10-electorate.png`.
- **What is drawn:**
  - Under the outline: "Display outline · 2025 election", "Not for address allocation.", an ⓘ, then "View original".
  - Local context: "Census 2021", then "2021 Census geography", then "2021 Census geography; values have not been redistributed…".
  - The header, latest representation and history each end in the same "AEC 2019-05-18 tcp votes and 14 more" line.
- **Breaks:** principle 4 (the deprecated pair); principle 3.
- **Fix (`electorate-map/OutlineMap.tsx`, `features/Electorate.tsx`):**
  - The outline gets one SourceLine ("2025 election boundary · AEC"), with "Not for address allocation" in its notes.
  - Local context becomes one heading, "Census 2021", plus a one-line caveat ("Values for the 2021 boundary, not redistributed").
  - Drop the header's SourceLine (the representation block carries it).
- **Lane:** B.

**P2-8. Bills list titles are sans; the same titles on Today are serif.**

- **Frames:** `iphone/p3c_p3c-iphone/11-bills-list.png` beside `p3a_iphone-today/01-today-bills.png`.
- **Breaks:**
  - principle 7 (serif speaks for the record: bill titles are the record's words);
  - one row anatomy (BillRow).
- **Fix (`features/bills/BillsList.tsx`):**
  - Draw rows with Today's BillFeed anatomy: StatusLabel and date, serif `subheading` title, portfolio.
  - Better, extract one `BillRow` into `design/rows.tsx` (lane D) and use it in both places.
- **Lanes:** C (D for the shared row).

**P2-9. Bill: a lapsed bill's last stage is "Other", and division questions open with the presiding officer.**

- **Frames:**
  - `iphone/p3c_p3c-iphone/14-bill-sponsor.png` (How it moved: "Introduced 13 Feb 2023 … Other 5 Sep 2023"; AX5 `13-bill-divisions.png` "Other · 5 Sep 2023");
  - `22-r7534-division-question.png` (the question opens with the presiding officer's name and procedural words).
- **Breaks:** principle 8 (titles from fields); D5.
- **Fix:**
  - **App (`features/bills/BillDetail.tsx`, the How it moved ruler):** when the recorded stage is "Other" and the bill's status is a terminal one (Lapsed, Withdrawn, Negatived), label the last stop with the status word.
  - **Data:** lane 2D (`design/p2d-data`, not merged) strips the run-in speaker and writes stage titles. Schedule its merge.
- **Lane:** C, plus a data ticket.

**P2-10. Division history: every row titled by its bill, and outcomes in plain text.**

- **Frames:** `iphone/p3c_p3c-iphone/15-division-history.png` (four consecutive rows titled "Australian Security Intelligence Organisation Amendment Bill (No. 2) 2025"); `ipad/p3c_p3c-ipad/15-division-history.png` (eight).
- **Breaks:**
  - principle 8;
  - principle 3;
  - StatusLabel ("Negatived, 12 ayes, 27 noes" here, where the bill page uses the Negatived label).
- **Fix (`features/directories/DivisionHistory.tsx`):**
  - Title each row by its stage ("Limitation of debate"), with the StatusLabel and count beside it, and "Senate · 20 Aug 2026" as meta.
  - Group consecutive divisions of one bill under one bill line, a link row to the bill.
- **Lane:** A.

**P2-11. Search Briefs: two Machine-written pills, and each result's source line contradicts its date.**

- **Frames:** `iphone/p3d_iphone-18-search-passages/19-search-briefs.png` (one pill above "Summarise these records", another below it); `18b-search-result-row.png` ("Speech · 6 Mar 2023", then "Date not published · OPAX public record search").
- **Breaks:**
  - MachineLabel (once per machine-written block);
  - principle 4 (a result's source is the record's source, dated).
- **Fix (`features/search/Results.tsx`, l. 277 / 311 / 421):**
  - In Briefs, one pill at the head of the list ("Briefs are machine-written"), with no pill on the Summarise row until a summary exists.
  - Each result's SourceLine names its original ("Hansard · 6 Mar 2023"), falling back to the catalog name only when the record has no source.
- **Lane:** A.

**P2-12. People directory: ⓘ and a SourceLine on the same block.**

- **Frame:** `iphone/p5_reader-17-24-30/30-directory.png` ("1,090 parliamentarians · Sitting first, then most speeches ⓘ", then a SourceLine).
- **Breaks:** principle 4 (SourceLine "don't use alongside a separate ⓘ").
- **Fix (`features/directories/DirectoryScreen.tsx` l. 413–430, `features/CatalogState.tsx`):**
  - The ⓘ's notes move into the SourceLine's `notes`.
  - `StaleNotice` becomes the SourceLine's `saved` state.
  - `AsAtLine` goes.
- **Lane:** A.

**P2-13. Leads: two display figures and a caveat on every card, and the lead page restates itself.**

- **Frames:**
  - `iphone/p4c_iphone-18-leads/18-leads-p1.png`, `-p2` (masked);
  - `p4c_iphone-18-lead/18-lead-p2.png` ("The lead and its caveats" repeats the kind line, title, sentence and figures already at the top).
- **Breaks:**
  - the Leads spec ("title, one figure, one sentence and Evidence (n)");
  - principle 3;
  - principle 4 (caveats go in the sheet, said once on the page).
- **Fix (`features/leads/*`, `LeadDetail.tsx`):**
  - **Cards:** one figure (the subject's), one sentence, "Evidence (n) ›". Drop the per-card "Matching names are not verified…" and "This share describes available records only…" lines (they stay in the page's About sheet and the card sheet).
  - **Lead page:** retitle "The lead and its caveats" to "How this lead was found", and keep only the method and the caveats, not the restated claim.
- **Lane:** C.

**P2-14. Topic pages label parties with uppercase codes.**

- **Frame:** `iphone2/p4b_p5-explore-iphone/39c-topic.png` ("● IND 129 speeches", "● ALP 41 speeches").
- **Breaks:** PartyLabel (dot plus the party's name; short names only in dense tables); D6 (no uppercase labels).
- **Fix (`features/reports/TopicPage.tsx` ~l. 70):** map the export's codes through `design/party.ts` to names and draw `PartyLabel`.
- **Lane:** C.

**P2-15. Grant allocation asks for a raw state code.**

- **Frame:** `iphone2/p4a_p5-money-iphone/16n-allocation.png` ("State or territory code (blank for all)" as a free-text field).
- **Breaks:** choosing a control (one selection among peers is a chip set); plain language.
- **Fix (`features/money-public/Allocation.tsx`):** use `ChoiceChips` with All, NSW, Vic, Qld, WA, SA, Tas, ACT and NT.
- **Lane:** C.

**P2-16. About: three near-identical destinations.**

- **Frame:** `iphone/p4d_iphone-32-about/32-about-p2.png` ("Sources and licences", "Sources & coverage", "Methods and source terms" in one section; "&" and "and" mixed).
- **Breaks:** principle 10 (links say where they go once); naming.
- **Fix (`features/About.tsx`):**
  - Keep "Sources and licences" (the app screen) and one "Methods (opax.com.au) ↗".
  - Fold coverage into the Coverage block above.
- **Lane:** C.

**P2-17. Today bill rows give the sponsor's party as a bare code.**

- **Frames:** `ipad/p3a_ipad-today/01-today-feeds.png` (sponsor and party code, e.g. "· JLN"); `ax5/p3a_iphone-ax5-today/01-today-declared.png` ("· Nationals" with no dot).
- **Breaks:** PartyLabel; principle 1 (party appears as a dot plus a name).
- **Fix (`features/today/BillFeed.tsx:26`):** draw the sponsor line as the name plus `PartyLabel nested`, mapping codes through `design/party.ts`.
- **Lane:** C.

### P3: polish

**P3-1. Your MP chooser: a helper line repeats the field's label.**

- **Frame:** `iphone/p3b_iphone-02-your-mp/02-your-mp-chooser.png`. "Search by electorate or member name." sits, with a magnifier, under the empty field labelled "Electorate or member's name".
- **Fix:** remove it (`features/YourMP.tsx`, `electorate-map/LocationSuggestion.tsx`).
- **Lane:** B.

**P3-2. "See all" doesn't say what.**

- **Frames:** `03-your-mp-chosen.png` and `10-electorate.png` (Grants in this seat: "See all", then "Public money").
- **Fix:** "All 92 grants in Grayndler ›"; keep "Public money ›".
- **Lane:** B.

**P3-3. Money display figures take the accent on some screens and not others.**

- **Frames:**
  - green: grants (`03-your-mp-chosen.png`), agency (`16k-agency.png`), party money record (`29h-money-node-party.png`);
  - ink: pay and expenses (`07-profile-expenses.png`), and the party page's receipts (`09-party.png`, the same $1.12bn the money record draws green).
- **Rule:** principle 1 ("the block's one display figure may take the accent").
- **Fix:** money blocks' figures use `moneyInk` everywhere (`people/FinancialBlocks.tsx`, `Party.tsx`).
- **Lanes:** B (C for any money-public stragglers).

**P3-4. Profile: "Declared ties" is an empty block with a nameless source line.**

- **Frame:** `08-profile-interests.png` ("No declared organisation ties are held in this register file.", then "Updated 14 Aug 2026" with no source name).
- **Fix:** fold it into Declared interests as one line, and drop its SourceLine (`features/Person.tsx`).
- **Lane:** B.

**P3-5. Electorate history copy.**

- **Frame:** `10-electorate-p3.png`.
- **What is drawn:**
  - "2 Mar 1996 to end not recorded; observed 9 Sep 2026";
  - a roster name in capitals.
- **Fix:**
  - "Since 2 Mar 1996 (current at 9 Sep 2026)";
  - title-case roster names at render (`directories/ElectorateHistory.tsx`).
- **Lane:** B.

**P3-6. Ask: small extras.**

- **Frames:** `21-ask-idle.png`, `40-ask-consent.png`.
- **What is drawn:**
  - "Your conversations 0 ›" leads to an empty list;
  - the consent sheet has both ✕ and "Not now";
  - one sample question ("Who takes the most money from the gambling lobby?") frames a judgement.
- **Fix:**
  - Hide the row at 0.
  - Keep "Not now" and drop the ✕ (swipe still dismisses).
  - Rephrase the sample in evidence-first terms ("Who has received the most from gambling industry donors?").
  - Files: `ask/AskScreen.tsx`, the consent sheet in `ask/`.
- **Lane:** A.

**P3-7. Two external-link glyphs.**

- **What is drawn:** a compass-in-circle on rows (`02-your-mp-chooser.png` "Check your electorate with the AEC", `40-ask-consent.png` "Privacy", the grant rows in `16d-program.png`), and ↗-in-square in source sheets.
- **Fix:** one glyph (↗) in `design/rows.tsx` and `design/source.tsx`.
- **Lane:** D.

**P3-8. Sheet "Done" drawn two ways.**

- **What is drawn:** a navy filled pill on the Account sheet (`31-account.png`) and the Money record sheet (`29h-money-node-party.png`); plain text in every other sheet.
- **Fix:** plain text "Done" everywhere (the shared sheet header in `design/`).
- **Lane:** D.

**P3-9. List screens put their SourceLine at the top.**

- **Frames:** `19-declarations-p1.png`, `16j-agencies.png`, `16o-connections.png`; every other block puts it at the foot.
- **Fix:** move it under the list's first page, or into the count line's sheet (`declarations/*`, `money-public/*`).
- **Lane:** C.

**P3-10. Declarations: Today clamps rows the feed shows in full, and repeats a name in consecutive rows.**

- **Frames:** `01-today-declared.png`, `19-declarations-p1.png`.
- **Fix:**
  - Replace the `numberOfLines` clamp with a `Disclosure` (`today/DeclarationRow.tsx:140`).
  - Group consecutive declarations by one person under one PersonRow.
- **Lane:** C.

**P3-11. The tour's Search scene shows an old control.**

- **Frame:** `35-tour-page-5.png` (a "⌄ Kind: People" pill; the real screen has a Kind row).
- **Fix:** update the scene in `onboarding/scenes.tsx` / `padScenes.tsx` after lane A's P1-1 lands, so it matches the final Search.
- **Lane:** C (after A).

**P3-12. Copy and empty states.**

- **What is drawn:**
  - "Refresh suggestions" on Search idle with no suggestions shown (`16-search-empty.png`);
  - a topic listed with "0 speeches labelled · 0.0%" (`39-topics.png`);
  - "‹ July / Next month ›" pagers (`16g-largest.png`);
  - "1998 to 2027" on the money map (a financial year read as a future year);
  - ISO dates in program notes (`16e-program-notes-sheet.png`);
  - "Open the bill home" (`12b-bill-more-menu.png`);
  - "...." after truncated passages (`18b-search-result-row.png`).
- **Fix:**
  - Hide Refresh until suggestions show.
  - Hide 0-speech topics, or list them under "Not yet labelled".
  - "‹ July · September ›".
  - "1998–99 to 2026–27".
  - `shortDate` in notes.
  - "Open on the Parliament website".
  - One ellipsis.
- **Lanes:** A (search), C (the rest).

**P3-13. Report section headings run to five lines.**

- **Frame:** `28d-report-section.png` (a 35-word question set in the `heading` role).
- **Fix:** headings take the section's short name; the question becomes its first sentence (`reports/*`).
- **Lane:** C.

## AX5

AX5 held up well:

- word-safe text everywhere;
- the figure strip (fixed in `4ca3ea2ba`) draws all three figures;
- rows stack;
- buttons stretch and read from the leading edge;
- Today's edition now starts on the first screen.

The remaining problems are about the first screen.

**P2-18. The title role scales without a cap.**

- **Frames:**
  - `ax5/p3c_p3c-iphone-ax5/12-bill-top.png` (status, date and six lines of title fill the first screen; the meta and actions are on the second);
  - `ax5/p3b_iphone-ax5-04-profile/04-profile-top.png`;
  - `ax5/p4b_p4b-iphone-ax5/28-report.png`.
- **Rule:** iOS large titles scale far less than body text. Pass 1's non-negotiable is "AX5 word-safe", not "titles at 3.57×".
- **Fix (`design/text.tsx`, the word-safe `Text`):** cap the `title` role at the AX2 multiplier (≈2.0×, scaling `fontSize` per the build 3 rule, since RN's text cache ignores `maxFontSizeMultiplier`). Headings and body stay uncapped.
- **Lane:** D.

**P2-19. List screens put five or six controls before the first row.**

- **Frames:** `ax5/p5_ax5-search/11-bills-list.png`, `15-division-history.png`, `18-search-passages.png`, `ax5/p4c_iphone-ax5-35-declarations/*`. Each shows label, field, Filters, a count line and a SourceLine, then the list.
- **Fix:**
  - At accessibility sizes, drop the field's visible label (the placeholder and accessibility label carry it).
  - Put Filters in the count line.
  - Move the SourceLine to the list's foot (as P3-9).
  - Files: `bills/BillsList.tsx` (C), `directories/DivisionHistory.tsx` and `Search.tsx` (A, together with P1-1), `declarations/*` (C).
- **Lanes:** A, C.

**P2-20. Your MP chooser: the privacy paragraph comes before the field.**

- **Frames:** `ax5/p3b_iphone-ax5-03-your-mp/02-your-mp-chooser-top.png`. At AX5, "Use my location" and the paragraph fill the first screen; the field (the main task) is on the second.
- **Fix (`features/YourMP.tsx`):**
  - Order: the field, then "Use my location" with its privacy sentence below the button.
  - Shorten the sentence to one line at standard size ("Used once on this iPhone; not sent or saved"), keeping the full text in its info sheet.
- **Lane:** B.

**P3-14. The party dot and the count line's share glyph don't scale.**

- **Frames:**
  - `ax5/.../04-profile-top.png`, `09-party.png` (a 10 pt dot beside about 30 pt text);
  - `18-search-passages.png` (the share glyph next to "Relevance ⌄" stays 16 pt).
- **Fix:**
  - The `PartyLabel` dot scales with text up to 16 pt (`design/people.tsx`).
  - The share moves into ⋯ (P1-1), so the glyph goes.
- **Lanes:** D, A.

**P3-15. Money map: the meta line pushes the map to the screen's foot.**

- **Frame:** `ax5/p4a_p4a-iphone-ax5/29-money-map.png`.
- **Fix:** at AX sizes, put the meta line under the map, or give the canvas a minimum of half the screen height (`features/money/*`).
- **Lane:** C.

## iPad

Pass 4E's fixes hold:

- division history no longer runs under the sidebar (`ipad/p3c_p3c-ipad/15-division-history.png`);
- Your MP has a readable column;
- the money map caps its control's width and fills more of the canvas;
- Ask's answer-with-sources split is good;
- the welcome tour's columns keep their "Example" label.

**P2-21. Split panes still open empty.**

- **Frames:**
  - `ipad/p3c_p3c-ipad/11-bills-list.png` ("No bill selected");
  - `ipad/p4e_ipad-3-search/18-search-passages.png` ("Nothing open" beside a narrow result column);
  - `ipad/p4e_ipad-8-directory/30-directory.png` ("No parliamentarian selected");
  - `ipad/p3d_ipad-23-ask-sources/21-ask-idle.png` ("Sources appear here").

  The quiet `EmptyState size="pane"` landed, but pass 1 asked for the pane to be used.
- **Fix:**
  - **Bills and directory:** open the first row in landscape (selection, not navigation; VoiceOver focus stays on the list).
  - **Search:** results take the full width until one is opened.
  - **Ask idle:** the pane lists Your conversations, or the sample questions.
  - Files: `bills/BillsList.tsx` (C), `Search.tsx`, `directories/DirectoryScreen.tsx`, `ask/AskScreen.tsx` (A). Any change to `design/split.tsx` goes through lane D.
- **Lanes:** A, C.

**P2-22. Profile grid: holes, and a figure strip 1,000 pt wide.**

- **Frame:** `ipad/p3b_ipad-04-profile/04-profile-top.png`.
- **What is drawn:**
  - The two-column section grid pairs Party receipts with "What they talk about" (one row), leaving a half-screen gap.
  - The three header figures spread across the full detail width.
- **Fix:**
  - Mostly falls out of P2-1 and P2-2 (no one-row sections).
  - Cap the figure strip at the readable width (`ReadableColumn`).
  - Files: `features/Person.tsx`, `people/Sections.tsx`.
- **Lane:** B.

**P3-16. Your MP: the large title sits outside the readable column.**

- **Frames:** `ipad/p3b_ipad-02-your-mp/02-your-mp-chooser.png`, `03-your-mp-chosen.png`. The title's left edge is about 80 pt left of the content's.
- **Fix:** render the header inside the same `ReadableColumn` (`features/YourMP.tsx`).
- **Lane:** B.

**P3-17. Money map: "Fit map" sits in the far corner.**

- **Frame:** `ipad/p4a_p4a-ipad/29-money-map.png`.
- **Fix:** anchor it to the canvas's top right, beside the view control (`features/money/*`).
- **Lane:** C.

## Top 10

1. **P1-1** Search: nine controls before the first result; concept 4 unmet.
2. **P1-2** Records reader never migrated: kicker, View original, drawn Cite and Copy link, icon-tile speaker.
3. **P1-3** Bill header: ⋯ wraps alone; the navy primary is a navigation.
4. **P2-4** Source sheets: "As at / As at …" and one date for many sources (every screen).
5. **P2-5** Source names with ISO dates and "tcp" (Your MP and electorate).
6. **P2-1** Profile: three one-row sections.
7. **P1-4** Profile portrait's party-coloured ring.
8. **P2-21** iPad split panes open empty.
9. **P2-18** AX5 titles fill the first screen.
10. **P2-10** Division history rows titled by their bill.

## Fix lanes

Four lanes, each owning a disjoint file set. Lane D is small and goes first, because `src/design` changes only in a shared-component lane (pass 1, section 7); A to C take its helpers as they land, and file requests rather than edit `src/design`. P3 items are each lane's tail.

### Lane D: shared components (about 1 h, first)

- **Owns:** `mobile/src/design/*` (`source.tsx`, `text.tsx`, `people.tsx`, `rows.tsx`, `format.ts`, the sheet header, `split.tsx` if A or C need it).
- **Items:**
  - P2-4 (the sheet's "As at", per-source dates, licence link);
  - the `sourceLabel()` half of P2-5;
  - the `BillRow` for P2-8;
  - P2-18 (title cap);
  - P3-7 (one external glyph);
  - P3-8 (sheet Done);
  - the dot half of P3-14;
  - retire `Portrait ring` after P1-4.
- **Gates:** `npm run qa`; one AX5 screenshot each of bill top and profile top; one sheet at Large.

### Lane A: Search, Ask, records and directories (about 2 h)

- **Owns:**
  - `features/Search.tsx`, `features/search/*`;
  - `features/ask/*`;
  - `features/records/*`;
  - `features/directories/DivisionHistory.tsx`, `DirectoryScreen.tsx`;
  - `features/CatalogState.tsx`, `features/RecordStatus.tsx`.
- **Items:**
  - P1-1;
  - P1-2;
  - P2-10;
  - P2-11;
  - P2-12;
  - the search, division-history and Ask halves of P2-19 and P2-21;
  - tail: P3-6, the share half of P3-14, the search parts of P3-12.
- **Cut line:** P2-21's Ask idle pane can move to a follow-up.
- **Gates:**
  - `npm run qa`;
  - journeys 02, 12, 30, 31, 32, 34, 45 and 58 at Large on the 17 Pro;
  - re-shoot with this sweep's flows: `groups/iphone.txt` lines for `p3d_*`, `p5_reader-*`, `p5_ask-58-consent`, and `p5/ax5-search.yaml`.

### Lane B: profiles and places (about 2 h)

- **Owns:**
  - `features/Person.tsx`, `features/people/*`;
  - `features/Party.tsx`, `features/party/*`;
  - `features/Electorate.tsx`, `features/electorate-map/*`;
  - `features/YourMP.tsx`, `features/your-mp/*`;
  - `features/directories/ElectorateHistory.tsx`.
- **Items:**
  - P1-4;
  - P2-1;
  - P2-2 (after the orchestrator's OK);
  - P2-6;
  - P2-7;
  - P2-20;
  - P2-22;
  - the profile, Your MP and electorate callers of P2-5;
  - tail: P3-1, P3-2, P3-3, P3-4, P3-5, P3-16.
- **Gates:**
  - `npm run qa`;
  - journeys 03, 07, 08, 09, 25, 36 and 37;
  - re-shoot `p3b_*` on all three devices (`groups/iphone.txt`, `ax5.txt`, `ipad.txt`).

### Lane C: bills, Today, money, feeds, reports and edges (about 2 h)

- **Owns:**
  - `features/bills/*`;
  - `features/Today.tsx`, `features/today/*`;
  - `features/money/*`, `features/money-public/*`;
  - `features/leads/*`, `features/declarations/*`;
  - `features/reports/*`, `features/explore/*`;
  - `features/About.tsx`;
  - `src/onboarding/*`.
- **Items:**
  - P1-3;
  - P2-3;
  - P2-8;
  - P2-9 (app half);
  - P2-13;
  - P2-14;
  - P2-15;
  - P2-16;
  - P2-17;
  - the bills and declarations halves of P2-19;
  - the bills half of P2-21;
  - the money-public callers of P2-5;
  - tail: P3-9, P3-10, P3-11 (after lane A), P3-12, P3-13, P3-15, P3-17.
- **Cut line:** P2-15, P2-16 and the P3 tail can move to a follow-up.
- **Gates:**
  - `npm run qa`;
  - journeys 10, 11, 13, 23, 27, 38, 42, 46 and 55;
  - bill top re-shot at Large on the 17 Pro **and the 16e**;
  - re-shoot `p3a_*`, `p3c_*`, `p4a_*`, `p4b_*`, `p4c_*`.

### Shared seams to watch

- **Lane B and lane C:**
  - B owns `people/FinancialBlocks.tsx` (P3-3); C owns the money-public figures. Use the same `moneyInk` rule.
  - P2-2's caveat stays beside the receipts block wherever B moves it.
- **Lane A and lane C:** P3-11 (the tour's Search scene) waits for A's P1-1.
- **Both directory screens:** `directories/` is split by file. A owns `DivisionHistory.tsx` and `DirectoryScreen.tsx`; B owns `ElectorateHistory.tsx`.

## 1.0 notes

Build 34 is cut, and every item above is a 1.0.1 candidate. **No design finding is a 1.0 blocker:** nothing here breaks a review guideline, hides data, or misattributes.

Two items to confirm for 1.0:

- **The neutral evaluative reply (risk).**
  - The app has no client handling and no fixture for it, and the Worker change (`web/ask-citations`) is not on `main`.
  - If that change deploys while 1.0 is live, the app will draw its neutral sentence as an ordinary machine-written answer. Its "ways to compare records" reach the app only if the Worker sends them as follow-ups, which the app shows under "Ask next".
  - Before that Worker change deploys: add an evaluative reply to `scripts/ask-fixture.ts`, and run journey 30 plus one capture on the reference device.
- **Talk's age line.** It reads "Accounts and voice are for people aged 16 and over", while the store rating is 13+. These are consistent if intended (Community is hidden to keep 13+), but the App Store notes should say the same thing.

Checked and fine for 1.0:

- the e2e-only "Design workbench" row is gated out of release (`account/AccountLinks.tsx`);
- dark mode stays light;
- Ask consent and "Report this answer" draw cleanly on iPhone, at AX5 and on iPad;
- the Machine-written pill appears once per answer.

**Wait for 1.0.1:** all of P1 to P3. P1-3 and P1-4 are each under an hour and could ride a 1.0.1 fast-follow with the AX5 title cap (P2-18).

## Notes for the orchestrator

- **Data tickets:**
  - merge lane 2D (`design/p2d-data`: division stage titles, the run-in speaker strip) for P2-9;
  - source-name labels in the electorate release manifest (P2-5) if they are exported, not composed in the app.
- **Decision to confirm:** P2-2 (profile block order). The rest are defaults under "full speed".
- **Captures stay private.**
  - Portraits were never drawn, and donor names are pixelated in the 21 frames listed in `MANIFEST.md`.
  - Anything copied into the repo as an after-pair still needs the baseline's masking check.
- **After shots:** the harness in `mobile/private/design-p5-app/` reruns per group (`run-device.sh iphone|ipad <groups>`). A rerun skips any flow with a `.done` marker, so delete those to re-shoot.
