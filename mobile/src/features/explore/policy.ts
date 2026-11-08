/**
 * The Explore tools' own paid reads: the tide by scope. `/api/matrix` is a
 * reports paid read (allowsReportsPath), not one of these: the fixture
 * server answers every path here with the tide body, so listing the matrix
 * here served it the tide and its decoder rejected it.
 */
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
