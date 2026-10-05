import { useState } from 'react';
import { CachedPortrait } from '../CachedPortrait';
import type { PortraitInfo } from '../../api/portrait-index';
import type { recentDeclarationsFor } from '../../api/selectors';
import { Group, PersonRow, SourceLink, Text } from '../../design/primitives';
import { formatDate } from '../../design/format';
import { chamberName } from '../../design/parliament';
import { registerChangeLabel } from '../your-mp/model';

type Declaration = NonNullable<
  ReturnType<typeof recentDeclarationsFor>['data']
>[number];
export function TodayDeclaration({
  item,
  index,
}: {
  item: Declaration;
  index: number;
}) {
  const [portrait, setPortrait] = useState<PortraitInfo | null>(null);
  return (
    <Group>
      <PersonRow
        name={item.name}
        party={item.party}
        partyStatus={item.partyStatus}
        formerly={item.formerly}
        place={chamberName(item.chamber, item.jurisdiction) ?? undefined}
        detail={`${item.category}, ${registerChangeLabel(item.kind)} ${formatDate(item.date, 'short')}`}
        testID={`today-declaration-person-${index}`}
        portrait={
          <CachedPortrait
            name={item.name}
            testID={`today-declaration-portrait-${index}`}
            onCredit={setPortrait}
          />
        }
      />
      {item.description ? <Text>{item.description}</Text> : null}
      {portrait ? (
        <Group>
          <Text variant="fine">
            {portrait.credit} · {portrait.licence}
          </Text>
          {portrait.attribution ? (
            <Text variant="fine">{portrait.attribution}</Text>
          ) : null}
          <SourceLink
            citation="Portrait credit"
            url={portrait.sourceURL}
            kind="record"
          />
          <SourceLink
            citation="Portrait licence"
            url={
              portrait.licenceURL.startsWith('https:')
                ? portrait.licenceURL
                : portrait.sourceURL
            }
            kind="record"
          />
        </Group>
      ) : null}
      <SourceLink
        citation={item.sourceLabel}
        record={`${item.name}${item.page !== null ? `, page ${item.page}` : ''}`}
        url={item.url}
        kind="record"
        testID={`today-declaration-${index}`}
      />
    </Group>
  );
}
