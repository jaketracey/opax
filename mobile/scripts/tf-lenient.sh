#!/usr/bin/env bash
# TestFlight-only lenient mode, for sourcing. With OPAX_TF_LENIENT=1 a step run
# through lenient_step gets one retry; a second failure is written to
# warnings.txt in the release evidence directory and the release carries on.
# Without the flag lenient_step runs the step once and its failure blocks, as
# before. Only the harness's own self-tests and waits on host load go through
# lenient_step. Checks of the commit, signing, entitlements, voice mode,
# secrets, the request allow-list, the version and build number, and of the
# app or bundle itself never do. An App Store submission build must not set
# the flag (docs/IOS-RELEASE.md).
case "${OPAX_TF_LENIENT:-0}" in
  0) ;;
  1)
    [ -n "${OPAX_RELEASE_OUT:-}" ] && [ -d "$OPAX_RELEASE_OUT" ] || {
      echo 'OPAX_TF_LENIENT=1 refused: it applies only inside a TestFlight release with an evidence directory.' >&2
      exit 2
    } ;;
  *) echo 'OPAX_TF_LENIENT must be 0 or 1.' >&2; exit 2 ;;
esac
TF_LENIENT_WARNINGS=0
tf_lenient_file() { printf '%s\n' "$OPAX_RELEASE_OUT/warnings.txt"; }

# lenient_step <step name> <command...>
lenient_step() {
  local step=$1 rc=0 output reason
  shift
  if [ "${OPAX_TF_LENIENT:-0}" != 1 ]; then "$@"; return; fi
  "$@" || rc=$?
  [ "$rc" != 0 ] || return 0
  echo "OPAX lenient: $step failed (exit $rc); retrying once." >&2
  output=$(mktemp "${TMPDIR:-/tmp}/opax-tf-lenient.XXXXXX")
  rc=0
  "$@" > "$output" 2>&1 || rc=$?
  cat "$output"
  if [ "$rc" = 0 ]; then /bin/rm -f "$output"; return 0; fi
  # The reason is the exit status and, when the step printed one, its first
  # named failing test. Other output stays in the step's own log.
  reason=$(grep -m 1 -E '^(not ok|FAIL:|ERROR:) ' "$output" | tr '\t' ' ' | cut -c 1-200 || true)
  /bin/rm -f "$output"
  printf '%s\tattempts=2\texit %s%s\n' "$step" "$rc" "${reason:+: $reason}" >> "$(tf_lenient_file)"
  TF_LENIENT_WARNINGS=$((TF_LENIENT_WARNINGS + 1))
  echo "OPAX lenient: WARNING, $step failed twice (exit $rc); recorded and continuing." >&2
}

# Prints every warning this release recorded, from any process.
tf_lenient_summary() {
  [ "${OPAX_TF_LENIENT:-0}" = 1 ] || return 0
  local file count=0
  file=$(tf_lenient_file)
  [ ! -f "$file" ] || count=$(grep -c '' "$file")
  echo "TestFlight lenient mode: $count warning(s). Not an App Store submission build."
  [ "$count" = 0 ] || { cat "$file"; echo "Warnings file: $file"; }
}
