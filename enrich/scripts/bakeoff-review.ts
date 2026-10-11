// Review only the blind sample. Capitalised tokens are replaced consistently within each pair.
// This deliberately masks organisations and places too, so private names never reach the console.
import { readFileSync } from 'node:fs'
const out = '/home/jake/opax-staging/federation/bakeoff/'
const pairs = JSON.parse(readFileSync(out + 'spotcheck-30.json', 'utf8'))
const offset = Number(process.argv[2] ?? 0), count = Number(process.argv[3] ?? 3)
const sourceStart = Number(process.argv[4] ?? 0), sourceSize = Number(process.argv[5] ?? Infinity)
const openingAction = (s: string) => s.match(/^(Asked|Argued|Announced|Moved|Reported|Paid tribute|Answered|Responded|Questioned|Explained|Stated|Warned|Noted|Confirmed|Outlined|Called|Urged|Rejected|Opposed|Supported|Described|Criticised|Defended|Presented|Proposed|Welcomed|Requested|Expressed)\b/i)?.[0].toLowerCase() ?? null
for (const pair of pairs.slice(offset, offset + count)) {
  const tokens = new Map<string, string>()
  const redact = (s: string) => String(s).replace(/(?<!\p{L})\p{Lu}[\p{L}\p{M}]*(?:['’\-][\p{L}\p{M}]+)*/gu, token => {
    const normal = token.normalize('NFC').replace(/[’‘]/g, "'").replace(/[‐‑–]/g, '-').toLowerCase()
    const possessive = normal.endsWith("'s"), key = normal.replace(/'s$/, '')
    if (!tokens.has(key)) tokens.set(key, `[token-${tokens.size + 1}]`)
    return tokens.get(key)! + (possessive ? "'s" : '')
  })
  const text = redact(pair.text)
  console.log(JSON.stringify({ id: pair.id, slug: pair.slug, source_characters: text.length, source_start: sourceStart, truncated: sourceStart + sourceSize < text.length, text: text.slice(sourceStart, sourceStart + sourceSize), A: { summary: redact(pair.A.summary), opening_action: openingAction(pair.A.summary), topics: pair.A.topics }, B: { summary: redact(pair.B.summary), opening_action: openingAction(pair.B.summary), topics: pair.B.topics } }))
}
