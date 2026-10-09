# Build 32 design baseline (curated)

The "before" set for design passes 3 and 4, captured 9–10 October 2026 from `ios/app` at `b7e436b1` (TestFlight build 32).

**Builds:** native e2e builds against the fixture server only. Captured records are pinned public data; Ask answers and citations are fixture responses. No production requests, emails, analytics, voice sessions or speech.

**Devices:**
- iPhone 17 Pro, iOS 26.5: default text and AX5;
- OPAX QA iPad 13, iOS 26.5: full screen, landscape plus selected portrait screens;
- Android emulator `OPAX_API34`: default font scale.

**What is committed here.** 26 of the 98 captures: the screens the review cites, downscaled to 900 px on the long side (3.8 MB).
- Official MP portraits (CC BY-NC-ND) are drawn as OPAX's blank circle in three files: `iphone/04-profile-top`, `iphone/03-your-mp-chosen` and `ipad/04-profile-top`.
- The full set (1,200 px, with its original manifest) stays local and untracked in `../baseline-full/`, which is git-ignored.
- Later passes re-capture the same file names, so before and after pair one to one.

**Fixture limits:**
- Zali Steggall's sponsor portrait is not pinned, so it shows the blank fallback.
- The records reader shows a labelled synthetic layout fixture.
- No standalone Settings screen exists in build 32.

**Known baseline layout issue:** iPad landscape division history runs underneath the persistent sidebar (`ipad/15-division-history`).

| File | Screen | State |
| --- | --- | --- |
| `iphone/01-today.png` | Today | front page |
| `iphone/03-your-mp-chosen.png` | Your MP | Grayndler selected |
| `iphone/04-profile-top.png` | MP profile | Anthony Albanese; top |
| `iphone/05-profile-votes.png` | MP profile | votes |
| `iphone/08-profile-interests.png` | MP profile | interests |
| `iphone/09-party.png` | Party | Labor; top |
| `iphone/10-electorate.png` | Electorate | Grayndler; top |
| `iphone/11-bills-list.png` | Bills | list |
| `iphone/12-bill-top.png` | Bill | Stop PEP11 and Protect Our Coast Bill 2023; top |
| `iphone/13-bill-divisions.png` | Bill | first division |
| `iphone/15-division-history.png` | Division history | loaded |
| `iphone/18-search-passages.png` | Search | Don Farrell; Records; Passages |
| `iphone/20-search-kind-sheet.png` | Search | kind sheet |
| `iphone/22-ask-answer.png` | Ask | fixture answer |
| `iphone/27-reports-list.png` | Reports | list |
| `iphone/28-report.png` | Report | Gambling; top |
| `iphone-ax5/01-today.png` | Today | front page, AX5 |
| `iphone-ax5/07-profile-expenses.png` | MP profile | expenses, AX5 |
| `ipad/01-today.png` | Today | landscape |
| `ipad/02-your-mp-chooser.png` | Your MP | no electorate; landscape |
| `ipad/04-profile-top.png` | MP profile | top; landscape |
| `ipad/15-division-history.png` | Division history | landscape (clipped under the sidebar) |
| `ipad/18-search-passages.png` | Search | Passages; landscape |
| `ipad/29-money-map.png` | Money map | landscape |
| `android/01-today.png` | Today | front page |
| `android/22-ask-answer.png` | Ask | fixture answer |
