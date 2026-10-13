# Web uplift: the fix round after the review

13 Oct 2026, lane `web/design-system`. The review is in `.ops/codex-runs/review-web-design-system.last.md`; its verdict was CHANGES, with one P1 and several P2s. This round fixes the P1, every P2 the brief listed, the cheap P3s and two P2s the brief did not list. `origin/main` is merged in first, at `c41740e8e`: perf-cache, the emu loader, sponsor links and the money-map fix.

## P1: row links

Row title, name and byline links keep the bronze underline again; a phone never hovers, so an underline shown only on hover never shows there. A row with one of those links is tappable across its whole height, the way a card is:
- the link's `::after` covers the row;
- any other control in the row sits above it (a meta link, a disclosure, a source link);
- the row selector is wrapped in `:where()`, so page rules still win.

Search results and report sources are left out, so the record text in them stays selectable. Their titles reach 44 on their own.

**Tap height at 390.** Measured with `elementFromPoint`, scanning each row's link column. Live figures are from the review.

| Where | Live | Branch before | Now (tap / row) |
|---|---|---:|---|
| Agency suppliers | full row | 20 | 75 / 75 |
| Supplier lists | full row | 20 | 86 / 91 |
| Estimates agencies | full row | 20 | 176 / 222 (the rest is the awards disclosure, which keeps its own tap) |
| Sitting week titles | full row | 23 | 73 / 74 (a row with an estimates link: 77 / 122, the link keeps its own) |
| Audit list | 29 | 23 | 197 / 198 |
| Electorate members | — | 26 | 69 / 68 |
| Instruments list | — | 46 | 193 / 194 |
| Segmented buttons (A–Z, All/Then/Now, Newest/Oldest, Flows/By donor) | 44+ | 40 | 45 (34 drawn) |

## P2s

- **Long reading:** about, methods, privacy, support and expenses are back at 1.7 leading.
- **Ledes:** `.ui-lede` is in the body's ink, so it is never quieter than the text under it.
- **Segmented controls:** the hit area reaches 44 whatever the button draws.
- **The checked filter toggle:** the shared ring goes round the pill, not a bronze square on navy round the checkbox.
- **Filter pills keep their key:** "Year: 2019", "Party: Labor". `.ui-filter-key` sits inside the pill, and a chosen value adds the control line's edge. They are used on /instruments, /audit, /declared and every directory, bills included.
- **Electorate census:** `ui-kv[data-variant="ledger"]` gives ruled rows with the figure right, in the strong role.
- **Search:** the meta line flows as one sentence.
- **Topic page:**
  - the arc year is the 24px bronze serif again;
  - the stale phone indent is gone;
  - "Show 30 more" sits under the count;
  - the tide's phone rules now follow the base rules.
- **Money journeys:**
  - the map grows with the rail, so nothing hangs below the plate;
  - the journey's name is the subheading and the step is the heading, at every width.
- **Report:**
  - citation marks are true superscripts at no line height;
  - the era spine and its bronze notches are back.
- **Receipts cards:** the figure is back at the heading role.
- **Grants:** narrow year bars take a one-decimal figure rounded from the amount ("$22.2bn") instead of losing it at 820.
- **Ballot:** the list shows six whole rows, then scrolls.
- **Quiz:** decks wrap at 11rem.
- **Explore cards (the engraving register):** each card's glyph is back, in hairline bronze on a hairline ring, with its action word (Play, Open, Build a practice ballot) at the foot.
- **Not in the brief's list, also fixed:**
  - directory rows stack their figures under the name up to 1000px;
  - each estimates committee shows its count on a line of its own.

## P3s done

- The person page's pay note is 13px (it was 10.8).
- Dead front-page leftovers:
  - `setFrontPageHidden()` and its calls;
  - `.front-map` and `.home-tasks`;
  - `statemap.js`;
  - the unused `entry-modes` class.
- The ledger harness loads `style.css`.
- The section-note rule sits with the components.

## P3s left (listed for later)

- The page head to first section step (48/64/80) pushes bill's "In short" below the fold at 1440; the reports and sitting heads also sit far from their content.
- Wrapping nits:
  - "record" alone on a line in the ask/search h1 at 390;
  - estimates' dash starting a line;
  - instrument titles breaking mid-token;
  - the about "On this page" list;
  - the about-table coverage column;
  - electorate directory meta at 820;
  - the supplier figure column;
  - agency contract rows;
  - grants donor cells;
  - connections search full width at 820;
  - quiz dialog fine print;
  - the discover list.
- `details summary` padding reaching the source-line toggle.
- `.bill-tag a`: the rule is intact, but the sampled bill's tag line holds no link to check it against.
- The committed graph chunk `chunks/evidence-DDZG5CJH.js` still carries old markup. It goes with the next graph build, which is not this lane's.
- Other lanes' ground (for the nav lane):
  - the codemod's edit to the masthead's bare `header` rule text;
  - `community.html` tabs (`.area-nav` → `ui-tabs`);
  - the masthead is 8px taller under the new tokens (no overlap from 820 to 1439, per the review).

## Shots

All in `portal/private/web-design-system/`:
- `after/`: the branch, re-shot for every route at 390/820/1440 after these fixes, plus `money-journey` and `money-journey-step` (`/money?journey=industry&step=3&focus=finance`).
- `compare/`: 244 before | after sheets against live.
- `after-dialogs/`: the ballot (390) and quiz (820) dialogs, and the checked toggle's focus ring (390), which the sweep cannot open.
