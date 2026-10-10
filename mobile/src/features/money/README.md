# Native money map

The native `/money` screen uses the held federal, Queensland, Victoria and
Tasmania graph catalogs. Today links to it after the daily edition; the Person
party-receipts record links to the party's map focus and preserves its web link.
State and federal returns are never combined.

The 6 October decision is **continue**. The earlier spike's growth, rather than
its short steady-state footprint, prompted bounded frame submission. Expo GL
copies uploaded typed arrays into queued native batches. The adapter now waits
for each frame's GL work and native batch to finish, uploads settled geometry
only when it changes, and calculates camera-facing ribbons in the vertex shader.
It targets 30 completed frames per second. Current profile and gate evidence
belongs under ignored `mobile/private/`; earlier JS-only intervals below do not
measure completed GPU frames.

| Historical 5 October spike | Cold graph-cache first verified frame | JS interval median / p95 | Native footprint peak |
| -------------------------- | ------------------------------------- | ------------------------ | --------------------- |
| 16e simulator, iOS 18.4    | 1,446.4 ms                            | 16.67 / 16.74 ms         | 260.6 MB              |
| 17 Pro simulator, iOS 26.5 | 1,385.7 ms                            | 16.67 / 16.73 ms         | 304.7 MB              |

The pooled experiment reached 769.4 MB and stopped before its final readback.
Memory uses physical process accounting and decimal MB. Simulator measurements
cannot establish phone GPU performance, thermal behaviour or jetsam limits.

## Port and native adapter

Three.js **0.185.1** matches the web lockfile; Expo GL is **57.0.2**. The force
simulation, palette, radius helpers and ABS CPI table are copied from
`portal/graph/`. Edge-shader constants retain web parity; the native vertex
adapter moves ribbon orientation to the GPU. The lights, fog and force layout
follow the web. Native views replace DOM labels, controls and the focus card.
The shipping screen sizes nodes by connectedness, as briefed; the historical
lab sizes them by donation value. Geometry, materials and typed arrays are
shared across year, industry and layer changes. A jurisdiction change owns a
new scene, and releases the old one.

The context shim validates native OpenGL ES 3 and removes the inherited WebGL1
brand that Three's browser check rejects. It binds methods to the supplied
native context. No Three loaders, textures, fonts, images or remote assets are
requested. Every graph request goes through `ApiClient`, four exact reviewed
static routes and the existing bounded disk cache. Fixture snapshots pin all
four files by hash; tests never use production data requests.

A published state export can split one canonical donor ID across name casing
and different financial years. The decoder joins only complete, disjoint annual
disclosures with the same identity and category, preserving every flow and
amount. Ambiguous or overlapping duplicates remain a data error.

## Records and accessibility

Native adjustable financial-year rails also have earlier/later buttons and
VoiceOver increment/decrement actions. Industry, donation, grant, contract and
inflation controls preserve the web's year semantics, including undated rows.
Public-money figures stay separate from donation totals. The full-height native
focus sheet uses the app's figures, record sources and as-at components. An
explicit native person profile path opens its page; other profiles open the
website. Party totals remain across all industries within the chosen years,
with that distinction stated when the relationships are industry-filtered.

The ranked donor list is virtualized: one row a donor (rank and name, amount,
then "Disclosed donations · years · parties"). Its sources are the map's
source line and each donor's record. It is the initial view while the
VoiceOver setting is unknown, and the default when VoiceOver is enabled. All controls have accessible names; text is
uncapped through AX5. Reduce Motion disables the idle orbit before the setting
has answered. Focus changes are immediate, so no camera fly animation runs.

Rendering stops on route blur, background and scrolling the map out of view.
Switching to the list or leaving releases Three resources; GLView destroys its
owned native context on unmount. Context errors remove the GL view and offer a
fresh one. Cleanup continues if the native context has already been destroyed.
Expo's native `isContextLost()` is a stub, so the adapter also checks GL errors
and catches invalid-context exceptions.

## Design pass 4A (October 2026)

The plan of record is `docs/design/DESIGN-REVIEW-2026-10.md` (section 2 and
"Money and leads").

- **One meta line** under the 3D map / List view control: "Donations and
  public money · years · nodes · recorded flows". No subtitle or ⓘ.
- **One source line per block** (`MoneySourceLine`): the map's sits under
  "Totals are a floor." and its sheet holds the originals (the returns and
  each public-money register), the methodology, the layer notes and the
  licence. The record sheet has one for its figure and one for public money.
  A saved copy says "Saved …" in the line; the banner says only "offline".
- **One accented figure** on the record: the amount, what it is, then "2024 ·
  3,929 receipts". Public money received is a two-row list, never a second
  accented figure. The caveats stay as one line each: "Totals are a floor.",
  "Never summed with donations.", "Commitments, not verified payments."
- **Colour.** The 16 industry hues come from the design tokens
  (`chartIndustry`) and are the map's only multi-colour element. Parties are
  drawn in the neutral parties grey and the largest four in view are named
  beside their nodes (placed before cluster names); the selection is named
  once, as the focus. No party colour is drawn without its name.
- **No inert accents** on disclosures or rows; section marks and the figure
  carry the money ink. On a regular-width window the view control stops at
  420pt.

The public-money screens (`features/money-public`) follow the same rules:
titles in ink; one figure and one `MetaSource` line under the title;
`RowSource` gives a listed record one line ("GrantConnect · GA123456") whose
sheet opens the original and, for an organisation, its page on opax.com.au;
the hub is one list; cross-links ("The month's largest grants", "Discover:
companies in both") sit at the foot of their lists. An individual recipient's
award record is never linked.

## Verification

Journey 23 starts at Today, verifies native pixels and completed frames, captures
an orbit sequence, changes year and industry, focuses through the same selection
callback as a tap, checks the held figure, opens the record's source sheet and
its guarded original, and reads the list. Its diagnostic and accessible journey actions are substituted with a
production stub before Metro traverses them. A separate cold relaunch verifies
the map and list from disk cache with the fixture server stopped.

The development/e2e-only `opax://money-map-spike?benchmark=1&seconds=300&leave=1`
lab automates a five-minute orbit and repeated selection. It records native
pixel readback, completed-frame count, completion time and interval separately.
The lab, its route, private device identifiers, traces and screenshots never
ship in production or in tracked evidence.
