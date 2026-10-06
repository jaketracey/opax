const { withInfoPlist } = require('expo/config-plugins');
const { policy } = require('./voiceProduction');
function applyNetworkPolicy(info, config) {
  delete info.NSAppTransportSecurity;
  delete info.NSMicrophoneUsageDescription;
  delete info.OPAXVoiceFixturePort;
  delete info.OPAXProductionVoiceEnabled;
  delete info.OPAXVoiceConsentDefault;
  delete info.OPAXVoiceAllowedRoutes;
  if (
    config.extra.variant === 'production' &&
    config.extra.productionVoiceEnabled === true
  ) {
    info.NSMicrophoneUsageDescription = policy.microphonePurpose;
    info.OPAXProductionVoiceEnabled = true;
    info.OPAXVoiceConsentDefault = false;
    info.OPAXVoiceAllowedRoutes = policy.routes;
  }
  if (config.extra.variant === 'e2e')
    info.OPAXVoiceFixturePort = config.ios.infoPlist.OPAXVoiceFixturePort;
  if (config.ios.infoPlist.NSAppTransportSecurity)
    info.NSAppTransportSecurity = config.ios.infoPlist.NSAppTransportSecurity;
  return info;
}
// Runs for every CNG variant, after template defaults. E2E and explicit local development permit loopback HTTP.
module.exports = function withNetworkPolicy(config) {
  return withInfoPlist(config, (mod) => {
    applyNetworkPolicy(mod.modResults, config);
    return mod;
  });
};
module.exports.applyNetworkPolicy = applyNetworkPolicy;
