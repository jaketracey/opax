import { formatDate } from '../../design/format';
import { router } from 'expo-router';
import type { Electorate } from '../../api/catalogs';
import { PersonRow, RowList } from '../../design/primitives';
import {
  CHAMBER_NOT_RECORDED,
  chamberName,
  jurisdictionName,
} from '../../design/parliament';
import { personRoute } from '../../navigation/routes';
import { representativeProfile, type Directory } from './model';
export function RepresentativeRows({
  rows,
  directory,
  asAt,
  id,
}: {
  rows: Electorate['representatives'];
  directory: Directory;
  asAt: string | null;
  id: string;
}) {
  return (
    <RowList>
      {rows.map((r) => {
        const profile = representativeProfile(r.person_id, directory);
        const seat = profile?.seats[0];
        return (
          <PersonRow
            key={r.person_id}
            testID={`${id}-${profile?.slug ?? r.person_id}`}
            name={r.person.name}
            party={profile?.party ?? r.party}
            partyCurrent={profile?.partyCurrent ?? false}
            formerly={profile?.formerly}
            place={
              seat
                ? `${seat.name} · ${chamberName(seat.chamber, seat.jurisdiction) ?? CHAMBER_NOT_RECORDED} · ${jurisdictionName(seat.jurisdiction) ?? ''}`
                : undefined
            }
            detail={asAt ? `As at ${formatDate(asAt)}` : 'Date not published'}
            onPress={
              profile ? () => router.push(personRoute(profile.slug)) : undefined
            }
          />
        );
      })}
    </RowList>
  );
}
