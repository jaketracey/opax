import { catalogs } from '../../api/runtime';
import { InsetGroup } from '../../design/layout';
import { rowMenus, useRowFollow } from '../../design/row-link';
import { DivisionRow } from '../../design/rows';
import { Skeleton } from '../../design/states';
import { billRoute, divisionHistoryRoute } from '../../navigation/routes';
import { votesSources } from './sources';
import { blockState, reportOf, TodayBlock, useTodayRead } from './TodayBlock';
import { recentReadingVotes, voteMeta, type ReadingVote } from './votes';
import { stageTerm } from '../learn/term-map';

/**
 * How parliament voted (today.md 5.8): three second- and third-reading
 * votes, newest first, each opening that division on its bill page. While
 * `/divisions/recent.json` is read the block holds its place with its
 * heading and three rows' skeleton, so it is never inserted above Just
 * declared once the file answers. When the file is not there (and when the
 * rule leaves nothing) the block is absent, never empty.
 */
export function VotesBlock({
  attempt,
  onRetry,
}: {
  attempt: number;
  onRetry: () => void;
}) {
  const read = useTodayRead(
    'votes',
    (refresh) => catalogs.recentDivisions(refresh),
    attempt,
  );
  const block =
    read && read.status !== 'missing'
      ? read.status === 'ready' && read.data
        ? { ...read, data: recentReadingVotes(read.data, 3) }
        : { ...read, data: null }
      : null;
  // The file is published, so the block is expected: it loads in place.
  // An authoritative "not there" collapses it.
  if (read?.status === 'missing') return null;
  // Optional: offline with nothing saved, it collapses (today.md 5.14).
  const state = blockState(block, {
    emptyCollapses: true,
    errorCollapses: reportOf(read)?.offline,
  });
  return (
    <TodayBlock
      title="How parliament voted"
      gloss="division"
      action={{
        accessibilityLabel: 'See all votes',
        href: divisionHistoryRoute,
        testID: 'today-votes-all',
      }}
      state={state}
      skeleton={<Skeleton shape="divisions" count={3} label="Loading votes" />}
      error="Votes couldn’t be loaded."
      onRetry={onRetry}
      report={reportOf(read)}
      line={
        read?.status === 'ready'
          ? { ...votesSources(read), testID: 'today-votes-sources' }
          : undefined
      }
      testID="today-votes"
    >
      {(votes) => (
        <InsetGroup testID="today-votes-group">
          {votes.map((vote, i) => (
            <VoteRow key={vote.division_key} vote={vote} index={i} />
          ))}
        </InsetGroup>
      )}
    </TodayBlock>
  );
}

function VoteRow({ vote, index }: { vote: ReadingVote; index: number }) {
  const follow = useRowFollow('bill', vote.bill_key, vote.name);
  return (
    <DivisionRow
      title={vote.name}
      meta={voteMeta(vote)}
      metaTerm={stageTerm(voteMeta(vote))}
      outcome={vote.outcomeWord}
      ayes={vote.ayes}
      noes={vote.noes}
      countsStyle="ayesNoes"
      href={billRoute(vote.bill_key, undefined, {
        division: vote.division_key,
      })}
      menu={rowMenus.division({
        billKey: vote.bill_key,
        billTitle: vote.name,
        ...follow,
      })}
      testID={`today-vote-${index}`}
    />
  );
}
