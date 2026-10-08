import { useCallback, useMemo, useState } from 'react';
import { catalogs } from '../../api/runtime';
import {
  Screen,
  Section,
  Group,
  Text,
  Field,
  Button,
  StepButtons,
  MachineWritten,
  LinkRow,
  RowList,
  Disclosure,
  EmptyState,
} from '../../design/primitives';
import { formatDate } from '../../design/format';
import { useRead, ReadState, SourcesFold } from '../reports/parts';
import { openRecord } from '../reports/open';
import { explore } from './runtime';
import { voicesNote, yearMachineNote, yearOpening } from './model';
import { ExploreHeader } from './parts';
import { YearPictures } from './YearPictures';
const loadBills = () => catalogs.bills();
export default function TimeMachine() {
  const [input, setInput] = useState('2025'),
    [year, setYear] = useState<number | null>(null);
  const valid =
    /^\d{4}$/.test(input) && Number(input) >= 1998 && Number(input) <= 2026;
  return (
    <>
      <ExploreHeader title="Time machine" game="tm" />
      <Screen column="wide" testID="explore-tm-screen">
        <Section title="Time machine">
          <Field
            label="Year, 1998 to 2026"
            value={input}
            onChangeText={setInput}
            keyboardType="number-pad"
            testID="tm-year-input"
          />
          <Button
            label="Open year"
            variant="primary"
            disabled={!valid}
            testID="tm-open"
            onPress={() => setYear(Number(input))}
          />
        </Section>
        {year !== null ? (
          <YearView
            year={year}
            onYear={(v) => {
              setYear(v);
              setInput(String(v));
            }}
          />
        ) : null}
      </Screen>
    </>
  );
}
function YearView({
  year,
  onYear,
}: {
  year: number;
  onYear: (v: number) => void;
}) {
  const load = useCallback(() => explore.year(year), [year]),
    read = useRead(load),
    bills = useRead(loadBills);
  const prose = yearOpening(read.record?.data.brief.answer ?? '');
  const yearBills = useMemo(
    () =>
      bills.record?.data.bills
        .filter((b) => b.introduced?.startsWith(String(year)))
        .sort((a, b) =>
          (a.introduced ?? '').localeCompare(b.introduced ?? ''),
        ) ?? [],
    [bills.record, year],
  );
  return (
    <Group>
      <Text variant="figure" testID="tm-selected-year">
        {year}
      </Text>
      <StepButtons
        previous={{
          label: 'Previous year',
          accessibilityLabel: `Previous year, ${year - 1}`,
          disabled: year === 1998,
          onPress: () => onYear(year - 1),
          testID: 'tm-previous',
        }}
        next={{
          label: 'Next year',
          accessibilityLabel: `Next year, ${year + 1}`,
          disabled: year === 2026,
          onPress: () => onYear(year + 1),
          testID: 'tm-next',
        }}
      />
      <ReadState
        read={read}
        citation="OPAX pre-generated year brief and voices"
        testID="tm-year"
      >
        {(data) => (
          <Group>
            <Section title="The year in brief">
              <MachineWritten
                explanation={yearMachineNote(data)}
                testID="explore-machine-pill"
              />
              <Text wordSafe testID="tm-brief">
                {prose.lead}
              </Text>
              {prose.rest.length ? (
                <Disclosure label="Read the rest" testID="tm-rest">
                  <Group>
                    {prose.rest.map((p, i) => (
                      <Text key={i} wordSafe>
                        {p}
                      </Text>
                    ))}
                  </Group>
                </Disclosure>
              ) : null}
              <SourcesFold
                sources={data.brief.sources.map((s) => ({
                  ...s,
                  title: s.title ?? s.slug,
                  speaker: s.speaker ?? undefined,
                  party: s.party ?? undefined,
                  state: s.state ?? undefined,
                  date: s.date ?? undefined,
                }))}
                label="The speeches it drew on"
                testID="tm-records"
              />
            </Section>
            <Section
              title="Voices"
              info={{ title: 'About these voices', notes: [voicesNote(data)] }}
            >
              <RowList>
                {data.voices.speakers
                  .filter((s) => s.speeches >= 2)
                  .slice(0, 6)
                  .map((s) => (
                    <Text key={s.name} wordSafe variant="strong">
                      {s.name}
                      {s.party ? ` · ${s.party}` : ''} ·{' '}
                      {s.speeches.toLocaleString('en-AU')} speeches
                    </Text>
                  ))}
              </RowList>
            </Section>
            <Section title="Bills">
              <Disclosure label={`Introduced in ${year}`} testID="tm-bills">
                <ReadState
                  read={bills}
                  citation="OPAX static bill register"
                  testID="tm-bill-register"
                >
                  {() => (
                    <RowList>
                      {yearBills.length ? (
                        yearBills.map((b) => (
                          <LinkRow
                            key={b.key}
                            title={b.title}
                            detail={
                              b.introduced
                                ? formatDate(b.introduced)
                                : undefined
                            }
                            onPress={() =>
                              openRecord(`/bill/${b.key}`, b.title)
                            }
                          />
                        ))
                      ) : (
                        <EmptyState message="No bills are available for this year in the static register." />
                      )}
                    </RowList>
                  )}
                </ReadState>
              </Disclosure>
            </Section>
            <Section title="The year in pictures">
              <Disclosure label="Photographs" testID="tm-photos">
                {() => <YearPictures year={year} />}
              </Disclosure>
            </Section>
          </Group>
        )}
      </ReadState>
    </Group>
  );
}
