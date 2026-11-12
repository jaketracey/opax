export type MenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};
let recent: { rect: MenuAnchor; at: number } | undefined;
export function rememberMenuAnchor(rect: MenuAnchor) {
  recent = { rect, at: Date.now() };
}
export function recentMenuAnchor() {
  return recent && Date.now() - recent.at < 1500 ? recent.rect : undefined;
}
