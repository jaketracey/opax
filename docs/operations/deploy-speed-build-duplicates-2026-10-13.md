# Build duplicates: 13 October 2026 addendum

Jake approved checks-audit items 12–15 at 20:15. This change follows the matcher integration at `ea5a53af95ca9937a7ddbbe0ec896b1cfdd586b1` on `web/deploy-speed`.

The gate generates Worker types once, before release generation. It then runs `check:built`, which derives TypeScript, token, stamp and existing publication checks from the ordinary inline `check` recipe, removing only its initial type-generation command. Standalone `check` is unchanged. Future check additions and policy removals have one definition. An unexpected recipe fails rather than silently skipping checks. The separate preliminary SPA-shell build is removed: the release or narrow-lane stamp generates the shell after Methods has been updated.

Methods no longer runs in `build:search`. Search, hubs and crawl read structured exports rather than the Methods HTML. Stamping continues to generate Methods, then the SPA shell, before calculating asset stamps. Standalone stamp checks still reject stale Methods and shell output.

Each stamp/check invocation computes one module-reference inventory. Handwritten immutable rules and the generated immutable list share it and a fresh per-invocation hash cache. Each referenced module is hashed once. Hashes are never reused after a write or across invocations; changed bytes and new bare references still invalidate immutable caching. The asset-cache test also shares its reference inventory between assertions.

Disposable gates reuse dependency installations only when the manifest, lockfile, npm configuration and exact toolchain match. The key includes Node/npm versions, ABI, platform, architecture, OS release, libc, runner image, installation settings, native-build environment and installer source. Receipts verify all files, executable modes, directories and symlink targets. Restore copies packages into each gate checkout; tests cannot mutate the persistent cache. Missing or damaged entries run `npm ci`. Credentials are not stored in receipts or printed.

The versioned gate-tool sources are carried from `web/gate-speed` commit `6569871fd6998c3be0d68356fb6eabac5823aa77`, so the runner changes can be merged with this lane. Concurrent checks-lane edits supply a bundled schema-1 votes validator with the runner; these edits are incorporated. This lane additionally uses `--unchanged-votes` to enforce its byte-preservation requirement on both fresh and cached gates without restricting data-refresh lanes. The not-yet-merged D1 harness is an optional named smoke target and remains mandatory whenever present through the table filename rule. Every existing table and privacy test remains selected.

Privacy-sweep removal belongs to `web/remove-donor-matcher`. This addendum does not change the sweep scripts or their pipeline positions. `deploy.yml`, its test skipping, triggers, permissions, secrets and restamp-commit step are unchanged: CI already performs one installation and one type-generation run.

## Measurements on the Mac

All runs used Node `v24.21.0` and nice level 10. Whole-build samples ran consecutively from identical saved inputs on the same checkout, using full SQL mode.

| Work | Before | After |
|---|---:|---:|
| Preliminary shell build | 0.786 s | removed |
| Release build | 232.575 s | 239.693 s |
| Check following type generation | 3.475 s | 2.757 s |
| Stamp check, median of five runs | 1.638 s | 1.352 s |
| Fresh dependency installation and receipt | — | 9.033 s |
| Restore into a separate checkout | reinstallation | 4.401 s |
| Validate an existing installation | reinstallation | 2.135 s |

Changing host load masks the small reductions in the complete release samples. No whole-build speedup or new CI duration is claimed from these samples. The verified savings are the removed invocations and cheaper checks/restores. The prior deploy-speed estimate still applies; this addendum removes a Methods invocation and repeated module-inventory work from CI, while the larger type/shell/dependency savings apply to gates.

## Byte equivalence and gates

The reference is the previously approved build, before this addendum. Its package and stamp scripts were saved, and public/src inputs were copied before either run. The modified build started from the same saved inputs. Comparison uses exact paths and raw SHA-256 bytes without normalizing line endings or SQL.

| Scope | Files compared | Differences |
|---|---:|---:|
| `portal/public` | 27,206 | 0 |
| Generated `portal/src`, including the private prefilter and declaration | 5 | 0 |
| SQL chunks and manifest | 90 | 0 |
| Release total | **27,301** | **0** |
| Broader check: all src plus Worker types | **27,404** | **0** |
| Restored dependency files and links | 19,207 | 0 |

Release inventory SHA-256: `87d454b6e8b88aba68d9991777d12ff221b517e60686f1620f9bd478b4fd1c93`.

All-output inventory SHA-256: `faa65d6e79e97acf94b073692217e071d78fd06164d8e1e235c70cba39d3a992`.

`votes.json` SHA-256 remains `a77128dc0e1e1b3fdaa4bf84501e2c94af3125dea3cf0b2dffbc688a49d68546`.

Local gates pass: targeted build/cache/Methods/identity/table and placeholder cases, runner self-tests, standalone `check`, full `build:release` and Wrangler dry-run. No tests were skipped. The first desktop run passed 1,752 of 1,753 tests and caught one inline-check wiring assertion. Restoring the ordinary inline `check` recipe and deriving `check:built` from it fixes that assertion without editing or weakening the retiring privacy test. The revised recipe and shared runner edits are validated before a fresh full desktop run. Its receipt is retained separately in ignored `.ops/gate-cache/` so the captured candidate tree remains unchanged during validation.

Machine-readable timings, gates and digests: [deploy-speed-build-duplicates-2026-10-13.json](deploy-speed-build-duplicates-2026-10-13.json).

No upstream push or deployment was performed.
