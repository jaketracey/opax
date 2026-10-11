// Source-derived, non-person controls. Never emit the selected text or title metadata.
import roster from './historic-control-vocabulary.json' with {type: 'json'}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const places = [...roster.electorates.split('\n'), 'New South Wales', 'New Zealand', 'Papua New Guinea', 'East Timor', 'South Africa', 'United States', 'United Kingdom', 'Northern Territory', 'Australian Capital Territory', 'Western Australia', 'South Australia', 'Hong Kong', 'Sri Lanka', 'Port Moresby', 'Torres Strait', 'Cape York']
const patterns: Record<string, RegExp> = {
  placesElectorates: new RegExp(`\\b(?:${places.sort((a, b) => b.length - a.length).map(escape).join('|')})\\b`, 'gi'),
  parties: /\b(?:Australian Labor Party|Labor Party|Liberal Party|National Party|Country Party|Australian Democrats|Australian Greens|One Nation|Liberal National Party)\b/g,
  titles: /\b(?:Mr (?:Deputy )?Speaker|Mr (?:Deputy )?President|Madam Speaker|Madam President|(?:Deputy )?Prime Minister|the Treasurer|Minister for (?:[A-Z][a-z-]+(?: (?:and|the))? ?){1,5})\b/g,
  laws: /\b[A-Z][a-z-]+(?: (?:[A-Z][a-z-]+|and|of|the|for)| \([A-Za-z ]+\)){0,10} (?:Act|Bill)\b/g,
}
const portfolios = new Set([...roster.portfolioWords.split('\n'), 'and', 'the', 'deputy', 'treasurer'])
const personalTitle = /(?<![-‐‑–])\b(?:Mr|Mrs|Ms|Miss|Dr|Sir|Dame|Senator|Professor|Prof|Captain|Rev|Reverend|General)\b/
export interface Control { category: string; text: string; corrected: boolean }
export function pilotControls(text: string): { controls: Control[]; malformed: number; replacements: Control[] } {
  const clean: Control[] = []
  let malformed = 0
  for (const [category, pattern] of Object.entries(patterns)) for (const match of text.matchAll(pattern)) {
    let value = match[0].trim()
    if (category === 'titles' && value.startsWith('Minister for ')) {
      const words = value.slice('Minister for '.length).replace(/\s+and Minister\b.*$/, '').split(/\s+/)
      const stop = words.findIndex(w => !portfolios.has(w.toLowerCase()))
      const valid = words.slice(0, stop < 0 ? words.length : stop)
      while (valid.length && /^(?:and|the)$/i.test(valid.at(-1)!)) valid.pop()
      value = valid.length ? 'Minister for ' + valid.join(' ') : ''
    }
    if (category === 'laws') {
      // The old selector split hyphenated law titles and mistook a given name for Bill.
      const prefix = text.slice(0, match.index).match(/[\p{L}]+[-‐‑–]$/u)?.[0]
      if (prefix) value = prefix + value
      if (personalTitle.test(value) || /^(?:Prime Minister|Minister|(?:(?:Attorney|Solicitor)[-‐‑–])?General) Bill$/.test(value)) value = ''
    }
    if (!value) { malformed++; continue }
    clean.push({ category, text: value, corrected: value !== match[0].trim() })
  }
  const replacements: Control[] = []
  const added = new RegExp(`\\b(?:${REVIEW_REFERENCES.map(escape).join('|')})\\b`, 'g')
  for (const match of text.matchAll(added)) replacements.push({ category: /^(Royal|Department)/.test(match[0]) ? 'organisations' : 'placesElectorates', text: match[0], corrected: false })
  return { controls: clean, malformed, replacements }
}

export const REVIEW_REFERENCES = ['Port Hedland', 'Cape Town', 'Royal Australian Navy', 'Mount Isa', 'Lake Eyre', 'River Murray', 'Department of Foreign Affairs', 'Department of Health and Aged Care', 'Royal Australian Air Force']
