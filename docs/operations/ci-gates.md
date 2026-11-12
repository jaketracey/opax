# Cloud test gates

`Gates` runs on pull requests to `main` and `ios/apple-design`, pushes to
`ci/**`, and manual dispatch. It uses standard GitHub-hosted Linux runners,
read-only repository access, no secrets, and no uploaded artifacts. A newer run
on the same ref cancels the older run.

The mobile jobs install with Node 24.21.0, run TypeScript, lint and static QA,
and distribute the full Jest suite across six runners with four workers each.
Jest is called directly because the package test script supplies a conflicting
worker limit. Full git history is available for fixtures that read pinned blobs.
Commits without a `mobile/` tree report mobile checks as inapplicable in their
job summaries. A present but incomplete mobile tree fails normally.

The four portal shards each generate Worker types, build release assets and
typecheck, then distribute the full Node test suite with `--test-shard`.
Shard 1 also discovers all `portal/test/*_test.py` Python tests. The combined
portal job exceeded six minutes in the initial trial, triggering this split.
It uses the repository's frozen Python lock and version, including for Python
processes spawned by Node tests. The table build generates metadata locally.
The workflow does not deploy or call production services.

The older portal on `ios/apple-design` predates `build:release`. For that tree,
the workflow runs its complete pre-deploy sequence: search, social, grants map,
analytics, voice and asset stamping. It never invokes the deploy script.
That tree also predates the portal Python loaders. Discovery runs whenever
`portal/test/*_test.py` files exist and otherwise reports their absence.

Dates use `Australia/Melbourne` and the locale is `C.UTF-8`. Only the npm
download cache is retained. Public source and fixture output can appear in logs;
never add private fixtures or evidence to the committed tree.

## Reviewer and integrator flow

1. Commit the changes to test. The tested HEAD must contain `gates.yml`.
2. Run the local operations helper: `ci-gate.sh <worktree> <label>`. It force
   pushes HEAD only to `origin` as `ci/<label>`, finds the matching workflow by
   exact SHA and workflow path, watches it and prints every job's result and wall
   time. Exit 0 means all eleven jobs succeeded; 1 means failure; 2 means invalid
   usage or a missing workflow. Uncommitted edits are excluded.
3. Review the linked run and reuse its pass only for the exact tested SHA. A
   changed commit, including a new integration merge, requires another run.

The helper is kept in the git-excluded operations tools, outside this public
repository. It does not add the workflow to other lane branches. To test a lane
that lacks the workflow, make a throwaway local checkout, merge the workflow
commit there and push only that merged HEAD to a `ci/*` ref. The lane stays at
its original commit. Repeating the helper for an unchanged SHA reuses the
existing matching run if the push creates no new run.

The integrator can remove temporary `ci/*` refs after review. Keep the two
passing trial refs until their evidence has been reviewed.
