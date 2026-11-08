import { useEffect, useState } from 'react';
import type { Votes, VoteBill } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import { representativeProfile } from '../your-mp/model';
import { savedSeatDirectory, useSeat } from '../your-mp/useSeat';

/**
 * "{name}, your MP, voted for" under a vote (journeys/my-mp.md 3.7): the
 * saved seat's member and how they voted, matched on the device from the
 * published votes. The seat is never sent anywhere.
 */
export interface MemberVote {
  name: string;
  slug: string;
  position: 'for' | 'against';
}
export interface MemberVotes {
  name: string;
  slug: string;
  for: readonly VoteBill[];
  against: readonly VoteBill[];
}

const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('en-AU')
    .replace(/[’‘ʼ`']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const stageKey = (s: string | null | undefined) =>
  fold(String(s ?? '').replace(/_/g, ' '));

let votesRead: Promise<Votes | null> | null = null;
const readVotes = () =>
  (votesRead ??= catalogs
    .votes()
    .then((result) => result.data)
    .catch(() => {
      votesRead = null;
      return null;
    }));

/** The saved House member's federal vote rows, or null (no seat, no member). */
export function membersVotes(
  votes: Votes,
  member: { name: string; aliases?: readonly string[] },
) {
  const names = new Set([member.name, ...(member.aliases ?? [])].map(fold));
  const rows = Object.values(votes.records).filter(
    (record) =>
      record.jurisdiction === 'federal' &&
      record.house === 'representatives' &&
      names.has(fold(record.name)),
  );
  return {
    for: rows.flatMap((r) => r.for),
    against: rows.flatMap((r) => r.against),
  };
}

/**
 * How the member voted on one division: found only when exactly one of the
 * member's rows names this bill, this stage and this day, and no other vote
 * on the bill shares that stage and day. Anything less certain says nothing.
 */
export function memberPosition(
  member: Pick<MemberVotes, 'for' | 'against'>,
  bill: { title: string; shortTitle: string | null },
  division: { date: string; stage: string | null; title?: string | null },
  siblings: readonly {
    date: string;
    stage: string | null;
    title?: string | null;
  }[],
): 'for' | 'against' | null {
  const titles = new Set(
    [bill.title, bill.shortTitle].filter((t): t is string => !!t).map(fold),
  );
  const stage = stageKey(division.stage ?? division.title);
  if (!stage) return null;
  const twins = siblings.filter(
    (d) => d.date === division.date && stageKey(d.stage ?? d.title) === stage,
  );
  if (twins.length !== 1) return null;
  const match = (v: VoteBill) =>
    v.date === division.date &&
    stageKey(v.stage) === stage &&
    titles.has(fold(v.name));
  const ayes = member.for.filter(match).length;
  const noes = member.against.filter(match).length;
  if (ayes + noes !== 1) return null;
  return ayes ? 'for' : 'against';
}

/** The saved seat's member and their votes, once a seat is saved. */
export function useMyMemberVotes(enabled: boolean): MemberVotes | null {
  const seat = useSeat();
  const [found, setFound] = useState<(MemberVotes & { seatId: string }) | null>(
    null,
  );
  const seatId = seat.status === 'chosen' ? seat.choice.seatId : '';
  useEffect(() => {
    if (!enabled || !seatId) return;
    const directory = savedSeatDirectory();
    const chosen = directory?.electorates.data.electorates.find(
      (s) => s.electorate_id === seatId,
    );
    if (
      !directory ||
      !chosen ||
      chosen.jurisdiction !== 'federal' ||
      chosen.chamber !== 'representatives' ||
      chosen.representation_status !== 'verified' ||
      chosen.representatives.length !== 1
    )
      return;
    const profile = representativeProfile(
      chosen.representatives[0]!.person_id,
      directory,
    );
    if (!profile?.slug) return;
    let active = true;
    void readVotes().then((votes) => {
      if (!active || !votes) return;
      const rows = membersVotes(votes, { name: profile.name });
      setFound({ seatId, name: profile.name, slug: profile.slug!, ...rows });
    });
    return () => {
      active = false;
    };
  }, [enabled, seatId]);
  // A changed or cleared seat drops the old member at once.
  return enabled && found?.seatId === seatId ? found : null;
}
