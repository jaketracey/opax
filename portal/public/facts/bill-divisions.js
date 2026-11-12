/** Bill exports retain stage annotations. Division facts come from the same
 * standalone record as /doc, including corrected totals and outcomes.
 * A missing or mismatched record rejects rather than publishing an old tally.
 */
export async function withBillDivisions(bill, read) {
  const divisions = await Promise.all((bill.divisions || []).map(async embedded => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(embedded.key)) throw new Error('Invalid division key')
    const record = await read(`/divisions/division-${embedded.key}.json`)
    if (record?.key !== embedded.key) throw new Error(`Division identity mismatch: ${embedded.key}`)
    return {
      ...embedded, ...record,
      ayes: record.ayes,
      noes: record.noes,
      // These two names differ between the older bill and division schemas.
      outcome: record.result,
      url: record.source_url,
      ...(record.party_tallies ? {party_splits: Object.fromEntries(record.party_tallies.map(p =>
        [p.party, {ayes: p.votes.aye || 0, noes: p.votes.no || 0}]))} : {}),
    }
  }))
  return {...bill, divisions}
}
