import { CachedPortrait } from '../CachedPortrait';
import type { recentDeclarationsFor } from '../../api/selectors';
import { Group, PersonRow, SourceLink, Text } from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { formatDate } from '../../design/format';
import { chamberName } from '../../design/parliament';
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
 * the member's own words, and a small "View original" for the register page.
 * Today shows the newest six; the declared-interests feed shows every row
 * with the member's profile link and any name match the export found.
 * Portrait credits are on Sources and licences, in About.
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
  return (
    <Group gap={rhythm.tight}>
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
          <CachedPortrait
            name={item.name}
            testID={`${testIDPrefix}-portrait-${index}`}
          />
        }
      />
      {item.description ? <Text>{item.description}</Text> : null}
      {showTies && item.ties?.length ? (
        <Text
          wordSafe
          variant="fine"
          tone="ink"
          testID={`${testIDPrefix}-ties-${index}`}
        >
          Name match: {item.ties.map(tieText).join('; ')}. Exact names only;
          this identifies a shared name across public registers, not wrongdoing.
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
