# Corpus and updater audit — 19 October 2026

The live manifest at the start of maintenance reported 988,649 searchable resources,
checked at 04:20 Melbourne. This is an index count, not the number of collected source
rows or a claim that every source is available.

## Source and publication checks

Official NSW, Victorian and ACT Hansard indexes match the stored source dates:
15 October, 24 September and 24 September respectively. These retained dates do
not establish a missed sitting. Federal Hansard is indexed through 15 October.

ParlInfo, federal interest discovery, Queensland Hansard, SA Hansard and
GrantConnect retain their existing access pauses. APH's latest response refers
the request internally; SA is investigating access. No subsequent Queensland or
GrantConnect approval was found in the bounded mailbox search. No denied source
was retried through a proxy or a browser identity.

Mailbox review also found Victorian Hansard/interest reuse approval and ACT gift
return publication approval. ACT's agreed public projection is restricted to
organisations and must retain dates, attribution and original source links. The
existing research-only ACT export includes individual donor identities, so that
approval does not safely enable the current export unchanged. Victoria's interest
register needs an acquisition adapter. These are separate publication additions;
private correspondence and its evidence links remain outside this public repository.

Budget, Victorian gifts, Victorian advertising and Treasury tax-expenditure index
probes matched the reviewed source receipts. ACT/Tasmanian bill index links matched
the reviewed snapshots; link equality alone does not verify each bill's unchanged facts.

The public connections/evidence export still covers its 8 September snapshot.
All four input sidecars are missing on the refresh VM, and no matching bundle was
found on the Mac. The documented desktop source was unavailable. A fresh matching
source/sidecar build and audit are needed to advance that coverage; a new manifest
timestamp cannot do so.

## Repairs

- Retain already published Victorian recent-vote citations when only the official
  Hansard PDF's six-character asset prefix changed. Person identity, the remaining
  PDF path and every recorded vote fact must match. Other regressions still block
  export. The live-DB temporary proof retained 942 citation rows across 23 divisions,
  allowing the independently verified projection to include 969 people and 8,951 votes.
- Persist weekly, monthly and FRL due dates outside git. Missed/failed work remains
  owed across restarts and skip modes. Completion requires accepted exports and a
  confirmed main push; FRL has fair scheduling without combining long crawls.
- Refresh supplier profiles after successful daily acquisition/registry rebuild;
  refresh federal grant profiles after successful acquisition/apply/recipient rebuild.
  Preserve last-good directories on failed or paused prerequisites and failed exports.
- Stop duplicate federal-interest pause messages. Publish named source pauses and
  retained source dates even if the live index count is unchanged.
- Show incomplete source coverage and pending retries separately in the watchdog.

## Validation

The offline Ubuntu nightly harness passed 355 checks. Focused manifest, watchdog,
periodic scheduling, source-access, recent-vote and SEO integration tests passed.
Daily profile fixtures cover prerequisite failures, access pauses, excluded steps
and rollback of a partially written export. Peer review found no outstanding blocker.

The production catch-up receipt and final runtime checks are recorded separately
under the private maintenance archive; this document does not claim that paused
sources, missing evidence inputs or held enrichment records are complete.
