import {
  router,
  type Href,
  type NativeStackHeaderItem,
  type NativeStackHeaderItemMenuAction,
  type NativeStackHeaderItemMenuSubmenu,
} from 'expo-router';
import { createElement } from 'react';
import {
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type ColorValue,
} from 'react-native';
import { designFlags } from '../design/flags';
import { showMenu, type MenuAction } from '../design/menu';
import type { RowMenuAction } from '../design/row-link';
import {
  colors,
  contentSizeCategory,
  interfaceFonts as fonts,
  headingFace,
  headlineSizes,
  largeTitleSizes,
  textStyles,
} from '../design/tokens';
import { accountSnapshot } from '../features/account/store';
import { voiceLinked } from '../voice/linked';
import { canShare } from './share';

/**
 * Header styling shared by every stack, using the selected heading face
 * and system Dynamic Type. Buttons and named back buttons use the tint.
 */
/** iOS 26 and later: the system glass bar and scroll edge effects. */
export const glassBar = () =>
  Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

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
 * UIKit on iOS 26 hides large titles when the standard appearance has a
 * background colour or blur (react-native-screens#3100, reproduced in UIKit).
 * Keep both appearances transparent while expanded. A scroll-edge background
 * also suppresses the title, even with a transparent standard appearance.
 * The screen supplies the page ground beneath the native hard scroll edge.
 * A native height change adds the standard colour on collapse and clears it
 * on return. Empty styles replace the navigator's opaque defaults.
 */
export const largeTitleBar = (
  ground: ColorValue = colors.paper,
  collapsed = false,
) =>
  glassBar()
    ? {
        headerStyle: collapsed ? { backgroundColor: ground } : {},
        headerLargeStyle: {},
        contentStyle: { backgroundColor: ground },
        headerTransparent: true,
        headerShadowVisible: true,
      }
    : opaqueBar(ground);

/**
 * Today's soft edge leaves the dot map and large title clear at rest. Native
 * header height shrinking below its known expanded height selects the other
 * roots' protective edge; a settled full height or overscroll restores soft.
 * Soft alone blurs only the status strip, leaving cards sharp behind the title.
 * A permanently hard edge paints a divider at rest. Switching the edge keeps
 * both expanded appearances background-free (react-native-screens#3100).
 */
export const todayTitleBar = (
  ground: ColorValue = colors.paper,
  collapsed = false,
  scrolled = collapsed,
) => ({
  ...largeTitleBar(ground, collapsed),
  ...(glassBar()
    ? {
        headerLargeTitleShadowVisible: false,
        scrollEdgeEffects: {
          top: collapsed || scrolled ? ('hard' as const) : ('soft' as const),
          bottom: 'soft' as const,
        },
      }
    : {}),
});

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

export function useStackChrome() {
  const { fontScale } = useWindowDimensions();
  const category = contentSizeCategory(fontScale);
  const sizes = {
    largeTitle: largeTitleSizes[category],
    title: Math.min(headlineSizes[category], headlineSizes.xxxLarge),
  };
  return {
    headerTintColor: colors.navy,
    // Inline and sheet bars must not inherit Expo's transparent form-sheet
    // default. Large-title roots opt into translucency for native collapse.
    headerTransparent: false,
    ...opaqueBar(),
    headerTitleStyle: {
      fontFamily: textStyles.inlineTitle.fontFamily,
      fontWeight: textStyles.inlineTitle.fontWeight,
      ...(Platform.OS === 'android'
        ? { fontSize: androidBar.title }
        : headingFace === 'serif'
          ? { fontSize: sizes.title }
          : {}),
      color: colors.ink,
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
      color: colors.ink,
    },
    // Deviation from shell.md 2.3 (soft top): the wave 2 captures showed the
    // soft top edge active but too light, with serif record text legible
    // through the title and bar buttons. The hard edge is UIKit's own opaque
    // boundary with a divider. The bottom stays soft at the minimising tab
    // bar. The visible native appearance uses the page ground, without a blur.
    scrollEdgeEffects: { top: 'hard' as const, bottom: 'soft' as const },
    headerLargeTitleEnabled: false,
    headerLargeTitleShadowVisible: false,
    headerBackButtonDisplayMode: 'default' as const,
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
  return [
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
}

export function askHeaderItems(props: {
  canStartNew: boolean;
  historyEnabled: boolean;
  signedIn: boolean;
  onNew: () => void;
  onHistory: () => void;
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
  return {
    unstable_headerLeftItems: () => [history],
    ...headerItems(() =>
      rootHeaderItems({
        segment: '(ask)',
        signedIn: props.signedIn,
        extra: [compose],
      }),
    ),
    ...(Platform.OS === 'android'
      ? { headerLeft: () => androidHeaderBar([history]) }
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
            label: item.title,
            ...(item.symbol
              ? { icon: { type: 'sfSymbol' as const, name: item.symbol } }
              : {}),
            inline: item.inline,
            items: nativeMenuRows(item.items),
          }
        : {
            type: 'action',
            label: item.title,
            ...(item.symbol
              ? { icon: { type: 'sfSymbol' as const, name: item.symbol } }
              : {}),
            destructive: item.destructive,
            onPress: item.onPress,
          },
    );
}
export function pageMenu(props: {
  name: string;
  items: RowMenuAction[];
}): TestableHeaderItem {
  return {
    type: 'menu',
    label: 'More',
    testID: 'header-more',
    identifier: 'header-more',
    accessibilityLabel: `More for ${props.name}`,
    icon: { type: 'sfSymbol', name: 'ellipsis.circle' },
    menu: { items: nativeMenuRows(props.items) },
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

/** A bar menu's rows as an Android sheet; a submenu opens its own sheet. */
function menuActions(items: HeaderMenu['menu']['items']): MenuAction[] {
  return items
    .filter((item) => !('hidden' in item && item.hidden))
    .map((item) => ({
      title: item.label,
      onPress:
        item.type === 'action'
          ? item.onPress
          : () => {
              if (Platform.OS === 'android')
                showMenu(item.label, menuActions(item.items));
            },
    }));
}

/**
 * Android's bar for a screen's items: a button's word, and a menu's word
 * that opens its rows as a bottom sheet. Labelled, scalable touch targets.
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
                paddingHorizontal: 8,
              },
            },
            createElement(
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
};
