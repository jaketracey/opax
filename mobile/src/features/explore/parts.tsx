import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { haptic } from '../../design/haptics';
import type { RowMenuAction } from '../../design/row-link';
import { headerItems, pageItems } from '../../navigation/chrome';
import { openOnWeb } from '../../navigation/external';
import { exploreWebPath } from '../../navigation/routes/explore';
import { copyRecordLink, shareRecord } from '../../navigation/share';

/** One name per tool (explore spec 1.1). */
export const toolNames: Readonly<Record<string, string>> = {
  quiz: 'The record quiz',
  tm: 'Time machine',
  tide: 'The tide',
  matrix: 'Who owns which debate',
  wd: 'Words per dollar',
};
export const hubName = 'Quizzes and tools';
export const toolName = (id?: string) => (id && toolNames[id]) || hubName;

export interface ExploreSort<T extends string = string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** The ⋯ menu: an optional Sort by submenu first, then Copy link and Open. */
export function exploreMenu({
  name,
  path,
  sort,
}: {
  name: string;
  path: string;
  sort?: ExploreSort;
}): RowMenuAction[] {
  const page: RowMenuAction[] = [
    {
      title: 'Copy link',
      symbol: 'link',
      onPress: () => void copyRecordLink(path),
    },
    {
      title: 'Open on opax.com.au',
      symbol: 'arrow.up.right',
      onPress: () => void openOnWeb(path, name),
    },
  ];
  if (!sort) return page;
  const sortBy: RowMenuAction = {
    title: 'Sort by',
    items: sort.options.map((option) => ({
      title: option.label,
      ...(option.value === sort.value ? { symbol: 'checkmark' as const } : {}),
      onPress: () => {
        if (option.value === sort.value) return;
        haptic('selection');
        sort.onChange(option.value);
      },
    })),
  };
  // iOS draws the inline section's divider; Android's sheet lists the rows.
  return Platform.OS === 'ios'
    ? [sortBy, { title: '', inline: true, items: page }]
    : [sortBy, ...page];
}

/**
 * The bar for every Explore screen (explore spec 1.2): Share, then one ⋯
 * menu, outermost, with an optional Sort by submenu, Copy link and Open on
 * opax.com.au. Nothing else goes in the bar.
 *
 * The title fades in by scroll: the page passes its name to `Screen`'s
 * `barTitle` and draws it as its level 1 heading. Pass `title` only where
 * the bar holds a fixed title instead (a quiz round, whose heading is the
 * question).
 */
export function ExploreChrome({
  title,
  game,
  params,
  name,
  sort,
  share,
}: {
  /** A fixed bar title; leave unset for the title by scroll. */
  title?: string;
  /** The tool id; unset for the hub. */
  game?: string;
  /** The web query this screen keeps: `q` for Today's question. */
  params?: Record<string, string | undefined>;
  /** The screen's name for Share and VoiceOver; defaults to the tool's. */
  name?: string;
  sort?: ExploreSort;
  /** Replaces the shared title: the quiz result shares its score. */
  share?: { title: string };
}) {
  const label = name ?? toolName(game);
  const path = exploreWebPath(game, params);
  return (
    <Stack.Screen
      options={{
        ...(title ? { title, headerTitle: title } : {}),
        ...headerItems(
          pageItems({
            name: label,
            share: () =>
              void shareRecord({ path, title: share?.title ?? label }),
            menu: exploreMenu({ name: label, path, sort }),
          }),
        ),
      }}
    />
  );
}

/**
 * @deprecated Use ExploreChrome. Kept for the Explore tools until wave 6
 * switches their imports; it draws the same bar with a fixed title.
 */
export function ExploreHeader({
  title,
  game,
}: {
  title: string;
  game?: string;
}) {
  return <ExploreChrome title={title} game={game} />;
}
