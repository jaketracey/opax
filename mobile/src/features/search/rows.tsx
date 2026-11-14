import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type {
  Electorate,
  ElectorateIndex,
  PeopleCatalog,
} from '../../api/catalog-decoders';
import type { SuggestionRoster } from '../../api/selectors';
import {
  BillRow,
  InlineError,
  LinkRow,
  PersonRow,
  SuggestionRow,
  rowMenus,
  useRowFollow,
  type RowMenuAction,
} from '../../design/primitives';
import { billStatus, jurisdictionName } from '../../design/parliament';
import { formatDate } from '../../design/format';
import { personRoute, partyRoute } from '../../navigation/routes/people';
import { billRoute } from '../../navigation/routes/bills';
import { electorateRoute } from '../../navigation/routes/your-mp';
import { topicRoute } from '../../navigation/routes/search';
import { openOnWeb } from '../../navigation/external';
import { useSetAsMyElectorate } from '../your-mp/useSetAsMyElectorate';
import { CachedPortrait } from '../CachedPortrait';
import { fold, type Match } from './ranking';
import { openSuggestedPerson } from './navigation';
import { useSplitRow } from './split';

/** What the rows read from the cached static files (never a request). */
export interface RowSources {
  roster?: SuggestionRoster | null;
  electorates?: ElectorateIndex | null;
  people?: PeopleCatalog | null;
}
type Person = SuggestionRoster['people'][number];

const stateNames: Record<string, string> = {
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  WA: 'Western Australia',
  SA: 'South Australia',
  TAS: 'Tasmania',
  ACT: 'Australian Capital Territory',
  NT: 'Northern Territory',
};
const stateName = (code?: string | null) =>
  code
    ? (stateNames[code.toUpperCase()] ?? jurisdictionName(code) ?? code)
    : null;

/**
 * A person's place line (specs/search.md 2.15): "Member for Grayndler, New
 * South Wales", "Senator for Tasmania", "Former member for Grayndler, New
 * South Wales". Never "Recorded representation", never an ISO date, never
 * "Formerly" (reserved for a change of party).
 */
export function placeLine(person: Person): string | null {
  const seat =
    (person.representation ?? []).find(
      (r) => r.jurisdiction === 'federal' && r.chamber !== 'senate_committee',
    ) ?? person.representation?.[0];
  if (!seat) return null;
  const state = stateName(seat.state);
  const sitting = person.current !== false;
  if (seat.chamber === 'senate')
    return state
      ? `${sitting ? 'Senator' : 'Former senator'} for ${state}`
      : sitting
        ? 'Senator'
        : 'Former senator';
  const where = [seat.electorate, state].filter(Boolean).join(', ');
  return where ? `${sitting ? 'Member' : 'Former member'} for ${where}` : null;
}

/** The canonical person ID the people catalogue holds for a roster row. */
function canonicalId(person: Person, sources: RowSources) {
  if (!person.pid || !sources.people) return null;
  return (
    sources.people.people.find((p) => p.legacy_person_id === person.pid)
      ?.person_id ?? null
  );
}
/** A sitting House member's seat, for "Set {Seat} as my electorate". */
function memberSeat(person: Person, sources: RowSources): Electorate | null {
  if (!person.current || !sources.electorates) return null;
  const house = person.representation?.find(
    (r) => r.jurisdiction === 'federal' && r.chamber === 'representatives',
  );
  if (!house) return null;
  return (
    sources.electorates.electorates.find(
      (s) =>
        s.jurisdiction === 'federal' &&
        s.chamber === 'representatives' &&
        s.status !== 'historical' &&
        (s.representatives.some(
          (r) => !!person.pid && r.person.legacy_person_id === person.pid,
        ) ||
          fold(s.name) === fold(house.electorate)),
    ) ?? null
  );
}

/** Seat rows and current House members' rows carry the seat action. */
function WithSeat({
  seat,
  children,
}: {
  seat: Electorate | null;
  children: (setSeat?: {
    label: string;
    onSelect: () => void;
  }) => React.ReactNode;
}) {
  if (!seat) return <>{children(undefined)}</>;
  return <SeatAction seat={seat}>{children}</SeatAction>;
}
function SeatAction({
  seat,
  children,
}: {
  seat: Electorate;
  children: (setSeat?: {
    label: string;
    onSelect: () => void;
  }) => React.ReactNode;
}) {
  const action = useSetAsMyElectorate(seat);
  return (
    <>
      {children(
        action.visible
          ? { label: action.label, onSelect: () => void action.run() }
          : undefined,
      )}
    </>
  );
}

export type RowVariant = 'suggestion' | 'result';
export interface MatchRowProps {
  match: Match;
  q: string;
  sources: RowSources;
  variant: RowVariant;
  testID?: string;
}

/** One match, drawn as a suggestion (typing) or a result row (All, scopes). */
export function MatchRow(props: MatchRowProps) {
  switch (props.match.kind) {
    case 'people':
      return <PersonMatch {...props} person={props.match.item} />;
    case 'electorates':
      return <SeatMatch {...props} seat={props.match.item} />;
    case 'bills':
      return <BillMatch {...props} bill={props.match.item} />;
    case 'parties':
      return <PartyMatch {...props} name={props.match.item.name} />;
    case 'topics':
      return <TopicMatchRow {...props} topic={props.match.item} />;
  }
}

const matched = (q: string) => (q.trim() ? [q.trim()] : []);

function PersonMatch({
  person,
  sources,
  variant,
  testID,
}: MatchRowProps & { person: Person }) {
  const id = useMemo(() => canonicalId(person, sources), [person, sources]);
  const seat = useMemo(() => memberSeat(person, sources), [person, sources]);
  const follow = useRowFollow('person', id ?? undefined, person.name);
  const [failed, setFailed] = useState<{ retry: () => void } | null>(null);
  const href = id ? personRoute(id, person.name) : undefined;
  const split = useSplitRow(variant === 'result' ? href : null, person.name);
  const open = () => {
    setFailed(null);
    void openSuggestedPerson(person.name).catch(() =>
      setFailed({ retry: open }),
    );
  };
  // Identity guard: a person not yet joined to the people catalogue shows
  // no party or place (it may be a surname stub or a twin spelling).
  const place = id ? placeLine(person) : null;
  const party = id ? person.party_now || person.party : null;
  const rowID =
    testID ?? `search-suggestion-person-${person.pid ?? person.name}`;
  return (
    <WithSeat seat={seat}>
      {(setSeat) => {
        const menu: RowMenuAction[] | undefined = id
          ? rowMenus.person({ name: person.name, slug: id, ...follow, setSeat })
          : setSeat
            ? [
                {
                  title: setSeat.label,
                  symbol: 'map',
                  onPress: setSeat.onSelect,
                },
              ]
            : undefined;
        return (
          <View>
            <PersonRow
              name={person.name}
              party={party}
              partyStatus={person.current === false ? 'former' : 'current'}
              place={place}
              portrait={
                <CachedPortrait
                  name={person.name}
                  testID={`${rowID}-portrait`}
                />
              }
              href={href}
              {...split}
              onPress={href ? undefined : open}
              menu={menu}
              testID={rowID}
            />
            {failed ? (
              <InlineError
                subject="This page"
                message="This page couldn’t be opened."
                onRetry={failed.retry}
                testID={`${rowID}-error`}
              />
            ) : null}
          </View>
        );
      }}
    </WithSeat>
  );
}

function SeatMatch({
  seat,
  q,
  variant,
  testID,
}: MatchRowProps & { seat: Electorate }) {
  const follow = useRowFollow('electorate', seat.electorate_id, seat.name);
  const member = seat.representatives.map((r) => r.person.name).join(', ');
  const secondary = [stateName(seat.state_code), member || 'No member recorded']
    .filter(Boolean)
    .join(' · ');
  const href = electorateRoute(seat.electorate_id, undefined, seat.name);
  const split = useSplitRow(variant === 'result' ? href : null, seat.name);
  const rowID = testID ?? `search-suggestion-electorate-${seat.electorate_id}`;
  return (
    <WithSeat seat={seat}>
      {(setSeat) => {
        const menu = rowMenus.place({
          title: seat.name,
          path: `/subject/electorate/${seat.slug}`,
          ...follow,
          setSeat,
        });
        return variant === 'suggestion' ? (
          <SuggestionRow
            kind="electorate"
            name={seat.name}
            secondary={secondary}
            matches={matched(q)}
            href={href}
            menu={menu}
            testID={rowID}
          />
        ) : (
          <LinkRow
            title={seat.name}
            detail={secondary}
            symbol="map"
            href={href}
            {...split}
            menu={menu}
            testID={rowID}
          />
        );
      }}
    </WithSeat>
  );
}

function BillMatch({
  bill,
  q,
  variant,
  testID,
}: MatchRowProps & {
  bill: Extract<Match, { kind: 'bills' }>['item'];
}) {
  const title = bill.short_title || bill.title;
  const rowID = testID ?? `search-suggestion-bill-${bill.key}`;
  const href = billRoute(bill.key, title);
  const split = useSplitRow(variant === 'result' ? href : null, title);
  const introduced = bill.introduced
    ? `Introduced ${formatDate(bill.introduced, 'short')}`
    : null;
  if (variant === 'suggestion')
    return (
      <SuggestionRow
        kind="bill"
        name={title}
        secondary={[billStatus(bill.status), introduced]
          .filter(Boolean)
          .join(' · ')}
        matches={matched(q)}
        href={href}
        testID={rowID}
      />
    );
  return (
    <BillRow
      billKey={bill.key}
      title={title}
      status={billStatus(bill.status)}
      rawStatus={bill.status}
      date={bill.introduced}
      meta={bill.portfolio ? { portfolio: bill.portfolio } : undefined}
      href={href}
      {...split}
      testID={rowID}
    />
  );
}

function PartyMatch({
  name,
  q,
  variant,
  testID,
}: MatchRowProps & { name: string }) {
  const follow = useRowFollow('party', name, name);
  const href = partyRoute(name);
  const split = useSplitRow(variant === 'result' ? href : null, name);
  const menu = rowMenus.place({
    title: name,
    path: `/subject/party/${encodeURIComponent(name)}`,
    ...follow,
  });
  const rowID = testID ?? `search-suggestion-party-${name}`;
  return variant === 'suggestion' ? (
    <SuggestionRow
      kind="party"
      name={name}
      matches={matched(q)}
      href={href}
      menu={menu}
      testID={rowID}
    />
  ) : (
    <LinkRow
      title={name}
      symbol="person.3"
      href={href}
      {...split}
      menu={menu}
      testID={rowID}
    />
  );
}

function TopicMatchRow({
  topic,
  q,
  variant,
  testID,
}: MatchRowProps & {
  topic: Extract<Match, { kind: 'topics' }>['item'];
}) {
  const rowID = testID ?? `search-suggestion-topic-${topic.slug}`;
  const href = topicRoute(topic.slug, {}, topic.title);
  const menu = rowMenus.record({
    title: topic.title,
    path: `/subject/topic/${topic.slug}`,
  });
  return variant === 'suggestion' ? (
    <SuggestionRow
      kind="topic"
      name={topic.title}
      secondary={topic.description || undefined}
      matches={matched(q)}
      href={href}
      menu={menu}
      testID={rowID}
    />
  ) : (
    <LinkRow
      title={topic.title}
      detail={topic.description || undefined}
      symbol="number"
      href={href}
      menu={menu}
      testID={rowID}
    />
  );
}

/**
 * Where a result row opens, for the iPad pane's first selection: null for
 * a person whose identity is not yet resolved and for topics (they push).
 */
export function matchRoute(match: Match, sources: RowSources) {
  switch (match.kind) {
    case 'people': {
      const id = canonicalId(match.item, sources);
      return id ? personRoute(id, match.item.name) : null;
    }
    case 'electorates':
      return electorateRoute(
        match.item.electorate_id,
        undefined,
        match.item.name,
      );
    case 'bills':
      return billRoute(
        match.item.key,
        match.item.short_title || match.item.title,
      );
    case 'parties':
      return partyRoute(match.item.name);
    case 'topics':
      return null;
  }
}

/** Opens a page on opax.com.au when its native route can't be resolved. */
export const openWeb = (path: string, title: string) =>
  void openOnWeb(path, title);
