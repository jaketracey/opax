import { requireOptionalNativeModule } from 'expo';

export interface ActionSheetRequest {
  title?: string;
  message?: string;
  options: string[];
  cancelButtonIndex?: number;
  destructiveButtonIndices?: number[];
  /** React tag of the control the sheet comes from. */
  anchor?: number;
}

interface OpaxShareModule {
  share(request: {
    url: string;
    title: string;
    text?: string;
    /** A source's own link (http or https, any host): no OPAX icon. */
    external?: boolean;
  }): Promise<boolean>;
  /**
   * iOS: an action sheet that always has a source where UIKit shows it as a
   * popover (iPad, regular-width iPhone windows). Resolves with the chosen
   * index, or -1 when `dismissActionSheet` closes it. Absent on Android and
   * in binaries built before it.
   */
  showActionSheet?(request: ActionSheetRequest): Promise<number>;
  dismissActionSheet?(): Promise<void>;
  copyText(text: string): Promise<void>;
  shareText(request: { text: string; filename: string }): Promise<boolean>;
  /** Light feedback for Follow and Share ("success", "selection", "light"). */
  haptic?(kind: string): Promise<void>;
}

// Null where the native module is not linked (unit tests).
export const OpaxShare =
  requireOptionalNativeModule<OpaxShareModule>('OpaxShare');
