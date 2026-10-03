import { requireOptionalNativeModule } from 'expo';

interface OpaxShareModule {
  share(request: { url: string; title: string }): Promise<boolean>;
}

// Null where the native module is not linked (unit tests).
export const OpaxShare =
  requireOptionalNativeModule<OpaxShareModule>('OpaxShare');
