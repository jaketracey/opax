export function isExplorePaidPath(path: string): boolean {
  return path === '/api/tide?scope=federal' || path === '/api/tide?scope=all';
}
export function isExploreStaticPath(path: string): boolean {
  return (
    path === '/years/pictures.json' ||
    (/^\/years\/(?:199[89]|20[012]\d)\.json$/.test(path) &&
      Number(path.slice(7, 11)) <= 2026)
  );
}
