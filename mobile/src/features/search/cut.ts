/**
 * Whether the page is cut at the safe area's top edge: only while the field
 * is active AND activating it hides the bar. That is the iPhone on iOS 26,
 * where the field is the tab bar's. On an iPad and an unfolded Duo (regular
 * width) the field is in the bar, which stays; a cut there would pin the
 * scope control behind it.
 */
export function cutsAtSafeTop(state: {
  fieldActive: boolean;
  /** The field sits in the tab bar (`searchBarPlacement()` is automatic). */
  tabBarField: boolean;
  pad: boolean;
  regular: boolean;
}) {
  return state.fieldActive && state.tabBarField && !state.pad && !state.regular;
}
