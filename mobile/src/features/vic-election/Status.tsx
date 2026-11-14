import { Text } from '../../design/text';
import type { ElectionContext } from './model';
import { electionCopy } from './model';
import { vicCopy as c } from './copy';
import { Block, ExternalRow } from './shared';

export function ElectionStatus({
  context,
  now,
  electionURL,
  votingURL,
  awaiting = false,
}: {
  context: ElectionContext;
  now: Date;
  electionURL?: string;
  votingURL?: string;
  awaiting?: boolean;
}) {
  const copy = electionCopy(context, now, awaiting);
  const url = copy.closed ? electionURL : votingURL;
  return (
    <Block title={copy.heading}>
      <Text wordSafe variant="body">
        {copy.body}
      </Text>
      {url ? (
        <ExternalRow title={copy.closed ? c.vec : c.voting} url={url} />
      ) : null}
    </Block>
  );
}
