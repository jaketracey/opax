# Native money map rendering spike

Phase 1 lab at `opax://money-map-spike`, development/e2e only. Its route and
test screen are excluded by the shared production Metro block list. This is
not a shipping `/money` screen. Continue to Phase 2 only after the full-graph
rendering, interaction and memory gate is supported by measurements.

The baseline is `7b70d11f`: Three.js **0.185.1**, matching the web lockfile,
and SDK-matched Expo GL **57.0.2**. `ported/force3d.ts`, `palette.ts` and
`map-types.ts` are copies of `portal/graph/`, formatted for the native tree.
The two edge shaders are extracted verbatim from `map3d-engine.ts`; a test
checks parity. No Three loaders, textures, images, fonts or remote assets are
used by the scene. Public graph JSON goes through `ApiClient`, the exact
static route allow-list and the existing disk cache.

`NativeMoneyScene` replaces the browser adapter: supplied-context canvas
surface, instanced sphere nodes, merged camera-facing flow ribbons, native
pan/pinch/tap input and projected native text. The camera, light intensities,
fog, force layout, palette and logarithmic donation-value sphere sizing come
from the web. It does not yet port semantic cluster folding, label collision
measurement, the complete focus card, filters, state catalogs or a list view.

Rendering stops on route blur and background. Scene resources are disposed on
unmount; GLView owns and destroys the native context. A rendering exception
removes the GLView and offers a fresh context. Expo GL's native
`isContextLost()` currently returns `false` unconditionally; native context-loss
notification/recovery needs further work before shipping.

The lab verifies native `readPixels` after a render, checks GL errors, and
rejects a blank paper surface. It records cold-cache route-open to verified
first frame, then ten seconds of continuous camera orbit. Frame intervals and
JS render-submission time are separate quantities. Neither establishes GPU
completion time or sustained performance on a physical phone. The fixture-only
journey captures three orbit positions, the probe, timing and Labor's exact
disclosed-receipts figure from the pinned graph.

For Phase 2, proposed entries are a single Money map row after Today's daily
edition, and a link beside the existing Person → Party receipts record. Keep
the original source link. There is no native party page at this baseline.
Shipping requires the requested VoiceOver-default ranked list, AX5 controls
and focus sheet, year/industry/layer/jurisdiction controls, all state route
reviews/pins, offline journeys and release verification. The lab alone is not
evidence that those requirements are complete.

Measurement evidence belongs under ignored `mobile/private/`; never commit
device identifiers, screenshots, signing information or private run logs.
