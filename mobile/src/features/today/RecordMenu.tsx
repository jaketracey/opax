import { confirmAction } from '../../design/menu';
export { rowMenus } from '../../design/row-link';

export interface MenuAction {
  title: string;
  onPress: () => void;
}
/** @deprecated Navigating rows use rowMenus.record through RowLink. */
export function showRecordMenu(
  title: string,
  actions: MenuAction[],
  anchor?: number,
) {
  confirmAction(title, actions, anchor);
}
