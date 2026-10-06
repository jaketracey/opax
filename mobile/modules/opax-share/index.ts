import { requireOptionalNativeModule } from 'expo';

interface OpaxShareModule {
  share(request: { url: string; title: string }): Promise<boolean>;
  copyText(text: string): Promise<void>;
  shareText(request: { text: string; filename: string }): Promise<boolean>;
}

// Null where the native module is not linked (unit tests).
export const OpaxShare =
  requireOptionalNativeModule<OpaxShareModule>('OpaxShare');
