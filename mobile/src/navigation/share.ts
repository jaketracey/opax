import { Alert } from 'react-native';
import type { NativeStackHeaderItem } from 'expo-router';
import { OpaxShare } from '../../modules/opax-share';
import { isE2E, webOrigin } from '../design/environment';
import { chrome } from '../design/tokens';
import { canonicalUrl } from './external';
import type { AskOptions } from '../features/ask/model';

export interface ShareTarget {
  question?: { text: string; options: AskOptions };
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
  question,
}: ShareTarget): Promise<void> {
  const url = question
    ? questionShareURL(question.text, question.options)
    : canonicalUrl(path, anchor);
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

export function questionShareURL(text: string, options: AskOptions): string {
  const q = text.trim();
  if (!q || q.length > 2000) throw new Error('A share link needs a question.');
  const params = new URLSearchParams({ q });
  if (options.kind === 'speech') params.set('kind', 'speech');
  for (const key of [
    'speaker',
    'party',
    'state',
    'topic',
    'from',
    'to',
  ] as const)
    if (options[key]) params.set(key, options[key]);
  return `${webOrigin}/ask?${params}`;
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
