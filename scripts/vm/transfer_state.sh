#!/usr/bin/env bash
# scripts/vm/transfer_state.sh -- move the pipeline's state from the desktop to the refresh VM.
# Run ON THE DESKTOP (WSL), as the user that owns ~/.cache/autoresearch.
#
#   scripts/vm/transfer_state.sh --dest ubuntu@<ip>                  # everything, first time
#   scripts/vm/transfer_state.sh --dest ubuntu@<ip> --mode delta     # top-up (block-delta of the DB)
#   scripts/vm/transfer_state.sh --dest ubuntu@<ip> --only caches    # just the small caches
#   scripts/vm/transfer_state.sh --mark-migrated                     # the cutover marker, see below
#   SSH_OPTS="-i ~/.ssh/opax-refresh.pem" scripts/vm/transfer_state.sh --dest ...
# The EC2 instance's public IP changes at every stop/start: scripts/vm/ec2.sh ip
#
# What moves (everything under ~/.cache/autoresearch on the desktop):
#   parli.db                          28.9GB SQLite. Checkpointed, checksummed (sha256), zstd-compressed,
#                                     sent with rsync --partial --append-verify (resumes after a drop),
#                                     decompressed on the VM, sha256 and `PRAGMA quick_check` verified,
#                                     then moved into place. A half-sent file never becomes parli.db.
#   arag_sync_state.json              THE KB PUSH CHECKPOINT. Without it the first nightly would re-push
#   arag_speech_text_repair_state.json   the whole corpus (daily_refresh.sh refuses to run without it).
#   hansard/modern/                   1.3GB of downloaded Hansard JSONL (fed_download skips days it has)
#   bills_v2/                         1.1GB of cached ParlInfo pages (bills_fetch is cache-first; without
#                                     it the first run re-fetches thousands of pages at 0.7 req/s)
#   ipea/  qld_parliament/  nsw_hansard/  sa_hansard/  tvfy/     fetcher caches and progress files
#   bill_speech_briefs.json           (+ .checked.json) if present locally; it normally lives on the Mac,
#                                     so also: scp ~/.cache/autoresearch/bill_speech_briefs.json <vm>:.cache/autoresearch/
# NOT moved: hansard-corpus.zip, hansard-xml, embeddings, shards (13GB the daily steps never read), the
# old .bak copies of parli.db, pipeline logs, ext_money and other one-off research caches.
#
# THE CUTOVER RULE. There must only ever be ONE machine that runs daily_refresh.sh with OPAX_SYNC_KB=1:
# the push checkpoint (arag_sync_state.json) is per machine, and two machines pushing means duplicate
# resources and diverging checkpoints. So:
#   1. Rehearse:  transfer, run  OPAX_NIGHTLY_NO_PUSH=1 scripts/vm/nightly.sh  on the VM (note: this DOES
#      push new speeches to the knowledge box; only the git push and the deploy are suppressed).
#      Do not start the desktop's daily refresh again after the rehearsal's KB push.
#   2. Cut over:  stop the desktop's pipeline, run this script once more (--mode delta), then
#          scripts/vm/transfer_state.sh --mark-migrated
#      which writes ~/.cache/autoresearch/MIGRATED_TO_VM on the desktop. daily_refresh.sh then refuses
#      to run with OPAX_SYNC_KB=1 there (override: OPAX_FORCE_KB_SYNC=1, which you should never need).
#   3. On the VM:  scripts/vm/bootstrap.sh --enable-timer
#
# Options:
#   --dest USER@HOST     the VM (required except with --mark-migrated)
#   --mode full|delta    full = compressed snapshot (default if the VM has no parli.db)
#                        delta = rsync block-delta of the raw file into the VM's existing copy
#   --only WHAT          all (default) | db | state | caches
#   --copy-env           also copy the desktop's ~/opax/.env to the VM (only if the VM's is still the template)
#   --work DIR           where the compressed snapshot is staged (default ~/parli-transfer; needs ~12GB)
#   --keep               keep the staged snapshot afterwards
#   --dry-run            print every command instead of running it
#   --force              proceed although writers are running or the VM has already run a nightly
#   --mark-migrated      write the cutover marker and exit
set -euo pipefail

CACHE="$HOME/.cache/autoresearch"
DB="$CACHE/parli.db"
STATE_FILES=(arag_sync_state.json arag_speech_text_repair_state.json)
CACHE_DIRS=(hansard/modern bills_v2 ipea qld_parliament nsw_hansard sa_hansard tvfy)
BRIEF_FILES=(bill_speech_briefs.json bill_speech_briefs.checked.json)
DEST=""; MODE=""; ONLY=all; COPY_ENV=0; WORK="$HOME/parli-transfer"; KEEP=0; DRY=0; FORCE=0; MARK=0
SSH_OPTS="${SSH_OPTS:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dest) DEST=$2; shift 2 ;;
    --mode) MODE=$2; shift 2 ;;
    --only) ONLY=$2; shift 2 ;;
    --copy-env) COPY_ENV=1; shift ;;
    --work) WORK=$2; shift 2 ;;
    --keep) KEEP=1; shift ;;
    --dry-run) DRY=1; shift ;;
    --force) FORCE=1; shift ;;
    --mark-migrated) MARK=1; shift ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 64 ;;
  esac
done

if [ "$MARK" -eq 1 ]; then
  [ "$DRY" -eq 1 ] && { echo "would write $CACHE/MIGRATED_TO_VM"; exit 0; }
  printf 'migrated to the refresh VM on %s by %s\nDo not run daily_refresh.sh with OPAX_SYNC_KB=1 on this machine: the knowledge-box push checkpoint lives on the VM now.\n' \
    "$(date -Is)" "$(id -un)@$(hostname)" > "$CACHE/MIGRATED_TO_VM"
  echo "wrote $CACHE/MIGRATED_TO_VM; daily_refresh.sh will now refuse OPAX_SYNC_KB=1 on this machine."
  exit 0
fi

[ -n "$DEST" ] || { echo "--dest USER@HOST is required" >&2; exit 64; }
case "$ONLY" in all|db|state|caches) ;; *) echo "--only must be all, db, state or caches" >&2; exit 64 ;; esac

say()  { printf '\n==> %s\n' "$*"; }
die()  { echo "ERROR: $*" >&2; exit 1; }
# shellcheck disable=SC2086  # SSH_OPTS is a word list on purpose
vm()   { if [ "$DRY" -eq 1 ]; then echo "  [vm] $*"; else ssh $SSH_OPTS -o BatchMode=yes "$DEST" "$@"; fi; }
run()  { if [ "$DRY" -eq 1 ]; then echo "  [local] $*"; else "$@"; fi; }
# shellcheck disable=SC2086
rsync_to() { rsync -a --partial --info=progress2,stats1 -e "ssh $SSH_OPTS -o BatchMode=yes" "$@"; }
retry() { local n=0; until "$@"; do n=$((n+1)); [ "$n" -ge 20 ] && return 1; echo "  retry $n/20 in 30s..."; sleep 30; done; }

# ---- preflight --------------------------------------------------------------------------------------------
say "preflight"
for c in ssh rsync zstd sqlite3 sha256sum; do command -v "$c" >/dev/null || die "$c is not installed here (sudo apt install rsync zstd sqlite3 openssh-client coreutils)"; done
[ -f "$DB" ] || die "$DB not found: run this on the desktop"
[ "$DRY" -eq 1 ] || vm true || die "cannot ssh to $DEST (set SSH_OPTS for keys/ports)"
if [ "$DRY" -eq 0 ]; then
  vm 'command -v zstd rsync sqlite3 sha256sum >/dev/null' || die "the VM lacks zstd/rsync/sqlite3: run scripts/vm/bootstrap.sh there first"
  if [ "$FORCE" -eq 0 ] && vm 'test -f ~/.cache/autoresearch/pipeline/nightly-last.json'; then
    die "the VM has already run a nightly. Sending state now would overwrite a checkpoint that may be ahead of the desktop's. If you are sure: --force"
  fi
  if [ -z "$MODE" ]; then
    if vm 'test -s ~/.cache/autoresearch/parli.db'; then MODE='delta'; else MODE='full'; fi
  fi
else
  MODE=${MODE:-full}
fi
case "$MODE" in full|delta) ;; *) die "--mode must be full or delta" ;; esac
echo "  dest=$DEST mode=$MODE only=$ONLY work=$WORK"

if [ "$ONLY" = all ] || [ "$ONLY" = db ] || [ "$ONLY" = state ]; then
  # no writer may be running: the DB must be quiescent and the checkpoint must not move
  busy=$(pgrep -af 'daily_refresh\.sh|parli\.ingest\.|download_hansard_fast|classify_state_speeches|publish_bills\.py|words_sync|export_bills\.py|arag_' 2>/dev/null | grep -v "$0" | grep -v pgrep || true)
  holders=""
  if command -v lsof >/dev/null 2>&1; then holders=$(lsof -t "$DB" 2>/dev/null | tr '\n' ' ' || true); fi
  if [ -n "$busy" ] || [ -n "$holders" ]; then
    echo "  pipeline processes running:"; echo "$busy" | sed 's/^/    /'; [ -n "$holders" ] && echo "  pids with parli.db open: $holders"
    [ "$FORCE" -eq 1 ] || die "stop the writers first (nothing may write parli.db or arag_sync_state.json during the transfer); --force to override"
  fi
  if [ "$MODE" = full ] && [ "$DRY" -eq 0 ]; then
    free_local=$(df -Pk "$(dirname "$WORK")" | awk 'NR==2 {print int($4/1048576)}')
    [ "$free_local" -gt 15 ] || die "only ${free_local}GB free for the staged snapshot in $(dirname "$WORK"); use --work on a bigger disk"
  fi
fi
vm 'mkdir -p ~/.cache/autoresearch/pipeline ~/transfer'

# ---- 1. the database -----------------------------------------------------------------------------------------------
if [ "$ONLY" = all ] || [ "$ONLY" = db ]; then
  say "parli.db ($MODE)"
  run mkdir -p "$WORK"
  echo "  checkpointing the WAL (truncate)..."
  run sqlite3 "$DB" 'PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null
  before="$(stat -c '%s %Y' "$DB")"
  echo "  db: $before (bytes, mtime); checksumming..."
  if [ "$DRY" -eq 0 ]; then sha=$(sha256sum "$DB" | cut -d' ' -f1); else sha=DRYRUN; fi
  echo "  sha256 $sha"
  if [ "$MODE" = full ]; then
    echo "  compressing (zstd -T0)..."
    run zstd -T0 -3 --rsyncable -q -f "$DB" -o "$WORK/parli.db.zst"
    [ "$DRY" -eq 1 ] || [ "$(stat -c '%s %Y' "$DB")" = "$before" ] || die "parli.db changed while it was being copied: something wrote to it. Nothing was sent; rerun once quiet."
    echo "$sha" > "$WORK/parli.db.sha256"
    if [ "$DRY" -eq 0 ]; then
      raw_gb=$(( $(stat -c %s "$DB") / 1073741824 + 1 )); zst_gb=$(( $(stat -c %s "$WORK/parli.db.zst") / 1073741824 + 1 ))
      free_vm=$(vm "df -Pk ~ | awk 'NR==2 {print int(\$4/1048576)}'")
      [ "$free_vm" -gt $(( raw_gb + zst_gb + 3 )) ] || die "the VM has ${free_vm}GB free; it needs the ${zst_gb}GB compressed file and the ${raw_gb}GB database at once (+3GB). Nothing was sent."
    fi
    echo "  sending $( [ "$DRY" -eq 1 ] || du -h "$WORK/parli.db.zst" | cut -f1 ) (resumable)..."
    if [ "$DRY" -eq 1 ]; then echo "  [local] rsync --partial --append-verify $WORK/parli.db.zst $WORK/parli.db.sha256 $DEST:~/transfer/"; else
      retry rsync_to --append-verify "$WORK/parli.db.zst" "$WORK/parli.db.sha256" "$DEST:transfer/" || die "rsync kept failing"
    fi
    echo "  decompressing on the VM..."
    vm 'set -e; cd ~/.cache/autoresearch; rm -f parli.db.incoming; zstd -d -T0 -q ~/transfer/parli.db.zst -o parli.db.incoming'
  else
    echo "  block-delta into the VM's copy (only changed pages travel; the VM has not run a nightly, so it is not in service)..."
    vm 'rm -f ~/.cache/autoresearch/parli.db-wal ~/.cache/autoresearch/parli.db-shm; test -s ~/.cache/autoresearch/parli.db'
    if [ "$DRY" -eq 1 ]; then echo "  [local] rsync --inplace --no-whole-file $DB $DEST:.cache/autoresearch/parli.db"; else
      retry rsync_to --inplace --no-whole-file --no-compress "$DB" "$DEST:.cache/autoresearch/parli.db" || die "rsync kept failing: rerun; the VM copy is not usable until a run verifies"
    fi
  fi
  INCOMING=parli.db.incoming; [ "$MODE" = delta ] && INCOMING=parli.db
  echo "  verifying on the VM (sha256, then PRAGMA quick_check: this takes a while)..."
  vm "set -e; cd ~/.cache/autoresearch
      got=\$(sha256sum $INCOMING | cut -d' ' -f1)
      [ \"\$got\" = '$sha' ] || { echo \"SHA MISMATCH: got \$got want $sha\" >&2; exit 1; }
      r=\$(sqlite3 $INCOMING 'PRAGMA quick_check;')
      [ \"\$r\" = ok ] || { echo \"quick_check: \$r\" >&2; exit 1; }
      rm -f parli.db-wal parli.db-shm; [ $INCOMING = parli.db ] || mv -f $INCOMING parli.db
      echo \"  VM parli.db in place: \$(stat -c %s parli.db) bytes; quick_check ok; sha256 matches\"
      rm -f ~/transfer/parli.db.zst" || die "verification failed on the VM; the previous parli.db (if any) is untouched"
  local_speeches=$(run sqlite3 "file:$DB?mode=ro" 'SELECT COUNT(*) FROM speeches;' 2>/dev/null || echo "?")
  vm_speeches=$(vm 'sqlite3 "file:$HOME/.cache/autoresearch/parli.db?mode=ro" "SELECT COUNT(*) FROM speeches;"' 2>/dev/null || echo "?")
  echo "  speeches rows: desktop=$local_speeches vm=$vm_speeches"
  [ "$KEEP" -eq 1 ] || run rm -rf "$WORK"
fi

# ---- 2. small caches ---------------------------------------------------------------------------------------------------------
if [ "$ONLY" = all ] || [ "$ONLY" = caches ]; then
  say "caches"
  for d in "${CACHE_DIRS[@]}"; do
    if [ -d "$CACHE/$d" ]; then
      echo "  $d ($(du -sh "$CACHE/$d" | cut -f1))"
      vm "mkdir -p ~/.cache/autoresearch/$(dirname "$d")"
      if [ "$DRY" -eq 1 ]; then echo "  [local] rsync -a --partial --exclude='*.tmp' $CACHE/$d/ $DEST:.cache/autoresearch/$d/"; else
        retry rsync_to --exclude='*.tmp' "$CACHE/$d/" "$DEST:.cache/autoresearch/$d/" >/dev/null || die "rsync of $d kept failing"
      fi
    else
      echo "  $d: not on this machine, skipped"
    fi
  done
  for f in "${BRIEF_FILES[@]}"; do
    if [ -f "$CACHE/$f" ]; then echo "  $f"; run rsync_to "$CACHE/$f" "$DEST:.cache/autoresearch/" >/dev/null; fi
  done
fi

# ---- 3. the KB push checkpoint (LAST, after checking nothing moved it) -------------------------------------------------------------
if [ "$ONLY" = all ] || [ "$ONLY" = state ]; then
  say "knowledge-box push checkpoint"
  for f in "${STATE_FILES[@]}"; do
    if [ -f "$CACHE/$f" ]; then
      echo "  $f: $(tr -d ' \n' < "$CACHE/$f" | cut -c1-160)"
      run rsync_to "$CACHE/$f" "$DEST:.cache/autoresearch/" >/dev/null
    elif [ "$f" = arag_sync_state.json ]; then die "$CACHE/$f is missing: that is the checkpoint, refusing to continue"
    fi
  done
  if [ "$DRY" -eq 0 ]; then
    vm "python3 -c \"import json,os; s=json.load(open(os.path.expanduser('~/.cache/autoresearch/arag_sync_state.json')))['tables']; assert s['speeches']['after']>1000000, s; print('  VM checkpoint OK: speeches after', s['speeches']['after'], 'pushed', s['speeches']['pushed'])\"" \
      || die "the checkpoint on the VM does not look sane"
  fi
fi

if [ "$COPY_ENV" -eq 1 ]; then
  say "secrets"
  if [ "$DRY" -eq 1 ]; then echo "  [local] copy ~/opax/.env to the VM"; elif vm 'test -f ~/opax/.env && ! grep -Eq "^ARAG_KB_TOKEN=.+" ~/opax/.env'; then
    run rsync_to "$HOME/opax/.env" "$DEST:opax/.env"; vm 'chmod 600 ~/opax/.env'; echo "  copied ~/opax/.env"
  else echo "  the VM's ~/opax/.env is already filled in (or missing): not overwritten"; fi
fi

say "done"
cat <<EOF
Next, on the VM:
  1. fill in ~/opax/.env and ~/.config/opax/nightly.env if you have not (or re-run with --copy-env)
  2. rehearse:  OPAX_NIGHTLY_NO_PUSH=1 ~/opax/scripts/vm/nightly.sh
Before the timer goes on, on the desktop, once: scripts/vm/transfer_state.sh --mark-migrated
  (and never run daily_refresh.sh with OPAX_SYNC_KB=1 on the desktop again).
EOF
