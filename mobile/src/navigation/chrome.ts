import { createElement } from 'react';
import {
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type ColorValue,
} from 'react-native';
import {
  router,
  type Href,
  type NativeStackHeaderItem,
  type NativeStackHeaderItemMenuAction,
  type NativeStackHeaderItemMenuSubmenu,
} from 'expo-router';
import {
  colors,
  headingFace,
  fonts,
  navigationTitleSizes,
  textStyles,
} from '../design/tokens';
import { showMenu, type MenuAction } from '../design/menu';
import { voiceLinked } from '../voice/linked';
import { designFlags } from '../design/flags';
import { accountSnapshot } from '../features/account/store';
import { canShare } from './share';
import type { SFSymbol } from '../design/icon';

/**
 * Header styling shared by every stack, using the selected heading face
 * and system Dynamic Type. Buttons and named back buttons use the tint.
 */
// On iOS 26 a bar background or blur hides the large title (a UIKit bug,
// react-native-screens#3100), so there the system's glass bar is left alone.
// Earlier versions keep an opaque paper bar, so content never shows through.
// Android's bar is flat paper like the redesign's: no elevation shadow.
export const opaqueBar = (ground: ColorValue = colors.paper) =>
  Platform.OS === 'android' ||
  (Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) < 26)
    ? {
        headerStyle: { backgroundColor: ground },
        headerLargeStyle: { backgroundColor: ground },
        ...(Platform.OS === 'android' ? { headerShadowVisible: false } : {}),
      }
    : {};

/**
 * Android bar text, in sp. The native bar sets its title in sp, so the
 * system's font scale (to 200%) applies once; passing the iOS Dynamic Type
 * size as well would scale it twice. With no large title on Android, the
 * bar title is the screen's title: the `heading` size, Material's title size.
 */
export const androidBar = {
  title: textStyles.heading.fontSize,
  action: textStyles.metadata.fontSize,
} as const;

export function useStackChrome() {
  const { fontScale } = useWindowDimensions();
  const sizes = navigationTitleSizes(fontScale);
  return {
    headerTintColor: colors.navy,
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
      ...(headingFace === 'serif' ? { fontSize: sizes.largeTitle } : {}),
      color: colors.ink,
    },
    scrollEdgeEffects: { top: 'soft' as const, bottom: 'soft' as const },
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

/** Account is outermost. A root has room for just one feature action. */
export function rootHeaderItems(props?: {
  segment: TabSegment;
  extra?: NativeStackHeaderItem[];
  signedIn: boolean;
}): NativeStackHeaderItem[] {
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

// Structurally identical to design/row-link's contract. Kept here until its
// parallel wave adds that export, so neither lane depends on an empty stub.
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
}): NativeStackHeaderItem {
  return {
    type: 'menu',
    label: 'More',
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
}): NativeStackHeaderItem {
  return {
    type: 'button',
    label: 'Filters',
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
  // Native items are ordered outside in: index zero is the rightmost item.
  return () => [
    pageMenu({ name: props.name, items: props.menu }),
    ...(props.filters
      ? [filtersItem(props.filters)]
      : props.share && canShare
        ? [shareItem({ name: props.name, onPress: props.share })]
        : []),
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
          : () => showMenu(item.label, menuActions(item.items)),
    }));
}

/**
 * Android's bar for a screen's items: a button's word, and a menu's word
 * that opens its rows as a bottom sheet. Labelled, scalable touch targets.
 */
export function androidHeaderBar(items: NativeStackHeaderItem[]) {
  return createElement(
    View,
    { style: { flexDirection: 'row' } },
    ...((items[0]?.type === 'button' && items[0].label === 'Account') ||
    (items[0]?.type === 'menu' &&
      items[0].accessibilityLabel?.startsWith('More for '))
      ? [...items].reverse()
      : items
    ).map((item, index) =>
      item.type === 'button' || item.type === 'menu'
        ? createElement(
            Pressable,
            {
              key: index,
              testID: `header-${item.label.toLowerCase().replaceAll(' ', '-')}`,
              accessibilityRole: 'button',
              accessibilityLabel: item.accessibilityLabel ?? item.label,
              onPress:
                item.type === 'menu'
                  ? () =>
                      showMenu(
                        item.menu.title ??
                          (item.accessibilityLabel?.startsWith('More for ')
                            ? ''
                            : item.label),
                        menuActions(item.menu.items),
                      )
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
 * sheet draws it (SheetBody). Not the `done` variant, which iOS 26 fills as
 * a navy pill (pass 5, P3-8).
 */
export function closeSheetItem(): NativeStackHeaderItem {
  return {
    type: 'button',
    label: 'Done',
    variant: 'plain',
    tintColor: colors.navy,
    accessibilityLabel: 'Done',
    onPress: () => router.back(),
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
};
