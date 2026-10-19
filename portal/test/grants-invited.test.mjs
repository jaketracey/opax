// The Major and Local Community Infrastructure Program (GO7867) on Money → Grants:
// its note names the departmental list of projects invited to apply
// (program-notes.json `invitations`) and the Centre for Public Integrity's
// seat-type comparison (`research`). The view renders both from the real files;
// the invitation list loads only for a program that names one, waits with a
// status line, fails with Try again, and is empty only after a completed load.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const read = (path) => readFileSync(new URL(`../public${path}`, import.meta.url), 'utf8')
const mlci = JSON.parse(read('/research/mlci.json'))

const dom = new JSDOM('<!doctype html><html><head></head><body><main id="c"></main></body></html>', { url: 'https://opax.test/money/grants?jur=federal&program=GO7867', pretendToBeVisual: true })
const { window } = dom
window.matchMedia = (q) => ({ matches: false, media: q, addEventListener () {}, removeEventListener () {} })
window.HTMLElement.prototype.scrollIntoView = function () {}
for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'location', 'history'])
  if (!(key in globalThis) || ['window', 'document', 'location', 'history'].includes(key)) globalThis[key] = key === 'window' ? window : window[key]
globalThis.matchMedia = window.matchMedia
globalThis.CSS ??= { escape: (s) => String(s).replace(/[^\w-]/g, (c) => `\\${c}`) }

// The invitation list answers per test: a file, a failure, or never.
let invitations = () => new Response(read('/research/mlci.json'), { headers: { 'content-type': 'application/json' } })
const requested = []
globalThis.fetch = async (input) => {
  const path = new URL(String(input?.url ?? input), 'https://opax.test').pathname
  requested.push(path)
  if (path === '/research/mlci.json') return invitations()
  try { return new Response(read(path), { headers: { 'content-type': 'application/json' } }) } catch { return new Response('Missing', { status: 404 }) }
}
const { mountGrants } = await import('../public/grants.js')

const until = async (check, ms = 4000) => {
  const end = Date.now() + ms
  for (;;) { const got = check(); if (got) return got; if (Date.now() > end) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 10)) }
}
async function openGO7867 () {
  const container = document.getElementById('c')
  container.replaceChildren()
  const handle = mountGrants(container, { jurisdiction: 'federal', program: 'GO7867', showHeading: false })
  await handle.openProgram('GO7867', 'federal')
  await until(() => container.querySelector('.gr-detail .gr-detail-head'))
  return { container, handle }
}
const section = (root) => root.querySelector('.gr-invited')

test('Invited projects: the count heads the section, the lede says invited and not awarded, Show all reveals every row', async () => {
  invitations = () => new Response(read('/research/mlci.json'))
  const { container, handle } = await openGO7867()
  const box = await until(() => section(container)?.querySelector('table') && section(container))
  assert.equal(box.querySelector('.gr-kicker').textContent, 'Invited projects (227)')
  const lede = box.querySelector('.gr-invited-lede')
  assert.match(lede.textContent, /These 227 projects were invited to apply, not awarded/)
  assert.match(lede.textContent, /226 were active on 14 November 2025/)
  assert.match(lede.textContent, /\$559\.2m in invitation allocations; 1 withdrawn/)
  assert.equal(lede.querySelector('a').getAttribute('href'), mlci.sources.department)
  assert.match(lede.querySelector('a').textContent, /answer to a Senate Estimates request/)
  assert.doesNotMatch(box.textContent, /rort|pork|bias|scandal/i)
  assert.equal(box.querySelectorAll('tbody tr').length, 24)
  const more = box.querySelector('.gr-more-rows')
  assert.equal(more.textContent, 'Show all 227 invited projects')
  more.click()
  const rows = [...box.querySelectorAll('tbody tr')]
  assert.equal(rows.length, 227)
  assert.equal(box.querySelector('.gr-more-rows'), null)
  // Each row: title with LGA and state, status, value, and the page of the departmental list it cites.
  const first = mlci.projects.filter((p) => p.status !== 'Withdrawn').sort((a, b) => b.value - a.value)[0]
  const cells = rows[0].querySelectorAll('td')
  assert.match(cells[0].textContent, new RegExp(`^${first.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `))
  assert.equal(cells[1].textContent, first.status)
  assert.equal(cells[3].querySelector('a').getAttribute('href'), first.source_url)
  assert.equal(cells[3].querySelector('a').textContent, `p. ${first.page}`)
  assert.equal(rows.at(-1).querySelector('td:nth-child(2)').textContent, 'Withdrawn', 'withdrawn proposals list last')
  // It sits under "What the record says", before the electorates.
  const kickers = [...container.querySelectorAll('.gr-detail .gr-kicker')].map((k) => k.textContent)
  assert.ok(kickers.indexOf('What the record says') < kickers.indexOf('Invited projects (227)'))
  assert.ok(kickers.indexOf('Invited projects (227)') < kickers.findIndex((k) => k.startsWith('Electorates')))
  handle.destroy()
})

test('Invited projects: a status line while the list loads, an error with Try again, never "empty" before a completed load', async () => {
  invitations = () => new Promise(() => {})
  let opened = await openGO7867()
  let box = await until(() => section(opened.container))
  assert.equal(box.querySelector('.gr-status')?.textContent, 'Opening the invited projects…')
  assert.equal(box.querySelector('.gr-status').getAttribute('role'), 'status')
  assert.doesNotMatch(box.textContent, /No invited projects/)
  opened.handle.destroy()

  let calls = 0
  invitations = () => { calls++; return calls === 1 ? new Response('down', { status: 503 }) : new Response(read('/research/mlci.json')) }
  opened = await openGO7867()
  box = await until(() => section(opened.container)?.querySelector('[role="alert"]') && section(opened.container))
  assert.match(box.textContent, /The invited projects could not be loaded/)
  assert.doesNotMatch(box.textContent, /No invited projects/)
  box.querySelector('[role="alert"] .ui-button').click()
  await until(() => section(opened.container).querySelector('table'))
  assert.equal(calls, 2, 'Try again asks again: a failure is not remembered')
  assert.equal(section(opened.container).querySelector('.gr-kicker').textContent, 'Invited projects (227)')
  opened.handle.destroy()

  invitations = () => new Response(JSON.stringify({ ...mlci, projects: [] }))
  // Each mount reads its own copy of the list.
  const { container, handle } = await openGO7867()
  box = await until(() => section(container)?.querySelector('.gr-caption') && section(container))
  assert.equal(box.querySelector('.gr-kicker').textContent, 'Invited projects (0)')
  assert.equal(box.querySelector('.gr-caption').textContent, 'No invited projects are listed for this program.')
  handle.destroy()
})

test('only a program whose note names an invitation list fetches one', async () => {
  requested.length = 0
  invitations = () => new Response(read('/research/mlci.json'))
  const container = document.getElementById('c')
  container.replaceChildren()
  const handle = mountGrants(container, { jurisdiction: 'federal', program: 'GO3141', showHeading: false })
  await handle.openProgram('GO3141', 'federal')
  await until(() => container.querySelector('.gr-detail .gr-detail-head'))
  await new Promise((r) => setTimeout(r, 50))
  assert.equal(container.querySelector('.gr-invited'), null)
  assert.ok(!requested.includes('/research/mlci.json'))
  handle.destroy()
})

test('What the record says: the Centre for Public Integrity comparison as six pairs of bars, cited and attributed', async () => {
  invitations = () => new Response(read('/research/mlci.json'))
  const { container, handle } = await openGO7867()
  const note = await until(() => container.querySelector('.gr-research'))
  const cite = note.querySelector('.gr-audits a')
  assert.equal(cite.getAttribute('href'), mlci.sources.cpi)
  assert.equal(cite.textContent, 'Public money, political advantage?')
  assert.match(note.textContent, /Centre for Public Integrity's analysis of the departmental invitation list/)
  const rows = [...note.querySelectorAll('.gr-compare li')]
  assert.equal(rows.length, 6)
  rows.forEach((li, i) => {
    const r = mlci.cpi_comparison[i]
    assert.match(li.textContent, new RegExp(`^${r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    const money = (n) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
    assert.ok(li.textContent.includes(`Invited ${money(r.actual)}`) && li.textContent.includes(`proportional to seat numbers ${money(r.expected)}`), r.name)
    assert.equal(li.querySelectorAll('.gr-bar-cell').length, 2, `${r.name}: a bar for each figure`)
  })
  const widest = Math.max(...mlci.cpi_comparison.flatMap((r) => [r.actual, r.expected]))
  assert.equal(rows[2].querySelector('.gr-bar-cell').style.width, `${Math.round(mlci.cpi_comparison[2].actual / widest * 100)}%`)
  assert.match(note.querySelector('.gr-caption').textContent, /AEC's classification before the 2025 federal election/)
  assert.doesNotMatch(note.textContent, /rort|pork|bias|scandal/i)
  handle.destroy()
})
