# Web uplift, Phase 1: token census and proposed scale

Lane `web/design-system`, 12 Oct 2026. This is analysis and a proposal only: nothing here changes what ships. The route ranking, the merged component set and the mock shots are in [PROPOSAL.md](PROPOSAL.md).

## 1. What the stylesheets actually draw

The census reads every declaration in the four stylesheets this lane owns (`style.css`, `ui-controls.css`, `ui-source.css`, `voice.css`), the other web stylesheets, every `<style>` block, and the inline styles in `app.js`, the page modules and the HTML. It sorts each declaration into one of seven categories and counts it once:

- **token:** every value comes from a custom property;
- **hard-coded:** at least one literal value (a length, colour, duration or curve), with or without a token beside it;
- **neutral:** `0`, `none`, `auto` or `inherit`, so not counted either way.

### The four owned stylesheets

| Category | Hard-coded | Token | Hard-coded share | Distinct literal values | Most common literals |
|---|---:|---:|---:|---:|---|
| Spacing (margin, padding, gap) | 1,155 | 609 | **65%** | 108 | 16px ×167, 8px ×142, 12px ×87, 6.4px ×77, 9.6px ×64, 5.6px ×58 |
| Type (font, size, weight, line height) | 769 | 221 | **78%** | 285 (51 font sizes) | 13px ×42, weight 600 ×29, 15px ×28, line height 1.6 ×21 |
| Colour | 10 | 1,098 | 1% | 3 | `white` ×8 |
| Radius | 138 | 54 | **72%** | 14 | 4px ×45, 50% ×34, 2px ×21, 3px ×14, 6px ×7 |
| Shadow | 33 | 14 | **70%** | 14 | 1px and 3px rings, 5 tinted drop shadows |
| Motion | 49 | 8 | **86%** | 26 | `ease` ×26, 160/240/260/520ms ×5 each |
| Rules (border and outline shorthands) | 270 | 96 | **74%** | 6 | `1px` ×167, `2px` ×52, `3px` ×26, `1.5px` ×21 |
| **All** | **2,424** | **2,100** | **54%** | | |

- **Deprecated names:** 617 of the 2,100 token uses name a deprecated token: `--line` (147), `--space-4` (108), `--space-3` (82), `--space-5` (68), `--space-2` (63), `--line-strong` (57) and others. Five of these draw legacy values off any grid (6.4, 10.4, 25.6, 41.6 and 67.2px). Counting those as off-system, **only 33% of the owned declarations sit on the current scale.**
- **Where it is:** `style.css` holds 2,289 of the 2,424. The worst sections are the late "refinement loop" block (414 hard-coded of 917, from line 5019), the discovery, supplier and agency block that follows "stats page: live figures" (257 of 492), the directories (200 of 407), forms (81 of 148) and search (76 of 135). `voice.css` hard-codes every spacing, type, radius and motion value (85 declarations; only its colours are tokens); `ui-controls.css` hard-codes its own padding (26 of 27 spacing declarations).
- **Elsewhere:** the newer stylesheets are mostly on tokens already (`home.css`, `hubs.css`, `community.css`, `ballot.css` and `datatable.css` are 0–24% hard-coded). Inline styles are few: 9 spacing and 2 type declarations in `app.js` and 3 in `index.html`. The many inline `width:%` bars are data and stay.
- **Colour is done.** Pass 4G took hex to 4 literals. The 10 hard-coded colour declarations are `white` (×8) and two `rgb()` values in `style.css`.
- **Unused tokens:** the 32 `--chart-industry-*` tokens (the money map still draws its own palette), the party washes and `--ambient-loop`.
- **Local custom properties outside the tokens:** 23, mostly the `--ui-*` knobs in `ui-controls.css` and `--pc` (party colour).

### What a 4/8 grid would cost

Of the 1,461 pixel spacing literals, 644 already sit on a 4px grid, and 680 more are within 1.6px of it (9.6 → 8 or 12, 5.6 → 4 or 8, 12.8 → 12, 3.2 → 4, 11.2 → 12). **About 90% snap to the scale with a change of under 2px.** The other ~140 are 0.1em hairline offsets and percentages, which stay.

## 2. Proposed web scale

These are **web overrides** in `docs/design/design-tokens.json` (the `web` key each token already supports). The app's generated tokens do not move unless the app lane takes them.

### Spacing: one 4/8 scale with a generous section step

Base steps: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 80.

| Role | Today | Proposed | Use |
|---|---:|---:|---|
| `--space-line` | 4 | 4 | a line bound to the line above |
| `--space-tight` | 8 | 8 | inside a row or group |
| `--space-row` | 10 | **12** | either side of a row hairline |
| `--space-heading` | 12 | **16** | section heading to its first block |
| `--space-block` | 16 | **24** | between blocks inside a section |
| `--space-group` | 24 | **32** | a second list or group inside a section |
| `--space-section` | 36 / 56 | **48 / 64 / 80** | between sections: phone / 701px+ / 1101px+ |
| `--space-screen` | 20–72 fluid | 20–72 fluid (unchanged) | screen edge to content |

- The deprecated names stop drawing their own values and point at the scale in Phase 2 (`--space-2` → 8, `--space-3` → 12, `--space-5` → 24, `--space-6` → 32/48, `--space-7`, `--section-gap` → section). Their 617 uses move onto the grid on day one, and the ratchet then takes the names out file by file.
- The section step grows from 36 to 48 on phones (1.33×), 56 to 64 on tablets (1.14×) and 56 to 80 on desktop (1.43×). Inside a section the steps go 16 / 24 / 32, so a section break (48–80) is never confused with a group break.

### Type: six sizes and the title

| Role | Today (web) | Proposed | Notes |
|---|---|---|---|
| title | serif 400, 30–44 fluid / 1.25 | serif 400, **32–48 fluid / 1.15** | tighter leading at display size |
| display | serif 700, 34 / 1.24 | serif **600, 32** / 1.2 | the one number a block is about; 600 is in the variable font already |
| heading | serif 600, 22 / 1.36 | serif 600, **24** / 1.25 | |
| subheading | serif 600, 18 / 1.33 | serif 600, **17** / 1.4 | shares 17 with the record; weight tells them apart |
| record | serif 400, 17 / 1.75 | serif 400, 17 / 1.7 | |
| body, strong, control | sans 16 / 1.55 | unchanged | |
| metadata | sans 15 / 1.4 | sans 15 / 1.45 | |
| fine, label | sans 13 / 1.385 | sans 13 / 1.45 | |

- **Six sizes (13 · 15 · 16 · 17 · 24 · 32) plus the title**, against seven today (13 · 15 · 16 · 17 · 18 · 22 · 34). The serif ladder 17 / 24 / 32 / title steps by about 1.4 each, so headings read as a hierarchy rather than as near-misses (today's 17 / 18 / 22).
- **Why subheading drops to 17:** the first mock tried an 18px record. Speech titles and their passages then drew at the same size, and the topic page grew by a tenth. A 17px record under a 17px semibold title reads like a headline and its text.
- The bigger win is what is drawn: **51 literal font sizes** in the owned CSS (and 9–12 rendered sizes per page) come down to these six. No uppercase and no letter-spacing (D6), unchanged.

### Radius: keep D1, enforce it

Keep shape by role (D1): **press = pill, read = 4, hold = 12, round = 50%.** The 14 drawn values collapse to these four:

- 2px, 3px and 5px (40 uses) become 4;
- 6px, 8px, 10px and 11px (15 uses) become 12 or 4, by what the thing is;
- 1px rounding on bars becomes 0.

**One open choice for Jake:** text fields are 4px (read) today, and sit beside pill buttons (the home Ask box, the person Ask row). Either keep 4, or move single-line fields to 12 so a field and its button read as one family. The mocks show 12.

### Rules and elevation: fewer lines

- Every hairline becomes `--border-hairline` (167 literal `1px`); 1.5px, 1.8px and 2px edges go (77 uses), except the 2px focus ring and the 2 × 28px accent mark. The 3px rule stays only under the masthead.
- **One rule per section** (its top hairline) and **no box around a list.** Inside a section, rows keep the subtle hairline only where rows hold several lines; single-line rows separate with space.
- **Shadows:** `--shadow-overlay` for things that float, plus a focus ring token (`--ring: 0 0 0 2px var(--bronze-ink)`) to replace 10 hand-written rings. Five tinted drop shadows go.
- **Lines recede:** `--divider-subtle` lightens one step (#DFDCD2 → #E7E4DD, still decorative). Section rules (`--divider-default`) are unchanged.

### Colour: keep it

The palette is already tokenised and contrast-checked in four themes. Keep paper, ink, navy and the bronze accent as they are. The only change is the lighter row hairline above, plus the money map adopting `--chart-industry-*` (its exporter still writes its own colours; that is Phase 2 with the data lane).

### Motion: three durations, one curve

Keep `quick` 120ms, `standard` 200ms, `gentle` 400ms and `--ease-standard`. The 26 drawn values map onto them: 150–160 → quick; 200–280 → standard; 320–620 → gentle; `ease` → the standard curve. Loaders and the ambient loop keep `linear`. Hover changes colour only, never moves a thing; reduced motion stays instant.
