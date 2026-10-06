# Roster identity and era audit — round 4, 6 October 2026

Baseline: `origin/main` (`66e75d74`); previous repair: `735689be`. The desktop
DB is unreachable. Only the roster is regenerated, using manifest-pinned
release `b56417062ccc33cf`, the verified votes/pay exports used by the photo
guard, and existing reviewed official evidence in `roster_service.json` and
`roster_state_evidence.json`. No production write, deploy or push was performed.
The approved KB reconciler and nightly safety implementation are unchanged.

Round 4 restores **only Shoebridge**, exactly as on main: Greens, 4,769 speeches,
no witnesses, no full-name alias and no representation. The reviewed same-person
entry links David Shoebridge's NSW Council service (2010–2022) to his Senate
service (from 2022), using the [APH biography](https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=169119)
and NSW Council annual report. The preservation guard requires actual-house
evidence, consistent names and party, and zero witness rows. Committee and
printed namesakes still contradict it. This entry supplies no new labels or
seats. Every other record is identical to round 3; the entire KB plan is identical.

`origin/main` at `66e75d74` is merged. The sole conflict was the `app.js?v=`
stamp in `index.html`; `node scripts/stamp_assets.mjs` regenerated it after
the merge. Privacy, support and discovery-label changes are included.

## First, do no harm against main

The pinned regeneration starts with the complete main roster, not the previous
repair. `repair()` now checks for evidence permitting a change before editing
any field. Missing positive pinned evidence permits **no change**. A unique
current member stub without service dates cannot disprove an old seat or replace
it with a new electorate/party. Ordinary initials, full names, and state
careers spanning two houses pass through unchanged. Ros Spence keeps main's
Kalkallo and Yuroke records, and verified federal nicknames keep their aliases.

[The complete diff report](ROSTER-DIFF-main.md) compares every field of all
1,700 records, including representation basis and provenance. All 267 changed
records have exactly one category; **1,433 records are identical to main**:

| Category | Changed records | Sample |
|---|---:|---|
| Mix-up corrected | 17 | Bob Horne, Mark Latham, David Kemp |
| Witness-dominated (>50%) | 131 | Anderson, Bishop, Cook |
| Spans parliaments | 108 | Paterson, Roberts, Watt |
| Alias normalisation | 11 | Staley, Fentiman, Butcher |
| Clean record changed | **0** | — |

Against round 2, 368 records change; **335 are restored exactly to main**.
Both Malinauskas records, Chapman, Marshall, Koutsantonis, both Picton records,
Cupper, Halse, Brayne, Greenwich and McGirr retain every main field. Maher,
Lucas, Wade and Scriven also retain every main field. Lensink's party/seat
repair remains because main's Council electorate was a ministerial portfolio.

## 1. Committees contradict but never establish identity

Positive candidates come only from the record's own actual house and
jurisdiction. A parliamentarian can speak before committees of either federal
house: dated federal namesakes therefore contradict a state candidate even
where there is no actual federal house in the print. Verified pinned federal
member terms supplement the dated reference (notably Louise Pratt, Tony Smith
and Stephen Bates); this is negative evidence only. Bare surnames in those
member exports are not extra people. Candidates from another era are excluded.

All 17 incorrect round-2 state identifications are neutral: **Paterson, Roberts,
Watt, Walsh, Pratt, Hanson, McBride, Gee, Kennedy, Green, Berry, Wells, Watts,
Lim, T Smith, Bates and Perrett**. Hanson contains Jeremy and Pauline; McBride
contains Nick and Emma; Gee contains Jon and Andrew; Kennedy contains John and
Simon. Selecting either person for their shared print is unsupported. Ng, Le,
Thomas, Power, Guy and Dick remain neutral. Committee-only rows cannot establish
a new identity; independently verified existing speaker IDs stay intact.

Within one federal parliament, Cox (David/Dorinda), McKenzie, Collins, Price and
Baldwin have competing compatible parliamentarians. Tudehope's Assembly/Council
print has contradictory given names in the dated transcripts. These also stay
neutral. Raw speech counts, witness counts, printed names, years, chamber/state
lists and all 740 numeric IDs remain identical to main.

The source SQL export and pinned repair use the same evidence gate and resolver.
Malformed own-house member aliases are carried only into that repair, without
supplying a party or numeric ID, then corrected or removed before output.
The wrapper preserves independently repaired seats instead of overwriting them
from contaminated member stubs. A real box-shaped SQL/wrapper replay uses all
1,700 prints, with no state start dates outside Queensland. It finishes without
a hold: **3 identity differences / limit 25** (`Blandthorn`, `D'Ambrosio`,
`McDermott`), arising from synthetic state stubs coalesced by full name (a house
change and apostrophe/casing variants), not from a blanket state rule. Named regression records reproduce exactly.

At the next refresh, this one read-only query should confirm the member loader
shape; inspect the real export diff before accepting any first held export:

```sql
SELECT state, COUNT(*) AS members, SUM(entered_house IS NULL) AS undated
FROM members
GROUP BY state ORDER BY state;
```

## 2. Witnesses and the deferred split

Neutralisation applies only when `witness_rows * 2 > speeches`, as requested.
Tests cover 49%, 50%, 51% and 99%. A tie retains main unless there is separate
mix-up evidence. A newly selected MP still requires a parliamentary-speaker
majority plus compatible, unique house/jurisdiction evidence. No numeric MP ID
is attached to witness testimony.

Of 145 strictly witness-dominated records, 131 change against main and 14 were
already neutral. All 145 now have zero MP aliases, parties, seats or numeric
IDs. Main's 81 MP aliases on these aggregates are removed. Anderson (449/450
witnesses) and Bishop (32/33) remain neutral. The two tied prints are unchanged
from main. Witness ingestion tests still separate an MP and a namesake witness.

**P2 follow-up:** split parliamentary-speaker rows from witness rows, identifying
the MP only for their own speeches. This is deliberately not implemented now.
The 13 Queensland majority-witness prints identified in review remain neutral,
so their 840 parliamentary-speaker rows remain available under printed names.

The subsequent [P2 witness split](ROSTER-WITNESS-SPLIT.md) restores 16 scoped QLD
Assembly identities, including all 13 review cases, and leaves testimony
unattributed. Its [diff against this roster](ROSTER-WITNESS-SPLIT-DIFF.md) records
the precise counts and the limits of the offline aggregate.

## 3. Alias and original seat corrections

Alias source normalization remains in place: `LEO McLEAY` becomes `Leo McLeay`,
`KY CHAN` becomes `Ky Chan`, and compact initials cannot become given names.
The 11 alias-category changes are **Staley, Scanlon, Fentiman, Butcher, Enoch,
Doolan, Linard, Basham, Furner, Stoker and Weir**. Other alias defects inside
multi-parliament or witness aggregates are accounted for in those categories.
Unique dated state evidence repairs their own seat; Gaven, Nudgee, Gladstone
and Miller remain represented in the KB plan.

The 17 mix-up-category changes are **Mark Latham, McKenzie, J.M.A. Lensink,
David Kemp, Collins, Michael Lee, Lynda Voltz, Cox, Bronnie Taylor, Ingrid Stitt,
Bob Horne, D O’Brien, Melissa Horne, Price, Baldwin, D O'Brien and Tudehope**.
Bob has federal Paterson; Melissa has Williamstown / Victorian Assembly / Labor.
Kemp has Goldstein, Lee has Dobell. Latham retains federal Labor / Werriwa to
21 January 2005, NSW One Nation from 23 March 2019 and Independent from
22 August 2023. Voltz retains the Council and Assembly eras, with Auburn in the
Assembly. Council/portfolio labels are repaired only where their wrong chamber
or contaminated member-stub text supplies evidence of the problem.

## Party rows and preserved seats

These are transcript-directory rows, including historical aggregates. Party
facets include both `party` and `parties`, matching the website.

| Count | Main | Round 2 | Round 3 | Round 4 |
|---|---:|---:|---:|---:|
| All roster rows | 1,700 | 1,700 | 1,700 | 1,700 |
| Speech rows | 605,149 | 605,149 | 605,149 | 605,149 |
| Rows with party | 1,177 | 1,002 | 1,057 | 1,058 |
| Rows with full alias | 420 | 324 | 304 | 304 |
| Rows with representation | 985 | 950 | 961 | 961 |
| SA rows with party | 83 | 30 | 74 | 74 |
| SA Labor facet | 38 | 12 | 33 | 33 |
| SA Liberal facet | 36 | 13 | 35 | 35 |
| QLD rows with party | 120 | 84 | 81 | 81 |
| QLD Labor facet | 57 | 37 | 37 | 37 |
| QLD LNP facet | 56 | 41 | 38 | 38 |

Every party removal is evidenced and classified: 84 majority-witness records,
43 multi-parliament records and 6 contradictory-name records. No clean record
loses its party. Four mix-up fixes, nine compatible multi-parliament resolutions
and one alias fix add a party that main omitted (net party rows: -119).

## 4. Regenerated KB preview

The round-4 preview has **52 replacements, 27 retirements and 5 creates**, from
983 captured live profiles to 961 desired. All four correct SA seat resources
are present in the captured inventory and **unchanged**, with no retirement:

| Correct source record | Seat | Resource |
|---|---|---|
| L.W.K. Bignell | Mawson | `roster-profile-7f7067993647ba86` |
| S.J.R. Patterson | Morphett | `roster-profile-88c4947f2996593e` |
| J.A.W. Gardner | Morialta | `roster-profile-d3a3a167f6411557` |
| D.K.B. Basham | Finniss | `roster-profile-f45059f514ba1dc9` |

The separate surname aggregates `Gardner` (26 witnesses of 47) and `Patterson`
(SA plus federal committees, with no unique dated identity) retire. Those
ambiguous aggregates do not retire the correct initials profiles above. Their
witness/MP split remains the P2 follow-up, not an asserted single-person seat.
A local `sa-seat-preservation.json` records the four inventory/plan checks.

Exact operations, before/after bodies and hashes are in the ignored review path:
`scripts/_photos_work/qa-roster-mixups/round4/roster-profile-plan.json`.
The dry-run output is beside it in `roster-profile-plan.log`. The native/public
comparison limitations and approved apply cap are unchanged.

## Approved KB safety and supervised first run

Native classifications are compared as labelset/label pairs. Additional native
bookkeeping (including `cancelled_by_user: false`) no longer creates spurious
drift or fails ownership/read-back. An explicit `cancelled_by_user: true` remains
semantic: it cannot establish the publisher's source ownership. The test fixture
uses Bob's read-only public body plus the native `data.texts.*.value` and label
shape already used by repository readers; it tests ownership, fingerprint,
no-op planning, replacement and native-shape read-back.

**No usable KB credentials exist in the checked OPAX process/environment files
on this Mac. No native GET was possible.** The fixture is explicitly documented
as schema-shaped, not a captured native response. Capture a real owned resource
on the refresh box before first apply. Native dry-run uses **`~/opax/.env`** on
that box; no Mac env file is available for native inventory. This Mac can run
credential-free public GET preview or replay the ignored inventory offline.
The latter needs no env file:

```sh
python3 scripts/reconcile_roster_profiles.py --dry-run \
  --inventory scripts/_photos_work/qa-roster-mixups/round2/roster-profile-plan.inventory.json \
  --output scripts/_photos_work/qa-roster-mixups/round4/roster-profile-plan.json
```

Nightly reconciliation defaults to **dry-run**. Only explicit
`OPAX_ROSTER_SYNC_KB=1` selects `--apply`; `OPAX_PERIODIC_SYNC_KB` cannot enable it.
CLI apply independently checks the dedicated switch. A hard cap of **30 combined
retirements + replacements** aborts before remote reads/writes in the apply
helper; no CLI cap override exists. Dry-run can list larger plans. `--slugs`
selects explicitly reviewed JSON batches; malformed/unknown slugs abort.

Publication replaces owned records (delete/recreate) to clear stale generated
fields, or retires orphaned derived profiles. It backs up originals outside the
KB, verifies ownership/fingerprints before the first write and again before each
mutation, and checks read-back. Offline/public plans cannot be applied. Apply
re-inventories the native KB and checks that model generation is disabled.

Round-4 replay of the round-2 read-only public inventory: **983 existing profiles**, **961 desired**, **52 replacements, 27 retirements, 5 creates**. The plan is identical to round 3, including all before/after bodies and hashes. The 79 retirements/replacements exceed the apply cap; do not apply as one run. The public route omits native source_id and collapses each labelset to one value. This preview states those limits; native inventory/ownership can change the plan. Exact before/after bodies and hashes are in the ignored `round4/roster-profile-plan.json` and dry-run log, using the unchanged captured `round2/roster-profile-plan.inventory.json`. No fresh production read or write was needed.

The orchestrator supervises these commands **after approval**, on the refresh
box at the reviewed commit. Keep the dedicated switch off for the first plan:

```sh
cd ~/opax
ROSTER_REVIEW_DIR="$HOME/.cache/opax/roster-review-2026-10-06"
mkdir -p "$ROSTER_REVIEW_DIR"
.venv/bin/python scripts/reconcile_roster_profiles.py --dry-run --env "$PWD/.env" \
  --output "$ROSTER_REVIEW_DIR/native-plan.json"
```

Copy one real native GET to the ignored review directory (never print the env):

```sh
.venv/bin/python - "$PWD/.env" "$ROSTER_REVIEW_DIR/native-bob.json" <<'PYGET'
import hashlib,json,sys
from pathlib import Path
from parli.arag import AragConfig,KbClient,load_dotenv
load_dotenv(sys.argv[1])
k=KbClient(AragConfig.from_env())
slug='roster-profile-'+hashlib.sha256(b'Bob Horne').hexdigest()[:16]
r=k.get_resource_by_slug(slug,show='basic&show=origin&show=extra&show=values')
Path(sys.argv[2]).write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
PYGET
```

Inspect the native labels and plan locally, and only copy public source facts to
any committed fixture. Split the approved plan into explicit reviewed batches
of at most 30 operations (creates included here, conservatively):

```sh
.venv/bin/python - "$ROSTER_REVIEW_DIR" <<'PYBATCH'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]);ops=json.loads((p/'native-plan.json').read_text())['operations']
for i in range(0,len(ops),30):
    (p/f'batch-{i//30+1:02}.json').write_text(json.dumps([o['slug'] for o in ops[i:i+30]],indent=2)+'\n')
PYBATCH
```

Preview each selected batch with native reads and review it. The orchestrator
then applies that batch with the explicit switch and retained backups:

```sh
.venv/bin/python scripts/reconcile_roster_profiles.py --dry-run --env "$PWD/.env" \
  --slugs "$ROSTER_REVIEW_DIR/batch-01.json" \
  --output "$ROSTER_REVIEW_DIR/batch-01-preview.json"
OPAX_ROSTER_SYNC_KB=1 .venv/bin/python scripts/reconcile_roster_profiles.py --apply \
  --env "$PWD/.env" --slugs "$ROSTER_REVIEW_DIR/batch-01.json" \
  --output "$ROSTER_REVIEW_DIR/batch-01-apply.json" \
  --backup "$ROSTER_REVIEW_DIR/backups"
```

Repeat preview/review/apply for subsequent batch files, then rerun the native
full dry-run and verify zero drift. Only after supervised reconciliation should
the orchestrator explicitly enable `OPAX_ROSTER_SYNC_KB=1` for unattended future
runs; the cap still applies. No apply command above was executed in this repair.

## Round-4 validation

Run with Node **24.21.0** and the installed lockfile dependencies:

- `npm run build:search`, then `npm test`: **860 passed**, 0 failures/skips.
- `npm run check`: passed (types, TypeScript, stamps and privacy placeholders).
- Python roster/export/reconciliation/grants tests: **81 passed**; merged discovery
  tests: **19 passed** (100 total). Box-shaped export replay: **3 identity changes**
  against the limit of 25, with no hold.
- Photo identity audit: **OK**.
- Diff audit: **17 mix-up / 131 witness / 108 spans / 11 alias / 0 clean changed**;
  Shoebridge identical to main, and the only changed record against `735689be`.
- KB dry-run: **52 replace / 27 retire / 5 create**; entire plan identical to round 3.
- Search build output excluded. No push, deploy or production writes.

Gate logs, the diff against round 3 and the full dry-run plan are in the
ignored `scripts/_photos_work/qa-roster-mixups/round4/` directory.

## Round-3 validation and local browser evidence

Run with Node **24.21.0** and the installed lockfile dependencies:

- `npm run build:search`, then `npm test`: **848 passed**, 0 failures/skips.
- `npm run check`: passed (types, TypeScript and asset stamp check).
- Python roster/export/reconciliation/grants tests: **77 passed**.
- Witness/ACT ingestion tests: **23 passed, 28 skipped** (optional PDF fixtures).
- Photo identity audit: **OK**, no mismatches; verified numeric IDs unchanged.
- Pinned repair: idempotent; diff audit: **zero clean record changed**.
- Grants publisher fixed totals: **1,429 resources**, including **961 roster
  profiles**; enrichment review queue **739**.
- KB dry-run: **52 replace / 27 retire / 5 create**; no writes executed.

`wrangler dev --local` and headless Chrome checked 12 current pages: Bob,
Melissa, Latham, Voltz, Ros, Hanson, Paterson, the Labor party view, SA Labor,
SA Liberal, Malinauskas and Staley. The captured pages use the real local
Worker/assets; API responses are stubbed and external browser traffic blocked.
They confirm the displayed neutral records and restored SA identities. Full-page
screenshots, text and results are in the git-ignored
`scripts/_photos_work/qa-roster-mixups/round3/after/` directory. Prior before
screenshots remain in the round-2 review directory. Search build output is
excluded from the commit.
