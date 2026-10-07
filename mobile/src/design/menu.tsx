import { useSyncExternalStore } from 'react';
import {
  ActionSheetIOS,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Heading, Text } from './text';
import { colors, minimumTarget, rhythm } from './tokens';

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

/** A scrollable Android dialog; iOS keeps its existing native action sheet. */
export function showMenu(title: string, actions: readonly MenuAction[]) {
  if (Platform.OS === 'android') {
    present({ title, actions });
    return;
  }
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: [...actions.map((action) => action.title), 'Cancel'],
      cancelButtonIndex: actions.length,
    },
    (index) => actions[index]?.onPress(),
  );
}

export function AndroidMenuHost() {
  const current = useSyncExternalStore(subscribe, () => menu);
  if (Platform.OS !== 'android' || !current) return null;
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => present(null)}
    >
      <SafeAreaView style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Cancel menu"
          onPress={() => present(null)}
        />
        <View
          style={styles.menu}
          accessibilityViewIsModal
          testID="android-menu"
        >
          <Heading level={2}>{current.title}</Heading>
          <ScrollView>
            {current.actions.map((action) => (
              <Pressable
                key={action.title}
                accessibilityRole="button"
                accessibilityLabel={action.title}
                style={styles.row}
                onPress={() => {
                  present(null);
                  action.onPress();
                }}
              >
                <Text variant="control">{action.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={styles.row}
            onPress={() => present(null)}
          >
            <Text variant="control">Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000055',
    justifyContent: 'center',
    padding: rhythm.screen,
  },
  menu: {
    backgroundColor: colors.paper,
    padding: rhythm.block,
    gap: rhythm.heading,
    maxHeight: '85%',
    borderRadius: 12,
  },
  row: { minHeight: minimumTarget, paddingVertical: rhythm.heading },
});
