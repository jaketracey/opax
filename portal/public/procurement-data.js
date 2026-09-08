/** The same contract totals as the profiles, directed from agency to supplier. */
export function procurementGraph(profile, kind = 'agency', limit = 60) {
  const agency = kind === 'agency';
  const rows = [...(agency ? profile.suppliers : profile.agencies)].filter(row => Number(row.total) > 0)
    .sort((a, b) => b.total - a.total).slice(0, limit);
  const rootId = `${kind}:${profile.id}`;
  const node = (id, label, nodeKind, total, count, profileId) => ({ id, label, kind: nodeKind,
    group: nodeKind === 'agency' ? 'agencies' : 'suppliers', industry: nodeKind === 'agency' ? 'government agency' : 'government supplier',
    colour: nodeKind === 'agency' ? '#9e781d' : '#386e83', total, count, firstYear: null, lastYear: null,
    profileUrl: `/subject/${nodeKind}/${encodeURIComponent(profileId)}` });
  const nodes = [node(rootId, profile.name, kind, profile.total, profile.count, profile.id)];
  const edges = rows.map(row => {
    const otherKind = agency ? 'supplier' : 'agency';
    const otherId = `${otherKind}:${row.id || row.name}`;
    nodes.push(node(otherId, row.name, otherKind, row.total, row.count, row.id || row.name));
    return { source: agency ? rootId : otherId, target: agency ? otherId : rootId,
      flow: 'contracts', total: row.total, count: row.count, firstYear: null, lastYear: null };
  });
  return { meta: { procurement: true, coverage: 'Recorded contract commitments, not verified payments.',
    displayed: rows.length, available: (agency ? profile.suppliers : profile.agencies).filter(row => Number(row.total) > 0).length }, nodes, edges };
}
