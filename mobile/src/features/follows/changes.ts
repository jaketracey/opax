import type { Fingerprint, Follow, Reading } from './store';

export type QuestionType =
  | 'bill-stage'
  | 'amendment'
  | 'procedural'
  | 'unknown';
/** A published record. Keys identify records, never their arrival date or count. */
export interface FollowRecord {
  key: string;
  kind:
    | 'vote'
    | 'register'
    | 'bill'
    | 'division'
    | 'speech'
    | 'stage'
    | 'return'
    | 'member';
  date: string;
  added?: string;
  title: string;
  action?: string;
  detail?: string;
  billKey?: string;
  divisionKey?: string;
  slug?: string;
  url?: string;
  question_type?: QuestionType;
  position?: 'for' | 'against';
  stage?: string;
  chamber?: string;
  outcome?: string;
  category?: string;
  operation?: 'addition' | 'deletion';
  name?: string;
}
export interface Change {
  marker: string;
  /** Action only. Date formatting belongs to changeText. */
  text: string;
  citation: string;
  asAt: string | null;
  key?: string;
  record?: FollowRecord;
  dateNotPublished?: boolean;
  /** Expenses appear on the page only. */
  today?: false;
  reading?: Reading;
  stale?: boolean;
  savedAt?: number | null;
}

export function questionType(vote: {
  name?: string;
  title?: string;
  stage?: string;
  question_type?: QuestionType;
}): QuestionType {
  if (vote.question_type) return vote.question_type;
  const words = `${vote.stage ?? ''} ${vote.name ?? vote.title ?? ''}`;
  if (
    /limitation of debate|closure|suspension of standing orders|adjournment|question be now put/i.test(
      words,
    )
  )
    return 'procedural';
  if (/amendment|consideration in detail|committee of the whole/i.test(words))
    return 'amendment';
  if (
    /second reading|third reading|passage|agree to the bill|read a (second|third) time/i.test(
      words,
    )
  )
    return 'bill-stage';
  return 'unknown';
}
export function voteAction(
  type: QuestionType,
  position: 'for' | 'against',
): string | null {
  return type === 'procedural' || type === 'unknown'
    ? null
    : `Voted ${position}${type === 'amendment' ? ' an amendment' : ''}`;
}
export function declarationAction(
  category: string,
  operation: 'addition' | 'deletion' = 'addition',
): string {
  const plain = category.replaceAll('_', ' ').toLowerCase();
  const categoryWord = /gifts?/.test(plain) ? 'gift' : plain;
  return operation === 'deletion'
    ? `${categoryWord.charAt(0).toUpperCase()}${categoryWord.slice(1)} removed from the register`
    : categoryWord === 'shareholdings'
      ? 'Updated shareholdings'
      : categoryWord === 'gift'
        ? 'Declared a gift'
        : `Declared ${categoryWord}`;
}
/** Same-year lines omit the year; record rows always print it. */
export function changeDate(
  date: string | number,
  year = new Date().getFullYear(),
  alwaysYear = false,
): string {
  const day =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T12:00:00`)
      : new Date(date);
  if (!Number.isFinite(day.getTime())) return '';
  const parts = `${day.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][day.getMonth()]}`;
  return `${parts}${alwaysYear || day.getFullYear() !== year ? ` ${day.getFullYear()}` : ''}`;
}
export function changeText(change: Change, year?: number): string {
  const date = change.asAt && changeDate(change.asAt, year);
  return `${change.text}${date ? ` · ${date}` : ''}`;
}
export function changeAccessibilityLabel(change: Change): string {
  return change.asAt
    ? `${change.text}, ${new Date(/^\d{4}-\d{2}-\d{2}$/.test(change.asAt) ? `${change.asAt}T12:00:00` : change.asAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : `${change.text}, date not published`;
}
export const moreChangesText = (n: number): string => `and ${n} more`;
export function sortChanges(changes: readonly Change[]): Change[] {
  return [...changes].sort(
    (a, b) =>
      (b.asAt ?? '').localeCompare(a.asAt ?? '') ||
      Number(!!a.record) - Number(!!b.record) ||
      a.text.localeCompare(b.text),
  );
}
export const todayChanges = (changes: readonly Change[]): Change[] =>
  sortChanges(changes.filter((c) => c.today !== false));
export const currentKeys = (current: Fingerprint): string[] => [
  ...new Set(
    Object.values(current)
      .flatMap((r) => r.records ?? [])
      .sort((a, b) => (b.added ?? b.date).localeCompare(a.added ?? a.date))
      .map((r) => r.key),
  ),
];

function recordText(record: FollowRecord): string | null {
  switch (record.kind) {
    case 'vote': {
      const type = questionType(record);
      const action = voteAction(type, record.position ?? 'for');
      return action && `${action}${type === 'bill-stage' ? ' a bill' : ''}`;
    }
    case 'register':
      return declarationAction(
        record.category ?? 'interests',
        record.operation,
      );
    case 'bill':
      return 'Introduced a bill';
    case 'stage':
      return record.stage
        ? [record.stage, record.chamber].filter(Boolean).join(' · ')
        : 'Moved to a new stage';
    case 'division':
      return [
        record.stage,
        record.outcome === 'not agreed to' || record.outcome === 'no'
          ? 'not agreed to'
          : record.outcome === 'agreed to' || record.outcome === 'aye'
            ? 'agreed to'
            : '',
        record.chamber ? `· ${record.chamber}` : '',
      ]
        .filter(Boolean)
        .join(' ');
    case 'speech':
      return record.name ? `Speech by ${record.name}` : null;
    case 'return':
      return `${record.title} donations return published`;
    case 'member':
      return `Now includes ${record.name ?? record.title}`;
  }
}
function makeChange(
  marker: string,
  text: string,
  reading: Reading,
  citation: string,
  record?: FollowRecord,
): Change {
  const asAt = record?.date || reading.asAt;
  return {
    marker,
    text,
    citation,
    asAt,
    reading,
    ...(!asAt ? { dateNotPublished: true } : {}),
    ...(record ? { key: record.key, record } : {}),
  };
}
const sameEvent = (a: FollowRecord, b: FollowRecord) =>
  a.date === b.date &&
  !!a.stage &&
  a.stage === b.stage &&
  a.chamber === b.chamber;
/** Pure identity diff for lists, value diff for statuses. No date cut-off. */
export function changesFor(
  follow: Pick<Follow, 'kind' | 'seen' | 'seenKeys'>,
  current: Fingerprint,
): Change[] {
  const out: Change[] = [];
  const before = follow.seen;
  if (!before || follow.seenKeys === undefined) return out;
  const seen = new Set(follow.seenKeys);
  for (const [marker, reading] of Object.entries(current)) {
    const citation =
      follow.kind === 'bill'
        ? 'ParlInfo bill records'
        : follow.kind === 'electorate' || marker === 'seat'
          ? 'OPAX electorate release'
          : marker === 'party' || marker === 'members'
            ? 'OPAX parliamentary roster'
            : marker === 'expenses'
              ? 'Independent Parliamentary Expenses Authority'
              : marker === 'introduced'
                ? 'ParlInfo bill records'
                : (reading.words ?? 'Published records');
    if (reading.records) {
      if (follow.seenKeys === undefined) continue;
      for (const record of reading.records) {
        if (seen.has(record.key)) continue;
        const text = recordText(record);
        if (!text) continue;
        // The division row carries the stage when both describe one event.
        if (
          record.kind === 'stage' &&
          Object.values(current).some((r) =>
            r.records?.some(
              (d) => d.kind === 'division' && sameEvent(record, d),
            ),
          )
        )
          continue;
        out.push(makeChange(marker, text, reading, citation, record));
      }
      if (
        follow.kind === 'party' &&
        marker === 'members' &&
        before.members?.records
      ) {
        const now = new Set(reading.records.map((r) => r.key));
        for (const record of before.members.records)
          if (!now.has(record.key))
            out.push(
              makeChange(
                marker,
                `No longer includes ${record.name ?? record.title}`,
                reading,
                citation,
                { ...record, date: reading.asAt ?? '' },
              ),
            );
      }
      continue;
    }
    const was = before[marker];
    if (!was || was.value === reading.value) continue;
    let text: string | undefined;
    if (follow.kind === 'person') {
      if (marker === 'party') text = `Now ${reading.words}; was ${was.words}`;
      if (marker === 'seat')
        text = reading.words
          ? `Now Member for ${reading.words}${was.words ? `; was ${was.words}` : ''}`
          : 'No longer in parliament';
      if (marker === 'expenses') {
        const [quarter] = String(reading.value).split('|');
        const match = /^(\d{4})Q0([1-4])$/.exec(quarter ?? '');
        if (match && String(was.value).split('|')[0] !== quarter)
          text = `Expenses to ${['March', 'June', 'September', 'December'][Number(match[2]) - 1]} ${match[1]} published`;
      }
      // Counts do not identify a vote, declaration or bill. Wait for records.
    } else if (follow.kind === 'bill') {
      if (marker === 'status')
        text =
          reading.value === 'royal_assent'
            ? 'Royal Assent'
            : `${reading.words?.charAt(0).toUpperCase()}${reading.words?.slice(1)}`;
      if (
        marker === 'moved' &&
        before.status?.value === current.status?.value &&
        reading.value
      )
        text = 'Moved to a new stage';
    } else if (follow.kind === 'electorate') {
      if (marker === 'representatives')
        text = reading.words
          ? `Now represented by ${reading.words.replaceAll('|', ' and ')}${was.words ? `; was ${was.words.replaceAll('|', ' and ')}` : ''}`
          : undefined;
      if (marker === 'status')
        text = reading.value === 'historical' ? 'Abolished' : undefined;
      if (
        marker === 'election' &&
        String(reading.value).split('|')[0] !== String(was.value).split('|')[0]
      )
        text = 'Election result added';
    }
    if (text)
      out.push({
        ...makeChange(marker, text, reading, citation),
        ...(marker === 'expenses' ? { today: false as const } : {}),
      });
  }
  return sortChanges(
    out.filter(
      (c, i) => !c.key || out.findIndex((other) => other.key === c.key) === i,
    ),
  );
}
