import { Alert } from 'react-native';
import type { NativeStackHeaderItem } from 'expo-router';
import { OpaxShare } from '../../modules/opax-share';
import { isE2E } from '../design/environment';
import { haptic } from '../design/haptics';
import { chrome } from '../design/tokens';
import { canonicalUrl } from './external';

export interface ShareTarget {
  /** The canonical web path: "/subject/person/anthony-albanese". */
  path: string;
  /** The page title without the site suffix: "Anthony Albanese". */
  title: string;
  /** A section anchor, only when shared from that section: "person-pay". */
  anchor?: string;
}

/**
 * Shares the canonical opax.com.au URL with link metadata built from loaded
 * data (title and app icon), so the share sheet never fetches the page or its
 * /og/* image. E2E builds show the link locally instead of the system sheet.
 */
export async function shareRecord({
  path,
  title,
  anchor,
}: ShareTarget): Promise<void> {
  const url = canonicalUrl(path, anchor);
  haptic('light');
  if (isE2E) {
    Alert.alert(`Share: ${title}`, url);
    return;
  }
  if (!OpaxShare) {
    Alert.alert('Share', 'Sharing is not available in this build.');
    return;
  }
  await OpaxShare.share({ url, title }).catch(() =>
    Alert.alert('Share', 'This link could not be shared.'),
  );
}

/** The navigation-bar Share button for a record screen. */
export function shareHeaderItem(target: ShareTarget): NativeStackHeaderItem {
  return {
    type: 'button',
    label: 'Share',
    accessibilityLabel: `Share ${target.title}`,
    tintColor: chrome.tint,
    icon: { type: 'sfSymbol', name: 'square.and.arrow.up' },
    onPress: () => void shareRecord(target),
  };
}
