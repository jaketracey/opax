import type { NativeStackHeaderItem } from 'expo-router';
import { Alert } from 'react-native';
import { OpaxShare } from '../../modules/opax-share';
import { track } from '../analytics';
import type { ShareRecordType } from '../analytics/events';
import { isE2E, webOrigin } from '../design/environment';
import { haptic } from '../design/haptics';
import { currentChromeColours } from '../design/tokens';
import type { AskOptions } from '../features/ask/model';
import { canonicalUrl } from './external';

export const canShare = isE2E || OpaxShare !== null;

export interface ShareTarget {
  question?: { text: string; options: AskOptions };
  /** The canonical web path: "/subject/person/anthony-albanese". */
  path: string;
  /** The page title without the site suffix: "Anthony Albanese". */
  title: string;
  /** A section anchor, only when shared from that section: "person-pay". */
  anchor?: string;
  /** A sentence supplied by a quiz result, shared beside its canonical link. */
  text?: string;
}

/**
 * The coarse type of a shared web path, for analytics: which kind of page,
 * never which record. Anything unlisted is "other".
 */
export function shareRecordType(path: string): ShareRecordType {
  let pathname: string;
  try {
    pathname = new URL(path, 'https://opax.invalid').pathname;
  } catch {
    return 'other';
  }
  const [first, second] = pathname.split('/').filter(Boolean);
  if (first === 'subject')
    return second === 'person' || second === 'party' || second === 'electorate'
      ? second
      : 'other';
  if (first === 'bill' || first === 'bills') return 'bill';
  if (first === 'doc') return 'doc';
  if (first === 'money') return 'money';
  return 'other';
}

/** One `opax_share`: what was shared, as categories only. */
export function trackShare(
  kind: 'record' | 'question' | 'answer' | 'copy_link',
  path?: string,
) {
  track('opax_share', {
    kind,
    ...(path === undefined ? {} : { record_type: shareRecordType(path) }),
  });
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
  text,
}: ShareTarget): Promise<void> {
  const url = question
    ? questionShareURL(question.text, question.options)
    : canonicalUrl(path, anchor);
  if (question) trackShare('question');
  else trackShare('record', path);
  haptic('light');
  if (isE2E) {
    Alert.alert(`Share: ${title}`, url);
    return;
  }
  if (!OpaxShare) return;
  await OpaxShare.share({ url, title, ...(text ? { text } : {}) }).catch(() =>
    Alert.alert("Couldn't share this link"),
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
    tintColor: currentChromeColours().tint,
    icon: { type: 'sfSymbol', name: 'square.and.arrow.up' },
    onPress: () => void shareRecord(target),
  };
}

/** Copy the same canonical address used by the native share sheet. */
export async function copyRecordLink(path: string): Promise<void> {
  if (!OpaxShare) return;
  await OpaxShare.copyText(canonicalUrl(path));
  trackShare('copy_link', path);
  haptic('success');
}
