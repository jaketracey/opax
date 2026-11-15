import { router, type Href } from 'expo-router';
import { NavigationContext } from 'expo-router/react-navigation';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLayout } from '../../design/adaptive';
import { Icon } from '../../design/icon';
import {
  requestFocus,
  useKeyCommand,
  useKeyScope,
} from '../../design/keyboard';
import { PlainPressable as Pressable } from '../../design/pressable';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import {
  colors,
  hairline,
  minimumTarget,
  radii,
  rhythm,
  textStyles,
} from '../../design/tokens';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { useAskNow, useOpenAsk } from '../ask/open';
import { openSuggestedPerson } from '../search/navigation';
import { useRecentSearches } from '../search/recent';
import { askDraft, asksAsTyped } from '../search/recovery';
import { useReportSearch } from '../search/ReportResults';
import { scopeMenuAt } from '../search/ScopeBar';
import { capQuery } from '../search/scopes';
import { useSearchSources } from '../search/sources';
import {
  flatItems,
  quickSections,
  suggestionAnnouncement,
  type QuickAction,
  type QuickItem,
  type QuickSection,
} from './items';

export const WIDE_SEARCH_PLACEHOLDER = 'Search people, bills, topics';
const FIELD_WIDTH = 340;
const PANEL_WIDTH = 420;
const PANEL_GAP = 6;

/**
 * Today on regular width (iPad, the unfolded iPhone Duo): a search field at
 * the masthead's top trailing corner, directly under the large title's band,
 * its trailing edge on the content column. Compact windows draw nothing: a
 * phone's Today is unchanged.
 *
 * It is not level with the title itself: the native navigation bar takes
 * every touch in the large title's band (iPadOS 26.3, measured 15 Nov with
 * a pressable drawn there), so a field there shows but cannot be tapped.
 *
 * The field is absolute and of a fixed size, so it is in its place on the
 * first frame and nothing on Today moves for it. Its dropdown is an overlay
 * anchored to it. Nothing is read until the field is first focused; then
 * the Search tab's own cached sources, ranking and recents answer.
 */
export function WideSearch() {
  const layout = useLayout();
  if (!layout.regular) return null;
  return <WideSearchField columnWidth={layout.width} />;
}

function useScreenFocused() {
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!navigation) return () => {};
      const focus = navigation.addListener('focus', listener);
      const blur = navigation.addListener('blur', listener);
      return () => {
        focus();
        blur();
      };
    },
    [navigation],
  );
  return useSyncExternalStore(subscribe, () => navigation?.isFocused() ?? true);
}

function WideSearchField({ columnWidth }: { columnWidth: number }) {
  const window = useWindowDimensions();
  const input = useRef<TextInput>(null);
  const anchor = useRef<View>(null);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  // Nothing is read for the dropdown before the field is first used.
  const [armed, setArmed] = useState(false);
  // Escape or a tap outside closes the panel; typing opens it again.
  const [dismissed, setDismissed] = useState(false);
  const screenFocused = useScreenFocused();
  const submitRef = useRef<() => void>(() => undefined);
  const width = Math.min(FIELD_WIDTH, Math.round(columnWidth * 0.42));

  // Cmd-F: this field, when it is on screen; scrolled away, Search as before.
  useKeyCommand(
    'find',
    () => {
      const seen: { y?: number; height?: number } = {};
      anchor.current?.measureInWindow?.((_x, y, _w, height) => {
        seen.y = y;
        seen.height = height;
      });
      const hidden =
        seen.y !== undefined &&
        Number.isFinite(seen.y) &&
        (seen.y < 0 || seen.y + (seen.height ?? 0) > window.height);
      if (hidden) {
        requestFocus('search');
        router.navigate('/search' as Href);
      } else input.current?.focus();
    },
    screenFocused,
  );
  const close = () => {
    setDismissed(true);
    input.current?.blur();
  };
  const reset = () => {
    setText('');
    setDismissed(false);
    input.current?.blur();
    Keyboard.dismiss();
  };
  const open = focused && !dismissed && armed;
  return (
    <View
      style={styles.place}
      pointerEvents="box-none"
      testID="today-wide-search"
    >
      <View ref={anchor} style={{ width }} collapsable={false}>
        <View style={styles.field}>
          <Icon name={symbols.search} size={18} tone="inkSoft" maxScale={1.3} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={(next) => {
              setText(next);
              setDismissed(false);
            }}
            onFocus={() => {
              setArmed(true);
              setFocused(true);
              setDismissed(false);
            }}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => submitRef.current()}
            accessibilityLabel="Search"
            accessibilityHint="Suggestions appear below as you type"
            accessibilityState={{ expanded: open }}
            placeholder={WIDE_SEARCH_PLACEHOLDER}
            placeholderTextColor={colors.inkSoft}
            returnKeyType="search"
            submitBehavior="submit"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            maxLength={100}
            maxFontSizeMultiplier={1.5}
            style={styles.input}
            testID="today-wide-search-input"
          />
        </View>
        {armed ? (
          <WideSearchPanel
            q={text}
            open={open}
            fieldFocused={focused}
            width={Math.max(width, Math.min(PANEL_WIDTH, columnWidth))}
            submitRef={submitRef}
            onClose={close}
            onEscape={() => setDismissed(true)}
            onGo={reset}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The dropdown: the sources, recents and report typeahead the Search tab
 * uses, drawn as one list in a panel under the field. An overlay: it takes
 * no room in Today's flow.
 */
function WideSearchPanel({
  q,
  open,
  fieldFocused,
  width,
  submitRef,
  onClose,
  onEscape,
  onGo,
}: {
  q: string;
  open: boolean;
  fieldFocused: boolean;
  width: number;
  /** The field's Return key runs this: the selection, else the words. */
  submitRef: { current: () => void };
  onClose: () => void;
  onEscape: () => void;
  /** A destination was chosen: clear the field and put the keyboard away. */
  onGo: () => void;
}) {
  const window = useWindowDimensions();
  const headerBottom = useHeaderBottom();
  const ax3 = scopeMenuAt(window.fontScale);
  const { sources } = useSearchSources();
  const recent = useRecentSearches();
  const reports = useReportSearch(q, true, open);
  const openAsk = useOpenAsk();
  const askNow = useAskNow();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(0);
  const list = useRef<ScrollView>(null);
  const [rows] = useState(() => new Map<string, RowPlace>());
  const viewport = useRef({ y: 0, height: 0 });

  const reportRows =
    reports?.status === 'ready' ? reports.result.data.results : undefined;
  const sections = useMemo(
    () =>
      quickSections({
        q,
        sources,
        recents: recent.items,
        reports: reportRows,
        perGroup: ax3 ? 1 : 3,
      }),
    [q, sources, recent.items, reportRows, ax3],
  );
  const items = useMemo(() => flatItems(sections), [sections]);
  const shown = open && items.length > 0;
  const active = items.find((item) => item.key === activeKey) ?? null;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (event) =>
      setKeyboard(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const run = (action: QuickAction) => {
    onGo();
    switch (action.kind) {
      case 'route':
        router.push(action.route);
        return;
      case 'person':
        void openSuggestedPerson(action.name).catch(() => undefined);
        return;
      case 'search':
        // The Search tab submits it as typed: it enters Recent there, on
        // this device, once it has found something.
        router.navigate({
          pathname: '/search',
          params: { q: capQuery(action.q), scope: action.scope, typed: '1' },
        } as Href);
        return;
      case 'ask': {
        const question = askDraft(action.q);
        if (asksAsTyped(action.q)) askNow({ question });
        else openAsk({ question });
      }
    }
  };
  useEffect(() => {
    submitRef.current = () => {
      if (shown && active) run(active.action);
      else if (q.trim()) run({ kind: 'search', q: q.trim(), scope: 'all' });
    };
  });

  const move = (by: number) => {
    if (!items.length) return;
    const index = active ? items.indexOf(active) : -1;
    const next =
      items[
        index < 0
          ? by > 0
            ? 0
            : items.length - 1
          : (index + by + items.length) % items.length
      ]!;
    setActiveKey(next.key);
    const place = rows.get(next.key);
    if (!place) return;
    const top = place.section.current + place.y;
    const { y, height } = viewport.current;
    if (top < y) list.current?.scrollTo({ y: top, animated: false });
    else if (top + place.height > y + height)
      list.current?.scrollTo({
        y: top + place.height - height,
        animated: false,
      });
  };
  // Arrows belong to the field's caret until the panel shows; then they move
  // through it, and Escape closes it. Return stays the field's own key.
  useKeyScope(
    [
      {
        id: 'list-down',
        input: 'down',
        modifiers: [],
        title: 'Next suggestion',
        priority: true,
        run: () => move(1),
      },
      {
        id: 'list-up',
        input: 'up',
        modifiers: [],
        title: 'Previous suggestion',
        priority: true,
        run: () => move(-1),
      },
      {
        id: 'list-escape',
        input: 'escape',
        modifiers: [],
        title: 'Close suggestions',
        run: onEscape,
      },
    ],
    shown,
  );
  useKeyCommand('list-escape', onClose, fieldFocused && !shown);

  // VoiceOver hears how many suggestions there are, and their groups.
  const announcement = shown ? suggestionAnnouncement(sections) : null;
  useEffect(() => {
    if (!announcement) return;
    const timer = setTimeout(
      () => AccessibilityInfo.announceForAccessibility(announcement),
      400,
    );
    return () => clearTimeout(timer);
  }, [announcement]);

  if (!shown) return null;
  // From the panel's top edge to the keyboard (or the window's foot).
  const room =
    window.height -
    keyboard -
    (headerBottom + rhythm.block + minimumTarget + PANEL_GAP) -
    rhythm.block;
  return (
    <>
      {/* a11y-ok(pressable-role): the tap-outside scrim. VoiceOver closes
          the panel with the escape gesture (onAccessibilityEscape below)
          and the keyboard with Escape. */}
      <Pressable
        feedback="none"
        accessible={false}
        importantForAccessibility="no"
        onPress={onClose}
        style={styles.backdrop}
        testID="today-wide-search-backdrop"
      />
      <View
        style={[styles.panel, { width }]}
        onAccessibilityEscape={onClose}
        testID="today-wide-search-panel"
      >
        <ScrollView
          style={[styles.clip, { maxHeight: Math.max(180, room) }]}
          ref={list}
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => {
            viewport.current.y = event.nativeEvent.contentOffset.y;
          }}
          onLayout={(event) => {
            viewport.current.height = event.nativeEvent.layout.height;
          }}
          scrollEventThrottle={32}
          contentContainerStyle={styles.list}
        >
          {sections.map((section) => (
            <PanelSection
              key={section.key}
              section={section}
              activeKey={active?.key ?? null}
              rows={rows}
              onRun={run}
            />
          ))}
        </ScrollView>
      </View>
    </>
  );
}

/** A row's place in the list: its section's top and its own offset in it. */
type RowPlace = { section: { current: number }; y: number; height: number };

function PanelSection({
  section,
  activeKey,
  rows,
  onRun,
}: {
  section: QuickSection;
  activeKey: string | null;
  rows: Map<string, RowPlace>;
  onRun: (action: QuickAction) => void;
}) {
  const top = useRef(0);
  return (
    <View
      onLayout={(event) => {
        top.current = event.nativeEvent.layout.y;
      }}
      testID={`today-wide-search-group-${section.key}`}
    >
      {section.label ? (
        <Text
          variant="groupHeader"
          accessibilityRole="header"
          style={styles.header}
        >
          {section.label}
        </Text>
      ) : null}
      {section.items.map((item) => (
        <PanelRow
          key={item.key}
          item={item}
          active={item.key === activeKey}
          onLayout={(y, height) =>
            rows.set(item.key, { section: top, y, height })
          }
          onPress={() => onRun(item.action)}
        />
      ))}
    </View>
  );
}

function PanelRow({
  item,
  active,
  onLayout,
  onPress,
}: {
  item: QuickItem;
  active: boolean;
  onLayout: (y: number, height: number) => void;
  onPress: () => void;
}) {
  return (
    <Pressable
      feedback="none"
      accessible
      accessibilityRole="button"
      accessibilityLabel={[item.title, item.secondary, item.type]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onLayout={(event) =>
        onLayout(event.nativeEvent.layout.y, event.nativeEvent.layout.height)
      }
      style={({ pressed }) => [
        styles.row,
        active || pressed ? styles.rowActive : null,
      ]}
      testID={`today-wide-search-row-${item.key}`}
    >
      <Icon name={item.symbol} size={18} tone="inkSoft" maxScale={1.5} />
      <View style={styles.rowText}>
        <Text wordSafe variant="body">
          {item.title}
        </Text>
        {item.secondary ? (
          <Text wordSafe variant="secondary">
            {item.secondary}
          </Text>
        ) : null}
      </View>
      <Text variant="secondary" maxFontSizeMultiplier={1.5}>
        {item.type}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // On the masthead's top edge, its trailing edge on the content column.
  place: { position: 'absolute', top: 0, right: 0 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingLeft: rhythm.row,
    paddingRight: rhythm.tight,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderColor: colors.dividerSubtle,
    backgroundColor: colors.raised,
  },
  input: {
    ...textStyles.body,
    flex: 1,
    minWidth: 0,
    paddingVertical: rhythm.tight,
    color: colors.ink,
  },
  // Any tap outside the field and the panel, anywhere on Today.
  backdrop: {
    position: 'absolute',
    top: -4000,
    left: -4000,
    width: 8000,
    height: 8000,
    zIndex: -1,
  },
  panel: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: PANEL_GAP,
    backgroundColor: colors.raised,
    borderRadius: radii.tile,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderColor: colors.dividerSubtle,
    shadowColor: colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  // The list is clipped to the panel's corners; the panel keeps its shadow.
  clip: { borderRadius: radii.tile - hairline, borderCurve: 'continuous' },
  list: { paddingVertical: rhythm.tight },
  header: {
    paddingHorizontal: rhythm.block,
    paddingTop: rhythm.row,
    paddingBottom: rhythm.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.row,
    minHeight: minimumTarget,
    paddingHorizontal: rhythm.block,
    paddingVertical: rhythm.tight,
  },
  rowActive: { backgroundColor: colors.navyWash },
  rowText: { flex: 1, minWidth: 0 },
});
