import { useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  Disclosure,
  InsetGroup,
  PersonRow,
  Text,
} from '../../design/primitives';
import { formatDate } from '../../design/format';
import { rhythm } from '../../design/tokens';
import { personRoute } from '../../navigation/routes';
import {
  representativeProfile,
  type Directory,
  type ElectorateView,
} from '../your-mp/model';
import { preciseDate } from '../your-mp/RepresentativeRows';
import { CachedPortrait } from '../CachedPortrait';
import { representationAt } from './model';

type Term = ElectorateView['terms'][number];
const SHOWN = 4;

/** Earlier service periods: ended terms, newest first. */
export function pastTerms(view: Pick<ElectorateView, 'terms'>): Term[] {
  return view.terms
    .filter((t) => t.end_precision !== 'open' && !!t.end)
    .sort(
      (a, b) =>
        (b.end ?? '').localeCompare(a.end ?? '') ||
        (b.start ?? '').localeCompare(a.start ?? ''),
    );
}

/**
 * A past term in words: "13 Mar 1993 to 29 Jan 1996"; a start less exact
 * than a day reads "From 1993 to 29 Jan 1996". The precision itself is
 * never printed.
 */
export function termSpan(
  t: Pick<Term, 'start' | 'start_precision' | 'end' | 'end_precision'>,
): string | null {
  const start = preciseDate(t.start, t.start_precision);
  const end = preciseDate(t.end, t.end_precision);
  if (!start && !end) return null;
  if (!end) return start ? `Since ${start}` : null;
  if (!start) return `To ${end}`;
  return t.start_precision === 'day'
    ? `${start} to ${end}`
    : `From ${start} to ${end}`;
}

/**
 * @deprecated The page reads termSpan; kept for the copy-helper tests.
 * "13 Mar 1993 to 29 Jan 1996", or "Since 2 Mar 1996 (current at 9 Sep 2026)".
 */
export function serviceSpan(t: {
  start?: string | null;
  end?: string | null;
  observed_through?: string | null;
}): string {
  const start = t.start ? formatDate(t.start, 'short') : '';
  if (t.end)
    return `${start || 'Start not recorded'} to ${formatDate(t.end, 'short')}`;
  const observed = t.observed_through
    ? formatDate(t.observed_through, 'short')
    : '';
  const since = start ? `Since ${start}` : 'Start not recorded';
  return observed ? `${since} (current at ${observed})` : since;
}

/**
 * A roster name as people write it: an all-capitals surname from an old
 * roster ("LEO McLEAY") in title case ("Leo McLeay"), at render. Names
 * already in mixed case are left alone.
 */
export function rosterName(name: string): string {
  if (!/\b[A-Z]{3,}\b|\b(Mc|Mac)[A-Z]{2,}\b/.test(name)) return name;
  return name.replace(
    /\b(Mc|Mac)?([A-Z])([A-Z]+)\b/g,
    (_, prefix: string | undefined, first: string, rest: string) =>
      `${prefix ?? ''}${first}${rest.toLowerCase()}`,
  );
}

function HistoryRow({
  personId,
  party,
  detail,
  view,
  directory,
  testID,
}: {
  personId: string;
  party: string | null;
  detail: string | null;
  view: ElectorateView;
  directory: Directory;
  testID: string;
}) {
  const person = view.people[personId];
  const profile = representativeProfile(personId, directory);
  const name = person ? rosterName(person.name) : 'Name not recorded';
  return (
    <PersonRow
      name={name}
      portrait={
        person ? (
          <CachedPortrait name={person.name} slug={profile?.slug} />
        ) : undefined
      }
      party={party}
      partyStatus="unknown"
      detail={detail}
      testID={testID}
      // Only a member with a native profile links; others are plain text.
      href={profile ? personRoute(profile.slug) : undefined}
      menu={profile ? 'person' : []}
    />
  );
}

/**
 * "Past members": earlier terms, newest first. Four rows, then "Show all
 * {n}" with a fixed label. Nothing draws when the file holds none.
 */
export function ElectorateHistory({
  view,
  directory,
  header = true,
}: {
  view: ElectorateView;
  directory: Directory;
  /** False where the section header already says "Past members". */
  header?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const terms = pastTerms(view);
  if (!terms.length) return null;
  const row = (t: Term, i: number) => (
    <HistoryRow
      key={`${t.person_id}-${t.start ?? ''}-${i}`}
      personId={t.person_id}
      party={t.party_periods.at(-1)?.party ?? t.source_party_label ?? null}
      detail={termSpan(t)}
      view={view}
      directory={directory}
      testID={`electorate-history-${i}`}
    />
  );
  return (
    <View testID="electorate-past-members" style={{ gap: rhythm.groupHeader }}>
      {header ? (
        <Text variant="groupHeader" accessibilityRole="header">
          Past members
        </Text>
      ) : null}
      <InsetGroup>
        {terms.slice(0, SHOWN).map(row)}
        {terms.length > SHOWN ? (
          <Disclosure
            label={`Show all ${terms.length}`}
            open={open}
            onToggle={setOpen}
            testID="electorate-history-all"
          >
            {() => <>{terms.slice(SHOWN).map((t, i) => row(t, i + SHOWN))}</>}
          </Disclosure>
        ) : null}
      </InsetGroup>
    </View>
  );
}

/**
 * The members recorded on a chosen date, in place of today's. The vacancy
 * caveat lives in the section's source sheet.
 */
export function DatedMembers({
  view,
  directory,
  asof,
  onBackToToday,
}: {
  view: ElectorateView;
  directory: Directory;
  asof: string;
  onBackToToday: () => void;
}) {
  const selected = representationAt(view, asof);
  return (
    <View
      testID="electorate-dated-representation"
      style={{ gap: rhythm.groupHeader }}
    >
      {selected.status === 'conflicting' ? (
        <Text wordSafe testID="electorate-dated-conflict">
          The records for this date disagree.
        </Text>
      ) : selected.members.length ? (
        <InsetGroup>
          {selected.members.map((r) => (
            <HistoryRow
              key={r.person_id}
              personId={r.person_id}
              party={r.party}
              detail={null}
              view={view}
              directory={directory}
              testID={`electorate-dated-${r.person_id}`}
            />
          ))}
        </InsetGroup>
      ) : (
        <Text wordSafe testID="electorate-dated-none">
          No member is recorded for this date.
        </Text>
      )}
      <Button
        label="Back to today"
        variant="plain"
        size="compact"
        testID="electorate-date-latest"
        onPress={onBackToToday}
      />
    </View>
  );
}
