import type { Href } from 'expo-router';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { symbols } from '../../design/symbols';
import { Icon, type SFSymbol } from '../../design/icon';
import { RowLink, rowMenus, type RowMenuAction } from '../../design/row-link';
import { copyText } from '../records/actions';
import { haptic } from '../../design/haptics';
import { Text } from '../../design/text';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import {
  ownsRowPadding,
  useRowCellStyle,
  useRowInset,
} from '../../design/row-padding';
import { billRoute, personRoute } from '../../navigation/routes';
import { openSource } from '../../navigation/external';
import type { BillIndex, PersonProfile } from '../../api/catalogs';
import { billName } from '../../api/bill-transforms';
import {
  changeDate,
  declarationAction,
  questionType,
  voteAction,
  type FollowRecord,
} from '../follows/changes';
import type { ProfileView } from './model';

export interface LatestRecord extends FollowRecord {
  action: string;
  detail: string;
  href?: Href;
}
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
export function latestRecord(record: FollowRecord): LatestRecord | null {
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
  return { ...record, action, detail, href };
}
/** Existing profile data only. No speech or undated statement enters Lately. */
export function latestRecords(
  profile: Pick<ProfileView, 'blocks' | 'slug' | 'personId'>,
  bills?: BillIndex,
  limit = 5,
): LatestRecord[] {
  const records: FollowRecord[] = [];
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
  if (interests.status !== 'error' && interests.data)
    for (const [category, bucket] of Object.entries(interests.data.buckets))
      for (const row of bucket.items) {
        if (!row.date || (row.kind !== 'addition' && row.kind !== 'deletion'))
          continue;
        records.push({
          key:
            (row as typeof row & { key?: string }).key ??
            `register:${category}:${row.date}:${row.kind}:${row.holder}:${row.description}`,
          kind: 'register',
          date: row.date,
          title: row.description,
          category,
          operation: row.kind,
          slug: profile.slug ?? undefined,
        });
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
  useRowInset(44);
  const date = changeDate(record.date, undefined, true);
  const detail = [record.detail, date].filter(Boolean).join(' · ');
  const label = `${record.action}. ${record.title}. ${record.detail ? `${record.detail}, ` : ''}${new Date(`${record.date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
  const row = (
    <Pressable
      testID={testID}
      accessible
      accessibilityRole="link"
      accessibilityLabel={label}
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
          numberOfLines={record.kind === 'register' ? 3 : undefined}
        >
          {record.title}
        </Text>
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
              if (copied) haptic('success');
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
