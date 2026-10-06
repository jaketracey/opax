#!/usr/bin/env python3
"""Negative privacy gates with synthetic binaries; no Apple/network access."""
import importlib.util
import json
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import privacy_scan as privacy
from release_support import ReleaseError


class PrivacyScanTests(unittest.TestCase):
    def test_each_sensitive_api_requires_its_purpose(self):
        symbols = {
            'CoreMotion': 'CMMotionManager', 'Camera': 'AVCaptureSession',
            'Microphone': 'requestRecordPermission:', 'CoreLocation': 'CLLocationManager',
            'Contacts': 'CNContactStore', 'PhotosRead': 'PHAsset', 'PhotosWrite': 'PHPhotoLibrary',
            'Bluetooth': 'CBCentralManager', 'HealthRead': 'HKHealthStore',
            'HealthWrite': 'HKWorkoutBuilder', 'Calendar': 'EKEventStore', 'EventKit': 'EventKit.framework',
            'CalendarFull': 'requestFullAccessToEventsWithCompletion:', 'Reminders': 'EKReminder',
            'Tracking': 'ASIdentifierManager', 'LocalNetwork': 'NSNetServiceBrowser',
            'SpeechRecognition': 'SFSpeechRecognizer', 'Bonjour': 'DNSServiceBrowse',
        }
        for name, symbol in symbols.items():
            with self.subTest(name=name):
                _, found = privacy.findings('_OBJC_CLASS_$_' + symbol)
                self.assertIn(name, found)
                self.assertTrue(privacy.check_purposes(found, {}, forbid_motion=False))
                info = {keys[0]: ['_opax._tcp'] if keys[0] == 'NSBonjourServices' else 'Purpose'
                        for group in found for keys in privacy.PURPOSES[group][1]}
                self.assertEqual(privacy.check_purposes(found, info, forbid_motion=False), [])
                self.assertTrue(privacy.check_purposes(found, {k: '' for k in info}, forbid_motion=False))

    def test_motion_is_refused_even_if_a_note_is_present(self):
        _, found = privacy.findings('/System/Library/Frameworks/CoreMotion.framework/CoreMotion')
        self.assertTrue(privacy.check_purposes(found, {'NSMotionUsageDescription': 'Unused code'}))
        self.assertTrue(privacy.check_purposes({}, {'NSMotionUsageDescription': 'Unused code'}))

    def test_playback_and_internet_do_not_require_microphone_or_lan(self):
        _, found = privacy.findings('AVAudioSession AVPlayer CoreMedia CMTime Network.framework socket NSURLSession')
        self.assertEqual(found, {})

    def test_all_five_required_reason_categories_and_non_api_substrings(self):
        required, _ = privacy.findings('_stat$INODE64 _mach_absolute_time _statfs _OBJC_CLASS_$_NSUserDefaults activeInputModes')
        self.assertEqual(set(required), set(privacy.REASONS))
        required, _ = privacy.findings('fstatat getattrlist NSFileCreationDate NSURLVolumeAvailableCapacityForImportantUsageKey systemUptime')
        self.assertEqual(set(required), {'FileTimestamp', 'DiskSpace', 'SystemBootTime'})
        self.assertEqual(privacy.findings('station statistics thermostat myUserDefaultsController')[0], {})

    def test_invalid_reason_codes_fail(self):
        for category, codes in privacy.REASONS.items():
            entry = {'NSPrivacyAccessedAPIType': 'NSPrivacyAccessedAPICategory' + category,
                     'NSPrivacyAccessedAPITypeReasons': [sorted(codes)[0]]}
            self.assertIn(category, privacy.declarations({'NSPrivacyAccessedAPITypes': [entry]}))
            for reasons in ([], ['WRONG.1'], ['CA92.1'] if category != 'UserDefaults' else ['C617.1']):
                with self.assertRaises(ReleaseError):
                    privacy.declarations({'NSPrivacyAccessedAPITypes': [{**entry, 'NSPrivacyAccessedAPITypeReasons': reasons}]})

    def test_framework_cannot_borrow_another_bundle_manifest_and_failure_is_reported(self):
        manifest = {'NSPrivacyAccessedAPITypes': [{
            'NSPrivacyAccessedAPIType': 'NSPrivacyAccessedAPICategoryDiskSpace',
            'NSPrivacyAccessedAPITypeReasons': ['E174.1']}]}
        with tempfile.TemporaryDirectory() as directory:
            app = Path(directory) / 'OPAX.app'; app.mkdir()
            (app / 'Info.plist').write_bytes(plistlib.dumps({}))
            (app / 'PrivacyInfo.xcprivacy').write_bytes(plistlib.dumps(manifest))
            framework = app / 'Frameworks/SDK.framework'; framework.mkdir(parents=True)
            binary = framework / 'SDK'; binary.write_bytes(b'\xcf\xfa\xed\xfe' + b'code')
            out = Path(directory) / 'scan.json'
            tool = subprocess.CompletedProcess([], 0, '_statfs\n', '')
            with patch.object(privacy.subprocess, 'run', return_value=tool):
                with self.assertRaisesRegex(ReleaseError, 'executable bundle'):
                    privacy.scan(app, output=out)
                self.assertEqual(len(json.loads(out.read_text())['binaries']), 1)
                (framework / 'PrivacyInfo.xcprivacy').write_bytes(plistlib.dumps(manifest))
                self.assertFalse(privacy.scan(app)['errors'])
                (app / 'PrivacyInfo.xcprivacy').unlink()
                with self.assertRaisesRegex(ReleaseError, 'app-level'):
                    privacy.scan(app)

    def test_tool_failure_and_no_binaries_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Path(directory); (app / 'Info.plist').write_bytes(plistlib.dumps({}))
            with self.assertRaisesRegex(ReleaseError, 'No Mach-O'):
                privacy.scan(app)
            (app / 'OPAX').write_bytes(b'\xcf\xfa\xed\xfe')
            with patch.object(privacy.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'bad')):
                with self.assertRaisesRegex(ReleaseError, 'could not read'):
                    privacy.scan(app)


class ManifestStagingTests(unittest.TestCase):
    def test_react_manifest_is_inside_each_local_slice_and_shared_slice_is_refused(self):
        spec = importlib.util.spec_from_file_location('privacy_stage', Path(__file__).parent / 'stage-privacy-manifests.py')
        stage = importlib.util.module_from_spec(spec); spec.loader.exec_module(stage)
        with tempfile.TemporaryDirectory() as directory:
            mobile = Path(directory)
            for name in ('React/Resources', 'ReactCommon/react/timing'):
                source = mobile / 'node_modules/react-native' / name
                source.mkdir(parents=True)
                (source / 'PrivacyInfo.xcprivacy').write_bytes(plistlib.dumps({'NSPrivacyAccessedAPITypes': [{
                    'NSPrivacyAccessedAPIType': 'NSPrivacyAccessedAPICategoryUserDefaults',
                    'NSPrivacyAccessedAPITypeReasons': ['CA92.1']}]}))
            target = mobile / 'ios/Pods/React.xcframework/ios-arm64/React.framework'
            target.mkdir(parents=True)
            stage.stage(mobile)
            local = plistlib.loads((target / 'PrivacyInfo.xcprivacy').read_bytes())
            self.assertEqual(privacy.declarations(local), {'UserDefaults': ['CA92.1'], 'SystemBootTime': ['35F9.1']})
            target.rename(target.with_name('Original.framework'))
            target.symlink_to(target.with_name('Original.framework'), target_is_directory=True)
            with self.assertRaisesRegex(ValueError, 'shared'):
                stage.stage(mobile)


class PatchReplayTests(unittest.TestCase):
    def test_clean_replay_idempotency_version_and_source_drift(self):
        mobile = Path(__file__).resolve().parent.parent
        spec = importlib.util.spec_from_file_location('privacy_patches', mobile / 'scripts/apply-privacy-patches.py')
        applicator = importlib.util.module_from_spec(spec); spec.loader.exec_module(applicator)
        entries = json.loads((mobile / 'patches/privacy-patches.json').read_text())
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for entry in entries:
                package = root / 'node_modules' / entry['package']; package.mkdir(parents=True)
                (package / 'package.json').write_text(json.dumps({'version': entry['version']}))
                for row in entry['files']:
                    dest = package / row['path']; dest.parent.mkdir(parents=True, exist_ok=True)
                    if row['after'] is None:
                        dest.touch()
                    else:
                        shutil.copyfile(mobile / 'node_modules' / entry['package'] / row['path'], dest)
                # Reconstruct pristine fixture inputs independently from the
                # reviewed diff; macOS patch cannot reverse-create /dev/null files.
                current = None; cursor = 0; original = []; after = []
                def finish():
                    if current is not None:
                        current.write_text(''.join(original + after[cursor:]))
                for line in (mobile / 'patches' / entry['patch']).read_text().splitlines(True):
                    if line.startswith('--- '):
                        finish()
                        current = root / line[4:].strip().removeprefix('a/')
                        after = current.read_text().splitlines(True)
                        original = []; cursor = 0
                    elif line.startswith('+++ '):
                        continue
                    elif line.startswith('@@ '):
                        start = max(0, int(re.search(r'\+(\d+)', line).group(1)) - 1)
                        original.extend(after[cursor:start]); cursor = start
                    elif line.startswith(' '):
                        original.append(line[1:]); cursor += 1
                    elif line.startswith('-'):
                        original.append(line[1:])
                    elif line.startswith('+'):
                        cursor += 1
                finish()
            applicator.apply(root)
            applicator.apply(root)
            package = root / 'node_modules/expo-location'
            source = package / 'ios/LocationModule.swift'
            source.write_text(source.read_text() + '\n// unexpected\n')
            with self.assertRaisesRegex(ValueError, 'Unexpected'):
                applicator.apply(root)
            (package / 'package.json').write_text('{"version":"57.0.21"}')
            with self.assertRaisesRegex(ValueError, 'version changed'):
                applicator.apply(root)


if __name__ == '__main__':
    unittest.main()
