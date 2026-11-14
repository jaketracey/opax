#!/usr/bin/env bash
# Admission tests for qa-simulator.sh: one booted device per host unless another
# slot's device is named in OPAX_SIM_ADMIT_IGNORE. Stubs xcrun; boots nothing.
set -u
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap '/bin/rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat > "$tmp/bin/xcrun" <<'STUB'
#!/usr/bin/env bash
# xcrun simctl list devices booted -j: report the UDIDs in $QA_TEST_BOOTED as Booted.
python3 -c 'import json,os;print(json.dumps({"devices":{"rt":[{"udid":u,"state":"Booted"} for u in os.environ.get("QA_TEST_BOOTED","").split()]}}))'
STUB
chmod +x "$tmp/bin/xcrun"
PATH="$tmp/bin:$PATH"
unset OPAX_PASTE_LOCK OPAX_KEEP_SIM_BOOTED OPAX_SIM_ADMIT_IGNORE
source "$here/qa-simulator.sh"
fails=0
check() {  # <name> <want: ok|refused> <wanted udid> <booted...> -- env assignments via caller
  local name=$1 want=$2 udid=$3 got
  if (qa_simulator_admit "$udid") 2>/dev/null; then got=ok; else got=refused; fi
  if [ "$got" = "$want" ]; then echo "ok - $name"; else echo "not ok - $name (got $got, want $want)"; fails=$((fails + 1)); fi
}
QA_TEST_BOOTED="" check "nothing booted admits" ok A
QA_TEST_BOOTED="A" check "only the wanted device booted admits" ok A
QA_TEST_BOOTED="B" check "another booted device refuses (default)" refused A
QA_TEST_BOOTED="B" OPAX_SIM_ADMIT_IGNORE="B" check "another slot's device named in the ignore list admits" ok A
QA_TEST_BOOTED="B C" OPAX_SIM_ADMIT_IGNORE="B" check "an unlisted third device still refuses" refused A
lock="$tmp/slot-a.lock"; mkdir -p "$lock.opax"; echo K > "$lock.opax/kept-simulator"
QA_TEST_BOOTED="K" OPAX_PASTE_LOCK="$lock" OPAX_SIM_ADMIT_IGNORE="K B" check "this slot's own kept device is never ignored" refused A
QA_TEST_BOOTED="B" OPAX_PASTE_LOCK="$lock" OPAX_SIM_ADMIT_IGNORE="K B" check "the other slot's device is still ignored with a kept record" ok A
[ "$fails" = 0 ] && echo "PASS test-qa-simulator ($fails failures)" || { echo "FAIL test-qa-simulator ($fails failures)"; exit 1; }
