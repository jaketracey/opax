import { samePartyLabel } from '../../design/party';
import type { MoneyGraph, MoneyJurisdiction, MoneyNode } from './data';

/**
 * The graphs the app has already loaded, by jurisdiction. Lookups read
 * these only; they never start the 681 kB graph load themselves
 * (journeys/money.md 4.10).
 */
const loaded = new Map<MoneyJurisdiction, MoneyGraph>();
export function rememberMoneyGraph(
  jurisdiction: MoneyJurisdiction,
  graph: MoneyGraph,
) {
  loaded.set(jurisdiction, graph);
}
export function loadedMoneyGraph(jurisdiction: MoneyJurisdiction = 'federal') {
  return loaded.get(jurisdiction) ?? null;
}
/** Tests reset the cache between cases. */
export function forgetMoneyGraphs() {
  loaded.clear();
}

export const normaliseOrganisation = (name: string) =>
  name
    .toLocaleLowerCase('en-AU')
    .replace(/[’']/g, '')
    .replace(/\b(?:pty|ltd|limited|the|inc|incorporated)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The named donor on the map for an organisation, matched on identity first
 * (a grant recipient or supplier id the node's register blocks carry, such
 * as "abn:33007457141"), then on its name or one of its recorded spellings.
 */
export function donorNodeFor(
  subject: { rid?: string | null; abn?: string | null; name?: string | null },
  graph: MoneyGraph | null = loadedMoneyGraph(),
): MoneyNode | null {
  if (!graph) return null;
  const donors = graph.nodes.filter((n) => n.kind === 'donor');
  const ids = [
    subject.rid,
    subject.abn ? `abn:${subject.abn.replace(/\s+/g, '')}` : null,
  ].filter((id): id is string => !!id);
  if (ids.length) {
    const byId = donors.find((n) =>
      ids.some((id) => n.grants?.rid === id || n.contracts?.rid === id),
    );
    if (byId) return byId;
  }
  const name = subject.name ? normaliseOrganisation(subject.name) : '';
  if (!name) return null;
  return (
    donors.find((n) =>
      [n.label, ...(n.aliases ?? [])].some(
        (alias) => normaliseOrganisation(alias) === name,
      ),
    ) ?? null
  );
}

/** A party node by its id ("party:Labor") or any of its names ("ALP"). */
export function partyNodeFor(graph: MoneyGraph, value: string) {
  const name = value.startsWith('party:') ? value.slice(6) : value;
  return (
    graph.nodes.find((n) => n.id === value && n.kind === 'party') ??
    graph.nodes.find(
      (n) => n.kind === 'party' && samePartyLabel(n.label, name),
    ) ??
    null
  );
}
