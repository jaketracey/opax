import { useState } from 'react';
import { Image } from 'react-native';
import type { recentDeclarationsFor } from '../../api/selectors';
import { Group, PersonRow, SourceLink, Text } from '../../design/primitives';
import { formatDate } from '../../design/format';
import { chamberName } from '../../design/parliament';
import { remoteImageURI } from '../../api/image-policy';
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
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const portrait =
    item.portrait?.display === 'permitted' ? item.portrait : null;
  return (
    <Group>
      <PersonRow
        name={item.name}
        party={item.party}
        partyCurrent={item.partyCurrent}
        formerly={item.formerly}
        place={chamberName(item.chamber, item.jurisdiction) ?? undefined}
        detail={`${item.category}, ${registerChangeLabel(item.kind)} ${formatDate(item.date, 'short')}`}
        testID={`today-declaration-person-${index}`}
        portrait={
          portrait && failedPath !== portrait.path ? (
            <Image
              source={{ uri: remoteImageURI(portrait.path) }}
              style={{ width: 44, height: 44, borderRadius: 22 }}
              resizeMode="contain"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              accessibilityIgnoresInvertColors
              onError={() => setFailedPath(portrait.path)}
              testID={`today-declaration-portrait-${index}`}
            />
          ) : undefined
        }
      />
      {item.description ? <Text>{item.description}</Text> : null}
      {portrait && failedPath !== portrait.path ? (
        <Group>
          <Text variant="fine">
            {portrait.credit} · {portrait.licence}
          </Text>
          {portrait.notice ? (
            <Text variant="fine">{portrait.notice}</Text>
          ) : null}
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
      {portrait && failedPath === portrait.path ? (
        <Text variant="fine">
          The permitted portrait could not be loaded. A blank circle is shown.
        </Text>
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
