import { TwoSlotStore } from '../../storage/two-slot';

/**
 * Ask's consent (App Review 5.1.2(i)): before the first question leaves this
 * device, the reader agrees that it goes to OPAX's server, Progress Agentic
 * RAG and an AI model through OpenRouter (AskConsent.tsx). Asked once: the
 * agreement is a small file in the app's documents, like the tour's seen
 * flag, and is never sent. A new version asks again.
 */
export const ASK_CONSENT_VERSION = 1;
const store = new TwoSlotStore<{ version: number }>(
  ['opax-ask-consent-v1.json', 'opax-ask-consent-v1.b.json'],
  (raw) => {
    const version = (raw as { version?: unknown } | null)?.version;
    return typeof version === 'number' && Number.isSafeInteger(version)
      ? { version }
      : null;
  },
  (value) => value,
);
let agreed: boolean | null = null;

/** Whether the reader has agreed on this device. Unreadable reads as no. */
export async function askConsentGiven(): Promise<boolean> {
  if (agreed) return true;
  try {
    agreed = (await store.read())?.version === ASK_CONSENT_VERSION;
  } catch {
    agreed = false;
  }
  return agreed;
}

/**
 * Agreed: held at once for this launch, then saved. A failed save only
 * means the question is asked again after the next launch.
 */
export function giveAskConsent(): Promise<void> {
  agreed = true;
  return store.save({ version: ASK_CONSENT_VERSION });
}

/** Tests only: forget this launch's answer. */
export function resetAskConsentForTests() {
  agreed = null;
}
