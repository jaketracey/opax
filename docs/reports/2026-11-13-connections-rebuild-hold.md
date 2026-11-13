# Connections rebuild, 13 Nov 2026: built and audited, held by the publication guard

The supervised rebuild of the connections layer (`portal/public/evidence`) ran on the opax-refresh box from
15:40 to 20:47 AEDT on 13 Nov 2026. The rebuild was approved the same day ([the diagnosis](2026-11-13-evidence-layers.md)).
Every builder stage exited 0 and the full source audit passed. **Nothing was published.** Live
`/connections` still reads "Updated 8 Sep 2026".

## What the exit code means

`build_evidence_bundle.py --keep-audited-candidate` returned **3**. This is its "HELD" exit: the build
succeeded, but the publication guard refused the audited candidate, so the builder kept it and wrote
`CANDIDATE.json`, not `READY.json`. It is not a crash or a timeout. The builder ran on the box's checkout
9f3a80b84 with the **old** guard:

    publication guard held: evidence IDs vanished: 226 entities, 11424 excerpts

The **new** guard from main (#342, `HEADROOM_PERCENT = 25`) was run read-only on the same candidate against
main's committed tree, which is byte-identical to 9f3a80b84's. It also refuses:

    evidence IDs vanished: 226 entities, 1822 excerpts

| | Shipped (8 Sep) | Candidate (13 Nov) |
| --- | --- | --- |
| entities | 19,481 | 20,114 (859 new, 226 gone) |
| excerpts | 109,533 | 113,338 |
| published record matches | 1,195,578 | 1,239,314 |
| bytes | 164,138,847 | 169,300,171 (ceiling 205,173,558) |

The byte ceiling, the per-file cap and the 2% shrink checks all pass. The new rotation rule allowed 9,602
of the 11,424 lost excerpts. Two things remain:

- **226 entities are gone.** All are organisations, with 27,648 records between them. Among them are the
  Department of Foreign Affairs and Trade (13,220 records), NSW Government (5,218), City of Melbourne (1,123),
  Australian Crime Commission (1,080) and Australian Rail Track Corporation (987). Some are truncated
  names, such as "Department of Planning Industry and" and "Department of Justice and". They
  account for 1,349 of the 1,822 excerpts.
- **473 excerpts on surviving entities fall outside the rotation rule**, across 85 entities:
  - 179: the entity's record count fell;
  - 183: the lost excerpt is newer than one still shown;
  - 111: the entity grew by fewer records than it lost excerpts.

## Why the entities vanished

Public entity IDs are derived from the identity key behind each entity. The source tables changed under
those keys between the 8 Sep build and this one. The likely causes are the AusTender reload by ABN and later
donor-entity loads; this has not been traced row by row. Looked up by name in the new identity sidecar:

- **130** names have no identity row at all: their source spellings are gone, including the truncated ones;
- **about 70** now resolve only through a different key. The Department of Foreign Affairs and Trade
  survives only as the donor-entity key `ext_donor_entities:department-foreign-affairs-trade`; its
  ABN-validated identity (47065634525) is gone. NSW Government has both a contract-supplier key and
  `abn:85430594829`. A different key gives a different public ID; only 14 reappear under a new ID with
  the same name;
- **25** are quarantined as `conflicting_source_names`.

So the guard is doing what it was told: these IDs and their excerpts would disappear from public pages and
links. The exporter and audit are unchanged between 9f3a80b84 and main, so running the build again on the
same code would reproduce the same losses.

## What a publish needs (a decision, not a re-run)

Pick one, by review:

1. **Keep public IDs stable across re-keying.** Carry each surviving organisation's old public ID, or a
   redirect from it, when its identity key changes. Accept the truly gone names, such as the truncated
   ones, through a reviewed, explicit list of allowed losses in the guard, with counts. The guard keeps
   refusing everything else.
2. **Accept this candidate's losses once.** Use a reviewed one-off allow-list of the 226 IDs and the 473
   out-of-rule excerpts, committed with the reasons. This is the smallest change, but government
   departments would lose their connections pages until they reappear under new IDs.

After either change, **no 5-hour rebuild is needed.** The audited bundle is kept on the box
(`pipeline/evidence-bundles/20261113T044016Z-13afa619f0bf.incoming`, 12.75 GB). Nightlies only prune
bundles when one is activated, so it survives them. Export, audit and guard from it take about 22 minutes,
followed by the hand publication (`publish.sh <bundle> 45m`) and the post-deploy check.

## Measured run (for the monthly schedule)

- **Stages:** primary 10,714 s, places 428 s, decisions 40 s, additional 4,287 s, source table copy
  277 s, export 818 s, audit 505 s; **total 18,442 s (5 h 7 min)**.
- **Disk:** 35.1 GiB free before the build. Peak use was 15.8 GiB above the start at 20:30, during
  the export, leaving 19.3 GiB free at the lowest. 23.3 GiB was free after it. The bundle is 12.75 GB.

The runbook's "Connections rebuild" section carries these figures and the budgets set from them.
