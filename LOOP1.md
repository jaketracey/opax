# Loop 1 — phone reading and layout

Read the recent words and Explain reports. Baseline 390px captures showed undersized action targets, three separate action lines and a tiny ruler interrupting the answer/action sequence.

Changed the answer measure and paragraph rhythm, serif heading hierarchy, sentence-case source disclosure, two-row phone actions, and moved the ruler inside Sources. Chat now uses a fixed phone composer with safe-area padding and a clearly separated sans question / serif answer thread.

Reviewed top, answer, actions, sources, retrieved, options, chat question, chat sources, follow-ups and one replayed follow-up at 360, 390, 430 and 1280. The two immediate corrections were masthead scroll clearance and larger phone ruler year labels. No horizontal document overflow; phone composer bottoms exactly match 780, 844 and 932px.

Still poor: source titles alone say little (many are merely “Bills”); metadata is crowded; chat incorrectly places cited sources beyond the first five in “also retrieved”. Follow-ups exist only in chat. Loop 2 addresses these. The cached answer itself has three very long paragraphs; preserve its wording, improve navigation through real citation ranges.

Verification: node --check portal/public/app.js; git diff --check. Static local public directory; actual gambling payload fetched once with x-opax-cache: HIT. All browser ask/follow-up requests intercepted: chat replies are local replay fixtures, not generated answers. No Worker/configuration changes.
