import {
  agenciesRoute,
  agencyRoute,
  connectionRoute,
  connectionsRoute,
  grantProgramRoute,
  grantsAllocationRoute,
  grantsRoute,
  largestGrantsRoute,
  leadsRoute,
  moneyItemRoute,
  moneyRecordRoute,
} from '../../navigation/routes/public-money';

/**
 * The kinds of record a money row opens as a `money-item` page, and the
 * params each needs to rebuild it from the static exports (specs/money.md
 * 1.4). Deep links carry ids only: never a name, never record text, and an
 * individual is addressed by index.
 */
export type MoneyItemParams =
  | { kind: 'grant'; jur: string; program?: string; rid?: string; id: string }
  | { kind: 'recipient'; jur: string; program: string; recipient: string }
  | { kind: 'largest'; month: string; id: string }
  | { kind: 'contract'; agency: string; id: string }
  | { kind: 'supplier'; agency: string; supplier: string }
  | { kind: 'award' | 'project' | 'earlier'; id: string };
export type MoneyItemKind = MoneyItemParams['kind'];

/**
 * The page a money record row pushes. `from` names the organisation page the
 * row sits on, so the item leaves out "Open {organisation}" there.
 */
export function moneyItemHref(
  params: MoneyItemParams,
  options: { name?: string; from?: string } = {},
) {
  return moneyItemRoute(
    {
      ...(params as Record<string, string>),
      ...(options.from ? { from: options.from } : {}),
    },
    options.name,
  );
}

/** An organisation's money record: a recipient or supplier id (journey 4.10). */
export const organisationHref = (rid: string, name: string, jur = 'federal') =>
  moneyRecordRoute({ rid, jur }, name);

/**
 * Web paths this group answers natively, through the group's route
 * builders. `/discover` became Leads; `/money?node=` opens the money record.
 * Private recipient pages and `?open=` never resolve.
 */
export function moneyFromWebPath(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  const u = new URL(path, 'https://opax.invalid');
  const p = u.searchParams,
    pathname = u.pathname;
  if (/^\/discover\/?$/.test(pathname)) {
    const params: Record<string, string> = {};
    for (const key of ['category', 'item'] as const) {
      const value = p.get(key);
      if (value) params[key] = value;
    }
    return { ...leadsRoute, params };
  }
  if (/^\/money\/?$/.test(pathname) && (p.has('node') || p.has('rid')))
    return moneyRecordRoute(
      Object.fromEntries(
        ['node', 'rid', 'jur'].flatMap((key) =>
          p.get(key) ? [[key, p.get(key)!]] : [],
        ),
      ),
    );
  if (/^\/money\/grants\/?$/.test(pathname)) {
    if (p.has('open')) return null;
    const jur = p.get('jur') === 'qld' ? 'qld' : 'federal';
    if (p.has('program')) {
      const program = p.get('program')!;
      // Community funding is a program on the web and its own page here.
      if (jur === 'federal' && program.toUpperCase() === 'GO7867')
        return grantsAllocationRoute;
      return grantProgramRoute(program, jur);
    }
    if (p.has('largest')) return largestGrantsRoute(p.get('largest')!);
    if (p.get('q') && p.get('view') === 'electorates' && jur === 'federal')
      return grantsRoute({ jur, seat: p.get('q')! });
    return grantsRoute({ jur, view: p.get('view') ?? 'programs' });
  }
  if (/^\/subject\/agency\/?$/.test(pathname)) return agenciesRoute;
  const agency = /^\/subject\/agency\/([^/]+)\/?$/.exec(pathname);
  if (agency?.[1]) return agencyRoute(decodeURIComponent(agency[1]));
  if (/^\/connections\/?$/.test(pathname)) {
    const entity = p.get('entity');
    return entity && /^[a-f0-9]{24}$/.test(entity)
      ? connectionRoute(entity)
      : connectionsRoute;
  }
  const recipient =
    /^\/money\/grants\/(federal|qld)\/recipient\/([^/]+)\/?$/.exec(pathname);
  if (recipient && !decodeURIComponent(recipient[2]!).startsWith('person:'))
    return moneyRecordRoute({
      rid: decodeURIComponent(recipient[2]!),
      jur: recipient[1]!,
      ...(p.get('award') ? { award: p.get('award')! } : {}),
    });
  const money =
    /^\/subject\/(donor|supplier|recipient|campaigner)\/([^/]+)\/?$/.exec(
      pathname,
    );
  if (money?.[2])
    return moneyRecordRoute({
      ...(money[1] === 'donor'
        ? { node: `donor:${decodeURIComponent(money[2])}` }
        : { rid: decodeURIComponent(money[2]) }),
      jur: p.get('jur') ?? 'federal',
      ...(p.get('agency') ? { agency: p.get('agency')! } : {}),
      ...(p.get('award') ? { award: p.get('award')! } : {}),
    });
  return null;
}
