/**
 * The money graphs' party nodes, for the party-colour dot on person and speech share cards.
 * The Worker indexes the graphs in this order (src/index.ts moneyIndex): federal first, and a
 * state-only party stands in. scripts/build_growth_modules.mjs writes the party nodes of all four
 * at release, so a cold isolate reads about 10 KB rather than the graphs (2.9 MB).
 */
export const MONEY_GRAPH_PATHS = ['/graph/money.json', '/graph/money.qld.json', '/graph/money.vic.json', '/graph/money.tas.json'];
export const MONEY_PARTIES_PATH = '/growth/money-parties.json';
/** Graphs in MONEY_GRAPH_PATHS order -> the file the Worker reads: each graph's meta and party nodes. */
export function moneyPartiesFile(graphs) {
  if (graphs.length !== MONEY_GRAPH_PATHS.length) throw new Error('money parties: one graph per path');
  return {files: graphs.map(graph => ({
    meta: {generated: graph.meta?.generated, sourceShort: graph.meta?.sourceShort},
    nodes: graph.nodes.filter(node => node.kind === 'party').map(node => ({label: node.label, kind: node.kind, ...(node.colour === undefined ? {} : {colour: node.colour})})),
  }))};
}
