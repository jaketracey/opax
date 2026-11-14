// Offline money facts shared by the gold builder and its money-only refresh.
import {donationGraph} from '../portal/public/money-receipts.js';
export const MONEY_FILE = 'portal/public/graph/money-receipts.json';
export function moneyGold(raw) {
  const money = donationGraph(raw), nodes = new Map(money.nodes.map(n => [n.id, n]));
  const edges = money.edges.filter(e => nodes.get(e.source)?.kind === 'donor' && nodes.get(e.target)?.kind === 'party' && e.total > 0 && !e.grant && !e.flow);
  return {
    topDonors(party, n = 3) {
      return {party, top: edges.filter(e => e.target === `party:${party}`).sort((a,b) => b.total-a.total)
        .slice(0,n).map(e => ({name:nodes.get(e.source).label,total_aud:e.total,receipts:e.count,years:[e.firstYear,e.lastYear]})),
        query:{file:MONEY_FILE,select:`uncapped recipient Donation Received flows to party:${party}, sorted by amount`}};
    },
    industryByParty(industry) {
      const sums = new Map();
      for (const e of edges) if (nodes.get(e.source).industry === industry) sums.set(e.target.slice(6),(sums.get(e.target.slice(6)) || 0)+e.total);
      return {industry,rows:[...sums].map(([party,total_aud])=>({party,total_aud:Math.round(total_aud*100)/100})).sort((a,b)=>b.total_aud-a.total_aud),
        query:{file:MONEY_FILE,select:`uncapped sum Donation Received by recipient party where donor.industry = ${industry}`}};
    },
  };
}
