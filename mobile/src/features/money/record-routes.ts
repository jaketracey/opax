import type { Href } from 'expo-router';
import { partyRoute } from '../../navigation/routes/people';
import { moneyRecordRoute } from '../../navigation/routes/public-money';
import { resultsRoute } from '../../navigation/routes/search';
import type { MoneyGraph } from './data';
import { donorNodeFor } from './lookup';
import type { MapNode } from './map/model';

/** A selected entity's page; the money record retains the map's window. */
export function moneyMapEntityRoute(
  node: Pick<MapNode, 'kind' | 'label'>,
  record: Href | null,
): Href | null {
  switch (node.kind) {
    case 'party':
      return partyRoute(node.label);
    case 'donor':
    case 'hub':
      return record;
    default:
      return null;
  }
}

/** AEC associated-entity names are not grant recipient ids. */
export function associatedEntityRoute(name: string, graph: MoneyGraph | null) {
  const donor = donorNodeFor({ name }, graph);
  return donor
    ? moneyRecordRoute({ node: donor.id, jurisdiction: 'federal' }, donor.label)
    : resultsRoute('all', { q: name });
}
