/**
 * OPAX Matrix — who owns which debate: party share of every labelled topic.
 *
 * A party × topic table over the live enrichment labels. Rows are the 21
 * taxonomy topics (linking to their topic pages), columns the biggest
 * parties; each cell is that party's share of the topic's labelled speeches
 * and links to the filtered search that proves it. Plain browser ES module,
 * no dependencies.
 *
 *   import { mountMatrix } from '/matrix.js'
 *   const mx = mountMatrix(container)   // renders into container
 *   mx.destroy()                        // removes DOM + aborts loads
 *
 * Data source (same-origin): GET /api/matrix
 *   labelled: speeches carrying any topic label (the honest denominator)
 *   parties:  column order, biggest first, long tail folded into "Other"
 *   cells:    {topicSlug: {party: count}}
 *   totals:   {topicSlug: labelled-so-far count} — filtered totals, never
 *             facet sums, so a multi-label speech counts once per row
 *
 * Honesty rules: the labelling pass is still running, so every number is a
 * floor; shares are row-normalised (raw counts would just mirror party
 * size); speeches without a party label mean rows need not sum to 100%.
 * Shading is bronze intensity, never party colour — party identity is only
 * ever the dot + text chip.
 */

const DATA_URL = '/api/matrix'
const STYLE_ID = 'mx-styles'

const NUM = new Intl.NumberFormat('en-AU')

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

/** How a topic reads as a search seed (mirror of app.js topicPhrase). */
function topicPhrase (slug) {
  if (slug === 'indigenous-affairs') return 'Indigenous affairs'
  return (TOPICS[slug] || slug).toLowerCase().replace(/ & /g, ' and ')
}

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

// Bronze at full strength is rgb(160, 118, 27) (site --bronze); cells scale
// its alpha with share. Capped so ink text stays readable on the deepest wash.
function shadeFor (share) {
  const a = Math.min(0.72, share * 0.9)
  return a < 0.01 ? 'transparent' : `rgba(160, 118, 27, ${a.toFixed(3)})`
}

function pctText (share) {
  const pct = Math.round(share * 100)
  return pct === 0 && share > 0 ? '<1%' : `${pct}%`
}

// ---------------------------------------------------------------------------
// Styles — .mx- prefix, site tokens with fallbacks, light-only
// ---------------------------------------------------------------------------

const CSS = `
.mx-root {
  font-family: var(--sans, 'Public Sans', -apple-system, 'Segoe UI', Roboto, sans-serif);
  color: var(--ink, #23271F);
}
.mx-root :focus-visible { outline: 2px solid var(--bronze-ink, #8A5A12); outline-offset: 2px; }

.mx-intro {
  margin: 0 0 0.75rem; font-size: 0.875rem; line-height: 1.55;
  color: var(--ink-soft, #575C52);
}
.mx-intro b { color: var(--ink, #23271F); font-variant-numeric: tabular-nums; }

.mx-tablewrap {
  /* position: relative keeps the absolutely positioned visually-hidden
     spans in zero cells inside this clip; without it their static
     positions widen the host dialog's scroll area. */
  position: relative; overflow: auto; max-height: min(65vh, 850px);
  border: 1px solid var(--line-strong, #8D897B);
  background: var(--paper-raised, #FFFFFF);
}
.mx-table {
  border-collapse: collapse; width: 100%; min-width: 640px;
  font-size: 0.8125rem; line-height: 1.4;
}
.mx-table thead th {
  position: sticky; top: 0; z-index: 2;
  background: var(--paper-sunken, #F1EFE8);
  border-bottom: 1px solid var(--line-strong, #8D897B);
  padding: 0.5rem 0.5rem; text-align: right; white-space: nowrap;
  font-size: 0.75rem; font-weight: 700; color: var(--ink-soft, #575C52);
}
.mx-table thead th.mx-th-topic { text-align: left; }
.mx-table td, .mx-table tbody th {
  padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--line, #DFDCD2);
  text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.mx-table tbody th.mx-td-topic {
  text-align: left; white-space: normal; font-weight: 600;
}
.mx-table tbody tr:hover td, .mx-table tbody tr:hover th {
  box-shadow: inset 0 0 0 99em rgba(20, 42, 67, 0.04);
}

.mx-table a {
  color: inherit; text-decoration: underline;
  text-decoration-color: var(--bronze, #A0761B); text-underline-offset: 2px;
}
.mx-table a:hover { color: var(--bronze-ink, #8A5A12); }
.mx-cell a { display: block; text-decoration: none; }
.mx-cell a:hover { text-decoration: underline; }

.mx-count { color: var(--ink-faint, #6F7468); }
.mx-zero { color: var(--ink-faint, #6F7468); }
.mx-dim td { color: var(--ink-faint, #6F7468); }
.mx-dim .mx-notyet { text-align: left; font-style: italic; white-space: normal; }

.mx-status { padding: 1.5rem 0.75rem; font-size: 0.875rem; color: var(--ink-soft, #575C52); }
.mx-btn {
  font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer;
  padding: 0.4rem 0.8rem; margin-left: 0.5rem; border-radius: 2px;
  background: none; border: 1px solid var(--line-strong, #8D897B);
  color: var(--ink-soft, #575C52);
}
.mx-btn:hover { background: var(--paper-sunken, #F1EFE8); }

.mx-fineprint {
  margin: 0.6rem 0 0; font-size: 0.75rem; line-height: 1.55;
  color: var(--ink-faint, #6F7468);
}
.mx-fineprint a { color: var(--bronze-ink, #8A5A12); }

.mx-visually-hidden {
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
// mountMatrix
// ---------------------------------------------------------------------------

export function mountMatrix (container) {
  injectStyles()

  const aborter = new AbortController()

  // ---- static chrome (no data passes through this template) ---------------
  const root = el('section', 'mx-root')
  root.setAttribute('aria-label', 'Who owns which debate: party share of each labelled topic')
  root.innerHTML = `
    <p class="mx-intro"></p>
    <div class="mx-tablewrap" role="region" tabindex="0"
         aria-label="Party by topic matrix (scrollable)">
      <div class="mx-status">Counting the labelled record…</div>
      <table class="mx-table" hidden>
        <caption class="mx-visually-hidden">Each party's share of the labelled
          speeches on each topic. Topic names open topic pages; shares open the
          filtered search.</caption>
        <thead><tr></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <p class="mx-fineprint">A machine pass is still labelling the corpus by
      subject, so every number here is a floor and shares will settle as it
      runs. Shares are of each topic's labelled speeches; some speeches carry
      no party label, so rows need not sum to 100%. Raw counts sit behind each
      cell (hover or long-press). Cell shading tracks share, not any party's
      colour. <a href="#/methods">Methodology</a></p>
  `

  const introEl = root.querySelector('.mx-intro')
  const statusEl = root.querySelector('.mx-status')
  const tableEl = root.querySelector('.mx-table')
  const headRow = root.querySelector('thead tr')
  const bodyEl = root.querySelector('tbody')

  function renderHead (parties) {
    headRow.textContent = ''
    const topicTh = el('th', 'mx-th-topic', 'Debate')
    topicTh.scope = 'col'
    headRow.appendChild(topicTh)
    const nTh = el('th', null, 'Labelled')
    nTh.scope = 'col'
    nTh.title = 'Speeches carrying this topic label so far'
    headRow.appendChild(nTh)
    for (const party of parties) {
      const th = el('th')
      th.scope = 'col'
      if (party === 'Other') th.appendChild(el('span', 'mx-count', 'Other'))
      else th.appendChild(partyChip(party))
      headRow.appendChild(th)
    }
  }

  function renderBody (data) {
    const { parties, cells, totals } = data
    const slugs = Object.keys(TOPICS)
      .sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0) ||
        TOPICS[a].localeCompare(TOPICS[b], 'en'))

    const frag = document.createDocumentFragment()
    for (const slug of slugs) {
      const name = TOPICS[slug]
      const total = totals[slug] ?? 0
      const tr = document.createElement('tr')

      const topicTd = el('th', 'mx-td-topic')
      topicTd.scope = 'row'
      const topicLink = el('a', null, name)
      topicLink.href = `#/subject/topic/${slug}`
      topicTd.appendChild(topicLink)
      tr.appendChild(topicTd)

      if (total === 0) {
        tr.className = 'mx-dim'
        tr.appendChild(el('td', 'mx-count', '0'))
        const td = el('td', 'mx-notyet', 'The labelling pass has not reached this debate yet.')
        td.colSpan = parties.length
        tr.appendChild(td)
        frag.appendChild(tr)
        continue
      }

      tr.appendChild(el('td', 'mx-count', NUM.format(total)))
      const row = cells[slug] || {}
      for (const party of parties) {
        const n = row[party] ?? 0
        const td = el('td', 'mx-cell')
        if (n === 0) {
          td.appendChild(el('span', 'mx-zero', '·'))
          td.title = party === 'Other'
            ? `No labelled ${name} speeches by other parties yet`
            : `No labelled ${name} speeches by ${party} yet`
          const sr = el('span', 'mx-visually-hidden', 'none yet')
          td.appendChild(sr)
        } else {
          const share = n / total
          td.style.background = shadeFor(share)
          const detail = `${NUM.format(n)} of ${NUM.format(total)} labelled ${name} speeches (${pctText(share)})`
          if (party === 'Other') {
            const span = el('span', null, pctText(share))
            td.appendChild(span)
            td.title = `Smaller parties: ${detail}`
          } else {
            const a = el('a', null, pctText(share))
            a.href = searchHash(topicPhrase(slug), { topic: slug, party })
            a.title = `${party}: ${detail}. Opens the filtered search.`
            td.appendChild(a)
          }
        }
        tr.appendChild(td)
      }
      frag.appendChild(tr)
    }
    bodyEl.textContent = ''
    bodyEl.appendChild(frag)
  }

  async function load () {
    statusEl.hidden = false
    statusEl.textContent = 'Counting the labelled record…'
    tableEl.hidden = true
    try {
      const res = await fetch(DATA_URL, { signal: aborter.signal })
      if (!res.ok) throw new Error(`${DATA_URL} → ${res.status}`)
      const data = await res.json()
      introEl.textContent = ''
      introEl.appendChild(el('b', null, NUM.format(data.labelled ?? 0)))
      introEl.appendChild(document.createTextNode(
        ' speeches carry topic labels so far. Each cell is that party\'s share of a ' +
        'debate\'s labelled speeches: read down a column for what a party talks about, ' +
        'across a row for who owns the debate. Every share links to the speeches behind it.'))
      renderHead(data.parties || [])
      renderBody(data)
      statusEl.hidden = true
      tableEl.hidden = false
    } catch (err) {
      if (aborter.signal.aborted) return
      statusEl.hidden = false
      statusEl.textContent = 'The matrix could not be loaded.'
      const retry = el('button', 'mx-btn', 'Try again')
      retry.type = 'button'
      retry.addEventListener('click', load)
      statusEl.appendChild(retry)
    }
  }

  // Every cell and row name links out (topic page, filtered search); the
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
