#!/usr/bin/env bash
# Runs inside the build gate, started by qa_paste_lock_run (scripts/qa-lock.sh):
# one non-blocking attempt at the shared pasteboard lock, then the command under
# it. Exit 75: the lock was busy or the load spiked; nothing ran, nothing is held.
set -uo pipefail
# Lead a new process group, so the lock's owner covers the whole command tree.
if [ "$(/bin/ps -o pgid= -p $$ | tr -d ' ')" != "$$" ]; then
  exec /usr/bin/perl -e 'setpgrp(0, 0) or die "setpgrp: $!\n"; exec { $ARGV[0] } @ARGV or die "exec: $!\n"' bash "$0" "$@"
fi
source "$(dirname "$0")/qa-lock.sh"
[ "$#" -gt 0 ] || { echo "Usage: qa-locked.sh command [args...]" >&2; exit 2; }
qa_paste_lock_try
case $? in
  0) ;;
  1 | 2) exit "$QA_RETRY" ;;
  *) exit 1 ;;
esac
finish() {
  local rc=$?
  trap - EXIT INT TERM
  # Stop the command's leftovers first; if any survive, keep the lock so no
  # one else can use the pasteboard until the group is gone.
  if qa_stop_group; then qa_paste_lock_release; fi
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# In the background so a TERM is handled at once; still inside our group.
"$@" &
wait $!
rc=$?
# 75 means "retry" to the caller; a command never reports it.
[ "$rc" != "$QA_RETRY" ] || rc=1
exit "$rc"
