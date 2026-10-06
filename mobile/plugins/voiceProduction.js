const policy = require('../voice-production-policy.json');

// One build-time switch; production ships the reviewed Talk and Account UI. No OTA
// or runtime override can add the pods, permission or production compile gate.
function productionVoiceEnabled(
  variant,
  value = process.env.OPAX_PRODUCTION_VOICE ?? '1',
) {
  if (!['0', '1'].includes(value))
    throw new Error('OPAX_PRODUCTION_VOICE must be 0 or 1');
  return variant === 'production' && value === '1';
}

function voicePrivacyManifest(existing = {}) {
  const types = [
    ...policy.linkedDataTypes.map((type) => [type, true]),
    ...policy.unlinkedDataTypes.map((type) => [type, false]),
  ].map(([type, linked]) => ({
    NSPrivacyCollectedDataType: `NSPrivacyCollectedDataType${type}`,
    NSPrivacyCollectedDataTypeLinked: linked,
    NSPrivacyCollectedDataTypeTracking: false,
    NSPrivacyCollectedDataTypePurposes: [
      'NSPrivacyCollectedDataTypePurposeAppFunctionality',
    ],
  }));
  const replaced = new Set(
    types.map((entry) => entry.NSPrivacyCollectedDataType),
  );
  return {
    ...existing,
    NSPrivacyTracking: false,
    NSPrivacyAccessedAPITypes: existing.NSPrivacyAccessedAPITypes ?? [],
    NSPrivacyCollectedDataTypes: [
      ...(existing.NSPrivacyCollectedDataTypes ?? []).filter(
        (entry) => !replaced.has(entry.NSPrivacyCollectedDataType),
      ),
      ...types,
    ],
  };
}

module.exports = { policy, productionVoiceEnabled, voicePrivacyManifest };
