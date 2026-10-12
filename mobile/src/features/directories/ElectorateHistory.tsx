import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import {
  Button,
  EmptyState,
  Field,
  Group,
  Heading,
  InfoSheet,
  LinkRow,
  PersonRow,
  RowList,
  Section,
  Text,
} from '../../design/primitives';
import { formatCount, formatDate } from '../../design/format';
import { rhythm } from '../../design/tokens';
import { personRoute } from '../../navigation/routes';
import {
  representativeProfile,
  type Directory,
  type ElectorateView,
} from '../your-mp/model';
import { BlockSource, representationBlock } from '../your-mp/Evidence';
import { CachedPortrait } from '../CachedPortrait';
import { representationAt, validDate } from './model';

/**
 * Representation over time: an "On a date" row that shows who represented
 * the seat on any date, then the dated service periods, newest first, and
 * one source line for both.
 */
export function ElectorateHistory({
  view,
  directory,
  asof,
  onDate,
}: {
  view: ElectorateView;
  directory: Directory;
  /** The chosen date (YYYY-MM-DD), or '' for the latest check. */
  asof: string;
  onDate: (date: string) => void;
}) {
  // Each opening is a fresh sheet that starts from the chosen date.
  const [open, setOpen] = useState(false),
    [opening, setOpening] = useState(0);
  const terms = [...view.terms].sort((a, b) =>
    (b.start ?? '').localeCompare(a.start ?? ''),
  );
  const selected = asof ? representationAt(view, asof) : null;
  const choose = (date: string) => {
    setOpen(false);
    onDate(date);
    AccessibilityInfo.announceForAccessibility(
      date
        ? `Representation on ${formatDate(date)}`
        : 'Latest verified representation',
    );
  };
  const observed =
    terms
      .map((t) => t.observed_through)
      .sort()
      .at(-1) ?? null;
  return (
    <Section
      title="Representation history"
      accent="people"
      testID="electorate-history"
    >
      <RowList>
        <LinkRow
          title="On a date"
          value={asof ? formatDate(asof, 'short') : 'Latest'}
          testID="electorate-date-picker"
          accessibilityLabel={
            asof
              ? `View on a date, ${formatDate(asof)}`
              : 'View representation on a date'
          }
          onPress={() => {
            setOpening((n) => n + 1);
            setOpen(true);
          }}
        />
      </RowList>
      {selected ? (
        <Group gap={rhythm.tight} testID="electorate-dated-representation">
          <Heading level={3}>{`Representation on ${formatDate(asof)}`}</Heading>
          {selected.status === 'conflicting' ? (
            <Text>Conflicting service records require review.</Text>
          ) : selected.members.length ? (
            <RowList>
              {selected.members.map((r) => {
                const person = view.people[r.person_id],
                  profile = representativeProfile(r.person_id, directory);
                return (
                  <PersonRow
                    key={r.person_id}
                    name={
                      person ? rosterName(person.name) : 'Unresolved person'
                    }
                    portrait={
                      person ? (
                        <CachedPortrait
                          name={person.name}
                          slug={profile?.slug}
                        />
                      ) : undefined
                    }
                    party={r.party}
                    partyStatus="unknown"
                    testID={`electorate-dated-${r.person_id}`}
                    onPress={
                      profile
                        ? () => router.push(personRoute(profile.slug))
                        : undefined
                    }
                  />
                );
              })}
            </RowList>
          ) : (
            <EmptyState
              message={
                selected.status === 'verified'
                  ? 'Vacant at this observation.'
                  : 'Representation has not yet been verified for this date.'
              }
            />
          )}
          {/* The one caveat a dated answer needs, beside it. */}
          <Text wordSafe variant="fine">
            {selected.status === 'historical'
              ? 'From dated service records; coverage may be incomplete.'
              : selected.status === 'partial'
                ? 'Partial roster; other members may be missing.'
                : 'Election winners and present-day representation can differ.'}
          </Text>
          <Button
            label="Latest check"
            variant="quiet"
            size="compact"
            testID="electorate-date-latest"
            onPress={() => choose('')}
          />
        </Group>
      ) : null}
      {terms.length ? (
        <Text variant="fine">
          {formatCount(terms.length)} service periods · newest first
        </Text>
      ) : (
        <EmptyState message="Historical service has not yet been imported." />
      )}
      <RowList>
        {terms.map((t, i) => {
          const person = view.people[t.person_id],
            profile = representativeProfile(t.person_id, directory);
          const span = serviceSpan(t);
          return (
            <PersonRow
              key={`${t.person_id}-${t.start}-${i}`}
              name={person ? rosterName(person.name) : 'Unresolved person'}
              portrait={
                person ? (
                  <CachedPortrait name={person.name} slug={profile?.slug} />
                ) : undefined
              }
              detail={[
                span,
                t.party_periods
                  .map((p) => p.party)
                  .filter(Boolean)
                  .join(' → '),
                t.start_precision !== 'day'
                  ? `Start precision: ${t.start_precision}`
                  : null,
              ]
                .filter(Boolean)
                .join('\n')}
              testID={`electorate-history-${i}`}
              onPress={
                profile
                  ? () => router.push(personRoute(profile.slug))
                  : undefined
              }
            />
          );
        })}
      </RowList>
      {terms.length || selected ? (
        <BlockSource
          block={{
            ...view.identity,
            asAt: observed ?? view.identity.asAt,
            sources: representationBlock({
              ...view.identity,
              sources: [
                ...view.identity.sources,
                ...(selected ? view.representatives.sources : []),
              ],
            }).sources,
            stale:
              view.identity.stale || (!!selected && view.representatives.stale),
          }}
          title="About representation history"
          notes={[
            'Dated service records, newest first. Party changes may create a new period. Open-ended records are not proof of current membership.',
            'End dates are exclusive. Gaps indicate missing coverage.',
            'On a date: representation is shown only as recorded in the dated release, and the outline is not a reconstruction of that date.',
            'Explore each parliamentarian’s page for their speeches, divisions and other indexed records.',
          ]}
          testID="electorate-history-source"
        />
      ) : null}
      <DateSheet
        key={opening}
        view={view}
        asof={asof}
        open={open}
        onClose={() => setOpen(false)}
        onChoose={choose}
      />
    </Section>
  );
}

/**
 * A service period in words: "2 Mar 1996 to 29 Jan 1996", and an open-ended
 * one as "Since 2 Mar 1996 (current at 9 Sep 2026)" (pass 5, P3-5).
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

/** The date picker: a native wheel, a typed date, and the roster's dates. */
function DateSheet({
  view,
  asof,
  open,
  onClose,
  onChoose,
}: {
  view: ElectorateView;
  asof: string;
  open: boolean;
  onClose: () => void;
  onChoose: (date: string) => void;
}) {
  const dates = [...new Set(view.rosters.map((r) => r.as_of))].sort().reverse();
  const [input, setInput] = useState(
      asof || view.representatives.asAt || dates[0] || '',
    ),
    [invalid, setInvalid] = useState(false);
  return (
    <InfoSheet
      visible={open}
      onClose={onClose}
      title="View on a date"
      notes={[]}
      testID="electorate-date-sheet"
      extra={
        <Group>
          <DateTimePicker
            testID="electorate-native-date-picker"
            accessibilityLabel="View representation on a date"
            value={
              new Date(
                `${validDate(input) ? input : dates[0] || '2000-01-01'}T12:00:00`,
              )
            }
            mode="date"
            display="spinner"
            themeVariant="light"
            onValueChange={(_, date) => {
              if (date) {
                setInput(
                  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
                );
                setInvalid(false);
              }
            }}
          />
          <Field
            label="Date (YYYY-MM-DD)"
            testID="electorate-date-input"
            value={input}
            onChangeText={(date) => {
              setInput(date);
              setInvalid(false);
            }}
            autoCorrect={false}
            autoCapitalize="none"
            placeholder="YYYY-MM-DD"
            multiline
            scrollEnabled={false}
            submitBehavior="blurAndSubmit"
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            error={invalid ? 'Enter a valid date as YYYY-MM-DD.' : undefined}
          />
          <Button
            label="View"
            variant="primary"
            testID="electorate-date-view"
            onPress={() => {
              if (validDate(input)) onChoose(input);
              else setInvalid(true);
            }}
          />
          {dates.length ? (
            <Group gap={rhythm.tight}>
              <Heading level={3}>Roster observation dates</Heading>
              <RowList>
                {dates.map((date) => (
                  <LinkRow
                    key={date}
                    title={formatDate(date)}
                    testID={`electorate-date-${date}`}
                    onPress={() => onChoose(date)}
                  />
                ))}
              </RowList>
            </Group>
          ) : null}
        </Group>
      }
    />
  );
}
