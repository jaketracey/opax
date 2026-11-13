import { useFocusEffect } from 'expo-router';
import {
  CommonActions,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import { useAccessibilitySize } from './accessibility';
import {
  Hoverable,
  RegionProvider,
  splitPane,
  splitPanePhoneRegular,
  splitPaneWidth,
  useLayout,
  useMeasuredRegion,
} from './adaptive';
import { activeVerticalFold, sidesOf } from './fold';
import { ReservedRegionArea, useReservedRegions } from './fold-area';
import { Icon } from './icon';
import { useKeyCommand } from './keyboard';
import { symbols } from './symbols';
import { Text } from './text';
import { colors, hairline, minimumTarget, radii, rhythm } from './tokens';

/**
 * The detail pane's own small stack: the selected item first, then what was
 * opened from it inside the pane ("Read the bill text"). Screens drawn in a
 * pane read it with `useSplitPane()`; outside a pane it is null and they
 * push routes as they always have.
 */
export interface SplitPane<T> {
  /** Opens an entry in the pane, above the current one. */
  push: (entry: T) => void;
  /** Replaces a resolved entry without adding a Back step. */
  replace?: (entry: T) => void;
  /** Back to the entry below; false at the selected item. */
  back: () => boolean;
  /** Makes `entry` the selection, alone in the pane (a related item). */
  select: (entry: T) => void;
  /** The pane's stack, the selection first. */
  entries: readonly T[];
  depth: number;
}
const PaneContext = createContext<SplitPane<unknown> | null>(null);
/** The split pane this screen is drawn in, or null (a pushed route). */
export function useSplitPane<T>(): SplitPane<T> | null {
  return useContext(PaneContext) as SplitPane<T> | null;
}

/**
 * Drawn first inside the pane's `Screen` content: the pane's Back and its
 * actions. Outside a pane it is null, so a pushed screen is unchanged.
 */
const PaneBarContext = createContext<ReactNode>(null);
export function usePaneBar(): ReactNode {
  return useContext(PaneBarContext);
}

/**
 * True inside a split's list pane. The list is the way to the subject, so
 * its sections draw no category accent: the detail pane carries the view's
 * one accent. False everywhere else, so the phone is unchanged.
 */
const ListPaneContext = createContext(false);
export function useInSplitList(): boolean {
  return useContext(ListPaneContext);
}

/**
 * The keyboard's place in a cursor-mode list (Search): rows draw it as the
 * hover tint, and the screen scrolls it into view. Null elsewhere.
 */
const CursorContext = createContext<string | null>(null);
export function useSplitCursor(): string | null {
  return useContext(CursorContext);
}

// List widths survive remounts (a tab switch, a rotation through compact).
const savedWidths = new Map<string, number>();

/** A native record route, relative to the split's owning stack. */
export interface SplitRoute {
  pathname: string;
  params?: Record<string, unknown>;
}

function sameRoute(left: SplitRoute | null, right: SplitRoute | null) {
  return (
    !!left &&
    !!right &&
    left.pathname === right.pathname &&
    Object.keys({ ...left.params, ...right.params }).every(
      (key) => left.params?.[key] === right.params?.[key],
    )
  );
}

export interface SplitLayoutProps<T> {
  /** Remembers this split's list width. */
  id: string;
  /** The list pane. On compact width it is the whole screen. */
  list: ReactNode;
  /** The selected item, or null for the empty state. */
  selected: T | null;
  /** First available row, used only while two panes are drawn. */
  initialSelection?: () => T | null;
  onSelect: (entry: T | null) => void;
  /** Draws an entry in the detail pane (the selection or a pushed entry). */
  renderDetail: (entry: T) => ReactNode;
  entryKey: (entry: T) => string;
  /** Maps loaded entries to native routes when the split collapses. */
  entryRoute?: (entry: T) => SplitRoute | null;
  /** Returns null for routes this split cannot draw when it expands. */
  entryFromRoute?: (route: SplitRoute) => T | null;
  /** The Back label for an entry below the top one ("Bill"). */
  entryTitle?: (entry: T) => string;
  /** Trailing actions in the pane bar (Share). */
  detailActions?: (entry: T) => ReactNode;
  /**
   * What the detail pane says while nothing is selected: `EmptyState` with
   * `size="pane"`, one quiet line ("No bill selected").
   */
  empty: ReactNode;
  /**
   * Keyboard selection: the list's keys in order. Up and Down move the
   * selection while the split is on screen and no field has focus, Return
   * selects the first row when nothing is selected, and Escape steps back
   * in the pane, then clears the selection.
   */
  keys?: readonly string[];
  /** Turns a key from `keys` into an entry to select. */
  entryForKey?: (key: string) => T;
  /**
   * Cursor mode, for lists whose rows may load before they open or leave
   * the split (Search): Up and Down move a highlight (`useSplitCursor()`)
   * without opening anything, and Return opens the highlighted row.
   */
  onOpenKey?: (key: string) => void;
  /** Called when the cursor moves, to scroll its row into view. */
  onCursor?: (key: string) => void;
  testID?: string;
}

/**
 * One stable list container across window resizes. From the split
 * breakpoint (`splitAllowed`) the detail and divider join it; below it the
 * list fills the screen.
 */
export function SplitLayout<T>(props: SplitLayoutProps<T>) {
  return (
    <ReservedRegionArea style={styles.grow}>
      <SplitContent {...props} />
    </ReservedRegionArea>
  );
}

function SplitContent<T>({
  id,
  list,
  selected,
  initialSelection,
  onSelect,
  renderDetail,
  entryKey,
  entryRoute,
  entryFromRoute,
  entryTitle,
  detailActions,
  empty,
  keys,
  entryForKey,
  onOpenKey,
  onCursor,
  testID,
}: SplitLayoutProps<T>) {
  const layout = useLayout();
  // Two panes only from the split breakpoint (`splitAllowed`, 700pt on any
  // device); a narrower regular phone draws the list alone, as on iPhone.
  const twoPane = layout.split;
  const first = twoPane && !selected ? (initialSelection?.() ?? null) : null;
  const effectiveSelection = selected ?? first;
  const selectedKey = effectiveSelection ? entryKey(effectiveSelection) : null;
  // A new selection starts the pane's stack again: a stack belongs to the
  // selection it was opened from.
  const [paneState, setPaneState] = useState<{
    key: string | null;
    stack: T[];
  }>(() => ({
    key: selectedKey,
    stack: effectiveSelection ? [effectiveSelection] : [],
  }));
  const fresh = effectiveSelection ? [effectiveSelection] : [];
  const stack = paneState.key === selectedKey ? paneState.stack : fresh;
  const setStack = (next: (current: T[]) => T[]) =>
    setPaneState((current) => ({
      key: selectedKey,
      stack: next(current.key === selectedKey ? current.stack : fresh),
    }));
  const top = stack.at(-1) ?? null;
  const pane: SplitPane<T> = {
    push: (entry) => setStack((current) => [...current, entry]),
    replace: (entry) => setStack((current) => [...current.slice(0, -1), entry]),
    back: () => {
      if (stack.length < 2) return false;
      setStack((current) => current.slice(0, -1));
      return true;
    },
    select: (entry) => {
      setPaneState({ key: entryKey(entry), stack: [entry] });
      onSelect(entry);
    },
    entries: stack,
    depth: stack.length,
  };

  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  const previous = useRef({ regular: twoPane, stack });
  const pendingExpansion = useRef(false);
  useEffect(() => {
    const before = previous.current;
    previous.current = { regular: twoPane, stack };
    if (!twoPane) pendingExpansion.current = false;
    else if (!before.regular) pendingExpansion.current = true;
    if (!navigation || !route || !entryRoute || !entryFromRoute) return;
    const parent = navigation.getParent();
    const ownsWindow = () => parent?.isFocused() !== false;
    const state = navigation.getState();
    const owner = state.routes.findIndex((item) => item.key === route.key);
    if (owner < 0 || state.type !== 'stack') return;

    if (before.regular && !twoPane && ownsWindow() && navigation.isFocused()) {
      // Add the mapped pane stack atomically, keeping every existing route
      // key, including the list's. A route below the top may be unmappable.
      const topRoute = before.stack.at(-1) && entryRoute(before.stack.at(-1)!);
      const details = before.stack.flatMap((entry) => {
        const destination = entryRoute(entry);
        return destination
          ? [
              {
                name: destination.pathname.replace(/^\//, ''),
                params: destination.params,
              },
            ]
          : [];
      });
      if (
        topRoute &&
        details.every((item) => state.routeNames.includes(item.name))
      ) {
        const routes = [...state.routes.slice(0, owner + 1), ...details];
        navigation.dispatch({
          ...CommonActions.reset({
            ...state,
            routes,
            index: routes.length - 1,
          }),
          target: state.key,
        });
      }
    }

    const expand = () => {
      // Recovery belongs to a width transition. Ordinary route pushes in a
      // regular window retain their existing full-screen navigation.
      if (!pendingExpansion.current || !twoPane || !ownsWindow()) return;
      const current = navigation.getState();
      const index = current.routes.findIndex((item) => item.key === route.key);
      if (index < 0 || current.index < index) return;
      if (current.index === index) {
        pendingExpansion.current = false;
        // Back to the compact list has dismissed the pane's deeper entries.
        if (!before.regular && stack.length > 1)
          setPaneState({ key: selectedKey, stack: stack.slice(0, 1) });
        return;
      }
      const details = current.routes.slice(index + 1, current.index + 1);
      const entries = details.map((item) =>
        item.state
          ? null
          : entryFromRoute({
              pathname: `/${item.name}`,
              params: item.params as SplitRoute['params'],
            }),
      );
      // Only absorb a contiguous record stack immediately above this list.
      // Another list, a sheet or an unrelated route retains its navigation.
      if (!entries.length || entries.some((entry) => entry === null)) return;
      const restored = (entries as T[]).map((entry) => {
        const loaded = stack.find((item) => entryKey(item) === entryKey(entry));
        // Reuse loaded entries only while the route's reader state agrees,
        // including a document's cited passage changed on compact width.
        return loaded && sameRoute(entryRoute(loaded), entryRoute(entry))
          ? loaded
          : entry;
      });
      const base = restored[0]!;
      pendingExpansion.current = false;
      setPaneState({ key: entryKey(base), stack: restored });
      navigation.dispatch({
        ...CommonActions.reset({
          ...current,
          routes: current.routes.slice(0, index + 1),
          index,
        }),
        target: current.key,
      });
      // Update after the reset so its retained list route includes the new
      // selection parameters, rather than replacing them with the old ones.
      if (entryKey(base) !== selectedKey) onSelect(base);
    };
    expand();
    const offState = navigation.addListener('state', expand);
    const offFocus = parent?.addListener('focus', expand);
    return () => {
      offState();
      offFocus?.();
    };
  }, [
    twoPane,
    stack,
    navigation,
    route,
    entryRoute,
    entryFromRoute,
    entryKey,
    selectedKey,
    onSelect,
  ]);

  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    if (twoPane && focused && !selected && first) onSelect(first);
  }, [twoPane, focused, selected, first, onSelect]);
  const cursorMode = !!onOpenKey;
  const keyboard =
    twoPane && focused && !!keys && (!!entryForKey || cursorMode);
  const [cursorState, setCursor] = useState<string | null>(null);
  // A cursor whose row has gone (a new search) is no cursor.
  const cursor =
    cursorMode && cursorState && keys?.includes(cursorState)
      ? cursorState
      : null;
  const step = (index: number, delta: number, length: number) =>
    index < 0
      ? delta > 0
        ? 0
        : length - 1
      : Math.min(Math.max(index + delta, 0), length - 1);
  const move = (delta: number) => {
    if (!keys?.length) return;
    if (cursorMode) {
      const index = cursor ? keys.indexOf(cursor) : -1;
      const next = keys[step(index, delta, keys.length)]!;
      setCursor(next);
      onCursor?.(next);
      return;
    }
    if (!entryForKey) return;
    const index = selectedKey
      ? keys.findIndex((key) => entryKey(entryForKey(key)) === selectedKey)
      : -1;
    const next = step(index, delta, keys.length);
    if (next !== index) onSelect(entryForKey(keys[next]!));
  };
  const open = () => {
    if (!keys?.length) return;
    if (cursorMode) {
      if (cursor) onOpenKey(cursor);
      return;
    }
    if (!selected && entryForKey) onSelect(entryForKey(keys[0]!));
  };
  useKeyCommand('list-down', () => move(1), keyboard);
  useKeyCommand('list-up', () => move(-1), keyboard);
  useKeyCommand('list-open', open, keyboard);
  useKeyCommand(
    'back',
    () => {
      pane.back();
    },
    keyboard && stack.length > 1,
  );
  useKeyCommand(
    'list-escape',
    () =>
      stack.length > 1
        ? pane.back()
        : selected
          ? onSelect(null)
          : setCursor(null),
    keyboard && (!!selected || !!cursor),
  );

  // The list starts at the one two-pane rule (`splitPaneWidth`: a third of
  // the region, 45% at accessibility sizes so its rows keep whole words); a
  // width the reader drags is kept per mode.
  const large = useAccessibilitySize();
  const phoneRegular = layout.rule === 'phone-regular';
  const modeKey = phoneRegular ? `${id}:phone-regular` : id;
  const widthKey = large ? `${modeKey}:large` : modeKey;
  const maxWidth = phoneRegular
    ? Math.round(layout.width * splitPanePhoneRegular.maxFraction)
    : large
      ? Math.round(layout.width * 0.5)
      : Math.min(splitPane.max, Math.round(layout.width * 0.5));
  const clampWidth = (next: number) =>
    Math.round(
      Math.min(
        Math.max(
          next,
          phoneRegular ? splitPanePhoneRegular.min : splitPane.min,
        ),
        maxWidth,
      ),
    );
  const [, setResized] = useState(0);
  const saved = savedWidths.get(widthKey);
  const normalWidth =
    saved === undefined
      ? splitPaneWidth(layout.width, large, layout.rule)
      : clampWidth(saved);
  const regions = useReservedRegions();
  const fold = twoPane ? activeVerticalFold(regions.divisions) : null;
  const sides = fold
    ? sidesOf(fold, { x: 0, y: 0, width: layout.width, height: layout.height })
    : null;
  const vertical = sides && 'leading' in sides ? sides : null;
  const width = vertical?.leading.width ?? normalWidth;
  const gap = vertical ? vertical.trailing.x - width : 1;
  const resize = (next: number) => {
    if (fold) return;
    savedWidths.set(widthKey, clampWidth(next));
    setResized((count) => count + 1);
  };
  const [onListLayout, listRegion] = useMeasuredRegion();
  const [onDetailLayout, detailRegion] = useMeasuredRegion();

  const below = stack.length > 1 ? stack.at(-2)! : null;
  // No bar when it would be empty: no Back and no actions for this entry.
  const actions = top ? (detailActions?.(top) ?? null) : null;
  const bar =
    top && (below || actions) ? (
      <View style={styles.paneBar} testID="split-pane-bar">
        {below ? (
          <PaneBack
            label={entryTitle?.(below) ?? 'Back'}
            onPress={() => pane.back()}
          />
        ) : null}
        <View style={styles.grow} />
        {actions}
      </View>
    ) : null;
  return (
    <View style={styles.split} testID={twoPane ? testID : undefined}>
      <View
        style={[styles.listPane, twoPane ? { width } : styles.grow]}
        onLayout={onListLayout}
        testID={testID ? `${testID}-list` : undefined}
      >
        <RegionProvider value={twoPane ? listRegion : null}>
          <ListPaneContext.Provider value={twoPane}>
            <CursorContext.Provider
              value={twoPane && cursorMode ? cursor : null}
            >
              {list}
            </CursorContext.Provider>
          </ListPaneContext.Provider>
        </RegionProvider>
      </View>
      {twoPane ? (
        <Divider width={width} onResize={resize} paused={!!fold} gap={gap} />
      ) : null}
      {twoPane ? (
        <View
          style={styles.detailPane}
          onLayout={onDetailLayout}
          testID={testID ? `${testID}-detail` : undefined}
        >
          <RegionProvider value={detailRegion}>
            <PaneContext.Provider value={pane as SplitPane<unknown>}>
              <PaneBarContext.Provider value={bar}>
                {top ? (
                  <View key={entryKey(top) + stack.length} style={styles.grow}>
                    {renderDetail(top)}
                  </View>
                ) : (
                  empty
                )}
              </PaneBarContext.Provider>
            </PaneContext.Provider>
          </RegionProvider>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A detail pane drawn outside `SplitLayout` (Ask's sources pane): screens
 * inside read `pane` through `useSplitPane()` and draw `bar` (Back and
 * actions) first in their content, exactly as in a split.
 */
export function PaneHost<T>({
  pane,
  bar,
  children,
}: {
  pane: SplitPane<T>;
  bar: ReactNode;
  children: ReactNode;
}) {
  return (
    <PaneContext.Provider value={pane as SplitPane<unknown>}>
      <PaneBarContext.Provider value={bar}>{children}</PaneBarContext.Provider>
    </PaneContext.Provider>
  );
}

/** The pane bar: Back to the entry below, then trailing actions. */
export function PaneBar({
  back,
  onBack,
  actions,
}: {
  /** The entry below's name ("Sources"), or null at the bottom. */
  back: string | null;
  onBack: () => void;
  actions?: ReactNode;
}) {
  return (
    <View style={styles.paneBar} testID="split-pane-bar">
      {back ? <PaneBack label={back} onPress={onBack} /> : null}
      <View style={styles.grow} />
      {actions}
    </View>
  );
}

function PaneBack({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Hoverable effect="highlight" cornerRadius={8} style={styles.backWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Back to ${label}`}
        onPress={onPress}
        hitSlop={4}
        testID="split-pane-back"
        style={({ pressed }) => [
          styles.back,
          pressed ? { backgroundColor: colors.sunken } : null,
        ]}
      >
        <Icon name={symbols.previous} size={17} tone="navy" />
        <Text variant="strong" tone="navy" wordSafe style={styles.shrink}>
          {label}
        </Text>
      </Pressable>
    </Hoverable>
  );
}

const STEP = 40;
/** The hairline between the panes; drag (or adjust) to resize the list. */
function Divider({
  width,
  onResize,
  paused,
  gap,
}: {
  width: number;
  onResize: (width: number) => void;
  paused: boolean;
  gap: number;
}) {
  const start = useRef(width);
  const latest = useRef({ width, onResize, paused });
  useEffect(() => {
    latest.current = { width, onResize, paused };
  });
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(false);
  // The handlers read the refs on a gesture, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.paused,
      onMoveShouldSetPanResponder: (_, g) =>
        !latest.current.paused && Math.abs(g.dx) > 2,
      onPanResponderGrant: () => {
        start.current = latest.current.width;
        setActive(true);
      },
      onPanResponderMove: (_, g) => {
        if (!latest.current.paused)
          latest.current.onResize(start.current + g.dx);
      },
      onPanResponderRelease: () => setActive(false),
      onPanResponderTerminate: () => setActive(false),
    }),
  );
  if (paused)
    return (
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="List width"
        accessibilityValue={{ text: `${Math.round(width)} points` }}
        accessibilityState={{ disabled: true }}
        accessibilityHint="Resizing is paused while the device is folded. Unfold to resize the panes."
        pointerEvents="none"
        testID="split-divider"
        style={{ width: gap }}
      />
    );
  // The 1pt slot is a plain view: off iPad, Hoverable draws its child alone
  // and drops its style, and the line then drew at the split's leading edge
  // (build 61 on iPhone Duo: no line between the panes).
  return (
    <View style={styles.dividerWrap} testID="split-divider-slot">
      <Hoverable effect="none" onHover={setHovered} style={styles.grow}>
        <View
          {...responder.panHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="List width"
          accessibilityValue={{ text: `${Math.round(width)} points` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event: AccessibilityActionEvent) =>
            onResize(
              width +
                (event.nativeEvent.actionName === 'increment' ? STEP : -STEP),
            )
          }
          testID="split-divider"
          style={styles.dividerHit}
        >
          <View
            style={[
              styles.dividerLine,
              active || hovered ? styles.dividerLineActive : null,
            ]}
          />
        </View>
      </Hoverable>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row', backgroundColor: colors.paper },
  listPane: { height: '100%' },
  detailPane: { flex: 1, height: '100%' },
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  dividerWrap: { width: 1, zIndex: 2 },
  dividerHit: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -8,
    width: 17,
    alignItems: 'center',
  },
  dividerLine: {
    width: hairline,
    height: '100%',
    backgroundColor: colors.dividerDefault,
  },
  dividerLineActive: { width: 3, backgroundColor: colors.navy },
  paneBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    marginBottom: -rhythm.tight,
  },
  backWrap: { flexShrink: 1, alignSelf: 'flex-start' },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.line,
    minHeight: minimumTarget,
    paddingHorizontal: rhythm.tight,
    marginHorizontal: -rhythm.tight,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
  },
});
