# Evidence input provisioning

This is a **written procedure for the orchestrator**, not a record of work performed.
None of these provisioning commands was run in the evidence lane. Provisioning is
undecided; it is valid to leave evidence waiting indefinitely. The nightly emits one
warning and `evidence: waiting for inputs (missing: …)` or `(mismatch: …)`, preserves
catch-up and skips export without failing the night.

## Required inventory and disk space

The box needs a mutually consistent, completed set of **five SQLite files**, plus the
roster already committed at `~/opax/portal/public/parliamentarians.json`. No KB access,
credentials transfer, sidecar builder or mention rescan is needed for publication.

| File | Setting | Size known before provisioning |
| --- | --- | --- |
| Matching corpus snapshot (`parli.db` in the bundle) | `OPAX_EVIDENCE_SOURCE` | Historical full corpus approximately 29 GB; exact snapshot size must be inventoried |
| `evidence-layers-full.sqlite` | `OPAX_EVIDENCE_LAYERS` | Individual size not supplied; included in the reported sidecar total |
| `evidence-places.sqlite` | `OPAX_EVIDENCE_PLACES` | Individual size not supplied; included in the reported sidecar total |
| `evidence-identity-decisions.sqlite` | `OPAX_EVIDENCE_DECISIONS` | Individual size not supplied; included in the reported sidecar total |
| `evidence-additional-mentions.sqlite` | `OPAX_EVIDENCE_ADDITIONAL` | Individual size not supplied; included in the reported sidecar total |
| Any active `<input>-wal` / `<input>-shm` | Snapshot inputs only; do not transfer separately | Review reports an additional WAL, size and owning input unspecified |

The review reports **3.4 GiB combined for the four sidecars, plus a WAL**. No per-file
measurement was supplied, and this lane did not inspect the real files. The desktop
commands below write exact byte sizes for both the original files and their WAL/SHM
companions to `input-sizes.json`, and exact standalone snapshot sizes to
`snapshot-sizes.json`. These inventories travel with the bundle; they are receipts,
not extra nightly inputs. `SHA256SUMS` records the five snapshot hashes.

Decide disk capacity before transfer. A separate full source snapshot adds roughly
29 GB to the sidecars; the existing 58 GB box may not fit that alongside its live DB.
Budget the frozen bundle, the existing live DB, about 312 MiB for old/staged public
evidence, SQLite sorting space and the nightly's 5 GB free-space reserve. Raw transfer
into a versioned incoming directory avoids holding compressed and decompressed copies.
Do not overwrite the live DB to make room. A reduced source containing only the four
required tables is a separate reviewed option; it must preserve all relevant columns,
source IDs, text, URLs and grant rowids.

## Matching source and WAL handling

The sidecars were completed against a specific corpus, not whichever live `parli.db`
exists today. The September publication covered 1,310,477 speeches, 21,234 releases
and 230,007 grants. A current source with additional records does not match those
sidecars. Use a retained matching snapshot, or arrange a separate reviewed sidecar
update; provisioning alone does not advance them.

Point **`OPAX_EVIDENCE_SOURCE` at the frozen bundle's source**, leaving the nightly's
live `parli.db` and KB checkpoint untouched. Use the four sidecar settings to select
the same versioned bundle. The exporter requires `speeches`, `ext_press_releases` and
`government_grants`; the source audit also requires `postcode_electorates`.

Quiesce every writer to all five selected inputs for the entire snapshot operation.
SQLite backup gives a consistent individual DB, but five independent backups are not
a cross-database transaction. All five must remain frozen together. Do not infer that
writers stopped from a log, and do not print process command lines or arguments.

Use SQLite's backup API from read-only source connections. It includes committed WAL
pages in each standalone destination. Copying a main file alone while its WAL is live
can silently omit rows; copying main and WAL at different moments is also unsafe.
Do not delete or checkpoint an original WAL as part of this procedure. Never use
`immutable=1` on an input with an active WAL: it can ignore that WAL. Set the *new
destination* to DELETE journal mode after backup so its transfer needs no WAL/SHM.

## Desktop: snapshot, inventory and verify

Run only after the orchestrator selects a matching source, freezes all writers and
reviews the capacity plan. Replace the explicit source placeholder and choose a new
bundle path. These commands create scratch snapshots; they do not modify public data,
the original input databases or the KB.

```bash
cd /home/jake/opax-work/wt/evidence-nightly
export EVIDENCE_SOURCE_INPUT=/absolute/path/to/reviewed-matching-source.sqlite
export EVIDENCE_INPUT_CACHE="$HOME/.cache/autoresearch"
export EVIDENCE_BUNDLE="$HOME/evidence-transfer/2026-09-08-v1"
python3 - <<'PY'
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3

root = Path(os.environ['EVIDENCE_BUNDLE'])
inputs = {'parli.db': Path(os.environ['EVIDENCE_SOURCE_INPUT'])}
for name in ('evidence-layers-full.sqlite', 'evidence-places.sqlite',
             'evidence-identity-decisions.sqlite', 'evidence-additional-mentions.sqlite'):
    inputs[name] = Path(os.environ['EVIDENCE_INPUT_CACHE']) / name
if not all(path.is_file() for path in inputs.values()):
    raise SystemExit('Selected source or sidecars missing; no bundle created')
root.mkdir(parents=True, exist_ok=False)
original_sizes = {}
snapshots = {}
hashes = []
for name, source_path in inputs.items():
    for suffix in ('', '-wal', '-shm'):
        path = Path(str(source_path) + suffix)
        if path.is_file():
            original_sizes[str(path)] = path.stat().st_size
    target = root / name
    with closing(sqlite3.connect(source_path.resolve().as_uri() + '?mode=ro', uri=True)) as src:
        with closing(sqlite3.connect(target)) as dest:
            src.backup(dest)
            dest.execute('PRAGMA journal_mode=DELETE')
            if dest.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
                raise SystemExit(f'Invalid snapshot: {name}; do not transfer this bundle')
    if any(Path(str(target) + suffix).exists() for suffix in ('-wal', '-shm')):
        raise SystemExit(f'Snapshot still has WAL/SHM: {name}; do not transfer')
    snapshots[name] = target.stat().st_size
    with target.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    hashes.append(f'{digest}  {name}\n')
(root / 'input-sizes.json').write_text(json.dumps(original_sizes, indent=2) + '\n')
(root / 'snapshot-sizes.json').write_text(json.dumps(snapshots, indent=2) + '\n')
(root / 'SHA256SUMS').write_text(''.join(hashes))
print(json.dumps(snapshots, indent=2))
PY
export OPAX_EVIDENCE_SOURCE="$EVIDENCE_BUNDLE/parli.db"
export OPAX_EVIDENCE_LAYERS="$EVIDENCE_BUNDLE/evidence-layers-full.sqlite"
export OPAX_EVIDENCE_PLACES="$EVIDENCE_BUNDLE/evidence-places.sqlite"
export OPAX_EVIDENCE_DECISIONS="$EVIDENCE_BUNDLE/evidence-identity-decisions.sqlite"
export OPAX_EVIDENCE_ADDITIONAL="$EVIDENCE_BUNDLE/evidence-additional-mentions.sqlite"
python3 scripts/vm/evidence_inputs.py
```

The read-only readiness command must print `ready` and exit 0. Exit 3 means waiting;
it names missing/unreadable files or coverage mismatches. It checks exact source and
primary/places progress counts, the grant programme max-rowid checkpoint, decision
count versus identity candidates, and additional speech/release progress. **These
coverage counts alone do not prove unchanged source text or identity.** Verify a
full scratch export and source audit before accepting the selected snapshot:

```bash
evidence_preview=$(mktemp -d "$HOME/evidence-verify.XXXXXX")
python3 scripts/export_evidence_layers.py \
  --source "$OPAX_EVIDENCE_SOURCE" --evidence "$OPAX_EVIDENCE_LAYERS" \
  --places "$OPAX_EVIDENCE_PLACES" --decisions "$OPAX_EVIDENCE_DECISIONS" \
  --additional "$OPAX_EVIDENCE_ADDITIONAL" --output "$evidence_preview/export" && \
python3 scripts/audit_evidence_export.py \
  --source "$OPAX_EVIDENCE_SOURCE" --export "$evidence_preview/export"
```

Both commands must exit 0, with complete coverage and no audit errors. The audit
checks published source spans, fingerprints, grant fields, URLs, postcode mappings
and public totals. Do not use incomplete/preview overrides, install this output into
`portal/public/evidence`, or transfer a failed bundle. Retain the audit receipt for
review. The box's nightly repeats export/audit and applies its asset/retention guards.

After a successful review, transfer to a new incoming directory. Replace the host
placeholder explicitly; use the existing SSH key without printing its contents.

```bash
export EVIDENCE_BOX=ubuntu@REVIEWED_REFRESH_BOX_ADDRESS
ssh -i "$HOME/.ssh/opax-refresh.pem" "$EVIDENCE_BOX" \
  'mkdir -p ~/evidence-transfer/2026-09-08-v1.incoming'
rsync -a --partial -e "ssh -i $HOME/.ssh/opax-refresh.pem" \
  "$EVIDENCE_BUNDLE/" "$EVIDENCE_BOX:evidence-transfer/2026-09-08-v1.incoming/"
```

Do not point nightly configuration at an incoming directory. No existing active
bundle or live database is overwritten by this transfer.

## Box: verify and select the frozen bundle

These are commands to run *after provisioning is approved*, not part of this lane.
Choose a maintenance window so the configuration change cannot race a running nightly.
Verify hashes, sizes and SQLite integrity before making the bundle selectable:

```bash
cd "$HOME/evidence-transfer/2026-09-08-v1.incoming"
sha256sum -c SHA256SUMS && python3 - <<'PY'
from contextlib import closing
import json
from pathlib import Path
import sqlite3

for name, expected in json.loads(Path('snapshot-sizes.json').read_text()).items():
    path = Path(name)
    if path.stat().st_size != expected:
        raise SystemExit(f'Size mismatch: {name}')
    if any(Path(name + suffix).exists() for suffix in ('-wal', '-shm')):
        raise SystemExit(f'Unexpected snapshot WAL/SHM: {name}')
    with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as db:
        if db.execute('PRAGMA quick_check').fetchall() != [('ok',)]:
            raise SystemExit(f'Invalid snapshot: {name}')
print('Five standalone snapshots verified')
PY
```

Only after that block succeeds, select the paths for a read-only coverage check:

```bash
export EVIDENCE_BUNDLE="$HOME/evidence-transfer/2026-09-08-v1.incoming"
export OPAX_EVIDENCE_SOURCE="$EVIDENCE_BUNDLE/parli.db"
export OPAX_EVIDENCE_LAYERS="$EVIDENCE_BUNDLE/evidence-layers-full.sqlite"
export OPAX_EVIDENCE_PLACES="$EVIDENCE_BUNDLE/evidence-places.sqlite"
export OPAX_EVIDENCE_DECISIONS="$EVIDENCE_BUNDLE/evidence-identity-decisions.sqlite"
export OPAX_EVIDENCE_ADDITIONAL="$EVIDENCE_BUNDLE/evidence-additional-mentions.sqlite"
cd "$HOME/opax"
.venv/bin/python scripts/vm/evidence_inputs.py
```

It must print `ready` and exit 0. The checked hashes identify the exact desktop
snapshots whose export/audit passed; do not substitute the live source afterward.
After verification, finalize the directory without copying its large files again:

```bash
test ! -e "$HOME/evidence-transfer/2026-09-08-v1" && \
mv "$HOME/evidence-transfer/2026-09-08-v1.incoming" "$HOME/evidence-transfer/2026-09-08-v1"
```

Set these five lines in `~/.config/opax/nightly.env`, replacing any previous evidence
settings. The file is sourced by the existing nightly; no new schedule is needed:

```bash
OPAX_EVIDENCE_SOURCE="$HOME/evidence-transfer/2026-09-08-v1/parli.db"
OPAX_EVIDENCE_LAYERS="$HOME/evidence-transfer/2026-09-08-v1/evidence-layers-full.sqlite"
OPAX_EVIDENCE_PLACES="$HOME/evidence-transfer/2026-09-08-v1/evidence-places.sqlite"
OPAX_EVIDENCE_DECISIONS="$HOME/evidence-transfer/2026-09-08-v1/evidence-identity-decisions.sqlite"
OPAX_EVIDENCE_ADDITIONAL="$HOME/evidence-transfer/2026-09-08-v1/evidence-additional-mentions.sqlite"
```

Leave `pipeline/evidence-refresh-v1.pending` in place. The next ordinary acquisition
run checks readiness once and performs the reviewed export if ready; otherwise it
continues to report waiting without turning the night red. Do not run a full nightly,
push, deploy or publish from these verification commands. Keep the frozen bundle
unchanged after selection; evolving it requires a new reviewed snapshot set.
