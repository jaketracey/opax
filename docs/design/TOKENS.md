# OPAX design tokens

One source, two platforms. [`design-tokens.json`](design-tokens.json) holds every colour, type role, space step, radius, border, shadow, duration and size that the web and the app draw. The rules for using them are in [DESIGN-REVIEW-2026-10.md](DESIGN-REVIEW-2026-10.md), section 2; this page covers the pipeline and the names.

## Pipeline

```sh
node scripts/build_tokens.mjs            # write every target in this checkout
node scripts/build_tokens.mjs --check    # exit 1 if any target is stale
node scripts/build_tokens.mjs --only app # or web, or docs
```

| Target | Written from the JSON | Read by |
|---|---|---|
| `portal/public/tokens.css` | `:root` custom properties, then the deprecated names | Pages and modules that need the tokens without `style.css` |
| `portal/public/style.css`, the `tokens:begin` / `tokens:end` region | The same rules as `tokens.css`, inlined so a page needs no second request | Every page |
| `mobile/src/design/tokens.generated.ts` | Palettes for four themes, party colours, type roles, rhythm, radii, motion, sizes, contrast rules | `palette.ts` and `tokens.ts`, which re-export it |
| This page, the `tokens:begin` / `tokens:end` region | The role and alias tables below | People |

- **Web:** `npm run build:tokens` runs the generator, and `npm run build:search` (which the deploy and the GitHub deploy job run first) runs it before the catalogs. `npm run check` runs `--check`. `test/design-tokens.test.mjs` fails while a generated file is stale.
- **App:** `npm run tokens` runs the generator; `npm run qa` checks it before typecheck, and `tests/design-tokens.test.ts` fails while `tokens.generated.ts` is stale.
- A checkout without `mobile/` (`main`) skips the app target; one without `portal/` skips the web target.

## Rules the generator keeps

- **Same names, same values.** Every colour role keeps today's hex value. Web names stay as they were (`--paper-raised`, `--party-alp`); a role's web name is `--` plus its app name in kebab case unless the JSON gives one.
- **Old names keep working for one release.** An *alias* has its replacement's value and points at it (`--line: var(--divider-subtle)`, `light.line`). A *legacy value* keeps the old look until a later pass moves its uses (for example `--space-3`). All deprecated app text roles render with their canonical replacement metrics. Both carry a deprecation comment: `/* deprecated: use ... */` in CSS, `@deprecated` in TypeScript, so editors strike them through.
- **Dark values exist but are not drawn.** The web sets `color-scheme: light` and the app is light-only (decision 2). Every role carries a dark value held to the same contrast rules, so a dark theme is wiring, not a design pass. The generated app file exports `dark` and `darkHighContrast`; `tokens.ts` resolves the real dark and high-contrast dark values. `OPAX_APPEARANCE=automatic` enables them in non-production capture builds only.
- **Increase Contrast** is live in the app (`lightHighContrast`). The web's `prefers-contrast: more` block is ready in the source and is written only when `themes.web.prefersContrast` is true.
- **Raw colours are counted.** `portal/test/design-tokens.test.mjs` counts hex colour literals in web sources outside the generated tokens, and `mobile/tests/design-tokens.test.ts` counts colour literals in app sources outside `tokens.generated.ts`. Each file has a baseline; a file may go down, never up, and a new file starts at zero. When a pass removes some, lower the baseline in the test so the count cannot creep back.

## Apple-design foundation (F1)

The eighteen roles in the generated table are the current app vocabulary. All earlier names remain deprecated aliases; no alias retains an old app size. Figures use tabular system numerals. `recordTitle` alone caps at the title1 AX2 size, 43pt; other roles scale to AX5. `headingFace` defaults to `system`; `OPAX_HEADING_FACE=serif` selects serif headings in development and e2e builds. Record names and verbatim text always use Merriweather.

`interfaceFonts` resolves sans families to `undefined` on iOS, so `Text` omits `fontFamily` and supplies weight 400, 600 or 700. Android resolves to the bundled Public Sans faces. The existing `fonts` export retains registered font names for the unmodified `useFonts` loader and native chrome callers; consumers needing interface families should use `interfaceFonts` or the text roles. SF handles Bold Text natively; bundled faces step one weight.

Navy is the single tint, including the new `link` text tone. Legacy `bronzeInk` text inputs render navy while screen lanes migrate their names. Bronze palette entries remain for brand artwork. `band*`, `onBand` and `onBandSoft` are edition plate colours; every band is checked in light, dark and both Increase Contrast themes. Static string-only native APIs retain `chrome` as their light fallback; `chromeColours` exposes dynamic values and `useChromeColours()` supplies appearance-aware hex for their migration.

`rhythm.row` is 11, `heading` is 8 and `groupHeader` is 6. The fixed `rhythm.screen` remains the compatibility default; the adaptive lane applies 16 below 414pt, 20 from 414pt and 32 at regular width. `spacing` remains deprecated until its callers migrate. Canonical radii are container 22, tile 18, thumb 10, bar 4, capsule 999 and round 999; sm, md and pill remain aliases. The edition shadow is light-only. Crossfade, launch and latest-launch durations are 150, 240 and 400ms; Reduce Motion callers use zero.

`designFlags` is frozen at module load, defaults all four recommendations to true and accepts boolean overrides from `extra.designFlags` only for development/e2e variants. `OPAX_DESIGN_FLAGS='{"searchTab":false}'` supplies these without editing code. Production ignores capture overrides. Shared wording is in `design/copy.ts`. Reserved star-export modules let later lanes add their public APIs without editing the barrel; `authorisation.ts` remains a direct import.

`deprecated-design-rule.js` exports the deprecated recipe rule and four named warning rules. Per-file AST counts are dated 8 November 2026 and may only fall. `deprecated-recipes.test.ts` runs all five rules with warning severity and fails only for growth. The shared ESLint configuration still needs to register the new named rules, as it is outside this package's ownership.

Host CoreText word-width fixtures for the ten dense screen types are in `text-fit.test.ts`, with Large and AX5 sizes and both heading faces. These are host measurements, not iOS simulator proof. The orchestrator supplies the D1 A/B captures and native margin/radius verification.

## Chamber colours (newcomer build, 14 Nov 2026)

`houseInk` (green) and `senateInk` (red) are the two chambers in their own colours, for a drawing or label that names a chamber: the seat arcs in the app's "Parliament in a minute". They are their own roles so that `moneyInk` keeps meaning money and `danger` keeps meaning an error. Both are promised as AA text on paper, raised and sunken in light, dark and both Increase Contrast themes (5.1:1 or more in light, 7:1 or more in dark). They are never a category ink, a status tone, a link or body text.

## Adding or changing a token

1. Edit `design-tokens.json`. A new colour role needs a light and a dark value; add it to `contrast` if it is text or a boundary.
2. Run `node scripts/build_tokens.mjs` in a checkout that has both `portal/` and `mobile/`, or once on each branch.
3. Run the token tests on both sides. They check the generated files, AA for every promised pair in light, dark and both Increase Contrast themes, and the raw-colour baselines.
4. To retire an old name, move its uses to the replacement, delete it from `deprecated` in the JSON and regenerate.

## Generated tables

<!-- tokens:begin (generated by scripts/build_tokens.mjs) -->

### Colour roles

| Role | Web | App | Light | Dark | Increase Contrast | Use |
|---|---|---|---|---|---|---|
| surface | `--paper` | `paper` | #FAF9F6 | #161915 |  | Page ground. |
| surface | `--paper-raised` | `raised` | #FFFFFF | #20241E |  | Cards, sheets, fields, popovers. |
| surface | `--paper-sunken` | `sunken` | #F1EFE8 | #0E100D |  | Subdued surface: pressed rows, the empty portrait circle, skeleton bars. |
| text | `--ink` | `ink` | #23271F | #ECEAE2 |  | Primary text. |
| text | `--ink-soft` | `inkSoft` | #575C52 | #A9AEA2 | #23271F / #ECEAE2 | Secondary text, metadata, fine print. |
| text | `--ink-faint` | `inkFaint` | #6F7468 | #8A8F84 | #575C52 / #A9AEA2 | Tertiary text on paper and raised only (4.56 and 4.80:1). |
| text | `--on-navy` | `onNavy` | #FFFFFF | #0E1A28 |  | Text and icons on a navy (or danger) fill. |
| text | `--on-navy-soft` | `onNavySoft` | #B7C6D9 | #2A3D53 | #FFFFFF / #0E1A28 | Secondary text on navy. |
| text | `--link` | `link` | #142A43 | #9CB9DB |  | Semantic link tone, always the single navy tint. |
| brand | `--navy` | `navy` | #142A43 | #9CB9DB |  | Structure and the one primary action per view. |
| brand | `--navy-raised` | `navyRaised` | #1D3A5C | #B9CDE6 |  | Pressed and hover on navy. |
| brand | `--navy-wash` | `navyWash` | #E4E6E7 | #25303D | #D3D9DF / #2E3C4C | Secondary button fill; the people accent's wash; the selected row in a split list. |
| brand | `--bronze` | `bronze` | #A0761B | #A87D2A |  | Brand artwork only: mark, icon and launch screen. |
| brand | `--today-dot-bronze` | `todayDotBronze` | #C08F2C | #C08F2C |  | Today's decorative dot map highlight, at 76 percent opacity over a navy base at 23 percent. |
| brand | `--bronze-ink` | `bronzeInk` | #8A5A12 | #D9A84A | #5C4318 / #EBC57F | Brand artwork only: mark, icon and launch screen. |
| brand | `--bronze-wash` | `bronzeWash` | #ECE4D3 (web `rgba(160, 118, 27, 0.16)`) | #332A1B |  | Brand artwork only: mark, icon and launch screen. |
| brand | `--bronze-rule` | none | rgba(160, 118, 27, 0.55) | rgba(217, 168, 74, 0.55) |  | Link underlines on the web: present, not heavy. |
| brand | `--bronze-bright` | `bronzeBright` | #D9A84A | #5E400B |  | Brand artwork only: mark, icon and launch screen. |
| line | `--divider-default` | `dividerDefault` | #B8B4A8 | #4C5047 |  | The top rule of a section; major content boundaries. |
| line | `--divider-subtle` | `dividerSubtle` | #DFDCD2 | #30342D | #B8B4A8 / #4C5047 | Between rows, under subheadings, card outlines. |
| line | `--line-control` | `lineControl` | #8D897B | #7E8378 |  | Field and segmented-control boundaries only (3.33:1). |
| feedback | `--danger` | `danger` | #A4262C | #F08C8E |  | Errors and destructive actions. |
| feedback | `--danger-pressed` | `dangerPressed` | #86191F | #F6AEB0 |  | A pressed destructive fill (the End call button). |
| accent | `--money-ink` | `moneyInk` | #2B6447 | #86C6A0 | #29553D / #A9DDBD | Money: donations, grants, contracts, pay. |
| accent | `--money-wash` | `moneyWash` | #E5EAE5 | #1D2C24 |  | The money tile and header wash. |
| accent | `--votes-ink` | `votesInk` | #3A4C96 | #A9B5F0 | #374684 / #C6CEF8 | Votes: divisions and voting records. |
| accent | `--votes-wash` | `votesWash` | #E7E8EC | #232839 |  | The votes tile and header wash. |
| accent | `--interests-ink` | `interestsInk` | #7B3A63 | #E2A3CA | #72385C / #EFC3DF | Interests: declared interests and registers. |
| accent | `--interests-wash` | `interestsWash` | #EDE6E7 | #33232D |  | The interests tile and header wash. |
| accent | `--bills-ink` | `billsInk` | #1F5F6B | #7FC4D0 | #205158 / #A6DAE3 | Bills: bills, stages, exposure drafts; also the machine-written label. |
| accent | `--bills-wash` | `billsWash` | #E4EAE8 | #1B2D30 |  | The bills tile and header wash. |
| chamber | `--house-ink` | `houseInk` | #3B6E58 | #93C4AE | #2F5A48 / #B3D8C7 | The House of Representatives: its green. |
| chamber | `--senate-ink` | `senateInk` | #A2402E | #EE9B88 | #86321F / #F5BBAE | The Senate: its red. |
| band | `--band-bills` | `bandBills` | #1F5F6B | #1E4A51 | #1E5E69 / #1E4A51 | Edition plate ground. |
| band | `--band-money` | `bandMoney` | #2B6447 | #24472F | #2A6346 / #24472F | Edition plate ground. |
| band | `--band-votes` | `bandVotes` | #3A4C96 | #2F3B70 | #3A4C96 / #2F3B70 | Edition plate ground. |
| band | `--band-interests` | `bandInterests` | #7B3A63 | #5C2C4A | #7B3A63 / #5C2C4A | Edition plate ground. |
| band | `--band-people` | `bandPeople` | #142A43 | #1C3550 | #142A43 / #1C3550 | Edition plate ground. |
| band | `--on-band` | `onBand` | #FFFFFF | #F5F3EC | #FFFFFF / #F5F3EC | Titles and art on edition bands. |
| band | `--on-band-soft` | `onBandSoft` | #E6EBEE | #C9CEC4 | #E6EBEE / #C9CEC4 | Kicker and detail on edition bands. |

### Type roles

Heading face: `system`. iOS interface families are unset; Android uses Public Sans.

| Role | Face | Weight | Size / leading | Dynamic Type | Colour | Tabular |
|---|---|---|---|---|---|---|
| `largeTitle` | heading | 700 | 34 / 41 | largeTitle | ink |  |
| `inlineTitle` | heading | 600 | 17 / 22 | headline | ink |  |
| `pageTitle` | heading | 700 | 28 / 34 | title1 | ink |  |
| `recordTitle` | serif | 700 | 28 / 36 | title1 | ink |  |
| `recordHeading` | serif | 700 | 22 / 30 | title2 | ink |  |
| `sectionTitle` | heading | 700 | 22 / 28 | title2 | ink |  |
| `subsectionTitle` | sans | 600 | 17 / 22 | headline | ink |  |
| `groupHeader` | sans | 400 | 13 / 18 | footnote | inkSoft |  |
| `name` | sans | 600 | 17 / 22 | headline | ink |  |
| `rowRecord` | serif | 700 | 17 / 23 | body | ink |  |
| `recordText` | serif | 400 | 17 / 26 | body | ink |  |
| `body` | sans | 400 | 17 / 22 | body | ink |  |
| `strong` | sans | 600 | 17 / 22 | body | ink |  |
| `secondary` | sans | 400 | 15 / 20 | subheadline | inkSoft |  |
| `footnote` | sans | 400 | 13 / 18 | footnote | inkSoft |  |
| `capsule` | sans | 600 | 12 / 16 | caption1 | inkSoft |  |
| `figure` | sans | 700 | 34 / 41 | largeTitle | ink | yes |
| `tileFigure` | sans | 600 | 22 / 28 | title2 | ink | yes |

40 colour roles in 8 groups; 6 categories, 4 status tones, 16 industry hues, 8 parties (dot + wash); 18 type roles over 7 sizes; 9 rhythm steps; 9 radii (container, tile, thumb, bar, capsule, round, sm, md, pill); 6 durations and 1 curve; 1 shadow.

### Deprecated web names

| Old name | Kind | Use instead | Moving changes |
|---|---|---|---|
| `--line` | alias (same value) | `--divider-subtle` | nothing |
| `--line-strong` | alias (same value) | `--line-control` | nothing |
| `--heading-page` | alias (same value) | `--type-title` | nothing |
| `--heading-section` | legacy value `600 1.4rem/1.35 var(--serif)` | `--type-heading` | 22.4px/1.35 to 22px/1.364 |
| `--heading-subsection` | legacy value `600 1.125rem/1.35 var(--serif)` | `--type-subheading` | line height 1.35 to 1.333 |
| `--heading-tracking` | legacy value `0.005em` | `no letter-spacing` | 0.005em to 0 |
| `--space-1` | alias (same value) | `--space-line` | nothing |
| `--space-2` | legacy value `0.4rem` | `--space-tight or --space-line` | 6.4px to 8px or 4px |
| `--space-3` | legacy value `0.65rem` | `--space-row` | 10.4px (8px under 701px) to 10px |
| `--space-4` | alias (same value) | `--space-block` | nothing |
| `--space-5` | legacy value `1.6rem` | `--space-group` | 25.6px to 24px |
| `--space-6` | legacy value `2.6rem` | `--space-group or --space-section` | 41.6px (32px under 701px) to 24px or 36px |
| `--space-7` | legacy value `4.2rem` | `--space-section` | 67.2px (52px under 701px) to 56px (36px under 701px) |
| `--row-gap` | legacy value `var(--space-3)` | `--space-row` | 10.4px (8px under 701px) to 10px |
| `--sub-gap` | legacy value `var(--space-6)` | `--space-group` | 41.6px (32px under 701px) to 24px |
| `--section-gap` | legacy value `var(--space-7)` | `--space-section` | 67.2px (52px under 701px) to 56px (36px under 701px) |
| `--type-title` | alias (same value) | `--type-record-title` | nothing |
| `--type-display` | alias (same value) | `--type-figure` | nothing |
| `--type-heading` | alias (same value) | `--type-section-title` | nothing |
| `--type-subheading` | alias (same value) | `--type-row-record` | nothing |
| `--type-record` | alias (same value) | `--type-record-text` | nothing |
| `--type-metadata` | alias (same value) | `--type-secondary` | nothing |
| `--type-fine` | alias (same value) | `--type-footnote` | nothing |
| `--type-label` | alias (same value) | `--type-capsule` | nothing |
| `--type-control` | alias (same value) | `--type-strong` | nothing |
| `--type-pad-title` | alias (same value) | `--type-record-title` | nothing |
| `--type-pad-lede` | alias (same value) | `--type-body` | nothing |
| `--type-lede` | alias (same value) | `--type-body` | nothing |
| `--type-caption` | alias (same value) | `--type-footnote` | nothing |
| `--type-figureInline` | alias (same value) | `--type-strong` | nothing |
| `--type-tag` | alias (same value) | `--type-capsule` | nothing |
| `--type-kicker` | alias (same value) | `--type-capsule` | nothing |
| `--type-chip` | alias (same value) | `--type-capsule` | nothing |
| `--type-countdown` | alias (same value) | `--type-strong` | nothing |

### Deprecated app names

| Old name | Kind | Use instead | Moving changes |
|---|---|---|---|
| `light.line` | alias (same value) | `light.dividerSubtle` | nothing |
| `light.lineStrong` | alias (same value) | `light.lineControl` | nothing |
| `accents.places` | alias (same value) | `accents.people` | nothing |
| `radius` | alias (same value) | `radii.sm` | nothing |
| `typeRolesRegular.title` | alias (same value) | `textStyles.recordTitle` | nothing |
| `spacing.s1` | alias (same value) | `rhythm.line` | nothing |
| `spacing.s2` | legacy value `6` | `rhythm.tight or rhythm.line` | 6 to 8 or 4 |
| `spacing.s3` | alias (same value) | `rhythm.tight` | nothing |
| `spacing.s4` | alias (same value) | `rhythm.block` | nothing |
| `spacing.s5` | legacy value `26` | `rhythm.group` | 26 to 24 |
| `spacing.s6` | legacy value `32` | `rhythm.section, or rhythm.screen at regular width` | 32 to 36 |
| `spacing.s7` | legacy value `52` | `rhythm.section at regular width` | 52 to 56 |
| `textStyles.title` | alias (same value) | `textStyles.recordTitle` | nothing |
| `textStyles.display` | alias (same value) | `textStyles.figure` | nothing |
| `textStyles.heading` | alias (same value) | `textStyles.sectionTitle` | nothing |
| `textStyles.subheading` | alias (same value) | `textStyles.rowRecord` | nothing |
| `textStyles.record` | alias (same value) | `textStyles.recordText` | nothing |
| `textStyles.metadata` | alias (same value) | `textStyles.secondary` | nothing |
| `textStyles.fine` | alias (same value) | `textStyles.footnote` | nothing |
| `textStyles.label` | alias (same value) | `textStyles.capsule` | nothing |
| `textStyles.control` | alias (same value) | `textStyles.strong` | nothing |
| `textStyles.padTitle` | alias (same value) | `textStyles.recordTitle` | nothing |
| `textStyles.padLede` | alias (same value) | `textStyles.body` | nothing |
| `textStyles.lede` | alias (same value) | `textStyles.body` | nothing |
| `textStyles.caption` | alias (same value) | `textStyles.footnote` | nothing |
| `textStyles.figureInline` | alias (same value) | `textStyles.strong` | nothing |
| `textStyles.tag` | alias (same value) | `textStyles.capsule` | nothing |
| `textStyles.kicker` | alias (same value) | `textStyles.capsule` | nothing |
| `textStyles.chip` | alias (same value) | `textStyles.capsule` | nothing |
| `textStyles.countdown` | alias (same value) | `textStyles.strong` | nothing |

<!-- tokens:end -->
