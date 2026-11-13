import { symbols } from './symbols';
import { useRef, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  ActionSheetIOS,
  findNodeHandle,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
  useWindowDimensions,
} from 'react-native';
import { Pressable } from './pressable';
import { recentMenuAnchor, type MenuAnchor } from './menu-anchor';
import { onKeyCommand } from './keyboard';
import { Text } from './text';
import { Icon } from './icon';
import { androidControls, colors } from './tokens';

export interface MenuAction {
  title: string;
  onPress: () => void;
  destructive?: boolean;
  selected?: boolean;
  disabled?: boolean;
}
type Menu = {
  title: string;
  message?: string;
  actions: readonly MenuAction[];
  anchor?: MenuAnchor;
  returnFocus?: number;
  onDismiss?: () => void;
} | null;
let menu: Menu = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function present(next: Menu) {
  menu = next;
  listeners.forEach((listener) => listener());
}

/** Android's anchored popup; iOS keeps its native action sheet. */
export function confirmAction(
  title: string,
  actions: readonly MenuAction[],
  anchor?: number | MenuAnchor | View,
  message?: string,
  onDismiss?: () => void,
) {
  if (Platform.OS === 'android') {
    const trigger =
      anchor && typeof anchor === 'object' && 'measureInWindow' in anchor
        ? anchor
        : undefined;
    const next = {
      title,
      message,
      actions,
      onDismiss,
      anchor:
        typeof anchor === 'object' && !trigger
          ? (anchor as MenuAnchor)
          : recentMenuAnchor(),
      returnFocus:
        typeof anchor === 'number'
          ? anchor
          : trigger
            ? (findNodeHandle(trigger) ?? undefined)
            : undefined,
    };
    // Bridgeless numeric measurement can omit its callback. Opening must not
    // depend on it; prefer the trigger's Fabric-aware instance measurement.
    present(next);
    const measured = (x: number, y: number, width: number, height: number) => {
      if (
        menu !== next ||
        ![x, y, width, height].every(Number.isFinite) ||
        width <= 0 ||
        height <= 0
      )
        return;
      present({ ...next, anchor: { x, y, width, height } });
    };
    try {
      if (trigger) trigger.measureInWindow(measured);
      else if (typeof anchor === 'number')
        UIManager.measureInWindow(anchor, measured);
    } catch {
      // A detached trigger still leaves the fallback menu available.
    }
    return;
  }
  const remove = onKeyCommand('list-escape', () => {
    remove();
    ActionSheetIOS.dismissActionSheet();
  });
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      message,
      options: [...actions.map((action) => action.title), 'Cancel'],
      cancelButtonIndex: actions.length,
      ...(actions.some((action) => action.destructive)
        ? {
            destructiveButtonIndex: actions.flatMap((action, index) =>
              action.destructive ? [index] : [],
            ),
          }
        : {}),
      ...(Platform.OS === 'ios' &&
      Platform.isPad &&
      typeof anchor === 'number' &&
      anchor
        ? { anchor }
        : {}),
    },
    (index) => {
      remove();
      actions[index]?.onPress();
    },
  );
}

/** Android action menus. iOS callers use native Link.Menu. */
export const showMenu = confirmAction;

export function AndroidMenuHost() {
  return Platform.OS === 'android' ? <MaterialMenuHost /> : null;
}
function MaterialMenuHost() {
  const current = useSyncExternalStore(subscribe, () => menu);
  const { width, height, fontScale } = useWindowDimensions();
  const firstItem = useRef<View>(null);
  if (!current) return null;
  const close = () => {
    present(null);
    current.onDismiss?.();
    if (current.returnFocus)
      AccessibilityInfo.setAccessibilityFocus(current.returnFocus);
  };
  const menuWidth = Math.min(
    width - 32,
    Math.max(240, 200 * Math.min(fontScale, 2)),
  );
  const menuHeight = Math.min(
    height - 96,
    (current.title ? 48 : 0) +
      (current.message ? 96 : 0) +
      current.actions.length * Math.max(48, 24 * fontScale + 24) +
      16,
  );
  const anchor = current.anchor ?? {
    x: width - 16,
    y: 48,
    width: 0,
    height: 0,
  };
  const below = anchor.y + anchor.height;
  const top =
    below + menuHeight <= height - 32
      ? below
      : Math.max(32, anchor.y - menuHeight);
  const left = Math.max(16, Math.min(anchor.x, width - menuWidth - 16));
  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
      onShow={() => {
        AccessibilityInfo.announceForAccessibility(
          `${current.title || 'Actions'}, menu, ${current.actions.length} item${current.actions.length === 1 ? '' : 's'}`,
        );
        const node = findNodeHandle(firstItem.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }}
    >
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        {/* a11y-ok(pressable-role): the tap-outside scrim. The modal menu
            takes TalkBack focus and Back closes it. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessible={false}
          importantForAccessibility="no"
          android_ripple={{ color: 'transparent' }}
          testID="android-menu-outside"
        />
        <View
          accessibilityRole="menu"
          accessibilityLabel={current.title || 'Actions'}
          testID="android-menu"
          style={{
            position: 'absolute',
            left,
            top,
            width: menuWidth,
            maxHeight: height - top - 32,
            borderRadius: androidControls.menuRadius,
            borderCurve: 'continuous',
            backgroundColor: colors.sunken,
            elevation: 3,
            overflow: 'hidden',
          }}
        >
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingVertical: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            {current.title ? (
              <Text
                variant="strong"
                accessibilityRole="header"
                style={{ padding: 16 }}
              >
                {current.title}
              </Text>
            ) : null}
            {current.message ? (
              <Text variant="body" style={{ padding: 16 }}>
                {current.message}
              </Text>
            ) : null}
            {current.actions.map((action, index) => (
              <Pressable
                ref={index === 0 ? firstItem : undefined}
                key={`${index}-${action.title}`}
                accessibilityRole="menuitem"
                accessibilityLabel={action.title}
                disabled={action.disabled}
                accessibilityState={{
                  selected: action.selected,
                  disabled: action.disabled,
                }}
                onPress={() => {
                  close();
                  action.onPress();
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  justifyContent: 'center',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                {action.selected ? (
                  <Icon name={symbols.selected} tone="navy" maxScale={1} />
                ) : null}
                <Text
                  variant="body"
                  wordSafe
                  tone={
                    action.disabled
                      ? 'inkSoft'
                      : action.destructive
                        ? 'danger'
                        : 'ink'
                  }
                >
                  {action.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
