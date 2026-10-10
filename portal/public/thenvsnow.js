/**
 * OPAX Then vs now — the position tracker: one speaker, one topic, two eras.
 *
 * Pick a speaker and a topic, set two spans of years, and the same question
 * ("What did X say about Y?") is asked of each era's record separately, with
 * retrieval filtered to the speaker, the topic label and the years. The two
 * answers render side by side with dated, cited sources. Plain browser ES
 * module, no dependencies.
 *
 *   import { mountThenVsNow } from '/thenvsnow.js'
 *   const tvn = mountThenVsNow(container)   // renders into container
 *   tvn.destroy()                           // removes DOM + aborts asks
 *
 * Options: { displayTitle } lets the host strip the speaker and date a corpus
 * title repeats; without it a source row shows the raw title.
 *
 * Data sources (same-origin):
 *   POST /api/ask       {question, kind, speaker, topic, from, to}
 *   GET  /speakers.json [name, speech_count] rows, exported with the sync's
 *                       own speaker normalization (mirror of app.js loader)
 *
 * Honesty rules: the two asks never see each other, so any cross-era
 * comparison is the reader's to make; a quiet era reads as a loading gap,
 * never as proof of silence (the corpus is still loading toward the
 * present); party identity is only ever the dot + text chip. Injection
 * safety: model text and all live data reach the DOM through textContent,
 * never innerHTML.
 */
import { machineLabelHTML } from './labels.js?v=c6bf994ef7'

const ASK_URL = '/api/ask'
const SPEAKERS_URL = '/speakers.json'
const STYLE_ID = 'tvn-styles'

const YEAR_MIN = 1993
const YEAR_MAX = 2026

// Mirror of app.js TOPICS (the enrichment taxonomy is canonical there):
// slug → display name, in taxonomy order.
const TOPICS = {
  'gambling': 'Gambling',
  'financial-services': 'Financial services',
  'mining-energy': 'Mining & energy',
  'climate-environment': 'Climate & environment',
  'property-construction': 'Property & construction',
  'housing': 'Housing',
  'health': 'Health',
  'media-communications': 'Media & communications',
  'hospitality-alcohol': 'Hospitality & alcohol',
  'defence-security': 'Defence & security',
  'agriculture': 'Agriculture',
  'unions-workplace': 'Unions & workplace',
  'immigration': 'Immigration',
  'indigenous-affairs': 'Indigenous affairs',
  'tax-budget': 'Tax & budget',
  'education': 'Education',
  'welfare-social': 'Welfare & social services',
  'integrity-democracy': 'Integrity & democracy',
  'infrastructure-transport': 'Infrastructure & transport',
  'justice-law': 'Justice & law',
  'foreign-affairs': 'Foreign affairs',
}

/** How a topic reads mid-question (mirror of app.js topicPhrase). */
function topicPhrase (slug) {
  if (slug === 'indigenous-affairs') return 'Indigenous affairs'
  return (TOPICS[slug] || slug).toLowerCase().replace(/ & /g, ' and ')
}

// Mirror of labels.js PARTY_MAP + PARTY_NAMES: party label → [dot class,
// the short name a label shows, the full name it says]. Dots are always
// redundant with the name, never colour alone.
const PARTY_MAP = {
  'labor': ['alp', 'Labor', 'Australian Labor Party'], 'liberal': ['lib', 'Liberal', 'Liberal Party'],
  'nationals': ['nat', 'Nationals', 'The Nationals'], 'lnp': ['lnp', 'LNP', 'Liberal National Party'],
  'country liberal party': ['nat', 'CLP', 'Country Liberal Party'], 'greens': ['grn', 'Greens', 'Australian Greens'],
  'one nation': ['onp', 'One Nation', "Pauline Hanson's One Nation"], 'independent': ['ind', 'Independent', 'Independent'],
  'centre alliance': ['oth', 'Centre Alliance', 'Centre Alliance'],
  "katter's australian party": ['oth', 'KAP', "Katter's Australian Party"],
  'united australia party': ['oth', 'UAP', 'United Australia Party'],
  'australian democrats': ['oth', 'Democrats', 'Australian Democrats'],
  'family first': ['oth', 'Family First', 'Family First'], 'dlp': ['oth', 'DLP', 'Democratic Labour Party'],
  'jln': ['oth', 'JLN', 'Jacqui Lambie Network'],
}

// Mirror of app.js STATE_NAMES for the source meta line.
const STATE_NAMES = { federal: 'Federal', nsw: 'NSW', vic: 'VIC', sa: 'SA', qld: 'QLD', act: 'ACT' }

// Mirror of app.js fmtDate.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate (iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

// The three worked examples. Eras sit inside the loaded record (newest
// speeches are around 2015 while the load runs) so both panels have a
// fighting chance of answering.
const EXAMPLES = [
  { label: 'John Howard on immigration', speaker: 'John Howard', topic: 'immigration', eras: [[1996, 2003], [2004, 2007]] },
  { label: 'Julia Gillard on climate', speaker: 'Julia Gillard', topic: 'climate-environment', eras: [[1998, 2009], [2010, 2013]] },
  { label: 'Bob Katter on agriculture', speaker: 'Bob Katter', topic: 'agriculture', eras: [[1993, 2009], [2010, 2015]] },
]

// ---------------------------------------------------------------------------
function ensureSpeakersDatalist (rows) {
  if (document.getElementById('speakers-list')) return
  const dl = document.createElement('datalist')
  dl.id = 'speakers-list'
  for (const [name] of rows) {
    const o = document.createElement('option')
    o.value = name
    dl.appendChild(o)
  }
  document.body.appendChild(dl)
}

// Speaker resolution (mirror of app.js: speakers.json + resolveSpeaker)
// ---------------------------------------------------------------------------

const SPEAKER_NICKNAMES = { albo: 'Anthony Albanese', scomo: 'Scott Morrison' }

function speakerKey (s) {
  return String(s || '').replace(/’/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()
}

let speakersDirPromise = null
function loadSpeakersDir () {
  speakersDirPromise ??= fetch(SPEAKERS_URL)
    .then((r) => r.json())
    .then((rows) => {
      ensureSpeakersDatalist(rows)
      const exact = new Map(); const bySurname = new Map()
      for (const [name, count] of rows) {
        const key = speakerKey(name)
        exact.set(key, name)
        const sur = key.split(' ').pop()
        if (!bySurname.has(sur)) bySurname.set(sur, [])
        bySurname.get(sur).push([name, count])
      }
      for (const list of bySurname.values()) list.sort((a, b) => b[1] - a[1])
      return { exact, bySurname }
    })
    .catch(() => null)
  return speakersDirPromise
}

/** Casual name → canonical Hansard name, or null to leave the input as typed.
 * Full names casefix by exact match only; a lone surname resolves when one
 * person holds it, or when the biggest holder has 5x the speeches of the
 * next — never a guess between comparable namesakes. */
async function resolveSpeaker (input) {
  const key = speakerKey(input)
  if (!key) return null
  const dir = await loadSpeakersDir()
  if (!dir) return null
  const nick = SPEAKER_NICKNAMES[key]
  if (nick && dir.exact.has(speakerKey(nick))) return nick
  if (key.includes(' ')) return dir.exact.get(key) || null
  const holders = dir.bySurname.get(key) || []
  if (holders.length === 1) return holders[0][0]
  if (holders.length > 1 && holders[0][1] >= 5 * holders[1][1]) return holders[0][0]
  return null
}

// ---------------------------------------------------------------------------
// Styles — .tvn- prefix, site tokens (tokens.css), light-only
// ---------------------------------------------------------------------------

const CSS = `
.tvn-root {
  /* position: relative anchors any visually-hidden absolute spans so their
     static positions can never widen the host dialog's scroll area — the
     matrix's 390px lesson. */
  position: relative;
  font: var(--type-body);
  color: var(--ink);
}
.tvn-root :focus-visible { outline: var(--border-focus) solid var(--bronze-ink); outline-offset: 2px; }
/* The shared controls draw their own ring outside the shape. */
.tvn-root :is(.ui-button, .ui-chip, .ui-input):focus-visible { outline-offset: 3px; }

.tvn-intro {
  margin: 0 0 var(--space-block); font: var(--type-body);
  color: var(--ink-soft); max-width: 62ch;
}
.tvn-root a {
  color: inherit; text-decoration: underline;
  text-decoration-color: var(--bronze-rule); text-underline-offset: 2px;
}
.tvn-root a:hover { color: var(--bronze-ink); text-decoration-color: var(--bronze-ink); }

/* The form is the shared fields and buttons (ui-controls.css), compact. */
.tvn-form { display: grid; gap: var(--space-heading); margin: 0 0 var(--space-tight); }
.tvn-row { display: flex; flex-wrap: wrap; gap: var(--space-heading) var(--space-group); align-items: flex-end; }
.tvn-field { display: grid; gap: var(--space-tight); min-width: 0; }
.tvn-label { font: var(--type-label); color: var(--ink); }
/* Widths beat .ui-input's full width: a name, a topic and a year each have their own. */
.tvn-root .tvn-speaker { width: min(15rem, calc(100vw - 5rem)); }
.tvn-root .tvn-select { width: auto; max-width: 100%; }
.tvn-root .tvn-year { width: 6.5rem; }
.tvn-era { display: flex; align-items: center; gap: var(--space-tight); }
.tvn-era-dash { color: var(--ink-soft); }

.tvn-chips { display: flex; flex-wrap: wrap; gap: var(--space-tight); }

.tvn-note, .tvn-error { margin: 0; font: var(--type-fine); }
.tvn-machine { margin: 0 0 var(--space-heading); }
.tvn-note { color: var(--ink-soft); }
.tvn-error { color: var(--danger); }

.tvn-question {
  margin: var(--space-tight) 0 var(--space-block); font: var(--type-body);
  color: var(--ink-soft);
}
.tvn-question b { color: var(--ink); font-weight: 600; }

/* The two eras side by side, each opened by a rule: sections, not boxes. */
.tvn-columns { display: grid; gap: var(--space-group); align-items: start; }
@media (min-width: 760px) { .tvn-columns { grid-template-columns: 1fr 1fr; } }
.tvn-panel {
  padding-top: var(--space-heading); min-width: 0;
  border-top: var(--border-hairline) solid var(--divider-default);
}
.tvn-kicker {
  margin: 0 0 var(--space-line); font: var(--type-label);
  color: var(--ink-soft);
}
.tvn-era-h {
  margin: 0 0 var(--space-tight); font: var(--type-subheading);
  font-variant-numeric: tabular-nums;
}
/* The answer is machine-written, so it speaks in OPAX's sans. */
.tvn-body { font: var(--type-body); overflow-wrap: break-word; }
.tvn-body p, .tvn-body ul, .tvn-body ol { margin: 0 0 var(--space-tight); }
.tvn-body h3, .tvn-body h4 { margin: var(--space-heading) 0 var(--space-line); font: var(--type-strong); }
.tvn-body ul, .tvn-body ol { padding-left: 1.2rem; }
.tvn-body li { margin: 0 0 var(--space-line); }
.tvn-body blockquote {
  margin: var(--space-tight) 0; padding-left: var(--space-heading);
  border-left: 2px solid var(--bronze); color: var(--ink-soft);
}
.tvn-thin { color: var(--ink-soft); }
.tvn-wait { padding: var(--space-tight) 0; }

.tvn-srcs-kicker { margin: var(--space-block) 0 var(--space-tight); }
.tvn-srcs {
  margin: 0; padding: 0; list-style: none;
  display: grid; gap: var(--space-tight); font: var(--type-fine);
}
.tvn-src-date {
  font-variant-numeric: tabular-nums; font-weight: 600;
  white-space: nowrap; margin-right: var(--space-tight);
}
.tvn-src-meta { color: var(--ink-soft); white-space: nowrap; }
.tvn-src-meta .ui-party { vertical-align: baseline; }
/* Two classes deep, so the answer's own blockquote rule above does not win. */
.tvn-srcs .tvn-src-quote {
  margin: var(--space-line) 0 0; padding-left: var(--space-heading);
  border-left: var(--border-hairline) solid var(--divider-default); color: var(--ink-soft);
}

.tvn-fineprint {
  margin: var(--space-block) 0 0; font: var(--type-fine);
  color: var(--ink-soft); max-width: 72ch;
}

.tvn-visually-hidden {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
`

function injectStyles () {
  if (document.getElementById(STYLE_ID)) return
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

// ---------------------------------------------------------------------------
// DOM helpers (model text and live data go through textContent — never innerHTML)
// ---------------------------------------------------------------------------

function el (tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

/** The shared PartyLabel (ui-controls.css): a dot beside the party's short
 *  name, the full name in the title and the accessible name (mirror of labels.js). */
function partyChip (party) {
  const hit = PARTY_MAP[String(party).toLowerCase()]
  const chip = el('span', `ui-party party party-${hit ? hit[0] : 'oth'}`)
  const dot = el('i')
  dot.setAttribute('aria-hidden', 'true')
  chip.appendChild(dot)
  const [short, long] = hit ? [hit[1], hit[2]] : [String(party), String(party)]
  if (short === long) {
    chip.appendChild(document.createTextNode(short))
  } else {
    const shown = el('span', null, short)
    shown.setAttribute('aria-hidden', 'true')
    chip.title = long
    chip.append(shown, el('span', 'tvn-visually-hidden', long))
  }
  return chip
}

/** Inline treatment (mirror of app.js appendInline): **bold** only. */
function appendInline (node, text) {
  const parts = String(text).split(/\*\*(.+?)\*\*/)
  parts.forEach((part, j) => {
    if (!part) return
    if (j % 2 === 1) {
      const b = document.createElement('strong')
      b.textContent = part
      node.appendChild(b)
    } else {
      node.appendChild(document.createTextNode(part))
    }
  })
}

/**
 * Compact mirror of app.js renderAnswer: headings, lists, quotes and
 * paragraphs, built as DOM nodes. Tables and code fences degrade to
 * paragraphs; answers here are short filtered asks, not documents.
 */
function renderAnswer (containerEl, text) {
  const lines = String(text).replace(/\r/g, '').split('\n')
  let para = []; let list = null
  const flushPara = () => {
    if (!para.length) return
    const p = el('p')
    appendInline(p, para.join(' '))
    containerEl.appendChild(p)
    para = []
  }
  const flushList = () => {
    if (list) { containerEl.appendChild(list); list = null }
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushPara(); flushList(); continue }
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    const li = /^(?:[-*•]|\d{1,3}[.)])\s+(.*)$/.exec(line)
    if (h) {
      flushPara(); flushList()
      const hEl = el(h[1].length <= 3 ? 'h3' : 'h4')
      appendInline(hEl, h[2])
      containerEl.appendChild(hEl)
    } else if (li) {
      flushPara()
      if (!list) list = el(/^\d/.test(line) ? 'ol' : 'ul')
      const item = el('li')
      appendInline(item, li[1])
      list.appendChild(item)
    } else if (line.startsWith('>')) {
      flushPara(); flushList()
      const q = el('blockquote')
      appendInline(q, line.replace(/^>\s?/, ''))
      containerEl.appendChild(q)
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara(); flushList()
}

/** A dated source row: date first, then the doc link, party chip, snippet. */
function sourceRow (s, label) {
  const li = el('li')
  const line = el('div')
  line.appendChild(el('span', 'tvn-src-date', s.date ? fmtDate(s.date) : 'Undated'))
  const a = el('a', null, label || s.title || s.slug)
  a.href = `#/doc/${s.slug}`
  line.appendChild(a)
  const meta = el('span', 'tvn-src-meta')
  if (s.party) {
    meta.append(' · ')
    meta.appendChild(partyChip(s.party))
  }
  if (s.state) meta.append(` · ${STATE_NAMES[s.state] || s.state}`)
  line.appendChild(meta)
  li.appendChild(line)
  const snippet = (s.snippet || '').trim().replace(/\s+/g, ' ')
  if (snippet) {
    li.appendChild(el('blockquote', 'tvn-src-quote',
      `“${snippet.slice(0, 200)}${snippet.length > 200 ? '…' : ''}”`))
  }
  return li
}

// ---------------------------------------------------------------------------
// mountThenVsNow
// ---------------------------------------------------------------------------

export function mountThenVsNow (container, opts = {}) {
  injectStyles()

  // The host hands us the site's own title helper, so a source here reads the
  // same as it does in search; standalone the raw title stands.
  const srcTitle = opts.displayTitle || ((s) => s.title || s.slug || '')

  let compareAbort = null
  let waitTimer = 0
  let wombatModPromise = null
  const loadWombat = () => (wombatModPromise ??= import('/wombat.js?v=b2936fedf5').catch(() => null))

  // ---- static chrome (no live data passes through this template) ----------
  const root = el('section', 'tvn-root')
  root.setAttribute('aria-label', 'Then vs now: one speaker and topic asked of two eras')
  root.innerHTML = `
    <p class="tvn-intro">Pick a speaker and a topic, set two spans of years, and
      the same question is put to each era's record separately. Retrieval is
      filtered to the speaker, the topic label and the years, so each answer
      can only draw on speeches from its own era.</p>
    <form class="tvn-form" data-ui-size="compact">
      <div class="tvn-row">
        <label class="tvn-field">
          <span class="tvn-label">Speaker</span>
          <input class="ui-input tvn-speaker" name="speaker" type="text"
                 placeholder="e.g. John Howard" autocomplete="off" list="speakers-list">
        </label>
        <label class="tvn-field">
          <span class="tvn-label">Topic</span>
          <select class="ui-input tvn-select" name="topic">
            <option value="">Choose a topic</option>
          </select>
        </label>
      </div>
      <div class="tvn-row">
        <div class="tvn-field">
          <span class="tvn-label" id="tvn-then-label">Then</span>
          <span class="tvn-era" role="group" aria-labelledby="tvn-then-label">
            <input class="ui-input tvn-year" name="thenFrom" type="number" inputmode="numeric"
                   min="${YEAR_MIN}" max="${YEAR_MAX}" value="1993" aria-label="Then, from year">
            <span class="tvn-era-dash" aria-hidden="true">to</span>
            <input class="ui-input tvn-year" name="thenTo" type="number" inputmode="numeric"
                   min="${YEAR_MIN}" max="${YEAR_MAX}" value="2009" aria-label="Then, to year">
          </span>
        </div>
        <div class="tvn-field">
          <span class="tvn-label" id="tvn-now-label">Now</span>
          <span class="tvn-era" role="group" aria-labelledby="tvn-now-label">
            <input class="ui-input tvn-year" name="nowFrom" type="number" inputmode="numeric"
                   min="${YEAR_MIN}" max="${YEAR_MAX}" value="2010" aria-label="Now, from year">
            <span class="tvn-era-dash" aria-hidden="true">to</span>
            <input class="ui-input tvn-year" name="nowTo" type="number" inputmode="numeric"
                   min="${YEAR_MIN}" max="${YEAR_MAX}" value="2026" aria-label="Now, to year">
          </span>
        </div>
        <button class="ui-button tvn-compare" data-variant="primary" type="submit">Compare</button>
      </div>
      <p class="tvn-note">The record is still loading toward the present, so the
        most recent years are thin for now. Try these:</p>
      <div class="tvn-chips"></div>
      <p class="tvn-error" role="alert" hidden></p>
      <p class="tvn-note tvn-resolve-note" hidden></p>
    </form>
    <p class="tvn-question" hidden></p>
    <div class="tvn-machine" hidden>${machineLabelHTML({ note: 'Each era\'s answer is written by a language model from the speeches retrieved for that era, and the two never see each other. They are not the record: check them against the quoted speeches.' })}</div>
    <div class="tvn-columns" hidden></div>
    <p class="tvn-fineprint" hidden>OPAX shows what was said in each era; it
      does not judge consistency. The two answers are generated separately and
      never see each other, so weighing them against each other is the
      reader's job. The corpus is still loading toward the present and a
      machine labelling pass is still running, so a quiet era can be a gap in
      what is loaded so far rather than silence.</p>
  `

  const form = root.querySelector('.tvn-form')
  const speakerInput = form.elements.speaker
  const topicSel = form.elements.topic
  const yearInputs = ['thenFrom', 'thenTo', 'nowFrom', 'nowTo'].map((n) => form.elements[n])
  const compareBtn = root.querySelector('.tvn-compare')
  const chipsEl = root.querySelector('.tvn-chips')
  const errEl = root.querySelector('.tvn-error')
  const resolveNoteEl = root.querySelector('.tvn-resolve-note')
  const questionEl = root.querySelector('.tvn-question')
  const columnsEl = root.querySelector('.tvn-columns')
  const fineEl = root.querySelector('.tvn-fineprint')
  const machineEl = root.querySelector('.tvn-machine')

  for (const [slug, name] of Object.entries(TOPICS)) {
    const opt = document.createElement('option')
    opt.value = slug
    opt.textContent = name
    topicSel.append(opt)
  }

  for (const ex of EXAMPLES) {
    const chip = el('button', 'ui-chip', ex.label)
    chip.type = 'button'
    chip.addEventListener('click', () => {
      speakerInput.value = ex.speaker
      topicSel.value = ex.topic
      ex.eras.flat().forEach((y, i) => { yearInputs[i].value = String(y) })
      runCompare()
    })
    chipsEl.appendChild(chip)
  }

  // The two era panels, built once and refilled per compare.
  const panels = [{ kicker: 'Then' }, { kicker: 'Now' }].map((p) => {
    const sec = el('section', 'tvn-panel')
    const kickerEl = el('p', 'tvn-kicker', p.kicker)
    const headEl = el('h3', 'tvn-era-h', '')
    const bodyEl = el('div', 'tvn-body')
    sec.append(kickerEl, headEl, bodyEl)
    columnsEl.appendChild(sec)
    return { ...p, sec, headEl, bodyEl }
  })

  /** Clamp, order and write back the four year inputs; returns [[a,b],[a,b]]. */
  function readEras () {
    const vals = yearInputs.map((input, i) => {
      const fallback = [1993, 2009, 2010, 2026][i]
      const n = Number.parseInt(input.value, 10)
      return Math.min(YEAR_MAX, Math.max(YEAR_MIN, Number.isFinite(n) ? n : fallback))
    })
    const eras = [[vals[0], vals[1]], [vals[2], vals[3]]]
    for (const era of eras) if (era[0] > era[1]) era.reverse()
    eras.flat().forEach((y, i) => { yearInputs[i].value = String(y) })
    return eras
  }

  function setWaiting (panel, label) {
    panel.bodyEl.replaceChildren()
    const slot = el('div', 'tvn-wait')
    slot.setAttribute('role', 'status')
    slot.textContent = label
    panel.bodyEl.appendChild(slot)
    return slot
  }

  /**
   * One era's ask (mirror of app.js askRecord). Streams when it can: `on.delta`
   * fires with each fragment of answer text and `on.retry` when the Worker
   * withdraws attempt one; the result is the final {answer, citations,
   * sources}. If the stream fails before any text has shown, the synchronous
   * call answers instead, with runAsk's one silent retry on a blank answer.
   */
  async function askEra (question, speaker, topic, era, signal, on) {
    const body = JSON.stringify({
      question, kind: 'speech', speaker, topic,
      from: String(era[0]), to: String(era[1]),
    })
    try {
      return await readAskStream(body, signal, on)
    } catch (err) {
      if (err.name === 'AbortError' || err.shown) throw err
    }
    const once = async () => {
      const res = await fetch(ASK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
      return data
    }
    let data = await once()
    if (!(data.answer || '').trim()) data = await once()
    return data
  }

  /** Read one streamed ask (mirror of app.js readAskStream): SSE events
   * status / delta / retry / done / error; resolves with the done payload.
   * An error carries `shown: true` once answer text has reached the handlers. */
  async function readAskStream (body, signal, on) {
    const res = await fetch(`${ASK_URL}?stream=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body,
      signal,
    })
    if (!(res.headers.get('content-type') || '').includes('text/event-stream')) {
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
      return data
    }
    let shown = false
    let final = null
    const fail = (message) => Object.assign(new Error(message), { shown })
    const dispatch = (block) => {
      let event = 'message'
      const data = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      if (!data.length) return
      let payload
      try { payload = JSON.parse(data.join('\n')) } catch { return }
      if (event === 'delta') {
        if (typeof payload.text === 'string' && payload.text) {
          shown = true
          on.delta?.(payload.text)
        }
      } else if (event === 'retry') {
        shown = false
        on.retry?.(payload)
      } else if (event === 'done') {
        final = payload
      } else if (event === 'error') {
        throw fail(payload.error || 'The answer stream failed.')
      }
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let at
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, at)
          buffer = buffer.slice(at + 2)
          if (block.trim()) dispatch(block)
        }
      }
      buffer += decoder.decode()
      if (buffer.trim()) dispatch(buffer)
    } catch (err) {
      if (err.name !== 'AbortError' && err.shown === undefined) err.shown = shown
      throw err
    }
    if (!final) throw fail('The answer stream ended early.')
    return final
  }

  /** Progressive rendering (mirror of app.js streamRenderer): the whole text
   * re-parses every ~120ms; blocks new since the last paint get .stream-in;
   * an unclosed ** shows plain and a marker-only last line is held back. */
  function streamRenderer (containerEl, alive) {
    let text = ''
    let timer = 0
    let painted = 0
    let blocks = 0
    const safe = (t) => {
      if ((t.match(/\*\*/g) || []).length % 2) {
        const at = t.lastIndexOf('**')
        t = t.slice(0, at) + t.slice(at + 2)
      }
      return t.replace(/\n[ \t]*[#*\-+>|]{1,3}[ \t]*$/, '')
    }
    const paint = () => {
      timer = 0
      if (!alive()) return
      containerEl.replaceChildren()
      renderAnswer(containerEl, safe(text))
      const kids = containerEl.children
      for (let i = blocks; i < kids.length; i++) kids[i].classList.add('stream-in')
      blocks = kids.length
      painted = Date.now()
    }
    const stop = () => { if (timer) { clearTimeout(timer); timer = 0 } }
    return {
      push (fragment) {
        text += fragment
        if (!timer) timer = setTimeout(paint, Math.max(0, 120 - (Date.now() - painted)))
      },
      reset () { stop(); text = ''; blocks = 0; containerEl.replaceChildren() },
      stop,
    }
  }

  // The platform's canned refusals; with zero sources they mean the era's
  // filtered slice is thin, and the panel should say so in corpus terms.
  const REFUSAL_RE = /not enough data|no relevant (?:speeches|data|records)|could(?: not|n't) find|unable to answer/i

  function renderResult (panel, data, ctx) {
    const answerText = (data.answer || '').trim()
    const sources = data.sources || []
    // The Worker flags cited sources; fall back to the raw citations map
    // (mirror of app.js runAsk). Never fake the split.
    const fallbackIds = new Set(
      Object.keys(data.citations || {}).map((k) => k.split('/')[0]))
    const isCited = (s) => s.cited ?? fallbackIds.has(s.resource)
    const cited = sources.filter(isCited)
    const shown = (cited.length ? cited : sources).slice(0, 3)

    panel.bodyEl.replaceChildren()
    if (!sources.length && (!answerText || REFUSAL_RE.test(answerText))) {
      panel.bodyEl.appendChild(el('p', 'tvn-thin',
        `The loaded record has little from ${ctx.speaker} on ${ctx.phrase} in these years. ` +
        'The corpus is still loading toward the present, so a quiet era can be a loading gap, not silence.'))
      return
    }
    if (answerText) {
      renderAnswer(panel.bodyEl, answerText)
    } else {
      panel.bodyEl.appendChild(el('p', 'tvn-thin',
        'The record was searched and the speeches below came back, but no written answer arrived this time.'))
    }
    if (shown.length) {
      panel.bodyEl.appendChild(el('p', 'tvn-kicker tvn-srcs-kicker', 'From the record'))
      const ol = el('ol', 'tvn-srcs')
      for (const s of shown) ol.appendChild(sourceRow(s, srcTitle(s)))
      panel.bodyEl.appendChild(ol)
    }
  }

  async function runCompare () {
    compareAbort?.abort()
    clearInterval(waitTimer)
    const aborter = new AbortController()
    compareAbort = aborter

    errEl.hidden = true
    resolveNoteEl.hidden = true
    const rawSpeaker = speakerInput.value.trim()
    const topic = topicSel.value
    if (!rawSpeaker || !topic) {
      errEl.textContent = !rawSpeaker
        ? 'Name a speaker to compare.' : 'Choose a topic to compare.'
      errEl.hidden = false
      return
    }
    const eras = readEras()

    compareBtn.disabled = true
    compareBtn.textContent = 'Comparing…'
    try {
      // Canonicalize the speaker before the filter leaves the UI, and write
      // the resolved name back so the reader sees what was actually asked.
      let speaker = rawSpeaker
      const canon = await resolveSpeaker(rawSpeaker)
      if (compareAbort !== aborter) return
      if (canon) {
        speaker = canon
        speakerInput.value = canon
      } else if (!rawSpeaker.includes(' ')) {
        // A lone surname must resolve to be usable as a filter (runAsk rule).
        errEl.textContent = `No one speaker called “${rawSpeaker}” stands out in the record. Try a full name.`
        errEl.hidden = false
        return
      } else {
        resolveNoteEl.textContent = `“${rawSpeaker}” is not in the indexed speaker list; the filter will match the name as typed.`
        resolveNoteEl.hidden = false
      }

      const phrase = topicPhrase(topic)
      const question = `What did ${speaker} say about ${phrase}?`
      questionEl.replaceChildren('Asking each era separately: ')
      const q = el('b', null, `“${question}”`)
      questionEl.appendChild(q)
      questionEl.hidden = false
      columnsEl.hidden = false
      machineEl.hidden = false
      fineEl.hidden = false

      panels.forEach((panel, i) => {
        const era = eras[i]
        panel.headEl.textContent = `${era[0]} to ${era[1]}`
        panel.sec.setAttribute('aria-label', `${panel.kicker}: ${era[0]} to ${era[1]}`)
        panel.bodyEl.replaceChildren(el('p', 'tvn-thin',
          i === 0 ? 'Starting…' : 'Waits for the first era to finish.'))
      })

      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i]
        const era = eras[i]
        const eraLabel = `${era[0]} to ${era[1]}`
        const waitLabel = `Reading the ${eraLabel} record. This can take up to a minute.`
        const slot = setWaiting(panel, waitLabel)
        let wombat = null
        loadWombat().then((mod) => {
          if (!mod || compareAbort !== aborter || !slot.isConnected) return
          slot.textContent = ''
          wombat = mod.mountWombat(slot, { label: waitLabel })
        })
        const started = Date.now()
        clearInterval(waitTimer)
        waitTimer = setInterval(() => {
          const s = Math.round((Date.now() - started) / 1000)
          if (s < 10) return
          const late = `Still reading ${eraLabel} (${s}s). Era asks can take a minute.`
          if (wombat) wombat.setLabel(late)
          else slot.textContent = late
        }, 5000)
        // The era's answer streams into the panel as it is written; the
        // wait slot leaves on the first words and comes back on a retry.
        const live = streamRenderer(panel.bodyEl, () => compareAbort === aborter)
        let streamed = false
        try {
          const data = await askEra(question, speaker, topic, era, aborter.signal, {
            delta (text) {
              if (compareAbort !== aborter) return
              if (!streamed) {
                streamed = true
                clearInterval(waitTimer)
                wombat = null
                panel.bodyEl.replaceChildren()
              }
              live.push(text)
            },
            retry () {
              if (compareAbort !== aborter) return
              streamed = false
              live.reset()
              const again = setWaiting(panel, `Reading the ${eraLabel} record again.`)
              loadWombat().then((mod) => {
                if (!mod || compareAbort !== aborter || !again.isConnected) return
                again.textContent = ''
                wombat = mod.mountWombat(again, { label: `Reading the ${eraLabel} record again.` })
              })
            },
          })
          live.stop()
          if (compareAbort !== aborter) return
          clearInterval(waitTimer)
          renderResult(panel, data, { speaker, phrase })
        } catch (err) {
          live.stop()
          if (compareAbort !== aborter) return // superseded: the new run owns the DOM
          clearInterval(waitTimer)
          if (err.name === 'AbortError') {
            panel.bodyEl.replaceChildren(el('p', 'tvn-thin', 'Cancelled.'))
            return
          }
          panel.bodyEl.replaceChildren(el('p', 'tvn-thin',
            'This era could not be asked just now. The record is still there.'))
          const retry = el('button', 'ui-button', 'Try again')
          retry.type = 'button'
          retry.dataset.uiSize = 'compact'
          retry.addEventListener('click', runCompare)
          panel.bodyEl.appendChild(retry)
          return // an upstream failure would likely repeat; do not queue era two
        }
      }
    } finally {
      if (compareAbort === aborter) {
        clearInterval(waitTimer)
        compareBtn.disabled = false
        compareBtn.textContent = 'Compare'
      }
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    runCompare()
  })

  // Source links leave for doc pages; the destination should be visible, so
  // a link click closes the host dialog (the wordsdollars pattern).
  root.addEventListener('click', (e) => {
    if (!e.target.closest('a')) return
    const host = root.closest('dialog')
    if (host && host.open) host.close()
  })

  container.appendChild(root)

  // Closing the dialog aborts any in-flight asks; the module itself stays
  // mounted (the page keeps games alive per session).
  const host = root.closest('dialog')
  const onHostClose = () => compareAbort?.abort()
  if (host) host.addEventListener('close', onHostClose)

  let destroyed = false
  return {
    destroy () {
      if (destroyed) return
      destroyed = true
      compareAbort?.abort()
      clearInterval(waitTimer)
      if (host) host.removeEventListener('close', onHostClose)
      root.remove()
    },
  }
}
