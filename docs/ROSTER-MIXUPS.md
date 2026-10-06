# Roster identity and era audit — round 2, 6 October 2026

Baselines: `origin/main` (`23cad95a`), first repair `ecc26aa2`, and round 1
`c99d59cb`. The desktop database remains unreachable. Repairs use manifest-pinned
release `b56417062ccc33cf`, its independent OpenAustralia terms and official
Victorian roster, and public dated evidence in `scripts/roster_service.json`
and `scripts/roster_state_evidence.json`. Five small additions establish Nick
McBride and Jon Gee in the SA Assembly, John Kennedy in the Victorian Assembly,
Richard Harvey in Newland, and Danny O'Brien's Nationals affiliation. Each has an
official source URL and a date within the documented service period; these are
historical evidence points, not assertions about today's party or membership.

No production write, database change, push or deploy was performed. Public KB
resources were read using GET for the preview. Only `parliamentarians.json` was
regenerated. Search build output is excluded from the commit.

## 1. Own parliament and chamber evidence

Round 1 expanded committee chambers into federal houses, then allowed candidates
reachable only through those committees to identify state transcript aggregates.
A missing state roster let the federal namesake win. `print_identity()` now uses
only the print's actual non-committee houses for positive candidates. Every
non-committee parliament in the record must have its own agreeing candidate;
no roster/evidence for that parliament means neutral. Committees never establish
a positive candidate or a numeric person id. In an actual federal-house aggregate,
a committee namesake may contradict an identity (David/Dorinda Cox), including
an undated legacy stub, but cannot supply it.

| Print | Round 1 | Round 2 | Evidence / result |
|---|---|---|---|
| Hanson | Pauline Hanson, One Nation | Jeremy Hanson, Liberal | ACT Assembly roster; restores main's name |
| McBride | Emma McBride, Labor | Nick McBride, Liberal | Dated 2020 SA Assembly / MacKillop Liberal service; restores main's name |
| Gee | Andrew Gee, Independent | Jon Gee, Labor | Dated 2020 SA Assembly / Taylor Labor service |
| Kennedy | Simon Kennedy, Liberal | John Kennedy, Labor | Dated 2020 Victorian Assembly / Hawthorn Labor service; restores main's name |
| Ng | Gabriel Ng, Labor | Neutral | No own NSW roster/evidence |
| Le | Dai Le, Independent | Neutral | Federal service does not establish identity for the NSW Assembly rows |
| Thomas, Power | Federal namesakes | Neutral | No own SA roster/evidence |
| Guy, Dick | Federal namesakes | Neutral | No own NSW roster/evidence |
| Cox | Neutral | Neutral | Contradictory federal David/Dorinda identities remain refused |

All six requested cases have individual Python regressions. The general guard
covers missing own jurisdiction, pure committees, and committee names used only
to contradict a federal aggregate. The shared exporter and pinned repair use the
same rule. Existing numeric speech identities independently verified by
`roster_identity.verify()` remain intact on single-parliament, non-witness
speaker records; this resolver supplies no new committee-only identity.

SA two-house careers remain allowed, consistently with the photo guard: Kyam
Maher, Rob Lucas, Stephen Wade, Clare Scriven and Michelle Lensink retain their
names and parties. The two houses do not by themselves prove two people.

## 2. Parliamentary-speaker majority and witness attribution

The threshold is **strictly more than 50% parliamentary-speaker rows**:
`witness_rows * 2 < speeches`. This gives “dominate” its ordinary majority
meaning and makes ties neutral. It is a minimum condition, not sufficient proof
of identity; all chamber/jurisdiction and uniqueness checks still apply.
Boundary tests cover 49%, 50%, 51% and 99% witnesses. All witness counts and
speech counts remain unchanged. A mixed/witness aggregate never receives a
numeric MP pid, even where an MP name is supported by majority speaker rows.
The committee linker retains witness testimony as witness records with no MP
person id; its tests include an MP and a witness sharing a surname.

Anderson (449 witnesses / 450 rows) and Bishop (32 / 33) lose their MP aliases,
party, seats and identity provenance. The whole-roster assertion requires the
same for every witness-dominated print. Witness testimony is never attached to
an MP through this display/identity repair.

Of 147 witness-dominated or tied prints, **59** carried an MP alias in round 1; **32** gained that alias against main. All 59 are now neutral (**2** ties), with **zero** MP aliases, parties or numeric ids on these 147 prints. Every removed alias is listed in the round-2 change table below.

## 3. Alias source normalization

`normalize_state_speaker_name()` now uses the ingest's display-casing normalizer
instead of turning every unknown two-capital first name into dotted initials.
`KY CHAN` becomes `Ky Chan`, `JO CLAY` becomes `Jo Clay`, and `DI FARMER` becomes
`Di Farmer`. Genuine compact initials such as `SM FENTIMAN` and `GJ BUTCHER`
stay initials and cannot qualify as full-name aliases. The source resolver also
normalizes roster names before selection: `LEO McLEAY` becomes `Leo McLeay`,
and postnominals do not become part of a given name. Tests cover each form.
`D O’Brien` and `D O'Brien` now agree on Danny O'Brien / Nationals using the dated
Victorian Electoral Commission result, rather than retaining a Liberal label.

## Original corrections and dated careers retained

| Person | Correct data |
|---|---|
| Bob Horne | Federal Paterson, NSW; Melissa's Williamstown and portfolios removed |
| Melissa Horne | Williamstown, Victorian Assembly, Labor |
| Mark Latham | NSW Independent MLC; federal Labor / Werriwa to 21 January 2005, NSW One Nation from 23 March 2019, Independent from 22 August 2023 |
| David Kemp | Goldstein, VIC; Michael Kemp's Oxley removed |
| Michael Lee | Dobell, NSW; Geoff Lee's Parramatta removed |
| Lynda Voltz | Council 24 March 2007–28 February 2019; Auburn / Assembly from 23 March 2019, Labor |
| Ingrid Stitt | Western Metropolitan; portfolios removed from electorate text |
| Bronnie Taylor | Canonical statewide New South Wales Council label |
| Ros Spence | Kalkallo and dated Yuroke (29 November 2014–26 November 2022) |

Bob/Melissa's exact-name member-stub join admitted an otherwise agreeing Bob /
federal / representatives record with Melissa's contaminated seat. Independent
dated federal terms now reject it. Latham's SQL name aggregate paired a dominant
federal Labor label with the union of chambers, and a member-stub join admitted
Werriwa as a NSW Council seat. The shared repair keeps party, seat and chamber
with their dated careers. The unavailable database's original mutations remain
unknown; the export steps that admitted them are fixed.

## Whole-roster comparison

Party facets count rows, including historical transcript aggregates. Web recorded
speakers use the unchanged client key: numeric pid, otherwise lowercase
`full || name`. These are directory counts, not an attribution of witness
speeches to the named parliamentarian.

| Count | origin/main | ecc26aa2 | c99d59cb | Round 2 |
|---|---:|---:|---:|---:|
| Roster rows | 1,700 | 1,700 | 1,700 | 1,700 |
| Speeches | 605,149 | 605,149 | 605,149 | 605,149 |
| Rows with party | 1,177 | 967 | 1,131 | 1,002 |
| Rows with full alias | 420 | 245 | 443 | 324 |
| Rows with representation | 985 | 944 | 963 | 950 |
| Current rows | 328 | 328 | 330 | 330 |
| Rows with party_now | 328 | 330 | 330 | 330 |
| Rows with numeric pid | 740 | 740 | 740 | 740 |
| Queensland Labor facet | 57 | 27 | 44 | 37 |
| Queensland LNP facet | 56 | 29 | 47 | 41 |
| Web recorded speakers: Labor | 451 | 350 | 428 | 368 |
| Web recorded speakers: LNP | 92 | 61 | 82 | 74 |
| Witness-dominated aliases | 81 | 0 | 59 | 0 |

The original 287-review table now has **81 retained identities** and **206 neutral aggregates**. Against c99d59cb, aliases: **130 removed, 11 added, 5 renamed**.

Against main: 602 changed rows, 377 with changed identity/affiliation/representation facts. Against ecc26aa2: 401 changed rows, 209 with changed identity/affiliation/representation facts. Against c99d59cb: 177 changed rows, 177 with changed identity/affiliation/representation facts. Every printed name, speech count, state/chamber list, first/last year, witness
count and numeric pid remains unchanged from main. All round-2 changed facts
and the original 287 reviewed prints are listed below.

## Export reproduction and next read-only query

The box-shaped fixture has all 1,700 original prints and their exact speech /
witness counts. It runs the real SQL exporter and wrapper with member stubs
without start dates outside Queensland. Its synthetic speech rows preserve the
majority/tie side of each print; just recording the presence of one witness
would defeat the new guard. The replay produces **zero identity changes, limit
25**, with no hold. The source and pinned repair use the same resolver, and
pinned repair is byte-idempotent. The sitting-member and missing-baseline holds
remain in force.

At the next refresh, confirm the expected loader shape with this one read-only
query, then inspect the actual export diff before accepting a held first export:

```sql
SELECT state, COUNT(*) AS members, SUM(entered_house IS NULL) AS undated
FROM members
WHERE state NOT IN ('federal')
GROUP BY state;
```

## 4. KB reconciler safety and supervised first run

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
  --output scripts/_photos_work/qa-roster-mixups/round2/roster-profile-plan.json
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

Fresh read-only public inventory: **983 existing profiles**, **950 desired**, **55 replacements, 35 retirements, 2 creates**. The 90 retirements/replacements exceed the apply cap; do not apply as one run. The public route omits native source_id and collapses each labelset to one value. This preview states those limits; native inventory/ownership can change the plan. Exact before/after bodies and hashes are in the ignored `round2/roster-profile-plan.json`, with its `roster-profile-plan.inventory.json` and dry-run log.

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

## Validation and local browser evidence

Node **24.21.0**. `npm run build:search` then `npm test`: **848 passed**, zero
failures/skips. `npm run check` passes. Focused Python gates: **68 passed**
(31 representation/resolver, seven numeric identity, ten exporter, four real
wrapper/replay, 12 reconciliation and four grants tests). Photo identity audit:
**ok, zero warnings**. Linux nightly rehearsal: **206 passed, zero failed**.
Grants totals are fixed at **1,418 records, 950 roster profiles, 750
representation-review tasks**. Search build output is restored after testing.

Additional committee/witness/ACT tests: **23 passed, 28 skipped** (optional
PDF parser unavailable); witness attribution tests pass.

Local `wrangler dev --local --port 8794` and headless Chrome checks cover Bob,
Melissa, Mark, Voltz, Ros, all six requested incorrect-name/neutral profiles,
Anderson, Bishop, McLeay and Labor/Queensland directory views. Before
screenshots inject c99d59cb's roster in the browser; the local Worker stays at
the current implementation. External requests and API searches are stubbed to
prevent paid/model calls. Thus this verifies roster-driven rendering and visible
careers, not the native KB or live Ask. Ignored before/after screenshots and
page text are in `scripts/_photos_work/qa-roster-mixups/round2/{before,after}/`;
`results.json` records titles, infoboxes and page errors for the focused round-2
checks. The six named profiles and four alias directory checks pass; the before
and after alias screenshots show Pauline → Jeremy Hanson, Emma → Nick McBride,
Andrew → Jon Gee and Simon → John Kennedy. All checks have zero page errors.
The local profile metadata also carries the corrected Labor/Liberal descriptions.

## Every round-2 changed identity/affiliation fact

| Print | Round 1 alias / party | Round 2 alias / party | Changed fields | Reason |
|---|---|---|---|---|
| A. Koutsantonis | Labor | — | party | No unique identity covering own non-committee parliaments |
| A. Michaels | Labor | — | party | No unique identity covering own non-committee parliaments |
| A. Piccolo | Labor | — | party | No unique identity covering own non-committee parliaments |
| Anderson | John Anderson / Nationals | — | full, party | Witness majority/tie |
| Ayres | Tim Ayres / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| B.I. Boyer | Labor | — | party | No unique identity covering own non-committee parliaments |
| Baird | Bruce Baird / Liberal | — | full, party | Witness majority/tie |
| Barrett | Scott Barrett / Nationals | — | full, party | Witness majority/tie |
| Batt | David Batt / LNP | — | full, party | No unique identity covering own non-committee parliaments |
| Batty | Jack Batty / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Bennett | Stephen Bennett / LNP | — | full, party | Witness majority/tie |
| Berry | — | Yvette Berry / Labor | full, party | Own dated evidence / normalized source alias |
| Billson | Bruce Billson / Liberal | — | full, party | Witness majority/tie |
| Birrell | Sam Birrell / Nationals | — | full, party | No unique identity covering own non-committee parliaments |
| Bishop | Julie Bishop / Liberal | — | full, party | Witness majority/tie |
| Boele | Nicolette Boele / Independent | — | full, party | No unique identity covering own non-committee parliaments |
| Bourne | Wendy Bourne / Labor | — | full, party | Witness majority/tie |
| Bowen | Chris Bowen / Labor | — | full, party | Witness majority/tie |
| Brayne | Chris Brayne / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Brooks | Colin Brooks / Labor | — | full, party, representation | Witness majority/tie |
| Buckingham | Jeremy Buckingham / Legalise Cannabis | — | full, party | Witness majority/tie |
| C.J. Picton | Labor | — | party | No unique identity covering own non-committee parliaments |
| C.L. Wingard | Liberal | — | party | No unique identity covering own non-committee parliaments |
| Campbell | Julie-Ann Campbell / Labor | — | full, party | Witness majority/tie |
| Carter | Susan Carter / Liberal | — | full, party | Witness majority/tie |
| Chandler | Claire Chandler / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Chandler-Mather | Max Chandler-Mather / Greens | — | full, party | Witness majority/tie |
| Chisholm | Anthony Chisholm / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Clark | Robert Clark | — | full | Witness majority/tie |
| Coleman | David Coleman / Liberal | — | full, party | Witness majority/tie |
| Costello | Peter Costello / Liberal | — | full, party | Witness majority/tie |
| Cowdrey | Matt Cowdrey / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Crakanthorp | Tim Crakanthorp | — | full | No unique identity covering own non-committee parliaments |
| Crawford | Craig Crawford / Labor | — | full, party, representation | Witness majority/tie |
| Cregan | Dan Cregan / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Cupper | Ali Cupper | — | full | No unique identity covering own non-committee parliaments |
| D O’Brien | Danny O’Brien / Liberal | Danny O'Brien / Nationals | full, party | Own dated evidence / normalized source alias |
| D.G. Pisoni | Liberal | — | party | No unique identity covering own non-committee parliaments |
| D.J. Speirs | Liberal | — | party | No unique identity covering own non-committee parliaments |
| D.K.B. Basham | — | — | representation | No unique identity covering own non-committee parliaments |
| D.R. Cregan | Liberal | — | party | No unique identity covering own non-committee parliaments |
| Dick | Cameron Dick / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Dillon | Sean Dillon / LNP | — | full, party | Witness majority/tie |
| Dowling | Richard Dowling / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Duluk | Sam Duluk / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Duniam | Jonathon Duniam / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Evans | Trevor Evans / Liberal | — | full, party | Witness majority/tie |
| Fang | Wes Fang / Nationals | — | full, party | Witness majority/tie |
| Farrell | Don Farrell / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Field | Russell Field / LNP | — | full, party | Witness majority/tie |
| Franklin | Ben Franklin / Nationals | — | full, party | Witness majority/tie |
| Fulbrook | John Fulbrook | — | full | No unique identity covering own non-committee parliaments |
| G.G. Brock | Independent | — | party | No unique identity covering own non-committee parliaments |
| Gallagher | Katy Gallagher / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Gee | Andrew Gee / Independent | Jon Gee / Labor | full, party | Own dated evidence / normalized source alias |
| George | Jennie George / Labor | — | full, party | Witness majority/tie |
| Gosling | Luke Gosling / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Graham | John Graham / Labor | — | full, party | Witness majority/tie |
| Green | — | Danielle Green / Labor | full, party | Own dated evidence / normalized source alias |
| Greenwich | Alex Greenwich | — | full | No unique identity covering own non-committee parliaments |
| Gregg | Matt Gregg / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Guy | Matthew Guy | — | full, representation | No unique identity covering own non-committee parliaments |
| H.M. Girolamo | Liberal | — | party | No unique identity covering own non-committee parliaments |
| Haines | Helen Haines / Independent | — | full, party | No unique identity covering own non-committee parliaments |
| Halse | Dustin Halse / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Hanson | Pauline Hanson / One Nation | Jeremy Hanson / Liberal | full, party | Own dated evidence / normalized source alias |
| Harper | Aaron Harper / Labor | — | full, party | Witness majority/tie |
| Hart | Michael Hart / LNP | — | full, party | Witness majority/tie |
| Harvey | — | Richard Harvey / Liberal | full, party | Own dated evidence / normalized source alias |
| Henderson | Sarah Henderson / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Hildyard | Katrine Hildyard / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Hoare | Kelly Hoare / Labor | — | full, party | Witness majority/tie |
| Hodges | Mark Hodges | — | full | No unique identity covering own non-committee parliaments |
| Hurn | Ashton Hurn | — | full | No unique identity covering own non-committee parliaments |
| Hurst | Emma Hurst / Animal Justice Party | — | full, party | Witness majority/tie |
| Hutchesson | Catherine Hutchesson / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Hutton | Nigel Hutton / LNP | — | full, party | Witness majority/tie |
| Irwin | Julia Irwin / Labor | — | full, party | Witness majority/tie |
| J.A.W. Gardner | — | — | representation | No unique identity covering own non-committee parliaments |
| J.B. Teague | Liberal | — | party | No unique identity covering own non-committee parliaments |
| J.K. Szakacs | Labor | — | party | No unique identity covering own non-committee parliaments |
| Jenkins | Harry Jenkins / Labor | — | full, party | Witness majority/tie |
| Johnson | Michael Johnson / Liberal | — | full, party | Witness majority/tie |
| K.A. Hildyard | Labor | — | party | No unique identity covering own non-committee parliaments |
| Kairouz | Marlene Kairouz | — | full | No unique identity covering own non-committee parliaments |
| Kennedy | Simon Kennedy / Liberal | John Kennedy / Labor | full, party | Own dated evidence / normalized source alias |
| Kerr | Duncan Kerr / Labor | — | full, party | Witness majority/tie |
| Kirkland | Donna Kirkland / LNP | — | full, party | Witness majority/tie |
| Knight | Sharon Knight | — | full | Witness majority/tie |
| Knoll | Stephan Knoll / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| L.W.K. Bignell | — | — | representation | No unique identity covering own non-committee parliaments |
| Le | Dai Le / Independent | — | full, party | No unique identity covering own non-committee parliaments |
| Liddle | Kerrynne Liddle / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Lim | — | Hong Lim / Labor | full, party | Own dated evidence / normalized source alias |
| Lindsay | Peter Lindsay / Liberal | — | full, party | Witness majority/tie |
| Luethen | Paula Luethen / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| MacDonald | Aileen MacDonald / Liberal | — | full, party | Witness majority/tie |
| Malinauskas | Peter Malinauskas / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| McAllister | Jenny McAllister / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| McBride | Emma McBride / Labor | Nick McBride / Liberal | full, party | Own dated evidence / normalized source alias |
| McCarthy | Malarndirri McCarthy / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| McClelland | Robert McClelland / Labor | — | full, party | Witness majority/tie |
| McCormack | Michael McCormack / Nationals | — | full, party | No unique identity covering own non-committee parliaments |
| McDermott | Hugh McDermott | — | full | No unique identity covering own non-committee parliaments |
| McGirr | Joe McGirr | — | full | No unique identity covering own non-committee parliaments |
| McGrath | James McGrath / LNP | — | full, party | No unique identity covering own non-committee parliaments |
| McKim | Nick McKim / Greens | — | full, party | No unique identity covering own non-committee parliaments |
| McLeay | LEO McLEAY / Labor | — | full, party | Witness majority/tie |
| Michaels | Andrea Michaels / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Moriarty | Tara Moriarty / Labor | — | full, party | Witness majority/tie |
| Mulholland | Corinne Mulholland / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Munro | Jacqui Munro / Liberal | — | full, party | Witness majority/tie |
| N.F. Cook | Labor | — | party | No unique identity covering own non-committee parliaments |
| Nelson | Brendan Nelson / Liberal | — | full, party | Witness majority/tie |
| Ng | Gabriel Ng / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Noonan | Wade Noonan | — | full | Witness majority/tie |
| O'Byrne | Michelle Anne O'Byrne / Labor | — | full, party, representation | Witness majority/tie |
| O'Keefe | Neil Patrick O'Keefe / Labor | — | full, party | Witness majority/tie |
| O'Sullivan | Matt O'Sullivan / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Odenwalder | Lee Odenwalder / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| P.B. Malinauskas | Labor | — | party | No unique identity covering own non-committee parliaments |
| Paterson | — | Marisa Paterson / Labor | full, party | Own dated evidence / normalized source alias |
| Pederick | Adrian Pederick / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Phillips | Fiona Phillips / Labor | — | full, party | Witness majority/tie |
| Picton | Chris Picton / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Pisoni | David Pisoni / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Porter | Christian Porter / Liberal | — | full, party | Witness majority/tie |
| Power | Linus Power / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Pratt | — | Penny Pratt / Liberal | full, party | Own dated evidence / normalized source alias |
| Pugh | Jess Pugh / Labor | — | full, party | Witness majority/tie |
| R. Sanderson | Liberal | — | party | No unique identity covering own non-committee parliaments |
| R.B. Martin | Labor | — | party | No unique identity covering own non-committee parliaments |
| Rae | Sam Rae / Labor | — | full, party | Witness majority/tie |
| Rattenbury | — | — | representation | No unique identity covering own non-committee parliaments |
| Reid | Gordon Reid / Labor | — | full, party | Witness majority/tie |
| Roberts | — | Rod Roberts / Independent | full, party | Own dated evidence / normalized source alias |
| Robinson | Mark Robinson / LNP | — | full, party | Witness majority/tie |
| Ryall | Dee Ryall | — | full | Witness majority/tie |
| S.C. Mullighan | Labor | — | party | No unique identity covering own non-committee parliaments |
| S.J.R. Patterson | — | — | representation | No unique identity covering own non-committee parliaments |
| S.K. Knoll | Liberal | — | party | No unique identity covering own non-committee parliaments |
| S.S. Marshall | Liberal | — | party | No unique identity covering own non-committee parliaments |
| Savvas | Olivia Savvas / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Scarr | Paul Scarr / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Sciacca | Concetto Antonio Sciacca / Labor | — | full, party, representation | Witness majority/tie |
| Scruby | Jacqui Scruby | — | full | No unique identity covering own non-committee parliaments |
| Sheldon | Tony Sheldon / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Shoebridge | David Shoebridge / Greens | — | full, party | No unique identity covering own non-committee parliaments |
| Small | Ben Small / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Speirs | David Speirs / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| St Clair | Nationals | — | party, representation | Witness majority/tie |
| Sterle | Glenn Sterle / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Stinson | Jayne Stinson / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Sullivan | Jimmy Sullivan / Labor | — | full, party, representation | Witness majority/tie |
| Swan | Wayne Swan / Labor | — | full, party | Witness majority/tie |
| Szakacs | Joe Szakacs / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| T.J. Whetstone | Liberal | — | party | No unique identity covering own non-committee parliaments |
| Tanner | Lindsay Tanner / Labor | — | full, party | Witness majority/tie |
| Tarzia | Vincent Tarzia / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Teague | Josh Teague / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Thomas | Mary-Anne Thomas / Labor | — | full, party, representation | No unique identity covering own non-committee parliaments |
| Thomson | Marsha Thomson | — | full | Witness majority/tie |
| Urquhart | Anne Urquhart / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| V.A. Chapman | Liberal | — | party | No unique identity covering own non-committee parliaments |
| V.A. Tarzia | Liberal | — | party | No unique identity covering own non-committee parliaments |
| Walsh | — | Peter Walsh / Nationals | full, party | Own dated evidence / normalized source alias |
| Ware | Jenny Ware / Liberal | — | full, party | Witness majority/tie |
| Waters | Larissa Waters / Greens | — | full, party | No unique identity covering own non-committee parliaments |
| Watt | — | Graham Watt / Labor | full, party | Own dated evidence / normalized source alias |
| Watts | — | Trevor Watts / LNP | full, party | Own dated evidence / normalized source alias |
| Wells | — | Kim Wells / Liberal | full, party | Own dated evidence / normalized source alias |
| Whetstone | Tim Whetstone / Liberal | — | full, party | No unique identity covering own non-committee parliaments |
| Whiteaker | Ellie Whiteaker / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Wong | Penny Wong / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Wooldridge | Michael Wooldridge / Liberal | — | full, party | Witness majority/tie |
| Wortley | Russell Wortley / Labor | — | full, party | No unique identity covering own non-committee parliaments |
| Z.L. Bettison | Labor | — | party | No unique identity covering own non-committee parliaments |

## All 287 original reviewed prints

| Print | Main alias | Round 1 alias | Round 2 alias | Round 2 party | Result |
|---|---|---|---|---|---|
| Abbott | — | — | — | — | Neutral |
| Adams | — | — | — | — | Neutral |
| Addison | Juliana Addison | Juliana Addison | Juliana Addison | Labor | Retained |
| Aitchison | Jenny Aitchison | — | — | — | Neutral |
| Anderson | — | John Anderson | — | — | Neutral |
| Andrew | Stephen Andrew | Stephen Andrew | Stephen Andrew | Katter's Australian Party | Retained |
| Andrews | Daniel Andrews | — | — | — | Neutral |
| Angus | Neil Angus | Neil Angus | Neil Angus | — | Retained |
| Anthony | — | — | — | — | Neutral |
| Ayres | — | Tim Ayres | — | — | Neutral |
| Bailey | Mc Bailey | Mark Bailey | Mark Bailey | Labor | Retained |
| Baird | — | Bruce Baird | — | — | Neutral |
| Baldwin | — | — | — | — | Neutral |
| Barr | Andrew Barr | — | — | — | Neutral |
| Barrett | Scott Barrett | Scott Barrett | — | — | Neutral |
| Barry | Chiaka Barry | Chiaka Barry | Chiaka Barry | Liberal | Retained |
| Bartlett | — | — | — | — | Neutral |
| Bates | Ros Bates | Ros Bates | Ros Bates | LNP | Retained |
| Batt | — | David Batt | — | — | Neutral |
| Bedford | Frances Bedford | Frances Bedford | Frances Bedford | Independent | Retained |
| Bell | Troy Bell | — | — | — | Neutral |
| Bennett | Stephen Bennett | Stephen Bennett | — | — | Neutral |
| Berry | Yvette Berry | — | Yvette Berry | Labor | Retained |
| Billson | — | Bruce Billson | — | — | Neutral |
| Bilyk | — | — | — | — | Neutral |
| Birrell | — | Sam Birrell | — | — | Neutral |
| Bishop | — | Julie Bishop | — | — | Neutral |
| Blackwood | Gary Blackwood | Gary Blackwood | Gary Blackwood | — | Retained |
| Blair | Niall Blair | — | — | — | Neutral |
| Boele | — | Nicolette Boele | — | — | Neutral |
| Bolton | Sandy Bolton | Sandy Bolton | Sandy Bolton | Independent | Retained |
| Bourne | Wendy Bourne | Wendy Bourne | — | — | Neutral |
| Bowen | — | Chris Bowen | — | — | Neutral |
| Boyd | Nikki Boyd | — | — | — | Neutral |
| Boyer | Blair Boyer | Blair Boyer | Blair Boyer | Labor | Retained |
| Brereton | — | — | — | — | Neutral |
| Brooks | Colin Brooks | Colin Brooks | — | — | Neutral |
| Brown | Michael Brown | — | — | — | Neutral |
| Burgess | By Burgess | Neale Burgess | Neale Burgess | — | Retained |
| Burke | — | — | — | — | Neutral |
| Bush | Jonty Bush | Jonty Bush | Jonty Bush | Labor | Retained |
| Butler | Liza Butler | — | — | — | Neutral |
| C.M. Scriven | — | Clare Scriven | Clare Scriven | Labor | Retained |
| Cain | Peter Cain | Peter Cain | Peter Cain | Liberal | Retained |
| Campbell | — | Julie-Ann Campbell | — | — | Neutral |
| Carroll | Ben Carroll | Ben Carroll | Ben Carroll | Labor | Retained |
| Carter | Susan Carter | Susan Carter | — | — | Neutral |
| Castley | Leanne Castley | Leanne Castley | Leanne Castley | Independent | Retained |
| Chandler | — | Claire Chandler | — | — | Neutral |
| Chandler-Mather | — | Max Chandler-Mather | — | — | Neutral |
| Chapman | Vickie Chapman | — | — | — | Neutral |
| Charles | — | — | — | — | Neutral |
| Chisholm | — | Anthony Chisholm | — | — | Neutral |
| Clancy | Nadia Clancy | — | — | — | Neutral |
| Clark | Robert Clark | Robert Clark | — | — | Neutral |
| Clarke | David Clarke | — | — | — | Neutral |
| Clay | Jo Clay | Jo Clay | Jo Clay | Greens | Retained |
| Close | Susan Close | Susan Close | Susan Close | Labor | Retained |
| Coleman | — | David Coleman | — | — | Neutral |
| Collins | — | — | — | — | Neutral |
| Connolly | Sarah Connolly | Sarah Connolly | Sarah Connolly | Labor | Retained |
| Cook | Nat Cook | — | — | — | Neutral |
| Cooke | Steph Cooke | — | — | — | Neutral |
| Costello | — | Peter Costello | — | — | Neutral |
| Cox | — | — | — | — | Neutral |
| Crawford | Cd Crawford | Craig Crawford | — | — | Neutral |
| Cross | Matt Cross | — | — | — | Neutral |
| Crouch | Adam Crouch | — | — | — | Neutral |
| Cusack | Catherine Cusack | — | — | — | Neutral |
| Dalton | Nigel Dalton | — | — | — | Neutral |
| Davey | — | — | — | — | Neutral |
| Davies | Tanya Davies | — | — | — | Neutral |
| Davis | Donna Davis | — | — | — | Neutral |
| Dick | Cameron Dick | Cameron Dick | — | — | Neutral |
| Dillon | Sean Dillon | Sean Dillon | — | — | Neutral |
| Donnelly | Greg Donnelly | — | — | — | Neutral |
| Dowling | — | Richard Dowling | — | — | Neutral |
| Doyle | — | — | — | — | Neutral |
| Duniam | — | Jonathon Duniam | — | — | Neutral |
| Edwards | Maree Edwards | — | — | — | Neutral |
| Ellis | Fraser Ellis | — | — | — | Neutral |
| Emerson | Thomas Emerson | — | — | — | Neutral |
| Evans | — | Trevor Evans | — | — | Neutral |
| Fang | Wes Fang | Wes Fang | — | — | Neutral |
| Farmer | De Farmer | — | — | — | Neutral |
| Farrell | — | Don Farrell | — | — | Neutral |
| Fawcett | — | — | — | — | Neutral |
| Field | Russell Field | Russell Field | — | — | Neutral |
| Foley | Martin Foley | Martin Foley | Martin Foley | — | Retained |
| Franklin | Ben Franklin | Ben Franklin | — | — | Neutral |
| Gallagher | — | Katy Gallagher | — | — | Neutral |
| Gardner | J.A.W. Gardner | — | — | — | Neutral |
| Garrett | — | — | — | — | Neutral |
| Gee | — | Andrew Gee | Jon Gee | Labor | Retained |
| George | — | Jennie George | — | — | Neutral |
| Gilbert | Julieanne Gilbert | Julieanne Gilbert | Julieanne Gilbert | Labor | Retained |
| Gosling | — | Luke Gosling | — | — | Neutral |
| Grace | Grace Grace | Grace Grace | Grace Grace | Labor | Retained |
| Graham | John Graham | John Graham | — | — | Neutral |
| Grant | Troy Grant | — | — | — | Neutral |
| Green | By Green | — | Danielle Green | Labor | Retained |
| Gregg | — | Matt Gregg | — | — | Neutral |
| Griffin | James Griffin | — | — | — | Neutral |
| Guy | Matthew Guy | Matthew Guy | — | — | Neutral |
| Haines | — | Helen Haines | — | — | Neutral |
| Halfpenny | Bronwyn Halfpenny | Bronwyn Halfpenny | Bronwyn Halfpenny | Labor | Retained |
| Hall | Katie Hall | — | — | — | Neutral |
| Hanson | Jeremy Hanson | Pauline Hanson | Jeremy Hanson | Liberal | Retained |
| Harper | Aaron Harper | Aaron Harper | — | — | Neutral |
| Harris | David Harris | — | — | — | Neutral |
| Harrison | Jodie Harrison | — | — | — | Neutral |
| Hart | Michael Hart | Michael Hart | — | — | Neutral |
| Harvey | Richard Manuel Harvey | — | Richard Harvey | Liberal | Retained |
| Hawke | — | Alex Hawke | Alex Hawke | Liberal | Retained |
| Head | Bryson Head | Bryson Head | Bryson Head | LNP | Retained |
| Henderson | — | Sarah Henderson | — | — | Neutral |
| Hennessy | Jill Hennessy | Jill Hennessy | Jill Hennessy | — | Retained |
| Hoare | — | Kelly Hoare | — | — | Neutral |
| Holland | Michael Holland | — | — | — | Neutral |
| Hood | D.G.E. Hood | — | — | — | Neutral |
| Horne | Melissa Horne | — | — | — | Neutral |
| Howard | Jennifer Howard | — | — | — | Neutral |
| Hughes | Eddie Hughes | — | — | — | Neutral |
| Hunt | Jason Hunt | — | — | — | Neutral |
| Hurst | Emma Hurst | Emma Hurst | — | — | Neutral |
| Hutton | Nigel Hutton | Nigel Hutton | — | — | Neutral |
| Irwin | — | Julia Irwin | — | — | Neutral |
| J.M.A. Lensink | — | Michelle Lensink | Michelle Lensink | Liberal | Retained |
| Jackson | Rose Jackson | — | — | — | Neutral |
| James | Bree James | — | — | — | Neutral |
| Jenkins | — | Harry Jenkins | — | — | Neutral |
| Johnson | — | Michael Johnson | — | — | Neutral |
| K.J. Maher | — | Kyam Maher | Kyam Maher | Labor | Retained |
| Katter | Rob Katter | — | — | — | Neutral |
| Kelly | Joe Kelly | — | — | — | Neutral |
| Kemp | Michael Kemp | — | — | — | Neutral |
| Kennedy | John Kennedy | Simon Kennedy | John Kennedy | Labor | Retained |
| Kerr | — | Duncan Kerr | — | — | Neutral |
| King | Shane King | — | — | — | Neutral |
| Kirkland | Donna Kirkland | Donna Kirkland | — | — | Neutral |
| Knight | Sharon Knight | Sharon Knight | — | — | Neutral |
| Krause | Jon Krause | Jon Krause | Jon Krause | LNP | Retained |
| Lane | Jordan Lane | — | — | — | Neutral |
| Latham | — | Mark Latham | Mark Latham | Independent | Retained |
| Lawrence | — | — | — | — | Neutral |
| Le | — | Dai Le | — | — | Neutral |
| Leahy | Ann Leahy | Ann Leahy | Ann Leahy | LNP | Retained |
| Lee | Elizabeth Lee | — | — | — | Neutral |
| Liddle | — | Kerrynne Liddle | — | — | Neutral |
| Lim | — | — | Hong Lim | Labor | Retained |
| Lindsay | — | Peter Lindsay | — | — | Neutral |
| Lister | James Lister | James Lister | James Lister | LNP | Retained |
| Lloyd | — | — | — | — | Neutral |
| Lui | Cynthia Lui | Cynthia Lui | Cynthia Lui | Labor | Retained |
| Lynch | Paul Lynch | — | — | — | Neutral |
| MacDonald | Aileen MacDonald | Aileen MacDonald | — | — | Neutral |
| Marshall | Steven Marshall | — | — | — | Neutral |
| Martin | James Martin | — | — | — | Neutral |
| McAllister | — | Jenny McAllister | — | — | Neutral |
| McBride | Nick McBride | Emma McBride | Nick McBride | Liberal | Retained |
| McCarthy | — | Malarndirri McCarthy | — | — | Neutral |
| McClelland | — | Robert McClelland | — | — | Neutral |
| McCormack | — | Michael McCormack | — | — | Neutral |
| McDonald | — | — | — | — | Neutral |
| McGhie | Steve McGhie | Steve McGhie | Steve McGhie | Labor | Retained |
| McGrath | — | James McGrath | — | — | Neutral |
| McGuire | Frank McGuire | Frank McGuire | Frank McGuire | — | Retained |
| McKenzie | — | — | — | — | Neutral |
| McKim | — | Nick McKim | — | — | Neutral |
| McLeay | — | LEO McLEAY | — | — | Neutral |
| McLeish | Cindy McLeish | Cindy McLeish | Cindy McLeish | Liberal | Retained |
| McMahon | Melissa McMahon | Melissa McMahon | Melissa McMahon | Labor | Retained |
| McMillan | Corrine McMillan | Corrine McMillan | Corrine McMillan | Labor | Retained |
| McMullan | — | — | — | — | Neutral |
| McNamara | — | Karen McNamara | Karen McNamara | Liberal | Retained |
| Millar | Lachlan Millar | Lachlan Millar | Lachlan Millar | LNP | Retained |
| Mitchell | — | — | — | — | Neutral |
| Moriarty | Tara Moriarty | Tara Moriarty | — | — | Neutral |
| Morris | Deborah Morris | — | — | — | Neutral |
| Morton | Kendall Morton | — | — | — | Neutral |
| Moylan | Brendan Moylan | — | — | — | Neutral |
| Mulholland | — | Corinne Mulholland | — | — | Neutral |
| Mullen | Charis Mullen | Charis Mullen | Charis Mullen | Labor | Retained |
| Munro | Jacqui Munro | Jacqui Munro | — | — | Neutral |
| Murphy | — | — | — | — | Neutral |
| Murray | Steve Murray | — | — | — | Neutral |
| Nelson | — | Brendan Nelson | — | — | Neutral |
| Neville | Lisa Neville | — | — | — | Neutral |
| Ng | — | Gabriel Ng | — | — | Neutral |
| Nicholls | Tim Nicholls | Tim Nicholls | Tim Nicholls | LNP | Retained |
| Nightingale | Margie Nightingale | Margie Nightingale | Margie Nightingale | Labor | Retained |
| Noonan | Wade Noonan | Wade Noonan | — | — | Neutral |
| Northe | By Northe | Russell Northe | Russell Northe | — | Retained |
| O'Byrne | — | Michelle Anne O'Byrne | — | — | Neutral |
| O'Connor | — | — | — | — | Neutral |
| O'Keefe | — | Neil Patrick O'Keefe | — | — | Neutral |
| O'Neill | — | — | — | — | Neutral |
| O'Sullivan | — | Matt O'Sullivan | — | — | Neutral |
| Orr | Suzanne Orr | Suzanne Orr | Suzanne Orr | Labor | Retained |
| Pakula | Martin Pakula | Martin Pakula | Martin Pakula | — | Retained |
| Park | Ryan Park | — | — | — | Neutral |
| Parker | Jamie Parker | — | — | — | Neutral |
| Paterson | — | — | Marisa Paterson | Labor | Retained |
| Patterson | S.J.R. Patterson | — | — | — | Neutral |
| Pearce | Rhiannon Pearce | — | — | — | Neutral |
| Pearson | Danny Pearson | — | — | — | Neutral |
| Perrett | Tony Perrett | Tony Perrett | Tony Perrett | LNP | Retained |
| Pettersson | Michael Pettersson | Michael Pettersson | Michael Pettersson | Labor | Retained |
| Phillips | — | Fiona Phillips | — | — | Neutral |
| Piper | Greg Piper | — | — | — | Neutral |
| Poole | Janelle Poole | Janelle Poole | Janelle Poole | LNP | Retained |
| Porter | — | Christian Porter | — | — | Neutral |
| Powell | Andrew Powell | Andrew Powell | Andrew Powell | LNP | Retained |
| Power | Linus Power | Linus Power | — | — | Neutral |
| Pratt | Penny Pratt | — | Penny Pratt | Liberal | Retained |
| Preston | Robyn Preston | — | — | — | Neutral |
| Price | — | — | — | — | Neutral |
| Pugh | Jess Pugh | Jess Pugh | — | — | Neutral |
| R.I. Lucas | — | Rob Lucas | Rob Lucas | Liberal | Retained |
| Rae | — | Sam Rae | — | — | Neutral |
| Ray | — | — | — | — | Neutral |
| Read | Tim Read | Tim Read | Tim Read | Greens | Retained |
| Reid | — | Gordon Reid | — | — | Neutral |
| Reynolds | — | — | — | — | Neutral |
| Richards | Pauline Richards | — | — | — | Neutral |
| Richardson | Tim Richardson | Tim Richardson | Tim Richardson | Labor | Retained |
| Riordan | Richard Riordan | Richard Riordan | Richard Riordan | Liberal | Retained |
| Roberts | — | — | Rod Roberts | Independent | Retained |
| Robinson | Mark Robinson | Mark Robinson | — | — | Neutral |
| Rudd | — | Kevin Rudd | Kevin Rudd | Labor | Retained |
| Ryall | Dee Ryall | Dee Ryall | — | — | Neutral |
| Ryan | — | — | — | — | Neutral |
| S.G. Wade | — | Stephen Wade | Stephen Wade | Liberal | Retained |
| Saunders | Bruce Saunders | — | — | — | Neutral |
| Scarr | — | Paul Scarr | — | — | Neutral |
| Sciacca | — | Concetto Antonio Sciacca | — | — | Neutral |
| Scott | Robin Scott | — | — | — | Neutral |
| Sharpe | Penny Sharpe | Penny Sharpe | Penny Sharpe | Labor | Retained |
| Sheldon | — | Tony Sheldon | — | — | Neutral |
| Shoebridge | — | David Shoebridge | — | — | Neutral |
| Sidoti | John Sidoti | — | — | — | Neutral |
| Simpson | Fiona Simpson | Fiona Simpson | Fiona Simpson | LNP | Retained |
| Singh | Gurmesh Singh | — | — | — | Neutral |
| Small | — | Ben Small | — | — | Neutral |
| Smith | Tom Smith | — | — | — | Neutral |
| Spence | Ros Spence | Ros Spence | Ros Spence | Labor | Retained |
| Steel | Chris Steel | Chris Steel | Chris Steel | Labor | Retained |
| Stevens | Ray Stevens | — | — | — | Neutral |
| Stewart | — | — | — | — | Neutral |
| Stuart | Maryanne Stuart | — | — | — | Neutral |
| Sullivan | — | Jimmy Sullivan | — | — | Neutral |
| Swan | — | Wayne Swan | — | — | Neutral |
| Tanner | — | Lindsay Tanner | — | — | Neutral |
| Taylor | Jackson Taylor | — | — | — | Neutral |
| Telfer | Sam Telfer | Sam Telfer | Sam Telfer | Liberal | Retained |
| Theophanous | Kat Theophanous | — | — | — | Neutral |
| Thomas | Mary-Anne Thomas | Mary-Anne Thomas | — | — | Neutral |
| Thompson | Erin Thompson | — | — | — | Neutral |
| Thomson | Marsha Thomson | Marsha Thomson | — | — | Neutral |
| Thorpe | — | Lidia Thorpe | Lidia Thorpe | Independent | Retained |
| Tilley | Bill Tilley | Bill Tilley | Bill Tilley | — | Retained |
| Treloar | Peter Treloar | Peter Treloar | Peter Treloar | Liberal | Retained |
| Tudehope | Monica Tudehope | — | — | — | Neutral |
| Urquhart | — | Anne Urquhart | — | — | Neutral |
| Walker | — | — | — | — | Neutral |
| Wallace | — | — | — | — | Neutral |
| Walsh | — | — | Peter Walsh | Nationals | Retained |
| Ward | Vicki Ward | — | — | — | Neutral |
| Ware | — | Jenny Ware | — | — | Neutral |
| Warren | Greg Warren | — | — | — | Neutral |
| Washington | Kate Washington | — | — | — | Neutral |
| Waters | — | Larissa Waters | — | — | Neutral |
| Watson | Anna Watson | — | — | — | Neutral |
| Watt | — | — | Graham Watt | Labor | Retained |
| Watts | Trevor Watts | — | Trevor Watts | LNP | Retained |
| Wells | Kim Wells | — | Kim Wells | Liberal | Retained |
| Whiteaker | — | Ellie Whiteaker | — | — | Neutral |
| Whiting | Chris Whiting | Chris Whiting | Chris Whiting | Labor | Retained |
| Wilkinson | Kylie Wilkinson | — | — | — | Neutral |
| Williams | Gabrielle Williams | — | — | — | Neutral |
| Williamson | Richie Williamson | — | — | — | Neutral |
| Wilson | Felicity Wilson | — | — | — | Neutral |
| Wong | — | Penny Wong | — | — | Neutral |
| Wooldridge | Michael Wooldridge | Michael Wooldridge | — | — | Neutral |
| Worth | — | — | — | — | Neutral |
| Young | Rebecca Young | — | — | — | Neutral |
| Zahra | — | Christian John Zahra | Christian John Zahra | Labor | Retained |

## Exact public dry-run operations

| Action | Slug | Profile |
|---|---|---|
| retire | `roster-profile-04c84a8e2e2f51f3` | Watt — recorded representation |
| replace | `roster-profile-068c04a64f4d6d0a` | Fregon — recorded representation |
| replace | `roster-profile-0cc4b1dc91bcb587` | Connolly — recorded representation |
| replace | `roster-profile-128b2a6b11a74ecc` | Richmond — recorded representation |
| replace | `roster-profile-14429d05ad173a03` | Hatcher — recorded representation |
| replace | `roster-profile-1745992a04e3a825` | McGhie — recorded representation |
| replace | `roster-profile-24a352af0cebeb26` | Mark Latham — recorded representation |
| retire | `roster-profile-25c7e17d3e9906a3` | Hall — recorded representation |
| replace | `roster-profile-2823576859b5816a` | Allan — recorded representation |
| replace | `roster-profile-2a9c84d0208e5425` | Blandthorn — recorded representation |
| retire | `roster-profile-2d1e830624b2572a` | Ryan — recorded representation |
| retire | `roster-profile-3228d821dcaa680d` | Patterson — recorded representation |
| retire | `roster-profile-332e04b724b0a984` | Wells — recorded representation |
| replace | `roster-profile-38592d0cc9b36019` | Hamer — recorded representation |
| retire | `roster-profile-3a57aaa983f63746` | Garrett — recorded representation |
| replace | `roster-profile-3c237edf766933af` | Richardson — recorded representation |
| replace | `roster-profile-4008f1ed47469d0b` | Perera — recorded representation |
| replace | `roster-profile-4b54a74d0bc58377` | Staley — recorded representation |
| replace | `roster-profile-51389ddc33bbe1a8` | Tilley — recorded representation |
| retire | `roster-profile-53b67882d1ef765c` | Hood — recorded representation |
| retire | `roster-profile-55fb96bf33f19ca5` | Guy — recorded representation |
| replace | `roster-profile-59b31e31f2108026` | Rowswell — recorded representation |
| retire | `roster-profile-5dfcf9ef1fb1ecbc` | Thomas — recorded representation |
| replace | `roster-profile-60ebd6bcc7db69e6` | Kilkenny — recorded representation |
| create | `roster-profile-654f4c67d878e078` | Zahra — recorded representation |
| replace | `roster-profile-671937d5fbe84833` | Enoch — recorded representation |
| replace | `roster-profile-6b2f9cafe62cf707` | Addison — recorded representation |
| retire | `roster-profile-6bb48cc5c7864234` | Richards — recorded representation |
| retire | `roster-profile-6e8d8801f51aafe8` | Williams — recorded representation |
| retire | `roster-profile-722b84aa2c4f6162` | Scanlon — recorded representation |
| replace | `roster-profile-7479e3a2fd685227` | D'Ambrosio — recorded representation |
| create | `roster-profile-74ae65435bc77f11` | Shaun Leane — recorded representation |
| replace | `roster-profile-76df69fa9d736283` | Carroll — recorded representation |
| retire | `roster-profile-7d12edc0aac210e0` | Linard — recorded representation |
| retire | `roster-profile-7f2cc2d8db905052` | Morris — recorded representation |
| retire | `roster-profile-7f7067993647ba86` | L.W.K. Bignell — recorded representation |
| retire | `roster-profile-7fe5df9caca67218` | Sullivan — recorded representation |
| retire | `roster-profile-813f46eed45decb5` | Brooks — recorded representation |
| replace | `roster-profile-8188fe38fdd1502d` | Lynda Voltz — recorded representation |
| replace | `roster-profile-845666d5a05426ab` | Hibbins — recorded representation |
| retire | `roster-profile-88c4947f2996593e` | S.J.R. Patterson — recorded representation |
| retire | `roster-profile-88f7d9080f5b37ab` | Gardner — recorded representation |
| retire | `roster-profile-915ea74ac01cd10e` | Andrews — recorded representation |
| retire | `roster-profile-9230ee73603d65a6` | Worth — recorded representation |
| replace | `roster-profile-95550208e7bac16e` | Pallas — recorded representation |
| replace | `roster-profile-95e178b51ca9d858` | Basham — recorded representation |
| replace | `roster-profile-a0c79a8531e1feaa` | Settle — recorded representation |
| replace | `roster-profile-a31537a34670a046` | Fentiman — recorded representation |
| replace | `roster-profile-a78fb093d48ed1b1` | Couzens — recorded representation |
| replace | `roster-profile-a9a96d230d00826a` | Weir — recorded representation |
| replace | `roster-profile-a9cafd60efe1a190` | Latham — recorded representation |
| replace | `roster-profile-b1284448f3eb6388` | Bob Horne — recorded representation |
| retire | `roster-profile-b1f74ef7ff3e7dfa` | Pearson — recorded representation |
| replace | `roster-profile-b298db0cbdbcbdfc` | Vallence — recorded representation |
| retire | `roster-profile-b311172dd9a45edf` | Ward — recorded representation |
| retire | `roster-profile-b530fac09ea738e2` | Horne — recorded representation |
| replace | `roster-profile-b7d8971fd7089472` | J.M.A. Lensink — recorded representation |
| replace | `roster-profile-bb1d48311506ab2c` | Ingrid Stitt — recorded representation |
| retire | `roster-profile-bbacffd9bc261704` | Cox — recorded representation |
| retire | `roster-profile-bca5db1840b734ed` | Brereton — recorded representation |
| replace | `roster-profile-c2d863c63fc32b41` | Bronnie Taylor — recorded representation |
| replace | `roster-profile-c37367a58a26cba7` | Suleyman — recorded representation |
| retire | `roster-profile-c43139196d576427` | Charles — recorded representation |
| replace | `roster-profile-c85428c6a27782f3` | Maas — recorded representation |
| replace | `roster-profile-c8bb89897f65c66c` | Fowles — recorded representation |
| replace | `roster-profile-c8d5b8aeb343f95f` | Carbines — recorded representation |
| replace | `roster-profile-c9543cb5532d27ac` | Edbrooke — recorded representation |
| replace | `roster-profile-ccc302efb18c3ffc` | Kempton — recorded representation |
| replace | `roster-profile-cdab02bff6d7f4b4` | Staikos — recorded representation |
| retire | `roster-profile-ceb32b93931ce2ef` | Bailey — recorded representation |
| replace | `roster-profile-d394e2a4020b802e` | Newbury — recorded representation |
| retire | `roster-profile-d3a3a167f6411557` | J.A.W. Gardner — recorded representation |
| replace | `roster-profile-d43974c13c6b3fb5` | David Kemp — recorded representation |
| retire | `roster-profile-d486dfbd5fb57834` | Green — recorded representation |
| replace | `roster-profile-d4c73fc7bf88b45f` | Northe — recorded representation |
| replace | `roster-profile-d73e9a3c865c8158` | Ros Spence — recorded representation |
| replace | `roster-profile-d80f3e7b13b303ec` | Michael Lee — recorded representation |
| retire | `roster-profile-d85eb74fd75da1bc` | Butcher — recorded representation |
| retire | `roster-profile-dc01da548cb3a5f7` | Farmer — recorded representation |
| replace | `roster-profile-dc324fd4f6a5ebdc` | Kernot — recorded representation |
| replace | `roster-profile-e1ee9d20d2336e24` | Hutchins — recorded representation |
| replace | `roster-profile-e76852d73fd15af8` | Furner — recorded representation |
| replace | `roster-profile-e778a928dde64186` | Sandell — recorded representation |
| replace | `roster-profile-ec33cf403b166c62` | Battin — recorded representation |
| replace | `roster-profile-f0d4afea2ae88330` | Pesutto — recorded representation |
| replace | `roster-profile-f10c3dd20768dbfa` | D’Ambrosio — recorded representation |
| replace | `roster-profile-f17a23da8c159549` | Dimopoulos — recorded representation |
| replace | `roster-profile-f2dd86e34cc18d36` | Burgess — recorded representation |
| retire | `roster-profile-f3cdc1043ba7dd24` | Crawford — recorded representation |
| retire | `roster-profile-f45059f514ba1dc9` | D.K.B. Basham — recorded representation |
| replace | `roster-profile-f66c37bba249563d` | McLeish — recorded representation |
| retire | `roster-profile-fdd571b8488fd086` | Theophanous — recorded representation |
