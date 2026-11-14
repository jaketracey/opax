#!/usr/bin/env bash
# Offline regressions. Only a small scratch clone, fake HOME and stubbed tools
# are used; no developer config, device, native build or network is touched.
set -euo pipefail
SCRIPTS=$(cd "$(dirname "$0")" && pwd)
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/opax-qa-record-test.XXXXXX")
trap '/bin/rm -rf "$SCRATCH"' EXIT
python3 - "$SCRIPTS" "$SCRATCH" "$(command -v node)" <<'PYTEST'
import datetime, json, os, shlex, shutil, subprocess, sys, time
from pathlib import Path

# ESLint reports real paths; on macOS $TMPDIR (/var/...) is a symlink to /private/var/...
scripts, scratch, real_node = Path(sys.argv[1]), Path(sys.argv[2]).resolve(), sys.argv[3]
env = {k: v for k, v in os.environ.items()
       if not k.startswith(('OPAX_', 'EXPO_', 'NODE_', 'GIT_', 'BASH_FUNC_'))
       and k not in {'CI', 'BASH_ENV', 'ENV'}}
home = scratch/'home'; home.mkdir()
bin_dir = scratch/'bin'; bin_dir.mkdir()
env.update(HOME=str(home), GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull,
           GIT_AUTHOR_NAME='QA Fixture', GIT_AUTHOR_EMAIL='qa@example.invalid',
           GIT_COMMITTER_NAME='QA Fixture', GIT_COMMITTER_EMAIL='qa@example.invalid',
           PATH=str(bin_dir)+os.pathsep+env['PATH'], EXPO_NO_TELEMETRY='1',
           QA_TEST_REAL_NODE=real_node, QA_TEST_TRACE=str(scratch/'trace'),
           QA_TEST_JEST_ARGS=str(scratch/'jest-args'), QA_TEST_DEVICES=str(scratch/'devices.json'))
trace = scratch/'trace'; trace.touch()
seed = scratch/'seed'; seed.mkdir()

def command(args, cwd=seed, extra=None, expect=0):
    result = subprocess.run(args, cwd=cwd, env=dict(env, **(extra or {})), capture_output=True, text=True)
    if result.returncode != expect:
        raise AssertionError(f'{args}: expected {expect}, got {result.returncode}\n{result.stdout}\n{result.stderr}')
    return result.stdout

def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True); path.write_text(text)

def executable(path, text):
    write(path, '#!/usr/bin/env bash\nset -euo pipefail\n'+text); path.chmod(0o755)

def ok(text):
    global passed
    passed += 1; print(f'ok {passed} - {text}', flush=True)

passed = 0
command(['git', 'init', '-q'])
write(seed/'.gitignore', 'node_modules/\n.qa.local.env\n')
(seed/'mobile/scripts').mkdir(parents=True, exist_ok=True)
for name in ('qa.sh', 'qa-env.sh', 'qa-pass-record.sh', 'lint.sh',
             'eslint-file.config.cjs', 'eslint-hermes.config.cjs', 'eslint-uncached-rules.cjs', 'jest-changed.sh',
             'sim-health.sh', 'qa-simulator.sh', 'android-gradle.sh', 'build-play.sh', 'release-ios.sh'):
    shutil.copyfile(scripts/name, seed/'mobile/scripts'/name)
for name in ('test-release-tooling.py', 'test-privacy-scan.py', 'test-android-harness.py', 'test-android-results.py'):
    write(seed/'mobile/scripts'/name, 'import os\nfrom pathlib import Path\nwith Path(os.environ["QA_TEST_TRACE"]).open("a") as f: f.write(Path(__file__).name+"\\n")\n')
for name in ('test-qa-lock.sh', 'test-android-host.sh', 'test-e2e.sh', 'test-qa-simulator.sh', 'test-jest-retry.sh', 'test-qa-pass-record.sh', 'check-release-bundle.sh'):
    executable(seed/'mobile/scripts'/name, 'echo "$(basename "$0") $*" >> "$QA_TEST_TRACE"\n')
executable(seed/'mobile/scripts/jest-retry.sh', 'printf "%s\\n" "$@" > "$QA_TEST_JEST_ARGS"\n')
write(seed/'mobile/src/client.ts', 'export const value = 1;\n')
write(seed/'mobile/package-lock.json', '{}\n')
write(seed/'mobile/patches/privacy-patches.json', '{}\n')
write(seed/'mobile/.maestro/flow.yaml', 'appId: au.com.opax.app\n')
write(seed/'mobile/tests/fixtures/value.json', '{}\n')
for name in ('analytics-events', 'no-wrapping-columns', 'deprecated-recipes', 'design-tokens', 'money-routes', 'follows-changes'):
    write(seed/f'mobile/tests/{name}.test.ts', '// scanning suite fixture\n')
command(['git', 'add', '.']); command(['git', 'commit', '-qm', 'Scratch QA fixture'])
repo = scratch/'clone'
command(['git', 'clone', '--quiet', '--no-hardlinks', str(seed), str(repo)])
mobile = repo/'mobile'
base = command(['git', 'rev-parse', 'HEAD'], repo).strip()
write(mobile/'node_modules/.package-lock.json', '{"installed":1}\n')
records = scratch/'records'; env['OPAX_QA_PASS_RECORD_DIR'] = str(records)
executable(bin_dir/'node', '''if [ "${1:-}" = --version ]; then echo "${QA_TEST_NODE_VERSION:-v24.21.0}"; exit; fi
case "${1:-}" in --test|scripts/build-design-tokens.mjs) echo "node $*" >> "$QA_TEST_TRACE"; exit ;; esac
exec "$QA_TEST_REAL_NODE" "$@"
''')
executable(bin_dir/'npm', '''echo "npm $*" >> "$QA_TEST_TRACE"
[ "${1:-}" != run ] || [ "${2:-}" != "${QA_TEST_NPM_FAIL:-none}" ] || exit 17
''')
executable(bin_dir/'xcrun', '''echo "xcrun $*" >> "$QA_TEST_TRACE"
case "$*" in
  'simctl list devices booted -j') cat "$QA_TEST_DEVICES" ;;
  'simctl shutdown '*|'simctl erase '*) [ "${QA_TEST_ERASE_FAIL:-0}" != 1 ] || exit 19 ;;
  *) echo 'Unexpected simulator command in offline test' >&2; exit 80 ;;
esac
''')

def record(action, stage='gate', extra=None, expect=0):
    args = ['bash', 'scripts/qa-pass-record.sh', action, stage]
    if action == 'write': args += ['0', 'npm run typecheck && npm run lint && npm test']
    return command(args, mobile, extra, expect)

def miss(extra=None, stage='gate'):
    record('check', stage, extra, expect=1)

record('write'); record('check')
data = json.loads(next(records.glob('gate-*.json')).read_text())
assert data['exit_code'] == 0 and data['command'] == 'npm run typecheck && npm run lint && npm test'
ok('clean records match and store the command and exit code')
record('write', 'harness')
source = mobile/'src/client.ts'; source.write_text(source.read_text()+'// edited\n')
miss(); miss(stage='harness')
before = {p.name: p.read_bytes() for p in records.glob('*.json')}
record('write')
assert before == {p.name: p.read_bytes() for p in records.glob('*.json')}
source.write_text('export const value = 1;\n')
record('check')
ok('tree edits invalidate checks and cannot mint a record')
source.write_text(source.read_text()+'// committed\n')
command(['git', 'add', '.'], repo); command(['git', 'commit', '-qm', 'Edited source'], repo)
miss(); record('check', 'harness')
command(['git', 'reset', '--hard', base], repo)
ok('committed source edits rerun the gate while preserving the script harness key')
lock = mobile/'package-lock.json'; lock.write_text('{"changed":true}\n')
command(['git', 'add', '.'], repo); command(['git', 'commit', '-qm', 'Edited lockfile'], repo)
miss(); command(['git', 'reset', '--hard', base], repo)
ok('committed package-lock edits invalidate the gate')
untracked = mobile/'tests/untracked.test.ts'; untracked.write_text('// untracked\n')
miss(); untracked.unlink(); record('check')
ok('untracked test files invalidate records')
miss({'QA_TEST_NODE_VERSION': 'v26.0.0'})
ok('Node version changes invalidate records')
file = next(records.glob('gate-*.json')); data = json.loads(file.read_text())
data['written'] = (datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(seconds=2)).strftime('%Y-%m-%dT%H:%M:%SZ')
file.write_text(json.dumps(data)); miss({'OPAX_QA_PASS_RECORD_MAX_AGE_HOURS': '0'}); record('write')
ok('expired records rerun the gate')
for name, value in [('OPAX_VARIANT', 'production'), ('OPAX_PRODUCTION_VOICE', '0'),
                    ('EXPO_NO_DOTENV', '1'), ('CI', '1'), ('NODE_OPTIONS', '--no-warnings')]:
    miss({name: value}); miss({name: value}, 'harness')
ok('OPAX, EXPO, CI and NODE environment changes invalidate both stages')
local = mobile/'.qa.local.env'; local.write_text('OPAX_DESIGN_FLAGS=1\n'); miss()
record('write'); local.write_text('OPAX_DESIGN_FLAGS=0\n'); miss(); local.unlink(); record('check')
ok('ignored local environment creation and content edits invalidate records')
installed = mobile/'node_modules/.package-lock.json'; installed.write_text('{"installed":2}\n'); miss()
installed.unlink(); miss(); installed.write_text('{"installed":1}\n'); record('check')
ok('installed dependency lock changes and removal invalidate records')
key = record('key')
assert key == record('key', extra={'OPAX_PASTE_LOCK': '/scratch/other-lock', 'OPAX_NODE_PATH': '/scratch/node',
                                  'OPAX_QA_PASS_RECORD_DIR': '/scratch/other-records', 'OPAX_BUILD_GATE': '/scratch/gate'})
ok('lock, path and record controls do not change the input key')
# Populate valid records for the release environment, then observe Python file
# opens while running the real QA entry point in that release context. Local
# configuration deliberately restores the shared record directory.
release_env = {'OPAX_RELEASE_COMMIT': base}
saved_records = {p.name: p.read_bytes() for p in records.glob('*.json')}
local.write_text('OPAX_QA_PASS_RECORD_DIR='+shlex.quote(str(records))+'\n')
for stage in ('gate', 'harness'):
    release_key = record('key', stage, release_env).strip()
    payload = dict(data, stage=stage, key=release_key, command='release record sentinel', exit_code=0,
                   written=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))
    write(records/f'{stage}-{release_key}.json', json.dumps(payload))
audit = scratch/'audit'; audit.mkdir()
audit_log = scratch/'record-opens'
write(audit/'sitecustomize.py', """import os, sys
prefix = os.environ['QA_TEST_RECORD_PREFIX'] + os.sep
def observe(event, args):
    if event == 'open' and isinstance(args[0], str) and args[0].startswith(prefix):
        with open(os.environ['QA_TEST_RECORD_OPENS'], 'a') as log: log.write(args[0]+'\\n')
sys.addaudithook(observe)
""")
audit_env = dict(release_env, PYTHONPATH=str(audit), QA_TEST_RECORD_PREFIX=str(records),
                 QA_TEST_RECORD_OPENS=str(audit_log))
# A positive control proves the observer is active before the release run.
command(['python3', '-c', 'import sys; open(sys.argv[1]).read()', str(records/f'gate-{record("key", extra=release_env).strip()}.json')], mobile, audit_env)
assert audit_log.exists() and audit_log.read_text(); audit_log.unlink()
trace.write_text('')
output = command(['bash', 'scripts/qa.sh'], mobile, audit_env)
assert not audit_log.exists() and 'skipped:' not in output
assert all('npm run '+gate in trace.read_text() for gate in ('typecheck', 'lint', 'test'))
assert 'test-privacy-scan.py' in trace.read_text()
local.unlink()
for path in records.glob('*.json'): path.unlink()
for name, contents in saved_records.items(): (records/name).write_bytes(contents)
ok('release QA never opens matching records even when local config restores the directory')
command(['bash', 'scripts/qa-pass-record.sh', 'write', 'gate', '17', 'npm test'], mobile, expect=1)
ok('a failed command cannot mint a pass')
# Use the real qa.sh, with all external gates replaced by offline stubs.
for gate in ('typecheck', 'test'):
    shutil.rmtree(records); records.mkdir(); trace.write_text('')
    command(['bash', 'scripts/qa.sh'], mobile, {'QA_TEST_NPM_FAIL': gate}, expect=17)
    assert not list(records.glob('gate-*.json'))
ok('qa.sh propagates failed typecheck/Jest and writes no gate record')
trace.write_text(''); command(['bash', 'scripts/qa.sh'], mobile)
assert 'npm run test' in trace.read_text()
trace.write_text(''); command(['bash', 'scripts/qa.sh'], mobile)
assert 'npm run test' not in trace.read_text() and 'test-qa-pass-record.sh' not in trace.read_text()
assert 'test-android-harness.py' in trace.read_text() and 'test-android-results.py' in trace.read_text()
assert 'test-android-flows.mjs' in trace.read_text() and 'check-release-bundle.sh --android' in trace.read_text()
ok('matching records skip stages while Android flow, harness and export checks always run')
flow = mobile/'.maestro/flow.yaml'; flow.write_text(flow.read_text()+'# changed\n')
command(['git', 'add', '.'], repo); command(['git', 'commit', '-qm', 'Edited flow'], repo)
trace.write_text(''); command(['bash', 'scripts/qa.sh'], mobile)
assert 'test-qa-pass-record.sh' not in trace.read_text() and 'test-android-flows.mjs' in trace.read_text()
assert 'test-android-harness.py' in trace.read_text() and 'check-release-bundle.sh --android' in trace.read_text()
command(['git', 'reset', '--hard', base], repo)
ok('a committed Maestro edit cannot skip Android checks on a harness record')
patch = mobile/'patches/privacy-patches.json'
record('write', 'harness')
patch.write_text('{"changed":true}\n')
command(['git', 'add', '.'], repo); command(['git', 'commit', '-qm', 'Edited privacy patches'], repo)
miss(stage='harness')
trace.write_text(''); command(['bash', 'scripts/qa.sh'], mobile)
assert 'test-privacy-scan.py' in trace.read_text() and 'test-qa-pass-record.sh' in trace.read_text()
command(['git', 'reset', '--hard', base], repo)
ok('a patches-only commit invalidates and reruns the harness')
for arguments in (['tests/one.test.ts'], ['-t', 'pattern'], ['--maxWorkers=6', 'tests/one.test.ts']):
    for path in records.glob('gate-*.json'): path.unlink()
    trace.write_text(''); command(['bash', 'scripts/qa.sh', *arguments], mobile)
    assert 'npm run test -- '+' '.join(arguments) in trace.read_text()
    assert 'npm run typecheck\n' in trace.read_text() and 'npm run lint\n' in trace.read_text()
    assert not list(records.glob('gate-*.json'))
ok('subset arguments reach only Jest and cannot write a full gate record')
for arguments in (['--maxWorkers=6'], ['-w', '6'], []):
    for path in records.glob('gate-*.json'): path.unlink()
    trace.write_text(''); command(['bash', 'scripts/qa.sh', *arguments], mobile)
    matches = list(records.glob('gate-*.json')); assert len(matches) == 1
    recorded = json.loads(matches[0].read_text())
    assert recorded['exit_code'] == 0
    assert shlex.split(recorded['command'])[-(len(arguments)+1):] == ['--', *arguments]
ok('full runs with worker budgets write a gate record containing their arguments')
before = {p.name: p.read_bytes() for p in records.glob('gate-*.json')}
trace.write_text(''); command(['bash', 'scripts/qa.sh', 'tests/one.test.ts'], mobile)
assert 'npm run test -- tests/one.test.ts' in trace.read_text()
assert before == {p.name: p.read_bytes() for p in records.glob('gate-*.json')}
ok('a subset runs despite an existing full record and does not overwrite it')
source.write_text(source.read_text()+'// changed\n')
command(['bash', 'scripts/jest-changed.sh', 'HEAD'], mobile)
args = (scratch/'jest-args').read_text().splitlines()
assert '--findRelatedTests' in args and 'src/client.ts' in args
for name in ('analytics-events', 'no-wrapping-columns', 'deprecated-recipes', 'design-tokens', 'money-routes', 'follows-changes'):
    assert f'tests/{name}.test.ts' in args
source.write_text('export const value = 1;\n')
command(['bash', 'scripts/jest-changed.sh', 'HEAD'], mobile)
assert 'tests/analytics-events.test.ts' in (scratch/'jest-args').read_text()
ok('related and unchanged runs include every directory-scanning suite')
for suffix in ('json', 'txt'):
    fixture = mobile/f'tests/fixtures/new.{suffix}'; fixture.write_text('changed\n')
    command(['bash', 'scripts/jest-changed.sh', 'HEAD'], mobile)
    assert '--findRelatedTests' not in (scratch/'jest-args').read_text(); fixture.unlink()
ok('non-code test fixtures force a full Jest run')
# Exercise the actual ESLint cache with a tracked importer whose dependency is
# deleted without staging it. No fake lint implementation can prove this case.
shutil.rmtree(mobile/'node_modules')
(mobile/'node_modules/.bin').mkdir(parents=True)
(mobile/'node_modules/.bin/eslint').symlink_to(scripts.parent/'node_modules/.bin/eslint')
lint_visits = scratch/'lint-visits'
env['QA_TEST_LINT_VISITS'] = str(lint_visits)
write(mobile/'scripts/cache-rule.js', "module.exports = {create(context) { require('fs').appendFileSync(process.env.QA_TEST_LINT_VISITS, context.filename+'\\n'); return {}; }};\n")
write(mobile/'eslint.config.js', "const plugin = require("+json.dumps(str(scripts.parent/'node_modules/eslint-plugin-import'))+");\nmodule.exports = [{files:['**/*.mjs'], plugins:{import:plugin, audit:{rules:{visit:require('./scripts/cache-rule')}}}, rules:{'import/no-unresolved':'error','import/namespace':'error','import/named':'error','import/default':'error','audit/visit':'error'}}];\n")
a = mobile/'src/a.mjs'; b = mobile/'src/b.mjs'
a.write_text("import { value } from './b.mjs';\nexport { value };\n"); b.write_text('export const value = 1;\n')
command(['git', 'add', '.'], repo); command(['git', 'commit', '-qm', 'Lint fixture'], repo)
command(['bash', 'scripts/lint.sh', 'src/a.mjs'], mobile)
command(['bash', 'scripts/lint.sh', 'src/a.mjs'], mobile)
cache = next((mobile/'node_modules/.cache/eslint').glob('*.cache'))
lint_visits.write_text('')
b.write_text('export const value = 2;\n')
command(['bash', 'scripts/lint.sh'], mobile)
assert lint_visits.read_text().splitlines() == [str(b)]
assert cache.exists() and len(list(cache.parent.glob('*.cache'))) == 1
command(['git', 'add', '.'], repo)
lint_visits.write_text(''); command(['bash', 'scripts/lint.sh'], mobile)
assert not lint_visits.read_text() and cache.exists()
command(['git', 'commit', '-qm', 'Edited one lint source'], repo)
command(['bash', 'scripts/lint.sh'], mobile)
assert not lint_visits.read_text() and cache.exists()
ok('one-file unstaged, staged and committed edits reuse unchanged files in the lint cache')
for changed in (mobile/'eslint.config.js', mobile/'scripts/cache-rule.js',
                mobile/'package-lock.json', mobile/'node_modules/.package-lock.json'):
    write(changed, (changed.read_text() if changed.exists() else '{}\n')+'\n')
    lint_visits.write_text(''); command(['bash', 'scripts/lint.sh'], mobile)
    assert str(a) in lint_visits.read_text().splitlines() and not cache.exists()
    cache = next(cache.parent.glob('*.cache'))
ok('lint config, plugin, lockfile and installed dependency edits invalidate cached rules')
b.unlink()
result = command(['bash', 'scripts/lint.sh', 'src/a.mjs'], mobile, expect=1)
assert 'import/no-unresolved' in result
ok('a warm lint cache still fails an unchanged importer after tracked dependency deletion')
# Export-map checks must revisit unchanged importers when only a dependency's
# bytes change. Keep an unrelated export so namespace validation still runs.
for rule, importer, valid in (
        ('namespace', "import * as dependency from './b.mjs';\nexport const value = dependency.value;\n",
         'export const value = 1;\nexport const retained = 2;\n'),
        ('named', "import { value } from './b.mjs';\nexport { value };\n",
         'export const value = 1;\nexport const retained = 2;\n'),
        ('default', "import value from './b.mjs';\nexport { value };\n",
         'export default 1;\nexport const retained = 2;\n')):
    a.write_text(importer)
    for state in ('committed', 'staged', 'unstaged'):
        b.write_text(valid)
        command(['git', 'add', '.'], repo)
        command(['git', 'commit', '--allow-empty', '-qm', 'Restore dependency export'], repo)
        command(['bash', 'scripts/lint.sh', 'src/a.mjs'], mobile)
        command(['bash', 'scripts/lint.sh', 'src/a.mjs'], mobile)
        b.write_text('export const retained = 2;\n')
        if state in ('committed', 'staged'):
            command(['git', 'add', '.'], repo)
        if state == 'committed':
            command(['git', 'commit', '-qm', 'Remove dependency export'], repo)
        lint_visits.write_text('')
        result = command(['bash', 'scripts/lint.sh', 'src/a.mjs'], mobile, expect=1)
        assert 'import/'+rule in result, (rule, state, result)
        assert str(a) not in lint_visits.read_text().splitlines(), (rule, state)
        assert a.read_text() == importer
        result = command(['bash', 'scripts/lint.sh', 'src/a.mjs'], mobile,
                         {'OPAX_LINT_NO_CACHE': '1'}, expect=1)
        assert 'import/'+rule in result, (rule, state, result)
    ok(f'uncached import/{rule} rejects removed exports in committed, staged and unstaged states (rc=1)')
# Use the actual Hermes rule and TypeScript parser, with an unchanged caller
# whose imported return type switches from number[] to MapIterator<number>.
config_source = (scripts.parent/'eslint.config.js').read_text()
hermes = config_source.split('const hermesBuiltins = ', 1)[1].split('\nmodule.exports = defineConfig', 1)[0]
parser = json.dumps(command([real_node, '-p',
    "require.resolve('@typescript-eslint/parser', {paths:[require.resolve('eslint-config-expo/flat')]})"], scripts.parent).strip())
write(mobile/'eslint.config.js', 'const hermesBuiltins = '+hermes+'\n'+
      'module.exports = [{files:["src/**/*.ts"], languageOptions:{parser:require('+parser+'),'+
      'parserOptions:{project:"./tsconfig.json",tsconfigRootDir:__dirname}},'+
      'plugins:{opax:{rules:{"hermes-builtins":hermesBuiltins}},other:{rules:{known:{create(){return {}}}}}},'+
      'rules:{"opax/hermes-builtins":"error"}}];\n')
write(mobile/'tsconfig.json', json.dumps({'compilerOptions': {'noEmit': True, 'strict': True,
      'target': 'ESNext', 'module': 'NodeNext', 'moduleResolution': 'NodeNext', 'lib': ['ESNext'], 'types': []},
      'include': ['src/**/*.ts']}))
caller = mobile/'src/zz/a.ts'; dependency = mobile/'src/zz/b.ts'
write(caller, "/* eslint-disable other/known */\nimport { values } from './b';\nexport const mapped = (m: Map<string, number>) => values(m).map(x => x);\n")
array_version = 'export const values = (m: Map<string, number>) => [...m.values()];\n'
iterator_version = 'export const values = (m: Map<string, number>) => m.values();\n'
write(dependency, array_version)
command(['git', 'add', '.'], repo); command(['git', 'commit', '-qm', 'Hermes cross-file fixture'], repo)
command(['bash', 'scripts/lint.sh', 'src/zz/a.ts'], mobile)
command(['bash', 'scripts/lint.sh', 'src/zz/a.ts'], mobile)
dependency.write_text(iterator_version)
command(['git', 'add', '.'], repo); command(['git', 'commit', '-qm', 'Iterator return type'], repo)
assert 'Hermes lacks Iterator.map' in command(['bash', 'scripts/lint.sh', 'src/zz/a.ts'], mobile, expect=1)
assert 'Hermes lacks Iterator.map' in command(['bash', 'scripts/lint.sh', 'src/zz/a.ts'], mobile,
                                             {'OPAX_LINT_NO_CACHE': '1'}, expect=1)
dependency.write_text(array_version)
command(['git', 'add', '.'], repo); command(['git', 'commit', '-qm', 'Restore array return type'], repo)
command(['bash', 'scripts/lint.sh', 'src/zz/a.ts'], mobile)
command(['bash', 'scripts/lint.sh', 'src/zz/a.ts'], mobile)
dependency.write_text(iterator_version)
assert 'Hermes lacks Iterator.map' in command(['bash', 'scripts/lint.sh', 'src/zz/a.ts'], mobile, expect=1)
command(['git', 'add', '.'], repo)
assert 'Hermes lacks Iterator.map' in command(['bash', 'scripts/lint.sh', 'src/zz/a.ts'], mobile, expect=1)
ok('uncached Hermes pass rejects committed, unstaged and staged cross-file type changes (rc=1)')
# The incremental typecheck must observe a newly introduced type error.
write(mobile/'tsconfig.json', json.dumps({'compilerOptions': {'noEmit': True, 'strict': True,
      'incremental': True, 'tsBuildInfoFile': 'node_modules/.cache/typecheck.tsbuildinfo', 'types': []},
      'files': ['src/client.ts']}))
tsc = [str(scripts.parent/'node_modules/.bin/tsc'), '--project', 'tsconfig.json']
command(tsc, mobile); command(tsc, mobile)
source.write_text('export const value: string = 1;\n')
assert 'TS2322' in command(tsc, mobile, expect=2)
source.write_text('export const value = 1;\n'); command(tsc, mobile)
ok('incremental typecheck fails a new type error and passes after restoration')
# All simctl calls below resolve only to our stub and fake HOME.
udid = '12345678-0000-0000-0000-000000000000'
device = home/'Library/Developer/CoreSimulator/Devices'/udid; device.mkdir(parents=True)
reports = home/'Library/Logs/DiagnosticReports'; reports.mkdir(parents=True)
for i in range(3):
    write(reports/f'OPAX-{i}.ips', 'SimDevice.12345678\n')
    write(reports/f'app-{i}.ips', 'SimDevice.12345678 au.com.opax.app\n')
    write(reports/f'process-{i}.ips', 'SimDevice.12345678 "procName": "OPAX"\n')
trace.write_text('')
command(['bash', 'scripts/sim-health.sh', udid, '--erase'], mobile)
assert not trace.read_text()
ok('OPAX process names and bundle crashes never cause an erase')
for i in range(3):
    report = reports/f'PosterBoard-{i}.ips'; write(report, 'SimDevice.12345678\n')
    os.utime(report, (time.time()-2, time.time()-2))
command(['bash', 'scripts/sim-health.sh', udid], mobile, expect=3)
assert not trace.read_text()
command(['bash', 'scripts/sim-health.sh', udid, '--erase'], mobile, expect=3)
assert (device/'.opax-qa-erased').is_file()
command(['bash', 'scripts/sim-health.sh', udid, '--erase'], mobile)
assert trace.read_text().count('simctl erase') == 1
ok('successful erase marks the device and old system reports do not trigger another erase')
for i in range(3):
    report = reports/f'fresh-{i}.ips'; write(report, 'SimDevice.12345678\n')
    timestamp = (device/'.opax-qa-erased').stat().st_mtime+1
    os.utime(report, (timestamp, timestamp))
command(['bash', 'scripts/sim-health.sh', udid], mobile, expect=3)
ok('new system crashes after the erase marker still fail health')
command(['bash', 'scripts/sim-health.sh', udid, '--max-crashes', '3'], mobile)
for bad in (['--max-crashes', 'x'], ['--max-poster-mb', '-1'], ['--hours', '1x']):
    command(['bash', 'scripts/sim-health.sh', udid, *bad], mobile, expect=2)
poster = device/'data/Library/Application Support/PRBPosterExtensionDataStore/61/snapshot.atx'
poster.parent.mkdir(parents=True); poster.write_bytes(os.urandom(2 << 20))
command(['bash', 'scripts/sim-health.sh', udid, '--max-crashes', '9'], mobile)
assert 'poster store 2 MB' in command(['bash', 'scripts/sim-health.sh', udid, '--max-crashes', '9', '--max-poster-mb', '1'], mobile, expect=3)
shutil.rmtree(device/'data')
ok('crash and poster store limits are flags; defaults keep 3 crashes and 2 GB')
# Three reports from three processes: over a total of 2, under 2 from one process.
assert 'x1' in command(['bash', 'scripts/sim-health.sh', udid, '--per-process', '--max-crashes', '2'], mobile)
loop = [reports/f'PosterBoard-2026-11-13-21000{i}.ips' for i in range(3)]
for report in loop: write(report, 'SimDevice.12345678\n')
assert 'most from one process: PosterBoard x3' in command(['bash', 'scripts/sim-health.sh', udid, '--per-process', '--max-crashes', '2'], mobile, expect=3)
for report in loop: report.unlink()
ok('--per-process limits the reports from any one process, not the total')
if sys.platform == 'darwin':
    # macOS refreshes the modification time of old reports; birth time dates them.
    report = reports/'siriactionsd-old.ips'; write(report, 'SimDevice.12345678\n')
    old = time.time()-3*86400; os.utime(report, (old, old)); os.utime(report, None)
    assert report.stat().st_mtime > time.time()-60 and report.stat().st_birthtime < old+1
    command(['bash', 'scripts/sim-health.sh', udid, '--max-crashes', '3'], mobile)
    report.unlink()
    ok('an old report with a refreshed modification time is not a new crash')
old_marker = (device/'.opax-qa-erased').stat().st_mtime_ns
command(['bash', 'scripts/sim-health.sh', udid, '--erase'], mobile, {'QA_TEST_ERASE_FAIL': '1'}, expect=19)
assert (device/'.opax-qa-erased').stat().st_mtime_ns == old_marker
ok('a failed erase leaves the previous marker unchanged')
# Verify upload Gradle argument policy by evaluating the real helper only.
play = (mobile/'scripts/build-play.sh').read_text()
assert 'OPAX_GRADLE_DAEMON=0' in play and 'OPAX_GRADLE_CACHE_ENABLED=0' in play
args = command(['bash', '-c', 'source scripts/android-gradle.sh; export OPAX_GRADLE_DAEMON=0 OPAX_GRADLE_CACHE_ENABLED=0; android_gradle_args; printf "%s\\n" "${ANDROID_GRADLE_ARGS[@]}"'], mobile)
assert '--no-daemon' in args and '--no-build-cache' in args and '--build-cache\n' not in args
ok('Play arguments disable daemon and build cache')
print(f'qa pass records and build speed: {passed} passed', flush=True)
PYTEST
