import { onKeyCommand } from './keyboard';
import { useSyncExternalStore } from 'react';
import { ActionSheetIOS, Platform } from 'react-native';
import {
  AndroidBottomSheet,
  AndroidSheetRow,
} from '../navigation/AndroidSheet';

export interface MenuAction {
  title: string;
  onPress: () => void;
}
type Menu = { title: string; actions: readonly MenuAction[] } | null;
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
export function showMenu(
  title: string,
  actions: readonly MenuAction[],
  anchor?: number,
) {
  if (Platform.OS === 'android') {
    present({ title, actions });
    return;
  }
  const remove = onKeyCommand('list-escape', () => {
    remove();
    ActionSheetIOS.dismissActionSheet();
  });
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: [...actions.map((action) => action.title), 'Cancel'],
      cancelButtonIndex: actions.length,
      ...(Platform.OS === 'ios' && Platform.isPad && anchor ? { anchor } : {}),
    },
    (index) => {
      remove();
      actions[index]?.onPress();
    },
  );
}

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
