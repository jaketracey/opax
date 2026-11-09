import { useSyncExternalStore } from 'react';
import { ActionSheetIOS, Platform } from 'react-native';
import {
  AndroidBottomSheet,
  AndroidSheetRow,
} from '../navigation/AndroidSheet';
import { onKeyCommand } from './keyboard';
import { Text } from './text';
import { rhythm } from './tokens';

export interface MenuAction {
  title: string;
  onPress: () => void;
  destructive?: boolean;
}
type Menu = {
  title: string;
  message?: string;
  actions: readonly MenuAction[];
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

/** Android's bottom sheet of actions; iOS keeps its native action sheet. */
export function confirmAction(
  title: string,
  actions: readonly MenuAction[],
  anchor?: number,
  message?: string,
) {
  if (Platform.OS === 'android') {
    present({ title, message, actions });
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
      ...(Platform.OS === 'ios' && Platform.isPad && anchor ? { anchor } : {}),
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
  const current = useSyncExternalStore(subscribe, () => menu);
  if (Platform.OS !== 'android' || !current) return null;
  return (
    <AndroidBottomSheet
      title={current.title}
      closeLabel="Cancel"
      onClose={() => present(null)}
      testID="android-menu"
    >
      {current.message ? (
        <Text variant="body" style={{ padding: rhythm.block }}>
          {current.message}
        </Text>
      ) : null}
      {current.actions.map((action) => (
        <AndroidSheetRow
          key={action.title}
          label={action.title}
          onPress={() => {
            present(null);
            action.onPress();
          }}
        />
      ))}
    </AndroidBottomSheet>
  );
}
