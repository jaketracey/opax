/**
 * OPAX Time Machine — an Encarta-style year explorer for the Australian
 * parliamentary record (1998–2026).
 *
 * Plain browser ES module, no dependencies, no build step.
 *
 *   import { mountTimeMachine } from '/timemachine.js'
 *   const tm = mountTimeMachine(container)  // renders into container
 *   tm.destroy()                            // removes DOM + listeners
 *
 * Options: { displayTitle } lets the host strip the speaker and date a corpus
 * title repeats; without it a card shows the raw title.
 *
 * Data sources (all same-origin):
 *   GET /api/search?q=&from=&to=&top_k=   live headline probes for the year
 *   GET /api/brief?rids=                  machine summaries for those speeches
 *   GET /years/index.json, /years/{y}.json the year in brief (one grounded,
 *                                         cited ask per year, generated once by
 *                                         scripts/generate_years.py) and the
 *                                         voices tally (speakers and parties
 *                                         across the year's retrieved windows)
 *   GET /reports/index.json               the six tracked topic reports
 *   GET /reports/{slug}.json              stats.timeline + stats.donations
 *   GET /api/stats + /corpus.json         indexing progress (honesty strip)
 *   GET /photos/people.json               portraits
 *
 * Honesty rule: the search index is filling oldest-first. A silent year means
 * the machine hasn't reached it yet — never that parliament was quiet. The
 * report timelines come from the full historical dataset, so the numbers
 * panel works for every year even where live quotes don't. Machine-written
 * text (the year in brief, the per-speech summaries) is always labelled as
 * such and never presented as the record; every claim links to a speech.
 */

const YEAR_MIN = 1998
const YEAR_MAX = 2026
const START_YEAR = 2001 // a rich early year the index has definitely reached

// ---------------------------------------------------------------------------
// What was parliament arguing about? Curated probe queries per year.
// Identification, not accusation: these name the debates of the day the way
// an encyclopedia would, without taking a side in any of them.
// ---------------------------------------------------------------------------

const YEAR_TOPICS = {
  1998: [
    { q: 'waterfront dispute Patrick stevedores', label: 'The waterfront dispute' },
    { q: 'goods and services tax GST', label: 'A new tax called the GST' },
    { q: 'native title Wik amendment', label: 'Native title' },
    { q: 'Telstra sale privatisation', label: 'Selling Telstra' },
  ],
  1999: [
    { q: 'republic referendum head of state', label: 'The republic referendum' },
    { q: 'East Timor peacekeeping INTERFET', label: 'East Timor' },
    { q: 'goods and services tax legislation', label: 'Passing the GST' },
    { q: 'aged care nursing homes', label: 'Aged care' },
  ],
  2000: [
    { q: 'GST implementation new tax system', label: 'The GST arrives' },
    { q: 'Sydney Olympic Games', label: 'The Sydney Olympics' },
    { q: 'reconciliation bridge walk', label: 'Reconciliation' },
    { q: 'petrol prices fuel excise', label: 'Petrol prices' },
  ],
  2001: [
    { q: 'Tampa asylum seekers border protection', label: 'The Tampa affair' },
    { q: 'September 11 terrorist attacks', label: 'September 11' },
    { q: 'Ansett collapse airline', label: 'The Ansett collapse' },
    { q: 'poker machines gambling', label: 'Poker machines' },
  ],
  2002: [
    { q: 'Bali bombing terrorism', label: 'The Bali bombings' },
    { q: 'asylum seekers Pacific solution detention', label: 'Offshore processing' },
    { q: 'drought exceptional circumstances farmers', label: 'The drought' },
    { q: 'stem cell research embryos', label: 'Stem-cell research' },
  ],
  2003: [
    { q: 'Iraq war weapons of mass destruction', label: 'The Iraq war' },
    { q: 'Medicare bulk billing', label: 'Medicare' },
    { q: 'Canberra bushfires', label: 'The Canberra bushfires' },
    { q: 'higher education university fees HECS', label: 'University fees' },
  ],
  2004: [
    { q: 'free trade agreement United States', label: 'The US free trade deal' },
    { q: 'Medicare safety net', label: 'The Medicare safety net' },
    { q: 'Tasmanian forests old growth logging', label: 'Tasmania’s forests' },
    { q: 'family payments baby bonus', label: 'The baby bonus' },
  ],
  2005: [
    { q: 'WorkChoices industrial relations reform', label: 'WorkChoices' },
    { q: 'Telstra full sale privatisation', label: 'Selling the rest of Telstra' },
    { q: 'anti-terrorism laws control orders', label: 'Anti-terror laws' },
    { q: 'voluntary student unionism', label: 'Student unionism' },
  ],
  2006: [
    { q: 'AWB wheat Iraq kickbacks inquiry', label: 'The AWB wheat scandal' },
    { q: 'nuclear power energy debate', label: 'The nuclear question' },
    { q: 'media ownership cross-media laws', label: 'Media ownership' },
    { q: 'petrol prices fuel', label: 'Petrol prices' },
  ],
  2007: [
    { q: 'climate change Kyoto protocol', label: 'Climate change' },
    { q: 'WorkChoices industrial relations', label: 'WorkChoices' },
    { q: 'broadband network internet', label: 'Broadband' },
    { q: 'Murray-Darling water drought', label: 'Water and the Murray-Darling' },
  ],
  2008: [
    { q: 'apology Stolen Generations', label: 'The Apology' },
    { q: 'global financial crisis banks', label: 'The global financial crisis' },
    { q: 'FuelWatch grocery prices cost of living', label: 'Grocery and fuel bills' },
    { q: 'alcopops tax binge drinking', label: 'The alcopops tax' },
  ],
  2009: [
    { q: 'economic stimulus package payments', label: 'The stimulus' },
    { q: 'carbon pollution reduction scheme emissions trading', label: 'Emissions trading' },
    { q: 'Black Saturday Victorian bushfires', label: 'Black Saturday' },
    { q: 'home insulation program', label: 'The insulation program' },
  ],
  2010: [
    { q: 'mining super profits tax', label: 'The mining tax' },
    { q: 'national broadband network NBN', label: 'The NBN' },
    { q: 'asylum seekers boat arrivals', label: 'Boat arrivals' },
    { q: 'hospitals health reform', label: 'Hospital reform' },
  ],
  2011: [
    { q: 'carbon price clean energy future', label: 'The carbon price' },
    { q: 'live cattle exports Indonesia', label: 'Live cattle exports' },
    { q: 'Queensland floods levy', label: 'The Queensland floods' },
    { q: 'poker machine reform pre-commitment', label: 'Pokie reform' },
  ],
  2012: [
    { q: 'carbon tax begins compensation', label: 'The carbon tax begins' },
    { q: 'national disability insurance scheme', label: 'The NDIS' },
    { q: 'asylum seekers Nauru Manus offshore', label: 'Offshore processing' },
    { q: 'misogyny sexism speech', label: 'The misogyny speech' },
  ],
  2013: [
    { q: 'carbon tax repeal', label: 'Repealing the carbon tax' },
    { q: 'Operation Sovereign Borders boats', label: 'Sovereign Borders' },
    { q: 'national broadband network rollout', label: 'The NBN' },
    { q: 'DisabilityCare NDIS launch', label: 'DisabilityCare' },
  ],
  2014: [
    { q: 'budget deficit levy spending cuts', label: 'The budget fight' },
    { q: 'Medicare co-payment GP', label: 'The GP co-payment' },
    { q: 'metadata data retention surveillance', label: 'Data retention' },
    { q: 'university fee deregulation', label: 'Uni fee deregulation' },
  ],
  2015: [
    { q: 'citizenship terrorism foreign fighters', label: 'Citizenship laws' },
    { q: 'same-sex marriage plebiscite', label: 'Same-sex marriage' },
    { q: 'China free trade agreement', label: 'The China trade deal' },
    { q: 'Syrian refugees intake', label: 'Syrian refugees' },
  ],
  2016: [
    { q: 'negative gearing housing affordability', label: 'Negative gearing' },
    { q: 'backpacker tax working holiday', label: 'The backpacker tax' },
    { q: 'census failure outage', label: 'The census outage' },
    { q: 'marriage plebiscite', label: 'The marriage plebiscite' },
  ],
  2017: [
    { q: 'same-sex marriage postal survey', label: 'The postal survey' },
    { q: 'dual citizenship section 44', label: 'The citizenship crisis' },
    { q: 'energy prices national energy guarantee', label: 'Energy prices' },
    { q: 'banking royal commission calls', label: 'Bank scrutiny' },
  ],
  2018: [
    { q: 'banking royal commission misconduct', label: 'The banking royal commission' },
    { q: 'national energy guarantee emissions', label: 'The energy wars' },
    { q: 'company tax cuts', label: 'Company tax cuts' },
    { q: 'live sheep exports', label: 'Live sheep exports' },
  ],
  2019: [
    { q: 'climate change bushfires emergency', label: 'Climate and bushfires' },
    { q: 'franking credits refunds retirees', label: 'Franking credits' },
    { q: 'drought relief water', label: 'Drought relief' },
    { q: 'religious discrimination freedom', label: 'Religious freedom' },
  ],
  2020: [
    { q: 'COVID-19 coronavirus pandemic response', label: 'COVID-19' },
    { q: 'JobKeeper wage subsidy', label: 'JobKeeper' },
    { q: 'Black Summer bushfires royal commission', label: 'The Black Summer' },
    { q: 'China trade barley wine tariffs', label: 'China trade tensions' },
  ],
  2021: [
    { q: 'vaccine rollout COVID', label: 'The vaccine rollout' },
    { q: 'AUKUS submarines defence', label: 'AUKUS' },
    { q: 'women safety parliament respect', label: 'Women’s safety' },
    { q: 'net zero 2050 emissions target', label: 'Net zero' },
  ],
  2022: [
    { q: 'cost of living inflation', label: 'The cost of living' },
    { q: 'national anti-corruption commission integrity', label: 'An integrity commission' },
    { q: 'climate change bill emissions target', label: 'The climate bill' },
    { q: 'floods emergency response', label: 'The floods' },
  ],
  2023: [
    { q: 'Voice to Parliament referendum', label: 'The Voice referendum' },
    { q: 'housing Australia future fund', label: 'The housing fund' },
    { q: 'cost of living interest rates', label: 'Cost of living' },
    { q: 'safeguard mechanism emissions', label: 'The safeguard mechanism' },
  ],
  2024: [
    { q: 'stage 3 tax cuts', label: 'The stage 3 tax cuts' },
    { q: 'immigration detention High Court release', label: 'The detention ruling' },
    { q: 'supermarket prices competition', label: 'Supermarket prices' },
    { q: 'gambling advertising ban', label: 'Gambling ads' },
  ],
  2025: [
    { q: 'housing crisis affordability', label: 'The housing crisis' },
    { q: 'cost of living relief', label: 'Cost of living' },
    { q: 'social media age ban children', label: 'The under-16 social media ban' },
    { q: 'energy transition nuclear renewables', label: 'The energy transition' },
  ],
  2026: [
    { q: 'housing affordability supply', label: 'Housing' },
    { q: 'artificial intelligence regulation', label: 'Artificial intelligence' },
    { q: 'cost of living', label: 'Cost of living' },
    { q: 'climate targets emissions', label: 'Climate targets' },
  ],
}

// Mirror of app.js TOPICS (the enrichment taxonomy is canonical there):
// module-local so this file keeps working standalone in tm-test.html.
// Distinct from YEAR_TOPICS above: these are the machine labeller's 21
// topics, selectable as a lens over any year; YEAR_TOPICS are the curated
// per-year probe queries the default "All topics" view runs.
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

/** The retrieval query for a topic-lens probe (mirror of app.js topicPhrase). */
function topicPhrase(slug) {
  return (TOPICS[slug] || slug).toLowerCase().replace(/ & /g, ' and ')
}

// Friendly names for the AEC donation groupings shipped in the reports.
const INDUSTRY_PHRASES = {
  gambling: 'the gambling industry',
  climate: 'mining and fossil-fuel companies',
  media: 'media companies',
  housing: 'the property industry',
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/** Deterministic PRNG so each year shows a stable-but-varied mix of callouts. */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clampYear(y) {
  return Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(y)))
}

function fmtInt(n) {
  return Number(n).toLocaleString('en-AU')
}

function fmtMoney(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K'
  return '$' + Math.round(n)
}

function fmtDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** AEC financial-year label ("1998-99") → the calendar year it ENDS in (1999). */
function fyEndYear(label) {
  const m = /^(\d{4})/.exec(String(label))
  return m ? Number(m[1]) + 1 : null
}

// The record's `state` label, as a reader would name the chamber's parliament.
const PARLIAMENTS = {
  federal: 'Federal parliament', nsw: 'NSW parliament', vic: 'Victorian parliament',
  qld: 'Queensland parliament', sa: 'SA parliament', wa: 'WA parliament',
  tas: 'Tasmanian parliament', nt: 'NT parliament', act: 'ACT parliament',
}
function parliamentName(state) {
  if (!state) return ''
  return PARLIAMENTS[String(state).toLowerCase()] || `${String(state).toUpperCase()} parliament`
}

/**
 * An opening passage that stops where a sentence stops. The search window
 * can begin mid-sentence (the Worker centres it on the matched words and
 * marks the cut with an ellipsis): start at the next sentence when one
 * begins soon enough, and end at the last full stop that fits the budget.
 * Only when no sentence boundary falls inside the budget does a word-cut
 * ellipsis remain.
 */
function passage(text, max = 260) {
  let clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (/^(…|\.\.\.)/.test(clean)) {
    clean = clean.replace(/^(…|\.\.\.)\s*/, '')
    const m = /[.!?]["’”')\]]*\s+(?=[A-Z“"])/.exec(clean.slice(0, 160))
    if (m && clean.length - (m.index + m[0].length) >= 120) clean = clean.slice(m.index + m[0].length)
  }
  if (clean.length <= max) return clean
  // A sentence that runs a little past the budget beats a cut mid-thought.
  const end = sentenceEnd(clean, 80, max + 60)
  if (end > 0) return clean.slice(0, end)
  const head = clean.slice(0, max + 1)
  const cut = head.lastIndexOf(' ')
  return (cut > 60 ? head.slice(0, cut) : head.slice(0, max)) + '…'
}

/** Index just past the last sentence end between `min` and `max`, or -1. */
function sentenceEnd(text, min, max) {
  const re = /[.!?]["’”')\]]*(?=\s|$)/g
  let end = -1
  let m
  while ((m = re.exec(text.slice(0, max + 1)))) {
    if (m.index + m[0].length >= min) end = m.index + m[0].length
  }
  return end
}

/** Clip a record heading to one quiet line. */
function clipText(text, max = 56) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max).lastIndexOf(' ')
  return clean.slice(0, cut > 24 ? cut : max) + '…'
}

/** Machine prose arrives as plain Markdown paragraphs; keep the words, drop the markup. */
function briefParagraphs(answer) {
  return String(answer || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\*\*/g, '').replace(/^\s*(#+|[-*•])\s+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** el('div', 'tm-card', {attrs}) — tiny DOM builder; text goes in via textContent. */
function el(tag, className, attrs) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

// ---------------------------------------------------------------------------
// Styles (injected once, .tm- prefixed, light theme, host tokens)
// ---------------------------------------------------------------------------

const STYLE_ID = 'tm-styles'
const CSS = `
.tm-root {
  font-family: var(--sans, 'Public Sans', system-ui, sans-serif);
  color: var(--ink, #23271F);
  max-width: 62rem;
  margin: 0 auto;
  padding: 0.25rem 0 1.5rem;
}
.tm-root * { box-sizing: border-box; }
.tm-root [hidden] { display: none !important; }
@media (min-width: 761px) { .tm-root { padding: 0.75rem 1rem 2rem; } }
/* The host's close button already has a 44px hit area; on a phone its glyph
   reads small, so the module asks for a larger one while it is mounted. */
#dialog-tm .game-close { font-size: 1.45rem; }

/* Year hero --------------------------------------------------------------- */
.tm-hero { text-align: center; margin: 0; }
.tm-hero-kicker {
  font-family: var(--serif, Merriweather, Georgia, serif); font-style: italic;
  font-size: 0.95rem; color: var(--ink-faint, #6F7468); margin-bottom: -0.1rem;
}
.tm-hero-row { display: flex; align-items: center; justify-content: center; gap: 0.6rem; }
.tm-year {
  font-family: var(--serif, Merriweather, Georgia, serif); font-weight: 900;
  font-size: clamp(3.4rem, 14vw, 6rem); line-height: 1.05;
  color: var(--navy, #142A43); font-variant-numeric: tabular-nums;
  min-width: 4ch; text-align: center;
}
.tm-step {
  font: inherit; font-size: 1.35rem; line-height: 1;
  width: 44px; height: 44px; border-radius: 50%; padding: 0;
  border: 1px solid var(--line-strong, #8D897B);
  background: var(--paper-raised, #fff); color: var(--ink, #23271F);
  cursor: pointer; flex: none;
}
.tm-step:hover:not(:disabled) { border-color: var(--bronze-ink, #8A5A12); color: var(--bronze-ink, #8A5A12); }
.tm-step:disabled { opacity: 0.35; cursor: default; }
.tm-step:focus-visible { outline: 2px solid var(--bronze-ink, #8A5A12); outline-offset: 2px; }
@media (prefers-reduced-motion: no-preference) {
  .tm-year { transition: opacity 120ms ease; }
  .tm-year.tm-tick { opacity: 0.25; }
}

/* Scrubber ---------------------------------------------------------------- */
/* Same idiom as the site's range sliders: a 3px rule, a 28px ringed thumb,
   the navy double ring on focus. The scrubber pads itself by a thumb radius
   so the thumb never leaves the box at either end. */
.tm-scrubber { margin: 0.35rem 0 0; padding: 0 16px; }
.tm-track {
  position: relative; height: 62px; cursor: pointer;
  touch-action: none; border-radius: 6px;
}
.tm-track:focus { outline: none; }
.tm-rail {
  position: absolute; left: 0; right: 0; top: 22px; height: 3px;
  background: var(--line-strong, #8D897B); border-radius: 2px;
}
.tm-fill {
  position: absolute; left: 0; top: 22px; height: 3px;
  background: var(--bronze, #A0761B); border-radius: 2px 0 0 2px;
}
.tm-ticks { position: absolute; inset: 0; pointer-events: none; }
.tm-ticknode { position: absolute; top: 29px; width: 1px; height: 6px; background: var(--line, #DFDCD2); }
.tm-ticknode.tm-major { height: 10px; background: var(--line-strong, #8D897B); }
.tm-ticklabel {
  position: absolute; top: 43px; transform: translateX(-50%);
  font-size: 0.72rem; line-height: 1.2; color: var(--ink-faint, #6F7468);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.tm-ticklabel.tm-current { color: var(--ink, #23271F); font-weight: 600; }
.tm-thumb {
  position: absolute; top: 9.5px; width: 28px; height: 28px;
  transform: translateX(-50%); border-radius: 50%;
  background: var(--paper-raised, #fff);
  border: 2px solid var(--bronze-ink, #8A5A12);
  box-shadow: 0 1px 2px rgba(20, 42, 67, 0.18),
              inset 0 0 0 3px var(--paper-raised, #fff),
              inset 0 0 0 5px var(--bronze-wash, rgba(160,118,27,0.16));
  pointer-events: none;
}
.tm-track:active .tm-thumb { transform: translateX(-50%) scale(1.08); }
.tm-track:focus-visible .tm-thumb {
  box-shadow: 0 0 0 3px var(--paper-raised, #fff), 0 0 0 6px var(--navy, #142A43), 0 1px 2px rgba(20, 42, 67, 0.18);
}
@media (prefers-reduced-motion: no-preference) {
  .tm-thumb, .tm-fill { transition: left 80ms linear, width 80ms linear; }
}
.tm-scrub-foot { display: flex; justify-content: center; margin: -0.2rem 0 0.9rem; }
.tm-random {
  display: inline-flex; align-items: center; gap: 0.4rem;
  min-height: 44px; padding: 0 0.6rem;
  font: 600 0.82rem/1 var(--sans, system-ui, sans-serif);
  color: var(--bronze-ink, #8A5A12); background: none; border: none; cursor: pointer;
  text-decoration: underline; text-decoration-color: var(--bronze-rule, rgba(160,118,27,0.55));
  text-underline-offset: 0.22em;
}
.tm-random:hover { text-decoration-color: currentColor; }
.tm-random:focus-visible { outline: 2px solid var(--bronze-ink, #8A5A12); outline-offset: 2px; border-radius: 4px; }

/* Panels ------------------------------------------------------------------ */
/* Phone: one column, brief → voices → debates → numbers. Wide: the record
   on the left (brief, debates), the tallies on the right (voices, numbers). */
.tm-panels { display: flex; flex-direction: column; gap: 1.6rem; }
.tm-col { display: contents; }
.tm-sec-brief { order: 1; }
.tm-sec-voices { order: 2; }
.tm-sec-debates { order: 3; }
.tm-sec-numbers { order: 4; }
@media (min-width: 761px) {
  .tm-panels { display: grid; grid-template-columns: 3fr 2fr; gap: 2rem; align-items: start; }
  .tm-col { display: flex; flex-direction: column; gap: 1.6rem; min-width: 0; }
}
.tm-sec { min-width: 0; }
.tm-h2 {
  font-family: var(--serif, Merriweather, Georgia, serif); font-size: 1.05rem; font-weight: 700;
  color: var(--ink, #23271F); margin: 0 0 0.7rem;
  padding-bottom: 0.35rem; border-bottom: 1px solid var(--line, #DFDCD2);
}
.tm-h2 span { color: var(--bronze-ink, #8A5A12); }
.tm-sec-head {
  display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap;
  gap: 0.2rem 1rem; padding-bottom: 0.3rem; margin-bottom: 0.2rem;
  border-bottom: 1px solid var(--line, #DFDCD2);
}
.tm-sec-head .tm-h2 { border: none; padding-bottom: 0; margin: 0; }

/* Topic lens: a quiet underlined control, not a form field. */
.tm-topic-row {
  display: inline-flex; align-items: center; gap: 0.45rem;
  font-size: 0.78rem; color: var(--ink-faint, #6F7468);
}
.tm-topic-wrap { position: relative; display: inline-block; min-width: 0; }
.tm-topic-wrap::after {
  content: ''; position: absolute; right: 0.45rem; top: 50%; width: 7px; height: 7px;
  border-right: 1.5px solid var(--ink-soft, #575C52); border-bottom: 1.5px solid var(--ink-soft, #575C52);
  transform: translateY(-70%) rotate(45deg); pointer-events: none;
}
.tm-topic {
  font: inherit; font-size: 0.85rem; color: var(--ink, #23271F);
  background: transparent; -webkit-appearance: none; appearance: none;
  border: none; border-bottom: 1px solid var(--line-strong, #8D897B); border-radius: 0;
  min-height: 44px; padding: 0 1.5rem 0 0.2rem; max-width: 100%; min-width: 0; cursor: pointer;
}
.tm-topic:focus-visible { outline: 2px solid var(--bronze-ink, #8A5A12); outline-offset: 2px; }
@media (max-width: 480px) {
  .tm-topic-row { flex: 1 1 100%; }
  .tm-topic-wrap { flex: 1; }
  .tm-topic { width: 100%; }
}

/* Speech entries: a ruled list, one clean unit each --------------------- */
.tm-cards { display: block; }
.tm-card { display: block; padding: 0.85rem 0 0.35rem; }
.tm-card + .tm-card { border-top: 1px solid var(--line, #DFDCD2); }
.tm-card-who { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
.tm-portrait { flex: none; display: inline-block; width: 32px; height: 32px; }
.tm-portrait img {
  width: 32px; height: 32px; border-radius: 50%; object-fit: cover; display: block;
  border: 1.5px solid var(--paper-raised, #fff); box-shadow: 0 0 0 1px var(--line, #DFDCD2);
}
.tm-portrait.tm-portrait-none {
  border-radius: 50%; background: var(--paper-sunken, #F1EFE8);
  box-shadow: inset 0 0 0 1px var(--line, #DFDCD2);
}
.tm-portrait.tm-portrait-sm, .tm-portrait.tm-portrait-sm img { width: 24px; height: 24px; }
.tm-who-text { min-width: 0; line-height: 1.35; }
.tm-who-line { font-size: 0.9rem; color: var(--ink-soft, #575C52); }
.tm-name { font-weight: 600; color: var(--ink, #23271F); text-decoration: none; }
.tm-name:hover, .tm-meta-link:hover { color: var(--bronze-ink, #8A5A12); }
.tm-meta-link { color: inherit; text-decoration: none; }
.tm-when { font-size: 0.76rem; color: var(--ink-faint, #6F7468); margin-top: 0.1rem; }
.tm-debate {
  font-family: var(--serif, Merriweather, Georgia, serif); font-style: italic;
  font-size: 0.92rem; color: var(--ink-soft, #575C52); margin: 0.55rem 0 0.3rem;
}
.tm-card-snippet {
  font-family: var(--serif, Merriweather, Georgia, serif); font-size: 0.9rem;
  color: var(--ink-soft, #575C52); line-height: 1.55; margin: 0;
}
.tm-card-brief { font-size: 0.87rem; color: var(--ink-soft, #575C52); line-height: 1.55; margin: 0; }
.tm-brief-tag { font-style: italic; color: var(--ink-faint, #6F7468); }
.tm-brief-tag::after { content: ' · '; }
.tm-read {
  display: inline-flex; align-items: center; min-height: 40px;
  font: 600 0.8rem/1 var(--sans, system-ui, sans-serif);
  color: var(--bronze-ink, #8A5A12); text-decoration: underline;
  text-decoration-color: var(--bronze-rule, rgba(160,118,27,0.55)); text-underline-offset: 0.22em;
}
.tm-read:hover { text-decoration-color: currentColor; }
.tm-card a:focus-visible { outline: 2px solid var(--bronze-ink, #8A5A12); outline-offset: 2px; }

/* Loading / empty states */
.tm-skeleton {
  border-radius: 6px; border: 1px solid var(--line, #DFDCD2);
  background: linear-gradient(100deg, var(--paper-sunken, #F1EFE8) 40%, var(--paper-raised, #fff) 50%, var(--paper-sunken, #F1EFE8) 60%);
  background-size: 200% 100%; height: 5.5rem; margin-top: 0.7rem;
}
@media (prefers-reduced-motion: no-preference) {
  .tm-skeleton { animation: tm-shimmer 1.4s linear infinite; }
}
@keyframes tm-shimmer { to { background-position: -200% 0; } }
.tm-empty {
  background: var(--paper-sunken, #F1EFE8); border: 1px solid var(--line, #DFDCD2);
  border-radius: 6px; padding: 1rem 1.1rem; margin-top: 0.7rem;
  font-size: 0.88rem; line-height: 1.6; color: var(--ink-soft, #575C52);
}
.tm-empty strong { color: var(--ink, #23271F); font-family: var(--serif, Merriweather, Georgia, serif); }
.tm-empty-actions { margin-top: 0.4rem; }
.tm-linkbtn {
  font: inherit; font-size: 0.82rem; font-weight: 600; min-height: 40px;
  color: var(--bronze-ink, #8A5A12); background: none; border: none;
  padding: 0; cursor: pointer; text-decoration: underline;
  text-decoration-color: var(--bronze-rule, rgba(160,118,27,0.55)); text-underline-offset: 0.22em;
}
.tm-linkbtn:hover { text-decoration-color: currentColor; }
.tm-linkbtn:focus-visible { outline: 2px solid var(--bronze-ink, #8A5A12); outline-offset: 2px; }

/* The year in brief (machine-written, sources one tap away) ------------- */
.tm-brief-body p { font-size: 0.92rem; line-height: 1.6; color: var(--ink, #23271F); margin: 0 0 0.7rem; }
.tm-brief-toggle { margin: -0.3rem 0 0.4rem; }
@media (min-width: 761px) {
  .tm-brief-more[hidden] { display: block !important; }
  .tm-brief-more-inline[hidden] { display: inline !important; }
  .tm-brief-toggle { display: none; }
}
.tm-fineprint { font-size: 0.74rem; line-height: 1.5; color: var(--ink-faint, #6F7468); margin: 0.3rem 0 0; }
.tm-sources { margin-top: 0.3rem; font-size: 0.8rem; }
.tm-sources summary {
  cursor: pointer; color: var(--bronze-ink, #8A5A12); font-weight: 600;
  padding: 0.7rem 0; list-style-position: inside;
}
.tm-sources-list { margin: 0 0 0.3rem; padding-left: 1.25rem; display: grid; gap: 0.4rem; line-height: 1.45; }
.tm-src-link { color: var(--ink, #23271F); text-decoration: underline; text-decoration-color: var(--bronze-rule, rgba(160,118,27,0.55)); text-underline-offset: 0.18em; }
.tm-src-tail { color: var(--ink-faint, #6F7468); }
.tm-src-cited { margin-left: 0.4rem; font-size: 0.7rem; font-style: italic; color: var(--bronze-ink, #8A5A12); }

/* Voices of the year: a short bar list --------------------------------- */
.tm-voice-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
.tm-voice-row { display: flex; align-items: center; gap: 0.5rem; min-width: 0; font-size: 0.86rem; }
.tm-voice-name {
  font-weight: 600; color: var(--ink, #23271F); text-decoration: none;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.tm-voice-name:hover { color: var(--bronze-ink, #8A5A12); }
.tm-voice-party { color: var(--ink-faint, #6F7468); font-size: 0.78rem; white-space: nowrap; }
.tm-voice-n { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--ink-soft, #575C52); font-size: 0.8rem; }
.tm-voice-bar { height: 5px; background: var(--paper-sunken, #F1EFE8); border-radius: 3px; margin-top: 0.3rem; overflow: hidden; }
.tm-voice-fill { height: 100%; background: var(--bronze, #A0761B); border-radius: 3px; }
.tm-voice-parties { font-size: 0.8rem; color: var(--ink-soft, #575C52); margin: 0.8rem 0 0; line-height: 1.5; }

/* Numbers panel */
.tm-stats { display: grid; gap: 0.9rem; }
.tm-stat {
  background: var(--paper-raised, #fff); border: 1px solid var(--line, #DFDCD2);
  border-left: 3px solid var(--bronze, #A0761B); border-radius: 0 6px 6px 0;
  padding: 0.7rem 0.9rem;
}
.tm-stat-num {
  font-family: var(--serif, Merriweather, Georgia, serif); font-weight: 900;
  font-size: 1.6rem; color: var(--bronze-ink, #8A5A12); line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.tm-stat-text { font-size: 0.83rem; color: var(--ink-soft, #575C52); line-height: 1.5; margin-top: 0.15rem; }
.tm-spark { margin-top: 0.4rem; }
.tm-spark svg { display: block; width: 100%; height: 2.2rem; }
.tm-spark-caption { font-size: 0.7rem; color: var(--ink-faint, #6F7468); margin-top: 0.15rem; }

/* Footer honesty strip ---------------------------------------------------- */
.tm-footer {
  margin-top: 1.75rem; padding: 0.8rem 0 0;
  border-top: 1px solid var(--line, #DFDCD2);
  font-size: 0.78rem; line-height: 1.55; color: var(--ink-faint, #6F7468);
}
.tm-footer p { margin: 0; }
.tm-footer b { color: var(--ink-soft, #575C52); font-weight: 600; }
`

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function fetchJSON(url, signal) {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

/**
 * Load the six topic reports (timelines + donations) plus corpus progress.
 * Any individual failure degrades quietly — the panel that needed it hides.
 */
async function loadStaticData(signal) {
  const out = { reports: [], progress: null }

  try {
    const index = await fetchJSON('/reports/index.json', signal)
    const loaded = await Promise.allSettled(
      (index.reports || []).map((r) => fetchJSON(`/reports/${r.slug}.json`, signal)),
    )
    for (const item of loaded) {
      if (item.status !== 'fulfilled') continue
      const rep = item.value
      const timeline = new Map()
      for (const [year, count] of rep.stats?.timeline || []) timeline.set(Number(year), count)
      const donations = new Map()
      for (const [label, amount] of rep.stats?.donations?.by_year || []) {
        const end = fyEndYear(label)
        if (end) donations.set(end, { label, amount })
      }
      out.reports.push({ slug: rep.slug, title: rep.title, timeline, donations })
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err
  }

  // Indexing progress for the honesty strip: how much of the archive the
  // live search can see so far.
  try {
    const [stats, corpus] = await Promise.allSettled([
      fetchJSON('/api/stats', signal),
      fetchJSON('/corpus.json', signal),
    ])
    const expected = corpus.status === 'fulfilled' ? Number(corpus.value.expected_resources) : NaN
    let indexed = NaN
    if (stats.status === 'fulfilled') {
      const s = stats.value
      const candidate = s.resources ?? s.counters?.resources ?? s.total_resources
      indexed = Number(typeof candidate === 'object' ? candidate?.count : candidate)
    }
    if (Number.isFinite(indexed) && Number.isFinite(expected) && expected > 0) {
      out.progress = { indexed, expected, pct: Math.min(100, Math.round((indexed / expected) * 100)) }
    }
  } catch (err) {
    if (err?.name === 'AbortError') throw err
  }

  return out
}

// ---------------------------------------------------------------------------
// Stat callouts — precise, computed from the report timelines
// ---------------------------------------------------------------------------

function buildCallouts(reports, year) {
  const rand = mulberry32(year * 2654435761)
  const counts = reports
    .map((r) => ({ report: r, count: r.timeline.get(year) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
  const callouts = []

  // 1. The busiest tracked topic of the year, with a sparkline of its arc.
  if (counts.length) {
    const top = counts[0]
    callouts.push({
      num: fmtInt(top.count),
      text: `speeches touched on ${top.report.title} in ${year}, the busiest of the ${reports.length} topics OPAX tracks.`,
      sparkline: top.report,
    })

    // 2. Was this a record year for any topic (so far)?
    const record = counts.find(({ report, count }) => {
      for (const [y, c] of report.timeline) if (y < year && c >= count) return false
      return count >= 20
    })
    if (record && record.count >= 20) {
      callouts.push({
        num: String(year),
        text: `was ${record.report.title}’s biggest year yet at that point: ${fmtInt(record.count)} speeches, more than any year before it.`,
      })
    }
  }

  // 3. A donations callout (AEC disclosures, financial year ending this year).
  const donors = reports
    .map((r) => ({ report: r, d: r.donations.get(year) }))
    .filter((x) => x.d && x.d.amount > 0)
  if (donors.length) {
    const pick = donors[Math.floor(rand() * donors.length)]
    const phrase = INDUSTRY_PHRASES[pick.report.slug] || `donors linked to ${pick.report.title}`
    callouts.push({
      num: fmtMoney(pick.d.amount),
      text: `in political donations disclosed by ${phrase} in ${pick.d.label} (AEC returns for the financial year ending ${year}).`,
    })
  }

  // 4. The year's total across the tracked topics. (An airtime ratio between
  //    two arbitrary tracked topics used to sit here; it is not a finding.)
  if (counts.length >= 2 && callouts.length < 4) {
    callouts.push({
      num: fmtInt(counts.reduce((s, c) => s + c.count, 0)),
      text: `speeches across all ${counts.length} tracked topics in ${year}.`,
    })
  }

  return callouts.slice(0, 4)
}

function sparklineSVG(report, year) {
  const points = [...report.timeline.entries()].sort((a, b) => a[0] - b[0])
  if (points.length < 2) return null
  const max = Math.max(...points.map(([, c]) => c), 1)
  const y0 = points[0][0]
  const span = points[points.length - 1][0] - y0 || 1
  const W = 200
  const H = 36
  const coords = points.map(([y, c]) => [
    ((y - y0) / span) * (W - 4) + 2,
    H - 3 - (c / max) * (H - 8),
  ])
  const path = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const here = coords[points.findIndex(([y]) => y === year)]

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label',
    `Speeches about ${report.title} per year, ${y0} to ${points[points.length - 1][0]}`)
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  line.setAttribute('d', path)
  line.setAttribute('fill', 'none')
  line.setAttribute('stroke', 'var(--bronze, #A0761B)')
  line.setAttribute('stroke-width', '1.5')
  svg.appendChild(line)
  if (here) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    dot.setAttribute('cx', here[0].toFixed(1))
    dot.setAttribute('cy', here[1].toFixed(1))
    dot.setAttribute('r', '3')
    dot.setAttribute('fill', 'var(--navy, #142A43)')
    svg.appendChild(dot)
  }
  return svg
}

// ---------------------------------------------------------------------------
// mountTimeMachine
// ---------------------------------------------------------------------------

export function mountTimeMachine(container, opts = {}) {
  injectStyles()

  // The host hands us the site's own title helper so a card reads the same as
  // a search result; standalone (the test harness) the raw title stands.
  const cardTitle = opts.displayTitle || ((r) => r.title || r.slug || '')

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  // ---- static chrome (no user/API data goes through this template) --------
  const root = el('section', 'tm-root', { 'aria-label': 'Time Machine: explore the parliamentary record by year' })
  root.innerHTML = `
    <div class="tm-hero">
      <div class="tm-hero-kicker" aria-hidden="true">Parliament in</div>
      <div class="tm-hero-row">
        <button type="button" class="tm-step tm-step-back" aria-label="Previous year">‹</button>
        <div class="tm-year" aria-hidden="true"></div>
        <button type="button" class="tm-step tm-step-fwd" aria-label="Next year">›</button>
      </div>
    </div>

    <div class="tm-scrubber">
      <div class="tm-track" role="slider" tabindex="0"
           aria-label="Year"
           aria-valuemin="${YEAR_MIN}" aria-valuemax="${YEAR_MAX}"
           aria-orientation="horizontal">
        <div class="tm-rail"></div>
        <div class="tm-fill"></div>
        <div class="tm-ticks"></div>
        <div class="tm-thumb"></div>
      </div>
      <div class="tm-scrub-foot">
        <button type="button" class="tm-random" aria-label="Take me to a random year">
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 0l1.8 6.2L16 8l-6.2 1.8L8 16 6.2 9.8 0 8l6.2-1.8z" fill="currentColor"/>
          </svg>
          Take me somewhere
        </button>
      </div>
    </div>

    <div class="tm-panels">
      <div class="tm-col tm-col-main">
        <section class="tm-sec tm-sec-brief" aria-label="The year in brief" hidden>
          <h2 class="tm-h2">The year <span>in brief</span></h2>
          <div class="tm-yearbrief"></div>
        </section>
        <section class="tm-sec tm-sec-debates" aria-label="What they were arguing about">
          <div class="tm-sec-head">
            <h2 class="tm-h2">What they were <span>arguing about</span></h2>
            <label class="tm-topic-row">
              <span>Topic</span>
              <span class="tm-topic-wrap"><select class="tm-topic"></select></span>
            </label>
          </div>
          <div class="tm-cards" aria-live="polite" aria-busy="false"></div>
        </section>
      </div>
      <div class="tm-col tm-col-side">
        <section class="tm-sec tm-sec-voices" aria-label="Voices of the year" hidden>
          <h2 class="tm-h2">Voices of <span>the year</span></h2>
          <div class="tm-voices"></div>
        </section>
        <section class="tm-sec tm-sec-numbers" aria-label="The year in numbers">
          <h2 class="tm-h2">The year in <span>numbers</span></h2>
          <div class="tm-stats"></div>
        </section>
      </div>
    </div>

    <footer class="tm-footer"></footer>
  `

  const $ = (sel) => root.querySelector(sel)
  const yearEl = $('.tm-year')
  const track = $('.tm-track')
  const fill = $('.tm-fill')
  const ticks = $('.tm-ticks')
  const thumb = $('.tm-thumb')
  const cardsEl = $('.tm-cards')
  const statsEl = $('.tm-stats')
  const footerEl = $('.tm-footer')
  const btnRandom = $('.tm-random')
  const btnBack = $('.tm-step-back')
  const btnFwd = $('.tm-step-fwd')
  const topicSel = $('.tm-topic')
  const briefSec = $('.tm-sec-brief')
  const briefEl = $('.tm-yearbrief')
  const voicesSec = $('.tm-sec-voices')
  const voicesEl = $('.tm-voices')

  // Options via textContent (never innerHTML), matching the module's rule for
  // everything that renders. "All topics" is the default: the curated per-year
  // probes, exactly as before the lens existed.
  {
    const all = el('option')
    all.value = ''
    all.textContent = 'All topics'
    topicSel.appendChild(all)
    for (const [slug, name] of Object.entries(TOPICS)) {
      const opt = el('option')
      opt.value = slug
      opt.textContent = name
      topicSel.appendChild(opt)
    }
  }

  // Ruler ticks: one per year, tall every 5 years and at the ends. Labels
  // exist for every tall tick; which ones SHOW is decided by the track's
  // width (layoutTickLabels) so they never collide on a phone.
  const tickLabels = []
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
    const pct = ((y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100
    const major = y % 5 === 0 || y === YEAR_MIN || y === YEAR_MAX
    const t = el('div', 'tm-ticknode' + (major ? ' tm-major' : ''))
    t.style.left = pct + '%'
    ticks.appendChild(t)
    if (major) {
      const lab = el('div', 'tm-ticklabel')
      lab.style.left = pct + '%'
      lab.textContent = y
      ticks.appendChild(lab)
      tickLabels.push({ y, node: lab })
    }
  }

  // Both ends always show; a five-year label shows only when it clears every
  // label already placed by a label's width. At 390px that is 1998, 2005 …
  // 2020, 2026; on a desktop track all of them fit.
  const LABEL_W = 36
  function layoutTickLabels() {
    const w = track.clientWidth
    if (!w) return
    const pxPerYear = w / (YEAR_MAX - YEAR_MIN)
    const shown = [YEAR_MIN, YEAR_MAX]
    for (const { y } of tickLabels) {
      if (y === YEAR_MIN || y === YEAR_MAX) continue
      if (shown.every((s) => Math.abs(y - s) * pxPerYear >= LABEL_W)) shown.push(y)
    }
    for (const { y, node } of tickLabels) node.hidden = !shown.includes(y)
  }
  const resizeObs = typeof ResizeObserver === 'function' ? new ResizeObserver(layoutTickLabels) : null
  if (resizeObs) resizeObs.observe(track)

  // ---- state --------------------------------------------------------------
  let year = START_YEAR
  let topic = '' // '' = all topics (the curated probes); else a TOPICS slug
  let staticData = { reports: [], progress: null }
  let searchAbort = null       // in-flight headline probes
  let searchTimer = 0          // debounce while scrubbing
  let searchSeq = 0            // stale-response guard
  let extrasSeq = 0            // stale-response guard for the year's static JSON
  let dragging = false
  // The newest year we've actually seen live results for this session; the
  // "take me somewhere ready" jump stays at or below it. Seeded conservatively
  // — the index has comfortably passed the early years.
  let lastGoodYear = 2002
  const mountAbort = new AbortController()
  const yearCache = new Map()  // year → /years/{year}.json (or null)
  let yearIndexPromise = null

  // ---- rendering ----------------------------------------------------------

  function renderScrubber() {
    const pct = ((year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100
    thumb.style.left = pct + '%'
    fill.style.width = pct + '%'
    track.setAttribute('aria-valuenow', String(year))
    track.setAttribute('aria-valuetext', `Parliament in ${year}`)
    yearEl.textContent = String(year)
    for (const { y, node } of tickLabels) node.classList.toggle('tm-current', y === year)
    btnBack.disabled = year <= YEAR_MIN
    btnFwd.disabled = year >= YEAR_MAX
    if (!reducedMotion.matches) {
      yearEl.classList.add('tm-tick')
      requestAnimationFrame(() => requestAnimationFrame(() => yearEl.classList.remove('tm-tick')))
    }
  }

  function renderSkeletons() {
    cardsEl.replaceChildren()
    cardsEl.setAttribute('aria-busy', 'true')
    for (let i = 0; i < 3; i++) cardsEl.appendChild(el('div', 'tm-skeleton', { 'aria-hidden': 'true' }))
  }

  function renderStats() {
    statsEl.replaceChildren()
    if (!staticData.reports.length) return
    for (const c of buildCallouts(staticData.reports, year)) {
      const box = el('div', 'tm-stat')
      const num = el('div', 'tm-stat-num')
      num.textContent = c.num
      const text = el('div', 'tm-stat-text')
      text.textContent = c.text
      box.append(num, text)
      if (c.sparkline) {
        const svg = sparklineSVG(c.sparkline, year)
        if (svg) {
          const wrap = el('div', 'tm-spark')
          wrap.appendChild(svg)
          const cap = el('div', 'tm-spark-caption')
          cap.textContent = `${c.sparkline.title} speeches per year, ${YEAR_MIN}–${YEAR_MAX} · dot marks ${year}`
          box.append(wrap, cap)
        }
      }
      statsEl.appendChild(box)
    }
  }

  function renderFooter() {
    footerEl.replaceChildren()
    const p = el('p')
    const b = el('b')
    b.textContent = 'The archive is still being digitised, oldest first.'
    p.appendChild(b)
    const rest = staticData.progress
      ? ` About ${staticData.progress.pct}% of ${fmtInt(staticData.progress.expected)} records are searchable so far, and more arrive every day. The numbers panel uses the complete historical dataset, so it works for every year; the live quotes, the year in brief and the voices catch up year by year.`
      : ' Live quotes appear as each year is shelved; the numbers panel already covers the whole record.'
    p.appendChild(document.createTextNode(rest))
    footerEl.appendChild(p)
  }

  let photoMapPromise = null
  function fillPortraits(scope) {
    photoMapPromise ??= fetch('/photos/people.json').then((r) => r.json()).catch(() => null)
    photoMapPromise.then((map) => {
      for (const slot of scope.querySelectorAll('.tm-portrait[data-speaker]')) {
        const id = map && map[String(slot.dataset.speaker).trim().toLowerCase()]
        // No portrait on file: an empty ring holds the column so names align.
        if (!id) { slot.classList.add('tm-portrait-none'); slot.removeAttribute('data-speaker'); continue }
        const size = slot.classList.contains('tm-portrait-sm') ? '24' : '32'
        const img = el('img', null, { src: `/photos/${id}.webp`, alt: '', width: size, height: size, loading: 'lazy' })
        slot.appendChild(img)
      }
    })
  }

  /** The record's own heading for a speech ("Bills", "Housing"), if the title carries one. */
  function subjectOf(r) {
    const t = String(cardTitle(r) || '').trim()
    if (!t || t === String(r.title || '').trim() || t === String(r.speaker || '').trim()) return ''
    return clipText(t, 44)
  }

  // One clean unit per speech: who (portrait, name, party), when and where
  // as a quiet second line, the debate in serif, then the summary or the
  // opening passage, and a link to the speech itself. A container, not one
  // big link: the name and party open their own pages (links cannot nest).
  function makeCard(topicLabel, r) {
    const card = el('article', 'tm-card')
    if (r.resource) card.dataset.rid = r.resource

    const who = el('div', 'tm-card-who')
    if (r.speaker) {
      const slot = el('span', 'tm-portrait')
      slot.dataset.speaker = r.speaker
      who.appendChild(slot)
    }
    const text = el('div', 'tm-who-text')
    const line1 = el('div', 'tm-who-line')
    if (r.speaker) {
      const name = el('a', 'tm-name', { href: `#/subject/person/${encodeURIComponent(r.speaker)}` })
      name.textContent = r.speaker
      line1.appendChild(name)
    }
    if (r.party) {
      if (r.speaker) line1.appendChild(document.createTextNode(' · '))
      const party = el('a', 'tm-meta-link', { href: `#/subject/party/${encodeURIComponent(r.party)}` })
      party.textContent = r.party
      line1.appendChild(party)
    }
    if (!line1.childNodes.length) line1.textContent = 'Speaker not recorded'
    const line2 = el('div', 'tm-when')
    line2.textContent = [fmtDate(r.date), parliamentName(r.state), subjectOf(r)].filter(Boolean).join(' · ')
    text.append(line1, line2)
    who.appendChild(text)

    const debate = el('p', 'tm-debate')
    debate.textContent = topicLabel
    card.append(who, debate)

    // A real passage only — frontier-year records sometimes index as title
    // stubs, and quoting "Jane Doe — 2005-02-14" back at the reader is silly.
    const quote = passage(r.snippet)
    if (quote && quote !== (r.title || '').trim() && quote.length >= 40) {
      const snip = el('p', 'tm-card-snippet')
      snip.textContent = '“' + quote + '”'
      card.appendChild(snip)
    }
    const read = el('a', 'tm-read', { href: `#/doc/${r.slug}` })
    read.textContent = 'Read the speech'
    card.appendChild(read)
    return card
  }

  // Machine summaries ("In brief" on the doc page) where the enrichment pass
  // has reached a speech: swap the opening passage for the summary, labelled
  // as machine-written. One small /api/brief call per render; speeches the
  // pass has not reached keep their passage, so the list never waits on this.
  async function applyBriefs(rids, seq, signal) {
    if (!rids.length) return
    let briefs = {}
    try {
      const data = await fetchJSON(`/api/brief?rids=${encodeURIComponent(rids.join(','))}`, signal)
      briefs = data?.briefs || {}
    } catch {
      return
    }
    if (seq !== searchSeq) return
    for (const card of cardsEl.querySelectorAll('.tm-card[data-rid]')) {
      const text = briefs[card.dataset.rid]
      if (!text) continue
      const brief = el('p', 'tm-card-brief')
      const tag = el('span', 'tm-brief-tag')
      tag.textContent = 'Machine summary'
      brief.append(tag, document.createTextNode(text))
      const quote = card.querySelector('.tm-card-snippet')
      if (quote) quote.replaceWith(brief)
      else card.insertBefore(brief, card.querySelector('.tm-read'))
    }
  }

  // ---- the year in brief + voices (static JSON, scripts/generate_years.py) --

  function renderYearBrief(data) {
    const brief = data?.brief
    const paras = briefParagraphs(brief?.answer)
    briefEl.replaceChildren()
    briefSec.hidden = !paras.length
    if (!paras.length) return

    // On a phone the opening sentences carry the year; the rest of the
    // first paragraph and every later one wait behind one tap. Wide screens
    // show it all (CSS un-hides .tm-brief-more there).
    const body = el('div', 'tm-brief-body')
    const leadEnd = paras[0].length > 460 ? sentenceEnd(paras[0], 160, 400) : -1
    let hasMore = paras.length > 1
    paras.forEach((text, i) => {
      const p = el('p')
      if (i === 0 && leadEnd > 0 && leadEnd < text.length) {
        p.appendChild(document.createTextNode(text.slice(0, leadEnd)))
        const rest = el('span', 'tm-brief-more tm-brief-more-inline')
        rest.textContent = ' ' + text.slice(leadEnd).trim()
        rest.hidden = true
        p.appendChild(rest)
        hasMore = true
      } else {
        p.textContent = text
        if (i > 0) { p.classList.add('tm-brief-more'); p.hidden = true }
      }
      body.appendChild(p)
    })
    briefEl.appendChild(body)
    if (hasMore) {
      // On a phone the first paragraph opens the year; the rest is one tap.
      const more = el('button', 'tm-linkbtn tm-brief-toggle', { type: 'button', 'aria-expanded': 'false' })
      more.textContent = 'Read the rest'
      more.addEventListener('click', () => {
        const open = more.getAttribute('aria-expanded') !== 'true'
        more.setAttribute('aria-expanded', String(open))
        more.textContent = open ? 'Show less' : 'Read the rest'
        for (const p of body.querySelectorAll('.tm-brief-more')) p.hidden = !open
      })
      briefEl.appendChild(more)
    }

    const sources = Array.isArray(brief.sources) ? brief.sources : []
    const cited = sources.filter((s) => s.cited).length
    const fine = el('p', 'tm-fineprint')
    fine.textContent = sources.length
      ? `Machine-written from the ${sources.length} passages the knowledge box retrieved for ${data.year} so far, ${cited} of them cited. A reading aid, not the record: check any claim against the speeches.`
      : `Machine-written from what the knowledge box had retrieved for ${data.year} so far. A reading aid, not the record.`
    briefEl.appendChild(fine)

    if (sources.length) {
      const det = el('details', 'tm-sources')
      const sum = el('summary')
      sum.textContent = `The speeches it drew on (${sources.length})`
      det.appendChild(sum)
      const ol = el('ol', 'tm-sources-list')
      for (const s of sources) {
        if (!s.slug) continue
        const li = el('li')
        const a = el('a', 'tm-src-link', { href: `#/doc/${s.slug}` })
        a.textContent = s.speaker || s.title || s.slug
        li.appendChild(a)
        const tail = [s.party, fmtDate(s.date), parliamentName(s.state)].filter(Boolean).join(' · ')
        if (tail) {
          const t = el('span', 'tm-src-tail')
          t.textContent = ' · ' + tail
          li.appendChild(t)
        }
        if (s.cited) {
          const c = el('span', 'tm-src-cited')
          c.textContent = 'cited'
          li.appendChild(c)
        }
        ol.appendChild(li)
      }
      det.appendChild(ol)
      briefEl.appendChild(det)
    }
  }

  function renderVoices(data) {
    const v = data?.voices
    // A voice is a repeat appearance; fewer than three of them is not a list.
    const speakers = (Array.isArray(v?.speakers) ? v.speakers : [])
      .filter((s) => Number(s.speeches) >= 2)
      .slice(0, 6)
    voicesEl.replaceChildren()
    voicesSec.hidden = speakers.length < 3
    if (speakers.length < 3) return

    const max = Math.max(...speakers.map((s) => Number(s.speeches) || 0), 1)
    const ol = el('ol', 'tm-voice-list')
    for (const s of speakers) {
      const li = el('li', 'tm-voice')
      const row = el('div', 'tm-voice-row')
      const slot = el('span', 'tm-portrait tm-portrait-sm')
      slot.dataset.speaker = s.name
      row.appendChild(slot)
      const name = el('a', 'tm-voice-name', { href: `#/subject/person/${encodeURIComponent(s.name)}` })
      name.textContent = s.name
      row.appendChild(name)
      if (s.party) {
        const p = el('span', 'tm-voice-party')
        p.textContent = s.party
        row.appendChild(p)
      }
      const n = el('span', 'tm-voice-n')
      n.textContent = fmtInt(s.speeches)
      n.setAttribute('aria-label', `${fmtInt(s.speeches)} speeches`)
      row.appendChild(n)
      const bar = el('div', 'tm-voice-bar', { 'aria-hidden': 'true' })
      const fillEl = el('div', 'tm-voice-fill')
      fillEl.style.width = Math.round(((Number(s.speeches) || 0) / max) * 100) + '%'
      bar.appendChild(fillEl)
      li.append(row, bar)
      ol.appendChild(li)
    }
    voicesEl.appendChild(ol)
    fillPortraits(voicesEl)

    const parties = Array.isArray(v.parties) ? v.parties.slice(0, 5) : []
    if (parties.length) {
      const p = el('p', 'tm-voice-parties')
      p.textContent = 'By party: ' + parties.map((x) => `${x.party} ${fmtInt(x.speeches)}`).join(' · ')
      voicesEl.appendChild(p)
    }
    const fine = el('p', 'tm-fineprint')
    const debates = Array.isArray(v.probes) && v.probes.length ? v.probes.length : 4
    const total = Number(v.unique_speeches) || 0
    const labelled = total - (Number(v.unlabelled_party) || 0)
    const partyNote = total && labelled < total ? ` Party labels exist for ${fmtInt(labelled)} of them.` : ''
    const chairNote = Number(v.presiding_rows_skipped) > 0 ? ' Rows the record attributes to the presiding officers are left out.' : ''
    fine.textContent = `Speeches per speaker among the ${fmtInt(total)} strongest matches for ${data.year}’s ${debates} debates, so far.${partyNote}${chairNote} Who dominates those debates in the index, not who spoke most in parliament.`
    voicesEl.appendChild(fine)
  }

  // The year's static enrichment (one file per year, generated once through
  // the knowledge box). Missing or unreachable simply hides both sections.
  async function loadYearExtras() {
    const seq = ++extrasSeq
    const y = year
    const { signal } = mountAbort
    yearIndexPromise ??= fetchJSON('/years/index.json', signal).catch(() => null)
    let data = null
    try {
      const idx = await yearIndexPromise
      if (seq !== extrasSeq) return
      if (!idx || idx.years?.[String(y)]) {
        if (yearCache.has(y)) data = yearCache.get(y)
        else {
          data = await fetchJSON(`/years/${y}.json`, signal).catch(() => null)
          yearCache.set(y, data)
        }
      }
    } catch {
      data = null
    }
    if (seq !== extrasSeq) return
    renderYearBrief(data)
    renderVoices(data)
  }

  // Under the topic lens an empty year has TWO possible causes (the archive
  // is still loading AND the labelling pass is still running), so the copy
  // must not pretend to know which — and must not read as "parliament was
  // quiet about this".
  function renderEmptyTopicYear() {
    cardsEl.replaceChildren()
    const box = el('div', 'tm-empty', { role: 'status' })

    const head = el('strong')
    head.textContent = `No ${TOPICS[topic]} speeches labelled for ${year} yet.`
    box.appendChild(head)

    const body = el('p')
    body.style.margin = '0.4rem 0 0'
    body.textContent =
      'The topic lens only sees speeches a still-running machine labelling pass has reached, ' +
      'on top of an archive that is itself still loading. A quiet result here means the ' +
      'machines have not caught up with this year, not that parliament was silent about it.'
    box.appendChild(body)

    const actions = el('div', 'tm-empty-actions')
    const clear = el('button', 'tm-linkbtn', { type: 'button' })
    clear.textContent = `Show all topics for ${year}`
    clear.addEventListener('click', () => setTopic(''))
    actions.appendChild(clear)
    box.appendChild(actions)
    cardsEl.appendChild(box)
  }

  function renderEmptyYear() {
    if (topic) {
      renderEmptyTopicYear()
      return
    }
    cardsEl.replaceChildren()
    const box = el('div', 'tm-empty', { role: 'status' })

    const head = el('strong')
    head.textContent = `The time machine hasn’t reached ${year} yet.`
    box.appendChild(head)

    const tracked = staticData.reports.reduce((s, r) => s + (r.timeline.get(year) ?? 0), 0)
    const body = el('p')
    body.style.margin = '0.4rem 0 0'
    const pctNote = staticData.progress ? ` It’s about ${staticData.progress.pct}% of the way through.` : ''
    body.textContent = tracked > 0
      ? `Parliament definitely wasn’t quiet: it gave ${fmtInt(tracked)} speeches in ${year} on our six tracked topics alone (see the numbers). The record is being shelved oldest-first, and the live quotes for this year are still on the trolley.${pctNote}`
      : `The record is being shelved oldest-first, and the live quotes for this year are still on the trolley.${pctNote} Parliament wasn’t silent. We just haven’t caught up.`
    box.appendChild(body)

    const actions = el('div', 'tm-empty-actions')
    const jump = el('button', 'tm-linkbtn', { type: 'button' })
    jump.textContent = 'Take me to an earlier year that’s ready'
    jump.addEventListener('click', () => {
      const span = Math.max(1, lastGoodYear - YEAR_MIN + 1)
      setYear(YEAR_MIN + Math.floor(Math.random() * span), true)
    })
    actions.appendChild(jump)
    box.appendChild(actions)
    cardsEl.appendChild(box)
  }

  function renderErrorState() {
    cardsEl.replaceChildren()
    const box = el('div', 'tm-empty', { role: 'status' })
    const head = el('strong')
    head.textContent = 'The time circuits hiccuped.'
    box.appendChild(head)
    const body = el('p')
    body.style.margin = '0.4rem 0 0'
    body.textContent = 'We couldn’t reach the archive just now. Nudge the dial to try again.'
    box.appendChild(body)
    cardsEl.appendChild(box)
  }

  // ---- live headline probes ----------------------------------------------

  async function loadHeadlines() {
    const seq = ++searchSeq
    if (searchAbort) searchAbort.abort()
    searchAbort = new AbortController()
    const { signal } = searchAbort
    // Topic lens: ONE probe, the topic phrase as the query plus the label
    // filter the enrichment pass writes — the same pairing the topic pages
    // use — instead of the year's curated queries (intersecting those with
    // a label filter would mix two topic vocabularies and near-empty most
    // years). All-topics behaviour is exactly the pre-lens module.
    const filtered = Boolean(topic)
    const probes = filtered
      ? [{ q: topicPhrase(topic), label: TOPICS[topic], topic }]
      : YEAR_TOPICS[year] || []
    renderSkeletons()

    const settled = await Promise.allSettled(
      probes.map((p) =>
        fetchJSON(
          `/api/search?q=${encodeURIComponent(p.q)}&from=${year}&to=${year}` +
            `&top_k=${filtered ? 12 : 6}${p.topic ? `&topic=${encodeURIComponent(p.topic)}` : ''}`,
          signal,
        ).then((data) => ({ probe: p, results: data.results || [] })),
      ),
    )
    if (seq !== searchSeq) return // a newer year took over while we were away
    cardsEl.setAttribute('aria-busy', 'false')

    const perProbe = settled
      .filter((s) => s.status === 'fulfilled')
      .map((s) => s.value)
    if (!perProbe.length) {
      if (settled.some((s) => s.status === 'rejected' && s.reason?.name !== 'AbortError')) {
        renderErrorState()
      }
      return
    }

    // Interleave: best unseen result from each probe, twice around, so every
    // debate gets a card before any debate gets two. The topic lens has one
    // probe, so it gets enough rounds to fill the list on its own.
    const seen = new Set()
    const picks = []
    for (let round = 0; round < (filtered ? 6 : 2) && picks.length < 6; round++) {
      for (const { probe, results } of perProbe) {
        const r = results.find((x) => x.slug && !seen.has(x.slug))
        if (r) {
          seen.add(r.slug)
          picks.push({ probe, r })
          if (picks.length >= 6) break
        }
      }
    }

    if (!picks.length) {
      renderEmptyYear()
      return
    }
    if (year > lastGoodYear) lastGoodYear = year
    cardsEl.replaceChildren()
    for (const { probe, r } of picks) cardsEl.appendChild(makeCard(probe.label, r))
    fillPortraits(cardsEl)
    applyBriefs(picks.map(({ r }) => r.resource).filter(Boolean), seq, signal)

    // A thin year means the machine is mid-shelving it, not that parliament
    // went quiet — say so. Under the topic lens the labelling pass is the
    // second reason a year runs thin, so the caveat names both.
    if (picks.length < 3) {
      const note = el('div', 'tm-empty', { role: 'note' })
      note.textContent = filtered
        ? `That’s every ${TOPICS[topic]}-labelled speech the machine has shelved for ${year} so far. The archive and the topic labeller are both still running, so more may arrive.`
        : `That’s everything the machine has shelved for ${year} so far. The archive loads oldest-first, and more of ${year} arrives every day.`
      cardsEl.appendChild(note)
    }
  }

  // ---- year changes -------------------------------------------------------

  function loadYear() {
    loadHeadlines()
    loadYearExtras()
  }

  function setYear(y, immediate = false) {
    const next = clampYear(y)
    if (next === year && !immediate) return
    year = next
    renderScrubber()
    renderStats()
    clearTimeout(searchTimer)
    // Debounce while scrubbing so we don't strafe the API; fire promptly on
    // discrete jumps (keyboard steps still coalesce via the short delay).
    searchTimer = setTimeout(loadYear, immediate ? 0 : 350)
  }

  // The topic lens changes the probes, not the year: numbers panel and
  // scrubber stand, only the headline cards reload.
  function setTopic(next) {
    if (next === topic) return
    topic = next
    if (topicSel.value !== next) topicSel.value = next
    clearTimeout(searchTimer)
    searchTimer = setTimeout(loadHeadlines, 0)
  }
  const onTopicChange = () => setTopic(topicSel.value)
  topicSel.addEventListener('change', onTopicChange)

  // ---- input: pointer scrubbing ------------------------------------------

  function yearFromPointer(clientX) {
    const rect = track.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return clampYear(YEAR_MIN + frac * (YEAR_MAX - YEAR_MIN))
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return
    dragging = true
    setYear(yearFromPointer(e.clientX))
    track.focus({ preventScroll: true })
    e.preventDefault()
    // Best-effort: capture can throw InvalidPointerId on synthetic input.
    try { track.setPointerCapture(e.pointerId) } catch { /* drag still works via move events over the track */ }
  }
  function onPointerMove(e) {
    if (!dragging) return
    setYear(yearFromPointer(e.clientX))
  }
  function onPointerUp(e) {
    if (!dragging) return
    dragging = false
    try { track.releasePointerCapture(e.pointerId) } catch { /* not captured */ }
  }

  track.addEventListener('pointerdown', onPointerDown)
  track.addEventListener('pointermove', onPointerMove)
  track.addEventListener('pointerup', onPointerUp)
  track.addEventListener('pointercancel', onPointerUp)

  // ---- input: keyboard ----------------------------------------------------

  function onKeyDown(e) {
    let next = null
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowDown': next = year - 1; break
      case 'ArrowRight': case 'ArrowUp': next = year + 1; break
      case 'PageDown': next = year - 5; break
      case 'PageUp': next = year + 5; break
      case 'Home': next = YEAR_MIN; break
      case 'End': next = YEAR_MAX; break
      default: return
    }
    e.preventDefault()
    setYear(next)
  }
  track.addEventListener('keydown', onKeyDown)

  // ---- input: buttons -----------------------------------------------------

  const onBack = () => setYear(year - 1)
  const onFwd = () => setYear(year + 1)
  const onRandom = () => {
    // Serendipity: any year but this one.
    let next = year
    while (next === year) next = YEAR_MIN + Math.floor(Math.random() * (YEAR_MAX - YEAR_MIN + 1))
    setYear(next, true)
  }
  btnBack.addEventListener('click', onBack)
  btnFwd.addEventListener('click', onFwd)
  btnRandom.addEventListener('click', onRandom)

  // ---- boot ---------------------------------------------------------------

  container.appendChild(root)
  renderScrubber()
  layoutTickLabels()
  renderFooter()
  renderSkeletons()

  loadStaticData(mountAbort.signal)
    .then((data) => {
      staticData = data
      renderStats()
      renderFooter()
    })
    .catch(() => { /* aborted or offline — panels stay in fallback copy */ })

  searchTimer = setTimeout(loadYear, 0)

  // ---- teardown -----------------------------------------------------------

  return {
    destroy() {
      clearTimeout(searchTimer)
      searchSeq++ // orphan any in-flight probe handlers
      extrasSeq++
      if (searchAbort) searchAbort.abort()
      mountAbort.abort()
      if (resizeObs) resizeObs.disconnect()
      track.removeEventListener('pointerdown', onPointerDown)
      track.removeEventListener('pointermove', onPointerMove)
      track.removeEventListener('pointerup', onPointerUp)
      track.removeEventListener('pointercancel', onPointerUp)
      track.removeEventListener('keydown', onKeyDown)
      btnBack.removeEventListener('click', onBack)
      btnFwd.removeEventListener('click', onFwd)
      btnRandom.removeEventListener('click', onRandom)
      topicSel.removeEventListener('change', onTopicChange)
      root.remove()
    },
  }
}
