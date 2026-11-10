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
  // One entry per type. A type the base manifest already declares (analytics'
  // Product Interaction) keeps both purposes and is linked if either use is.
  const merged = [...(existing.NSPrivacyCollectedDataTypes ?? [])].map(
    (entry) => ({ ...entry }),
  );
  for (const entry of types) {
    const same = merged.find(
      (row) => row.NSPrivacyCollectedDataType === entry.NSPrivacyCollectedDataType,
    );
    if (!same) {
      merged.push(entry);
      continue;
    }
    same.NSPrivacyCollectedDataTypeLinked =
      same.NSPrivacyCollectedDataTypeLinked === true ||
      entry.NSPrivacyCollectedDataTypeLinked;
    same.NSPrivacyCollectedDataTypeTracking = false;
    same.NSPrivacyCollectedDataTypePurposes = [
      ...new Set([
        ...entry.NSPrivacyCollectedDataTypePurposes,
        ...(same.NSPrivacyCollectedDataTypePurposes ?? []),
      ]),
    ];
  }
  return {
    ...existing,
    NSPrivacyTracking: false,
    NSPrivacyAccessedAPITypes: existing.NSPrivacyAccessedAPITypes ?? [],
    NSPrivacyCollectedDataTypes: merged,
  };
}

module.exports = { policy, productionVoiceEnabled, voicePrivacyManifest };
