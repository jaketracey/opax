/** Shared financial record semantics. A public award is never a political receipt. */
export function moneyFlowType(edge, nodes) {
  const from = nodes.get(edge.source), to = nodes.get(edge.target);
  if (!from || !to || !Number.isFinite(edge.total) || edge.total <= 0) return null;
  if (from.kind === 'agency' && to.kind === 'supplier' && edge.flow === 'contracts') return 'contracts';
  if (from.kind === 'grantor' && to.kind === 'donor') return edge.flow === 'contracts' || from.flow === 'contracts' || from.explorer === 'contracts' ? 'contracts' : 'grants';
  if (from.kind === 'donor' && to.kind === 'party' && !edge.grant && !edge.flow) return 'receipts';
  return null;
}
export function filterMoneyEdges(graph, filters = {}) {
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const query = String(filters.query || '').trim().toLocaleLowerCase('en-AU');
  return graph.edges.filter(edge => {
    const type = moneyFlowType(edge, nodes);
    if (!type || filters.type && filters.type !== 'all' && type !== filters.type) return false;
    const from = nodes.get(edge.source), to = nodes.get(edge.target);
    if (filters.party && (type !== 'receipts' || to.id !== filters.party)) return false;
    if (filters.industry && ![from, to].some(n => n.kind === 'donor' && (n.group === filters.industry || n.industry === filters.industry))) return false;
    if (Number.isFinite(filters.min) && edge.total < filters.min) return false;
    return !query || `${from.label} ${to.label}`.toLocaleLowerCase('en-AU').includes(query);
  });
}
export function moneyTotals(graph) {
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const totals = { receipts: 0, contracts: 0, grants: 0 };
  for (const edge of graph.edges) { const type = moneyFlowType(edge, nodes); if (type) totals[type] += edge.total; }
  return totals;
}
export function moneyRecordsCSV(graph) {
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const cell = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
  const rows = [['Record type', 'From', 'To', 'Value (AUD)', 'Record count', 'First year', 'Last year']];
  for (const edge of graph.edges) {
    const type = moneyFlowType(edge, nodes); if (!type) continue;
    rows.push([type, nodes.get(edge.source).label, nodes.get(edge.target).label, edge.total, edge.count, edge.firstYear, edge.lastYear]);
  }
  return rows.map(row => row.map(cell).join(',')).join('\r\n');
}
export function readMoneyFilters(params) {
  const type = params.get('type');
  const min = Number(params.get('min'));
  return { type: ['receipts','contracts','grants'].includes(type) ? type : 'all',
    party: params.get('party') || '', industry: params.get('industry') || '',
    query: (params.get('q') || '').slice(0,200), min: Number.isFinite(min) && min > 0 ? min : 0 };
}
