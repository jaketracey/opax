import { Pressable } from './pressable';
import {
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type Ref,
} from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  View,
  type PressableProps,
} from 'react-native';
import { Link, type Href } from 'expo-router';
import { menuTitle } from './menu-title';
import { useRecordLink } from '../navigation/record-link';
import { canonicalUrl, openOnWeb } from '../navigation/external';
import { shareRecord, trackShare } from '../navigation/share';
import { copyText } from '../features/records/actions';
import {
  follow,
  unfollow,
  useFollows,
  loadFollows,
  type FollowKind,
} from '../features/follows/store';
import { haptic } from './haptics';
import { showMenu } from './menu';
import type { SFSymbol } from './icon';
import { copy as words } from './copy';
import { spokenFigures } from './format';

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
        title={item.inline ? undefined : menuTitle(item.title)}
        icon={item.symbol}
        inline={item.inline}
      >
        {nativeItems(item.items)}
      </Link.Menu>
    ) : (
      <Link.MenuAction
        key={`${index}-${item.title}`}
        title={menuTitle(item.title)}
        icon={item.symbol}
        destructive={item.destructive}
        onPress={item.onPress}
      />
    ),
  );
}

type RowElement = ReactElement<PressableProps & { ref?: Ref<View> }>;
interface RowTriggerProps {
  row: RowElement;
  style?: PressableProps['style'];
  ref?: Ref<View>;
  [slotProp: string]: unknown;
}
const isHandler = (prop: string) => /^on[A-Z]/.test(prop);
function composeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as { current: T | null }).current = node;
    }
  };
}
/**
 * The element Link.Trigger slots its props into, so the row never meets the
 * Slot. expo-router 57.0.24 renders Link asChild and Link.Trigger through
 * Radix's Slot (build/ui/Slot.js), and @radix-ui/react-slot 1.3.3 mergeProps
 * (dist/index.js:119-141) merges a child's style as `{ ...slot, ...child }`.
 * Spreading a Pressable's pressed-state style function gives `{}`, so the
 * row lost `flexDirection: 'row'` and drew its glyph, title and chevron on
 * three lines. This element carries no style; it hands the Slot's props on
 * to the row with the row's own style (function or array) kept whole, and
 * merges the rest as Radix would: the row's props win, handlers run both.
 */
export function RowTrigger({
  row,
  style: slotStyle,
  ref,
  ...slot
}: RowTriggerProps) {
  const own = row.props;
  const merged: Record<string, unknown> = {};
  for (const [prop, value] of Object.entries(slot)) {
    const mine = (own as Record<string, unknown>)[prop];
    if (isHandler(prop) && typeof mine === 'function' && value) {
      merged[prop] = (...args: unknown[]) => {
        const result = (mine as (...a: unknown[]) => unknown)(...args);
        (value as (...a: unknown[]) => unknown)(...args);
        return result;
      };
    } else if (isHandler(prop) ? !mine : !(prop in own)) merged[prop] = value;
  }
  const style = own.style;
  return cloneElement(row, {
    ...merged,
    ...(slotStyle == null
      ? {}
      : {
          style:
            typeof style === 'function'
              ? (state: Parameters<typeof style>[0]) => [
                  style(state),
                  slotStyle,
                ]
              : [style, slotStyle],
        }),
    ref: composeRefs(own.ref, ref),
  } as Partial<PressableProps>);
}

/**
 * Told when a row link below it opens its record by a tap, VoiceOver or
 * TalkBack, without changing how it opens (analytics: the edition's story,
 * the money map's records). Never told which record.
 */
export const RowOpenListener = createContext<(() => void) | null>(null);

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
  const recordLink = useRecordLink(href);
  const currentRecord = recordLink.isCurrent();
  const opened = useContext(RowOpenListener);
  // A preview commit navigates independently of Link.onPress. There is no
  // destination to preview when this very record is already on top.
  const showPreview = preview && !select && !currentRecord;
  const items = menuSections(menu);
  const leaves = menuLeaves(items);
  const actions = rowAccessibilityActions(items);
  const open = () => {
    if (child.props.disabled || child.props.accessibilityState?.disabled)
      return;
    if (select) select();
    else {
      if (!recordLink.isCurrent()) opened?.();
      recordLink.open();
    }
  };
  const accessibility: Pick<
    PressableProps,
    | 'accessible'
    | 'accessibilityRole'
    | 'role'
    | 'accessibilityElementsHidden'
    | 'importantForAccessibility'
    | 'accessibilityActions'
    | 'onAccessibilityAction'
  > = {
    accessible: true,
    accessibilityRole: 'link',
    role: 'link',
    accessibilityElementsHidden: false,
    importantForAccessibility: 'yes',
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
        onPress={open}
        onLongPress={
          leaves.length
            ? Platform.OS === 'android'
              ? (event) =>
                  showMenu('', leaves, {
                    x: event.nativeEvent.pageX,
                    y: event.nativeEvent.pageY,
                    width: 0,
                    height: 0,
                  })
              : () => showMenu('', leaves)
            : undefined
        }
      />
    );
  const hasNativeHost = showPreview || items.length > 0;
  // expo-router 57.0.24 LinkWithPreview hardcodes a zero-frame native host
  // (`display: contents`, disableForceFlatten). iOS omits its whole subtree
  // from accessibility, even with accessible/importantForAccessibility on the
  // trigger. Link props only reach BaseExpoRouterLink, not that native host.
  // Give accessibility a real box outside it, while leaving the Pressable,
  // native context-menu interaction and preview/zoom machinery intact inside.
  const semantics = Object.fromEntries(
    Object.entries(child.props).filter(
      ([prop]) =>
        prop.startsWith('accessibility') ||
        prop.startsWith('onAccessibility') ||
        prop.startsWith('aria-'),
    ),
  );
  const style = child.props.style;
  const layout = StyleSheet.flatten(
    typeof style === 'function' ? style({ pressed: false }) : style,
  );
  const flexItemStyle = Object.fromEntries(
    (['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf'] as const)
      .filter((prop) => layout?.[prop] !== undefined)
      .map((prop) => [prop, layout![prop]]),
  );
  const trigger = cloneElement(child, {
    ...accessibility,
    ...(hasNativeHost
      ? {
          // The outer host groups this content, including inferred labels.
          accessible: false,
          testID: undefined,
        }
      : {}),
    onPress: undefined,
  });
  const link = (
    <Link
      href={href}
      push={recordLink.push}
      asChild
      onPress={
        select || currentRecord || opened
          ? (event) => {
              if (select) {
                event.preventDefault();
                select();
              } else if (recordLink.isCurrent()) event.preventDefault();
              else opened?.();
            }
          : undefined
      }
    >
      <Link.Trigger withAppleZoom={zoom && !select}>
        <RowTrigger row={trigger} />
      </Link.Trigger>
      {showPreview ? <Link.Preview /> : null}
      {items.length ? <Link.Menu>{nativeItems(items)}</Link.Menu> : null}
    </Link>
  );
  // A plain Link has no preview ancestor, so its Pressable is already the
  // accessible host. Account links and split selections need no extra box.
  if (!hasNativeHost) return link;
  return (
    <View
      {...semantics}
      {...accessibility}
      accessibilityLabel={
        child.props.accessibilityLabel
          ? spokenFigures(child.props.accessibilityLabel)
          : undefined
      }
      testID={child.props.testID}
      collapsable={false}
      pointerEvents="box-none"
      onAccessibilityTap={open}
      // The host is now the parent's flex item, so mirror its flex and
      // alignment properties. Spacing, dimensions, colours and the original
      // style function stay on the Pressable, protected from Slot by RowTrigger.
      style={flexItemStyle}
    >
      {link}
    </View>
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
      if (!copied) return;
      haptic('success');
      trackShare('copy_link', target.path);
    });
  },
});
const web = (target: Target): RowMenuLeaf => ({
  title: words.openOnWeb,
  symbol: 'arrow.up.right.square',
  onPress: () => void openOnWeb(target.path, target.title),
});
const followItem = (
  { following, onFollow }: FollowAction,
  bill = false,
): RowMenuLeaf => ({
  title: `${following ? 'Unfollow' : 'Follow'}${bill ? ' bill' : ''}`,
  symbol: following ? 'minus.circle' : 'plus',
  onPress: () => {
    onFollow();
    if (!following) haptic('success');
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

/** Resolve profile slugs through the same reviewed identity join as the page. */
async function followIdentity(kind: FollowKind, id: string): Promise<string> {
  if (kind !== 'person' || /^person_[a-f0-9]{24}$/.test(id)) return id;
  // Load build-bound services only for an opted-in person menu.
  const { catalogs } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../api/runtime') as typeof import('../api/runtime');
  const profile = await catalogs.person(id);
  if (!profile.data.canonicalPersonId)
    throw new Error('No canonical person identity');
  return profile.data.canonicalPersonId;
}
/** The shorthand menus keep canonical follow IDs distinct from route slugs. */
export function useRowFollow(
  kind: FollowKind,
  id: string | undefined,
  title: string,
): FollowAction {
  const follows = useFollows();
  const [resolved, setResolved] = useState<{
    routeId: string;
    id: string;
  } | null>(null);
  const canonical =
    kind === 'person' && id && !/^person_[a-f0-9]{24}$/.test(id)
      ? resolved?.routeId === id
        ? resolved.id
        : undefined
      : id;
  useEffect(() => {
    if (!id || kind !== 'person' || canonical) return;
    let active = true;
    void followIdentity(kind, id)
      .then((value) => {
        if (active) setResolved({ routeId: id, id: value });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [kind, id, canonical]);
  return {
    following:
      !!canonical &&
      !!follows?.some((item) => item.kind === kind && item.id === canonical),
    onFollow: () => {
      if (!id) return;
      void (async () => {
        const followId = canonical ?? (await followIdentity(kind, id));
        const current = await loadFollows();
        if (current.some((item) => item.kind === kind && item.id === followId))
          await unfollow(`${kind}:${followId}`);
        else if ((await follow({ kind, id: followId, title })) === 'limit')
          Alert.alert('Following', 'Unfollow an item to add another.');
      })().catch(() =>
        Alert.alert('Following', 'Your follows could not be saved.'),
      );
    },
  };
}
