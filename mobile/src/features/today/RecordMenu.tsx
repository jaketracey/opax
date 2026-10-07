import { ActionSheetIOS } from 'react-native';

export interface MenuAction {
  title: string;
  onPress: () => void;
}

/**
 * A row's touch-and-hold actions ("View original") as the native action
 * sheet, titled with the record it acts on. The row's VoiceOver actions
 * offer the same choices. (expo-router's context-menu link hides the row
 * from VoiceOver, so it is not used for rows.)
 */
export function showRecordMenu(title: string, actions: MenuAction[]) {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: [...actions.map((action) => action.title), 'Cancel'],
      cancelButtonIndex: actions.length,
    },
    (index) => actions[index]?.onPress(),
  );
}
