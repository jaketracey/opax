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
type Tie = NonNullable<Declaration['ties']>[number];

// The web's register labels for a name match (app.js declaredTieHTML).
function tieText(tie: Tie) {
  const kinds = tie.kinds.length ? tie.kinds : [tie.kind];
  const labels: string[] = [];
  if (kinds.includes('donor'))
    labels.push(
      `AEC donor${tie.industry ? ` · ${tie.industry.replace(/_/g, ' ')}` : ''}`,
    );
  if (kinds.includes('lobbyist')) labels.push('registered lobbying firm');
  if (kinds.includes('fits')) labels.push('FITS registrant');
  return labels.length
    ? `${tie.organisation}, ${labels.join(' · ')}`
    : tie.organisation;
}

/**
 * One register alteration: the member, what changed and when, the entry in
 * the member's own words, and its source. Today shows the newest six; the
 * declared-interests feed shows every row with the member's profile link
 * and any name match the export found.
 */
export function TodayDeclaration({
  item,
  index,
  testIDPrefix = 'today-declaration',
  onOpenPerson,
  showTies = false,
}: {
  item: Declaration;
  index: number;
  testIDPrefix?: string;
  /** Present only when the member has a native profile. */
  onOpenPerson?: () => void;
  showTies?: boolean;
}) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const portrait =
    item.portrait?.display === 'permitted' ? item.portrait : null;
  return (
    <Group>
      <PersonRow
        name={item.name}
        party={item.party}
        partyStatus={item.partyStatus}
        formerly={item.formerly}
        place={chamberName(item.chamber, item.jurisdiction) ?? undefined}
        detail={`${item.category}, ${registerChangeLabel(item.kind)} ${formatDate(item.date, 'short')}`}
        testID={`${testIDPrefix}-person-${index}`}
        onPress={onOpenPerson}
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
              testID={`${testIDPrefix}-portrait-${index}`}
            />
          ) : undefined
        }
      />
      {item.description ? <Text>{item.description}</Text> : null}
      {showTies && item.ties?.length ? (
        <Text
          variant="fine"
          tone="ink"
          testID={`${testIDPrefix}-ties-${index}`}
        >
          Name match: {item.ties.map(tieText).join('; ')}. Exact names only;
          this identifies a shared name across public registers, not wrongdoing.
        </Text>
      ) : null}
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
        testID={`${testIDPrefix}-${index}`}
      />
    </Group>
  );
}
