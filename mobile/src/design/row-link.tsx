import { cloneElement, type ReactElement } from 'react';
import { Alert, Platform, Pressable, type PressableProps } from 'react-native';
import { Link, router, type Href } from 'expo-router';
import { canonicalUrl, openOnWeb } from '../navigation/external';
import { shareRecord } from '../navigation/share';
import { copyText } from '../features/records/actions';
import {
  follow,
  unfollow,
  useFollows,
  type FollowKind,
} from '../features/follows/store';
import { haptic } from './haptics';
import { showMenu } from './menu';
import type { SFSymbol } from './icon';

export type RowMenuAction =
  | {
      title: string;
      symbol?: SFSymbol;
      onPress: () => void;
      destructive?: boolean;
    }
  | {
      title: string;
      symbol?: SFSymbol;
      items: RowMenuAction[];
      inline?: boolean;
    };
export type RowMenuLeaf = Extract<RowMenuAction, { onPress: () => void }>;

/** The same leaves, in the same order, power touch, keyboard and VoiceOver. */
export function menuLeaves(items: readonly RowMenuAction[]): RowMenuLeaf[] {
  return items.flatMap((item) =>
    'items' in item ? menuLeaves(item.items) : [item],
  );
}
export function rowAccessibilityActions(items: readonly RowMenuAction[]) {
  return menuLeaves(items).map(({ title }) => ({ name: title, label: title }));
}

/** Destructive choices always occupy their own final, untitled section. */
export function menuSections(items: readonly RowMenuAction[]): RowMenuAction[] {
  const destructive: RowMenuLeaf[] = [];
  function collect(actions: readonly RowMenuAction[]): RowMenuAction[] {
    return actions.flatMap((action): RowMenuAction[] => {
      if ('items' in action) {
        const children = collect(action.items);
        return children.length ? [{ ...action, items: children }] : [];
      }
      if (action.destructive) {
        destructive.push(action);
        return [];
      }
      return [action];
    });
  }
  const ordinary = collect(items);
  return [
    ...ordinary,
    ...(destructive.length
      ? [{ title: '', inline: true, items: destructive }]
      : []),
  ];
}
function nativeItems(items: readonly RowMenuAction[]): ReactElement[] {
  return items.map((item, index) =>
    'items' in item ? (
      // expo-router 57.0.24 elements.d.ts: displayInline exists as a deprecated
      // alias. `inline` is the public prop and maps to native displayInline.
      <Link.Menu
        key={`${index}-${item.title}`}
        title={item.inline ? undefined : item.title}
        icon={item.symbol}
        inline={item.inline}
      >
        {nativeItems(item.items)}
      </Link.Menu>
    ) : (
      <Link.MenuAction
        key={`${index}-${item.title}`}
        title={item.title}
        icon={item.symbol}
        destructive={item.destructive}
        onPress={item.onPress}
      />
    ),
  );
}

/** A native preview and menu, with every menu choice also directly accessible. */
export function RowLink({
  href,
  children,
  menu = [],
  preview = true,
  zoom = false,
  select,
}: {
  href: Href;
  children: ReactElement;
  menu?: RowMenuAction[];
  preview?: boolean;
  zoom?: boolean;
  select?: () => void;
}) {
  const child = children as ReactElement<PressableProps>;
  const items = menuSections(menu);
  const leaves = menuLeaves(items);
  const actions = rowAccessibilityActions(items);
  const accessibility: Pick<
    PressableProps,
    'accessibilityActions' | 'onAccessibilityAction'
  > = {
    accessibilityActions: [
      ...(child.props.accessibilityActions ?? []),
      ...actions,
    ],
    onAccessibilityAction: (event) => {
      const action = leaves.find(
        (item) => item.title === event.nativeEvent.actionName,
      );
      if (action) action.onPress();
      else child.props.onAccessibilityAction?.(event);
    },
  };
  if (Platform.OS !== 'ios')
    return (
      <Pressable
        {...child.props}
        {...accessibility}
        onPress={() => (select ? select() : router.push(href))}
        onLongPress={leaves.length ? () => showMenu('', leaves) : undefined}
      />
    );
  const trigger = cloneElement(child, { ...accessibility, onPress: undefined });
  return (
    <Link
      href={href}
      asChild
      onPress={
        select
          ? (event) => {
              event.preventDefault();
              select();
            }
          : undefined
      }
    >
      <Link.Trigger withAppleZoom={zoom && !select}>{trigger}</Link.Trigger>
      {preview && !select ? <Link.Preview /> : null}
      {items.length ? <Link.Menu>{nativeItems(items)}</Link.Menu> : null}
    </Link>
  );
}

interface Target {
  title: string;
  path: string;
}
interface FollowAction {
  following?: boolean;
  onFollow: () => void;
}
interface SeatAction {
  setSeat?: { label: string; onSelect: () => void };
}
const share = (target: Target): RowMenuLeaf => ({
  title: 'Share',
  symbol: 'square.and.arrow.up',
  onPress: () => void shareRecord(target),
});
const copy = (target: Target): RowMenuLeaf => ({
  title: 'Copy link',
  symbol: 'link',
  onPress: () => {
    void copyText(canonicalUrl(target.path)).then((copied) => {
      if (copied) haptic('success');
    });
  },
});
const web = (target: Target): RowMenuLeaf => ({
  title: 'Open on opax.com.au',
  symbol: 'arrow.up.right.square',
  onPress: () => void openOnWeb(target.path, target.title),
});
const followItem = (
  { following, onFollow }: FollowAction,
  bill = false,
): RowMenuLeaf => ({
  title: `${following ? 'Unfollow' : 'Follow'}${bill ? ' bill' : ''}`,
  symbol: following ? 'minus.circle' : 'plus',
  destructive: !!following,
  onPress: () => {
    onFollow();
    haptic('success');
  },
});
const seatItems = ({ setSeat }: SeatAction): RowMenuAction[] =>
  setSeat
    ? [
        {
          title: setSeat.label,
          symbol: 'map',
          onPress: setSeat.onSelect,
        },
      ]
    : [];

export const rowMenus = {
  person(
    subject: { name: string; slug: string } & FollowAction & SeatAction,
  ): RowMenuAction[] {
    const target = {
      title: subject.name,
      path: `/subject/person/${subject.slug}`,
    };
    return menuSections([
      followItem(subject),
      ...seatItems(subject),
      share(target),
      copy(target),
      web(target),
    ]);
  },
  bill(
    subject: {
      billKey: string;
      title: string;
      onAsk: () => void;
    } & FollowAction,
  ): RowMenuAction[] {
    const target = { title: subject.title, path: `/bill/${subject.billKey}` };
    return menuSections([
      followItem(subject),
      share(target),
      copy(target),
      {
        title: 'Ask about this bill',
        symbol: 'text.bubble',
        onPress: subject.onAsk,
      },
    ]);
  },
  record(subject: {
    title: string;
    slug?: string;
    path?: string;
  }): RowMenuAction[] {
    const target = {
      title: subject.title,
      path: subject.path ?? `/doc/${subject.slug ?? ''}`,
    };
    return menuSections([share(target), copy(target), web(target)]);
  },
  place(subject: Target & FollowAction & SeatAction): RowMenuAction[] {
    return menuSections([
      followItem(subject),
      ...seatItems(subject),
      share(subject),
      copy(subject),
      web(subject),
    ]);
  },
  following(subject: Target & { onUnfollow: () => void }): RowMenuAction[] {
    return menuSections([
      share(subject),
      copy(subject),
      {
        title: 'Unfollow',
        symbol: 'minus.circle',
        destructive: true,
        onPress: subject.onUnfollow,
      },
    ]);
  },
  division(
    subject: { billKey: string; billTitle: string } & FollowAction,
  ): RowMenuAction[] {
    const target = {
      title: subject.billTitle,
      path: `/bill/${subject.billKey}`,
    };
    return menuSections([
      followItem(subject, true),
      copy(target),
      share(target),
    ]);
  },
};

/** Used only by the opt-in shorthand menus; callers can instead supply actions. */
export function useRowFollow(
  kind: FollowKind,
  id: string | undefined,
  title: string,
): FollowAction {
  const follows = useFollows();
  const key = `${kind}:${id}`;
  return {
    following: !!follows?.some((item) => `${item.kind}:${item.id}` === key),
    onFollow: () => {
      if (!id) return;
      const change = follows?.some((item) => `${item.kind}:${item.id}` === key)
        ? unfollow(key)
        : follow({ kind, id, title }).then((result) => {
            if (result === 'limit')
              Alert.alert('Following', 'Unfollow an item to add another.');
          });
      void change.catch(() =>
        Alert.alert('Following', 'Your follows could not be saved.'),
      );
    },
  };
}
