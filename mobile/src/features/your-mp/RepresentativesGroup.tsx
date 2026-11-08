import { View } from 'react-native';
import type { Electorate } from '../../api/catalogs';
import { InsetGroup, Group } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { SourceLine } from '../../design/source';
import { Skeleton } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { membersRoute, personRoute } from '../../navigation/routes';
import { byFamilyName, FaceStackRow } from './FaceStackRow';
import { MemberHeroRow, officialPageFor } from './MemberHeroRow';
import {
  representativeProfile,
  type Directory,
  type ElectorateView,
  type YourMPView,
} from './model';
import { stateInRunningCopy } from './state-names';

const PRECISE = new Set(['day', 'month', 'year']);

/**
 * "Member since 1996": the start of the member's current term for this
 * seat in the electorate file, read with its precision. Never the roster's
 * first-seen date; anything less exact than a year prints nothing.
 */
export function tenureYear(
  personId: string,
  terms: ElectorateView['terms'] | null | undefined,
): number | null {
  const current = (terms ?? [])
    .filter(
      (t) =>
        t.person_id === personId &&
        (t.end === null || t.end_precision === 'open'),
    )
    .sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''))[0];
  if (!current?.start || !PRECISE.has(current.start_precision)) return null;
  const year = Number(current.start.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

/** The Senate "seat" for a House seat's state: the members list's id. */
export function senateSeatFor(
  seat: Pick<Electorate, 'state_code'>,
  directory: Directory,
): Electorate | null {
  return (
    directory.electorates.data.electorates.find(
      (s) =>
        s.jurisdiction === 'federal' &&
        s.chamber === 'senate' &&
        s.status !== 'historical' &&
        s.state_code === seat.state_code,
    ) ?? null
  );
}

export function RepresentativesSkeleton() {
  return (
    <Group gap={rhythm.block}>
      <Skeleton shape="people" count={1} label="Loading your MP" />
      <Skeleton shape="rows" count={3} label="Loading your MP" />
      <Skeleton shape="rows" count={1} label="Loading your MP" />
    </Group>
  );
}

/**
 * Who represents the reader, in three inset groups (the member alone, the
 * three profile rows, the senators row) with one roster source line.
 */
export function RepresentativesGroup({
  seat,
  view,
  directory,
  electorate,
}: {
  seat: Electorate;
  view: YourMPView;
  directory: Directory;
  electorate: ElectorateView | null;
}) {
  const member = view.members.data?.length === 1 ? view.members.data[0]! : null;
  const profile = member
    ? representativeProfile(member.person_id, directory)
    : null;
  const person = member
    ? directory.people.data.people.find((p) => p.person_id === member.person_id)
    : null;
  const year = member ? tenureYear(member.person_id, electorate?.terms) : null;
  const senate = senateSeatFor(seat, directory);
  const senators = [...(senate?.representatives ?? [])].sort(
    byFamilyName((r) => r.person.name),
  );
  const state = stateInRunningCopy(seat.state_code);
  const rosterBlocks = [view.members, ...view.senators];
  const asOf =
    rosterBlocks
      .map((b) => b.asAt)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null;
  const originals = rosterBlocks
    .flatMap((b) => b.sources)
    .filter((s, i, all) => all.findIndex((o) => o.url === s.url) === i);
  return (
    <View testID="your-representatives" style={{ gap: rhythm.block }}>
      <InsetGroup testID="your-member">
        {member && profile ? (
          <MemberHeroRow
            name={member.person.name}
            slug={profile.slug}
            personId={member.person_id}
            party={profile.party ?? member.party}
            partyStatus={profile.partyStatus ?? 'current'}
            tenure={year ? `Member since ${year}` : null}
            official={officialPageFor(person?.source_url, seat.jurisdiction)}
            testID={`your-member-${profile.slug}`}
          />
        ) : (
          <Text
            wordSafe
            testID="your-member-none"
            style={{ padding: rhythm.block }}
          >
            No member is recorded for this seat yet.
          </Text>
        )}
      </InsetGroup>
      {member && profile ? (
        <InsetGroup testID="your-profile">
          <LinkRow
            title="Voting record"
            symbol={symbols.vote}
            symbolInk="votes"
            href={personRoute(profile.slug, undefined, 'votes')}
            testID="your-profile-votes"
          />
          <LinkRow
            title="Declared interests"
            symbol={symbols.interests}
            symbolInk="interests"
            href={personRoute(profile.slug, undefined, 'interests')}
            testID="your-profile-interests"
          />
          <LinkRow
            title="Pay and expenses"
            symbol={symbols.money}
            symbolInk="money"
            href={personRoute(profile.slug, undefined, 'pay')}
            testID="your-profile-pay"
          />
        </InsetGroup>
      ) : null}
      {senate && senators.length ? (
        <InsetGroup>
          <FaceStackRow
            title={`${senators.length} senators for ${state}`}
            people={senators.map((r) => ({
              name: r.person.name,
              slug: representativeProfile(r.person_id, directory)?.slug,
            }))}
            href={membersRoute(senate.electorate_id)}
            testID="your-senators"
          />
        </InsetGroup>
      ) : null}
      <SourceLine
        asOf={asOf}
        citation={
          originals.length ? originals.map((s) => s.label) : 'OpenAustralia'
        }
        originals={originals.map((s) => ({ label: s.label, url: s.url }))}
        savedAt={view.members.stale ? view.members.savedAt : null}
        state={view.members.partial ? 'partial' : null}
        testID="your-member-source"
      />
    </View>
  );
}
