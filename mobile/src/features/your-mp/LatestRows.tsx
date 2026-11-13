import type { Href } from 'expo-router';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { billName } from '../../api/bill-transforms';
import type { BillIndex, PersonProfile } from '../../api/catalogs';
import { useAccessibilitySize } from '../../design/accessibility';
import { haptic } from '../../design/haptics';
import { Icon, type SFSymbol } from '../../design/icon';
import { RowLink, rowMenus, type RowMenuAction } from '../../design/row-link';
import {
  ownsRowPadding,
  useRowCellStyle,
  useRowInset,
} from '../../design/row-padding';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { openSource } from '../../navigation/external';
import { trackShare } from '../../navigation/share';
import { billRoute, personRoute } from '../../navigation/routes';
import {
  changeDate,
  declarationAction,
  questionType,
  voteAction,
  type FollowRecord,
} from '../follows/changes';
import { copyText } from '../records/actions';
import type { ProfileView } from './model';
import { registerHolderLine } from './model';

export interface LatestRecord extends FollowRecord {
  action: string;
  detail: string;
  href?: Href;
  holderLine?: string;
}
// A null holder is a register with no holder column (see registerHolderLine).
type ActivityRecord = FollowRecord & { holders?: (string | null)[] };
type DeclarationRecord = ActivityRecord & { holders: (string | null)[] };
/**
 * A register entry's words run to four lines, then end with an ellipsis; at
 * accessibility sizes they run in full. Never cut by characters: a cut
 * mid-name ("provided by Endeavou…") reads as the record's own text.
 */
export const REGISTER_TITLE_LINES = 4;

const recordSymbols: Record<FollowRecord['kind'], SFSymbol> = {
  vote: symbols.vote,
  register: symbols.interests,
  bill: symbols.bills,
  division: symbols.vote,
  speech: symbols.speech,
  stage: symbols.bills,
  return: symbols.bills,
  member: symbols.person,
};
export function latestRecord(record: ActivityRecord): LatestRecord | null {
  let action = record.action ?? '';
  let detail = record.detail ?? record.stage ?? record.chamber ?? '';
  let href: Href | undefined;
  if (record.kind === 'vote') {
    const type = questionType(record);
    action = voteAction(type, record.position ?? 'for') ?? '';
    if (!action) return null;
    if (type === 'amendment' && !/amendment/i.test(detail))
      detail = `${detail} amendment`.trim();
  }
  if (record.kind === 'register')
    action = declarationAction(
      record.category ?? 'interests',
      record.operation,
    );
  if (record.kind === 'bill') action = 'Introduced';
  if (record.billKey)
    href = billRoute(
      record.billKey,
      undefined,
      record.kind === 'vote' || record.kind === 'division'
        ? record.divisionKey
          ? { division: record.divisionKey }
          : { section: 'divisions' }
        : {},
    );
  else if (record.slug)
    href = personRoute(
      record.slug,
      undefined,
      record.kind === 'register' ? 'interests' : undefined,
    );
  if (!href && !record.url) return null;
  detail = detail.replace(
    /^(second|third) reading(?: amendment)?/i,
    (words) => words[0]!.toUpperCase() + words.slice(1).toLowerCase(),
  );
  const holderLine =
    record.kind === 'register'
      ? registerHolderLine(record.holders, record.operation)
      : undefined;
  return {
    ...record,
    action,
    detail,
    href,
    ...(holderLine ? { holderLine } : {}),
  };
}
/** Existing profile data only. No speech or undated statement enters Lately. */
export function latestRecords(
  profile: Pick<ProfileView, 'blocks' | 'slug' | 'personId'>,
  bills?: BillIndex,
  limit = 5,
): LatestRecord[] {
  const records: ActivityRecord[] = [];
  const votes = profile.blocks.votes;
  if (votes.status !== 'error')
    for (const position of ['for', 'against'] as const)
      for (const vote of votes.data?.[position] ?? []) {
        const rich = vote as typeof vote & {
          key?: string;
          division_key?: string;
          question_type?: FollowRecord['question_type'];
          url?: string;
        };
        if (!vote.date) continue;
        records.push({
          key:
            rich.key ??
            rich.division_key ??
            `vote:${vote.jur ?? ''}:${vote.date}:${vote.name}:${vote.stage}`,
          kind: 'vote',
          title: vote.name,
          date: vote.date,
          stage: vote.stage,
          position,
          question_type: rich.question_type,
          billKey: vote.billKey ?? undefined,
          divisionKey: rich.division_key,
          url:
            rich.url ??
            `https://theyvoteforyou.org.au/search?query=${encodeURIComponent(vote.name)}`,
        });
      }
  const interests = profile.blocks.interests;
  // The register can repeat a declaration for different household holders.
  // Collapse identical activity here and retain the distinct holders for the
  // merged row, preserving every source row on the full register page. Compare the full
  // text before previews or limits; additions and removals remain distinct.
  const declarationIds = new Map<string, DeclarationRecord>();
  const declarations = new Map<string, DeclarationRecord>();
  if (interests.status !== 'error' && interests.data)
    for (const [category, bucket] of Object.entries(interests.data.buckets))
      for (const row of bucket.items) {
        if (!row.date || (row.kind !== 'addition' && row.kind !== 'deletion'))
          continue;
        const key =
          row.key ?? (row.id !== undefined ? `register:${row.id}` : undefined);
        const ids: string[] = [];
        if (row.key) ids.push(`key:${row.key}`);
        if (row.id !== undefined) ids.push(`id:${row.id}`);
        const identity = JSON.stringify([
          profile.personId ?? profile.slug,
          category,
          row.date,
          row.kind,
          row.description,
        ]);
        const duplicate =
          ids.map((id) => declarationIds.get(id)).find(Boolean) ??
          declarations.get(identity);
        if (duplicate) {
          if (!duplicate.holders.includes(row.holder))
            duplicate.holders.push(row.holder);
          for (const id of ids) declarationIds.set(id, duplicate);
          declarations.set(identity, duplicate);
          continue;
        }
        // Seen state stores this key. A null holder keys as the export's
        // older "unspecified" placeholder, so a row already seen stays seen
        // when the export switches to null.
        const record: DeclarationRecord = {
          key:
            key ??
            `register:${category}:${row.date}:${row.kind}:${row.holder ?? 'unspecified'}:${row.description}`,
          kind: 'register',
          date: row.date,
          title: row.description,
          category,
          operation: row.kind,
          slug: profile.slug ?? undefined,
          holders: [row.holder],
        };
        for (const id of ids) declarationIds.set(id, record);
        declarations.set(identity, record);
        records.push(record);
      }
  for (const bill of bills?.bills ?? []) {
    const raw = bill as typeof bill & { sponsor_person_id?: string };
    const identity = profile.blocks.identity.data as PersonProfile | null;
    if (
      !bill.introduced ||
      !(
        (!!raw.sponsor_person_id &&
          raw.sponsor_person_id === profile.personId) ||
        (identity && bill.sponsor === identity.name)
      )
    )
      continue;
    records.push({
      key: bill.key,
      kind: 'bill',
      title: billName(bill),
      date: bill.introduced,
      billKey: bill.key,
      chamber: bill.originating_house ?? undefined,
    });
  }
  const order = { vote: 0, register: 1, bill: 2 };
  return records
    .filter((record, i) => records.findIndex((r) => r.key === record.key) === i)
    .map(latestRecord)
    .filter((r): r is LatestRecord => !!r)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (order[a.kind as keyof typeof order] ?? 3) -
          (order[b.kind as keyof typeof order] ?? 3) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit);
}

export function LatestRow({
  record,
  testID,
  onPress,
}: {
  record: LatestRecord;
  testID?: string;
  onPress?: () => void;
}) {
  const cellStyle = useRowCellStyle();
  const large = useAccessibilitySize();
  useRowInset(44);
  const date = changeDate(record.date, undefined, true);
  const detail = [record.detail, date].filter(Boolean).join(' · ');
  const holderLabel = record.holderLine?.replace(/^Declared by /, 'By ');
  const label = `${record.action}. ${record.title}. ${holderLabel ? `${holderLabel}. ` : ''}${record.detail ? `${record.detail}, ` : ''}${new Date(`${record.date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
  const row = (
    <Pressable
      testID={testID}
      accessible
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={
        record.href ? undefined : 'Opens in the in-app browser'
      }
      onPress={
        onPress ??
        (() => {
          if (record.url) void openSource(record.url, record.title);
        })
      }
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        pressed && { backgroundColor: colors.sunken },
      ]}
    >
      <Icon
        name={recordSymbols[record.kind]}
        size={20}
        maxScale={1.5}
        tone="inkSoft"
        type="hierarchical"
      />
      <View style={styles.words}>
        <Text variant="strong">{record.action}</Text>
        <Text
          wordSafe
          variant={record.kind === 'register' ? 'recordText' : 'rowRecord'}
          numberOfLines={
            record.kind === 'register' && !large
              ? REGISTER_TITLE_LINES
              : undefined
          }
          ellipsizeMode="tail"
          testID={testID ? `${testID}-title` : undefined}
        >
          {record.title}
        </Text>
        {record.holderLine ? (
          <Text wordSafe variant="secondary">
            {record.holderLine}
          </Text>
        ) : null}
        <Text variant="secondary">{detail}</Text>
      </View>
      <Icon
        name={record.href ? symbols.chevron : symbols.external}
        size={13}
        maxScale={1.5}
        tone="inkSoft"
      />
    </Pressable>
  );
  const path = record.billKey
    ? `/bill/${record.billKey}${record.divisionKey ? `?division=${record.divisionKey}` : ''}`
    : record.slug
      ? `/subject/person/${record.slug}`
      : record.url;
  const menu: RowMenuAction[] = record.href
    ? rowMenus.record({ title: record.title, path })
    : [
        {
          title: 'Share',
          symbol: 'square.and.arrow.up',
          onPress: () => {
            // The source's own link: shared as an "other" record, never its URL.
            trackShare('record', record.url!);
            void Share.share({
              title: record.title,
              url: record.url,
              message: record.title,
            }).catch(() => undefined);
          },
        },
        {
          title: 'Copy link',
          symbol: 'link',
          onPress: () => {
            void copyText(record.url!).then((copied) => {
              if (!copied) return;
              haptic('success');
              trackShare('copy_link', record.url!);
            });
          },
        },
        {
          title: 'View source',
          symbol: 'arrow.up.right.square',
          onPress: () => {
            void openSource(record.url!, record.title);
          },
        },
      ];
  return (
    <RowLink
      href={record.href ?? (record.url as Href)}
      menu={menu}
      preview={!!record.href}
      select={
        onPress ??
        (!record.href
          ? () => {
              void openSource(record.url!, record.title);
            }
          : undefined)
      }
    >
      {row}
    </RowLink>
  );
}
ownsRowPadding(LatestRow);
export interface LatestRowsProps {
  records: readonly LatestRecord[];
  limit?: number;
  testID?: string;
  onRowPress?: (record: LatestRecord) => void;
}
/** Place inside InsetGroup, which owns separators and the outer surface. */
export function LatestRows({
  records,
  limit = 5,
  testID = 'latest',
  onRowPress,
}: LatestRowsProps) {
  return (
    <>
      {records.slice(0, limit).map((record, i) => (
        <LatestRow
          key={record.key}
          record={record}
          testID={`${testID}-${i}`}
          onPress={onRowPress ? () => onRowPress(record) : undefined}
        />
      ))}
    </>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    paddingVertical: rhythm.row,
    minHeight: minimumTarget,
  },
  words: { flex: 1, gap: rhythm.line },
});
