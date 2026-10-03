import { formatDate } from '../design/format';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Keyboard, RefreshControl } from 'react-native';
import { catalogs } from '../api/runtime';
import type { Electorate } from '../api/catalogs';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Group,
  Heading,
  LoadingState,
  Screen,
  Section,
  SourceLink,
  Text,
  AsAtLine,
  OpaxWebLink,
  errorMessage,
} from '../design/primitives';
import {
  CHAMBER_NOT_RECORDED,
  chamberName,
  jurisdictionName,
} from '../design/parliament';
import { electorateRoute } from '../navigation/routes';
import { EvidenceFooter, RecordBlock } from './your-mp/Evidence';
import { RepresentativeRows } from './your-mp/RepresentativeRows';
import { loadChoice, saveChoice } from './your-mp/choice-store';
import {
  matchingSeats,
  votingMetaFor,
  type Directory,
  type SeatChoice,
  type YourMPView,
  type ProfileView,
} from './your-mp/model';
export default function YourMP() {
  const [directory, setDirectory] = useState<Directory | null>(null),
    [choice, setChoice] = useState<SeatChoice | null>(null),
    [view, setView] = useState<YourMPView | null>(null);
  const [ready, setReady] = useState(false),
    [query, setQuery] = useState(''),
    [choosing, setChoosing] = useState(false),
    [stateChoosing, setStateChoosing] = useState(false),
    [error, setError] = useState<string | null>(null),
    [saving, setSaving] = useState(false),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([catalogs.directory(), loadChoice()])
      .then(([d, c]) => {
        if (active) {
          setDirectory(d);
          setChoice(c);
          setReady(true);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorMessage(e));
          setReady(true);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!choice) return;
    let active = true;
    catalogs
      .yourMP(choice.seatId, choice.stateSeatIds)
      .then((v) => {
        if (active) {
          setView(v);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [choice, refresh]);
  const [memberRecord, setMemberProfile] = useState<ProfileView | null>(null);
  const [memberFailure, setMemberFailure] = useState<{
    id: string;
    message: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const id =
      view?.members.data?.length === 1
        ? view.members.data[0]!.person_id
        : undefined;
    if (id)
      catalogs
        .profileFor(id)
        .then((p) => {
          if (active) setMemberProfile(p);
        })
        .catch((e) => {
          if (active) setMemberFailure({ id, message: errorMessage(e) });
        });
    return () => {
      active = false;
    };
  }, [view]);
  const memberProfile =
    memberRecord?.personId === view?.members.data?.[0]?.person_id
      ? memberRecord
      : null;
  const retry = () => {
    setBusy(true);
    setRefresh((v) => v + 1);
  };
  async function choose(seat: Electorate) {
    const next: SeatChoice =
      stateChoosing && choice
        ? {
            ...choice,
            stateSeatIds: [
              ...new Set([...choice.stateSeatIds, seat.electorate_id]),
            ],
          }
        : { version: 1, seatId: seat.electorate_id, stateSeatIds: [] };
    setSaving(true);
    try {
      await saveChoice(next);
      Keyboard.dismiss();
      setView(null);
      setChoice(next);
      setChoosing(false);
      setStateChoosing(false);
      setQuery('');
      setError(null);
    } catch {
      setError('Your seat could not be saved on this iPhone. Try again.');
    } finally {
      setSaving(false);
    }
  }
  const chooser = ready && (!choice || choosing || stateChoosing);
  const seats = stateChoosing
    ? (view?.verifiedStateSeats ?? [])
    : (directory?.electorates.data.electorates ?? []);
  const matches = matchingSeats(seats, query);
  return (
    <Screen
      testID="your-mp-screen"
      refreshControl={<RefreshControl refreshing={busy} onRefresh={retry} />}
    >
      {error ? (
        <ErrorState message={error} onRetry={retry} testID="your-mp-error" />
      ) : null}
      {error && choice && !view ? (
        <Button
          label="Change seat"
          onPress={() => {
            setChoosing(true);
            setQuery('');
          }}
        />
      ) : null}
      {!ready || (choice && !view && !chooser && !error) ? (
        <LoadingState shape="people" label="Loading your representatives" />
      ) : null}
      {chooser ? (
        <Group>
          <Heading level={2}>
            {stateChoosing ? 'Choose your state electorate' : 'Find your MP'}
          </Heading>
          <Field
            label="Electorate or member’s name"
            testID="seat-search"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {!query.trim() ? (
            <EmptyState
              message="Search by electorate or member name. Your choice is saved on this iPhone only."
              testID="seat-empty"
            />
          ) : !matches.length ? (
            <EmptyState
              message="No matching electorate or member in this release."
              testID="seat-no-results"
            />
          ) : (
            matches.map((s) => (
              <Group key={s.electorate_id} gap={4}>
                <Button
                  label={s.name}
                  testID={`seat-choice-${s.slug}`}
                  onPress={() => void choose(s)}
                  disabled={saving}
                />
                <Text variant="metadata">
                  {chamberName(s.chamber, s.jurisdiction) ??
                    CHAMBER_NOT_RECORDED}{' '}
                  ·{' '}
                  {jurisdictionName(s.state_code) ??
                    jurisdictionName(s.jurisdiction) ??
                    'Jurisdiction not recorded'}
                </Text>
                <Text variant="fine">
                  {s.representatives.map((r) => r.person.name).join('; ') ||
                    'No verified representative recorded'}
                </Text>
              </Group>
            ))
          )}
          {!stateChoosing ? (
            <SourceLink
              citation="AEC electorate finder"
              url="https://electorate.aec.gov.au/"
              kind="register"
            />
          ) : null}
          {choice ? (
            <Button
              label="Cancel"
              onPress={() => {
                setChoosing(false);
                setStateChoosing(false);
                setQuery('');
              }}
            />
          ) : null}
        </Group>
      ) : null}
      {view && directory && !chooser ? (
        <>
          <Group>
            <Heading level={2} testID="your-seat-name">
              {view.seat.data!.name}
            </Heading>
            <Text variant="metadata">
              {chamberName(
                view.seat.data!.chamber,
                view.seat.data!.jurisdiction,
              ) ?? CHAMBER_NOT_RECORDED}{' '}
              ·{' '}
              {jurisdictionName(view.seat.data!.state_code) ??
                'Jurisdiction not recorded'}
            </Text>
            <EvidenceFooter block={view.seat} id="your-seat" />
            <Button
              label="Electorate record"
              testID="your-electorate"
              onPress={() =>
                router.push(electorateRoute(view.seat.data!.electorate_id))
              }
            />
          </Group>
          {view.seat.data!.chamber !== 'senate' ? (
            <RecordBlock
              title={
                view.members.data && view.members.data.length > 1
                  ? 'Your representatives'
                  : 'Your member'
              }
              id="your-member"
              block={view.members}
              missing="No verified representative is recorded for this date. This does not establish a vacancy."
              retry={retry}
            >
              {(rows) => (
                <RepresentativeRows
                  rows={rows}
                  directory={directory}
                  asAt={view.members.asAt}
                  id="your-member"
                />
              )}
            </RecordBlock>
          ) : null}
          {memberProfile ? (
            <>
              <RecordBlock
                title="Recent bill votes"
                id="your-votes"
                block={memberProfile.blocks.votes}
                missing="No recorded bill votes are held for this member."
                retry={retry}
                date={false}
              >
                {(v) => (
                  <Group>
                    {[
                      ...v.for.map((row) => ({ ...row, side: 'Voted for' })),
                      ...v.against.map((row) => ({
                        ...row,
                        side: 'Voted against',
                      })),
                    ]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .slice(0, 6)
                      .map((row, i) => (
                        <Group key={i} gap={4}>
                          <Text variant="strong">
                            {row.side} · {row.name}
                          </Text>
                          <Text variant="metadata">
                            {row.stage} · {formatDate(row.date!)}
                          </Text>
                          {row.billKey ? (
                            <OpaxWebLink
                              label="Bill record"
                              path={`/bill/${row.billKey}`}
                            />
                          ) : (
                            <Text variant="fine">
                              Not matched to a bill record
                            </Text>
                          )}
                        </Group>
                      ))}
                    {!v.for.length && !v.against.length ? (
                      <EmptyState message="None of their recorded divisions was a vote on a bill itself." />
                    ) : null}
                    <Text>{v.method}</Text>
                    {v.jurisdictions.map((jur) => (
                      <Group key={jur} gap={4}>
                        <Text variant="fine">
                          {jurisdictionName(jur) ?? 'Jurisdiction not recorded'}{' '}
                          voting record
                        </Text>
                        <AsAtLine
                          votes={votingMetaFor(memberProfile.blocks.votes)}
                          jurisdiction={jur}
                        />
                      </Group>
                    ))}
                  </Group>
                )}
              </RecordBlock>
              <RecordBlock
                title="Register changes"
                id="your-register"
                block={memberProfile.blocks.interests}
                missing="No register file is held for this member in the covered registers."
                retry={retry}
              >
                {(r) => (
                  <Group>
                    {Object.entries(r.buckets)
                      .flatMap(([category, bucket]) =>
                        bucket.items
                          .filter((row) => row.date)
                          .map((row) => ({ ...row, category })),
                      )
                      .sort((a, b) =>
                        (b.date ?? '').localeCompare(a.date ?? ''),
                      )
                      .slice(0, 3)
                      .map((row, i) => (
                        <Group key={i} gap={4}>
                          <Text>
                            {row.category} · {row.kind} ·{' '}
                            {formatDate(row.date!)}
                          </Text>
                          <Text>{row.description}</Text>
                          {row.ocr ? (
                            <Text variant="fine">
                              OCR transcription; check the original register.
                            </Text>
                          ) : null}
                        </Group>
                      ))}
                    <Text variant="fine">
                      Changes are shown only where the register records a date.
                    </Text>
                  </Group>
                )}
              </RecordBlock>
            </>
          ) : memberFailure?.id === view.members.data?.[0]?.person_id ? (
            <ErrorState message={memberFailure!.message} onRetry={retry} />
          ) : view.members.data?.length === 1 ? (
            <LoadingState label="Loading the member’s public record" />
          ) : null}
          <Section title="Your senators" testID="your-senators">
            {view.senators.length ? (
              view.senators.map((b, i) => (
                <Group key={i}>
                  <RepresentativeRows
                    rows={b.data ?? []}
                    directory={directory}
                    asAt={b.asAt}
                    id="your-senator"
                  />
                  <EvidenceFooter block={b} id={`your-senators-${i}`} />
                </Group>
              ))
            ) : (
              <EmptyState message="No verified Senate roster is held for this jurisdiction." />
            )}
            <Text testID="your-senators-end" variant="fine">
              Senators are shown as recorded in the dated release.
            </Text>
          </Section>
          <Section title="State members" testID="your-state">
            {view.stateRosterVerified ? (
              <>
                {view.stateMembers.map((b, i) => (
                  <Group key={i}>
                    <RepresentativeRows
                      rows={b.data ?? []}
                      directory={directory}
                      asAt={b.asAt}
                      id="your-state-member"
                    />
                    <EvidenceFooter block={b} id={`your-state-${i}`} />
                  </Group>
                ))}
                {!view.stateMembers.length ? (
                  <Text>
                    Choose your state electorate to see its verified
                    representatives.
                  </Text>
                ) : null}
                <Button
                  label="Choose state electorate"
                  testID="choose-state-seat"
                  onPress={() => {
                    setStateChoosing(true);
                    setQuery('');
                  }}
                />
              </>
            ) : (
              <Text>
                OPAX does not yet have a verified roster of{' '}
                {jurisdictionName(view.seat.data!.state_code) ??
                  'this jurisdiction’s'}{' '}
                members.
              </Text>
            )}
          </Section>
          <Button
            label="Change seat"
            testID="change-seat"
            onPress={() => {
              setChoosing(true);
              setQuery('');
            }}
          />
          <Text variant="fine" testID="your-mp-end">
            Your choice is saved on this iPhone only.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
