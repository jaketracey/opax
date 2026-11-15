import {
  router,
  type Href,
  type NativeStackNavigationOptions,
  type NativeStackHeaderItem,
  type NativeStackHeaderItemMenuAction,
  type NativeStackHeaderItemMenuSubmenu,
} from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import { createElement, use, useContext } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  Text,
  ToastAndroid,
  View,
  useColorScheme,
  useWindowDimensions,
  type ColorValue,
} from 'react-native';
import { openOnWeb } from './external';
import { useSolidBar } from '../design/accessibility';
import { copy } from '../design/copy';
import { designFlags } from '../design/flags';
import { liquidGlass } from '../design/glass';
import { Icon, type SFSymbol } from '../design/icon';
import { menuTitle, plainMenuTitle } from '../design/menu-title';
import { showMenu, type MenuAction } from '../design/menu';
import type { RowMenuAction } from '../design/row-link';
import {
  colors,
  contentSizeCategory,
  interfaceFonts as fonts,
  headingFace,
  headlineSizes,
  isAccessibilityCategory,
  largeTitleSizes,
  schemeColour,
  textStyles,
} from '../design/tokens';
import { accountSnapshot } from '../features/account/store';
import { askReturnSnapshot } from '../features/ask/return';
import { voiceLinked } from '../voice/linked';
import { canShare } from './share';
import {
  RootBar,
  useVerticalBarEdge,
  type VerticalBarEdge,
} from '../../modules/opax-root-bar';

/**
 * Header styling shared by every stack, using the selected heading face
 * and system Dynamic Type. Buttons and named back buttons use the tint.
 */
/** iOS 26 and later: the system glass bar and scroll edge effects. */
export const glassBar = () => liquidGlass();

/**
 * Protect the content edge where UIKit actually places the bar. A vertical
 * bar (the iPhone Duo's folded display) moves the tab items to the side rail,
 * but the title and the search field stay at the top with no large title to
 * collapse. Its top edge follows the page too: soft at rest so the masthead
 * shows whole, hard under scrolled content, hidden behind a solid bar.
 * Phones, the unfolded Duo and iPad report 'unspecified' and keep `active`.
 *
 * The bottom edge follows the tab bar: soft where the bar is at the bottom
 * ('unspecified') and minimises over the page, hidden where UIKit has moved
 * it to a side.
 */
export function barScrollEdges(
  edge: VerticalBarEdge,
  active: 'hard' | 'soft' | 'hidden' = 'hard',
) {
  return edge === 'unspecified'
    ? { top: active, bottom: 'soft' as const }
    : {
        top: active,
        // The tab bar is on the side, so nothing sits at the bottom for a
        // soft edge to protect: left on, UIKit veiled the page's last lines
        // (Today's closing sentence was all but invisible, 1.1.5 build 84).
        bottom: 'hidden' as const,
        left: edge === 'leading' ? active : ('soft' as const),
        right: edge === 'trailing' ? active : ('soft' as const),
      };
}

/**
 * The one setting for what a tab root's bar does over scrolled content.
 * On: no blur panel, no fill and no hairline, on any root (the frosted paper
 * panel with its hard edge, b76). UIKit keeps its soft scroll edge and the
 * large title collapses to the inline one; the page itself fades into its
 * own ground under the bar (`BarFade`), because the soft edge alone left the
 * title printed over barely softened text (iOS 27). Off: the hard edge.
 * Reduce Transparency and Increase Contrast keep the solid bar either way.
 */
export const clearBars = true;

/**
 * Colour UIKit's standard and scroll-edge appearances, without inserting a
 * React headerBackground view. That view covered native large titles and back
 * indicators, and reserved an extra header-height band in sheets (wave 7).
 * Inline screens and sheets can colour both appearances.
 */
export const opaqueBar = (ground: ColorValue = colors.paper) => ({
  headerStyle: { backgroundColor: ground },
  headerLargeStyle: { backgroundColor: ground },
  headerShadowVisible: Platform.OS === 'ios',
});

/**
 * The bar of a pushed page that stays laid out below it where the stack's
 * pushed pages are otherwise clear (iOS 26, off the rail): the page's own
 * ground and no hairline, so it reads as the clear bar does. For a list
 * whose section headers pin: React Native pins them at the list's top edge,
 * which a clear bar covers, so the list must start at the bar's foot. The
 * pinned header is its own ground, and rows pass under it, not through it.
 */
export const groundBar = (ground: ColorValue = colors.paper) => ({
  ...opaqueBar(ground),
  headerShadowVisible: false,
});

/**
 * UIKit on iOS 26 hides large titles when the standard appearance has a
 * background colour or blur (react-native-screens#3100, reproduced in UIKit).
 * Keep both appearances transparent while expanded. A scroll-edge background
 * also suppresses the title, even with a transparent standard appearance.
 * The screen supplies the page ground beneath the native scroll edge.
 * Empty styles replace the navigator's opaque defaults. The edge is soft at
 * rest, where a hard edge would paint its divider. Soft alone blurs only the
 * status strip, so the title, the clock and a search field printed over page
 * text once it ran under the bar (sweep 1, item 1). `underBar` asks for
 * UIKit's hard edge, which switches without animation. It turns on from the
 * first point of scroll, the large-title collapse included (Screen compares
 * with the bar height last reported, which holds the expanded title until
 * the collapse settles), and the edge is soft again back at rest. With
 * `clearBars` no root asks for it. For
 * accessibility only, useRootBarAppearance supplies a solid native sibling
 * below the bar, preserving the large title and automatic insets.
 */
export const largeTitleBar = (
  ground: ColorValue = colors.paper,
  solid = false,
  underBar = false,
) =>
  glassBar()
    ? {
        headerStyle: {},
        headerLargeStyle: {},
        contentStyle: { backgroundColor: ground },
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        scrollEdgeEffects: barScrollEdges(
          'unspecified',
          solid ? 'hidden' : underBar ? 'hard' : 'soft',
        ),
      }
    : opaqueBar(ground);

/** Tab roots whose large title is disabled, including iPad split layouts. */
export const scrollBar = (
  ground: ColorValue = colors.paper,
  solid = false,
  edge: VerticalBarEdge = 'unspecified',
  // A vertical list without a scroll reporter retains its existing cover.
  // Reporters supply false at rest, then true from the first scroll point.
  underBar = edge !== 'unspecified',
) =>
  glassBar()
    ? solid
      ? {
          ...opaqueBar(ground),
          headerTransparent: false,
          scrollEdgeEffects: barScrollEdges(edge, 'hidden'),
        }
      : {
          ...largeTitleBar(ground),
          scrollEdgeEffects: {
            ...barScrollEdges(edge, 'soft'),
            top: underBar ? ('hard' as const) : ('soft' as const),
          },
        }
    : opaqueBar(ground);

/** Initial tab grounds, also used by roots with their own scrolling view. */
export const tabRootGround = (name: string) =>
  name === 'ask' || (name !== 'bills' && designFlags.groupedSurfaces)
    ? colors.sunken
    : colors.paper;

/**
 * Android bar text, in sp. The native bar sets its title in sp, so the
 * system's font scale (to 200%) applies once; passing the iOS Dynamic Type
 * size as well would scale it twice. With no large title on Android, the
 * bar title is the screen's title: the `heading` size, Material's title size.
 */
export const androidBar = {
  title: textStyles.sectionTitle.fontSize,
  action: textStyles.secondary.fontSize,
} as const;

/**
 * A solid ground behind an opaque bar, for a page that keeps one beside a
 * vertical bar (the map). UIKit's own bar background stops 10 pt above the
 * title band there, and the strip above it showed the system's grey.
 */
export const barBacking = (ground: ColorValue = colors.paper) => ({
  headerBackground: () =>
    createElement(View, {
      pointerEvents: 'none',
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      style: { flex: 1, backgroundColor: ground },
    }),
});

/**
 * The bar of a pushed page that does not scroll (the money map): it is laid
 * out below its bar on every layout. Where the stack's pushed pages are
 * clear off the rail (`plainClear`, `usePushedPlainClear`) the bar is the
 * page's ground with no hairline, as theirs has none. Everywhere else it is
 * the opaque bar with its hairline: before iOS 26, and with Reduce
 * Transparency or Increase Contrast on. Beside a vertical bar (`rail`) it
 * is backed in its ground, since UIKit's own bar background stops short.
 */
export const fixedPageBar = (
  plainClear: boolean,
  rail: boolean,
  ground: ColorValue = colors.paper,
) => ({
  ...(plainClear ? groundBar(ground) : opaqueBar(ground)),
  headerTransparent: false,
  ...(rail ? barBacking(ground) : {}),
});

/**
 * Whether a tab stack's pushed pages run under a clear bar: beside a vertical
 * bar on iOS 26 and later, unless Reduce Transparency or Increase Contrast
 * asks for a solid bar, as it does of the tab roots.
 */
export function useUnderRailBar(): boolean {
  return useRailBar() === 'clear';
}

/**
 * The bar of a tab stack's pushed pages beside a vertical bar (iOS 26 and
 * later): `clear`, or `solid` when Reduce Transparency or Increase Contrast
 * asks for a solid bar. A solid bar there needs its own ground (`barBacking`):
 * UIKit's bar background stops short of the top edge. Null everywhere else.
 */
export function useRailBar(): 'clear' | 'solid' | null {
  const edge = useVerticalBarEdge();
  const solid = useSolidBar();
  if (edge === 'unspecified' || !glassBar()) return null;
  return solid ? 'solid' : 'clear';
}

/**
 * The bar of a tab stack's pushed pages wherever they run under it. Beside
 * a vertical bar that is the rail's answer. On every other iOS 26 layout,
 * with `clearBars`, a pushed page takes the roots' treatment: a clear bar
 * with no colour and no hairline, and the page fades into its own ground
 * under it (Screen's `BarFade`); the solid paper bar cut rows sharp at its
 * hairline (build 82). With Reduce Transparency or Increase Contrast on,
 * off the rail, this is null: the stack's opaque bar stays, as it was.
 */
export function usePushedBar(): 'clear' | 'solid' | null {
  const rail = useRailBar();
  const solid = useSolidBar();
  if (rail) return rail;
  return clearBars && glassBar() && !solid ? 'clear' : null;
}

/**
 * What `sharedScreens` is told about the tab stack's pushed pages: false
 * (below an opaque bar), true (under the clear rail bar) or 'plain' (under
 * the clear bar of any other layout, where a solid bar needs no backing).
 */
export type UnderBar = boolean | 'plain';
export function useUnderBar(headerTransparent: boolean): UnderBar {
  const rail = useRailBar();
  return headerTransparent ? (rail ? true : 'plain') : false;
}

/**
 * A page that keeps a solid bar where its stack's pages run under a clear
 * one: its title band never folds away (a search field in the bar, a map
 * that does not scroll), so content must end at the band, and a sticky
 * section header must hold below it. `underBar` is the stack's answer
 * (`useUnderRailBar`); elsewhere this adds nothing to the route. Under the
 * clear bar of a layout without a vertical bar (`'plain'`) the bar is the
 * page's ground with no hairline (`groundBar`): no pushed page keeps one.
 */
export const solidRailBar = (
  underBar: UnderBar,
  ground: ColorValue = colors.paper,
) =>
  underBar === 'plain'
    ? { headerTransparent: false, ...groundBar(ground) }
    : underBar
      ? {
          headerTransparent: false,
          ...opaqueBar(ground),
          ...barBacking(ground),
        }
      : {};

/**
 * Whether this route's bar is the clear one of a tab stack's pushed pages
 * (see `useStackChrome` and `usePushedBar`): beside a vertical bar, and on
 * every other iOS 26 layout while no legibility setting is on. The stack's
 * descriptors are read only where that can be so: before iOS 26, and for a
 * root, the caller neither subscribes to them nor re-renders when a page
 * sets options.
 */
export function useClearRailBar(): boolean {
  const route = useContext(NavigationRouteContext);
  const verticalBar = useVerticalBarEdge() !== 'unspecified';
  const navigation = useContext(NavigationContext);
  const solid = useSolidBar();
  if (!route) return false;
  if (!verticalBar) {
    // Every other iOS 26 layout: a pushed page under the stack's clear bar
    // (`usePushedBar`). A root has its own owner, and a legibility setting
    // keeps the opaque bar.
    if (!clearBars || !glassBar() || solid) return false;
    const first = navigation?.getState()?.routes?.[0]?.key;
    if (!first || first === route.key) return false;
  }
  const options = use(DescriptorsContext)[route.key]?.options;
  // A pushed page only. A presented one owns its bar: the photo viewer is a
  // full-screen modal in the tab stack with a clear bar of its own and a
  // dark scrim under its white title, which must stay.
  return (
    options?.headerTransparent === true &&
    (!options.presentation || options.presentation === 'card')
  );
}

/**
 * Bar options for a page under the clear rail bar: no colour and no hairline.
 * UIKit paints a coloured bar from 14 pt down to the band's foot, so a paper
 * bar over the darker grouped ground was a paper band with a strip of the
 * page above it at rest (the glossary), and the bar's hairline crossed the
 * page at 24 pt once the band had folded (the electorate map, b73). The page
 * itself is the ground under a clear bar. Other keys pass through.
 */
export function clearBarStyle<T extends NativeStackNavigationOptions>(
  options: T,
): T {
  if (
    !('headerStyle' in options) &&
    !('headerLargeStyle' in options) &&
    !('headerShadowVisible' in options)
  )
    return options;
  return {
    ...options,
    ...('headerStyle' in options ? { headerStyle: {} } : {}),
    ...('headerLargeStyle' in options ? { headerLargeStyle: {} } : {}),
    headerShadowVisible: false,
  };
}

/**
 * `tabStack`: the pages pushed in a tab's stack. Beside a vertical bar (the
 * closed iPhone Duo) UIKit folds a pushed page's title band away once the
 * page scrolls, and keeps the top safe area (24 pt) as bar. An opaque bar
 * lays the page out below that strip, so the page's own heading scrolled
 * under it and was cut off, while Today, whose bar is clear, ran to the top
 * edge (b69). There these pages run under a clear bar as the tab roots do:
 * UIKit insets the scroll view below the band at rest, and the page reaches
 * the top edge once the band has gone. The top edge is soft, since a hard one
 * paints a strip of its own above the band at rest.
 * Sheets and modal stacks keep the opaque bar: a sheet's bar items sit over
 * its trailing edge, and only an opaque bar keeps the content beside them.
 * On iOS 26 every other layout does the same while no legibility setting
 * is on (`usePushedBar`): Today's clear bar and fade, on pushed pages too.
 */
export function useStackChrome({
  tabStack = false,
}: { tabStack?: boolean } = {}) {
  const { fontScale } = useWindowDimensions();
  // Bar titles resolve in the app's appearance, not the bar's (11b-3).
  const titleInk = schemeColour('ink', useColorScheme());
  const barEdge = useVerticalBarEdge();
  const railBar = useRailBar();
  const pushedBar = usePushedBar();
  const rail = tabStack && pushedBar === 'clear';
  const category = contentSizeCategory(fontScale);
  const sizes = {
    largeTitle: largeTitleSizes[category],
    title: Math.min(headlineSizes[category], headlineSizes.xxxLarge),
  };
  return {
    headerTintColor: colors.navy,
    ...(Platform.OS === 'android'
      ? { headerTitleAlign: 'left' as const, statusBarStyle: 'dark' as const }
      : {}),
    // Pushed, inline and sheet layouts reserve space for a solid native bar.
    // Tab roots and explicit large-title lists opt into translucency separately.
    // Beside a vertical bar a tab stack's pushed pages run under the bar.
    headerTransparent: rail,
    // Under the clear rail bar the stack sets no bar colour or hairline
    // either: a page with no Screen and no bar style of its own (Voting
    // record, Declared interests, Largest sources, the record lists) kept
    // the hairline, and a paper strip once the band folded.
    ...(rail ? clearBarStyle(opaqueBar()) : opaqueBar()),
    // A legibility setting keeps the solid bar on the rail too. Pages with
    // their own ground (Screen) replace this backing with one in that colour.
    ...(tabStack && railBar === 'solid' ? barBacking() : {}),
    headerTitleStyle: {
      fontFamily: textStyles.inlineTitle.fontFamily,
      fontWeight: textStyles.inlineTitle.fontWeight,
      ...(Platform.OS === 'android'
        ? { fontSize: androidBar.title }
        : headingFace === 'serif'
          ? { fontSize: sizes.title }
          : {}),
      color: titleInk,
    },
    headerLargeTitleStyle: {
      fontFamily: textStyles.largeTitle.fontFamily,
      fontWeight: textStyles.largeTitle.fontWeight,
      // Deviation from shell.md 2, line 176: the ink colour makes
      // react-native-screens build a fixed 34 pt font. The token ramp
      // stands in for UIKit's Dynamic Type scaling for both iOS faces.
      ...(Platform.OS === 'ios' || headingFace === 'serif'
        ? { fontSize: sizes.largeTitle }
        : {}),
      color: titleInk,
    },
    // Wave 2 found the soft top edge too light over serif record text: the
    // record remained readable through the title and bar buttons. Keep the
    // hard edge and matching opaque ground on record and inline screens.
    // Tab roots and sans large-title lists use the soft edge.
    // The bottom stays soft at the minimising tab bar.
    scrollEdgeEffects: {
      ...barScrollEdges(barEdge),
      top: rail ? ('soft' as const) : ('hard' as const),
    },
    headerLargeTitleEnabled: false,
    headerLargeTitleShadowVisible: false,
    headerBackButtonDisplayMode: 'default' as const,
    // Keep UIKit's own item and its automatic shortening to Back. A disabled
    // menu creates a custom back item on every native header update.
    ...(Platform.OS === 'ios'
      ? { headerBackTitle: 'Back', headerBackButtonMenuEnabled: true }
      : {}),
    contentStyle: { backgroundColor: colors.paper },
  };
}

export type TabSegment =
  | '(today)'
  | '(your-mp)'
  | '(bills)'
  | '(search)'
  | '(ask)';

const openAccount = () => router.push('/account');
const openTalk = () => router.push('/talk');

// Expo preserves extra item properties through to the native dictionary.
// RNSBarButtonItem must map testID to accessibilityIdentifier for iOS test
// selectors. identifier alone only matches items across UIKit transitions.
// Always supply label with an icon: Expo maps it to UIKit's title, which
// vertical bars and overflow menus need independently of accessibilityLabel.
export type TestableHeaderItem = NativeStackHeaderItem & { testID?: string };

/** Account is outermost. A root has room for just one feature action. */
export function rootHeaderItems(props?: {
  segment: TabSegment;
  extra?: NativeStackHeaderItem[];
  signedIn: boolean;
}): TestableHeaderItem[] {
  const signedIn = props?.signedIn ?? !!accountSnapshot().status?.signedIn;
  // AskScreen calls without props. Keep Talk reachable until w4-ask puts
  // it in the composer and removes that screen's own header options.
  const inAsk = !props || props.segment === '(ask)';
  const talk: NativeStackHeaderItem = {
    type: 'button',
    label: 'Talk',
    accessibilityLabel: 'Talk to OPAX',
    tintColor: colors.navy,
    icon: { type: 'sfSymbol', name: 'waveform' },
    onPress: openTalk,
  };
  const items: TestableHeaderItem[] = [
    {
      type: 'button',
      label: 'Account',
      accessibilityLabel: 'Account',
      testID: 'header-account',
      identifier: 'header-account',
      tintColor: colors.navy,
      icon: {
        type: 'sfSymbol',
        name: signedIn ? 'person.crop.circle.fill' : 'person.crop.circle',
      },
      onPress: openAccount,
    },
    ...(props?.extra?.slice(0, 1) ??
      ((inAsk || !designFlags.talkInAsk) && voiceLinked ? [talk] : [])),
  ];
  return Platform.OS === 'ios' ? [...items.slice(1), items[0]!] : items;
}

/**
 * Ask's way back to the page an arrival came from (journeys/ask.md 4.2): the
 * outermost leading item, drawn as the system's back item is. iOS draws the
 * chevron in its own glass; the label is the item's title, which UIKit shows
 * on a vertical bar (Duo), in overflow and in the Large Content Viewer.
 * Android draws Material's navigation icon, and system Back does the same.
 */
export function askBackItem(props: {
  name: string;
  /** The visible word ("Bill", "Today"); else the way back's own. */
  short?: string;
  onPress: () => void;
}): TestableHeaderItem {
  const short =
    props.short ??
    askReturnSnapshot()?.short ??
    // A tab's own name is already short.
    props.name;
  const labelled = askBackLabelled();
  return {
    type: 'button',
    // With room, the item reads where it goes, as the system back button
    // does ("‹ Bill", "‹ Today"); the record's long name stays in the
    // accessibility label (sweep 2 item 9). UIKit draws an item's image
    // in place of its title, so the labelled item is its title alone.
    label: labelled ? `\u2039 ${short}` : props.name,
    accessibilityLabel: `Back to ${props.name}`,
    testID: 'ask-back',
    identifier: 'ask-back',
    tintColor: colors.navy,
    ...(labelled
      ? {}
      : {
          icon: {
            type: 'sfSymbol' as const,
            name: Platform.OS === 'android' ? 'arrow.left' : 'chevron.backward',
          },
        }),
    sharesBackground: false,
    onPress: props.onPress,
  };
}

/** Narrower than this, Conversations, New and Account leave no room for a word. */
export const ASK_BACK_LABEL_MIN_WIDTH = 381;

/**
 * Whether Ask's back item shows its word: iOS only (Android draws Material's
 * navigation icon), below accessibility sizes, on a window wider than 380.
 * At AX sizes and on a narrow window it is the chevron alone.
 */
export function askBackLabelled(
  window: { width: number; fontScale: number } = Dimensions.get('window'),
) {
  return (
    Platform.OS === 'ios' &&
    !isAccessibilityCategory(window.fontScale) &&
    window.width >= ASK_BACK_LABEL_MIN_WIDTH
  );
}

export function askHeaderItems(props: {
  canStartNew: boolean;
  historyEnabled: boolean;
  signedIn: boolean;
  onNew: () => void;
  onHistory: () => void;
  /** The page an arrival from another tab came from. */
  back?: { name: string; onPress: () => void } | null;
}) {
  const history: NativeStackHeaderItem = {
    type: 'button',
    label: 'Your conversations',
    accessibilityLabel: 'Your conversations',
    icon: { type: 'sfSymbol', name: 'clock' },
    disabled: !props.historyEnabled,
    onPress: props.onHistory,
  };
  const compose: NativeStackHeaderItem = {
    type: 'button',
    label: 'New question',
    accessibilityLabel: 'New question',
    icon: { type: 'sfSymbol', name: 'square.and.pencil' },
    disabled: !props.canStartNew,
    onPress: props.onNew,
  };
  const leading: TestableHeaderItem[] = props.back
    ? [askBackItem(props.back), history]
    : [history];
  return {
    unstable_headerLeftItems: () => leading,
    ...headerItems(() =>
      rootHeaderItems({
        segment: '(ask)',
        signedIn: props.signedIn,
        extra: [compose],
      }),
    ),
    ...(Platform.OS === 'android'
      ? { headerLeft: () => androidHeaderBar(leading) }
      : {}),
  };
}

type NativeMenuRow =
  | NativeStackHeaderItemMenuAction
  | NativeStackHeaderItemMenuSubmenu;
function nativeMenuRows(items: RowMenuAction[]): NativeMenuRow[] {
  return items
    .filter((item) => canShare || item.title !== 'Share')
    .map((item) =>
      'items' in item
        ? {
            type: 'submenu',
            label: menuTitle(item.title),
            ...(item.symbol
              ? { icon: { type: 'sfSymbol' as const, name: item.symbol } }
              : {}),
            inline: item.inline,
            items: nativeMenuRows(item.items),
          }
        : {
            type: 'action',
            label: menuTitle(item.title),
            ...(item.symbol
              ? { icon: { type: 'sfSymbol' as const, name: item.symbol } }
              : {}),
            destructive: item.destructive,
            onPress: item.onPress,
          },
    );
}
/** The final action in each More menu opens the public site explicitly. */
export function openOnOpaxItem(
  path = '/',
  title = 'OPAX',
): NativeStackHeaderItemMenuAction {
  return {
    type: 'action',
    label: menuTitle(copy.openOnWeb),
    icon: { type: 'sfSymbol', name: 'arrow.up.right.square' },
    onPress: () => void openOnWeb(path, title, { preferNative: false }),
  };
}

function moreMenuRows(
  items: RowMenuAction[],
  path: string,
  name: string,
): NativeMenuRow[] {
  let web: NativeStackHeaderItemMenuAction | undefined;
  const collect = (rows: NativeMenuRow[]): NativeMenuRow[] =>
    rows.flatMap((row): NativeMenuRow[] => {
      if (
        row.type === 'action' &&
        plainMenuTitle(row.label) === copy.openOnWeb
      ) {
        web = row;
        return [];
      }
      if (row.type === 'submenu') {
        const children = collect(row.items);
        return children.length ? [{ ...row, items: children }] : [];
      }
      return [row];
    });
  const rows = collect(nativeMenuRows(items));
  return [...rows, web ?? openOnOpaxItem(path, name)];
}

export function pageMenu(props: {
  name: string;
  webPath?: string;
  items: RowMenuAction[];
}): TestableHeaderItem {
  return {
    type: 'menu',
    label: 'More',
    testID: 'header-more',
    identifier: 'header-more',
    accessibilityLabel: `More for ${props.name}`,
    icon: { type: 'sfSymbol', name: 'ellipsis.circle' },
    menu: {
      items: moreMenuRows(props.items, props.webPath ?? '/', props.name),
    },
  };
}
export function shareItem(props: {
  name: string;
  onPress: () => void;
}): NativeStackHeaderItem {
  return {
    type: 'button',
    label: 'Share',
    accessibilityLabel: `Share ${props.name}`,
    icon: { type: 'sfSymbol', name: 'square.and.arrow.up' },
    onPress: props.onPress,
  };
}
export function filtersItem(props: {
  active: boolean;
  href: Href;
}): TestableHeaderItem {
  return {
    type: 'button',
    label: 'Filters',
    testID: 'header-filters',
    identifier: 'header-filters',
    accessibilityLabel: props.active ? 'Filters, on' : 'Filters',
    icon: {
      type: 'sfSymbol',
      name: props.active
        ? 'line.3.horizontal.decrease.circle.fill'
        : 'line.3.horizontal.decrease.circle',
    },
    onPress: () => router.push(props.href),
  };
}
export function pageItems(props: {
  name: string;
  share?: () => void;
  filters?: { active: boolean; href: Href };
  menu: RowMenuAction[];
}): () => NativeStackHeaderItem[] {
  // iOS 27 renders these in visual order: the last item is rightmost.
  return () => [
    ...(props.filters
      ? [filtersItem(props.filters)]
      : props.share && canShare
        ? [shareItem({ name: props.name, onPress: props.share })]
        : []),
    pageMenu({ name: props.name, items: props.menu }),
  ];
}

type HeaderMenu = Extract<NativeStackHeaderItem, { type: 'menu' }>;

/**
 * A bar menu's rows as an Android sheet; a titled submenu opens its own
 * sheet. An inline section (iOS draws it between separators, untitled, as
 * Your MP's "Forget my electorate") has no row of its own: its items join
 * this sheet in place, and an action keeps its red, dimmed or ticked state.
 * The sheet draws no section headings, so a titled inline section (Cite)
 * joins it too: its items name what they copy ("Copy APA 7"), as Android's
 * record and Ask row menus already list them.
 */
function menuActions(items: HeaderMenu['menu']['items']): MenuAction[] {
  return items
    .filter((item) => !('hidden' in item && item.hidden))
    .flatMap((item): MenuAction[] =>
      item.type === 'submenu'
        ? item.inline
          ? menuActions(item.items)
          : [
              {
                title: item.label,
                onPress: () => {
                  if (Platform.OS === 'android')
                    showMenu(item.label, menuActions(item.items));
                },
              },
            ]
        : [
            {
              title: item.label,
              onPress: item.onPress,
              ...(item.destructive ? { destructive: true } : {}),
              ...(item.disabled ? { disabled: true } : {}),
              ...(item.state === 'on' ? { selected: true } : {}),
            },
          ],
    );
}

/**
 * Android app-bar actions use Material symbols, 48dp targets and ripples.
 * Keep a word for actions without a symbol, including Done and Cancel.
 */
export function androidHeaderBar(items: TestableHeaderItem[]) {
  return createElement(
    View,
    { style: { flexDirection: 'row' } },
    ...(items[0]?.type === 'button' && items[0].label === 'Account'
      ? [...items].reverse()
      : items
    ).map((item, index) =>
      item.type === 'button' || item.type === 'menu'
        ? createElement(
            Pressable,
            {
              key: index,
              testID:
                item.testID ??
                `header-${item.label.toLowerCase().replaceAll(' ', '-')}`,
              accessibilityRole: 'button',
              accessibilityLabel: item.accessibilityLabel ?? item.label,
              accessibilityHint:
                item.type === 'menu' ? 'Opens more actions' : undefined,
              accessibilityState: {
                disabled: item.type === 'button' && !!item.disabled,
              },
              disabled: item.type === 'button' && item.disabled,
              android_ripple: { color: colors.navyWash, borderless: true },
              onLongPress: () => {
                if (Platform.OS === 'android')
                  ToastAndroid.show(
                    item.accessibilityLabel ?? item.label,
                    ToastAndroid.SHORT,
                  );
              },
              onPress:
                item.type === 'menu'
                  ? () => {
                      if (Platform.OS === 'android')
                        showMenu(
                          item.menu.title ??
                            (item.accessibilityLabel?.startsWith('More for ')
                              ? ''
                              : item.label),
                          menuActions(item.menu.items),
                        );
                    }
                  : item.onPress,
              hitSlop: 4,
              style: {
                minWidth: 48,
                minHeight: 48,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 8,
                opacity: item.type === 'button' && item.disabled ? 0.38 : 1,
              },
            },
            item.type === 'menu' ||
              item.icon?.type === 'sfSymbol' ||
              item.label === 'Cancel'
              ? createElement(Icon, {
                  name:
                    item.type === 'menu'
                      ? 'ellipsis'
                      : item.label === 'Cancel'
                        ? 'xmark'
                        : (item.icon as { name: SFSymbol }).name,
                  size: 24,
                  maxScale: 1,
                })
              : createElement(
                  Text,
                  {
                    maxFontSizeMultiplier: 1.5,
                    style: {
                      color: colors.navy,
                      fontFamily: fonts.sansSemiBold,
                      fontSize: androidBar.action,
                    },
                  },
                  item.label,
                ),
          )
        : null,
    ),
  );
}

/** The item API is iOS-only; Android draws the same items (androidHeaderBar). */
export function headerItems(
  items: (() => NativeStackHeaderItem[]) | undefined,
) {
  const visible = items
    ? () =>
        items().filter(
          (item) =>
            canShare ||
            !(
              (item.type === 'button' || item.type === 'menu') &&
              item.label === 'Share'
            ),
        )
    : undefined;
  return {
    unstable_headerRightItems: visible,
    ...(Platform.OS === 'android'
      ? { headerRight: () => androidHeaderBar(visible?.() ?? []) }
      : {}),
  };
}

/** Space for data-dependent actions, present in the navigator's first layout. */
export function pendingHeaderItems(
  name: string | undefined,
  params?: object,
): NativeStackHeaderItem[] | undefined {
  if (
    Platform.OS !== 'ios' ||
    (name === 'money-item' && (params as { sheet?: unknown })?.sheet === '1')
  )
    return undefined;
  const alwaysTwo = name === 'directory' || name === 'division-history';
  const moreOnly = name === 'money-record' || name === 'grant-program';
  const shareAndMore = [
    'electorate/[id]',
    'person/[slug]',
    'party/[slug]',
    'bill/[key]',
    'doc/[slug]',
    'lead/[id]',
    'topic/[slug]',
    'agency',
    'money-item',
    'connection',
    'grants',
    'agencies',
    'explore/index',
    'explore/[tool]',
  ].includes(name ?? '');
  if (!alwaysTwo && !moreOnly && !shareAndMore) return undefined;
  const count = alwaysTwo || (shareAndMore && canShare) ? 2 : 1;
  // Beside a vertical bar the items sit on the rail, where a spacing item
  // takes no room and is no bar content: the page was first laid out with
  // no title band, 58 pt higher, and dropped when the real buttons arrived
  // (every pushed page on the closed Duo, b74). The stand-ins there are the
  // buttons themselves, disabled until the page supplies its own, so the
  // bar holds the same items from the first frame.
  if (railItems()) {
    const more: TestableHeaderItem = {
      type: 'button',
      label: 'More',
      identifier: 'header-more',
      accessibilityLabel: 'More',
      icon: { type: 'sfSymbol', name: 'ellipsis.circle' },
      disabled: true,
      onPress: () => undefined,
    };
    if (count === 1) return [more];
    const first: TestableHeaderItem = alwaysTwo
      ? {
          type: 'button',
          label: 'Filters',
          identifier: 'header-filters',
          accessibilityLabel: 'Filters',
          icon: {
            type: 'sfSymbol',
            name: 'line.3.horizontal.decrease.circle',
          },
          disabled: true,
          onPress: () => undefined,
        }
      : {
          type: 'button',
          label: 'Share',
          accessibilityLabel: 'Share',
          icon: { type: 'sfSymbol', name: 'square.and.arrow.up' },
          disabled: true,
          onPress: () => undefined,
        };
    return [first, more];
  }
  // Match the 44 pt items and 16 pt group gap used by barTitleWidth.
  return [{ type: 'spacing', spacing: 44 + 60 * (count - 1) }];
}

/**
 * Bar options for a page that has loaded and has no items of its own. On
 * the rail that clears the stand-in buttons; elsewhere it changes nothing,
 * and the invisible spacing stays as it was.
 */
export function noHeaderItems() {
  return railItems() ? headerItems(() => []) : {};
}

/**
 * Whether bar items sit on a vertical rail right now. Read from the native
 * module's cached snapshot, since the stack's first options are built
 * outside any component.
 */
function railItems(): boolean {
  return (
    RAIL_STAND_IN_BUTTONS &&
    glassBar() &&
    (RootBar?.getVerticalBarEdge?.() ?? 'unspecified') !== 'unspecified'
  );
}

/**
 * Off. On the Duo simulator the stand-in buttons made a remembered profile
 * draw 38 pt high and drop when its own items replaced them (2 of 2 warm
 * opens), where the spacing item showed no shift. The simulator never
 * showed the 58 pt drop reported from the phone, so neither stand-in is
 * proven there; until that is measured on a device the rail keeps the
 * spacing item it had.
 */
export const RAIL_STAND_IN_BUTTONS: boolean = false;

export function pendingHeaderOptions(name: string, params?: object) {
  const items = pendingHeaderItems(name, params);
  return items ? headerItems(() => items) : {};
}

/**
 * The Done button that closes a sheet: plain text in the tint, as every
 * sheet draws it. Not the `done` variant, which iOS 26 fills as
 * a navy pill (pass 5, P3-8).
 */
export function closeSheetItem(): NativeStackHeaderItem {
  return {
    type: 'button',
    label: 'Done',
    variant: 'plain',
    tintColor: colors.navy,
    accessibilityLabel: 'Done',
    onPress: () => (router.canGoBack() ? router.back() : router.replace('/')),
  };
}

/**
 * A short, single-screen sheet (filters, a glossary): a centred form sheet
 * on iPad, which UIKit turns into a bottom sheet in a compact window, and
 * the existing page sheet on iPhone. Sheets with their own stack (Account,
 * directory filters) and Talk stay `modal`: a page sheet, centred on iPad.
 */
export const shortSheet = {
  presentation:
    Platform.OS === 'android' ? ('modal' as const) : ('formSheet' as const),
  sheetAllowedDetents: [0.5, 1] as number[],
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: true,
  headerTransparent: false,
  headerTitleAlign: 'center' as const,
};
