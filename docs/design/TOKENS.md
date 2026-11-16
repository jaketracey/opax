# OPAX design tokens

One source for the web, the app and the share images. [`design-tokens.json`](design-tokens.json) holds every colour, type role, space step, radius, border, shadow, duration and size that they draw. The rules for using them are in [DESIGN-REVIEW-2026-10.md](DESIGN-REVIEW-2026-10.md), section 2; this page covers the pipeline and the names.

## Pipeline

```sh
node scripts/build_tokens.mjs            # write every target in this checkout
node scripts/build_tokens.mjs --check    # exit 1 if any target is stale
node scripts/build_tokens.mjs --only app # or web, social or docs
```

| Target | Written from the JSON | Read by |
|---|---|---|
| `portal/public/tokens.css` | `:root` custom properties, then the deprecated names | Pages and modules that need the tokens without `style.css` |
| `portal/public/style.css`, the `tokens:begin` / `tokens:end` region | The same rules as `tokens.css`, inlined so a page needs no second request | Every page |
| `portal/src/tokens.generated.ts` | The light palette as hex and the two family names | `og.ts`: the share cards and story slides |
| `mobile/src/design/tokens.generated.ts` (app branches) | Palettes for four themes, party colours, type roles, rhythm, radii, motion, sizes, contrast rules | `palette.ts` and `tokens.ts`, which re-export it |
| This page, the `tokens:begin` / `tokens:end` region | The role and alias tables below | People |

- **Web:** `npm run build:tokens` runs the generator, and `npm run build:search` (which the deploy and the GitHub deploy job run first) runs it before the catalogs. `npm run check` runs `--check`. `test/design-tokens.test.mjs` fails while a generated file is stale.
- **App:** `npm run tokens` runs `mobile/scripts/build-design-tokens.mjs`, which calls this generator's `buildTs` and leaves out the retired aliases; `tests/design-tokens.test.ts` fails while `tokens.generated.ts` is stale.
- **Share images:** `npm run build:tokens` also writes `portal/src/tokens.generated.ts`; `test/design-tokens.test.mjs` fails while it is stale or while `og.ts` or `story.ts` holds a raw hex colour.
- A checkout without `mobile/` (`main`) skips the app target; one without `portal/` skips the web and social targets.
- **The money map** imports `chart`, `color` and `party` from the JSON at build time (`portal/graph/palette.ts`); its selection accent is `chart.mark.web.role`.

## One file, base values and web overrides

- **A token's base value is the app's.** Where the web draws something different today, the token carries a `web` block: `web.value` (a colour, space step or radius), `web.role` (the chart mark), `web.$description` (the web's own note). `web.omit` keeps an app-only token (the edition bands, the chamber inks, the app's launch timings, the app's new radius names) off the web.
- **Type.** `type` holds the app's eighteen roles. `webRoles` holds the web's eleven role names (`--type-title`, `--type-body`, ...). Each follows an app role and lists, under `web`, only where the web differs: family, weight, size or line height. Removing an override moves that web role onto its app role; the generated table below shows what each web role draws and what it still overrides.
- **The app branches read this file.** When an app branch (`ad/b78-int` and later) next merges main, it takes `docs/design/design-tokens.json` and `scripts/build_tokens.mjs` from main as they are: with them, `mobile/scripts/build-design-tokens.mjs --check` reproduces the branch's `tokens.generated.ts` byte for byte, so the merge changes nothing in the app. From then on a token change lands on main once and reaches the web, the app and the share images from the same line.

## Rules the generator keeps

- **Same names, same values.** Every colour role keeps today's hex value. Web names stay as they were (`--paper-raised`, `--party-alp`); a role's web name is `--` plus its app name in kebab case unless the JSON gives one.
- **Old names keep working for one release.** An *alias* has its replacement's value and points at it (`--line: var(--divider-subtle)`, `light.line`). A *legacy value* keeps the old look until a later pass moves its uses (`--space-3`, `textStyles.caption`). Both carry a deprecation comment: `/* deprecated: use ... */` in CSS, `@deprecated` in TypeScript, so editors strike them through.
- **Dark values exist but are not drawn.** The web sets `color-scheme: light` and the app is light-only (decision 2). Every role carries a dark value held to the same contrast rules, so a dark theme is wiring, not a design pass. The generated app file exports `dark` and `darkHighContrast`; `tokens.ts` still resolves dark to light.
- **Increase Contrast** is live in the app (`lightHighContrast`). The web's `prefers-contrast: more` block is ready in the source and is written only when `themes.web.prefersContrast` is true.
- **Raw colours are counted.** `portal/test/design-tokens.test.mjs` counts hex colour literals in web sources outside the generated tokens, and `mobile/tests/design-tokens.test.ts` counts colour literals in app sources outside `tokens.generated.ts`. Each file has a baseline; a file may go down, never up, and a new file starts at zero. When a pass removes some, lower the baseline in the test so the count cannot creep back.

## Adding or changing a token

1. Edit `design-tokens.json`. A new colour role needs a light and a dark value; add it to `contrast` if it is text or a boundary.
2. Run `node scripts/build_tokens.mjs` on main for the web, share images and docs, and `npm run tokens` in `mobile/` on the app branch. A change meant for the web only goes in the token's `web` block, or in `webRoles`.
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
| text | none | `link` | #142A43 | #9CB9DB |  | Semantic link tone, always the single navy tint. |
| brand | `--navy` | `navy` | #142A43 | #9CB9DB |  | Structure and the one primary action per view. |
| brand | `--navy-raised` | `navyRaised` | #1D3A5C | #B9CDE6 |  | Pressed and hover on navy. |
| brand | `--navy-wash` | `navyWash` | #E4E6E7 | #25303D | #D3D9DF / #2E3C4C | Secondary button fill; the people accent's wash; the selected row in a split list. |
| brand | `--bronze` | `bronze` | #A0761B | #A87D2A |  | Brand artwork only: mark, icon and launch screen. |
| brand | none | `todayDotBronze` | #C08F2C | #C08F2C |  | Today's decorative dot map highlight, at 76 percent opacity over a navy base at 23 percent. |
| brand | `--bronze-ink` | `bronzeInk` | #8A5A12 | #D9A84A | #5C4318 / #EBC57F | Brand artwork only: mark, icon and launch screen. |
| brand | `--bronze-wash` | `bronzeWash` | #ECE4D3 (web `rgba(160, 118, 27, 0.16)`) | #332A1B |  | Brand artwork only: mark, icon and launch screen. |
| brand | `--bronze-rule` | none | rgba(160, 118, 27, 0.55) | rgba(217, 168, 74, 0.55) |  | Link underlines on the web: present, not heavy. |
| brand | `--bronze-bright` | `bronzeBright` | #D9A84A | #5E400B |  | Brand artwork only: mark, icon and launch screen. |
| line | `--divider-default` | `dividerDefault` | #B8B4A8 | #4C5047 |  | The top rule of a section; major content boundaries. |
| line | `--divider-subtle` | `dividerSubtle` | #DFDCD2 (web `#E7E4DD`) | #30342D | #B8B4A8 / #4C5047 | Between rows, under subheadings, card outlines. |
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
| chamber | none | `houseInk` | #3B6E58 | #93C4AE | #2F5A48 / #B3D8C7 | The House of Representatives: its green. |
| chamber | none | `senateInk` | #A2402E | #EE9B88 | #86321F / #F5BBAE | The Senate: its red. |
| band | none | `bandBills` | #1F5F6B | #1E4A51 | #1E5E69 / #1E4A51 | Edition plate ground. |
| band | none | `bandMoney` | #2B6447 | #24472F | #2A6346 / #24472F | Edition plate ground. |
| band | none | `bandVotes` | #3A4C96 | #2F3B70 | #3A4C96 / #2F3B70 | Edition plate ground. |
| band | none | `bandInterests` | #7B3A63 | #5C2C4A | #7B3A63 / #5C2C4A | Edition plate ground. |
| band | none | `bandPeople` | #142A43 | #1C3550 | #142A43 / #1C3550 | Edition plate ground. |
| band | none | `onBand` | #FFFFFF | #F5F3EC | #FFFFFF / #F5F3EC | Titles and art on edition bands. |
| band | none | `onBandSoft` | #E6EBEE | #C9CEC4 | #E6EBEE / #C9CEC4 | Kicker and detail on edition bands. |

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

### Web type roles

Each web role follows an app role; the web column is what the web draws today. An override listed here is where the web still differs from the app role.

| Web role | Follows | Web | Overrides |
|---|---|---|---|
| `--type-title` | `largeTitle` | serif 400 clamp(2rem, 1.25rem + 2.2vw, 3rem) / 1.15 (ratio) | family, weight, size, lineHeight |
| `--type-display` | `figure` | serif 600 32 / 1.2 (ratio) | family, weight, size, lineHeight |
| `--type-heading` | `sectionTitle` | serif 600 24 / 1.25 (ratio) | family, weight, size, lineHeight |
| `--type-subheading` | `rowRecord` | serif 600 17 / 1.4 (ratio) | weight, lineHeight |
| `--type-record` | `recordText` | serif 400 17 / 1.7 (ratio) | lineHeight |
| `--type-body` | `body` | sans 400 16 / 1.55 (ratio) | size, lineHeight |
| `--type-strong` | `strong` | sans 600 16 / 1.55 (ratio) | size, lineHeight |
| `--type-metadata` | `secondary` | sans 400 15 / 1.45 (ratio) | lineHeight |
| `--type-fine` | `footnote` | sans 400 13 / 1.45 (ratio) | lineHeight |
| `--type-label` | `capsule` | sans 600 13 / 1.45 (ratio) | size, lineHeight |
| `--type-control` | `strong` | sans 600 16 / 1.25 (ratio) | size, lineHeight |

40 colour roles in 8 groups; 6 categories, 4 status tones, 16 industry hues, 8 parties (dot + wash); 18 type roles over 7 sizes; 9 rhythm steps; 9 radii (sm, md, pill, container, tile, thumb, bar, capsule, round); 6 durations and 1 curve; 2 shadows (overlay, edition); 11 web type roles.

### Deprecated web names

| Old name | Kind | Use instead | Moving changes |
|---|---|---|---|
| `--line` | alias (same value) | `--divider-subtle` | nothing |
| `--line-strong` | alias (same value) | `--line-control` | nothing |
| `--heading-page` | alias (same value) | `--type-title` | nothing |
| `--heading-section` | alias (same value) | `--type-heading` | nothing |
| `--heading-subsection` | alias (same value) | `--type-subheading` | nothing |
| `--heading-tracking` | legacy value `0` | `no letter-spacing` | nothing |
| `--space-1` | alias (same value) | `--sp-4` | nothing |
| `--space-2` | alias (same value) | `--sp-8` | nothing |
| `--space-3` | alias (same value) | `--sp-12` | nothing |
| `--space-4` | alias (same value) | `--sp-16` | nothing |
| `--space-5` | alias (same value) | `--sp-24` | nothing |
| `--space-6` | legacy value `var(--sp-48)` | `--sp-48 (--sp-32 under 701px)` | nothing |
| `--space-7` | alias (same value) | `--space-section` | nothing |
| `--row-gap` | alias (same value) | `--space-row` | nothing |
| `--sub-gap` | legacy value `var(--sp-48)` | `--sp-48 (--sp-32 under 701px)` | nothing |
| `--section-gap` | alias (same value) | `--space-section` | nothing |

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
