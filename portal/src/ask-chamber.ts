/** Ask uses corpus chamber keys; registers historically call the federal lower house "house". */
export const canonicalChamber = (chamber: unknown): string => chamber === 'house' ? 'representatives' : String(chamber ?? '')
export const ASK_CHAMBERS = ['representatives', 'federation', 'senate', 'nsw_la', 'nsw_lc', 'vic_la', 'vic_lc', 'qld_la', 'sa_ha', 'sa_lc', 'wa_la', 'wa_lc', 'tas_ha', 'tas_lc', 'act_la', 'nt_la', 'legislative_council', 'legislative_assembly']
export function questionChamber(q: string, jurisdiction?: string): string | undefined {
  if (/\bfederation chamber\b|\bmain committee\b/i.test(q)) return 'federation'
  if (/\bsenat(?:e|ors?)\b/i.test(q)) return 'senate'
  if (/\blegislative council\b/i.test(q)) return jurisdiction && ['nsw','vic','sa','wa','tas'].includes(jurisdiction) ? jurisdiction + '_lc' : 'legislative_council'
  const lower = jurisdiction && jurisdiction !== 'federal' ? jurisdiction + (['sa','tas'].includes(jurisdiction) ? '_ha' : '_la') : 'representatives'
  if (/\blegislative assembly\b/i.test(q)) return jurisdiction && jurisdiction !== 'federal' ? lower : 'legislative_assembly'
  if (/\bhouse of representatives\b|\bmembers? of (?:the )?house\b|\bmps?\b|\bhouse of assembly\b/i.test(q)) return lower
}
