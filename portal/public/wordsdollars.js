/**
 * OPAX Words per dollar — the site's thesis in one view: per industry, who
 * takes the money and who does the talking.
 *
 * One panel per AEC donor industry that maps onto an enrichment topic. Each
 * panel pairs, party by party, the industry's disclosed donations (AEC
 * disclosures via /graph/money.json) with that party's share of the topic's
 * labelled speeches (live labels via /api/matrix). Comparison, never
 * causation. Plain browser ES module, no dependencies.
 *
 *   import { mountWordsDollars } from '/wordsdollars.js'
 *   const wd = mountWordsDollars(container)   // renders into container
 *   wd.destroy()                              // removes DOM + aborts loads
 *
 * Options: { only: ['gambling'] } renders just those topics' panels, without
 * the cross-industry introduction — a report embeds its own industry's panel
 * under the money map.
 *
 * Data sources (same-origin, fetched in parallel):
 *   GET /api/matrix       labelled, parties, cells {topicSlug: {party: n}},
 *                         totals {topicSlug: labelled-so-far}
 *   GET /graph/money.json donor/party nodes + donor→party edges with totals
 *
 * Honesty rules: both series are floors (AEC threshold + top-250 export on
 * one side, a still-running labelling pass on the other); bars scale within
 * their own series and panel, so only the printed numbers compare across
 * panels or series; bars are bronze/ink, never party colours — party
 * identity is only ever the dot + text chip. Injection safety: all live data
 * reaches the DOM through textContent — never innerHTML.
 */

const MATRIX_URL = '/api/matrix'
const MONEY_URL = '/graph/money.json'
const STYLE_ID = 'wd-styles'

const NUM = new Intl.NumberFormat('en-AU')

/** Mirror of app.js fmtMoney. */
function fmtMoney (n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${n}`
}

// Mirror of app.js TOPICS for the slugs this view pairs (the enrichment
// taxonomy is canonical there).
const TOPICS = {
  'gambling': 'Gambling',
  'financial-services': 'Financial services',
  'mining-energy': 'Mining & energy',
  'property-construction': 'Property & construction',
  'media-communications': 'Media & communications',
  'hospitality-alcohol': 'Hospitality & alcohol',
  'agriculture': 'Agriculture',
  'unions-workplace': 'Unions & workplace',
}

/** How a topic reads as a search seed (mirror of app.js topicPhrase). */
function topicPhrase (slug) {
  return (TOPICS[slug] || slug).toLowerCase().replace(/ & /g, ' and ')
}

/**
 * The explicit industry→topic pairing. `industries` are money.json donor
 * `industry` keys (spellings checked against the export and app.js
 * INDUSTRY_ALIASES); `topic` is the enrichment topic slug; `money` is how
 * the donor side reads in a sentence. Where the taxonomy folds two AEC
 * industries into one debate (alcohol + hospitality; mining + fossil fuels
 * under "Mining & energy") the panel says so. AEC industries with no honest
 * topic counterpart (individual, other, legal, retail, tobacco, lobbying,
 * tech, telecom, pharmacy, health, defence, …) are omitted, not shoehorned.
 */
const PAIRINGS = [
  { topic: 'gambling', industries: ['gambling'], money: 'Gambling' },
  { topic: 'financial-services', industries: ['finance'], money: 'Finance' },
  { topic: 'mining-energy', industries: ['mining', 'fossil_fuels'], money: 'Mining and fossil-fuel' },
  { topic: 'property-construction', industries: ['property'], money: 'Property and construction' },
  { topic: 'media-communications', industries: ['media'], money: 'Media' },
  { topic: 'hospitality-alcohol', industries: ['hospitality', 'alcohol'], money: 'Hospitality and alcohol' },
  { topic: 'agriculture', industries: ['agriculture'], money: 'Agriculture' },
  { topic: 'unions-workplace', industries: ['unions'], money: 'Union' },
]

/**
 * Party names, checked against both sources on 2026-09-01: the matrix party
 * facet and money.json party node labels use the SAME canonical spellings
 * for every party they share (Labor, Liberal, Nationals, Greens, LNP,
 * One Nation, Country Liberal Party, Centre Alliance, Katter's Australian
 * Party, United Australia Party, Family First). No fuzzy matching: names are
 * compared verbatim, and this map is the one place to add a translation if
 * either source ever drifts. 'Independent' exists only on the speech side —
 * the AEC export aggregates party recipients, not independents.
 */
const PARTY_CANON = {
  'Labor': 'Labor', 'Liberal': 'Liberal', 'Nationals': 'Nationals',
  'Greens': 'Greens', 'LNP': 'LNP', 'One Nation': 'One Nation',
  'Country Liberal Party': 'Country Liberal Party',
  'Centre Alliance': 'Centre Alliance',
  "Katter's Australian Party": "Katter's Australian Party",
  'United Australia Party': 'United Australia Party',
  'Family First': 'Family First', 'Independent': 'Independent',
}
const canonParty = (name) => PARTY_CANON[name] ?? name

// Mirror of app.js PARTY_MAP: party label → [dot class, short text label].
// Dots are always redundant with text, never colour alone.
const PARTY_MAP = {
  'labor': ['alp', 'ALP'], 'liberal': ['lib', 'LIB'], 'nationals': ['nat', 'NAT'],
  'lnp': ['lnp', 'LNP'], 'country liberal party': ['nat', 'CLP'],
  'greens': ['grn', 'GRN'], 'one nation': ['onp', 'ONP'], 'independent': ['ind', 'IND'],
  'centre alliance': ['oth', 'CA'], "katter's australian party": ['oth', 'KAP'],
  'united australia party': ['oth', 'UAP'], 'australian democrats': ['oth', 'AD'],
  'family first': ['oth', 'FF'], 'dlp': ['oth', 'DLP'], 'jln': ['oth', 'JLN'],
}

/** Mirror of app.js searchHash — a deep link into the filtered search. */
function searchHash (q, f) {
  const p = new URLSearchParams()
  if (q) p.set('q', q)
  for (const k of ['speaker', 'party', 'state', 'topic', 'from', 'to']) {
    if (f[k]) p.set(k, f[k])
  }
  return `#/search?${p.toString()}`
}

/** Mirror of app.js AEC_NOTE (the disclosure-floor register). */
const AEC_NOTE =
  'AEC disclosure data: donations under the disclosure threshold are not reported ' +
  'and cannot appear here, so totals are a floor, not a ceiling.'

function pctText (share) {
  const pct = Math.round(share * 100)
  return pct === 0 && share > 0 ? '<1%' : `${pct}%`
}

// A topic this thinly labelled gets a volatility warning on its panel.
const FEW_LABELS = 200

// ---------------------------------------------------------------------------
// Styles — .wd- prefix, site tokens with fallbacks, light-only
// ---------------------------------------------------------------------------

const CSS = `
.wd-root {
  /* position: relative anchors the absolutely positioned visually-hidden
     spans (dash cells) so their static positions can never widen the host
     dialog's scroll area — the matrix's 390px lesson. */
  position: relative;
  font-family: var(--sans, 'Public Sans', -apple-system, 'Segoe UI', Roboto, sans-serif);
  color: var(--ink, #23271F);
}
.wd-root :focus-visible { outline: 2px solid var(--bronze-ink, #8A5A12); outline-offset: 2px; }

.wd-intro {
  margin: 0 0 1rem; font-size: 0.875rem; line-height: 1.55;
  color: var(--ink-soft, #575C52); max-width: 62ch;
}
.wd-intro b { color: var(--ink, #23271F); font-variant-numeric: tabular-nums; }
.wd-root a {
  color: inherit; text-decoration: underline;
  text-decoration-color: var(--bronze, #A0761B); text-underline-offset: 2px;
}
.wd-root a:hover { color: var(--bronze-ink, #8A5A12); }

.wd-panels { display: grid; gap: 1rem; }
.wd-panel {
  border: 1px solid var(--line, #DFDCD2); background: var(--paper-raised, #FFFFFF);
  padding: 0.85rem 1rem 0.95rem;
}
.wd-topic { margin: 0 0 0.35rem; font-size: 1rem; line-height: 1.3; }
.wd-topic a { text-decoration-thickness: 1px; }
.wd-lead {
  margin: 0 0 0.7rem; font-size: 0.875rem; line-height: 1.6;
  color: var(--ink-soft, #575C52); max-width: 68ch;
}
.wd-lead b { color: var(--ink, #23271F); font-variant-numeric: tabular-nums; }

.wd-rows {
  display: grid; grid-template-columns: auto 3.1rem minmax(2.5rem, 1fr) auto;
  column-gap: 0.55rem; row-gap: 0.3rem; align-items: center;
  font-size: 0.8125rem;
}
.wd-chip { grid-row: span 2; justify-self: start; }
/* Margin, not padding: the track paints its background into padding. */
.wd-gap { margin-top: 0.55rem; }
.wd-term {
  font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink-faint, #6F7468);
}
.wd-track { position: relative; height: 3px; background: var(--paper-sunken, #F1EFE8); }
.wd-track i { position: absolute; inset: 0 auto 0 0; }
.wd-track-money i { background: var(--bronze, #A0761B); }
.wd-track-speech i { background: var(--ink-soft, #575C52); }
.wd-val {
  justify-self: end; font-variant-numeric: tabular-nums; white-space: nowrap;
  line-height: 1.35;
}
.wd-dash { color: var(--ink-faint, #6F7468); }

.wd-panelnote, .wd-fineprint {
  margin: 0.7rem 0 0; font-size: 0.75rem; line-height: 1.55;
  color: var(--ink-faint, #6F7468);
}
.wd-panelnote { margin-bottom: 0; max-width: 68ch; }
.wd-fineprint a { color: var(--bronze-ink, #8A5A12); }

.wd-status { padding: 1.5rem 0.25rem; font-size: 0.875rem; color: var(--ink-soft, #575C52); }
.wd-btn {
  font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer;
  padding: 0.4rem 0.8rem; margin-left: 0.5rem; border-radius: 2px;
  background: none; border: 1px solid var(--line-strong, #8D897B);
  color: var(--ink-soft, #575C52);
}
.wd-btn:hover { background: var(--paper-sunken, #F1EFE8); }

.wd-visually-hidden {
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
// DOM helpers (all live data goes through textContent — never innerHTML)
// ---------------------------------------------------------------------------

function el (tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

/** The site's party chip: dot + short text label (classes from style.css). */
function partyChip (party) {
  const hit = PARTY_MAP[String(party).toLowerCase()]
  const chip = el('span', `party party-${hit ? hit[0] : 'oth'}`)
  const dot = el('i')
  dot.setAttribute('aria-hidden', 'true')
  chip.append(dot, document.createTextNode(hit ? hit[1] : String(party).slice(0, 12)))
  if (hit) chip.title = party
  return chip
}

// ---------------------------------------------------------------------------
// Data shaping
// ---------------------------------------------------------------------------

/**
 * One panel's worth of numbers: the pairing's donors aggregated per party
 * (verbatim canonical names) beside the topic's matrix cells.
 */
function buildPanel (pairing, matrix, money) {
  const donors = (money.nodes || []).filter(
    (n) => n.kind === 'donor' && pairing.industries.includes(n.industry))
  const donorIds = new Set(donors.map((n) => n.id))
  const moneyByParty = new Map()
  for (const e of money.edges || []) {
    if (!donorIds.has(e.source)) continue
    const party = canonParty(String(e.target).replace(/^party:/, ''))
    moneyByParty.set(party, (moneyByParty.get(party) || 0) + (e.total || 0))
  }
  const moneyTotal = [...moneyByParty.values()].reduce((a, b) => a + b, 0)
  const firstYear = donors.length
    ? Math.min(...donors.map((n) => n.firstYear || 9999)) : null

  // Speech side: only the matrix's major columns are separable; the folded
  // "Other" column is not a party, so it never becomes a row here.
  const majors = (matrix.parties || []).filter((p) => p !== 'Other').map(canonParty)
  const cells = matrix.cells?.[pairing.topic] || {}
  const speechTotal = matrix.totals?.[pairing.topic] ?? 0
  const speechByParty = new Map()
  for (const [party, n] of Object.entries(cells)) {
    if (party !== 'Other') speechByParty.set(canonParty(party), n)
  }

  // Rows: every party with disclosed money from this industry or labelled
  // speeches on this topic. Money desc, then speeches desc, then name.
  const names = [...new Set([...moneyByParty.keys(), ...speechByParty.keys()])]
  names.sort((a, b) =>
    (moneyByParty.get(b) || 0) - (moneyByParty.get(a) || 0) ||
    (speechByParty.get(b) || 0) - (speechByParty.get(a) || 0) ||
    a.localeCompare(b, 'en'))
  const rows = names.map((party) => ({
    party,
    money: moneyByParty.get(party) || 0,
    speeches: speechByParty.get(party) || 0,
    // A non-major party's labels exist but are folded into the matrix's
    // "Other" column — unknown here, which is not the same as zero.
    speechKnown: majors.includes(party),
  }))
  return {
    ...pairing, donors: donors.length, moneyTotal, firstYear,
    speechTotal, rows,
  }
}

// ---------------------------------------------------------------------------
// mountWordsDollars
// ---------------------------------------------------------------------------

export function mountWordsDollars (container, opts = {}) {
  injectStyles()
  const only = Array.isArray(opts.only) && opts.only.length ? new Set(opts.only) : null
  const pairings = only ? PAIRINGS.filter((p) => only.has(p.topic)) : PAIRINGS

  const aborter = new AbortController()

  // ---- static chrome (no data passes through this template) ---------------
  const root = el('section', 'wd-root')
  root.setAttribute('aria-label',
    'Words per dollar: disclosed donations beside each party\'s share of the matching debate')
  root.innerHTML = `
    <p class="wd-intro"></p>
    <div class="wd-status">Adding up the disclosures…</div>
    <div class="wd-panels" hidden></div>
    <p class="wd-fineprint" hidden>Shown together for comparison. OPAX does not
      claim one series causes the other. ${AEC_NOTE} The donor side covers the
      250 largest disclosed donors, aggregated to party recipients, so money to
      independents is not separated. A machine pass is still labelling the
      corpus by subject, so speech counts are floors and shares will settle as
      it runs. Bars scale within their own panel and series: compare the
      numbers, not bar lengths, across panels. Bars are bronze and ink, never
      party colours. <a href="#/money">Money map</a> ·
      <a href="#/methods">Methodology</a></p>
  `

  const introEl = root.querySelector('.wd-intro')
  const statusEl = root.querySelector('.wd-status')
  const panelsEl = root.querySelector('.wd-panels')
  const fineEl = root.querySelector('.wd-fineprint')

  /** money / speech line: term, hairline bar, linked (or dashed) value. */
  function line (row, panel, kind, max, gap) {
    const gapCls = gap ? ' wd-gap' : ''
    const term = el('span', `wd-term${gapCls}`, kind === 'money' ? 'Money' : 'Speech')
    const track = el('span', `wd-track wd-track-${kind}${gapCls}`)
    track.setAttribute('aria-hidden', 'true')
    const cell = el('span', `wd-val${gapCls}`)
    const phrase = topicPhrase(panel.topic)

    if (kind === 'money') {
      if (row.money > 0) {
        track.appendChild(el('i')).style.width =
          `${Math.max((row.money / max) * 100, 1)}%`
        const a = el('a', null, fmtMoney(row.money))
        a.href = `#/subject/topic/${panel.topic}`
        a.title = `${NUM.format(row.money)} dollars disclosed to ${row.party} by ` +
          `${panel.money.toLowerCase()} donors since ${panel.firstYear}. ` +
          'Opens the topic page and its donor list.'
        cell.appendChild(a)
      } else {
        cell.appendChild(el('span', 'wd-dash', '–'))
        cell.title = row.party === 'Independent'
          ? 'The AEC export aggregates party recipients; money to independents is not separated here.'
          : `Nothing disclosed to ${row.party} from these donors in the export.`
        cell.appendChild(el('span', 'wd-visually-hidden', 'none disclosed'))
      }
    } else if (row.speeches > 0 && panel.speechTotal > 0) {
      const share = row.speeches / panel.speechTotal
      track.appendChild(el('i')).style.width =
        `${Math.max((share / max) * 100, 1)}%`
      const a = el('a', null, pctText(share))
      a.href = searchHash(phrase, { topic: panel.topic, party: row.party })
      a.title = `${row.party}: ${NUM.format(row.speeches)} of ` +
        `${NUM.format(panel.speechTotal)} labelled ${phrase} speeches ` +
        `(${pctText(share)}). Opens the filtered search.`
      cell.appendChild(a)
    } else if (row.speechKnown) {
      cell.appendChild(el('span', 'wd-dash', '·'))
      cell.title = `No labelled ${phrase} speeches by ${row.party} yet.`
      cell.appendChild(el('span', 'wd-visually-hidden', 'none yet'))
    } else {
      cell.appendChild(el('span', 'wd-dash', '–'))
      cell.title = 'Smaller parties are not separated in the labelled record yet.'
      cell.appendChild(el('span', 'wd-visually-hidden', 'not separated yet'))
    }
    return [term, track, cell]
  }

  function renderPanel (panel) {
    const section = el('section', 'wd-panel')
    section.setAttribute('aria-label', `${TOPICS[panel.topic]}: money beside words`)
    const phrase = topicPhrase(panel.topic)

    const h = el('h3', 'wd-topic')
    const hLink = el('a', null, TOPICS[panel.topic])
    hLink.href = `#/subject/topic/${panel.topic}`
    h.appendChild(hLink)
    section.appendChild(h)

    // The computed sentence: money total, then the two biggest speech shares.
    const lead = el('p', 'wd-lead')
    lead.append(`${panel.money} interests disclosed `)
    const moneyLink = el('a')
    moneyLink.href = `#/subject/topic/${panel.topic}`
    moneyLink.title = `${NUM.format(panel.moneyTotal)} dollars from ` +
      `${panel.donors} disclosed donors. Opens the topic page and its donor list.`
    moneyLink.appendChild(el('b', null, fmtMoney(panel.moneyTotal)))
    lead.append(moneyLink, ` to parties since ${panel.firstYear}`)
    const top = panel.rows.filter((r) => r.speeches > 0)
      .sort((a, b) => b.speeches - a.speeches).slice(0, 2)
    if (panel.speechTotal > 0 && top.length) {
      lead.append(`; parliament's ${phrase} debate is `)
      top.forEach((r, i) => {
        if (i) lead.append(', ')
        const a = el('a', null,
          `${pctText(r.speeches / panel.speechTotal)} ${r.party}`)
        a.href = searchHash(phrase, { topic: panel.topic, party: r.party })
        a.title = `${NUM.format(r.speeches)} labelled speeches. Opens the filtered search.`
        lead.append(a)
      })
      lead.append(' (of ')
      const nLink = el('a', null, NUM.format(panel.speechTotal))
      nLink.href = searchHash(phrase, { topic: panel.topic })
      nLink.title = `All labelled ${phrase} speeches so far.`
      lead.append(nLink, ' labelled speeches so far).')
    } else if (panel.speechTotal > 0) {
      lead.append(`; none of the ${NUM.format(panel.speechTotal)} labelled ` +
        `${phrase} speeches carry a party label yet.`)
    } else {
      lead.append(`; the labelling pass has not reached the ${phrase} debate yet.`)
    }
    section.appendChild(lead)

    const rowsEl = el('div', 'wd-rows')
    const maxMoney = Math.max(...panel.rows.map((r) => r.money), 1)
    const maxShare = panel.speechTotal > 0
      ? Math.max(...panel.rows.map((r) => r.speeches / panel.speechTotal), 1e-9)
      : 1
    panel.rows.forEach((row, i) => {
      const chip = el('span', 'wd-chip')
      chip.appendChild(partyChip(row.party))
      rowsEl.appendChild(chip)
      rowsEl.append(...line(row, panel, 'money', maxMoney, i > 0))
      rowsEl.append(...line(row, panel, 'speech', maxShare, false))
    })
    section.appendChild(rowsEl)

    if (panel.speechTotal > 0 && panel.speechTotal < FEW_LABELS) {
      section.appendChild(el('p', 'wd-panelnote',
        `Only ${NUM.format(panel.speechTotal)} speeches carry this label so far, ` +
        'so shares are early and will move as the pass runs.'))
    }
    if (panel.industries.length > 1) {
      section.appendChild(el('p', 'wd-panelnote',
        `The donor side combines two AEC industry groups (${panel.industries
          .map((i) => i.replace(/_/g, ' ')).join(' and ')}) that both belong to this debate.`))
    }
    return section
  }

  async function load () {
    statusEl.hidden = false
    statusEl.textContent = 'Adding up the disclosures…'
    panelsEl.hidden = true
    fineEl.hidden = true
    try {
      const [matrix, money] = await Promise.all([MATRIX_URL, MONEY_URL].map(
        async (u) => {
          const res = await fetch(u, { signal: aborter.signal })
          if (!res.ok) throw new Error(`${u} → ${res.status}`)
          return res.json()
        }))

      const panels = pairings.map((p) => buildPanel(p, matrix, money))
        .filter((p) => p.moneyTotal > 0)
        .sort((a, b) => b.moneyTotal - a.moneyTotal)
      const grand = panels.reduce((a, p) => a + p.moneyTotal, 0)

      introEl.textContent = ''
      introEl.hidden = Boolean(only) // a single embedded panel carries its own lead
      if (!only) {
        const grandLink = el('a')
        grandLink.href = '#/money'
        grandLink.title = 'Opens the money map.'
        grandLink.appendChild(el('b', null, fmtMoney(grand)))
        introEl.append(
          'Where an AEC donor industry maps onto a debate in the topic taxonomy, ',
          'this view puts the two side by side: ', grandLink,
          ` in disclosed donations across ${panels.length} industries, beside each ` +
          'party\'s share of the matching debate in the labelled record. ' +
          'Every number opens the disclosures or speeches behind it.')
      }

      panelsEl.textContent = ''
      for (const panel of panels) panelsEl.appendChild(renderPanel(panel))
      statusEl.hidden = true
      panelsEl.hidden = false
      fineEl.hidden = false
    } catch (err) {
      if (aborter.signal.aborted) return
      statusEl.hidden = false
      statusEl.textContent = 'The view could not be loaded.'
      const retry = el('button', 'wd-btn', 'Try again')
      retry.type = 'button'
      retry.addEventListener('click', load)
      statusEl.appendChild(retry)
    }
  }

  // Every number links out (topic page, filtered search, money map); the
  // destination should be visible, so a link click closes the host dialog,
  // the way the nav drawer closes on its own links.
  root.addEventListener('click', (e) => {
    if (!e.target.closest('a')) return
    const host = root.closest('dialog')
    if (host && host.open) host.close()
  })

  container.appendChild(root)
  load()

  let destroyed = false
  return {
    destroy () {
      if (destroyed) return
      destroyed = true
      aborter.abort()
      root.remove()
    },
  }
}
