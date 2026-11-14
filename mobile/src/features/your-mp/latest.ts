import type { BillIndex } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import type { SourceCitation, SourceOriginal } from '../../design/source';
import {
  questionType,
  voteAction,
  type QuestionType,
} from '../follows/changes';
import { followState, needsFor } from '../follows/markers';
import { followKey, markSeen, type Follow } from '../follows/store';
import { latestRecords, type LatestRecord } from './LatestRows';
import type { ProfileView } from './model';

export { questionType, voteAction, type QuestionType };

/** Rows on the Your MP tab; Today's card shows three. */
export const LATELY_LIMIT = 5;

/** The rule said in the Lately source sheet, word for word. */
export const LATELY_RULE =
  'The newest dated records about this member, newest first. A vote on an amendment says so; procedural votes are left out. Speeches are not included.';

type LatelyProfile = Pick<ProfileView, 'blocks' | 'slug' | 'personId'>;

export type LatelyState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; records: LatestRecord[] };

/**
 * Lately from what the tab already loads: the member's votes on bills (by
 * the question rule), dated register changes and the bills they introduced.
 * One failed source drops its rows; every source failing is an error, never
 * an empty list.
 */
export function latelyFor(
  profile: LatelyProfile | null,
  bills: BillIndex | null | undefined,
  options: { failed?: boolean; limit?: number } = {},
): LatelyState {
  if (options.failed) return { status: 'error' };
  if (!profile) return { status: 'loading' };
  const { votes, interests } = profile.blocks;
  if (votes.status === 'error' && interests.status === 'error' && !bills)
    return { status: 'error' };
  const records = latestRecords(
    profile,
    bills ?? undefined,
    options.limit ?? LATELY_LIMIT,
  );
  return records.length ? { status: 'ready', records } : { status: 'empty' };
}

/** The sources Lately read, each with its own date, for the line and sheet. */
export function latelySource(
  profile: LatelyProfile,
  bills: { asOf?: string | null } | null,
): {
  asOf: string | null;
  citation: SourceCitation[];
  originals: SourceOriginal[];
  notes: string[];
} {
  const { votes, interests } = profile.blocks;
  const citation: SourceCitation[] = [];
  const originals: SourceOriginal[] = [];
  const missing: string[] = [];
  const add = (
    block: { status: string; asAt: string | null; sources: SourceOriginal[] },
    label: string,
  ) => {
    if (block.status === 'error') {
      missing.push(label);
      return;
    }
    if (block.status !== 'ready') return;
    citation.push({ label, asOf: block.asAt });
    for (const s of block.sources)
      if (!originals.some((o) => o.url === s.url))
        originals.push({ label: s.label, url: s.url, asOf: block.asAt });
  };
  add(votes as unknown as Parameters<typeof add>[0], 'They Vote For You');
  add(
    interests as unknown as Parameters<typeof add>[0],
    'Register of interests',
  );
  if (bills)
    citation.push({
      label: 'Parliament of Australia',
      asOf: bills.asOf ?? null,
    });
  const dates = citation
    .map((c) => c.asOf ?? null)
    .filter((d): d is string => typeof d === 'string' && !!d)
    .sort();
  return {
    asOf: dates.at(-1) ?? null,
    citation,
    originals,
    notes: [
      LATELY_RULE,
      ...(missing.length
        ? [`Not shown: ${missing.join(' and ')} couldn’t be loaded.`]
        : []),
    ],
  };
}

/**
 * When the reader follows their own MP, the keys Lately's rows showed (and
 * the member's party and seat) are marked seen once the rows have been on
 * screen; anything the rows did not show stays new for the profile.
 */
export async function markLatelySeen(
  follow: Follow,
  shownKeys: readonly string[],
): Promise<void> {
  if (!shownKeys.length) return;
  const state = followState(
    follow,
    await catalogs.followSources(needsFor([follow])),
  );
  if (state.status !== 'ready') return;
  const shown = new Set(shownKeys);
  const reading = Object.fromEntries(
    Object.entries(state.current).filter(
      ([marker, r]) =>
        marker === 'party' ||
        marker === 'seat' ||
        !!r.records?.some((record) => shown.has(record.key)),
    ),
  );
  await markSeen(followKey(follow), reading, shownKeys);
}
