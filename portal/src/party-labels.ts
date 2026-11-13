/** Party names a reader or model writes, mapped to the KB's speech party labels (the party on the day). */
const fold = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/\bparty\b|\bof australia\b|\bthe\b|\baustralian\b/g, ' ').replace(/\s+/g, ' ').trim()
const LIBERTARIAN = ['Libertarian Party', 'Liberal Democratic Party']
const LABELS: Record<string, string[]> = {
  labor: ['Labor'], alp: ['Labor'], labour: ['Labor'],
  liberal: ['Liberal'], liberals: ['Liberal'],
  nationals: ['Nationals'], national: ['Nationals'], nats: ['Nationals'],
  lnp: ['LNP'], 'liberal national': ['LNP'],
  greens: ['Greens'], green: ['Greens'],
  independent: ['Independent'], independents: ['Independent'],
  'one nation': ['One Nation'], "pauline hanson's one nation": ['One Nation'],
  democrats: ['Australian Democrats'], democrat: ['Australian Democrats'],
  "katter's": ["Katter's Australian Party"], katter: ["Katter's Australian Party"],
  'country liberal': ['Country Liberal Party'], clp: ['Country Liberal Party'],
  'jacqui lambie network': ['Jacqui Lambie Network', 'JLN'], jln: ['Jacqui Lambie Network', 'JLN'], 'lambie network': ['Jacqui Lambie Network', 'JLN'],
  'centre alliance': ['Centre Alliance'], 'united australia': ['United Australia Party'], uap: ['United Australia Party'],
  // One party under two names (labels.js PARTY_RENAMES): either name finds both, and each record keeps its own label.
  libertarian: LIBERTARIAN, libertarians: LIBERTARIAN, 'liberal democratic': LIBERTARIAN, 'liberal democrats': LIBERTARIAN,
  'liberal democrat': LIBERTARIAN, ldp: LIBERTARIAN, 'libertarian (formerly liberal democrats)': LIBERTARIAN,
}
/** "Coalition" is every Coalition party label. Unknown names return null so the caller can say so. */
export function searchPartyLabels(party: string): string[] | null {
  const key = fold(party)
  if (/^(?:the )?coalition$/.test(key)) return [...new Set([...LABELS.liberal, ...LABELS.nationals, ...LABELS.lnp, ...LABELS.clp])]
  return LABELS[key] ?? null
}
