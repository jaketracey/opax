# Web uplift, Phase 2: how a route moves onto the system

How each route is moved onto the tokens and the shared components, for every lane doing it. Read [PROPOSAL.md](PROPOSAL.md) for the why and [TOKENS-PROPOSAL.md](TOKENS-PROPOSAL.md) for the scale.

## What "migrated" means

- **Tokens only.** No literal spacing, type, radius, shadow, motion or colour in the route's CSS:
  - space: a role (`--space-row` 12, `--space-heading` 16, `--space-block` 24, `--space-group` 32, `--space-section` 48/64/80) where one fits; otherwise a step (`--sp-2` … `--sp-80`);
  - type: a role (`--type-title`, `display`, `heading`, `subheading`, `record`, `body`, `strong`, `metadata`, `fine`, `label`, `control`) where one fits; otherwise `--weight-*`, `--text-13|15|16|17|24|32` and `--leading-*`;
  - radius by role: press = `--radius-pill`, read = `--radius-sm`, hold = `--radius-md`, portraits = `--radius-round`;
  - hairlines `--border-hairline`; the focus ring `--border-focus`; rings `--ring-*`; the one shadow `--shadow-overlay`; motion `--duration-quick|standard|gentle` with `--ease-standard`.
- **Shared components, not page dialects.** Draw the route with the `ui-*` components listed below and **delete** the route's own rules that restyled the same thing. A route's CSS keeps layout only: grid templates, widths and order.
- **Fewer boxes and rules:**
  - one rule per section, at its top;
  - no box around a list, chart or summary;
  - cards only for a unit you can pick up;
  - a list keeps hairlines between rows only where rows hold several lines.
- **Six sizes.** Nothing below 13. No uppercase, no letter-spacing (D6).
- **Shape by role (D1):** buttons and chips are pills; tags and status labels are 4px; cards and sheets are 12px; text fields are 12px.
- **One primary action per view, and it is navy.** Other drawn actions are secondary pills; no bronze or gold fills.
- **44px targets.** A row or segment that draws smaller reaches 44 with an invisible `::after` extension.

## Never

- Hide record data or provenance to simplify a page; change *how* it is shown, never *whether*.
- Name an individual donor anywhere: code, tests, fixtures, commits or reports. Donor surfaces use `donor-entity.js` (`isOrganisationDonor`, fail-closed). Withheld donors appear only as the "Donors not named (N)" aggregate.
- Touch another lane's ground:
  - the header, nav panels, mobile sheet, footer, breadcrumbs and the money hub's tab row (`.area-nav`, `.money-area-nav`) belong to web-nav-refactor;
  - the "…" page-actions popover (`.page-actions`, `.entry-actions`, `.ui-more`) belongs to web-page-actions-menu;
  - the money map's "Donors not named" overlay belongs to web-moneymap-overlay;
  - `/money/explain` belongs to web-money-flow-explainer.

## The components

| Need | Use | Markup |
|---|---|---|
| Page title block | `ui-page-head` | `<div class="ui-page-head"><h1>…</h1><p class="ui-page-meta">kind · date · place</p><p class="ui-lede">…</p></div>` (a `div`, not `header`: the masthead owns the bare `header` rule) |
| A section | `ui-section` (+ `data-accent="money\|votes\|interests\|bills"` where sections differ by category) | `<section class="ui-section"><div class="ui-section-head"><h2>…</h2><a>All …</a></div>…</section>`; a plain title is `.ui-section-title` |
| A list | `ui-list` (`data-density="compact\|airy"`, `data-rule="none"`) | `<ul class="ui-list"><li class="ui-row">…</li></ul>` |
| A row | `ui-row` with `ui-row-title` (serif), `ui-row-name` (sans strong), `ui-row-meta`, `ui-row-text`, `ui-row-figure` | |
| A person in a row | `ui-byline` (`ui-byline-portrait`, `ui-byline-who`, `ui-byline-name`, `ui-byline-meta`) | 44 portrait; a blank circle when there is none, never initials |
| Figures | `ui-stats` > `ui-stat` (`ui-stat-value`, `ui-stat-label`; `data-size="compact"`) | |
| Bars | `ui-bar > i` (a 4px track); `ui-legend` | |
| Key/value facts | `ui-kv` | `<dl class="ui-kv"><div><dt/><dd/></div></dl>` |
| A unit to pick up | `ui-card` (`ui-card-title`, `ui-card-text`), in a `ui-card-grid` | The whole card is the link |
| A map or chart frame | `ui-plate` | |
| On this page | `ui-toc-head`, `ui-toc-list` | |
| Filters on an index | `ui-filter-bar` > `.ui-filter-search`, `.ui-filter-field` (select), `.ui-filter-toggle` (checkbox label), `.ui-filter-actions`; count in `.ui-filter-count` | |
| Two or three views | `ui-segmented` (pill track) for views of the same content; `ui-tabs` (underline) for page modes | |
| Opens in place | `ui-disclosure` (`ui-disclosure-body`) | |
| Buttons | `ui-button` (`data-variant="primary\|quiet\|danger"`, `data-ui-size="compact\|large"`), `ui-icon-button` | |
| An action that reads as a link | `button.ui-link` | |
| A block's drawn actions | `ui-actions` | |
| Labels | `ui-tag`, `ui-status` (`data-tone`), `ui-party`, `ui-chip`, `ui-filter-chip`, MachineLabel (`labels.js`) | |
| Provenance | `ui-source` (one per block, `labels.js` `sourceLineHTML`); a row's own original: `ui-source-link` | |
| States | `ui-empty` (`data-variant="error"`), `ui-skeleton`, `ui-status-line` | One plain sentence and a way on; a failed optional block collapses |

## Process for one route group

1. **Before shots.** Shoot live opax.com.au with read-only GETs at 390, 820 and 1440:
   - `node <lane>/bin/sweep.mjs <lane>/before-live --origin https://opax.com.au --only <names>`, or `--route name=/path`;
   - it blocks analytics, every non-GET and the Ask, generation, voice, auth and community routes.
2. **Migrate.**
   - In the renderer (`app.js` or the page's module), give the markup the `ui-*` classes.
   - In `style.css`, delete the route's rules that the components replace.
   - Keep layout-only rules.
3. **After shots, locally.**
   - Run `node ../scripts/stamp_assets.mjs` first, or wrangler serves the old CSS.
   - Then `node <lane>/bin/sweep.mjs <lane>/after --port <yours> --only <names>`.
   - Compare with `compare.mjs`. Fix what the shots show (overflow, wraps, lost hit areas) before committing.
4. **Tests.** Run `node --test test/design-tokens.test.mjs` and the route's own tests. Lower a ratchet baseline when the share goes down; never raise one.
5. **Commit.** One commit per route group, with a themed message, after a restamp.

`<lane>` is `/Users/jake/Projects/opax-ios-wt/web-design-system/portal/private/web-design-system`. Its `bin/` holds `sweep.mjs`, `compare.mjs`, `probe.mjs`, `census.mjs` and `coverage.mjs`.
