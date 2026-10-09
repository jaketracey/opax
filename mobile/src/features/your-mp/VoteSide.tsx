import { StatusLabel } from '../../design/primitives';

/**
 * @deprecated Use `StatusLabel`. "Voted for" or "Voted against" above a
 * bill vote: the word carries the meaning (done or ended tone). The row
 * around it says the vote.
 */
export function VoteSide({ side }: { side: 'for' | 'against' }) {
  return (
    <StatusLabel
      label={side === 'for' ? 'Voted for' : 'Voted against'}
      tone={side === 'for' ? 'done' : 'ended'}
      hidden
    />
  );
}
