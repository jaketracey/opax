# Loop 3 — density, reading type and keyboard access

Restored three-column desktop donor/creditor rows while keeping the phone name/amount layout. Desktop receipt rows retain all 27 years with a 44px source target; phones retain ten 56px-plus rows until expanded. Long fallback passages now stop at a word boundary around 240 characters; stored briefs remain complete.

Removed 135 invisible links from each receipts table while retaining its header and numeric data for assistive reading. Added explicit focus outlines, 44px source/metadata targets, serif source-note text and restrained/reduced-motion rules for the redesigned sections. Detached funding renders are now ignored when navigating away and back quickly.

## Harsh review and corrections

- The first accessibility pass gave the Greens' short “Bills” link 44px height but only 35px width. Fixed before completion: speech-title links have both minimum dimensions.
- The long AEC source label left an external arrow stranded on its own line at 430px. Fixed: a concise AEC annual returns link, with the licence outside it.
- The third funding/receipt tile spent a full row on a number above a few words. Fixed: its phone number and label now share a baseline.
- The largest stored Greens and One Nation briefs still occupy substantial vertical space. This is intentional reading space; truncating a stored summary would remove context. Passage fallbacks are bounded and the title opens the full speech.
- The shared map's open detail panel still dominates the first phone scroll and contains its existing compact controls. This work does not alter graph renderers, map styling or global chrome. The measured target audit below covers the redesigned party sections, not those existing map controls.
- At 360px the receipts legend uses two lines and some donor names use three. Neither collides with figures; reducing their type would be a regression.

## Verification

- Passed `node --check portal/public/app.js`, `git diff --check`, and the focused receipt/member/brief checks from loop 2 after the final changes. No Worker or module was changed.
- Inspected the complete final 16-view matrix: all sections for all four parties at the three phone sizes and 1280×900, including the map's default open card and expanded/oldest receipts.
- All 16 final geometry checks: no page overflow; no donor/amount collision; 14px receipt figures; 13px percentage labels; ten visible phone rows and 27 desktop rows; no hidden source links.
- Keyboard Enter toggles 10 → 27, focus remains on the control, and collapsing restores ten. The first harness attempt needed focused-tab emulation and a complete Enter event; the corrected native keyboard probe passed on all four parties.
- Actual clicks opened the leading donor and applied each party's people-directory filter. No party members row leaked onto the donor page.
- At 390px, all visible links in the members, donor chart, receipt/funding and mentions sections measure at least 44×44px, including the corrected Bills link.
- Reduced-motion checks find no running animations in the redesigned sections. Normal-motion geometry checks also passed. The unchanged WebGL map was rendered with ANGLE/SwiftShader; this is not a real-GPU motion audit.
- Actual brief counts among five mentions: Liberal 4, Labor 4, One Nation 2, Greens 5. Missing briefs keep retrieved excerpts; no text was generated.

Evidence: requested scratchpad, `page-party-loop3-*.png`, `page-party-loop3-checks.json`, `page-party-loop3-geometry.json`, and `page-party-loop3-interactions.json`. Four additional `keyboard-expanded-390` captures were inspected at native phone width. Capture and focused-check scripts are alongside the evidence.

No deployment, cache-epoch edit, knowledge-box change, paid generation, shared helper edit or data-export edit.
