# Profile sweep baselines

`profile-baselines.json` preserves the exact API modules used by the two
historical profile selectors in `profile-sweep.ts`. The source commits were
local review heads and are unavailable from a fresh clone of the public repo:

- Round 1: `6d10a02852c3a318518afa3f49aa32865aaaf69b`
- Approved follow-up: `7d2b3be05d9081b585803bbfcdd5d61c7a744eb9`

Each entry records the original git path, its UTF-8 source and SHA-256. Only
API modules imported by the historical selector are included. The loader checks
each source hash before executing it in the existing restricted VM. All 3,540
member/block comparisons and the approved portrait licence exception still run
against the same pinned public data.

These are immutable regression fixtures. Do not regenerate them from current
selectors or change their expected results to make a regression pass.
