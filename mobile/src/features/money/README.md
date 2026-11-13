# Money map

The native `/money` screen draws the held federal, Queensland, Victoria and
Tasmania graph catalogs. Today links to it after the daily edition; the Person
party-receipts record links to the party's map focus and preserves its web
link. State and federal returns are never combined.

## The 2D map (November 2026, `map/`)

The map is a Skia stage. Every layer is recorded once into an `SkPicture`
(the thin and thick flows, the small and large discs, the focus) and replayed
by the GPU under one `Group` whose transform is a derived value of the camera
shared values `tx`, `ty`, `k`. Pan, pinch and the flick run as worklets on the
UI thread; the only JS work during a gesture is none. The expo-gl + three.js
scene it replaces (`NativeMoneyScene`) uploaded typed arrays through Expo's
native queue every orbit and was capped at 30 fps.

| Module | Role |
|---|---|
| `scales.ts` | How a figure becomes a size: disc area ∝ amount (radius = `NODE_SCALE`·√amount, floor `NODE_FLOOR`), line width ∝ √amount with a floor and a cap; the public-money hubs are a fixed ring (a different register, never summed with donations). The legend states all of it. |
| `model.ts` | `buildModel(view)`: the filtered graph as marks, with clusters (parties first, then by size), each node's flows strongest first, and totals by flow type. `nextAlongFlows` walks the strongest flow not already on the trail. |
| `layout.ts` | A deterministic 2D force layout on typed arrays (seeded LCG, d3-force physics ported from the 3D scene, a counting-sort grid for the pairwise forces, so a tick allocates nothing). Parties at the origin, industry clusters on an aspect-stretched ring grown until no blobs overlap. One layout per loaded graph (`layoutFor`), ticked over a few frames (`TICKS_PER_FRAME`) so the discs glide into place; under Reduce Motion it settles before the first draw. The federal graph settles in 192 ticks. |
| `camera.ts` | Pure, worklet-safe camera maths: fit, clamp (the world box's centre never leaves the inset viewport), zoom about a focal point, fly targets, and the level-of-detail ramps (small discs and thin lines fade in as the reader comes closer; cluster names give way to node names). |
| `hit.ts` | Tap picking on a uniform grid over the drawn discs; the allowance grows as the reader zooms out. |
| `scene.ts` | The draw calls for each layer against a `Painter`; `skia-painter.ts` records them into pictures, `countingPainter` is for tests and the probe. |
| `labels.ts` | Which names are drawn (cluster names, the four largest parties, the largest discs, the focus and its flows) and a greedy de-overlap that runs on the UI thread as the camera moves. |
| `MoneyMap.tsx` | The stage: the canvas, the gestures, the camera cache per jurisdiction, the label overlay, the overview and the e2e probes. The chrome drives it with a `command` (fit, zoom, fly to) held in state. |
| `MoneyMapLabels.tsx` | Label slots as `Animated.View`s placed on the UI thread; native `Text`, so Dynamic Type and Bold Text apply. |
| `MoneyMapPanel.tsx` | The bottom panel: the two totals and the legend at rest; with a focus the disc's name, kind and figure, Previous and Next flow, Open record and its flows (each opening the record at the other end). Two heights, dragged by the handle. |
| `MoneyMapSearch.tsx` | Search to fly: donors, parties and the hubs by normalised organisation name; choosing one flies there and focuses it. |
| `MiniMap.tsx` | The overview: cluster blobs and the viewport frame (UI thread); tap to move the view. Hidden at accessibility sizes. |
| `MoneyMapLegend.tsx` | Reference discs ($1m, $100m, $1bn), reference lines, the industry swatches, parties grey, public money ring, and the floor and cap. |

`MoneyScreen.tsx` has two modes. **Map:** the stage fills the screen under a
floating card (jurisdiction, one line saying what the map shows, the List |
Map picker), the control stack (search, zoom in, zoom out, fit), the overview
and the panel. **List:** Donors, Parties and Public money, the full accessible
data, and the default while VoiceOver is on or not yet known.

Ways around: pinch about the focal point, pan with momentum (rubber-banded at
the map's edge), double tap to zoom, the zoom and Fit buttons, tap a disc to
focus it, search to fly, Next and Previous along the strongest flows, the
overview, and every action as a VoiceOver custom action on the stage. Android
Back closes the search, then collapses the panel, then clears the focus; the
stage leaves the leading 24 pt to predictive back.

State across returns: the filters, the focus (`select`) and the view are route
params, written through the screen's navigation object (w12-fix2), so a record
visit returns to the same map; the camera is kept per jurisdiction in memory.

Filters: years, industry, layers, inflation (the shared sheet) plus the map's
own **Minimum flow** facet (`min` route param, whole dollars). `moneyView`
drops flows under it; the record and donors screens read the same param.

Honesty: every figure in the panel is the record's own figure in the window
and opens the record. Sizes are proportional and stated. No copy implies that
one flow led to another.

## Records and accessibility

Public-money figures stay separate from donation totals. The record screen
(`MoneyRecord.tsx`) uses the app's figures, record sources and as-at
components. An explicit native person profile path opens its page; other
profiles open the website. Party totals remain across all industries within
the chosen years, with that distinction stated when the relationships are
industry-filtered.

The stage is one VoiceOver element whose label says what is drawn and what is
focused, with custom actions (zoom in, zoom out, show the whole map, next
flow, previous flow, open the record, clear the focus). Every action is also
a real button. Labels use the `footnote` role; node names hide at
accessibility sizes. Reduce Motion: the layout settles before it is drawn, a
fly is a cut, a flick stops where the finger lifts, the panel does not
animate.

## Donor names (12 Oct 2026)

Individual donors are public record. As on the web, every donor is named as
its graph names it: on the map and its search, the donor list, party pages and
each donor's own record, and a donor row opens that donor's record. Nothing
groups or renames donors. `src/privacy/donorEntity.ts` keeps the web's
`isOrganisationDonor` as a data-quality check only (a Wikipedia search from an
organisation's record). `tests/donor-names.test.tsx` renders named donors from
invented fixtures.

## Verification

Jest: `money-map-layout`, `money-map-camera`, `money-map-hit`,
`money-map-scene`, `money-map-labels`, `money-map-model`, `money-map-panel`,
`money-min-filter`, plus the screen, navigation and donor-name suites.

Journey 23 opens the map, verifies the native raster (the stage's testID
carries the drawn pixel count in e2e builds), pans, changes the year and
industry through the Filters sheet, focuses through the same callback as a
tap, checks the held figure, opens the record's source sheet and its guarded
original, and reads the list. Journey 69 covers zoom (buttons, double tap,
fit), search to fly, Next and Previous, the panel's flows and Open record,
the minimum-flow facet, the focus and filters surviving a record visit, the
frame sampler line and the list. `.maestro/android/69-money-map-v2.yaml` is
the Android variant (hardware Back).

E2E builds only: `money-probe.e2e.tsx` reads the native raster back for the
pixel count and samples the interval of every frame in which the camera
moved, summarised each second as
`money-map-frames-<n>-p50-<ms>-p95-<ms>-max-<ms>` (a hidden line). Production
ships the stubs in `money-probe.production.ts`.

## Open product decision: Community funding state captions (11 November 2026)

`../money-public/Allocation.tsx` keeps the headline figure national: its
value and count use every record in the selected stage (Awards, Invitations
or Earlier grants). Choosing a state narrows the project rows and their list
caption. For example, `state=vic` gives the list caption a Victoria scope
while the figure and its caption still describe all states.

The figure should stay national. Product needs to decide whether its caption
should explicitly say “across Australia” when a state filter is active, or
whether the existing separation between the figure and the state-scoped list
caption is sufficient. This lane leaves that copy unchanged.

After the copy decision, the implementation belongs in
`../money-public/Allocation.tsx`, with coverage in
`../../../tests/design-p5-C-money.test.tsx` for all three stages, both with and
without a state filter. The test should keep the national value and count
fixed and check the agreed scope wording independently of the filtered list.
