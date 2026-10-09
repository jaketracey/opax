Search toolbar padding follow-up to `4874397b`, on `web/search-segment`.

All toolbar buttons, including Passages and Briefs, now have the same 16px
horizontal padding. Icon gaps retain their normal spacing when text is enlarged,
so the wider toggle and the other controls still fit together at 1024px with
200% root text size. The summary takes its own row above the controls at 1024px
and 820px. Labels remain whole, heights remain equal, and repeated mode changes
preserve identical bounding boxes for all four controls.

New after shots are stored under
`/home/jake/opax-work/wt/web-search-segment/results/search-segment-padding/after/`.
The original before and after artifacts remain in `results/search-segment/`.

| Width | Chromium | WebKit |
| --- | --- | --- |
| 1440 | [Passages](../../results/search-segment-padding/after/chromium-search-1440-passages.png), [Briefs](../../results/search-segment-padding/after/chromium-search-1440-briefs.png) | [Passages](../../results/search-segment-padding/after/webkit-search-1440-passages.png), [Briefs](../../results/search-segment-padding/after/webkit-search-1440-briefs.png) |
| 1180 | [Passages](../../results/search-segment-padding/after/chromium-search-1180-passages.png), [Briefs](../../results/search-segment-padding/after/chromium-search-1180-briefs.png) | [Passages](../../results/search-segment-padding/after/webkit-search-1180-passages.png), [Briefs](../../results/search-segment-padding/after/webkit-search-1180-briefs.png) |
| 1024 | [Passages](../../results/search-segment-padding/after/chromium-search-1024-passages.png), [Briefs](../../results/search-segment-padding/after/chromium-search-1024-briefs.png) | [Passages](../../results/search-segment-padding/after/webkit-search-1024-passages.png), [Briefs](../../results/search-segment-padding/after/webkit-search-1024-briefs.png) |
| 820 | [Passages](../../results/search-segment-padding/after/chromium-search-820-passages.png), [Briefs](../../results/search-segment-padding/after/chromium-search-820-briefs.png) | [Passages](../../results/search-segment-padding/after/webkit-search-820-passages.png), [Briefs](../../results/search-segment-padding/after/webkit-search-820-briefs.png) |
| 390 | [Passages](../../results/search-segment-padding/after/chromium-search-390-passages.png), [Briefs](../../results/search-segment-padding/after/chromium-search-390-briefs.png) | [Passages](../../results/search-segment-padding/after/webkit-search-390-passages.png), [Briefs](../../results/search-segment-padding/after/webkit-search-390-briefs.png) |
| 1024, 200% text | [Passages](../../results/search-segment-padding/after/chromium-search-1024-text-200-passages.png), [Briefs](../../results/search-segment-padding/after/chromium-search-1024-text-200-briefs.png) | [Passages](../../results/search-segment-padding/after/webkit-search-1024-text-200-passages.png), [Briefs](../../results/search-segment-padding/after/webkit-search-1024-text-200-briefs.png) |

The same check also regenerated Ask, homepage, homepage prototype and UI
workbench shots at 1024px and 390px, named
`{chromium,webkit}-{ask,home,home-prototype,ui-workbench}-{1024,390}.png` in that
directory. `measurements.json` records 48 mode-switch measurements, including
the segments' computed padding and the four control boxes.

Validation with Node 24.21.0:

- `scripts/check_search_toolbar.mjs`: Chromium and WebKit passed at all six
  viewport/text-size combinations, with repeated mode switches. Added computed
  checks assert 16px padding on both sides of every toolbar button and the
  separate summary row at 1024px and 820px. Existing whole-label, equal-height,
  stable-position and overflow checks still pass.
- `npm run build:search`, then `node --test test/*.test.mjs`: 1,026 passed, zero
  failures or skips. The suite used the same temporary local network namespace
  as the original verification; it has working loopback and no external access.
- Asset stamping and stamp check passed; `git diff --check` passed.
- `votes.json` is unchanged. Generated search-catalog churn was discarded after
  the tests. No push, deployment or production writes were performed.
