import type { Money } from '../src/api/catalog-decoders';
import { receiptParties } from '../src/api/party-transforms';
export function assertReceiptsLookup(
  graph: Money,
  source: 'pinned' | 'current' = 'pinned',
) {
  const parties = graph.nodes
    .filter((n) => n.kind === 'party')
    .map((n) => ({ label: n.label, aliases: n.aliases ?? [] }));
  if (
    JSON.stringify(receiptParties.parties) !== JSON.stringify(parties) ||
    (source === 'pinned' && receiptParties.generated !== graph.meta.generated)
  )
    throw new Error(
      'Party receipts lookup has drifted from the money graph. Repin the complete sourceCommit/hash/size set and update src/api/party-transforms.ts; see mobile/README.md for repinning.',
    );
}
