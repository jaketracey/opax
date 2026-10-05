# Native money map rendering spike

Phase 1 lab at `opax://money-map-spike`, development/e2e only. Its route and
test screen are excluded by the shared production Metro block list. This is
not a shipping `/money` screen. Continue to Phase 2 only after the full-graph
rendering, interaction and memory gate is supported by measurements.

**Decision, 5 October 2026: stop at Phase 1.** The assigned surfaces are
simulators. The 17 Pro simulator exceeded the 300 MB native process-footprint
limit in the short run, and a longer 16e run exceeded it after allocation
pooling. Do not promote this lab to a shipping feature. No physical phone was
connected; these results do not establish phone GPU, thermal or jetsam behaviour.

| Simulator | Cold graph-cache first verified frame | 10 s JS frame interval median / p95 | JS submission median / p95 | Native footprint peak |
| --- | --- | --- | --- | --- |
| 16e, iOS 18.4 | 1,446.4 ms | 16.67 / 16.74 ms | 6.45 / 12.13 ms | 260.6 MB |
| 17 Pro, iOS 26.5 | 1,385.7 ms | 16.67 / 16.73 ms | 6.40 / 12.08 ms | 304.7 MB |

The ten-second adapter runs submitted 602 frames each and verified 108,112
and 101,521 non-paper pixels respectively. They do **not** prove 602 completed
GPU frames: Expo GL submits work asynchronously. The pooled 60-second 16e
experiment verified its first frame in 1,443.7 ms but reached **769.4 MB** and
was terminated before completion. Shared host load also rose during that run,
so its timing cannot isolate phone or GPU performance. Peaks use `footprint`
physical process accounting, not RSS; MB is decimal. Raw evidence, executable
prototype bundles and orbit images are retained under ignored `mobile/private/`.

Next options are bounded native frame submission with completion measurement
and a physical-device check, fewer nodes or folded industry hubs, or a 2D Skia
map alongside the required ranked list. None is implemented as Phase 2 here.

The baseline is `7b70d11f`: Three.js **0.185.1**, matching the web lockfile,
and SDK-matched Expo GL **57.0.2**. `ported/force3d.ts`, `palette.ts` and
`map-types.ts` are copies of `portal/graph/`, formatted for the native tree.
The two edge shaders are extracted verbatim from `map3d-engine.ts`; a test
checks parity. No Three loaders, textures, images, fonts or remote assets are
used by the scene. Public graph JSON goes through `ApiClient`, the exact
static route allow-list and the existing disk cache.

`NativeMoneyScene` replaces the browser adapter: supplied-context canvas
surface, instanced sphere nodes, merged camera-facing flow ribbons, native
pan/pinch/tap input and projected native text. `native-context.ts` validates
OpenGL ES 3 and removes Expo's inherited WebGL1 brand for Three's browser-only
context check; the native methods stay bound to the original context. The camera, light intensities,
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

The optional development/e2e deep link `opax://money-map-spike?benchmark=1`
automates ten seconds of orbit; `&seconds=60` is the sustained experiment.
`money-spike-result.json` in the app cache records timings and pixel probes.
The 60-second experiment did not complete its final GPU readback. Stop the
app promptly after collecting evidence: continuous rendering currently exceeds
the memory budget. Do not interpret callback counts as a native presentation
probe for the shipping journey. The full Phase 2 journey, AX5 list, Today entry
and source/card controls have deliberately not been built after the failed gate.
