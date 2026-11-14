/** Require a successful NSW source-calendar receipt before publishing its coverage. */
export function nswHansardCoverageNote(receipt) {
  if (receipt?.schema !== 1 || receipt.source !== 'nsw_hansard' || receipt.discovery !== 'complete'
      || receipt.start !== '2022-10-01' || receipt.end !== '2025-02-28' || !Array.isArray(receipt.gaps)) {
    throw Error('NSW Hansard coverage guard: successful source calendar required');
  }
  const names = {nsw_la:'NSW Assembly', nsw_lc:'NSW Council'};
  const seen = new Set();
  return receipt.gaps.map(g => {
    const key = `${g.chamber}/${g.year}`;
    if (!names[g.chamber] || !Number.isInteger(g.year) || g.year < 2022 || g.year > 2025 || seen.has(key)
        || !Number.isInteger(g.expected_days) || !Array.isArray(g.missing_dates) || !g.missing_dates.length
        || g.missing_dates.length > g.expected_days || new Set(g.missing_dates).size !== g.missing_dates.length
        || g.missing_dates.some(d => typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)
          || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10) !== d
          || !d.startsWith(`${g.year}-`) || d < receipt.start || d > receipt.end)) {
      throw Error('NSW Hansard coverage guard: invalid chamber-year gap');
    }
    seen.add(key);
    return `${names[g.chamber]} ${g.year}: speeches missing on ${g.missing_dates.length} sitting ${g.missing_dates.length === 1 ? 'day' : 'days'}.`;
  }).join(' ');
}
