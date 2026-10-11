// Review only the blind sample. Capitalised tokens are replaced consistently within each pair.
// This deliberately masks organisations and places too, so private names never reach the console.
import { readFileSync } from 'node:fs'
const out = '/home/jake/opax-staging/federation/bakeoff/'
const pairs = JSON.parse(readFileSync(out + 'spotcheck-30.json', 'utf8'))
const offset = Number(process.argv[2] ?? 0), count = Number(process.argv[3] ?? 3)
for (const pair of pairs.slice(offset, offset + count)) {
  const tokens = new Map<string, string>()
  const redact = (s: string) => String(s).replace(/(?<!\p{L})\p{Lu}[\p{L}\p{M}]*(?:['’\-][\p{L}\p{M}]+)*/gu, token => {
    const key = token.toLowerCase()
    if (!tokens.has(key)) tokens.set(key, `[token-${tokens.size + 1}]`)
    return tokens.get(key)!
  })
  console.log(JSON.stringify({ id: pair.id, slug: pair.slug, text: redact(pair.text), A: { summary: redact(pair.A.summary), topics: pair.A.topics }, B: { summary: redact(pair.B.summary), topics: pair.B.topics } }))
}
