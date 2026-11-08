import { Platform } from 'react-native';
import { router } from 'expo-router';
import type { NativeStackHeaderItem } from 'expo-router';
import { chrome } from '../../design/tokens';
import { showMenu } from '../../design/menu';
import { haptic } from '../../design/haptics';
import type { RowMenuAction, RowMenuLeaf } from '../../design/row-link';
import { isRecordSlug } from '../../api/record-policy';
import { canonicalUrl, openOnWeb } from '../../navigation/external';
import { citeRoute } from '../../navigation/routes';
import { shareRecord } from '../../navigation/share';
import { copyText } from './actions';

/** The record a menu acts on: its slug and its title for Share. */
export interface RecordTarget {
  slug: string;
  title: string;
}

/**
 * A record's secondary actions, in one place (pass 1's "built twice"; pass
 * 5, P1-2): Cite, Copy link and Share. They live under ⋯, never as a row of
 * drawn buttons. Opening a menu calls no API until Cite opens the record.
 */
export function recordActions({ slug, title }: RecordTarget): RowMenuLeaf[] {
  if (!isRecordSlug(slug)) return [];
  return [
    { title: 'Cite', onPress: () => router.push(citeRoute(slug)) },
    {
      title: 'Copy link',
      onPress: () => {
        void copyText(canonicalUrl(`/doc/${slug}`)).then((copied) => {
          if (copied) haptic('success');
        });
      },
    },
    {
      title: 'Share',
      onPress: () => void shareRecord({ path: `/doc/${slug}`, title }),
    },
  ];
}

/**
 * The reader's ⋯ in the navigation bar: a native pull-down menu on iOS, and
 * on Android (whose header draws buttons only) a button that opens the same
 * actions as a sheet.
 */
export function recordMenuItem(target: RecordTarget): NativeStackHeaderItem {
  const actions = recordActions(target);
  if (Platform.OS === 'android')
    return {
      type: 'button',
      label: 'More',
      accessibilityLabel: 'More for this record',
      onPress: () => showMenu(target.title, actions),
    };
  return {
    type: 'menu',
    label: 'More',
    accessibilityLabel: 'More for this record',
    icon: { type: 'sfSymbol', name: 'ellipsis.circle' },
    tintColor: chrome.tint,
    menu: {
      items: actions.map((action) => ({
        type: 'action' as const,
        label: action.title,
        onPress: action.onPress,
      })),
    },
  };
}

/** Menu payload for pageItems. No in-content More button. */
export function recordPageActions(target: RecordTarget): RowMenuAction[] {
  const [cite, copy] = recordActions(target);
  if (!cite || !copy) return [];
  return [
    { title: '', inline: true, items: [cite] },
    copy,
    {
      title: 'Open on opax.com.au',
      symbol: 'arrow.up.right.square',
      onPress: () => void openOnWeb(`/doc/${target.slug}`, target.title),
    },
  ];
}
/** @deprecated Screens install recordPageActions in their navigation bar. */
export function RecordActions(_props: RecordTarget & { testID?: string }) {
  return null;
}
