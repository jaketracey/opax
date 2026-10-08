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
import { useFocusEffect } from 'expo-router';
import {
  Hoverable,
  RegionProvider,
  splitPane,
  useLayout,
  useMeasuredRegion,
} from './adaptive';
import { useAccessibilitySize } from './accessibility';
import { Icon, type SFSymbol } from './icon';
import { useKeyCommand } from './keyboard';
import { Heading, Text } from './text';
import {
  accents,
  colors,
  hairline,
  minimumTarget,
  rhythm,
  type Accent,
} from './tokens';

/**
 * The detail pane's own small stack: the selected item first, then what was
 * opened from it inside the pane ("Read the bill text"). Screens drawn in a
 * pane read it with `useSplitPane()`; outside a pane it is null and they
 * push routes as they always have.
 */
export interface SplitPane<T> {
  /** Opens an entry in the pane, above the current one. */
  push: (entry: T) => void;
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

// List widths survive remounts (a tab switch, a rotation through compact).
const savedWidths = new Map<string, number>();

export interface SplitLayoutProps<T> {
  /** Remembers this split's list width. */
  id: string;
  /** The list pane. On compact width it is the whole screen. */
  list: ReactNode;
  /** The selected item, or null for the empty state. */
  selected: T | null;
  onSelect: (entry: T | null) => void;
  /** Draws an entry in the detail pane (the selection or a pushed entry). */
  renderDetail: (entry: T) => ReactNode;
  entryKey: (entry: T) => string;
  /** The Back label for an entry below the top one ("Bill"). */
  entryTitle?: (entry: T) => string;
  /** Trailing actions in the pane bar (Share). */
  detailActions?: (entry: T) => ReactNode;
  /** The calm placeholder while nothing is selected (`SplitEmpty`). */
  empty: ReactNode;
  /**
   * Keyboard selection: the list's keys in order. Up and Down move the
   * selection while the split is on screen and no field has focus; Escape
   * clears it.
   */
  keys?: readonly string[];
  /** Turns a key from `keys` into an entry to select. */
  entryForKey?: (key: string) => T;
  testID?: string;
}

/**
 * A list pane beside a detail pane on regular width (iPad, 700pt and up),
 * with a hairline divider that drags to resize the list (300–440pt). On
 * compact width it renders the list alone and the screen pushes its detail
 * route as before: check `useLayout().regular` to choose between `onSelect`
 * and `router.push`.
 */
export function SplitLayout<T>({
  id,
  list,
  selected,
  onSelect,
  renderDetail,
  entryKey,
  entryTitle,
  detailActions,
  empty,
  keys,
  entryForKey,
  testID,
}: SplitLayoutProps<T>) {
  const layout = useLayout();
  const selectedKey = selected ? entryKey(selected) : null;
  // A new selection starts the pane's stack again: a stack belongs to the
  // selection it was opened from.
  const [paneState, setPaneState] = useState<{
    key: string | null;
    stack: T[];
  }>(() => ({ key: selectedKey, stack: selected ? [selected] : [] }));
  const fresh = selected ? [selected] : [];
  const stack = paneState.key === selectedKey ? paneState.stack : fresh;
  const setStack = (next: (current: T[]) => T[]) =>
    setPaneState((current) => ({
      key: selectedKey,
      stack: next(current.key === selectedKey ? current.stack : fresh),
    }));
  const top = stack.at(-1) ?? null;
  const pane: SplitPane<T> = {
    push: (entry) => setStack((current) => [...current, entry]),
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

  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const keyboard = layout.regular && focused && !!keys && !!entryForKey;
  const move = (step: number) => {
    if (!keys?.length || !entryForKey) return;
    const index = selectedKey
      ? keys.findIndex((key) => entryKey(entryForKey(key)) === selectedKey)
      : -1;
    const next =
      index < 0
        ? step > 0
          ? 0
          : keys.length - 1
        : Math.min(Math.max(index + step, 0), keys.length - 1);
    if (next !== index) onSelect(entryForKey(keys[next]!));
  };
  useKeyCommand('list-down', () => move(1), keyboard);
  useKeyCommand('list-up', () => move(-1), keyboard);
  useKeyCommand(
    'list-escape',
    () => (stack.length > 1 ? pane.back() : onSelect(null)),
    keyboard && !!selected,
  );

  // At accessibility sizes the list starts at 45% of the region (up to half)
  // so its rows keep whole words; a width the reader drags is kept per mode.
  const large = useAccessibilitySize();
  const widthKey = large ? `${id}:large` : id;
  const maxWidth = large
    ? Math.round(layout.width * 0.5)
    : Math.min(splitPane.max, Math.round(layout.width * 0.5));
  const clampWidth = (next: number) =>
    Math.round(Math.min(Math.max(next, splitPane.min), maxWidth));
  const [, setResized] = useState(0);
  const width = clampWidth(
    savedWidths.get(widthKey) ??
      (large ? layout.width * 0.45 : splitPane.width),
  );
  const resize = (next: number) => {
    savedWidths.set(widthKey, clampWidth(next));
    setResized((count) => count + 1);
  };
  const [onListLayout, listRegion] = useMeasuredRegion();
  const [onDetailLayout, detailRegion] = useMeasuredRegion();

  if (!layout.regular) return <>{list}</>;
  const below = stack.length > 1 ? stack.at(-2)! : null;
  const bar =
    top && (below || detailActions) ? (
      <View style={styles.paneBar} testID="split-pane-bar">
        {below ? (
          <PaneBack
            label={entryTitle?.(below) ?? 'Back'}
            onPress={() => pane.back()}
          />
        ) : null}
        <View style={styles.grow} />
        {detailActions?.(top)}
      </View>
    ) : null;
  return (
    <View style={styles.split} testID={testID}>
      <View
        style={[styles.listPane, { width }]}
        onLayout={onListLayout}
        testID={testID ? `${testID}-list` : undefined}
      >
        <RegionProvider value={listRegion}>{list}</RegionProvider>
      </View>
      <Divider width={width} onResize={resize} />
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
        <Icon name="chevron.left" size={17} tone="navy" />
        <Text variant="control" tone="navy" wordSafe style={styles.shrink}>
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
}: {
  width: number;
  onResize: (width: number) => void;
}) {
  const start = useRef(width);
  const latest = useRef({ width, onResize });
  useEffect(() => {
    latest.current = { width, onResize };
  });
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(false);
  // The handlers read the refs on a gesture, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2,
      onPanResponderGrant: () => {
        start.current = latest.current.width;
        setActive(true);
      },
      onPanResponderMove: (_, g) =>
        latest.current.onResize(start.current + g.dx),
      onPanResponderRelease: () => setActive(false),
      onPanResponderTerminate: () => setActive(false),
    }),
  );
  return (
    <Hoverable effect="none" onHover={setHovered} style={styles.dividerWrap}>
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
  );
}

/**
 * The detail pane with nothing selected: a quiet symbol on its category's
 * wash, a serif line and one sentence. No instructions beyond that.
 */
export function SplitEmpty({
  icon,
  title,
  message,
  accent = 'people',
  testID,
}: {
  icon: SFSymbol;
  title: string;
  message?: string;
  accent?: Accent;
  testID?: string;
}) {
  const tone = accents[accent];
  return (
    <View style={styles.empty} testID={testID}>
      <View style={[styles.emptyMark, { backgroundColor: colors[tone.wash] }]}>
        <Icon name={icon} size={28} tone={tone.ink} />
      </View>
      <Heading level={2} style={styles.center}>
        {title}
      </Heading>
      {message ? (
        <Text variant="metadata" style={styles.center}>
          {message}
        </Text>
      ) : null}
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
  dividerLineActive: { width: 3, backgroundColor: colors.bronze },
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
    borderRadius: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: rhythm.heading,
    paddingHorizontal: rhythm.section,
    paddingBottom: rhythm.section * 2,
  },
  emptyMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rhythm.tight,
  },
});
