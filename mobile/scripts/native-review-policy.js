// Exact (source file, native module name) grants. Register new bridges only after
// review; neither a reviewed file nor a module directory grants other names.
const reviewedNativeModules = Object.freeze({
  // Pure SP/DP conversion through RN's own metrics; no data or permissions.
  'modules/opax-text-metrics/index.ts': Object.freeze(['OpaxTextMetrics']),
  'modules/opax-share/index.ts': Object.freeze(['OpaxShare']),
  'modules/opax-ipad/index.ts': Object.freeze(['OpaxIPad']),
  // UIKit backing and divider only; no transport or new permissions.
  'modules/opax-root-bar/index.ts': Object.freeze(['OpaxRootBar']),
  'modules/opax-voice/index.ts': Object.freeze(['OpaxVoice']),
  // Android intent inbox and navigation acknowledgements. Local pending URLs
  // only, erased on consumption; no transport or additional permissions.
  'modules/opax-links/index.ts': Object.freeze(['OpaxLinks']),
  // Window size classes and reserved-region geometry only; no transport,
  // permissions or data (iPhone Duo, reviewed 11 Nov 2026).
  'modules/opax-duo/index.ts': Object.freeze(['OpaxDuo']),
});

// The voice core's URLSession transports are reviewed exceptions. Its two test
// servers use Network.framework only for their guarded loopback fake relays.
// Share metadata has NO Swift networking exception (including link previews).
const voiceRoot = 'modules/opax-voice/ios/OpaxVoiceCore/';
const reviewedSwiftNetworking = Object.freeze({
  'modules/opax-voice/ios/Bridge/VoiceController.swift': [
    'URLSessionRelayFactory',
  ],
  [`${voiceRoot}Sources/OpaxVoiceCore/CallController.swift`]: ['URLSession'],
  [`${voiceRoot}Sources/OpaxVoiceCore/HTTPClient.swift`]: ['URLSession'],
  [`${voiceRoot}Sources/OpaxVoiceCore/Relay.swift`]: ['URLSession'],
  [`${voiceRoot}Tests/OpaxVoiceCoreTests/HTTPTests.swift`]: ['URLSession'],
  [`${voiceRoot}Tests/OpaxVoiceCoreTests/LoopbackRelay.swift`]: [
    'URLSession',
    'NW',
  ],
  [`${voiceRoot}Tests/OpaxVoiceCoreTests/RedirectTests.swift`]: [
    'URLSession',
    'NW',
  ],
  [`${voiceRoot}Tests/OpaxVoiceCoreTests/ReviewRegressionTests.swift`]: [
    'URLSession',
  ],
  [`${voiceRoot}Tests/OpaxVoiceCoreTests/TestSupport.swift`]: ['URLSession'],
});
module.exports = { reviewedNativeModules, reviewedSwiftNetworking };
