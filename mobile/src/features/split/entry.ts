import { router, type Href } from 'expo-router';
import { NavigationContext } from 'expo-router/react-navigation';
import { useCallback, useContext } from 'react';
import type { SplitRoute } from '../../design/split';
import { useRecordPush } from '../../navigation/record-link';
import { webOrigin } from '../../design/environment';
import { useSplitPane } from '../../design/primitives';
import {
  billRoute,
  billTextRoute,
  docRoute,
  electorateRoute,
  fromWebPath,
  partyRoute,
  personRoute,
} from '../../navigation/routes';

/**
 * A record drawn in an iPad split's detail pane (Search, the directories and
 * Ask's sources pane). Each kind is one of the app's native screens, drawn
 * `embedded`. Bills' own split uses the `bill` and `text` kinds, so a bill
 * opened here reads its text inside the same pane.
 *
 * `person-name` and `search-person` are people that still need their
 * identity resolved (a suggested name, a search catalog slug): the pane
 * resolves them the way the phone does before it opens a profile, and never
 * treats a catalog number as a person ID.
 */
export type RecordKind =
  | 'person'
  | 'party'
  | 'electorate'
  | 'bill'
  | 'text'
  | 'doc'
  | 'person-name'
  | 'search-person';
export interface RecordEntry {
  kind: RecordKind;
  /** The route's id: a person slug, party name, electorate id, bill key. */
  key: string;
  /** The record's name, for the pane's Back and Share. */
  title?: string;
  passage?: string;
}

const kinds: readonly RecordKind[] = [
  'person',
  'party',
  'electorate',
  'bill',
  'text',
  'doc',
  'person-name',
  'search-person',
];

/** The `open` route parameter: "person:anthony-albanese". */
export function encodeEntry(entry: RecordEntry): string {
  return `${entry.kind}:${entry.key}`;
}
export function decodeEntry(value: string | undefined): RecordEntry | null {
  if (!value) return null;
  const at = value.indexOf(':');
  const kind = value.slice(0, at) as RecordKind;
  const key = value.slice(at + 1);
  return at > 0 && key && kinds.includes(kind) ? { kind, key } : null;
}

type Route = SplitRoute;
const param = (route: Route, name: string) => {
  const value = route.params?.[name];
  return typeof value === 'string' && value ? value : null;
};

/**
 * The pane entry for a native route, or null when the route is not a record
 * a pane draws (a report, a topic, a search): those keep pushing.
 */
export function entryForRoute(
  route: Route,
  title?: string,
): RecordEntry | null {
  const with_ = (kind: RecordKind, key: string | null) =>
    key ? { kind, key, ...(title ? { title } : {}) } : null;
  switch (route.pathname) {
    case '/person/[slug]':
      return with_('person', param(route, 'slug'));
    case '/party/[slug]':
      return with_('party', param(route, 'name') ?? param(route, 'slug'));
    case '/electorate/[id]':
      // A dated view keeps its own route; the pane shows the current one.
      return param(route, 'asof')
        ? null
        : with_('electorate', param(route, 'id'));
    case '/bill/[key]':
      return param(route, 'section')
        ? null
        : with_('bill', param(route, 'key'));
    case '/bill-text/[key]':
      return param(route, 'version')
        ? null
        : with_('text', param(route, 'key'));
    case '/doc/[slug]': {
      const entry = with_('doc', param(route, 'slug'));
      return entry
        ? {
            ...entry,
            ...(param(route, 'passage')
              ? { passage: param(route, 'passage')!.slice(0, 4000) }
              : {}),
          }
        : null;
    }
    default:
      return null;
  }
}

/** Route labels survive a handoff; a party's name is already its identity. */
export function entryFromRoute(route: SplitRoute): RecordEntry | null {
  // These routes carry reader state the pane entry cannot represent.
  if (
    ['q', 'match', 'cite', 'section', 'division', 'asof', 'version'].some(
      (name) => param(route, name),
    )
  )
    return null;
  return entryForRoute(
    route,
    route.pathname === '/party/[slug]'
      ? undefined
      : (param(route, 'name') ?? undefined),
  );
}

/** Native routes for already identified records. Resolution stays in the pane. */
export function entryRoute(entry: RecordEntry): SplitRoute | null {
  switch (entry.kind) {
    case 'person':
      return personRoute(entry.key, entry.title);
    case 'party':
      return partyRoute(entry.key);
    case 'electorate':
      return electorateRoute(entry.key, undefined, entry.title);
    case 'bill':
      return billRoute(entry.key, entry.title);
    case 'text':
      return billTextRoute(entry.key, undefined, entry.title);
    case 'doc':
      return docRoute(entry.key, entry.title, { passage: entry.passage });
    default:
      return null;
  }
}

/** Bills only absorbs its own bill and bill-text routes on expansion. */
export function billEntryFromRoute(
  route: SplitRoute,
): { kind: 'bill' | 'text'; key: string; title?: string } | null {
  const entry = entryFromRoute(route);
  return entry?.kind === 'bill' || entry?.kind === 'text'
    ? { ...entry, kind: entry.kind }
    : null;
}

/** Selection parameters belong to the list, even with a detail above it. */
export function useSplitSelectionParams() {
  const navigation = useContext(NavigationContext);
  return useCallback(
    (params: Record<string, string>) => {
      if (navigation) navigation.setParams(params);
      else router.setParams(params);
    },
    [navigation],
  );
}

/** The pane entry for an opax.com.au path (an answer's source), or null. */
export function entryForWebPath(path: string, title?: string) {
  try {
    const url = new URL(path, webOrigin);
    if (url.hostname !== new URL(webOrigin).hostname) return null;
    const route =
      fromWebPath(url.pathname + url.search) ?? fromWebPath(url.pathname);
    if (route) {
      const entry = entryForRoute(route as Route, title);
      const passage = url.searchParams.get('passage');
      return entry?.kind === 'doc' && passage
        ? { ...entry, passage: passage.slice(0, 4000) }
        : entry;
    }
    const party = /^\/subject\/party\/([^/?#]+)$/.exec(url.pathname);
    if (party?.[1])
      return entryForRoute(partyRoute(decodeURIComponent(party[1])), title);
  } catch {
    /* A malformed path is not a record. */
  }
  return null;
}

/** The web page a pane entry shares, where its path is known from the key. */
export function sharePath(entry: RecordEntry): string | null {
  switch (entry.kind) {
    case 'bill':
      return `/bill/${entry.key}`;
    case 'party':
      return `/subject/party/${encodeURIComponent(entry.key)}`;
    default:
      return null;
  }
}

/**
 * Whether an entry has pane actions: a record's menu, a bill text's, or
 * Share where the key gives a web path. A person or an electorate has none,
 * so its pane draws no bar: an empty strip a full touch target tall sat over
 * it (sweep 2, item 10).
 */
export function hasPaneActions(entry: RecordEntry): boolean {
  return entry.kind === 'doc' || entry.kind === 'text' || !!sharePath(entry);
}

/** The Back label for an entry below the top of the pane. */
export function entryLabel(entry: RecordEntry): string {
  if (entry.title) return entry.title;
  switch (entry.kind) {
    case 'bill':
      return 'Bill';
    case 'text':
      return 'Bill text';
    case 'party':
      return entry.key;
    case 'electorate':
      return 'Electorate';
    case 'doc':
      return 'Record';
    default:
      return 'Profile';
  }
}

/**
 * Opening a record from a screen drawn in a record pane: it stacks in the
 * pane, with a Back to where it was opened from. Everywhere else, and for
 * routes a pane does not draw, it pushes the route as before.
 */
export function useRecordNavigation() {
  const push = useRecordPush();
  const pane = useSplitPane<RecordEntry>();
  return {
    inPane: pane !== null,
    open(route: Route, title?: string) {
      const entry = pane ? entryForRoute(route, title) : null;
      if (pane && entry) pane.push(entry);
      else push(route as Href);
    },
  };
}
