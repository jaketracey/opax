import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import {
  AsAtLine,
  Button,
  EmptyState,
  Field,
  Group,
  InfoSheet,
  LinkRow,
  PersonRow,
  RowList,
  Section,
  Text,
} from '../../design/primitives';
import { formatCount, formatDate } from '../../design/format';
import { personRoute } from '../../navigation/routes';
import {
  representativeProfile,
  type Directory,
  type ElectorateView,
} from '../your-mp/model';
import { CachedPortrait } from '../CachedPortrait';
import { representationAt, validDate } from './model';

export function ElectorateDate({
  view,
  directory,
  asof,
  onDate,
}: {
  view: ElectorateView;
  directory: Directory;
  asof: string;
  onDate: (date: string) => void;
}) {
  const [input, setInput] = useState(asof),
    [invalid, setInvalid] = useState(false),
    [open, setOpen] = useState(false);
  const selected = asof ? representationAt(view, asof) : null;
  const dates = [...new Set(view.rosters.map((r) => r.as_of))].sort().reverse();
  const choose = (date: string) => {
    setInput(date);
    setInvalid(false);
    setOpen(false);
    onDate(date);
    AccessibilityInfo.announceForAccessibility(
      date
        ? `Representation on ${formatDate(date)}`
        : 'Latest verified representation',
    );
  };
  return (
    <>
      <Section
        title="View on a date"
        accent="places"
        testID="electorate-date-section"
        info={{
          title: 'About dated representation',
          notes: [
            'Representation is shown only as recorded in the dated release.',
            'Open-ended records are not proof of current membership.',
            'This outline is not a reconstruction of the selected date.',
          ],
        }}
      >
        <LinkRow
          title={asof ? formatDate(asof) : 'Latest check'}
          testID="electorate-date-picker"
          accessibilityLabel={
            asof
              ? `View on a date, ${formatDate(asof)}`
              : 'View representation on a date'
          }
          onPress={() => {
            setInput(asof || view.representatives.asAt || dates[0] || '');
            setInvalid(false);
            setOpen(true);
          }}
        />
        {asof ? (
          <Button
            label="Latest check"
            variant="quiet"
            testID="electorate-date-latest"
            onPress={() => choose('')}
          />
        ) : null}
      </Section>
      <InfoSheet
        visible={open}
        onClose={() => setOpen(false)}
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
                if (validDate(input)) choose(input);
                else setInvalid(true);
              }}
            />
            {dates.length ? (
              <Section title="Roster observation dates" accent="places">
                <RowList>
                  {dates.map((date) => (
                    <LinkRow
                      key={date}
                      title={formatDate(date)}
                      testID={`electorate-date-${date}`}
                      onPress={() => choose(date)}
                    />
                  ))}
                </RowList>
              </Section>
            ) : null}
          </Group>
        }
      />
      {selected ? (
        <Section
          title={`Representation on ${formatDate(asof)}`}
          accent="people"
          testID="electorate-dated-representation"
        >
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
                    name={person?.name ?? 'Unresolved person'}
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
          <Text wordSafe variant="caption">
            {selected.status === 'historical'
              ? 'From dated service records; coverage may be incomplete.'
              : selected.status === 'partial'
                ? 'Partial roster; other members may be missing.'
                : 'Election winners and present-day representation can differ.'}
          </Text>
          <AsAtLine
            asOf={view.identity.asAt}
            citation={view.representatives.sources.map((s) => s.label)}
            savedAt={
              view.representatives.stale ? view.representatives.savedAt : null
            }
          />
        </Section>
      ) : null}
    </>
  );
}
export function ElectorateHistory({
  view,
  directory,
}: {
  view: ElectorateView;
  directory: Directory;
}) {
  const terms = [...view.terms].sort((a, b) =>
    (b.start ?? '').localeCompare(a.start ?? ''),
  );
  return (
    <Section
      title="Representation history"
      accent="people"
      testID="electorate-history"
      info={{
        title: 'About representation history',
        notes: [
          'Dated service records, newest first. Party changes may create a new period. Open-ended records are not proof of current membership.',
          'End dates are exclusive. Gaps indicate missing coverage.',
          'Explore each parliamentarian’s page for their speeches, divisions and other indexed records.',
        ],
      }}
    >
      {terms.length ? (
        <Text variant="caption">
          {formatCount(terms.length)} service periods · newest first
        </Text>
      ) : (
        <EmptyState message="Historical service has not yet been imported." />
      )}
      <RowList>
        {terms.map((t, i) => {
          const person = view.people[t.person_id],
            profile = representativeProfile(t.person_id, directory);
          const span = `${t.start ? formatDate(t.start, 'short') : 'Unknown'} to ${t.end ? formatDate(t.end, 'short') : `end not recorded; observed ${formatDate(t.observed_through, 'short')}`}`;
          return (
            <PersonRow
              key={`${t.person_id}-${t.start}-${i}`}
              name={person?.name ?? 'Unresolved person'}
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
      {terms.length ? (
        <AsAtLine
          asOf={
            terms
              .map((t) => t.observed_through)
              .sort()
              .at(-1) ?? null
          }
          citation={view.identity.sources.map((s) => s.label)}
          savedAt={view.identity.stale ? view.identity.savedAt : null}
        />
      ) : null}
    </Section>
  );
}
