// Exact requests made by the web person/party sections. All are action-only.
export function isPeoplePaidPath(path: string): boolean {
  const [pathname, query] = path.split('?');
  const p = new URLSearchParams(query);
  const exact = (keys: string[]) =>
    [...p.keys()].length === keys.length &&
    keys.every((k) => p.getAll(k).length === 1);
  const name = (s: string | null) =>
    !!s &&
    s.length <= 120 &&
    /^[\p{L}\p{N} .,'’&()\/-]+$/u.test(s) &&
    !!s.trim();
  if (pathname === '/api/news' || pathname === '/api/topics')
    return path === pathname;
  if (pathname === '/api/person-topics')
    return exact(['name']) && name(p.get('name'));
  if (pathname === '/api/brief')
    return (
      exact(['rids']) &&
      /^[a-f0-9]{32}(?:,[a-f0-9]{32}){0,23}$/.test(p.get('rids') ?? '')
    );
  if (pathname !== '/api/search') return false;
  if (exact(['q', 'top_k'])) {
    const q = p.get('q') ?? '';
    return (
      p.get('top_k') === '6' &&
      q.startsWith('"') &&
      q.endsWith('"') &&
      name(q.slice(1, -1))
    );
  }
  const page = /^[1-9]\d{0,2}$/.test(p.get('page') ?? '');
  // The pushed lists (people.md 2.1, route 15): 20 a page, newest first.
  if (exact(['q', 'page', 'per', 'sort'])) {
    const q = p.get('q') ?? '';
    return (
      q.startsWith('"') &&
      q.endsWith('"') &&
      name(q.slice(1, -1)) &&
      page &&
      p.get('per') === '20' &&
      p.get('sort') === 'newest'
    );
  }
  return (
    exact(['q', 'speaker', 'page', 'per', 'sort']) &&
    name(p.get('speaker')) &&
    p.get('q') === p.get('speaker') &&
    ((p.get('page') === '1' && p.get('per') === '8') ||
      (page && p.get('per') === '20')) &&
    p.get('sort') === 'newest'
  );
}
