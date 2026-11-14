import { counted } from '../../design/format';
import { router } from 'expo-router';
import { View } from 'react-native';
import type { Electorate } from '../../api/catalogs';
import { CachedPortrait } from '../CachedPortrait';
import { InsetGroup, SectionHeader } from '../../design/layout';
import { PersonRow } from '../../design/people';
import {
  menuSections,
  rowMenus,
  useRowFollow,
  type RowMenuAction,
} from '../../design/row-link';
import { LinkRow } from '../../design/rows';
import { SourceLine } from '../../design/source';
import { InlineError } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { membersRoute, personRoute, seatRoute } from '../../navigation/routes';
import { byFamilyName, FaceStackRow } from './FaceStackRow';
import { representativeProfile, type Directory } from './model';

const vic = (s: Pick<Electorate, 'state_code' | 'jurisdiction'>) =>
  s.state_code.toLowerCase() === 'vic' || s.jurisdiction === 'vic';

/** Drawn only for a Victorian federal seat or a saved Victorian state seat. */
export function showsVictorianSection(
  federal: Electorate | null,
  stateSeatIds: readonly string[],
): boolean {
  return (federal ? vic(federal) : false) || stateSeatIds.length > 0;
}

/**
 * The Victorian Parliament section: the district member and the region's
 * members as one face-stack row, or a row to add the state electorate.
 */
export function StateMembers({
  directory,
  stateSeatIds,
  failed,
  onRetry,
  onRemove,
}: {
  directory: Directory;
  stateSeatIds: readonly string[];
  failed?: boolean;
  onRetry?: () => void;
  onRemove: () => void;
}) {
  const seats = stateSeatIds
    .map((id) =>
      directory.electorates.data.electorates.find(
        (s) => s.electorate_id === id,
      ),
    )
    .filter((s): s is Electorate => !!s);
  const district = seats.find((s) => !isRegion(s));
  const region = seats.find(isRegion);
  const stateMenu: RowMenuAction[] = [
    {
      title: 'Change state electorate',
      symbol: 'building.columns',
      onPress: () => router.push(seatRoute('vic')),
    },
    {
      title: 'Remove state electorate',
      symbol: 'minus.circle',
      destructive: true,
      onPress: onRemove,
    },
  ];
  const asOf =
    seats
      .map((s) => s.representation_as_of)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null;
  return (
    <View testID="your-state" style={{ gap: rhythm.heading }}>
      <SectionHeader title="Victorian Parliament" />
      {failed ? (
        <InlineError
          subject="Your state members"
          message="Your state members couldn’t be loaded."
          onRetry={onRetry}
        />
      ) : !seats.length ? (
        <InsetGroup>
          <LinkRow
            title="Add your state electorate"
            symbol={symbols.follow}
            href={seatRoute('vic')}
            testID="choose-state-seat"
          />
        </InsetGroup>
      ) : (
        // The seats come from the directory already read, so there is
        // nothing to wait for: a saved id the release no longer has is
        // left out, never held on a skeleton.
        <>
          <InsetGroup>
            {district ? (
              district.representatives.length === 1 &&
              district.representation_status === 'verified' ? (
                <StateMemberRow
                  seat={district}
                  directory={directory}
                  menu={stateMenu}
                />
              ) : (
                <Text wordSafe style={{ padding: rhythm.block }}>
                  No member is recorded for this seat yet.
                </Text>
              )
            ) : null}
            {region && region.representatives.length ? (
              <FaceStackRow
                title={`${counted(region.representatives.length, 'member')} for ${region.name}`}
                people={[...region.representatives]
                  .sort(byFamilyName((r) => r.person.name))
                  .map((r) => ({
                    name: r.person.name,
                    slug: representativeProfile(r.person_id, directory)?.slug,
                  }))}
                href={membersRoute(region.electorate_id)}
                menu={menuSections(stateMenu)}
                testID="your-state-region"
              />
            ) : null}
          </InsetGroup>
          <SourceLine
            asOf={asOf}
            citation="Parliament of Victoria"
            originals={seats.map((s) => ({
              label: s.name,
              url: s.url,
              asOf: s.representation_as_of,
            }))}
            testID="your-state-source"
          />
        </>
      )}
    </View>
  );
}

/** A Legislative Council region (vic_lc), as opposed to an Assembly district. */
export function isRegion(s: Pick<Electorate, 'chamber'>) {
  return /_lc$|upper|council|region/i.test(s.chamber);
}

function StateMemberRow({
  seat,
  directory,
  menu,
}: {
  seat: Electorate;
  directory: Directory;
  menu: RowMenuAction[];
}) {
  const r = seat.representatives[0]!;
  const profile = representativeProfile(r.person_id, directory);
  const slug = profile?.slug ?? r.person_id;
  const follow = useRowFollow('person', r.person_id, r.person.name);
  return (
    <PersonRow
      name={r.person.name}
      portrait={<CachedPortrait name={r.person.name} slug={profile?.slug} />}
      party={profile?.party ?? r.party}
      partyStatus={profile?.partyStatus ?? 'current'}
      place={`Member for ${seat.name}`}
      href={profile ? personRoute(profile.slug) : undefined}
      menu={menuSections(
        profile
          ? [
              ...rowMenus.person({ slug, name: r.person.name, ...follow }),
              ...menu,
            ]
          : menu,
      )}
      testID={`your-state-member-${slug}`}
      testDrawnName
    />
  );
}
