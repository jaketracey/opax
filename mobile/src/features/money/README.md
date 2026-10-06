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

## Records and accessibility

Native adjustable financial-year rails also have earlier/later buttons and
VoiceOver increment/decrement actions. Industry, donation, grant, contract and
inflation controls preserve the web's year semantics, including undated rows.
Public-money figures stay separate from donation totals. The full-height native
focus sheet uses the app's figures, record sources and as-at components. An
explicit native person profile path opens its page; other profiles open the
website. Party totals remain across all industries within the chosen years,
with that distinction stated when the relationships are industry-filtered.

The ranked donor list is virtualized and includes party, amount, years and
sources. It is the initial view while the VoiceOver setting is unknown, and the
default when VoiceOver is enabled. All controls have accessible names; text is
uncapped through AX5. Reduce Motion disables the idle orbit before the setting
has answered. Focus changes are immediate, so no camera fly animation runs.

Rendering stops on route blur, background and scrolling the map out of view.
Switching to the list or leaving releases Three resources; GLView destroys its
owned native context on unmount. Context errors remove the GL view and offer a
fresh one. Cleanup continues if the native context has already been destroyed.
Expo's native `isContextLost()` is a stub, so the adapter also checks GL errors
and catches invalid-context exceptions.

## Verification

Journey 23 starts at Today, verifies native pixels and completed frames, captures
an orbit sequence, changes year and industry, focuses through the same selection
callback as a tap, checks held figures, opens the guarded source and reads the
list. Its diagnostic and accessible journey actions are substituted with a
production stub before Metro traverses them. A separate cold relaunch verifies
the map and list from disk cache with the fixture server stopped.

The development/e2e-only `opax://money-map-spike?benchmark=1&seconds=300&leave=1`
lab automates a five-minute orbit and repeated selection. It records native
pixel readback, completed-frame count, completion time and interval separately.
The lab, its route, private device identifiers, traces and screenshots never
ship in production or in tracked evidence.
