/** A complete chamber day requires resolved turns and publication receipts. */
export function nswHansardCoverageNote(receipt) {
  if (receipt?.schema !== 1 || receipt.source !== 'nsw_hansard' || receipt.discovery !== 'complete'
      || receipt.start !== '2023-01-01' || receipt.end !== '2025-02-28' || !Array.isArray(receipt.gaps)) {
    throw Error('NSW Hansard coverage guard: successful source calendar required');
  }
  const names = {nsw_la:'NSW Assembly', nsw_lc:'NSW Council'};
  const seen = new Set();
  const validDates = (dates,year) => Array.isArray(dates) && new Set(dates).size === dates.length && dates.every(d =>
    typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d))
    && new Date(d).toISOString().slice(0,10) === d && d.startsWith(`${year}-`) && d >= receipt.start && d <= receipt.end);
  return receipt.gaps.map(g => {
    const key = `${g.chamber}/${g.year}`;
    const incomplete = g.incomplete_dates ?? g.missing_dates;
    const held = g.held_turns ?? 0, pending = g.publication_pending ?? 0, failed = g.publication_failed ?? 0, errors = g.stage_errors ?? 0;
    if (!names[g.chamber] || !Number.isInteger(g.year) || g.year < 2023 || g.year > 2025 || seen.has(key)
        || !Number.isInteger(g.expected_days) || !validDates(g.missing_dates,g.year) || !validDates(incomplete,g.year)
        || !incomplete.length || incomplete.length > g.expected_days || g.missing_dates.some(d=>!incomplete.includes(d))
        || ![held,pending,failed,errors].every(n=>Number.isSafeInteger(n)&&n>=0)
        || (!g.missing_dates.length && !(held+pending+failed+errors))) {
      throw Error('NSW Hansard coverage guard: invalid chamber-year gap');
    }
    seen.add(key);
    const parts=[];
    if(g.missing_dates.length) parts.push(`speeches missing on ${g.missing_dates.length} sitting ${g.missing_dates.length===1?'day':'days'}`);
    if(held+pending+failed+errors) parts.push(`${incomplete.length} sitting ${incomplete.length===1?'day':'days'} incomplete`);
    if(held) parts.push(`${held} turns awaiting speaker identification`);
    if(pending) parts.push(`${pending} speeches awaiting publication`);
    if(failed) parts.push(`${failed} publication ${failed===1?'failure':'failures'}`);
    if(errors) parts.push(`${errors} sitting ${errors===1?'day requires':'days require'} review`);
    return `${names[g.chamber]} ${g.year}: ${parts.join('; ')}.`;
  }).join(' ');
}
