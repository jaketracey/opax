import { requireOptionalNativeModule } from 'expo';

interface OpaxShareModule {
  share(request: { url: string; title: string }): Promise<boolean>;
  /** Light feedback for Follow and Share ("success", "selection", "light"). */
  haptic?(kind: string): Promise<void>;
}

// Null where the native module is not linked (unit tests).
export const OpaxShare =
  requireOptionalNativeModule<OpaxShareModule>('OpaxShare');
