const { withInfoPlist } = require('expo/config-plugins');
// Runs for every CNG variant, after template defaults. E2E and explicit local development permit loopback HTTP.
module.exports = function withNetworkPolicy(config) {
  return withInfoPlist(config, (mod) => {
    delete mod.modResults.NSAppTransportSecurity;
    delete mod.modResults.NSMicrophoneUsageDescription;
    delete mod.modResults.OPAXVoiceFixturePort;
    if (config.extra.variant === 'e2e') {
      mod.modResults.OPAXVoiceFixturePort =
        config.ios.infoPlist.OPAXVoiceFixturePort;
    }
    if (config.ios.infoPlist.NSAppTransportSecurity) {
      mod.modResults.NSAppTransportSecurity =
        config.ios.infoPlist.NSAppTransportSecurity;
    }
    return mod;
  });
};
