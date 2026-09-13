// Proposes, and on approval adds, photographs for the daily edition's carousel
// covers. The Worker only ever posts photographs listed in
// portal/public/social/photos.json, so a person runs this: first to see what
// Wikimedia Commons has for a subject, then to approve one file by name.
//
//   node scripts/propose_social_photos.mjs search "Qantas Founders Museum Longreach"
//   node scripts/propose_social_photos.mjs approve "File:Qantas Founders Museum, Longreach, 2024.jpg" \
//        --id qantas-founders-roof --subject grant:GA34203 --describe "The airpark roof over the aircraft"
//   node scripts/propose_social_photos.mjs approve "File:…" --id senate-chamber --kind bill:senate
//
// Only CC0, public domain, CC BY and CC BY-SA files are accepted (the licence
// families story.ts allows). The credit line is written from the Commons
// author and licence and is drawn on the slide and repeated in the caption.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// sharp is the portal's dependency; the script lives beside the other repo scripts.
const sharp = createRequire(new URL('../portal/package.json', import.meta.url))('sharp')

const root = fileURLToPath(new URL('../portal/public/', import.meta.url))
const catalogPath = root + 'social/photos.json'
const UA = 'opax-social-photos/1.0 (https://opax.com.au; contact via github.com/jaketracey/opax)'
const ACCEPTED = /^(CC0|Public domain|CC BY(?:-SA)?(?: \d(?:\.\d)?)?(?: [A-Z]{2})?)$/i

const [, , command, ...rest] = process.argv
const flags = {}
const positional = []
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1] ?? true, i++
  else positional.push(rest[i])
}

async function commons(params) {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', ...params })
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`Commons ${res.status}`)
  return res.json()
}
const plain = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
const meta = (page) => {
  const info = page.imageinfo?.[0]
  const m = info?.extmetadata ?? {}
  return info ? { title: page.title, width: info.width, height: info.height, page: info.descriptionurl, url: info.url, thumb: info.thumburl,
    licence: m.LicenseShortName?.value ?? '', licence_url: m.LicenseUrl?.value ?? '', author: plain(m.Artist?.value).replace(/\s*\(.*$/, ''), date: m.DateTimeOriginal?.value ?? '' } : null
}

if (command === 'search') {
  const query = positional.join(' ')
  if (!query) throw new Error('search needs a query')
  const data = await commons({ action: 'query', generator: 'search', gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: 6, gsrlimit: Number(flags.limit ?? 12), prop: 'imageinfo', iiprop: 'url|size|extmetadata' })
  const rows = Object.values(data.query?.pages ?? {}).map(meta).filter(Boolean).sort((a, b) => b.width * b.height - a.width * a.height)
  for (const r of rows) {
    const ok = ACCEPTED.test(r.licence) && r.width >= 1200
    console.log(`${ok ? 'ok ' : 'no '} ${r.width}x${r.height}  ${r.licence.padEnd(14)} ${r.author.slice(0, 24).padEnd(24)} ${r.title}`)
  }
  console.log(`\n${rows.length} results; "ok" rows carry an accepted licence and are at least 1200px wide. Approve one with:\n  node scripts/propose_social_photos.mjs approve "<File:…>" --id <slug> --subject <grant:GA…|person:Name|bill:key|topic:slug> | --kind <bill:senate|politician|topic|grant> [--describe "…"]`)
} else if (command === 'approve') {
  const title = positional.join(' ')
  const id = String(flags.id ?? '')
  if (!title.startsWith('File:') || !/^[a-z0-9-]{3,60}$/.test(id)) throw new Error('approve needs a "File:…" title and --id <slug of a-z, 0-9, dashes>')
  if (!flags.subject && !flags.kind) throw new Error('approve needs --subject or --kind so the composer can find the photo')
  const data = await commons({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: 1600 })
  const r = Object.values(data.query?.pages ?? {}).map(meta).filter(Boolean)[0]
  if (!r) throw new Error('file not found on Commons')
  if (!ACCEPTED.test(r.licence)) throw new Error(`licence "${r.licence}" is not accepted (CC0, public domain, CC BY, CC BY-SA)`)
  if (r.width < 1200) throw new Error(`too small: ${r.width}px wide, need 1200`)
  const bytes = Buffer.from(await (await fetch(r.thumb ?? r.url, { headers: { 'user-agent': UA } })).arrayBuffer())
  mkdirSync(root + 'social/photos', { recursive: true })
  const out = await sharp(bytes).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer({ resolveWithObject: true })
  writeFileSync(root + `social/photos/${id}.jpg`, out.data)
  const catalogue = JSON.parse(readFileSync(catalogPath, 'utf8'))
  catalogue.photos[id] = { file: `/social/photos/${id}.jpg`, width: out.info.width, height: out.info.height, description: String(flags.describe ?? r.title.replace(/^File:/, '').replace(/\.\w+$/, '')),
    source_title: r.title, page: r.page, author: r.author, licence: r.licence, licence_url: r.licence_url, credit: `Photo: ${r.author}, ${r.licence}, via Wikimedia Commons` }
  const place = (map, key) => { map[key] = [...new Set([...(map[key] ?? []), id])] }
  if (flags.subject) place(catalogue.subjects, String(flags.subject))
  if (flags.kind) place(catalogue.kinds, String(flags.kind))
  writeFileSync(catalogPath, JSON.stringify(catalogue, null, 1) + '\n')
  console.log(`approved ${id}: ${out.info.width}x${out.info.height}, ${Math.round(out.data.length / 1024)} KB, ${r.licence} by ${r.author}\n${catalogue.photos[id].credit}`)
} else {
  console.log('usage: propose_social_photos.mjs search "<query>" | approve "<File:…>" --id <slug> (--subject <id> | --kind <kind>) [--describe "…"]')
  process.exit(command ? 1 : 0)
}
