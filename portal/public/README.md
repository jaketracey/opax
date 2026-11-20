# portal/public on the app release line

The exports in this folder are a snapshot from September 2026 (`agencies.json`
and the grant program files are dated 21 September; there is no `divisions/`
folder). They look current, but they are not. Live data is main's: the nightly
refresh commits it to main, and opax.com.au serves main's exports.

- To check a figure, read main's copy, for example
  `git show origin/main:portal/public/agencies.json`, and compare its
  `generated_at` with this one's.
- To regenerate an app file from the exports (Today's question, the Explore
  rounds, the state outlines), pass an up-to-date main checkout with
  `--portal <main checkout>/portal`. The generators in `mobile/scripts` stop
  when an export is older than main's (`mobile/scripts/export-freshness.mjs`).
