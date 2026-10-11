import type {WithheldPhrases} from '../public/donor-entity.js';
export function tablePrivacyCheck(phrases: WithheldPhrases): (...texts: unknown[]) => boolean;
