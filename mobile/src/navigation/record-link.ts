import { router, type Href } from 'expo-router';
import { NavigationContext } from 'expo-router/react-navigation';
import { useContext } from 'react';

type Params = Record<string, unknown>;
type RecordRoute = {
  path: string;
  aliases?: string[];
  fields?: string[];
  defaults?: Params;
};

// Record identity excludes labels and entry/presentation hints. List routes
// retain their filters, since a different list is a different destination.
const recordRoutes: RecordRoute[] = [
  {
    path: 'money-record',
    fields: ['node', 'jurisdiction', 'rid', 'jur', 'agency'],
    defaults: { jurisdiction: 'federal', jur: 'federal' },
  },
  {
    path: 'money-item',
    fields: [
      'kind',
      'lead',
      'i',
      'jur',
      'program',
      'rid',
      'id',
      'recipient',
      'month',
      'agency',
      'supplier',
    ],
    defaults: { jur: 'federal' },
  },
  { path: 'money-node', fields: ['node'] },
  {
    path: 'grant-program',
    fields: ['id', 'jur', 'seat', 'state'],
    defaults: { jur: 'federal' },
  },
  { path: 'source', fields: ['key', 'block'] },
  { path: 'record-list', fields: ['person', 'party', 'kind'] },
  { path: 'electorate-date', fields: ['id', 'asof'] },
  { path: 'election', fields: ['seat', 'key'] },
  { path: 'seat' },
  { path: 'rule', fields: ['key', 'variant'] },
  { path: 'talk/record', aliases: ['record'], fields: ['path'] },
  { path: 'members', fields: ['seat'] },
  { path: 'grants', defaults: { jur: 'federal' } },
  { path: 'licences', fields: [] },
  { path: 'person/[slug]', fields: ['slug'] },
  { path: 'bill/[key]', fields: ['key'] },
  { path: 'party/[slug]', fields: ['slug'] },
  { path: 'electorate/[id]', fields: ['id', 'asof'] },
  { path: 'topic/[slug]', fields: ['slug'] },
  { path: 'doc/[slug]', fields: ['slug'] },
  { path: 'report/[slug]', fields: ['slug'] },
  { path: 'bill-text/[key]', fields: ['key', 'version'] },
  {
    path: 'account/sources/dataset/[id]',
    aliases: ['sources/dataset/[id]'],
    fields: ['id'],
  },
  { path: 'licence/[id]', aliases: ['[id]'], fields: ['id'] },
  {
    path: 'licence/sources/[...path]',
    aliases: ['sources/[...path]'],
    fields: ['path'],
  },
  { path: 'agency', fields: ['id'] },
  { path: 'connection', fields: ['id'] },
  { path: 'lead/[id]', fields: ['id'] },
];

function target(href: Href) {
  const url = new URL(
    typeof href === 'string' ? href : href.pathname,
    'https://opax.invalid',
  );
  if (url.origin !== 'https://opax.invalid') return;
  const path = url.pathname.replace(/\/\([^/]+\)/g, '').replace(/^\/|\/$/g, '');
  const supplied: Params = {
    ...Object.fromEntries(url.searchParams),
    ...(typeof href === 'object' && 'params' in href ? href.params : {}),
  };
  for (const route of recordRoutes) {
    const fields = route.path.split('/');
    const parts = path.split('/');
    const params = { ...supplied };
    if (
      fields.every((field, i) => {
        if (field.startsWith('[...')) {
          params[field.slice(4, -1)] ??= parts.slice(i).map(decodeURIComponent);
          return parts.length > i;
        }
        if (fields.length !== parts.length) return false;
        if (field.startsWith('[')) {
          params[field.slice(1, -1)] ??= decodeURIComponent(parts[i]!);
          return true;
        }
        return field === parts[i];
      })
    )
      return { route, params };
  }
}

function identity({
  route,
  params,
}: NonNullable<ReturnType<typeof target>>): string {
  // The legacy alias redirects to this record, so it has the same identity.
  if (route.path === 'money-node')
    return identity({ route: recordRoutes[0]!, params });
  const values = { ...route.defaults, ...params };
  const fields =
    route.fields ?? Object.keys(values).filter((key) => key !== 'name');
  return JSON.stringify([
    route.path,
    // Not toSorted: the shipped Hermes has no Array.prototype.toSorted, so
    // it threw on every record page (TestFlight AEi_banN, build 45).
    [...fields].sort().map((key) => [key, values[key] ?? '']),
  ]);
}

/**
 * The record a route's params name, the same identity the Back guard uses. A
 * link to another record of the route on top reuses its screen (react
 * navigation updates the params), so record routes key their screen on this
 * and the new record starts at its own top (sweep 2, item 11).
 */
export function recordKey(path: string, params: Params): string {
  const route = recordRoutes.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`${path} is not a record route`);
  return identity({ route, params });
}

type RouteState = {
  index?: number;
  routes: readonly { name: string; params?: object; state?: RouteState }[];
};

/** Compare only the focused screen. An earlier visit must stay in Back history. */
export function isCurrentRecord(
  href: Href,
  state: RouteState | undefined,
): boolean {
  const destination = target(href);
  if (!destination || !state?.routes?.length) return false;
  const current = state.routes[state.index ?? state.routes.length - 1];
  if (!current) return false;
  if (current.state) return isCurrentRecord(href, current.state);
  const route = recordRoutes.find((candidate) =>
    [candidate.path, ...(candidate.aliases ?? [])].includes(current.name),
  );
  const previous = route && { route, params: (current.params ?? {}) as Params };
  return !!previous && identity(previous) === identity(destination);
}

export function isRecordHref(href: Href): boolean {
  return !!target(href);
}

function useRecordNavigator() {
  const navigation = useContext(NavigationContext);
  const isCurrent = (href: Href) =>
    isCurrentRecord(href, navigation?.getState?.());
  return {
    isCurrent,
    push: (href: Href) => {
      if (!isCurrent(href)) router.push(href);
    },
  };
}

/** The imperative reader and bill actions use the same top-only guard. */
export function useRecordPush() {
  return useRecordNavigator().push;
}

/** Touch, VoiceOver and keyboard activation share the same top-only guard. */
export function useRecordLink(href?: Href) {
  const navigation = useRecordNavigator();
  return {
    push: !!href && isRecordHref(href),
    isCurrent: () => !!href && navigation.isCurrent(href),
    open: () => {
      if (href) navigation.push(href);
    },
  };
}
