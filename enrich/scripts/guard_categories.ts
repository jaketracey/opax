// Audit only. Classification never grants an exemption or emits candidate text.
import words from '../src/historic-words.json' with { type: 'json' }
import geography from '../src/historic-geography.json' with { type: 'json' }
import { OFFICE_KEYS, nameKey } from '../src/validate.ts'

export const CATEGORIES = ['acronym', 'office', 'countryDemonymNationality', 'institutionProgram', 'dictionaryAlone', 'style', 'likelyPersonalName'] as const
export type Category = typeof CATEGORIES[number]
const dictionary = new Set(words.words.split('\n'))
const countries = new Set((geography.countries + '\n' + geography.demonyms).split('\n').map(nameKey))
const styleTerms = new Set(['budget', 'question time', 'first reading', 'second reading', 'third reading'])

export function termCategory(term: string, summary: string): Category {
  const key = nameKey(term)
  if (/^[A-Z]{2,6}$/.test(term)) return 'acronym'
  if (OFFICE_KEYS.has(key)) return 'office'
  if (countries.has(key)) return 'countryDemonymNationality'
  if (styleTerms.has(key)) return 'style'
  if (/\b(?:act|bill|committee|department|commission|council|authority|program|scheme|fund|institute|university|bank|policy|agreement|organisation|organization|community|administration|union|corporation|association|defence force|navy|army|air force)$/.test(key)) return 'institutionProgram'
  if (dictionary.has(key)) return 'dictionaryAlone'
  // Ordinary words in a capitalised phrase can reflect styling. This audit
  // category does NOT permit multiword dictionary phrases through the guard.
  const prefix = summary.slice(0, summary.indexOf(term)).slice(-60)
  const personalContext = /\b(?:Mr|Mrs|Ms|Dr|Sir|Dame|Justice|Senator|Professor)\.?\s*$|(?:tribute to|thanked|honoured|honored|praised|met|raised by)\s*$/i.test(prefix)
  if (!personalContext && key.split(' ').every(word => dictionary.has(word))) return 'style'
  // Conservatively include unclassified proper terms here, count only. This
  // is deterministic triage, not a claim that every unmatched phrase is a person.
  return 'likelyPersonalName'
}
