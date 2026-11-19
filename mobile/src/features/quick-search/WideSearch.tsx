import { router, type Href, type NativeStackHeaderItem } from 'expo-router';
import { NavigationContext } from 'expo-router/react-navigation';
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
import { useBoldText } from '../../design/accessibility';
import { isPad, sizeClassFor, useLayout } from '../../design/adaptive';
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
  hairline,
  minimumTarget,
  radii,
  rhythm,
  textStyles,
} from '../../design/tokens';
import { makeStyles, useColors } from '../../design/use-colors';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { headerItems, rootHeaderItems } from '../../navigation/chrome';
import { RouteOptions } from '../../navigation/preview';
import { useAccount } from '../account/store';
import { frameOf } from '../money/map/measure';
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
import { quickSearch, useQuickSearch } from './store';

export const WIDE_SEARCH_PLACEHOLDER = 'Search people, bills, topics';
/**
 * The field's words, longest first, each with its drawn width in ems of the
 * field's type (measured wide, so a form that is chosen is never cut). The
 * last is drawn where nothing longer fits.
 */
const PLACEHOLDERS: readonly (readonly [words: string, ems: number])[] = [
  [WIDE_SEARCH_PLACEHOLDER, 13.5],
  ['Search OPAX', 6.5],
  ['Search', 3.5],
];
/** The field's type stops growing here (the input's own cap). */
const FIELD_TEXT_SCALE_CAP = 1.5;
/** Bold Text steps the bundled face up a weight: its words run wider. */
const BOLD_WIDTH = 1.06;
/**
 * The longest form of the placeholder that fits the field's one line. The
 * bar field on a 13-inch iPad is 206 pt, about 160 pt of it for words: the
 * full ones were cut at the field's edge with no ellipsis ("Search people,
 * bills, '", build 81 sweep), at every text size. `room` is the width of
 * the text input itself.
 */
export function widePlaceholder({
  room,
  fontScale,
  bold = false,
}: {
  room: number;
  fontScale: number;
  bold?: boolean;
}): string {
  const em =
    textStyles.body.fontSize *
    Math.min(Math.max(fontScale, 1), FIELD_TEXT_SCALE_CAP) *
    (bold ? BOLD_WIDTH : 1);
  const fits = PLACEHOLDERS.find(([, ems]) => ems * em <= room);
  return (fits ?? PLACEHOLDERS.at(-1)!)[0];
}
/**
 * The text input's width before it can be read: the capsule less its
 * padding, its border, the symbol and the gap after it. Only a stand-in:
 * the input's own width is read before the first frame is painted
 * (SearchInput), so the words never change after it.
 */
export function wideFieldRoomEstimate(width: number, fontScale: number) {
  return (
    width -
    rhythm.row -
    rhythm.tight -
    2 * hairline -
    Math.round(18 * Math.min(Math.max(fontScale, 1), 1.3)) -
    rhythm.tight
  );
}
const FIELD_WIDTH = 340;
const BAR_FIELD_WIDTH = 300;
const BAR_FIELD_MIN = 180;
const PANEL_WIDTH = 420;
const PANEL_GAP = 6;

/**
 * The width of the field as a bar item, or 0 when the bar has no room for
 * it. iPad only: the bar row is shared with the floating tab bar (about
 * 420 pt, centred) and the account button, so each side of the tabs has
 * `(side - 420) / 2`, less the button and its margins.
 *
 * `side` is the window's shorter side, so the item is one width in both
 * orientations. Sized from the current width it was 300 pt in landscape and
 * 206 pt in portrait on a 13-inch iPad, and on turning back to portrait
 * UIKit collapsed the bar's items into its overflow button before the
 * narrower width arrived: the field was gone (iPadOS 26.3 sim, 15 Nov). A
 * 13-inch iPad has about 206 pt; an 11-inch about 107 pt, too little, and
 * Today keeps the masthead field in both orientations. An iPhone, the
 * unfolded Duo included, never draws the bar item: beside its vertical bar
 * the items sit on the rail.
 */
export function barSearchWidth(
  width: number,
  height: number,
  pad = isPad,
): number {
  if (!pad || sizeClassFor(width, 'pad') !== 'regular') return 0;
  const room = Math.floor((Math.min(width, height) - 420) / 2 - 100);
  return room >= BAR_FIELD_MIN ? Math.min(BAR_FIELD_WIDTH, room) : 0;
}
export function useBarSearchWidth(): number {
  const window = useWindowDimensions();
  return barSearchWidth(window.width, window.height);
}

/**
 * Today on regular width (iPad, the unfolded iPhone Duo) carries a search
 * field. Where the bar has room it is Today's own bar item
 * (`todayBarSearchItem`, with `WideSearchBar` on the page for its dropdown).
 * Otherwise it is this: the masthead's top trailing corner, directly under
 * the large title's band, its trailing edge on the content column. Compact
 * windows draw nothing: a phone's Today is unchanged.
 *
 * The masthead field is not level with the title itself: the native
 * navigation bar takes every touch in the large title's band (iPadOS 26.3,
 * measured 15 Nov with a pressable drawn there), so a field there shows but
 * cannot be tapped.
 *
 * The field is absolute and of a fixed size, so it is in its place on the
 * first frame and nothing on Today moves for it. Its dropdown is an overlay
 * anchored to it. Nothing is read until the field is first focused; then
 * the Search tab's own cached sources, ranking and recents answer.
 */
export function WideSearch() {
  const layout = useLayout();
  const bar = useBarSearchWidth();
  // Today leaving the screen tree takes the words and the dropdown with it.
  useEffect(() => () => quickSearch.reset(), []);
  if (!layout.regular || bar) return null;
  return <MastheadSearch columnWidth={layout.width} />;
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

const closePanel = () => {
  quickSearch.set({ dismissed: true });
  quickSearch.input.current?.blur();
};

/** The capsule and its text field, bound to the shared state. */
function SearchInput({ width }: { width: number }) {
  const colors = useColors();
  const styles = useStyles();

  const { text, focused, armed, dismissed } = useQuickSearch();
  const open = focused && !dismissed && armed;
  const input = useRef<TextInput>(null);
  const anchor = useRef<View>(null);
  // The drawn placeholder is one line, and where the full words do not fit
  // they are cut at the field's edge, so a shorter form is drawn there. The
  // input's width is read in a layout effect, so the first painted frame
  // already has the final words. The label keeps the full words wherever
  // fewer are drawn: a screen reader hears them at every width and size.
  const { fontScale } = useWindowDimensions();
  const bold = useBoldText();
  const [room, setRoom] = useState<number | null>(null);
  // Every commit, on purpose: the input's width can change without a
  // dependency changing. It sets state only on a difference.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const frame = frameOf(input);
    if (frame && frame.width > 0 && frame.width !== room) setRoom(frame.width);
  });
  const placeholder = widePlaceholder({
    room: room ?? wideFieldRoomEstimate(width, fontScale),
    fontScale,
    bold,
  });
  // The drawn field is the store's. When the placement switches (the bar
  // item to the masthead on a rotation or a window resize) the new field
  // mounts before the old one goes, so a field leaving clears only itself,
  // and whichever leaves, no field is focused any more.
  useEffect(() => {
    const mine = { input: input.current, anchor: anchor.current };
    quickSearch.input.current = mine.input;
    quickSearch.anchor.current = mine.anchor;
    return () => {
      if (quickSearch.input.current === mine.input)
        quickSearch.input.current = null;
      if (quickSearch.anchor.current === mine.anchor)
        quickSearch.anchor.current = null;
      if (quickSearch.snapshot().focused) quickSearch.set({ focused: false });
    };
  }, []);
  return (
    <View ref={anchor} style={{ width }} collapsable={false}>
      <View style={styles.field}>
        <Icon name={symbols.search} size={18} tone="inkSoft" maxScale={1.3} />
        <TextInput
          ref={input}
          value={text}
          onChangeText={(next) =>
            quickSearch.set({ text: next, dismissed: false })
          }
          onFocus={() =>
            quickSearch.set({ armed: true, focused: true, dismissed: false })
          }
          onBlur={() => quickSearch.set({ focused: false })}
          onSubmitEditing={() => quickSearch.submit.current()}
          accessibilityLabel={
            placeholder === WIDE_SEARCH_PLACEHOLDER
              ? 'Search'
              : WIDE_SEARCH_PLACEHOLDER
          }
          accessibilityHint="Suggestions appear below as you type"
          accessibilityState={{ expanded: open }}
          placeholder={placeholder}
          placeholderTextColor={colors.inkSoft}
          returnKeyType="search"
          submitBehavior="submit"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          maxLength={100}
          maxFontSizeMultiplier={FIELD_TEXT_SCALE_CAP}
          style={styles.input}
          testID="today-wide-search-input"
        />
      </View>
    </View>
  );
}

function MastheadSearch({ columnWidth }: { columnWidth: number }) {
  const styles = useStyles();

  const window = useWindowDimensions();
  const headerBottom = useHeaderBottom();
  const { armed } = useQuickSearch();
  const screenFocused = useScreenFocused();
  const width = Math.min(FIELD_WIDTH, Math.round(columnWidth * 0.42));

  // Cmd-F: this field, when it is on screen; scrolled away, Search as before.
  useKeyCommand(
    'find',
    () => {
      const seen: { y?: number; height?: number } = {};
      quickSearch.anchor.current?.measureInWindow?.((_x, y, _w, height) => {
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
      } else quickSearch.input.current?.focus();
    },
    screenFocused,
  );
  return (
    <View
      style={styles.place}
      pointerEvents="box-none"
      testID="today-wide-search"
    >
      <View>
        <SearchInput width={width} />
        {armed ? (
          <WideSearchPanel
            width={Math.max(width, Math.min(PANEL_WIDTH, columnWidth))}
            top={headerBottom + rhythm.block + minimumTarget + PANEL_GAP}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The field as Today's own bar item, for `unstable_headerRightItems`, or
 * nothing when the bar has no room (`barSearchWidth`).
 */
export function todayBarSearchItem(
  width: number,
): NativeStackHeaderItem | undefined {
  return width
    ? {
        type: 'custom',
        element: <BarSearchField width={width} />,
        hidesSharedBackground: true,
      }
    : undefined;
}
function BarSearchField({ width }: { width: number }) {
  return (
    <View testID="today-bar-search">
      <SearchInput width={width} />
    </View>
  );
}

/**
 * In Today's masthead slot, beside `WideSearch`: on iPad it sets Today's
 * bar items (the field, when the bar has room, then the root's own), and
 * holds the bar field's dropdown and its Cmd-F. Draws nothing itself; the
 * dropdown is an overlay placed under the field's measured place.
 */
export function WideSearchBar() {
  return isPad ? <PadBar /> : null;
}
function PadBar() {
  const width = useBarSearchWidth();
  const signedIn = !!useAccount().status?.signedIn;
  const item = useMemo(() => todayBarSearchItem(width), [width]);
  // Today's own bar items: the field, when there is room, then the root's.
  const options = useMemo(
    () =>
      headerItems(() => [
        ...(item ? [item] : []),
        ...rootHeaderItems({ segment: '(today)', signedIn }),
      ]),
    [item, signedIn],
  );
  return (
    <>
      <RouteOptions options={options} />
      {width ? <BarPanelHost fieldWidth={width} /> : null}
    </>
  );
}
function BarPanelHost({ fieldWidth }: { fieldWidth: number }) {
  const styles = useStyles();

  const window = useWindowDimensions();
  const { armed } = useQuickSearch();
  const screenFocused = useScreenFocused();
  const host = useRef<View>(null);
  const width = Math.max(fieldWidth, Math.min(PANEL_WIDTH, window.width - 32));
  // Until the field is measured (and where it cannot be): the masthead's
  // trailing corner, under the bar.
  const column = useLayout().width;
  const [measured, setPlace] = useState<{
    top: number;
    left: number;
    windowTop: number;
    /** The window it was measured in: a place is good for that size only. */
    window: string;
  } | null>(null);
  const size = `${window.width}x${window.height}`;
  const place =
    measured?.window === size
      ? measured
      : { top: 0, left: column - width, windowTop: 80 };
  // A rotation or a window resize moves the bar field: the open dropdown
  // closes rather than stay where the field was, and the next focus
  // measures its place again.
  const lastSize = useRef(size);
  useEffect(() => {
    if (lastSize.current === size) return;
    lastSize.current = size;
    if (quickSearch.snapshot().focused) closePanel();
  }, [size]);
  useKeyCommand(
    'find',
    () => quickSearch.input.current?.focus(),
    screenFocused,
  );
  // The field is in the bar and this host in the page's scroll content, so
  // the panel's place is the difference of the two, read as the field takes
  // focus. A drag on the page puts the keyboard away and closes the panel
  // (Screen's keyboardDismissMode), so the place never goes stale.
  useEffect(() => {
    let was = quickSearch.snapshot().focused;
    return quickSearch.subscribe(() => {
      const now = quickSearch.snapshot().focused;
      if (now === was) return;
      was = now;
      if (!now) return;
      const field: { x?: number; y?: number; w?: number; h?: number } = {};
      quickSearch.anchor.current?.measureInWindow?.((x, y, w, h) => {
        Object.assign(field, { x, y, w, h });
      });
      const page: { x?: number; y?: number } = {};
      host.current?.measureInWindow?.((x, y) => {
        Object.assign(page, { x, y });
      });
      const values = [field.x, field.y, field.w, field.h, page.x, page.y];
      if (!values.every((v) => typeof v === 'number' && Number.isFinite(v)))
        return;
      if (!field.w || !field.h) return;
      const windowTop = field.y! + field.h + PANEL_GAP;
      setPlace({
        top: windowTop - page.y!,
        left: field.x! + field.w - width - page.x!,
        windowTop,
        window: size,
      });
    });
  }, [width, size]);
  return (
    <View
      ref={host}
      style={styles.host}
      pointerEvents="box-none"
      collapsable={false}
      testID="today-bar-search-host"
    >
      {armed ? (
        <WideSearchPanel
          width={width}
          top={place.windowTop}
          fixed={{
            top: place.top,
            left: place.left,
            right: undefined,
            // The measured top already includes the gap under the field.
            marginTop: 0,
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * The dropdown: the sources, recents and report typeahead the Search tab
 * uses, drawn as one list in a panel under the field. An overlay: it takes
 * no room in Today's flow.
 */
function WideSearchPanel({
  width,
  top,
  fixed,
}: {
  width: number;
  /** The panel's top edge in the window, for the room above the keyboard. */
  top: number;
  /** At this place from the host's corner, instead of under the field. */
  fixed?: { top: number; left: number; right: undefined; marginTop: 0 };
}) {
  const styles = useStyles();

  const { text: q, focused: fieldFocused, armed, dismissed } = useQuickSearch();
  const open = fieldFocused && !dismissed && armed;
  const onClose = closePanel;
  const onEscape = () => quickSearch.set({ dismissed: true });
  // A destination was chosen: clear the field and put the keyboard away.
  const onGo = () => {
    quickSearch.set({ text: '', dismissed: false });
    quickSearch.input.current?.blur();
    Keyboard.dismiss();
  };
  const window = useWindowDimensions();
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
    quickSearch.submit.current = () => {
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
  const room = window.height - keyboard - top - rhythm.block;
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
        style={[styles.panel, { width }, fixed]}
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
  const styles = useStyles();

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
  const styles = useStyles();

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

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    // The bar field's dropdown hangs from this line's leading end: the
    // masthead's top edge. It has a size: the accessibility tree drops what
    // is under a view of none (the panel was drawn but not found, 15 Nov).
    host: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
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
  }),
);
