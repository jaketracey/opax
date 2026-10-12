import { useRef } from 'react';
import { Platform, View, findNodeHandle } from 'react-native';
import { router } from 'expo-router';
import type { NativeStackHeaderItem } from 'expo-router';
import { IconButton } from '../../design/primitives';
import { chrome } from '../../design/tokens';
import { showMenu, type MenuAction } from '../../design/menu';
import { isRecordSlug } from '../../api/record-policy';
import { canonicalUrl } from '../../navigation/external';
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
export function recordActions({ slug, title }: RecordTarget): MenuAction[] {
  if (!isRecordSlug(slug)) return [];
  return [
    { title: 'Cite', onPress: () => router.push(citeRoute(slug)) },
    {
      title: 'Copy link',
      onPress: () => void copyText(canonicalUrl(`/doc/${slug}`)),
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
    icon: { type: 'sfSymbol', name: 'ellipsis' },
    tintColor: chrome.tint,
    menu: {
      title: target.title,
      items: actions.map((action) => ({
        type: 'action' as const,
        label: action.title,
        onPress: action.onPress,
      })),
    },
  };
}

/** The same ⋯ drawn inline, where the record has no navigation bar (an iPad pane). */
export function RecordActions({
  testID = 'doc-actions',
  ...target
}: RecordTarget & { testID?: string }) {
  const anchor = useRef<View>(null);
  const actions = recordActions(target);
  if (!actions.length) return null;
  return (
    <View ref={anchor} collapsable={false}>
      <IconButton
        symbol="ellipsis"
        accessibilityLabel="More for this record"
        testID={testID}
        onPress={() =>
          showMenu(
            target.title,
            actions,
            findNodeHandle(anchor.current) ?? undefined,
          )
        }
      />
    </View>
  );
}
