import {
  PadGrid,
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
  StatusLabel,
  Text,
  errorMessage,
} from '../design/primitives';
import { SeatGrants } from './money-public/Grants';
import { PayBlock, PartyReceiptsBlock } from './people/FinancialBlocks';
import { phoneCopy } from '../design/phone-copy';
import { PartialNotice, SavedCopyNotice } from './CatalogNotice';
import { LocationSuggestion } from './electorate-map/LocationSuggestion';
import { formatDate } from '../design/format';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHeaderBottom } from '../design/useHeaderBottom';
import { router, Stack } from 'expo-router';
import { openSource } from '../navigation/external';
import { AndroidFocusBack } from '../navigation/AndroidFocusBack';
import {
  Keyboard,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
  type ScrollView,
} from 'react-native';
import { catalogs } from '../api/runtime';
import type { Electorate } from '../api/catalogs';
import { rhythm } from '../design/tokens';
import {
  CHAMBER_NOT_RECORDED,
  chamberName,
  jurisdictionName,
} from '../design/parliament';
import { billRoute, electorateRoute } from '../navigation/routes';
import {
  BlockSource,
  EvidenceFooter,
  RecordBlock,
  combinedBlock,
  votesSource,
} from './your-mp/Evidence';
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
      setError(
        phoneCopy('Your seat could not be saved on this iPhone. Try again.'),
      );
    } finally {
      setSaving(false);
    }
  }
  const chooser = ready && (!choice || choosing || stateChoosing);
  // The chooser replaces a long page in place. "Choose state electorate" and
  // "Change seat" sit near its end, so the short chooser would draw above a
  // retained offset: a blank screen under the title (TestFlight build 32).
  // Open (and leave) it at the top, under the native header.
  const scroll = useRef<ScrollView>(null);
  const headerBottom = useHeaderBottom();
  const shown = useRef(chooser);
  useEffect(() => {
    if (shown.current === chooser) return;
    shown.current = chooser;
    scroll.current?.scrollTo({
      y: Platform.OS === 'ios' ? -headerBottom : 0,
      animated: false,
    });
  }, [chooser, headerBottom]);
  const seats = stateChoosing
    ? (view?.verifiedStateSeats ?? [])
    : (directory?.electorates.data.electorates ?? []);
  const matches = matchingSeats(seats, query);
  const selectedStateSeats =
    view?.verifiedStateSeats.filter((s) =>
      choice?.stateSeatIds.includes(s.electorate_id),
    ) ?? [];
  const seatName = view && !chooser ? view.seat.data!.name : null;
  return (
    <Screen
      column="wide"
      testID="your-mp-screen"
      scrollRef={scroll}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={retry} />}
    >
      {/* One title: the chosen seat replaces "Your MP" (the tab still says
          it); the chooser keeps "Your MP". */}
      <Stack.Screen options={{ title: seatName ?? 'Your MP' }} />
      {Platform.OS === 'android' ? (
        <AndroidFocusBack
          active={choosing || stateChoosing}
          onBack={() => {
            setChoosing(false);
            setStateChoosing(false);
          }}
        />
      ) : null}
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
          {stateChoosing ? (
            <Heading level={2}>Choose your state electorate</Heading>
          ) : null}
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
          {/* The state district from the same tap, on the device against
              bundled outlines (TestFlight build 32). The name search below
              stays the fallback, including when permission is denied. */}
          {stateChoosing && view ? (
            <LocationSuggestion
              scope="state"
              seats={view.verifiedStateSeats}
              onConfirm={(seat) => void choose(seat)}
              disabled={saving}
            />
          ) : null}
          <Field
            label="Electorate or member’s name"
            hint="Your choice is saved on this device. Device backups may include it."
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
              message="Search by electorate or member name."
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
            <RowList>
              <LinkRow
                title="Check your electorate with the AEC"
                external
                accessibilityHint="Opens the AEC electorate finder"
                testID="seat-aec"
                onPress={() =>
                  void openSource(
                    'https://electorate.aec.gov.au/',
                    'AEC electorate finder',
                  )
                }
              />
            </RowList>
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
          <Group gap={rhythm.heading}>
            <Text wordSafe variant="metadata" testID="your-seat-name">
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
                testID="your-electorate"
                onPress={() =>
                  router.push(electorateRoute(view.seat.data!.electorate_id))
                }
              />
            </RowList>
            <EvidenceFooter block={view.seat} id="your-seat" />
          </Group>
          <SeatGrants
            name={view.seat.data!.name}
            state={view.seat.data!.state_code}
            eligible={
              view.seat.data!.jurisdiction === 'federal' &&
              view.seat.data!.chamber === 'representatives'
            }
          />
          {view.seat.data!.chamber !== 'senate' ? (
            <RecordBlock
              title={
                view.members.data && view.members.data.length > 1
                  ? 'Your representatives'
                  : 'Your member'
              }
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
              <PadGrid>
                <PayBlock
                  block={memberProfile.blocks.pay}
                  retry={retry}
                  id="your-pay"
                />
                <PartyReceiptsBlock
                  block={memberProfile.blocks.partyReceipts}
                  retry={retry}
                  id="your-receipts"
                />
              </PadGrid>
              <RecordBlock
                title="Recent bill votes"
                id="your-votes"
                accent="votes"
                block={memberProfile.blocks.votes}
                missing="No recorded bill votes are held for this member."
                retry={retry}
                line={() => votesSource(memberProfile.blocks.votes)}
                about={(v) =>
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
                          .map((row) => ({
                            ...row,
                            side: 'Voted for' as const,
                          })),
                        ...[...v.against]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .slice(0, 6)
                          .map((row) => ({
                            ...row,
                            side: 'Voted against' as const,
                          })),
                      ]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((row, i) =>
                          row.billKey ? (
                            <LinkRow
                              key={i}
                              leading={<VoteLabel side={row.side} />}
                              title={row.name}
                              dragPath={`/bill/${row.billKey}`}
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
                              <VoteLabel side={row.side} />
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
              {/* Read on demand, like a profile's topics: the section
                  heading, then one row that opens the latest changes. */}
              <Section
                title="Register changes"
                accent="interests"
                testID="your-register"
              >
                <RowList>
                  <Disclosure
                    label={
                      registerOpen
                        ? 'Hide the latest changes'
                        : 'Show the latest changes'
                    }
                    open={registerOpen}
                    testID="your-register-toggle"
                    onToggle={(open) => {
                      setRegisterLoadedFor(null);
                      setRegisterOpen(open);
                    }}
                  >
                    {() =>
                      registerLoadedFor !== memberProfile.personId ? (
                        memberFailure?.id === memberProfile.personId ? (
                          <ErrorState
                            message={memberFailure.message}
                            onRetry={retry}
                          />
                        ) : (
                          <LoadingState label="Loading the member’s register" />
                        )
                      ) : (
                        <RecordBlock
                          title="Register changes"
                          sub="bare"
                          id="your-register"
                          block={memberProfile.blocks.interests}
                          missing="No register file is held for this member in the covered registers."
                          retry={retry}
                          about={() => ({
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
                                    <Text wordSafe variant="label">
                                      {registerCategoryLabel(row.category)} ·{' '}
                                      {registerChangeLabel(row.kind)}{' '}
                                      {formatDate(row.date!, 'short')}
                                    </Text>
                                    <Text wordSafe>{row.description}</Text>
                                    {row.ocr ? (
                                      <Text wordSafe variant="fine">
                                        OCR transcription; check the original
                                        register.
                                      </Text>
                                    ) : null}
                                  </Group>
                                ))}
                            </RowList>
                          )}
                        </RecordBlock>
                      )
                    }
                  </Disclosure>
                </RowList>
              </Section>
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
              accent="people"
              testID="your-senators"
            >
              {view.senators.length ? (
                <>
                  {view.senators.map((b, i) => (
                    <RepresentativeRows
                      key={i}
                      rows={b.data ?? []}
                      directory={directory}
                      asAt={b.asAt}
                      id="your-senator"
                    />
                  ))}
                  <BlockSource
                    block={combinedBlock(view.senators)}
                    title="About your senators"
                    notes={[
                      'Senators are shown as recorded in the dated release.',
                    ]}
                    testID="your-senators-end"
                  />
                </>
              ) : (
                <EmptyState message="No verified Senate roster is held for this jurisdiction." />
              )}
            </Section>
          ) : null}
          {view.seat.data!.status !== 'historical' ? (
            <Section title="State members" accent="people" testID="your-state">
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
                  {view.stateMembers.length ? (
                    <BlockSource
                      block={combinedBlock(view.stateMembers)}
                      testID="your-state-source"
                    />
                  ) : (
                    <Text wordSafe>
                      Choose your state electorate to see its verified
                      representatives.
                    </Text>
                  )}
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
          <Text wordSafe variant="fine" testID="your-mp-end">
            Your choice is saved on this device. Device backups may include it.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
/** "Voted for" or "Voted against": the word carries the meaning. */
function VoteLabel({ side }: { side: 'Voted for' | 'Voted against' }) {
  return (
    <StatusLabel
      label={side}
      tone={side === 'Voted for' ? 'done' : 'ended'}
      hidden
    />
  );
}
const styles = StyleSheet.create({
  vote: { gap: rhythm.line, paddingVertical: rhythm.tight + 2 },
});
