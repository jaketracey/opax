# Round 3 promotion — 19 October 2026

The orchestrator explicitly approved Codex review r3 at
`d4930f08d3cbe29a548ebf7644cf0cc8bf082d75`, under Jake's 19 Oct option A
decision. The eight reviewed inputs are byte-identical to that commit.
`review.json` records the full SHA, the same digests and the supplied
`approved_by` wording. No source was requested or input regenerated.

`python3 scripts/promote_hub_data.py vic-advertising` wrote
**3,541,577 bytes and 1,239 cells** to the shared public advertising asset.
SHA-256: `439d7a9ac5983bde325087237270e8f2585dd92aa7dcb1b1d4063ac8a2b5ca1b`.
All **62/62 checks pass**: 42 source-total identities, 16 exact component
comparisons and four within printed precision. The asset restores the approved
40 descriptions and nine campaign tables; no amount or total was invented.

Actual local Wrangler at `http://127.0.0.1:8990` serves the promoted bytes
exactly and renders the register at 390/1440, with the Money → Public money
link present and no staged-preview banner. The source descriptions match the
promoted records; table search and CSV work. The phone table and its own
container/scroll width are all 350 px, including without JavaScript. No page
errors. The bounded private asset directory links to the real public file and
frontend assets; no staging injection or production binding is used.

Local verification finds **0 person entities, person links, person facets or
person-search entities**. Source names stay within their authorised record;
organisation-only facets and directory joins remain unchanged. All **30 held
attachments** remain held for robots/file-rights reasons, and none is exported.
Supplier withholding remains covered by the lane's tests.

**59 Python tests and 101 Node tests pass**, including advertising, promoter,
shared register, GFS, tax expenditures and navigation. `npm ci` preceded Node
tests. TypeScript, `npm run -s check`, source verification dry run, promoter
dry run/public-byte check, Wrangler deploy dry run and `git diff --check` pass.
`votes.json` remains schema 1 and byte-identical to the reviewed commit and
`origin/main`. The eight source/staging digests remain unchanged.

Coverage retains **LIVE 19 Oct 2026** for the existing register and updates its
promoted count to 1,239. The restored-text asset is locally promoted; its
deployment remains the orchestrator's step. No push, deployment, nightly,
production Ask/generation/voice/auth or production database write occurred.
Local Wrangler is stopped by its recorded PID and the temporary navigation
fixture link is removed. [Validation](r3-promotion-validation.json).
