"""Offline Android identity, provenance and release shell regression tests."""
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

from android_release import (NS, configured_version, debug_artifacts, sha256, shipped_source_maps,
                             verify_evidence, verify_identity, verify_ios_candidate, version_code)
from release_support import ReleaseError


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

    def fixture(self, directory):
        root = Path(directory); mobile = root/'mobile'; scripts = mobile/'scripts'; scripts.mkdir(parents=True)
        for name in ('build-play.sh', 'android-gradle.sh', 'capacity.sh', 'qa-lock.sh', 'android_release.py', 'release_inputs.py', 'release_support.py'):
            shutil.copyfile(Path(__file__).parent/name, scripts/name)
        (scripts/'qa-env.sh').write_text('build_command() { "$@"; }\n')
        (scripts/'android-host.sh').write_text('')  # host guard has its own test; keep fixtures host-independent
        (root/'.gitignore').write_text('mobile/private/\nmobile/android/\nmobile/node_modules/\nnative.lock/\n')
        (mobile/'app.config.ts').write_text("  version: '1.1.0',\n")
        binpath = mobile/'node_modules/.bin'; binpath.mkdir(parents=True)
        expo = binpath/'expo'
        expo.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
p=pathlib.Path('android')
if sys.argv[1]=='config':
    voice=os.environ.get('OPAX_PRODUCTION_VOICE')=='1'
    if os.environ.get('ATTACK')=='voice' and (p/'built').exists(): voice=not voice
    print(json.dumps({'version':'1.1.0','extra':{'productionVoiceEnabled':voice}}))
else:
    (p/'app').mkdir(parents=True, exist_ok=True)
    (p/'gradle.properties').write_text('android.enableMinifyInReleaseBuilds=true\\n')
    (p/'app/build.gradle').write_text("debugSymbolLevel 'FULL'\\n")
'''); expo.chmod(0o755)
        java = root/'jdk/bin/java'; java.parent.mkdir(parents=True)
        java.write_text('''#!/usr/bin/env python3
import json, os, pathlib, subprocess, sys, zipfile
pathlib.Path('gradle-args.json').write_text(json.dumps(sys.argv[1:]))
assert os.environ['OPAX_GRADLE_DAEMON'] == '0'
p=pathlib.Path('app/build/outputs')
for suffix, name in [('aab','bundle/release/app-release.aab'),('apk','apk/release/app-release.apk')]:
    target=p/name; target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target,'w') as archive:
        archive.writestr(('base/' if suffix=='aab' else '')+'assets/app.config',json.dumps({'extra':{'productionVoiceEnabled':os.environ.get('OPAX_PRODUCTION_VOICE')=='1'}}))
pathlib.Path('built').touch()
if os.environ.get('ATTACK')=='dirty': pathlib.Path('../app.config.ts').write_text('changed')
if os.environ.get('ATTACK')=='head': subprocess.run(['git','commit','--allow-empty','-qm','changed HEAD'],check=True)
'''); java.chmod(0o755)
        def git(*arguments):
            return subprocess.check_output(['git', *arguments], cwd=root, stderr=subprocess.DEVNULL).decode().strip()
        git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Release fixture')
        git('add', '.'); git('commit', '-qm', 'fixture')
        env = {**os.environ, 'JAVA_HOME':str(java.parent.parent), 'ANDROID_HOME':str(root/'sdk'),
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
        for attack in ('dirty','head','voice', ''):
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
                self.assertFalse((Path(d)/'native.lock').exists())


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
