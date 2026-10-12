# Common rules for OPAX web, ops and data lanes

- No push, no deploy, no production writes. The orchestrator merges and deploys.
- Never call production Ask, generation, voice or auth routes. Fixtures and stubs only.
- Never print process command lines or arguments.
- **Donors (Jake's final decision, 12 Oct, replacing the 10 Oct withholding):** individual donors are public record and are **named** in every public view where the identity is a confident match. Every donation maps to return entries under one exact donor-name string in one jurisdiction (whitespace and case only; no fuzzy merging across spellings, aliases, sources or jurisdictions). Anything uncertain is aggregated as "Donors not named (N)". Per-donor placeholder nodes are never exposed. Donor pages are indexable and carry a "Report a correction" link (corrections@opax.com.au, 2 business days). Keep the no-causation wording beside votes and speeches. Don't regress the confident-match gates.
- **Repo text:** the old ban on donor names in repo text is lifted for real public-record names. Test fixtures still use invented names, and private people who aren't donors are still never named.
- votes.json stays schema 1: the iOS app decodes it strictly.

- **Never use `pkill -f`, `killall` or any pattern-based kill.** Worker prompts sit in their process command lines, so a pattern like `pkill -f "npm ci"` also kills other workers (this caused the 10 Oct 16:12:49 mass SIGTERM). Kill only PIDs you started yourself, recorded with `$!` or a pidfile, or use the tool's own stop command.
- **Never run a deleting command (`rm`, `find … -delete`, `git clean`, `rsync --delete`) after a `cd` that could fail.** Give the target as an absolute path inside the command itself (`find /abs/dir -name … -delete`), and check the directory exists first. On 11 Oct a `cd` into a missing folder made `find . -name '*before*' -delete` run in the main checkout and destroyed untracked QA evidence.
- **Clean up your own scratch space when you finish:** remove the temporary directories you created under `/tmp` or `/private/tmp` (merge copies, scratch D1s, review fixtures), using their absolute paths. Leave anything you didn't create. On 12 Oct, finished review copies had piled up to about 7 GB and pushed the Mac's free disk under 35 GB.

- **Ports 8910 and 8961 are reserved** for the iOS and Android fixture servers on device runs. Web dev servers use 8962 and up, never those two.

## Heavy runs and web gates

From the lane worktree root, use the versioned tools:

```sh
.ops/tools/web-gates.sh lane
.ops/tools/web-gates.sh merge --base origin/main
.ops/tools/web-gates.sh review --base origin/main
OX_HEAVY_LOCAL=1 .ops/tools/web-gates.sh merge --force
.ops/tools/ox-heavy-remote.sh --tier merge --force
```

Lane gates select changed-file dependants (imports and asset references) plus the
fixed donor privacy/publication, directory, MCP, analytics and deploy-chain smoke
set in `.ops/tools/gate-map.json`. Narrow lanes check changed served assets and
representative privacy assets from every jurisdiction; the complete publication
corpus sweep is a merge/pre-deploy gate. For unchanged donor code, four privacy smoke
cases run; a donor-related change runs its exhaustive file. A missing/renamed
smoke case fails the gate until the maintained map is updated. Unknown changes
require the full suite. A lane
pass is never a merge/review pass. Merge candidates run the complete production
release build, check, full suite, local Wrangler dry-run and votes schema/byte
checks once on the captured candidate tree. Re-review the identical tree with
`review`; a recorded full pass skips both the tests and the heavy queue.
Narrow lanes regenerate ignored search fixtures and stamps; the full release
build remains a merge/pre-deploy gate.

Passes live in ignored `.ops/gate-cache/`, keyed by the snapshot's `git write-tree`
hash, exact Node version and SHA-256 of `portal/package-lock.json`. Snapshots
include staged, unstaged and new non-ignored source without changing the lane's
index. A change during a run invalidates its pass. The captured base SHA is used
for selection and votes checks; no gate fetches or advances main mid-run.
The runner-source hash also invalidates passes if shared gate tooling changes.
Narrow lanes cache generated search fixtures by export JSON blob hashes, the
catalogue builder's transitive imports, Node, lockfile and runner source. Cached
fixture files are checked against their checksum inventory; privacy/publication
and affected tests still run. Presentation edits can reuse that build output.

`ox-heavy.sh` retains the existing `/tmp/opax-heavy.lock` directory/owner-pid
protocol and nice level 10. If the Mac is occupied and the desktop is free, known
gate/test/check invocations run on `ssh desktop` in an isolated `gate/<label>`
snapshot under `~/opax-work/heavy.lock`. Set `OX_HEAVY_LOCAL=1` to stay local.
Unknown commands and all deploy commands stay local. Standalone asset build
commands also stay local: their outputs are needed by the caller's deploy, while
remote gate builds live in an isolated snapshot. Legacy `npm test` and `check`
calls routed remotely run the complete gate chain.
No production credentials, untracked ignored files or local node_modules are
transferred. The desktop uses Node 24.21.0 from nvm and installs its own packages.
Linux runtime/type/test steps use an isolated user/network namespace with a clean
loopback (`unshare -Urn`), leaving host interfaces and other jobs alone. Runtime
types are checked before the expensive release build so runner failures fail early.

Migration: install the versioned `.ops/tools/` scripts beside the existing shared
wrapper after its script tests pass, retaining an `ox-heavy.sh.pre-desktop` backup.
Already-running jobs retain their existing owner PID/lock and finish normally.
Make new desktop heavy jobs use this wrapper; older manually started desktop
jobs must finish before benchmarking the new runner. Roll back the wrapper from
the backup without removing or altering a live lock. Deploy scripts/workflows do
not change. The only Git transfer is to the desktop's gate ref, never upstream.

For profiling, all runs are niced and use a whole-file Node reporter (includes
fixture setup and hooks):

```sh
OX_HEAVY_LOCAL=1 .ops/tools/web-gates.sh profile --matrix 4,6,8
.ops/tools/ox-heavy-remote.sh --tier profile --matrix 4,6,8,12,16
node --test .ops/tools/test/*.test.mjs
```

Profiling always runs fresh. A successful full profile (or a lane fallback that
ran the complete build and every test file) also records a full gate
pass for that exact key, since it runs the complete build/check/dry-run chain.

Full-suite privacy and MCP coverage is mandatory. Retired donor-policy assertions
are replaced by the confident-match lane together with its production classifier;
gate-speed must not remove them ahead of that integration. Check
`web/donor-withhold` and `briefs/donor-confident-match-r4.md` before changing that
coverage. Feature tests are retired only once the removal is present on main.
The committed confident-match implementation is on `web/donor-failclosed`
(`298fa84cd` at this audit). Its `donor-confidence` and `donor-provenance` tests
join the always-run smoke set when present, and its money-conservation smoke name
is recognised. Retired withholding cases remain that lane's responsibility.
