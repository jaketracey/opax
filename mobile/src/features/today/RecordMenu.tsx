import { showMenu } from '../../design/menu';

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
export function showRecordMenu(
  title: string,
  actions: MenuAction[],
  anchor?: number,
) {
  showMenu(title, actions, anchor);
}
