# Victorian advertising — promoted, deploy pending

19 October 2026 Melbourne. The orchestrator explicitly approved
`961e07ac91cf5fc9ba21c5f6588f96170f715886` after Codex reviews r1 + r2. The
remaining r2 P1 concerns pre-existing federal grant narrative on main and is
outside this lane; no unrelated search-catalog change was made.

`data/staged/vic-advertising/review.json` records that full reviewed commit,
all **eight exact input digests** and the supplied `approved_by` wording.
Every input remains byte-identical to the reviewed commit. No source was
requested or input regenerated during promotion.

The explicit command `python3 scripts/promote_hub_data.py vic-advertising`
wrote **portal/public/gov-advertising/data.json: 3,410,870 bytes, 1,194 rows**.
The asset includes the reviewed promotion manifest and has SHA-256
`e7d1138e6c901b2456a74ef3f08698dcfada75a2fbd3318b0d0cf58e77f66a75`.
Its separate dry run and `--check-public --votes-reference origin/main` pass.
The reconciliation remains **62/62**. Fixed-string private-name audit: **0
matches** in the promoted asset; only the count is recorded here.

The unchanged inventory has 95 items (65 HTML, 13 Word, 17 PDF). The selected
publisher-authored HTML numerical material uses the linked CC BY 4.0 grant,
with © Copyright State Government of Victoria attribution and the documented
branding, third-party and creative exceptions. Thirty attachments and nine
campaign tables remain held; 40 advertiser descriptions are among the 279
narrative-field holds. Promotion does not clear those holds or native app work.

## Local verification

Actual `wrangler dev --local` on **http://127.0.0.1:8990** serves the promoted
asset byte-for-byte and renders `/register/gov-advertising` with status 200.
`/gov-advertising/ready.json` returns `ready: true`, count 1,194. The browser
opens **Money → Public money → Government advertising** on desktop and the
phone sheet. The page has no staged-preview banner; no product copy change
was needed because the banner belonged only to the earlier QA harness.

The full public directory contains about 19,700 asset files. Its local watcher
opened about that many descriptors, and macOS rejected spawning the runtime
with EBADF. The successful local configuration uses a private asset directory
with read-only links to the actual promoted file and frontend assets. It runs
the unchanged Worker source with no production bindings, secrets or triggers.
No input or dependency was changed to work around this local tooling issue.
CLI reference: [Wrangler local development](https://developers.cloudflare.com/workers/wrangler/commands/workers/#dev).

A second isolated Wrangler on **http://127.0.0.1:8991**, with the advertising
asset absent, verifies the shared federal held-state fallback: status 200,
“Source verification pending”, licence unverified, unknown expenditure rather
than zero, noindex and `ready: false`, count zero. The federal browser harness
also checks this state at both widths, separately from its synthetic data.

The promoted browser harness checks hydration, filtering, CSV, 390/1440 layout,
menu activation and JavaScript-disabled SSR. At 390 the **table itself and its
container/scroll width are all 350 px**, with every amount cell inside. No page
errors. Four fresh screenshots in `portal/private/vic-advertising/`:

- `advertising-390-top.png`, `advertising-390-table.png`
- `advertising-1440-top.png`, `advertising-1440-table.png`

## Validation and boundary

`npm ci` ran before Node tests. **58 Python tests pass:** 22 advertising,
14 promoter, 12 ABS GFS and 10 tax expenditures. **100 Node tests pass:**
advertising, shared register, GFS, tax expenditures and navigation. Navigation
uses the same private offline calendar/election fixtures as round 1; its
temporary public asset link is removed after verification.

`npx tsc --noEmit -p .`, `npm run -s check`, the original-source verification
dry run, promoter dry run/public-byte check, Wrangler deploy **dry run**, and
`git diff --check` pass. `votes.json` remains schema 1 and byte-identical to
both the reviewed commit and `origin/main`, SHA-256
`9b7fc46c65185223d70a49b1bd8ee807327473330b02392963aa320b191b7a93`.
[Machine validation and screenshot hashes](promotion-validation.json).

Coverage now says **promoted, deploy pending**. No nightly, production writes,
production Ask/generation/voice/auth, push or deployment occurred. Local dev
processes are stopped by their recorded PIDs. The orchestrator marks the page
live after deployment.
