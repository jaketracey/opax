#!/usr/bin/env bash
# Offline regressions for the TestFlight-only lenient mode. The real qa.sh and
# tf-lenient.sh run in a scratch directory with every gate stubbed; no build,
# device, credentials or network is touched.
set -euo pipefail
SCRIPTS=$(cd "$(dirname "$0")" && pwd)
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/opax-tf-lenient-test.XXXXXX")
trap '/bin/rm -rf "$SCRATCH"' EXIT
python3 - "$SCRIPTS" "$SCRATCH" <<'PYTEST'
import os, re, shutil, subprocess, sys
from pathlib import Path

scripts, scratch = Path(sys.argv[1]), Path(sys.argv[2]).resolve()
env = {k: v for k, v in os.environ.items()
       if not k.startswith(('OPAX_', 'EXPO_', 'NODE_', 'GIT_', 'BASH_FUNC_', 'QA_TEST_'))
       and k not in {'CI', 'BASH_ENV', 'ENV'}}
mobile = scratch/'mobile'; bin_dir = scratch/'bin'; trace = scratch/'trace'
out = scratch/'evidence'; warnings = out/'warnings.txt'; counts = scratch/'counts'
(mobile/'scripts').mkdir(parents=True); bin_dir.mkdir()
env.update(PATH=str(bin_dir)+os.pathsep+env['PATH'], QA_TEST_TRACE=str(trace), QA_TEST_COUNTS=str(counts))
for name in ('qa.sh', 'qa-env.sh', 'tf-lenient.sh'):
    shutil.copyfile(scripts/name, mobile/'scripts'/name)

# Each stub appends its name to the trace. QA_TEST_FAIL names one stub that
# fails with a TAP line; QA_TEST_FAIL_TIMES limits how many of its runs fail.
STUB = '''#!/usr/bin/env bash
set -euo pipefail
name=$(basename "$0"); [ "$name" != npm ] && [ "$name" != node ] || name="$name $*"
echo "$name" >> "$QA_TEST_TRACE"
[ "$name" = "${QA_TEST_FAIL:-}" ] || exit 0
runs=$(grep -c '' "$QA_TEST_COUNTS" 2>/dev/null || true); echo run >> "$QA_TEST_COUNTS"
[ "${runs:-0}" -lt "${QA_TEST_FAIL_TIMES:-99}" ] || exit 0
printf 'ok 1 - starts\\nnot ok 2 - killed-cleanup\\tshutdown/release\\n'
exit 17
'''
SELF_TESTS = ('test-release-tooling.py', 'test-privacy-scan.py', 'test-qa-lock.sh', 'test-android-host.sh',
              'test-e2e.sh', 'test-qa-simulator.sh', 'test-jest-retry.sh', 'test-qa-pass-record.sh',
              'test-tf-lenient.sh', 'test-android-harness.py', 'test-android-results.py')
for name in (*SELF_TESTS, 'qa-pass-record.sh', 'check-release-bundle.sh'):
    path = mobile/'scripts'/name
    # qa.sh runs the .py stubs with python3; let them re-run themselves as bash.
    path.write_text(STUB if name.endswith('.sh') else
                    'import os, subprocess, sys\nsys.exit(subprocess.call(["bash", "-c", os.environ["QA_TEST_STUB"], __file__]))\n')
    path.chmod(0o755)
env['QA_TEST_STUB'] = STUB
for name in ('npm', 'node'):
    (bin_dir/name).write_text(STUB); (bin_dir/name).chmod(0o755)
# The record stub reports no stored pass, so every self-test runs.
(mobile/'scripts/qa-pass-record.sh').write_text(
    '#!/usr/bin/env bash\necho "qa-pass-record.sh $1 $2" >> "$QA_TEST_TRACE"\n[ "$1" != check ]\n')

passed = 0
def ok(text):
    global passed
    passed += 1; print(f'ok {passed} - {text}', flush=True)

def qa(expect, lenient=None, fail=None, times=None, release_out=True):
    for path in (trace, counts): path.write_text('')
    shutil.rmtree(out, ignore_errors=True); out.mkdir()
    extra = {}
    if lenient is not None: extra['OPAX_TF_LENIENT'] = lenient
    if release_out: extra['OPAX_RELEASE_OUT'] = str(out)
    if fail: extra['QA_TEST_FAIL'] = fail
    if times is not None: extra['QA_TEST_FAIL_TIMES'] = str(times)
    result = subprocess.run(['bash', 'scripts/qa.sh'], cwd=mobile, env=dict(env, **extra), capture_output=True, text=True)
    assert result.returncode == expect, f'expected {expect}, got {result.returncode}\n{result.stdout}\n{result.stderr}'
    return trace.read_text().splitlines(), result.stdout + result.stderr

LAST = 'check-release-bundle.sh'
WROTE = 'qa-pass-record.sh write harness'

lines, _ = qa(0)
assert all(lines.count(name) == 1 for name in SELF_TESTS[:-2]) and LAST in lines and WROTE in lines
assert not warnings.exists()
ok('flag off: every self-test runs once and the harness record is written')

for value in (None, '0'):
    lines, _ = qa(17, lenient=value, fail='test-e2e.sh')
    assert lines.count('test-e2e.sh') == 1 and 'test-qa-simulator.sh' not in lines and LAST not in lines
    assert WROTE not in lines and not warnings.exists()
ok('flag off: a failing self-test blocks at once, with no retry and no warning')

lines, output = qa(0, lenient='1', fail='test-e2e.sh')
assert lines.count('test-e2e.sh') == 2 and 'test-qa-simulator.sh' in lines and LAST in lines
assert warnings.read_text() == 'simulator lifetime\tattempts=2\texit 17: not ok 2 - killed-cleanup shutdown/release\n'
assert 'WARNING, simulator lifetime failed twice' in output
ok('flag on: a failing self-test retries once, records one warning line and QA carries on')
assert WROTE not in lines
ok('flag on: a self-test that only warned writes no harness pass record')

lines, _ = qa(0, lenient='1', fail='test-e2e.sh', times=1)
assert lines.count('test-e2e.sh') == 2 and LAST in lines and WROTE in lines and not warnings.exists()
ok('flag on: a passing retry records nothing')

lines, _ = qa(0, lenient='1', fail='test-android-results.py')
assert lines.count('test-android-results.py') == 2 and LAST in lines
assert warnings.read_text() == 'Android results\tattempts=2\texit 17: not ok 2 - killed-cleanup shutdown/release\n'
ok('flag on: self-tests outside the recorded harness block warn the same way')

for gate in ('npm run typecheck', 'npm run lint', 'npm run test --', 'npm run qa-static', 'npm run qa-advisories',
             'node scripts/build-design-tokens.mjs --check', LAST):
    lines, _ = qa(17, lenient='1', fail=gate)
    assert lines.count(gate) == 1 and not warnings.exists(), gate
ok('flag on: typecheck, lint, Jest, qa-static, advisories, design tokens and the bundle check still block')

for extra in (dict(lenient='1', release_out=False), dict(lenient='yes')):
    lines, output = qa(2, **extra)
    assert lines == [] and 'OPAX_TF_LENIENT' in output
env_missing = dict(env, OPAX_TF_LENIENT='1', OPAX_RELEASE_OUT=str(scratch/'absent'))
assert subprocess.run(['bash', 'scripts/qa.sh'], cwd=mobile, env=env_missing, capture_output=True).returncode == 2
ok('the flag is refused outside a release evidence directory, and so is any value but 0 or 1')

def helper(script, lenient='1'):
    shutil.rmtree(out, ignore_errors=True); out.mkdir()
    extra = dict(OPAX_RELEASE_OUT=str(out), **({'OPAX_TF_LENIENT': lenient} if lenient else {}))
    return subprocess.run(['bash', '-c', 'set -euo pipefail; source scripts/tf-lenient.sh; '+script],
                          cwd=mobile, env=dict(env, **extra), capture_output=True, text=True)

result = helper("lenient_step 'capacity wait' false; lenient_step 'capacity wait' false; echo carried-on; tf_lenient_summary")
assert result.returncode == 0 and 'carried-on' in result.stdout
assert warnings.read_text() == 'capacity wait\tattempts=2\texit 1\n' * 2
assert 'TestFlight lenient mode: 2 warning(s)' in result.stdout and str(warnings) in result.stdout
ok('each failed capacity wait is one line and the summary prints every warning')
result = helper("lenient_step 'capacity wait' true; tf_lenient_summary")
assert 'TestFlight lenient mode: 0 warning(s)' in result.stdout and not warnings.exists()
result = helper("lenient_step 'capacity wait' false; echo carried-on; tf_lenient_summary", lenient=None)
assert result.returncode == 1 and result.stdout == '' and not warnings.exists()
ok('a clean lenient release reports no warnings, and the full harness prints no summary and still blocks')

# Only the two capacity waits in the release script, and only self-tests in
# qa.sh, may go through lenient_step: a new call must be added here on purpose.
release = (scripts/'release-ios.sh').read_text()
assert re.findall(r'^.*lenient_step.*$', release, re.M) == ["lenient_step 'capacity wait' scripts/capacity.sh"] * 2
assert release.index('source scripts/tf-lenient.sh') > release.index('export OPAX_RELEASE_OUT=')
assert "v['tf_lenient']=os.environ.get('OPAX_TF_LENIENT')=='1'" in release and '\ntf_lenient_summary\n' in release
wrapped = re.findall(r'lenient_step \'[^\']+\' nice -n 10 (?:python3|bash|node --test) scripts/(\S+)', (scripts/'qa.sh').read_text())
assert sorted(wrapped) == sorted((*SELF_TESTS, 'test-android-flows.mjs')), wrapped
assert len(re.findall(r'lenient_step ', (scripts/'qa.sh').read_text())) == len(wrapped)
ok('only capacity waits and the named self-tests are lenient, and release.json records the mode')
print(f'1..{passed}')
PYTEST
