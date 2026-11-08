import { LinkRow } from '../../design/rows';
import { PartyLabel } from '../../design/people';
import { rowMenus, useRowFollow } from '../../design/row-link';
import { partySlug } from '../../design/party';
import { partyRoute } from '../../navigation/routes';
export interface PartyRowProps {
  party: string;
  testID?: string;
  detail?: string;
  onPress?: () => void;
}
export function PartyRow({ party, testID, detail, onPress }: PartyRowProps) {
  const slug = partySlug(party);
  const follow = useRowFollow('party', slug, party);
  return (
    <LinkRow
      title=""
      leading={
        <PartyLabel party={party} status="current" nested linked={false} />
      }
      detail={detail}
      symbol="person.3"
      href={partyRoute(party)}
      select={onPress}
      accessibilityLabel={[party, detail].filter(Boolean).join(', ')}
      menu={rowMenus.place({ title: party, path: `/party/${slug}`, ...follow })}
      testID={testID}
    />
  );
}
