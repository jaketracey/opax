#!/usr/bin/env bash
# scripts/vm/test_transfer.sh -- exercise transfer_state.sh end to end on ONE machine: a "desktop"
# user sends a small sqlite DB, caches and the checkpoint over real ssh to a "vm" user on localhost.
# Needs root (creates two users and starts sshd), so run it in a throwaway container:
#
#   docker run --rm -v "$PWD":/src:ro ubuntu:24.04 bash -c \
#     'apt-get update -qq && apt-get install -y -qq openssh-server openssh-client rsync zstd sqlite3 procps python3 >/dev/null && bash /src/scripts/vm/test_transfer.sh'
set -uo pipefail
SRC="${OPAX_TEST_SRC:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
PASS=0; FAILN=0
ok()  { PASS=$((PASS+1)); echo "  ok   $*"; }
bad() { FAILN=$((FAILN+1)); echo "  FAIL $*"; }
check() { local d=$1; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }

id desk >/dev/null 2>&1 || useradd -m -s /bin/bash desk
id vmu  >/dev/null 2>&1 || useradd -m -s /bin/bash vmu
mkdir -p /run/sshd; ssh-keygen -A >/dev/null
echo 'PasswordAuthentication no' > /etc/ssh/sshd_config.d/99-test.conf
/usr/sbin/sshd
sudo_desk() { runuser -u desk -- env HOME=/home/desk "$@"; }
sudo_vm()   { runuser -u vmu  -- env HOME=/home/vmu  "$@"; }
sudo_desk ssh-keygen -q -t ed25519 -N '' -f /home/desk/.ssh/id_ed25519 2>/dev/null || { mkdir -p /home/desk/.ssh; chown desk /home/desk/.ssh; sudo_desk ssh-keygen -q -t ed25519 -N '' -f /home/desk/.ssh/id_ed25519; }
mkdir -p /home/vmu/.ssh; cat /home/desk/.ssh/id_ed25519.pub > /home/vmu/.ssh/authorized_keys; chown -R vmu /home/vmu/.ssh; chmod 700 /home/vmu/.ssh; chmod 600 /home/vmu/.ssh/authorized_keys
export SSH_OPTS="-i /home/desk/.ssh/id_ed25519 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
mkdir -p /home/desk/opax/scripts/vm; echo 'ARAG_KB_TOKEN=abc123' > /home/desk/opax/.env; cp "$SRC/scripts/vm/transfer_state.sh" /home/desk/opax/scripts/vm/; chown -R desk /home/desk/opax

# the "desktop": a WAL-mode db with real-ish content, the checkpoint, and caches
C=/home/desk/.cache/autoresearch; mkdir -p "$C/hansard/modern" "$C/bills_v2/billhome" "$C/tvfy/list" "$C/ipea" "$C/qld_parliament/pdfs" "$C/nsw_hansard" "$C/hansard/embeddings"
sqlite3 "$C/parli.db" 'PRAGMA journal_mode=WAL; CREATE TABLE speeches(id INTEGER PRIMARY KEY, body TEXT);' >/dev/null
python3 - <<PYEOF
import sqlite3, os
db = sqlite3.connect("$C/parli.db")
db.executemany("INSERT INTO speeches(body) VALUES (?)", [(os.urandom(200).hex(),) for _ in range(30000)])
db.commit(); db.close()
PYEOF
echo '{"tables":{"speeches":{"after":1323635,"pushed":600482,"failed":{}}}}' > "$C/arag_sync_state.json"
echo x > "$C/hansard/modern/2026-09-17_senate.jsonl"; echo y > "$C/hansard/embeddings/huge.bin"; echo z > "$C/bills_v2/billhome/a.html"
echo t > "$C/tvfy/list/1.json"; echo p > "$C/qld_parliament/pdfs/2026-09-16.pdf"; echo q > "$C/nsw_hansard/progress.txt"
echo '{}' > "$C/bill_speech_briefs.json"
chown -R desk /home/desk/.cache
mkdir -p /home/vmu/opax; printf 'ARAG_KB_TOKEN=\n' > /home/vmu/opax/.env; chown -R vmu /home/vmu/opax
DEST=vmu@localhost
T() { sudo_desk env SSH_OPTS="$SSH_OPTS" bash /home/desk/opax/scripts/vm/transfer_state.sh "$@"; }
VMC=/home/vmu/.cache/autoresearch

echo "== 1. first transfer (full mode)"
T --dest $DEST --work /home/desk/pt --copy-env >/tmp/t1.out 2>&1; rc=$?
check "exit 0" test $rc -eq 0
check "db identical on the vm" cmp -s "$C/parli.db" "$VMC/parli.db"
check "vm db passes quick_check" bash -c "[ \"\$(sqlite3 $VMC/parli.db 'PRAGMA quick_check;')\" = ok ]"
check "no incoming or wal leftovers" bash -c "[ ! -e $VMC/parli.db.incoming ] && [ ! -e $VMC/parli.db-wal ]"
check "checkpoint copied" cmp -s "$C/arag_sync_state.json" "$VMC/arag_sync_state.json"
check "caches copied" bash -c "[ -f $VMC/hansard/modern/2026-09-17_senate.jsonl ] && [ -f $VMC/bills_v2/billhome/a.html ] && [ -f $VMC/tvfy/list/1.json ] && [ -f $VMC/qld_parliament/pdfs/2026-09-16.pdf ] && [ -f $VMC/nsw_hansard/progress.txt ]"
check "the 13GB-class directories are NOT copied" test ! -e "$VMC/hansard/embeddings"
check "brief cache copied" test -f "$VMC/bill_speech_briefs.json"
check "staging dir cleaned" test ! -e /home/desk/pt
check "reports matching speech counts" grep -q 'speeches rows: desktop=30000 vm=30000' /tmp/t1.out
check "no cutover marker yet" test ! -e "$C/MIGRATED_TO_VM"

echo "== 2. the desktop keeps working; a delta transfer catches the vm up"
sqlite3 "$C/parli.db" "INSERT INTO speeches(body) VALUES ('new one'); PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null
echo '{"tables":{"speeches":{"after":1323999,"pushed":600999,"failed":{}}}}' > "$C/arag_sync_state.json"
T --dest $DEST >/tmp/t2.out 2>&1; rc=$?
check "exit 0" test $rc -eq 0
check "auto-selected delta mode" grep -q 'mode=delta' /tmp/t2.out
check "db identical again" cmp -s "$C/parli.db" "$VMC/parli.db"
check "new checkpoint arrived" grep -q 1323999 "$VMC/arag_sync_state.json"

echo "== 3. a running writer stops the transfer"
sudo_desk bash -c 'exec -a "python -m parli.ingest.speeches" sleep 60' &
sleep 1
T --dest $DEST >/tmp/t3.out 2>&1; rc=$?
check "refuses (exit non-zero)" test $rc -ne 0
check "says to stop the writers" grep -q 'stop the writers' /tmp/t3.out
pkill -9 -f 'parli.ingest.speeches' || true; pkill -9 -x sleep || true; sleep 1

echo "== 4. a damaged copy on the vm is repaired by a delta pass and re-verified"
python3 - <<PYEOF
with open("$VMC/parli.db", "r+b") as f:
    f.seek(5000); b = f.read(1); f.seek(5000); f.write(bytes([b[0] ^ 0xFF]))
PYEOF
T --dest $DEST --only db >/tmp/t4.out 2>&1
check "rsync repairs the damaged page (delta re-sends it)" cmp -s "$C/parli.db" "$VMC/parli.db"

echo "== 5. once the vm has run a nightly, it refuses to be overwritten"
sudo_vm bash -c 'mkdir -p ~/.cache/autoresearch/pipeline && echo "{}" > ~/.cache/autoresearch/pipeline/nightly-last.json'
T --dest $DEST >/tmp/t5.out 2>&1; rc=$?
check "refuses" test $rc -ne 0
check "explains why" grep -q 'already run a nightly' /tmp/t5.out
T --dest $DEST --force --only state >/tmp/t5b.out 2>&1
check "--force overrides" grep -q 'checkpoint' /tmp/t5b.out

echo "== 6. cutover marker"
T --mark-migrated >/tmp/t6.out 2>&1
check "marker written on the desktop" test -s "$C/MIGRATED_TO_VM"
check "marker names the rule" grep -q OPAX_SYNC_KB "$C/MIGRATED_TO_VM"

echo "== 7. the copy of the desktop's .env"
check "the empty template .env on the vm was replaced by the desktop's" grep -q 'ARAG_KB_TOKEN=abc123' /home/vmu/opax/.env
check "and it is private" bash -c "[ \"\$(stat -c %a /home/vmu/opax/.env)\" = 600 ]"

echo; echo "passed $PASS, failed $FAILN"
[ "$FAILN" -eq 0 ]
