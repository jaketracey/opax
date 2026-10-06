import { Alert, AccessibilityInfo } from 'react-native';
import { OpaxShare } from '../../../modules/opax-share';
import { isE2E } from '../../design/environment';
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!OpaxShare) throw new Error('Copy is unavailable in this build.');
    await OpaxShare.copyText(text);
    AccessibilityInfo.announceForAccessibility('Copied');
    return true;
  } catch {
    Alert.alert('Copy', 'This text could not be copied.');
    return false;
  }
}
export async function shareTextFile(
  text: string,
  filename: string,
): Promise<void> {
  if (isE2E) {
    Alert.alert(`Share file: ${filename}`, text);
    return;
  }
  try {
    if (!OpaxShare) throw new Error('Share is unavailable in this build.');
    await OpaxShare.shareText({ text, filename });
  } catch {
    Alert.alert('Share', 'This text file could not be shared.');
  }
}
