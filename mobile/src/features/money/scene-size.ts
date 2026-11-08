/** The scene's one VoiceOver label (journeys/money.md 12). */
export const moneyMapLabel = 'Money map. The List view has the same data.';
/**
 * The scene's height: as tall as the window is wide, to 440 pt, on iPhone;
 * 560 pt in the wide column on iPad. Its own module, so the screen's
 * placeholder keeps the size where the native map is mocked.
 */
export function moneySceneHeight(windowWidth: number, regular: boolean) {
  return regular ? 560 : Math.min(Math.round(windowWidth), 440);
}
