// Verify generated native policy. CNG's withNetworkPolicy plugin owns all edits.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import config from '../app.config';
const plist = JSON.parse(
  execFileSync(
    '/usr/bin/plutil',
    ['-convert', 'json', '-o', '-', 'ios/OPAX/Info.plist'],
    { encoding: 'utf8' },
  ),
);
assert(
  !plist.NSMicrophoneUsageDescription,
  'Microphone permission is deferred',
);
if (config.ios?.infoPlist?.NSAppTransportSecurity)
  assert.deepEqual(
    plist.NSAppTransportSecurity,
    config.ios?.infoPlist?.NSAppTransportSecurity,
  );
else assert(!plist.NSAppTransportSecurity, 'Production has no ATS exception');
console.log(`PASS CNG native policy: ${config.extra?.variant}`);
