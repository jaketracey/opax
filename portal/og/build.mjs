#!/usr/bin/env node
// Open Graph cards, build side. Three jobs, all from portal/:
//
//   node og/build.mjs portraits            # public/photos/jpg/<id>.jpg from every .webp
//   node og/build.mjs default              # public/og-default.png, the home card
//   node og/build.mjs preview [outdir]     # a sample of every card kind, for the eye
//
// The Worker draws the same cards live (src/og-render.ts) from the same tree
// (src/og.ts). This script exists because satori cannot read WebP, so the
// portraits need a JPEG twin, and because the home page is an asset hit that
// never reaches the Worker, so its card is a file. Needs Node >= 23.6 (imports
// src/og.ts directly via type stripping).

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import satori, { init as initSatori } from 'satori/wasm'
import initYoga from 'yoga-wasm-web'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { OG_FONT_FILES, OG_HEIGHT, OG_WIDTH, cardTree, homeCard } from '../src/og.ts'

const PORTAL = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(PORTAL, 'public')
const PHOTOS = join(PUBLIC, 'photos')
const JPG = join(PHOTOS, 'jpg')

async function engines() {
  const yoga = await initYoga(readFileSync(join(PORTAL, 'node_modules/yoga-wasm-web/dist/yoga.wasm')))
  initSatori(yoga)
  await initWasm(readFileSync(join(PORTAL, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')))
  const fonts = OG_FONT_FILES.map((f) => ({ name: f.name, weight: f.weight, style: f.style, data: readFileSync(join(PUBLIC, 'fonts/og', f.file)) }))
  return async function render(card) {
    const svg = await satori(cardTree(card), { width: OG_WIDTH, height: OG_HEIGHT, fonts })
    const r = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } })
    const png = r.render().asPng()
    r.free()
    return png
  }
}

const portraitUri = (id) => {
  const p = join(JPG, `${id}.jpg`)
  return existsSync(p) ? `data:image/jpeg;base64,${readFileSync(p).toString('base64')}` : null
}

async function portraits() {
  const sharp = (await import('sharp')).default
  mkdirSync(JPG, { recursive: true })
  let made = 0, kept = 0
  for (const f of readdirSync(PHOTOS)) {
    if (!f.endsWith('.webp')) continue
    const src = join(PHOTOS, f)
    const out = join(JPG, f.replace(/\.webp$/, '.jpg'))
    if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) { kept += 1; continue }
    await sharp(src).jpeg({ quality: 86, mozjpeg: true }).toFile(out)
    made += 1
  }
  console.log(`portraits: ${made} written, ${kept} up to date -> ${JPG}`)
}

async function defaultCard() {
  const render = await engines()
  const png = await render(homeCard())
  writeFileSync(join(PUBLIC, 'og-default.png'), png)
  console.log(`og-default.png: ${png.length} bytes`)
}

async function preview(outdir) {
  const render = await engines()
  mkdirSync(outdir, { recursive: true })
  const samples = {
    home: homeCard(),
    person: {
      kicker: 'Parliamentarian', title: 'Anthony Albanese', dot: '#D93025',
      lines: ['Labor · House of Representatives', '5,408 speeches on the record, 1998 to 2026'],
      portrait: portraitUri('10007'),
    },
    'person-long': {
      kicker: 'Parliamentarian', title: 'Sussan Penelope Ley', dot: '#1D4F91',
      lines: ['Liberal · House of Representatives', '2,981 speeches on the record, 2001 to 2026'],
      portrait: portraitUri('10387'),
    },
    'person-commons': {
      kicker: 'Parliamentarian', title: 'Sheena Watt', dot: '#D93025',
      lines: ['Labor · Victorian Legislative Council', '412 speeches on the record, 2020 to 2026'],
      portrait: portraitUri('wd-Q100327610'),
      credit: 'Photo: Gabagool2005, CC0, via Wikimedia Commons',
    },
    'person-nophoto': {
      kicker: 'Parliamentarian', title: 'Christopher Pyne', dot: '#1D4F91',
      lines: ['Liberal · House of Representatives', '3,201 speeches on the record, 1993 to 2019'],
    },
    party: {
      kicker: 'Political party', title: 'Labor', dot: '#D93025',
      lines: ['312 parliamentarians · 180,442 speeches on the record', '$1.12B in disclosed receipts, 1998 to 2025 (AEC)'],
    },
    donor: {
      kicker: 'Donor · Mining & energy', title: 'Hancock Prospecting Pty Ltd',
      lines: ['$4.3M across 61 receipts, 2010 to 2025 (AEC)', 'Which parties it funded, year by year.'],
    },
    campaigner: {
      kicker: 'Associated entity', title: 'Transport Workers Union of Australia NSW QLD Interim Governance Branch formerly Transport Workers Union of Australia New South Wales Branch',
      lines: ['Linked to Labor on the AEC register; 12 annual returns, 2012-13 to 2024-25', '$2.1M received in 2024-25'],
    },
    topic: {
      kicker: 'Topic', title: 'Gambling',
      lines: ['Parliament on gambling: every speech labelled gambling in the record, by party and by year.'],
    },
    report: {
      kicker: 'Report', title: 'Climate & Energy',
      lines: ['The climate debate on the record: targets, coal, renewables and carbon pricing.', 'A standing OPAX investigation, every claim cited.'],
    },
    doc: {
      kicker: 'From the record · 14 May 2024', title: 'Anthony Albanese', dot: '#D93025',
      lines: ['Labor · House of Representatives', 'Second reading, Housing Australia Future Fund Bill: 1,842 words.'],
      portrait: portraitUri('10007'),
    },
    division: {
      kicker: 'Division · Senate · 27 June 2024', italic: true,
      title: 'That the amendment moved by Senator Pocock be agreed to, on the Nature Positive (Environment Protection Australia) Bill 2024',
      lines: ['Defeated, 26 votes to 32. Who voted which way.'],
    },
    ask: {
      kicker: 'Ask', italic: true,
      title: '“What has Pauline Hanson said about gambling advertising since 2020?”',
      lines: ['An answer from the parliamentary record, cited to the speeches it draws on, with the money behind the speakers.'],
    },
    search: {
      kicker: 'Search the record', italic: true, title: '“negative gearing”',
      lines: ['Speeches matching this query, with speaker, party, date and a link to the official source for each.'],
    },
    page: {
      kicker: 'OPAX', title: 'Money map',
      lines: ['Disclosed political donations as territory you can spin: 250 donors, 11 parties and 28 years of AEC returns, with Queensland and Victorian registers.'],
    },
    index: {
      kicker: 'Directory', title: 'Parliamentarians',
      lines: ['Every parliamentarian in the OPAX record: 1,557 speakers since 1993, searchable by name, party and parliament.'],
    },
  }
  for (const [name, card] of Object.entries(samples)) {
    const t = performance.now()
    const png = await render(card)
    writeFileSync(join(outdir, `${name}.png`), png)
    console.log(`${name.padEnd(16)} ${String(png.length).padStart(7)} bytes  ${(performance.now() - t).toFixed(0)} ms`)
  }
}

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'portraits') await portraits()
else if (cmd === 'default') await defaultCard()
else if (cmd === 'preview') await preview(arg ?? join(PORTAL, '.og-preview'))
else {
  console.error('usage: node og/build.mjs portraits | default | preview [outdir]')
  process.exit(2)
}
