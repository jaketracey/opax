import { requireOptionalNativeModule } from 'expo';

// Static name is registered as an exact grant in native-review-policy.js.
export type NativeVoice = {
  snapshot(): Promise<unknown>;
  status(): Promise<unknown>;
  requestCode(email: string): Promise<unknown>;
  consumeCode(challengeId: string, code: string): Promise<unknown>;
  consent(): Promise<unknown>;
  setConsent(granted: boolean): Promise<unknown>;
  start(): Promise<unknown>;
  mute(muted: boolean): Promise<unknown>;
  end(): Promise<unknown>;
  logout(): Promise<unknown>;
  requestDeletionCode(): Promise<unknown>;
  deleteAccount(challengeId: string, code: string): Promise<unknown>;
  addListener(
    name: 'onVoiceEvent',
    listener: (value: unknown) => void,
  ): { remove(): void };
};
export default requireOptionalNativeModule<NativeVoice>('OpaxVoice');
