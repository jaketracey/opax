# UI component consolidation

Code review: 19 September 2026, main at `5c572221`. This is a proposed design and migration backlog, not an implemented redesign.

## Finding

OPAX already has a recognisable visual foundation. `portal/public/style.css` defines paper/ink/navy/bronze colours, type roles and a spacing scale; `navigation.js` shares desktop/mobile navigation definitions. `app.js` contains useful reusable helpers such as `actionBtn`, `infoboxHTML`, `partyChipHTML`, `attachQuickSearch` and `renderDirectory`.

The inconsistency is principally in composition and ownership. Features introduce their own controls, spacing, metadata, source rows and interaction states. The main application is 14,186 lines and the main stylesheet is 5,886 lines, with successive page-specific refinements. Those sizes are indicators of the consolidation opportunity, not proof that each repeated rule is unnecessary.

Scope reviewed: shared styles and application helpers; profile/directory rendering; electorate, supplier, agency and grant recipient modules; grants and money research controls; evidence rendering; community, ballot and voice styles; graph UI source. This is a source audit, not a complete rendered-page or accessibility audit. The priorities below should be validated in a component workbench and representative live pages.

## Start with buttons and inputs

These deserve the first design pass because every subsequent component depends on them.

Concrete examples:

- `style.css:547`: primary buttons have a 56px minimum height and 16px text; secondary buttons at line 555 have a 48px minimum height and 15px text.
- `style.css:1939`: profile action links use a separate padding-based size, 14px text and their own icon treatment.
- `style.css:4652`: supplier buttons define another padding, font and border treatment.
- `voice.css:44`: voice controls use a 44px minimum height, 13px text and a 5px radius.
- `style.css:539`: the base input selector covers text, number, selected textareas and selects, but search inputs have separate implementations. Directory search uses a 44px minimum height; ask controls use 56px; the ballot finder sets 50px.
- `community.css:7`: community fields separately define 48px minimum height, padding and line-height. Supplier fields have another rule at `style.css:4644`.

Different sizes can be intentional. The problem is that size, purpose and state are encoded independently by each feature rather than selected from a common contract.

**Button family:** primary, secondary, quiet and destructive emphasis; compact/default/large sizes; leading/trailing icons; icon-only; full-width; busy and disabled states. Links that navigate should remain anchors, and actions should remain buttons. One visual system can support both semantics. Busy buttons retain their width; disabled does not automatically mean “waiting”. Decide where the existing gold action belongs instead of letting features choose a third primary treatment.

**Field family:** text, search, email, password, number, date, select and textarea, inside a shared labelled field with optional hint/error. Match button and field heights at each size. Include clear/reveal actions, prefixes/suffixes, required, invalid, read-only and disabled states. Use native controls where practical; share the presentation without replacing useful platform behaviour.

**Choice controls:** checkbox, radio, switch and segmented selection. Specify focus, selection and keyboard behaviour as well as appearance. Navigation tabs, toggle buttons and single-choice controls should keep the semantics appropriate to their task.

## Proposed component backlog

| Order | Component family | Contract to design | First replacement targets |
|---|---|---|---|
| 1 | Buttons, action links and icon buttons | Emphasis, size, icon alignment, loading, disabled, wrapping and grouped actions | Ask/search submits, `.action-btn`, `.supplier-button`, community and voice controls |
| 2 | Inputs and labelled fields | Shared label/hint/error layout; consistent sizes and states for native input types, selects and textareas | Directory, supplier and agency filters; ask/search; community forms; ballot finder |
| 3 | Choice and view controls | Checkboxes/radios, switches, segmented controls and filter chips; explicit selected state and keyboard contract | Person All/Then/Now, topic ordering, grants Map/List, active search filters |
| 4 | Search and filter toolbar | Query, optional suggestions, filters, sort, active-filter summary, reset and result count; responsive collapse | `renderDirectory`, separate supplier/agency directories, bills index, grants and map research |
| 5 | Entity/page header | Kicker, title, portrait/monogram, compact identity metadata, description and actions; compact and full variants | Parliamentarian, donor, party, electorate, supplier, agency and grant recipient profiles |
| 6 | Facts and metrics | Label/value rows and compact numeric summaries; optional linked values, units, period, source and as-of date | `infoboxHTML`, supplier/agency totals and context, electorate facts, recipient summaries |
| 7 | Entity identity and metadata | Portrait/initials, linked name, party, jurisdiction, chamber, electorate and dates; inline and row variants | Profile headers, directory rows, speaker bylines, electorate member lists and map detail panels |
| 8 | Record lists and tables | Row anatomy, metadata, amount/date alignment, expand action, result count and pagination; retain semantic tables for comparisons | Speech/search results, supplier contracts, grants, money records and directory results |
| 9 | Source and coverage block | Source title/link, publisher, date, citation action, verification/coverage note and expandable detail | Ask citations, report sources, electorate sources, procurement notices and evidence connections |
| 10 | Sections, disclosures and event timelines | Section heading/description/action, body rhythm, expandable detail and dated event row | Profile sections, contract details, bill history and electorate election/service timelines |
| 11 | Loading, empty, error and fallback states | Inline/block/panel presentation with a truthful reason, recovery action and accessible status announcement | Directory empty results, supplier fetch failures, profile skeletons, grants map status and graph 2D fallback |
| 12 | Dialogs, drawers and popovers | Shared surface, heading/actions, close affordance, spacing, focus return and dismissal behaviour | Mobile drawer, expense explanations, citation panels, tool dialogs and assistant surfaces |

These are families with a few deliberate variants, not twelve universal widgets with dozens of switches. In particular, the filter toolbar should compose controls while each feature keeps its filtering/data logic. Record lists should share anatomy without forcing a speech excerpt, a contract and an election result into identical markup.

## Useful existing starting points

| Existing implementation | Reuse or extract |
|---|---|
| `portal/public/style.css:7` | Keep the established colour, type and spacing tokens. Add explicit control heights, radii, icon sizes and control spacing. Document purposeful exceptions. |
| `portal/public/app.js:3565` — `actionBtn` | Start the action family here; support native buttons alongside links through small explicit renderers. |
| `portal/public/app.js:4100` — `infoboxHTML` | Extract the facts layout from app-level code so other profile modules can use it. Keep facts independent of optional actions. |
| `portal/public/app.js:6396` — `renderDirectory` | Already combines URL-backed filters, suggestions, result counts, empty state and show-more. Extract reusable parts before adding another directory implementation. |
| `portal/public/app.js:1880` — `attachQuickSearch` | Preserve the existing suggestion interaction while moving shared behaviour out of the application file. |
| `portal/public/app.js:2864` — `sourceItem` | Use alongside report-source rows to define the evidence row family and its title-led/byline-led variants. |
| `portal/public/electorates.js:55` and `:61` | Preserve current-versus-historical representation rules when replacing header/facts presentation. |
| `portal/public/suppliers.js:31` — `lifecycle` | A useful pattern for component teardown, aborting requests and avoiding updates after navigation. Agencies already reuse it. |
| `portal/public/navigation.js` | Keep the shared navigation model; align its controls with the new primitives. |

## Content rules that should travel with components

- Keep electorate links in the parliamentarian header and Quick Facts. Current representation and historical representation need distinct labels; do not reintroduce a large standalone block merely to expose those links.
- Standardise money/date/number formatting through shared presentation helpers with explicit compact/exact variants. For example, `app.js:112`, `suppliers.js:5–7` and `grant-recipient.js:3` currently define separate currency policies. Preserve precision where meaningful.
- Missing, zero, vacant, unverified, historical and failed-to-load are different states. A shared component must not collapse them into a dash or zero.
- Put period, units and coverage next to the figure they qualify. Contract commitments, grant awards and political receipts must remain distinguishable when using the same metric component.
- Keep source records, calculated totals and generated summaries distinguishable. Shared source styling should preserve the domain-specific explanation.
- Long names, multiple representatives and long jurisdiction/chamber labels are ordinary cases, not exceptional layouts.

## Suggested delivery sequence

1. **Design a local component workbench.** Show buttons, fields and choices together in all sizes and states, on light and navy surfaces. Add real OPAX labels, long text, populated/error cases and keyboard interaction. Agree these before building larger compositions.
2. **Migrate one complete filter workflow.** Use supplier and agency directories alongside the existing people directory to prove the shared controls/toolbar. Include query, sort, empty results, clear filters and show-more. Then apply the approved primitives to ask/search and community forms.
3. **Migrate the entity profile family.** Start with parliamentarian, donor and electorate profiles. This exercises portraits, organisations, current/historical service and multiple members. Carry the resulting header, facts and identity components into supplier, agency and recipient profiles.
4. **Consolidate records and evidence.** Use speech results and procurement records as contrasting cases; retain specialised bodies. Follow with sources, status states, disclosures and overlays.

Status and accessibility behaviour should be defined from step 1; the later step is the wider replacement of existing instances.

## Keep subsequent work consistent

- Use small shared ES modules and component styles compatible with the existing plain JavaScript frontend. A framework migration is not a prerequisite.
- Separate primitives, compositions and domain adapters. Components render and own their interaction lifecycle; adapters supply data and domain-specific labels.
- Maintain one authoritative implementation/style location per family. Migrate markup and remove its obsolete rules in the same change instead of appending another override layer.
- Keep shared helpers independent of `app.js` so separately mounted features can import them without initialising the application.
- Edit graph UI in `portal/graph/`, grants map implementation in `portal/grants-map/`, and voice behaviour in `portal/voice/`; rebuild their public bundles. Do not hand-edit generated output. Hand-authored feature styles such as `voice.css` remain separate migration targets.
- Keep specialised map rendering, chart encodings and ballot/conversation behaviour local. Apply common buttons, panels, facts and status components around them.
- For each migrated family, review desktop/mobile, long content, focus order, keyboard use, 200% zoom, forced colours and relevant loading/error states. Verify URL/back navigation and teardown where the component owns those behaviours.
- Treat the workbench as the reference future contributors use: if a shared component covers the need, extend an intentional variant instead of introducing another feature-specific button or field.
