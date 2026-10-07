// This lane deliberately has no native recipient, donor or supplier route.
export function moneyFromWebPath(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  const [pathname, query] = path.split('?');
  const p = new URLSearchParams(query);
  if (pathname === '/discover' || pathname === '/discover/')
    return {
      pathname: '/discover' as const,
      params: { category: p.get('category') ?? 'procurement_concentration' },
    };
  if (pathname === '/money/grants' || pathname === '/money/grants/') {
    if (p.has('open')) return null;
    const jur = p.get('jur') === 'qld' ? 'qld' : 'federal';
    if (p.has('program'))
      return {
        pathname: '/grant-program' as const,
        params: { jur, id: p.get('program')! },
      };
    if (p.has('largest'))
      return {
        pathname: '/largest-grants' as const,
        params: { month: p.get('largest')! },
      };
    return {
      pathname: '/grants' as const,
      params: { jur, view: p.get('view') ?? 'programs' },
    };
  }
  if (pathname === '/subject/agency' || pathname === '/subject/agency/')
    return { pathname: '/agencies' as const };
  const agency = /^\/subject\/agency\/([^/]+)\/?$/.exec(pathname ?? '');
  if (agency) {
    try {
      return {
        pathname: '/agency' as const,
        params: { id: decodeURIComponent(agency[1]!) },
      };
    } catch {
      return null;
    }
  }
  if (
    pathname === '/reports/grants-allocation' ||
    pathname === '/reports/grants-allocation/'
  )
    return { pathname: '/grants-allocation' as const };
  if (pathname === '/connections' || pathname === '/connections/')
    return { pathname: '/connections' as const };
  return null;
}
