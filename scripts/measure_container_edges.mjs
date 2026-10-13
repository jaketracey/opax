#!/usr/bin/env node
// Container edges against the masthead grid:
//   node scripts/measure_container_edges.mjs <base> [--widths 1920,1440,820,390] [--only topic,bill] [--port 9599] [--strict]
// Opens each page type in a headless Chrome it starts itself (CDP over Node's
// WebSocket, no Puppeteer), and reports, per page and width:
//   header    the masthead .wrap's content box (logo left edge to the header's right edge);
//   container the page's panel (or, for Worker-rendered pages, its .wrap) content box;
//   content   the drawn extent of the page: text, rules, backgrounds, media;
//   capped    blocks left-aligned in the column but held narrower by a max-width;
//   title     the top of the page's visible h1, to compare where each page's title opens.
// A container that differs from the header by more than 4px, or a capped block,
// is flagged. Running text (an essay, a speech, a lede) is meant to keep its
// reading measure, so read the capped list rather than treating it as a failure;
// --strict fails only on container ≠ header. Read-only public GETs: no Ask,
// generation or auth route is touched. Chrome: CHROME=<path> or the macOS default.
// The jsdom guard for the same rule is portal/test/container-width.test.mjs.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PAGES = [
  ['topics A–Z', '/subject/topic'], ['topic', '/subject/topic/agriculture'],
  ['bills', '/bills'], ['bill', '/bill/au-federal-r7520'],
  ['person', '/subject/person/anthony-albanese'], ['party', '/subject/party/labor'],
  ['instruments', '/instruments'], ['instrument', '/instrument/C2004L09583'], ['doc', '/doc/speech-420109'],
  ['money', '/money'], ['receipts', '/money/receipts'], ['explain', '/money/explain?to=party%3ALabor'],
  ['reports', '/reports'], ['report', '/reports/climate'],
  ['sitting', '/sitting'], ['estimates', '/estimates/2026-10'], ['vic election', '/vic-election-2026'],
  ['electorate', '/subject/electorate/federal-representatives-nsw-bennelong'],
  ['search', '/search?q=housing'], ['ask', '/ask'], ['about', '/about'], ['methods', '/methods'], ['declared', '/declared'],
  ['community', '/community'], ['community guidelines', '/community?view=guidelines'],
]

const args = process.argv.slice(2)
const base = args.find((a) => /^https?:\/\//.test(a))
if (!base) { console.error('usage: node scripts/measure_container_edges.mjs <base URL> [--widths 1920,1440,820,390] [--port 9599] [--strict]'); process.exit(2) }
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback }
const widths = opt('--widths', '1920,1440,820,390').split(',').map(Number)
const port = Number(opt('--port', '9599'))
const strict = args.includes('--strict')
const only = opt('--only', '').split(',').filter(Boolean)
const settle = Number(process.env.SETTLE || 6000)

// Runs in the page. Kept as a string so it is sent to Chrome unchanged.
const MEASURE = `(() => {
  const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.position !== 'fixed'; };
  const skip = (el) => el.closest('[hidden], dialog:not([open]), .ui-sheet, [popover], details:not([open]) > :not(summary), #panel-chat, [aria-hidden=true], .ui-pop > :not(summary)');
  const box = (el) => { const b = el.getBoundingClientRect(), cs = getComputedStyle(el); return { l: Math.round(b.left + parseFloat(cs.paddingLeft)), r: Math.round(b.right - parseFloat(cs.paddingRight)) }; };
  const hw = document.querySelector('header .wrap');
  const H = hw ? box(hw) : null;
  const main = document.querySelector('#main') || document.querySelector('main');
  const panel = [...main.querySelectorAll('.panel')].find(vis);
  const root = panel || main;
  const C = panel ? box(panel) : box([...main.querySelectorAll('.wrap')].find(vis) || main);
  const clipR = (from, r) => { for (let a = from; a && a !== root; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible') return Math.min(r, a.getBoundingClientRect().right); return r; };
  let L = Infinity, R = -Infinity;
  const take = (from, b) => { if (b.width > 0 && b.height > 0) { L = Math.min(L, b.left); R = Math.max(R, b.right > C.r + 1 ? clipR(from, b.right) : b.right); } };
  const els = [...root.querySelectorAll('*')].filter((el) => vis(el) && !skip(el));
  const clear = /rgba\\(0, 0, 0, 0\\)|transparent/;
  for (const el of els) {
    const cs = getComputedStyle(el), b = el.getBoundingClientRect();
    const drawn = ['Top', 'Bottom', 'Left', 'Right'].some((s) => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none' && !clear.test(cs['border' + s + 'Color']))
      || !clear.test(cs.backgroundColor) || /^(img|svg|canvas|video|input|select|textarea|button|iframe)$/i.test(el.tagName);
    if (drawn && b.width < innerWidth - 40) take(el.parentElement, b); // full-bleed bands are not the column
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n, count = 0;
  while ((n = walker.nextNode()) && count++ < 8000) { const p = n.parentElement; if (!n.textContent.trim() || !p || !vis(p) || skip(p)) continue; const range = document.createRange(); range.selectNodeContents(n); for (const b of range.getClientRects()) take(p, b); }
  const colW = C.r - C.l, capped = [];
  for (const el of els) {
    const cs = getComputedStyle(el), b = el.getBoundingClientRect();
    if (el.closest('.ui-pop') || cs.display === 'inline' || /^(p|h[1-6]|span|a|label|small|b|strong|em|figcaption|dt|dd|svg|img|input|button|select|textarea|summary|code|time|abbr|i|blockquote)$/i.test(el.tagName)) continue;
    if (cs.maxWidth === 'none' || b.width >= colW - 4 || b.width < colW * 0.45 || el.children.length < 2) continue;
    if (el.parentElement && el.parentElement.getBoundingClientRect().width < colW - 4) continue; // the outermost cap only
    capped.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + String(el.className).trim().split(/\\s+/).slice(0, 2).join('.') + ' ' + Math.round(b.left) + '–' + Math.round(b.right) + ' (max ' + cs.maxWidth + ')');
  }
  const h1 = [...main.querySelectorAll('h1')].find((el) => vis(el) && !skip(el));
  return { H, C, X: Number.isFinite(L) ? { l: Math.round(L), r: Math.round(R) } : null, T: h1 ? Math.round(h1.getBoundingClientRect().top + scrollY) : null, capped: [...new Set(capped)].slice(0, 6) };
})()`

const chromePath = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const profile = mkdtempSync(join(tmpdir(), 'opax-edges-'))
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function measure(url, width) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let id = 0; const pending = new Map(); let loaded = false
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id) }
    if (d.method === 'Page.loadEventFired') loaded = true
  })
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  try {
    await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', { width, height: width <= 430 ? 844 : width <= 900 ? 1180 : 1000, deviceScaleFactor: 1, mobile: width <= 430 })
    await send('Page.navigate', { url })
    for (let t = 0; t < 250 && !loaded; t++) await sleep(100)
    await sleep(settle)
    return (await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true })).result.value
  } finally {
    ws.close()
    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {})
  }
}

let mismatches = 0
try {
  for (let t = 0; t < 50; t++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break } catch { await sleep(200) } }
  const edge = (o) => (o ? `${o.l}–${o.r}` : '—')
  console.log(['page', 'width', 'header', 'container', 'content', 'title', 'flag', 'capped'].join('\t'))
  for (const [name, path] of PAGES.filter(([name]) => !only.length || only.includes(name))) {
    for (const width of widths) {
      const m = await measure(new URL(path, base).href, width).catch((e) => ({ error: e.message }))
      if (!m || m.error) { console.log([name, width, 'error', m?.error || 'no result'].join('\t')); continue }
      const off = m.H && m.C ? Math.max(Math.abs(m.H.l - m.C.l), Math.abs(m.H.r - m.C.r)) : 0
      if (off > 4) mismatches++
      console.log([name, width, edge(m.H), edge(m.C), edge(m.X), m.T ?? '—', (off > 4 ? 'CONTAINER≠HEADER ' : '') + (m.capped.length ? 'capped' : ''), m.capped.join('; ')].join('\t'))
    }
  }
} finally {
  chrome.kill()
  await sleep(300)
  rmSync(profile, { recursive: true, force: true })
}
if (strict && mismatches) { console.error(`${mismatches} container(s) off the masthead grid`); process.exit(1) }
