#!/usr/bin/env bash
# Local production archive/export. Upload is opt-in and requires the QA commit.
set +x
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
UPLOAD=0
BUILD_NUMBER=
EXPECTED_COMMIT=
EXPECTED_VOICE_MODE=
CALLER_VOICE_MODE_SET=${OPAX_PRODUCTION_VOICE+x}
CALLER_VOICE_MODE=${OPAX_PRODUCTION_VOICE-}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --build-number|--expected-commit|--expected-voice-mode)
      [ "$#" -ge 2 ] || { echo "Option requires a value" >&2; exit 2; }
      case "$1" in
        --build-number) BUILD_NUMBER=$2 ;;
        --expected-commit) EXPECTED_COMMIT=$2 ;;
        --expected-voice-mode) EXPECTED_VOICE_MODE=$2 ;;
      esac
      shift 2 ;;
    --upload) UPLOAD=1; shift ;;
    --help)
      echo 'release-ios.sh [--build-number N] [--upload --expected-commit SHA --expected-voice-mode 0|1]'
      exit 0 ;;
    *) echo "Unknown release option" >&2; exit 2 ;;
  esac
done
ROOT=$(git rev-parse --show-toplevel)
if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  echo "Release refused: commit all changes and use a clean worktree." >&2
  exit 1
fi
COMMIT=$(git rev-parse HEAD)
if [ -n "$EXPECTED_COMMIT" ] && [ "$COMMIT" != "$EXPECTED_COMMIT" ]; then
  echo "Release refused: HEAD differs from the expected QA commit." >&2; exit 1
fi
if [ "$UPLOAD" = 1 ] && [ -z "$EXPECTED_COMMIT" ]; then
  echo "Upload requires --expected-commit with the full SHA approved by QA." >&2; exit 1
fi
if [ "$UPLOAD" = 1 ] && [ -z "$EXPECTED_VOICE_MODE" ]; then
  echo 'Upload requires an explicit --expected-voice-mode 0 or 1.' >&2; exit 1
fi
source scripts/qa-env.sh
if [ -f private/local.env ]; then set -a; source private/local.env; set +a; fi
# An explicit caller mode wins over either ignored local configuration file.
if [ "$CALLER_VOICE_MODE_SET" = x ]; then export OPAX_PRODUCTION_VOICE=$CALLER_VOICE_MODE; fi
# Values remain local; do not enable tracing or echo any signing arguments.
python3 scripts/release_support.py --scan-tracked "$ROOT"
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
export OPAX_VARIANT=production EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 CI=1 PYTHONDONTWRITEBYTECODE=1
export OPAX_PRODUCTION_VOICE=${OPAX_PRODUCTION_VOICE-1}
case "$OPAX_PRODUCTION_VOICE" in 0|1) ;; *) echo 'OPAX_PRODUCTION_VOICE must be 0 or 1.' >&2; exit 2 ;; esac
if [ -n "$EXPECTED_VOICE_MODE" ]; then
  case "$EXPECTED_VOICE_MODE" in 0|1) ;; *) echo 'Expected voice mode must be 0 or 1.' >&2; exit 2 ;; esac
  [ "$EXPECTED_VOICE_MODE" = "$OPAX_PRODUCTION_VOICE" ] || {
    echo 'Release refused: effective voice mode differs from the explicit expected mode.' >&2; exit 1;
  }
fi
export OPAX_RELEASE_EXPECTED_VOICE_MODE=$EXPECTED_VOICE_MODE
unset OPAX_DEV_ORIGIN OPAX_FIXTURE_PORT EXPO_PUBLIC_API_ORIGIN
python3 - <<'PY'
from pathlib import Path
import sys
sys.path.insert(0, 'scripts')
from release_inputs import refuse_dotenv
refuse_dotenv(Path.cwd())
PY
XCODE_BUILD=$(python3 - <<'PY'
import pathlib,plistlib
root=pathlib.Path('/Applications/Xcode.app')
info=plistlib.loads((root/'Contents/version.plist').read_bytes())
build=info['ProductBuildVersion']
# Fail closed for unknown tools. Update this public release-build allow-list only
# after checking Apple's release record; beta bundles may be renamed Xcode.app.
if 'beta' in str(root.resolve()).lower() or build not in {'27A266a'}:
    raise SystemExit('Release requires a verified non-beta Xcode build.')
print(build)
PY
)
if [ -z "$BUILD_NUMBER" ]; then
  BUILD_NUMBER=$(python3 scripts/asc-testflight.py 0.1.0 --next-build)
fi
case "$BUILD_NUMBER" in ''|*[!0-9]*|0|0*) echo 'Build number must be a positive integer without leading zeroes.' >&2; exit 2 ;; esac
if [ "$UPLOAD" = 1 ]; then
  NEXT_ASC_BUILD=$(python3 scripts/asc-testflight.py 0.1.0 --next-build)
  python3 - "$BUILD_NUMBER" "$NEXT_ASC_BUILD" <<'PY'
import sys
sys.path.insert(0, 'scripts')
from release_inputs import check_upload_build
check_upload_build(sys.argv[1], sys.argv[2])
PY
fi
export OPAX_BUILD_NUMBER=$BUILD_NUMBER
VERSION=0.1.0
OUT="$PWD/private/release/$VERSION-$BUILD_NUMBER"
if [ -e "$OUT" ]; then
  echo 'Release evidence directory already exists; retain it and choose a new build number.' >&2
  exit 1
fi
mkdir -p "$OUT"
git check-ignore -q "$OUT" || { echo 'Release evidence must be git-ignored.' >&2; exit 1; }
printf '%s\n' "$COMMIT" > "$OUT/commit.txt"
printf '%s\n' "$XCODE_BUILD" > "$OUT/xcode-build.txt"
printf '%s\n' "$OPAX_PRODUCTION_VOICE" > "$OUT/production-voice-switch.txt"
ARCHIVE="$OUT/OPAX.xcarchive"
export OPAX_RELEASE_OUT="$OUT" OPAX_RELEASE_COMMIT="$COMMIT"
cleanup() {
  python3 - "$OUT" <<'PY'
import pathlib,re,shutil,sys,tempfile
p=pathlib.Path(sys.argv[1])
for name in ['Build/Intermediates.noindex','CompilationCache.noindex','ModuleCache.noindex','Logs']:
    target=p/'DerivedData'/name
    if target.is_dir(): shutil.rmtree(target)
(p/'ExportOptions.plist').unlink(missing_ok=True)
# Remove only distribution-log bundles emitted by this release's own export.
log=p/'export-command.log'
if log.exists():
    for raw in re.findall(r'Created bundle at path\s*:?\s*"([^"]+\.xcdistributionlogs)"', log.read_text()):
        target=pathlib.Path(raw)
        if target.name.startswith('OPAX_') and target.parent.resolve()==pathlib.Path(tempfile.gettempdir()).resolve() and target.is_dir():
            shutil.rmtree(target)
PY
}
trap 'release_status=$?; cleanup; exit "$release_status"' EXIT
logged_public() { python3 scripts/release_support.py --log "$OUT/$1.log" --public-env -- "${@:2}"; }
release_step() { python3 scripts/release_support.py --log "$OUT/$1.log" --step "$1"; }
scripts/capacity.sh
echo "Release $VERSION ($BUILD_NUMBER), exact commit $COMMIT; Xcode $XCODE_BUILD"
release_step dependencies
logged_public qa nice -n 10 npm run qa
release_step prebuild
logged_public native-config ./node_modules/.bin/tsx scripts/native-config.ts
[ -z "$(git status --porcelain --untracked-files=all)" ] || {
  echo 'Prebuild changed tracked inputs; review and commit before archiving.' >&2; exit 1;
}
printf 'export NODE_BINARY=%q\n' "$(command -v node)" > ios/.xcode.env.local
scripts/capacity.sh
START=$SECONDS
echo 'Archiving through the configured build gate…'
release_step archive
ARCHIVE_SECONDS=$((SECONDS - START))
printf '%s\n' "$ARCHIVE_SECONDS" > "$OUT/archive-seconds.txt"
echo "Archive completed in $ARCHIVE_SECONDS seconds."
verify() {
  local verify_command=(python3 -u scripts/verify-ios-release.py "$1" --kind "$2" --version "$VERSION" \
    --build "$BUILD_NUMBER" --commit "$COMMIT" --xcode-build "$XCODE_BUILD" \
    --output "$OUT/verification-$2.json")
  "${verify_command[@]}" 2>&1 | tee "$OUT/verification-$2.log"
}
verify "$ARCHIVE/Products/Applications/OPAX.app" archive
echo 'Exporting an App Store Connect IPA locally…'
scripts/capacity.sh
release_step export
IPAS=("$OUT/export/"*.ipa)
[ "${#IPAS[@]}" = 1 ] && [ -f "${IPAS[0]}" ] || { echo 'Expected exactly one IPA.' >&2; exit 1; }
IPA=${IPAS[0]}
python3 - "$IPA" <<'PY'
import pathlib,shutil,sys
ipa=pathlib.Path(sys.argv[1])
# Xcode also emits export summaries/options containing signing IDs. Keep only
# the IPA; our own command logs and verification reports are redacted.
for path in ipa.parent.iterdir():
    if path != ipa:
        if path.is_dir(): shutil.rmtree(path)
        else: path.unlink()
PY
python3 - "$IPA" <<'PY'
import pathlib,sys
print(f'Exported IPA: {pathlib.Path(sys.argv[1]).stat().st_size} bytes')
PY
# Reuse the harness's production-JS checks against the actual archived bundle.
logged_public bundle-check ./node_modules/.bin/tsx scripts/qa-static.ts \
  --production-bundle "$ARCHIVE/Products/Applications/OPAX.app"
verify "$IPA" distribution
python3 scripts/release_support.py --scan-tracked "$ROOT"
[ "$(git rev-parse HEAD)" = "$COMMIT" ] && [ -z "$(git status --porcelain --untracked-files=all)" ] || {
  echo 'Release refused: worktree or HEAD changed during the build.' >&2; exit 1;
}
python3 - "$OUT" "$ARCHIVE_SECONDS" <<'PY'
import json,pathlib,sys
p=pathlib.Path(sys.argv[1]); v=json.loads((p/'verification-distribution.json').read_text())
v['archive_seconds']=int(sys.argv[2]); v['uploaded']=False
v['production_voice_mode']='on' if v['production_voice_enabled'] else 'off'
(p/'release.json').write_text(json.dumps(v,indent=2)+'\n')
print(f"Archive: {v['archive_seconds']} seconds; IPA: {v['ipa_bytes']} bytes; SHA256: {v['ipa_sha256']}")
PY
if [ "$UPLOAD" = 1 ]; then
  # Only the orchestrator uses this. It bypasses the gate and rechecks HEAD and
  # the verified IPA hash immediately before uploading those exact bytes.
  release_step upload
fi
echo "Verified release evidence: private/release/$VERSION-$BUILD_NUMBER/"
