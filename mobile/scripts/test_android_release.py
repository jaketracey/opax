"""Offline Android identity, provenance and release shell regression tests."""
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
import xml.etree.ElementTree as ET
import zipfile

from android_release import (NS, R8_PLAY_MAPPING, configured_version, debug_artifacts, sha256, shipped_source_maps,
                             verify_analytics_config, verify_crash_symbols, verify_evidence, verify_identity,
                             verify_ios_candidate, verify_recorded_configs, version_code)
from release_support import ANALYTICS_CONFIG, ReleaseError

# An invented chunk ID and upload key: nothing here reaches PostHog. The
# fixture's upload script is a stub, HOME is a temporary folder with no key
# file, and every POSTHOG_ variable of the caller is dropped.
CHUNK = '5f0c3a1e-7b0d-4f4e-9d0b-3f2a6c1d9e77'
INVENTED_KEY = 'phx_INVENTED_ANDROID_UPLOAD_KEY_3c9e1b7a'
COMPOSED_MAP = {'version': 3, 'sources': ['index.ts'], 'mappings': 'AAAA', 'x_hermes_function_offsets': {}}
# Each traced step records the POSTHOG_ variable names it can see (never a value).
TRACE = ('import json, os, sys; open(os.environ["OPAX_TEST_TRACE"], "a").write(json.dumps({"tool": TOOL, "args": sys.argv[1:], '
         '"posthog": sorted(n for n in os.environ if n.startswith("POSTHOG_"))}) + "\\n")')
# The fixture's upload script: records its arguments, can hang or fail, never uploads.
UPLOAD_STUB = r'''#!/bin/bash
python3 -c 'TRACE' "$@"
sleep "${UPLOAD_SLEEP:-0}"
echo "Crash symbols: stub for $1 $2 ($3)."
exit "${UPLOAD_EXIT:-0}"
'''.replace('TRACE', TRACE.replace('TOOL', '"upload"'))
# The Mac path's build gate, which runs after the input checks and capacity.sh.
GATE_STUB = r'''build_command() {
  python3 -c 'TRACE'
  "$@"
}
'''.replace('TRACE', TRACE.replace('TOOL', '"gate"'))
SKIP = 'Crash symbols: not uploaded (OPAX_UPLOAD_SYMBOLS=0; only the release run sets 1). To upload them, run from mobile/: '


class AndroidReleaseTests(unittest.TestCase):
    def test_config_version_matches_ios_release_and_explicit_override(self):
        root = Path(__file__).resolve().parent.parent
        version = configured_version(root)
        # One store version for both platforms: the Android config must match the iOS release script.
        ios = re.search(r'^VERSION=(\S+)$', (root/'scripts'/'release-ios.sh').read_text(), re.M)
        self.assertIsNotNone(ios)
        self.assertEqual(version, ios.group(1))
        def manifest(name):
            return ET.fromstring(f'<manifest xmlns:android="{NS[1:-1]}" android:versionName="{name}" android:versionCode="2026111001"><uses-sdk android:targetSdkVersion="36" /></manifest>')
        verify_identity(manifest(version), version, 2026111001)
        with self.assertRaisesRegex(ReleaseError, 'versionName'):
            verify_identity(manifest('0.0.1'), version)
        verify_identity(manifest('9.9.0'), '9.9.0')
        with self.assertRaisesRegex(ReleaseError, 'versionCode mismatch'):
            verify_identity(manifest(version), version, 2026111002)
        bad = manifest(version); bad.find('uses-sdk').set(NS+'targetSdkVersion', '37')
        with self.assertRaisesRegex(ReleaseError, 'targetSdk'): verify_identity(bad, version)

    def test_version_code_calendar_and_play_limit(self):
        self.assertEqual(version_code('2026111001'), 2026111001)
        for value in ('1', '02026111001', '2026023001', '2100000001', '0', '-1'):
            with self.subTest(value=value), self.assertRaises(ReleaseError): version_code(value)
        self.assertEqual(version_code(1, release=False), 1)

    def test_evidence_binds_hash_voice_commit_and_ios_candidate(self):
        with tempfile.TemporaryDirectory() as d:
            directory = Path(d); artifact = directory/'candidate.aab'; artifact.write_bytes(b'fixture')
            report = directory/'build-evidence.json'
            evidence = {'commit':'a'*40, 'version':'1.1.0', 'production_voice_mode':'1', 'artifacts':{artifact.name:sha256(artifact)}}
            report.write_text(json.dumps(evidence))
            self.assertEqual(verify_evidence(artifact, report, 'a'*40, True), evidence)
            for commit, voice in [('b'*40, True), ('a'*40, False)]:
                with self.assertRaises(ReleaseError): verify_evidence(artifact, report, commit, voice)
            ios = directory/'release.json'
            candidate = {'commit':'a'*40, 'version':'1.1.0', 'production_voice_enabled':True, 'kind':'distribution', 'checks':['passed']}
            ios.write_text(json.dumps(candidate)); verify_ios_candidate(ios, evidence, '1.1.0')
            for key, value in [('commit','b'*40), ('version','1.0.0'), ('production_voice_enabled',False), ('kind','archive')]:
                ios.write_text(json.dumps({**candidate, key:value}))
                with self.subTest(key=key), self.assertRaises(ReleaseError): verify_ios_candidate(ios, evidence, '1.1.0')
            artifact.write_bytes(b'changed')
            with self.assertRaisesRegex(ReleaseError, 'SHA-256'): verify_evidence(artifact, report)

    def test_r8_and_native_symbols_conditional_and_both_abis_required(self):
        with tempfile.TemporaryDirectory() as d:
            directory = Path(d); bundle = directory/'candidate.aab'
            with zipfile.ZipFile(bundle, 'w') as archive: archive.writestr('base/manifest/AndroidManifest.xml', 'fixture')
            with zipfile.ZipFile(bundle) as archive:
                debug_artifacts(archive, {'r8_enabled':False, 'native_symbols_enabled':False}, directory)
                for flag in ('r8_enabled', 'native_symbols_enabled'):
                    with self.subTest(flag=flag), self.assertRaises(ReleaseError):
                        debug_artifacts(archive, {'r8_enabled':flag == 'r8_enabled', 'native_symbols_enabled':flag == 'native_symbols_enabled'}, directory)
            with zipfile.ZipFile(bundle, 'a') as archive:
                archive.writestr('BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map', 'mapping')
                for abi in ('arm64-v8a', 'x86_64'): archive.writestr(f'BUNDLE-METADATA/com.android.tools.build.debugsymbols/{abi}/libfixture.so.sym', 'symbols')
            with zipfile.ZipFile(bundle) as archive:
                self.assertEqual(set(debug_artifacts(archive, {'r8_enabled':True, 'native_symbols_enabled':True}, directory).values()), {'passed'})
                for flag in ('r8_enabled', 'native_symbols_enabled'):
                    with self.assertRaisesRegex(Exception, 'present but build evidence says disabled'):
                        debug_artifacts(archive, {'r8_enabled':flag != 'r8_enabled', 'native_symbols_enabled':flag != 'native_symbols_enabled'}, directory)

    def test_source_map_check_skips_play_metadata_and_refuses_installed_maps(self):
        # R8's mapping is Play metadata and passes; a map an APK would install fails.
        play = 'BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map'
        for extra, shipped in ((None, []), ('base/assets/index.android.bundle.map', True),
                               ('base/root/META-INF/app.MAP', True), ('feature/assets/x.map', True)):
            with self.subTest(extra=extra), tempfile.TemporaryDirectory() as d:
                bundle = Path(d)/'candidate.aab'
                with zipfile.ZipFile(bundle, 'w') as archive:
                    archive.writestr('base/manifest/AndroidManifest.xml', 'fixture')
                    archive.writestr(play, 'mapping')
                    if extra: archive.writestr(extra, 'map')
                with zipfile.ZipFile(bundle) as archive:
                    self.assertEqual(shipped_source_maps(archive.namelist()), [extra] if shipped else [])
        script = (Path(__file__).parent/'verify-play.py').read_text()
        self.assertIn('assert not shipped_source_maps(entries), "Source map shipped in the AAB"', script)

    def test_configured_version_reads_a_literal_or_one_named_constant(self):
        with tempfile.TemporaryDirectory() as d:
            config = Path(d)/'app.config.ts'
            config.write_text("  version: '1.1.0',\n")
            self.assertEqual(configured_version(d), '1.1.0')
            config.write_text("const appVersion = '1.2.0';\nconst config = {\n  version: appVersion,\n};\n")
            self.assertEqual(configured_version(d), '1.2.0')
            config.write_text("const config = {\n  version: appVersion,\n};\n")
            with self.assertRaises(Exception):
                configured_version(d)

    def fixture(self, directory, upload_stub=True):
        root = Path(directory); mobile = root/'mobile'; scripts = mobile/'scripts'; scripts.mkdir(parents=True)
        for name in ('build-play.sh', 'android-gradle.sh', 'capacity.sh', 'qa-lock.sh', 'android_release.py', 'release_inputs.py', 'release_support.py'):
            shutil.copyfile(Path(__file__).parent/name, scripts/name)
        upload = scripts/'upload-crash-symbols.sh'
        if upload_stub:
            upload.write_text(UPLOAD_STUB)
        else:
            shutil.copyfile(Path(__file__).parent/'upload-crash-symbols.sh', upload)
        (scripts/'qa-env.sh').write_text(GATE_STUB)
        (scripts/'android-host.sh').write_text('')  # host guard has its own test; keep fixtures host-independent
        (root/'.gitignore').write_text('mobile/private/\nmobile/android/\nmobile/node_modules/\nnative.lock/\nhome/\ntrace.jsonl\n')
        (mobile/'app.config.ts').write_text("  version: '1.1.0',\n")
        binpath = mobile/'node_modules/.bin'; binpath.mkdir(parents=True)
        expo = binpath/'expo'
        expo.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
p=pathlib.Path('android')
with open(os.environ['OPAX_TEST_TRACE'], 'a') as trace: trace.write(json.dumps({'tool':'expo '+sys.argv[1], 'posthog':sorted(n for n in os.environ if n.startswith('POSTHOG_'))})+'\\n')
if sys.argv[1]=='config':
    voice=os.environ.get('OPAX_PRODUCTION_VOICE')=='1'
    if os.environ.get('ATTACK')=='voice' and (p/'built').exists(): voice=not voice
    extra={'variant':'production','productionVoiceEnabled':voice,'analytics':ANALYTICS}
    if os.environ.get('ATTACK')=='analytics' or (os.environ.get('ATTACK')=='analytics-after' and (p/'built').exists()):
        del extra['analytics']
    print(json.dumps({'version':'1.1.0','extra':extra}))
else:
    (p/'app').mkdir(parents=True, exist_ok=True)
    (p/'gradle.properties').write_text('android.enableMinifyInReleaseBuilds=true\\n')
    (p/'app/build.gradle').write_text("debugSymbolLevel 'FULL'\\n")
'''.replace('ANALYTICS', json.dumps(ANALYTICS_CONFIG))); expo.chmod(0o755)
        java = root/'jdk/bin/java'; java.parent.mkdir(parents=True)
        java.write_text('''#!/usr/bin/env python3
import json, os, pathlib, subprocess, sys, zipfile
pathlib.Path('gradle-args.json').write_text(json.dumps(sys.argv[1:]))
with open(os.environ['OPAX_TEST_TRACE'], 'a') as trace: trace.write(json.dumps({'tool':'gradle', 'posthog':sorted(n for n in os.environ if n.startswith('POSTHOG_'))})+'\\n')
assert os.environ['OPAX_GRADLE_DAEMON'] == '0'
p=pathlib.Path('app/build/outputs')
extra={'variant':'production','productionVoiceEnabled':os.environ.get('OPAX_PRODUCTION_VOICE')=='1','analytics':ANALYTICS}
if os.environ.get('ATTACK')=='packaged-analytics': del extra['analytics']
for suffix, name in [('aab','bundle/release/app-release.aab'),('apk','apk/release/app-release.apk')]:
    target=p/name; target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target,'w') as archive:
        archive.writestr(('base/' if suffix=='aab' else '')+'assets/app.config',json.dumps({'extra':extra}))
# Metro's chunk ID (OPAX_SYMBOLS_DIR), Gradle's composed Hermes map and R8's mapping.
if os.environ.get('OPAX_SYMBOLS_DIR') and os.environ.get('ATTACK')!='nochunk':
    pathlib.Path(os.environ['OPAX_SYMBOLS_DIR'],'android.chunk-id').write_text('CHUNK\\n')
for path, body in [('app/build/generated/sourcemaps/react/release/index.android.bundle.map', '{"version":3}'),
                   ('app/build/outputs/mapping/release/mapping.txt', 'com.example -> a:')]:
    pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True); pathlib.Path(path).write_text(body)
pathlib.Path('built').touch()
if os.environ.get('ATTACK')=='dirty': pathlib.Path('../app.config.ts').write_text('changed')
if os.environ.get('ATTACK')=='head': subprocess.run(['git','commit','--allow-empty','-qm','changed HEAD'],check=True)
'''.replace('ANALYTICS', json.dumps(ANALYTICS_CONFIG)).replace('CHUNK', CHUNK)); java.chmod(0o755)
        def git(*arguments):
            return subprocess.check_output(['git', *arguments], cwd=root, stderr=subprocess.DEVNULL).decode().strip()
        git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Release fixture')
        git('add', '.'); git('commit', '-qm', 'fixture')
        home = root/'home'; home.mkdir()
        env = {**{name: value for name, value in os.environ.items() if not name.startswith('POSTHOG_')},
               'HOME':str(home), 'OPAX_TEST_TRACE':str(root/'trace.jsonl'),
               'JAVA_HOME':str(java.parent.parent), 'ANDROID_HOME':str(root/'sdk'),
               'OPAX_ANDROID_VERSION_CODE':'2026111001', 'OPAX_PRODUCTION_VOICE':'1',
               'OPAX_ANDROID_NATIVE_LOCK':str(root/'native.lock'), 'OPAX_NATIVE_WAIT_SECONDS':'0',
               # The Mac path runs capacity.sh; no capacity command applies to a fixture.
               'OPAX_CAPACITY_CMD':''}
        env.pop('ATTACK', None)
        return mobile, git('rev-parse', 'HEAD'), env

    def test_build_play_refuses_missing_mismatched_inputs_and_dirty_tree(self):
        with tempfile.TemporaryDirectory() as d:
            mobile, commit, env = self.fixture(d)
            good = ['--expected-commit',commit,'--expected-voice-mode','1']
            for arguments in ([], ['--expected-commit',commit], ['--expected-commit','a'*40,'--expected-voice-mode','1'],
                              ['--expected-commit',commit[:8],'--expected-voice-mode','1'], ['--expected-commit',commit,'--expected-voice-mode','0']):
                result = subprocess.run(['bash','scripts/build-play.sh',*arguments], cwd=mobile, env=env, capture_output=True)
                self.assertNotEqual(result.returncode, 0, arguments)
                self.assertFalse((mobile/'private').exists())
            (mobile/'untracked').touch()
            result = subprocess.run(['bash','scripts/build-play.sh',*good], cwd=mobile, env=env, capture_output=True)
            self.assertIn(b'clean HEAD', result.stderr)

    def test_build_play_rechecks_after_build_and_records_success_evidence(self):
        for attack in ('dirty','head','voice','analytics','analytics-after','packaged-analytics','nochunk', ''):
            with self.subTest(attack=attack), tempfile.TemporaryDirectory() as d:
                mobile, commit, env = self.fixture(d)
                result = subprocess.run(['bash','scripts/build-play.sh','--expected-commit',commit,'--expected-voice-mode','1'],
                                        cwd=mobile, env={**env, 'ATTACK':attack}, capture_output=True, text=True)
                if attack:
                    self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertFalse((mobile/'private/play/2026111001/build-evidence.json').exists())
                else:
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    evidence=json.loads((mobile/'private/play/2026111001/build-evidence.json').read_text())
                    self.assertEqual(evidence['commit'], commit); self.assertEqual(evidence['production_voice_mode'], '1')
                    self.assertTrue(evidence['r8_enabled'] and evidence['native_symbols_enabled'])
                    self.assertEqual(len(evidence['artifacts']), 2)
                    arguments=json.loads((mobile/'android/gradle-args.json').read_text())
                    self.assertIn('--no-daemon', arguments); self.assertIn('--no-build-cache', arguments)
                    self.assertNotIn('--build-cache', arguments)
                    out=mobile/'private/play/2026111001'
                    self.assertEqual(evidence['js_chunk_id'], CHUNK)
                    self.assertEqual((out/'android.chunk-id').read_text().strip(), CHUNK)
                    self.assertTrue((out/'index.android.bundle.map').is_file() and (out/'mapping.txt').is_file())
                    # The default keeps the symbols and uploads nothing.
                    self.assertEqual([call for call in self.trace(d) if call['tool']=='upload'], [])
                    skip = SKIP + self.rerun(out)
                    self.assertIn(skip, result.stdout.splitlines())
                    self.assertEqual((out/'crash-symbols.log').read_text().splitlines(), [skip])
                    self.assertIn(f'Crash symbols: chunk {CHUNK}; index.android.bundle.map and mapping.txt kept', result.stdout)
                if attack == 'analytics':
                    # Refused from the recorded config, before Gradle runs.
                    self.assertFalse((mobile/'android/gradle-args.json').exists())
                self.assertFalse((Path(d)/'native.lock').exists())


    def trace(self, directory):
        path = Path(directory)/'trace.jsonl'
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    @staticmethod
    def rerun(out):
        out = out.resolve()
        return f'scripts/upload-crash-symbols.sh android 1.1.0 2026111001 {out} {out}/mapping.txt'

    def build_play(self, mobile, commit, env, **extra):
        return subprocess.run(['bash','scripts/build-play.sh','--expected-commit',commit,'--expected-voice-mode','1'],
                              cwd=mobile, env={**env, **extra}, capture_output=True, text=True, timeout=300)

    def test_build_play_uploads_only_when_the_release_run_opts_in(self):
        with tempfile.TemporaryDirectory() as d:
            mobile, commit, env = self.fixture(d)
            result = self.build_play(mobile, commit, env, OPAX_UPLOAD_SYMBOLS='1')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            out = (mobile/'private/play/2026111001').resolve()
            self.assertEqual([call['args'] for call in self.trace(d) if call['tool']=='upload'],
                             [['android','1.1.0','2026111001',str(out),str(out/'mapping.txt')]])
            self.assertIn('Crash symbols: stub for android 1.1.0 (2026111001).', result.stdout)
            self.assertNotIn(SKIP, result.stdout)

    def test_build_play_refuses_an_invalid_upload_switch_or_timeout(self):
        cases = [('OPAX_UPLOAD_SYMBOLS', value, 'OPAX_UPLOAD_SYMBOLS must be 0') for value in ('2', 'yes', 'true', ' 1', '1 ', '')]
        cases += [('OPAX_SYMBOL_UPLOAD_TIMEOUT', value, 'OPAX_SYMBOL_UPLOAD_TIMEOUT must be whole seconds')
                  for value in ('0', '10s', '-1', '')]
        for name, value, message in cases:
            with self.subTest(name=name, value=value), tempfile.TemporaryDirectory() as d:
                mobile, commit, env = self.fixture(d)
                result = self.build_play(mobile, commit, env, **{name: value})
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertIn(message, result.stderr)
                self.assertFalse((mobile/'private').exists())
                self.assertEqual(self.trace(d), [])

    def test_build_play_symbol_upload_never_fails_the_build(self):
        with tempfile.TemporaryDirectory() as d:
            mobile, commit, env = self.fixture(d)
            result = self.build_play(mobile, commit, env, OPAX_UPLOAD_SYMBOLS='1', UPLOAD_EXIT='1')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            out = mobile/'private/play/2026111001'
            self.assertIn('Crash symbols not uploaded; see', result.stderr)
            self.assertIn('then rerun from mobile/: ' + self.rerun(out), result.stderr)
            self.assertTrue((out/'build-evidence.json').is_file())
            self.assertIn(f'Crash symbols: chunk {CHUNK}', result.stdout)

    def test_build_play_stops_a_hung_upload_and_still_passes(self):
        with tempfile.TemporaryDirectory() as d:
            mobile, commit, env = self.fixture(d)
            started = time.monotonic()
            # The stub's `sleep` holds the log pipe as a hung CLI would: only
            # stopping the whole process group lets the build finish early.
            result = self.build_play(mobile, commit, env, OPAX_UPLOAD_SYMBOLS='1', UPLOAD_SLEEP='120',
                                     OPAX_SYMBOL_UPLOAD_TIMEOUT='2')
            self.assertLess(time.monotonic() - started, 90)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            log = (mobile/'private/play/2026111001/crash-symbols.log').read_text().splitlines()
            self.assertEqual(log[-1], 'Timed out after 2 seconds; the command was stopped.')
            self.assertIn('Crash symbols not uploaded; see', result.stderr)

    def test_build_play_passes_no_posthog_variable_to_any_step(self):
        with tempfile.TemporaryDirectory() as d:
            mobile, commit, env = self.fixture(d)
            result = self.build_play(mobile, commit, env, OPAX_UPLOAD_SYMBOLS='1', POSTHOG_CLI_API_KEY=INVENTED_KEY,
                                     POSTHOG_CLI_TOKEN=INVENTED_KEY, POSTHOG_PROJECT_ID='999999',
                                     POSTHOG_HOST='https://us.posthog.example')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            calls = self.trace(d)
            expected = {'expo config', 'expo prebuild', 'gradle', 'upload'} | ({'gate'} if os.uname().sysname != 'Linux' else set())
            self.assertEqual({call['tool'] for call in calls}, expected)
            self.assertEqual([call for call in calls if call['posthog']], [])
            log = (mobile/'private/play/2026111001/crash-symbols.log').read_text()
            self.assertNotIn(INVENTED_KEY, result.stdout + result.stderr + log)
            # They go before the input checks, capacity.sh and the gate, which run untraced.
            script = (Path(__file__).parent/'build-play.sh').read_text()
            self.assertLess(script.index("compgen -e | grep '^POSTHOG_'"), script.index('\ncheck_inputs\n'))

    def test_build_play_default_uploads_nothing_even_with_a_key_file_and_cli(self):
        # The real upload script, an invented key file in the temporary HOME
        # and a stub posthog-cli on PATH: only the opt-in reaches the CLI.
        with tempfile.TemporaryDirectory() as d:
            mobile, commit, env = self.fixture(d, upload_stub=False)
            key_file = Path(env['HOME'])/'.config/opax/posthog.env'
            key_file.parent.mkdir(parents=True)
            key_file.write_text(f'export POSTHOG_CLI_API_KEY={INVENTED_KEY}\nexport POSTHOG_PROJECT_ID=507367\n')
            key_file.chmod(0o600)
            cli = Path(env['HOME'])/'bin/posthog-cli'; cli.parent.mkdir()
            cli.write_text('#!/bin/bash\n' + "python3 -c 'TRACE' \"$@\"\n".replace('TRACE', TRACE.replace('TOOL', '"cli"')))
            cli.chmod(0o755)
            env = {**env, 'PATH': f"{cli.parent}{os.pathsep}{env['PATH']}"}
            result = self.build_play(mobile, commit, env)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual([call for call in self.trace(d) if call['tool']=='cli'], [])
            self.assertIn(SKIP + self.rerun(mobile/'private/play/2026111001'), result.stdout)
            if not shutil.which('node'):
                self.skipTest('the opted-in upload stages the source map with node')
            (Path(d)/'trace.jsonl').unlink(missing_ok=True)
            # build-play.sh never reuses an evidence folder; set the first one aside (HOME is ignored).
            (mobile/'private/play/2026111001').rename(Path(env['HOME'])/'first-run')
            result = self.build_play(mobile, commit, env, OPAX_UPLOAD_SYMBOLS='1')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual([call['args'][:2] for call in self.trace(d) if call['tool']=='cli'],
                             [['hermes', 'upload'], ['proguard', 'upload']])

    def test_run_logged_timeout_stops_the_whole_process_group(self):
        from release_support import run_logged
        with tempfile.TemporaryDirectory() as d:
            log = Path(d)/'log'
            started = time.monotonic()
            with self.assertRaisesRegex(ReleaseError, 'timed out after 1 seconds'):
                run_logged(['bash', '-c', 'echo started; sleep 60 & wait'], log, timeout=1)
            self.assertLess(time.monotonic() - started, 30)
            self.assertEqual(log.read_text().splitlines(), ['started', 'Timed out after 1 seconds; the command was stopped.'])
            run_logged(['bash', '-c', 'echo quick'], log, timeout=30)
            self.assertEqual(log.read_text(), 'quick\n')

    def test_build_play_without_a_key_logs_the_skip_line_and_passes(self):
        # The real upload script, opted in, with no key in the environment and
        # none in the temporary HOME: it stops at its one skip line, before any CLI.
        with tempfile.TemporaryDirectory() as d:
            mobile, commit, env = self.fixture(d, upload_stub=False)
            result = self.build_play(mobile, commit, env, OPAX_UPLOAD_SYMBOLS='1')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            skip = 'Crash symbols: POSTHOG_CLI_API_KEY is not set; skipped the PostHog upload for android 1.1.0 (2026111001).'
            self.assertIn(skip, result.stdout)
            self.assertEqual((mobile/'private/play/2026111001/crash-symbols.log').read_text().splitlines(), [skip])

    def test_analytics_config_is_on_for_production_and_absent_otherwise(self):
        def config(variant, analytics=None):
            extra = {'variant': variant}
            if analytics is not None: extra['analytics'] = analytics
            return {'extra': extra}
        self.assertEqual(verify_analytics_config(config('production', dict(ANALYTICS_CONFIG)), 'production'), 'on')
        for variant in ('e2e', 'development'):
            self.assertEqual(verify_analytics_config(config(variant), variant), 'off')
        refused = [('production', config('production')),
                   ('production', config('production', {**ANALYTICS_CONFIG, 'host': 'https://us.i.posthog.com'})),
                   ('production', config('production', {**ANALYTICS_CONFIG, 'projectToken': 'phc_other'})),
                   ('production', config('production', {**ANALYTICS_CONFIG, 'environment': 'e2e'})),
                   ('production', config('e2e', dict(ANALYTICS_CONFIG))),
                   ('e2e', config('e2e', dict(ANALYTICS_CONFIG))), ('e2e', config('e2e', {})),
                   ('development', config('development', dict(ANALYTICS_CONFIG))), ('production', {})]
        for variant, value in refused:
            with self.subTest(variant=variant, value=value), self.assertRaises(ReleaseError):
                verify_analytics_config(value, variant)
        self.assertEqual(ANALYTICS_CONFIG['host'], 'https://opax.com.au/ingest')
        self.assertTrue(ANALYTICS_CONFIG['projectToken'].startswith('phc_'))

    def test_recorded_build_configs_must_carry_production_analytics(self):
        good = {'extra': {'variant': 'production', 'analytics': dict(ANALYTICS_CONFIG)}}
        bare = {'extra': {'variant': 'production'}}
        with tempfile.TemporaryDirectory() as d:
            for name in ('config.json', 'config-after.json'): (Path(d)/name).write_text(json.dumps(good))
            self.assertEqual(set(verify_recorded_configs(d, good).values()), {'on'})
            with self.assertRaises(ReleaseError): verify_recorded_configs(d, bare)
            for name in ('config.json', 'config-after.json'):
                with self.subTest(name=name):
                    (Path(d)/name).write_text(json.dumps(bare))
                    with self.assertRaises(ReleaseError): verify_recorded_configs(d, good)
                    (Path(d)/name).unlink()
                    with self.assertRaisesRegex(ReleaseError, 'Missing recorded build config'): verify_recorded_configs(d, good)
                    (Path(d)/name).write_text(json.dumps(good))
        # The verifiers call these checks: reverting either to "Android off" fails here.
        play = (Path(__file__).parent/'verify-play.py').read_text()
        self.assertIn('recorded_configs = verify_recorded_configs(output, packaged_config)', play)
        self.assertIn('js_chunk_id = verify_crash_symbols(output, js, build_evidence, archive)', play)
        self.assertNotIn('ANDROID_ANALYTICS_ENABLED', play)
        apk = (Path(__file__).parent/'verify-android-build.py').read_text()
        self.assertIn('verify_analytics_config(config, args.variant)', apk)
        self.assertNotIn('"analytics" not in extra', apk)

    def test_crash_symbols_are_kept_beside_the_aab_and_match_it(self):
        bundle = b'\0hermes\0' + CHUNK.encode() + b'\0'
        with tempfile.TemporaryDirectory() as d:
            out = Path(d); aab = out/'candidate.aab'
            with zipfile.ZipFile(aab, 'w') as archive: archive.writestr(R8_PLAY_MAPPING, 'com.example -> a:')
            def check(r8=True, body=bundle):
                with zipfile.ZipFile(aab) as archive:
                    return verify_crash_symbols(out, body, {'r8_enabled': r8}, archive)
            (out/'index.android.bundle.map').write_text(json.dumps(COMPOSED_MAP))
            (out/'android.chunk-id').write_text(CHUNK + '\n')
            (out/'mapping.txt').write_text('com.example -> a:')
            self.assertEqual(check(), CHUNK)
            with self.assertRaisesRegex(ReleaseError, 'chunk ID'): check(body=b'other bundle')
            (out/'mapping.txt').write_text('com.other -> b:')
            with self.assertRaisesRegex(ReleaseError, 'R8 mapping'): check()
            self.assertEqual(check(r8=False), CHUNK)
            (out/'mapping.txt').unlink()
            with self.assertRaisesRegex(ReleaseError, 'R8 mapping'): check()
            (out/'mapping.txt').write_text('com.example -> a:')
            for chunk in ('', 'not-a-chunk', CHUNK.upper()):
                with self.subTest(chunk=chunk):
                    (out/'android.chunk-id').write_text(chunk)
                    with self.assertRaisesRegex(ReleaseError, 'chunk ID'): check()
            (out/'android.chunk-id').unlink()
            with self.assertRaisesRegex(ReleaseError, 'chunk ID'): check()
            (out/'android.chunk-id').write_text(CHUNK)
            for source_map in ({'version': 3, 'sources': ['a'], 'mappings': 'A'}, {'version': 2}, 'x'):
                with self.subTest(source_map=source_map):
                    (out/'index.android.bundle.map').write_text(json.dumps(source_map))
                    with self.assertRaisesRegex(ReleaseError, 'composed Hermes map'): check()
            (out/'index.android.bundle.map').write_text('{not json')
            with self.assertRaisesRegex(ReleaseError, 'composed Hermes map'): check()
            (out/'index.android.bundle.map').unlink()
            with self.assertRaisesRegex(ReleaseError, 'kept beside the AAB'): check()

    def test_app_config_carries_analytics_for_android_production_only(self):
        # The real Expo config, as build-play.sh records it. Reverting the
        # Android analytics switch in app.config.ts fails here (and in qa-static).
        mobile = Path(__file__).resolve().parent.parent
        expo = mobile/'node_modules/.bin/expo'
        if not expo.exists(): self.skipTest('needs node_modules')
        for variant in ('production', 'e2e', 'development'):
            with self.subTest(variant=variant):
                env = {**{name: value for name, value in os.environ.items() if not name.startswith(('OPAX_', 'EXPO_PUBLIC_'))},
                       'OPAX_VARIANT': variant, 'OPAX_TARGET_PLATFORM': 'android', 'OPAX_BUILD_NUMBER': '2026111001',
                       'OPAX_ANALYTICS': '1', 'EXPO_NO_TELEMETRY': '1', 'EXPO_NO_DOTENV': '1'}
                config = json.loads(subprocess.check_output([str(expo), 'config', '--type', 'public', '--json'],
                                                            cwd=mobile, env=env, text=True, timeout=180))
                self.assertEqual(verify_analytics_config(config, variant), 'on' if variant == 'production' else 'off')

    @unittest.skipUnless(os.uname().sysname == 'Linux', 'Linux export branch')
    def test_android_bundle_policy_failure_fails_the_production_export_gate(self):
        with tempfile.TemporaryDirectory() as d:
            mobile, _, env = self.fixture(d)
            shutil.copyfile(Path(__file__).parent/'check-release-bundle.sh', mobile/'scripts/check-release-bundle.sh')
            (mobile/'node_modules/.bin/expo').write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> export.trace\n')
            tsx=mobile/'node_modules/.bin/tsx'
            tsx.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> policy.trace\ncase "$*" in *production-bundle-android*) exit "${FAIL_ANDROID:-0}" ;; esac\n')
            tsx.chmod(0o755)
            for fail in ('0','7'):
                result=subprocess.run(['bash','scripts/check-release-bundle.sh','--inside-gate'], cwd=mobile,
                                      env={**env,'FAIL_ANDROID':fail},capture_output=True,text=True)
                self.assertEqual(result.returncode,int(fail),result.stdout+result.stderr)
            trace=(mobile/'export.trace').read_text(); policy=(mobile/'policy.trace').read_text()
            self.assertIn('--platform ios',trace); self.assertIn('--platform android',trace)
            self.assertIn('--production-bundle build/production-bundle-android',policy)
            self.assertIn('--production-bundle build/production-bundle\n',policy)
            self.assertIn('skipping Xcode-only',result.stdout)
            # npm run qa's Android-only mode never prebuilds or exports iOS.
            for name in ('export.trace','policy.trace'): (mobile/name).unlink()
            for fail in ('0','7'):
                result=subprocess.run(['bash','scripts/check-release-bundle.sh','--android'], cwd=mobile,
                                      env={**env,'FAIL_ANDROID':fail},capture_output=True,text=True)
                self.assertEqual(result.returncode,int(fail),result.stdout+result.stderr)
            trace=(mobile/'export.trace').read_text()
            self.assertNotIn('--platform ios',trace); self.assertNotIn('prebuild',trace); self.assertIn('--platform android',trace)


    @unittest.skipUnless(os.uname().sysname == 'Linux', 'Desktop native lock')
    def test_native_lock_protects_live_owner_reaps_dead_owner_and_releases_on_failure(self):
        with tempfile.TemporaryDirectory() as d:
            lock=Path(d)/'native.lock'; lock.mkdir(); (lock/'pid').write_text(str(os.getpid()))
            env={**os.environ,'OPAX_ANDROID_NATIVE_LOCK':str(lock),'OPAX_NATIVE_WAIT_SECONDS':'0'}
            command=['bash','-c','source "$1"; qa_native_lock_run bash -c "exit 7"','_',str(Path(__file__).parent/'qa-lock.sh')]
            busy=subprocess.run(command,env=env,capture_output=True,text=True)
            self.assertIn('wait expired',busy.stderr); self.assertEqual((lock/'pid').read_text(),str(os.getpid()))
            (lock/'pid').write_text('99999999')
            reaped=subprocess.run(command,env=env,capture_output=True,text=True)
            self.assertEqual(reaped.returncode,7,reaped.stdout+reaped.stderr)
            self.assertFalse(lock.exists())


    def test_network_state_permissions_do_not_relax_microphone_or_camera_policy(self):
        from android_release import permission_allowlist
        normal=permission_allowlist()
        self.assertIn('android.permission.ACCESS_NETWORK_STATE',normal)
        self.assertIn('android.permission.ACCESS_WIFI_STATE',normal)
        for permission in ('RECORD_AUDIO','MODIFY_AUDIO_SETTINGS','CAMERA','ACCESS_BACKGROUND_LOCATION'):
            self.assertNotIn('android.permission.'+permission,normal)
        self.assertIn('android.permission.RECORD_AUDIO',permission_allowlist(voice=True))
        self.assertIn('android.permission.MODIFY_AUDIO_SETTINGS',permission_allowlist(voice=True))
        self.assertIn('android.permission.RECORD_AUDIO',permission_allowlist(microphone_prompt=True))
        self.assertNotIn('android.permission.MODIFY_AUDIO_SETTINGS',permission_allowlist(microphone_prompt=True))


    def test_talk_file_and_directory_routes_are_both_valid_whole_keys(self):
        from android_release import bundled_routes
        account=b'./account/index.tsx\0./account/sign-in.tsx\0./account/delete.tsx\0'
        for talk in (b'./talk.tsx',b'./talk/index.tsx'):
            self.assertTrue(all(bundled_routes(talk+b'\0'+account).values()))
        for talk in (b'./talk/index.tsx.workbench.tsx',b'./talk.tsx.unshipped'):
            self.assertFalse(bundled_routes(talk+b'\0'+account)['talk'])


if __name__ == '__main__':
    unittest.main()
