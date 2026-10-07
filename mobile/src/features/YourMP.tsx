import { PartialNotice, SavedCopyNotice } from './CatalogNotice';
import { LocationSuggestion } from './electorate-map/LocationSuggestion';
import { formatDate } from '../design/format';
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Keyboard, RefreshControl, StyleSheet, View } from 'react-native';
import { catalogs } from '../api/runtime';
import type { Electorate } from '../api/catalogs';
import {
  Button,
  Disclosure,
  EmptyState,
  ErrorState,
  Field,
  Group,
  Heading,
  LinkRow,
  LoadingState,
  RowList,
  Screen,
  Section,
  SourceLink,
  Text,
  AsAtLine,
  errorMessage,
} from '../design/primitives';
import { rhythm } from '../design/tokens';
import { VoteSide } from './your-mp/VoteSide';
import {
  CHAMBER_NOT_RECORDED,
  chamberName,
  jurisdictionName,
} from '../design/parliament';
import { billRoute, electorateRoute } from '../navigation/routes';
import { EvidenceFooter, RecordBlock } from './your-mp/Evidence';
import { RepresentativeRows } from './your-mp/RepresentativeRows';
import { FollowingEntry } from './follows/FollowingEntry';
import { loadChoice, saveChoice } from './your-mp/choice-store';
import { useSeatChooserRequest } from './your-mp/chooser-request';
import {
  matchingSeats,
  replaceStateSeat,
  registerCategoryLabel,
  registerChangeLabel,
  seatContext,
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
    [busy, setBusy] = useState(false),
    [registerOpen, setRegisterOpen] = useState(false),
    [registerLoadedFor, setRegisterLoadedFor] = useState<string | null>(null);
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
        .profileFor(id, { includeInterests: registerOpen })
        .then((p) => {
          if (active) {
            setMemberProfile(p);
            setMemberFailure(null);
            if (registerOpen) setRegisterLoadedFor(id);
          }
        })
        .catch((e) => {
          if (active) setMemberFailure({ id, message: errorMessage(e) });
        });
    return () => {
      active = false;
    };
  }, [view, registerOpen]);
  const memberProfile =
    memberRecord?.personId === view?.members.data?.[0]?.person_id
      ? memberRecord
      : null;
  const retry = () => {
    setBusy(true);
    setRefresh((v) => v + 1);
  };
  // The welcome tour's last step opens the chooser (src/onboarding/).
  const openChooser = useCallback(() => {
    setChoosing(true);
    setStateChoosing(false);
    setQuery('');
  }, []);
  useSeatChooserRequest(openChooser);
  async function choose(seat: Electorate) {
    const next: SeatChoice =
      stateChoosing && choice
        ? replaceStateSeat(choice, seat, view?.verifiedStateSeats ?? [])
        : { version: 1, seatId: seat.electorate_id, stateSeatIds: [] };
    await persist(next);
  }
  async function persist(next: SeatChoice) {
    setSaving(true);
    try {
      await saveChoice(next);
      Keyboard.dismiss();
      setView(null);
      setRegisterOpen(false);
      setRegisterLoadedFor(null);
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
  const selectedStateSeats =
    view?.verifiedStateSeats.filter((s) =>
      choice?.stateSeatIds.includes(s.electorate_id),
    ) ?? [];
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
          {directory?.electorates.partial ? (
            <PartialNotice testID="seat-directory-partial" />
          ) : null}
          {directory?.electorates.staleReason ? (
            <SavedCopyNotice reason={directory.electorates.staleReason} />
          ) : null}
          {!stateChoosing && directory ? (
            <LocationSuggestion
              seats={directory.electorates.data.electorates}
              onConfirm={(seat) => void choose(seat)}
              disabled={saving}
            />
          ) : null}
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
              icon="magnifyingglass"
              message="Search by electorate or member name. Your choice is saved on this device. Device backups may include it."
              testID="seat-empty"
            />
          ) : !matches.length ? (
            <EmptyState
              message="No matching electorate or member in this release."
              testID="seat-no-results"
            />
          ) : (
            <RowList>
              {matches.map((s) => (
                <LinkRow
                  key={s.electorate_id}
                  title={s.name}
                  detail={[
                    s.representatives.map((r) => r.person.name).join('; ') ||
                      'No verified representative recorded',
                    `${chamberName(s.chamber, s.jurisdiction) ?? CHAMBER_NOT_RECORDED} · ${
                      jurisdictionName(s.state_code) ??
                      jurisdictionName(s.jurisdiction) ??
                      'Jurisdiction not recorded'
                    }`,
                  ].join('\n')}
                  accessibilityHint={seatContext(s)}
                  testID={`seat-choice-${s.slug}`}
                  onPress={() => void choose(s)}
                  disabled={saving}
                />
              ))}
            </RowList>
          )}
          {!stateChoosing ? (
            <SourceLink
              label="Check your electorate with the AEC"
              citation="AEC electorate finder"
              url="https://electorate.aec.gov.au/"
              kind="register"
            />
          ) : null}
          {choice ? (
            <Button
              label="Cancel"
              variant="quiet"
              onPress={() => {
                setChoosing(false);
                setStateChoosing(false);
                setQuery('');
              }}
            />
          ) : null}
        </Group>
      ) : null}
      {chooser && !choice ? <FollowingEntry /> : null}
      {view && directory && !chooser ? (
        <>
          <Group gap={rhythm.tight}>
            <Text variant="kicker" tone="navy">
              Your electorate
            </Text>
            <Heading level={1} testID="your-seat-name">
              {view.seat.data!.name}
            </Heading>
            <Text wordSafe variant="metadata">
              {chamberName(
                view.seat.data!.chamber,
                view.seat.data!.jurisdiction,
              ) ?? CHAMBER_NOT_RECORDED}{' '}
              ·{' '}
              {jurisdictionName(view.seat.data!.state_code) ??
                'Jurisdiction not recorded'}
            </Text>
            {view.seat.data!.status === 'historical' ? (
              <Text wordSafe testID="your-seat-abolished">
                Abolished; not a current seat. Choose a current electorate to
                update your saved choice.
              </Text>
            ) : null}
            <RowList>
              <LinkRow
                title="Electorate record"
                detail="Outline, elections and local context"
                icon="map"
                accent="places"
                testID="your-electorate"
                onPress={() =>
                  router.push(electorateRoute(view.seat.data!.electorate_id))
                }
              />
            </RowList>
            <EvidenceFooter block={view.seat} id="your-seat" />
          </Group>
          {view.seat.data!.chamber !== 'senate' ? (
            <RecordBlock
              title={
                view.members.data && view.members.data.length > 1
                  ? 'Your representatives'
                  : 'Your member'
              }
              icon="person.fill"
              accent="people"
              id="your-member"
              block={view.members}
              missing={
                view.seat.data!.status === 'historical'
                  ? 'Abolished; not a current seat. See the electorate record for its history.'
                  : 'No verified representative is recorded for this date. This does not establish a vacancy.'
              }
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
                icon="checkmark.square"
                accent="votes"
                block={memberProfile.blocks.votes}
                missing="No recorded bill votes are held for this member."
                retry={retry}
                date={false}
                caption={
                  memberProfile.blocks.votes.data ? (
                    <Group gap={rhythm.line}>
                      {memberProfile.blocks.votes.data.jurisdictions.map(
                        (jur) => (
                          <AsAtLine
                            key={jur}
                            votes={votingMetaFor(memberProfile.blocks.votes)}
                            jurisdiction={jur}
                          />
                        ),
                      )}
                    </Group>
                  ) : undefined
                }
                info={(v) =>
                  v ? { title: 'About these votes', notes: [v.method] } : null
                }
              >
                {(v) => (
                  <Group gap={rhythm.tight}>
                    <RowList>
                      {[
                        ...[...v.for]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .slice(0, 6)
                          .map((row) => ({ ...row, side: 'Voted for' })),
                        ...[...v.against]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .slice(0, 6)
                          .map((row) => ({
                            ...row,
                            side: 'Voted against',
                          })),
                      ]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((row, i) =>
                          row.billKey ? (
                            <LinkRow
                              key={i}
                              leading={
                                <VoteSide
                                  side={
                                    row.side === 'Voted for' ? 'for' : 'against'
                                  }
                                />
                              }
                              title={row.name}
                              detail={`${row.stage} · ${formatDate(row.date!, 'short')}`}
                              accessibilityLabel={`${row.side}, ${row.name}, ${row.stage}, ${formatDate(row.date!)}. Bill record`}
                              onPress={() =>
                                router.push(billRoute(row.billKey!))
                              }
                              testID={`your-mp-bill-${row.billKey}`}
                            />
                          ) : (
                            <View
                              key={i}
                              accessible
                              accessibilityLabel={`${row.side}, ${row.name}, ${row.stage}, ${formatDate(row.date!)}. Not matched to a bill record`}
                              style={styles.vote}
                            >
                              <VoteSide
                                side={
                                  row.side === 'Voted for' ? 'for' : 'against'
                                }
                              />
                              <Text wordSafe variant="strong">
                                {row.name}
                              </Text>
                              <Text wordSafe variant="metadata">
                                {row.stage} · {formatDate(row.date!, 'short')} ·
                                Not matched to a bill record
                              </Text>
                            </View>
                          ),
                        )}
                    </RowList>
                    {!v.for.length && !v.against.length ? (
                      <EmptyState message="None of their recorded divisions was a vote on a bill itself." />
                    ) : null}
                  </Group>
                )}
              </RecordBlock>
              <RowList>
                <Disclosure
                  label="Register changes"
                  icon="list.clipboard"
                  accent="interests"
                  open={registerOpen}
                  testID="your-register-toggle"
                  onToggle={(open) => {
                    setRegisterLoadedFor(null);
                    setRegisterOpen(open);
                  }}
                >
                  {null}
                </Disclosure>
              </RowList>
              {registerOpen && registerLoadedFor !== memberProfile.personId ? (
                memberFailure?.id === memberProfile.personId ? (
                  <ErrorState message={memberFailure.message} onRetry={retry} />
                ) : (
                  <LoadingState label="Loading the member’s register" />
                )
              ) : null}
              {registerOpen && registerLoadedFor === memberProfile.personId ? (
                <RecordBlock
                  title="Register changes"
                  id="your-register"
                  icon="list.clipboard"
                  accent="interests"
                  block={memberProfile.blocks.interests}
                  missing="No register file is held for this member in the covered registers."
                  retry={retry}
                  info={() => ({
                    title: 'About register changes',
                    notes: [
                      'Changes are shown only where the register records a date.',
                      'Entries read by OCR from scanned pages may contain transcription errors; check the original register.',
                    ],
                  })}
                >
                  {(r) => (
                    <RowList>
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
                          <Group key={i} gap={rhythm.line}>
                            <Text wordSafe variant="kicker" tone="interestsInk">
                              {registerCategoryLabel(row.category)} ·{' '}
                              {registerChangeLabel(row.kind)}{' '}
                              {formatDate(row.date!, 'short')}
                            </Text>
                            <Text wordSafe>{row.description}</Text>
                            {row.ocr ? (
                              <Text wordSafe variant="caption">
                                OCR transcription; check the original register.
                              </Text>
                            ) : null}
                          </Group>
                        ))}
                    </RowList>
                  )}
                </RecordBlock>
              ) : null}
            </>
          ) : memberFailure &&
            memberFailure.id === view.members.data?.[0]?.person_id ? (
            <ErrorState message={memberFailure!.message} onRetry={retry} />
          ) : view.members.data?.length === 1 ? (
            <LoadingState label="Loading the member’s public record" />
          ) : null}
          {view.seat.data!.status !== 'historical' ? (
            <Section
              title="Your senators"
              icon="person.2.fill"
              accent="people"
              testID="your-senators"
            >
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
              <Text wordSafe testID="your-senators-end" variant="caption">
                Senators are shown as recorded in the dated release.
              </Text>
            </Section>
          ) : null}
          {view.seat.data!.status !== 'historical' ? (
            <Section
              title="State members"
              icon="building.columns"
              accent="people"
              testID="your-state"
            >
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
                      {choice && selectedStateSeats[i] ? (
                        <Button
                          label={`Remove ${selectedStateSeats[i]!.name}`}
                          variant="quiet"
                          size="compact"
                          icon="minus.circle"
                          testID={`remove-state-seat-${selectedStateSeats[i]!.electorate_id}`}
                          disabled={saving}
                          onPress={() =>
                            void persist({
                              ...choice,
                              stateSeatIds: choice.stateSeatIds.filter(
                                (id) =>
                                  id !== selectedStateSeats[i]!.electorate_id,
                              ),
                            })
                          }
                        />
                      ) : null}
                    </Group>
                  ))}
                  {!view.stateMembers.length ? (
                    <Text wordSafe>
                      Choose your state electorate to see its verified
                      representatives.
                    </Text>
                  ) : null}
                  <Button
                    label="Choose state electorate"
                    icon="plus"
                    size="compact"
                    testID="choose-state-seat"
                    onPress={() => {
                      setStateChoosing(true);
                      setQuery('');
                    }}
                  />
                </>
              ) : (
                <Text wordSafe>
                  OPAX does not yet have a verified roster of{' '}
                  {jurisdictionName(view.seat.data!.state_code) ??
                    'this jurisdiction’s'}{' '}
                  members.
                </Text>
              )}
            </Section>
          ) : null}
          <FollowingEntry />
          <Button
            label="Change seat"
            variant="quiet"
            icon="arrow.triangle.2.circlepath"
            testID="change-seat"
            onPress={() => {
              setChoosing(true);
              setQuery('');
            }}
          />
          <Text wordSafe variant="caption" testID="your-mp-end">
            Your choice is saved on this device. Device backups may include it.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({
  vote: { gap: rhythm.line, paddingVertical: rhythm.tight + 2 },
});
