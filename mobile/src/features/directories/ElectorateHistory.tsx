import { useState } from 'react';
import { AccessibilityInfo, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useReduceMotion } from '../../design/accessibility';
import { router } from 'expo-router';
import {
  AsAtLine,
  Button,
  EmptyState,
  Field,
  Group,
  PersonRow,
  RowList,
  Section,
  Screen,
  Text,
} from '../../design/primitives';
import { formatDate } from '../../design/format';
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
    [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const reducedMotion = useReduceMotion();
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
      <Section title="View on a date" testID="electorate-date-section">
        <Button
          label={asof ? formatDate(asof) : 'View representation on a date'}
          testID="electorate-date-picker"
          onPress={() => {
            setInput(asof || view.representatives.asAt || dates[0] || '');
            setOpen(true);
          }}
        />
        <Modal
          visible={open}
          presentationStyle="pageSheet"
          animationType={reducedMotion ? 'none' : 'slide'}
          onRequestClose={() => setOpen(false)}
        >
          <Screen testID="electorate-date-sheet">
            <Button
              label="Done"
              testID="electorate-date-done"
              onPress={() => setOpen(false)}
            />
            <Section title="View on a date">
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
                onChangeText={setInput}
                autoCorrect={false}
                autoCapitalize="none"
                placeholder="YYYY-MM-DD"
                returnKeyType="done"
              />
              {invalid ? (
                <Text tone="danger" testID="electorate-date-error">
                  Enter a valid date as YYYY-MM-DD.
                </Text>
              ) : null}
              <Button
                label="View"
                testID="electorate-date-view"
                onPress={() => {
                  if (validDate(input)) choose(input);
                  else setInvalid(true);
                }}
              />
              {dates.length ? (
                <Text variant="metadata">Roster observation dates</Text>
              ) : null}
              {dates.map((date) => (
                <Button
                  key={date}
                  label={formatDate(date)}
                  testID={`electorate-date-${date}`}
                  onPress={() => choose(date)}
                />
              ))}
            </Section>
          </Screen>
        </Modal>
        {asof ? (
          <Button
            label="Latest check"
            testID="electorate-date-latest"
            onPress={() => choose('')}
          />
        ) : null}
      </Section>
      {selected ? (
        <Section
          title={`Representation on ${formatDate(asof)}`}
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
                    detail={`As of ${formatDate(asof)}`}
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
          <Text wordSafe variant="fine">
            {selected.status === 'historical'
              ? 'From dated service records; coverage may be incomplete.'
              : selected.status === 'partial'
                ? 'Partial roster; other members may be missing.'
                : 'Election winners and present-day representation can differ.'}
          </Text>
          <AsAtLine
            asOf={asof}
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
    <Section title="Representation history" testID="electorate-history">
      <Text wordSafe variant="fine">
        {terms.length
          ? 'Dated service records, newest first. Party changes may create a new period. Open-ended records are not proof of current membership.'
          : 'Historical service has not yet been imported.'}
      </Text>
      <RowList>
        {terms.map((t, i) => {
          const person = view.people[t.person_id],
            profile = representativeProfile(t.person_id, directory);
          const span = `${t.start ? formatDate(t.start) : 'Unknown'} – ${t.end ? `${formatDate(t.end)} (exclusive)` : `end not recorded; observed ${formatDate(t.observed_through)}`}`;
          return (
            <Group key={`${t.person_id}-${t.start}-${i}`}>
              <PersonRow
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
              <AsAtLine
                asOf={t.observed_through}
                citation={view.identity.sources
                  .filter((s) =>
                    directory.manifest.data.sources.some(
                      (source) =>
                        t.sources.includes(source.source_id) &&
                        source.url === s.url,
                    ),
                  )
                  .map((s) => s.label)}
                savedAt={view.identity.stale ? view.identity.savedAt : null}
              />
            </Group>
          );
        })}
      </RowList>
      <Text variant="fine">
        Explore each parliamentarian’s page for their speeches, divisions and
        other indexed records.
      </Text>
    </Section>
  );
}
