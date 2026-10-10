import assert from 'node:assert/strict';

export function assertNoFixtureOrigin(body: Buffer, fixturePort: string) {
  for (const prefix of [
    'http://10.0.2.2',
    'https://10.0.2.2',
    'http://127.0.0.1',
    'http://localhost',
    'https://127.0.0.1',
    'https://localhost',
  ])
    assert(
      !body.includes(Buffer.from(prefix)),
      'Production bundle has a loopback origin',
    );
  assert(
    !/:89[0-9]{2}/.test(body.toString('latin1')) &&
      !body.includes(Buffer.from(`:${fixturePort}`)),
    'Production bundle contains the configured fixture port',
  );
}

export function assertNoVoiceFixtures(body: Buffer, productionVoice = false) {
  for (const marker of [
    'voice-bridge-test',
    'Voice bridge fixture workbench',
    'example.invalid',
    '/__fixture/voice',
    'Fixture code:',
    ...(productionVoice ? [] : ['NSMicrophoneUsageDescription']),
    'OPAX_VOICE_E2E',
    'DebugSyntheticEngineFactory',
  ])
    assert(
      !body.includes(Buffer.from(marker)),
      `Production bundle contains voice test material: ${marker}`,
    );
}

/** E2E launch arguments (the welcome tour's opt-in) never ship. */
export const E2E_LAUNCH_FLAGS = ['OPAXWelcomeTour'] as const;
export function assertNoE2ELaunchFlags(body: Buffer) {
  for (const marker of E2E_LAUNCH_FLAGS)
    assert(
      !body.includes(Buffer.from(marker)),
      `Production bundle contains an e2e launch argument: ${marker}`,
    );
}

/**
 * Community stays on the web in the 1.0 App Store build: strings only its
 * screens, session and route carry (src/features/community, src/app/community).
 */
export const COMMUNITY_MARKERS = [
  'Your display name and bio are public',
  'Community route refused',
  './community/[view].tsx',
] as const;
export function assertNoCommunity(body: Buffer) {
  for (const marker of COMMUNITY_MARKERS)
    assert(
      !body.includes(Buffer.from(marker)),
      `Production bundle contains Community: ${marker}`,
    );
}
