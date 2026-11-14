// Donation-only view of the uncapped export. Other Receipt is never a loan or a gift.
import {receiptGraph,receiptFigures} from './donor-disclosure.js?v=6f4ae1756c';
export function donationGraph(graph) {
  const only = row => !row.by_type ? row : ({...row, donation_exclusions: undefined,
    by_type: {donation_received: (row.by_type.donation_received || 0) - (row.donation_exclusions?.by_type?.donation_received || 0)},
    by_type_year: Object.fromEntries(Object.entries(row.by_type_year || {}).map(([year, types]) =>
      [year, types.donation_received ? {donation_received: types.donation_received.map((value, i) =>
        value - (row.donation_exclusions?.by_type_year?.[year]?.donation_received?.[i] || 0))} : {}])),
  });
  return receiptGraph({...graph, receiptMeasure: false,
    nodes: graph.nodes.map(n => {
      if (n.kind === 'donor') return only(n);
      if (n.kind !== 'party' || !n.by_type) return n;
      const f = receiptFigures(only(n));
      return {...n, total:f.total, count:f.count, byYear:f.cells, firstYear:f.firstYear, lastYear:f.lastYear};
    }),
    edges: graph.edges.map(only),
  });
}
