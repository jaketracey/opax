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
  anchor?: number | MenuAnchor,
  message?: string,
  onDismiss?: () => void,
) {
  if (Platform.OS === 'android') {
    const next = { title, message, actions, onDismiss };
    if (typeof anchor === 'number') {
      UIManager.measureInWindow(anchor, (x, y, width, height) =>
        present({
          ...next,
          anchor: { x, y, width, height },
          returnFocus: anchor,
        }),
      );
    } else present({ ...next, anchor: anchor ?? recentMenuAnchor() });
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
