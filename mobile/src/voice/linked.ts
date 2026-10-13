import { Platform } from 'react-native';
import native from '../../modules/opax-voice';

/**
 * Whether this build offers Talk, account sign-in and deletion, and account
 * sync for Ask. iOS builds that show them always link OpaxVoice (the voice-off
 * release swaps the entries at bundle time, metro.config.js). Android offers
 * them when its OpaxVoice module is linked; without it, Talk and sign-in stay
 * out and Account and about is the one list of rows.
 */
export const voiceLinked = Platform.OS !== 'android' || native !== null;
