/**
 * OPAX Tide — topic share across the four speech-date decade labels.
 * Plain browser ES module; all data and navigation stay same-origin.
 *
 * Data source: GET /api/tide?scope=federal|all
 * Every bar is topic count / speeches carrying any topic label in that
 * decade. The coverage engraving keeps the unfinished labelling pass visible.
 */

const NUM = new Intl.NumberFormat('en-AU')

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

export function mountTide (container, options = {}) {
  const topics = options.topics || {}
  const topicPhrase = options.topicPhrase || ((slug) => String(topics[slug] || slug).toLowerCase())
  const searchHash = options.searchHash || ((query) => `/search?q=${encodeURIComponent(query)}`)
  const subjectHash = options.subjectHash || ((_kind, slug) => `/subject/topic/${encodeURIComponent(slug)}`)
  const coverageRuleHTML = options.coverageRuleHTML || (() => '')
  const cache = new Map()
  let scope = 'federal'
  let order = 'rising'
  let controller = null
  let destroyed = false

  container.innerHTML = `
    <div class="tide-shell">
      <h1>The tide</h1>
      <p class="tide-lede">How parliament's labelled debates move across four decades. Shares compare each topic with the labelled speech record held for that decade, never with the whole corpus.</p>
      <div class="tide-controls">
        <div class="tide-control"><span>Parliaments</span><div class="quiet-toggle" role="group" aria-label="Parliaments included">
          <button type="button" data-tide-scope="federal" aria-pressed="true">Federal</button>
          <button type="button" data-tide-scope="all" aria-pressed="false">All five</button>
        </div></div>
        <div class="tide-control"><span>Order</span><div class="quiet-toggle" role="group" aria-label="Sort the topics">
          <button type="button" data-tide-order="rising" aria-pressed="true">Rising</button>
          <button type="button" data-tide-order="fading" aria-pressed="false">Fading</button>
          <button type="button" data-tide-order="now" aria-pressed="false">Biggest now</button>
        </div></div>
      </div>
      <div class="tide-status status" role="status"></div>
      <div class="tide-view"></div>
    </div>`

  const status = container.querySelector('.tide-status')
  const view = container.querySelector('.tide-view')

  const setPressed = (name, value) => {
    for (const button of container.querySelectorAll(`[data-tide-${name}]`)) {
      button.setAttribute('aria-pressed', String(button.dataset[`tide${name[0].toUpperCase()}${name.slice(1)}`] === value))
    }
  }

  const metric = (series) => {
    const shares = series.map((point) => Number(point.share) || 0)
    const change = (shares.at(-1) || 0) - (shares[0] || 0)
    return { change, now: shares.at(-1) || 0 }
  }

  const paint = (data) => {
    if (destroyed) return
    const rows = Object.keys(topics).map((slug) => ({
      slug,
      name: topics[slug],
      series: data.topics?.[slug] || [],
    }))
    rows.sort((a, b) => {
      const am = metric(a.series), bm = metric(b.series)
      const n = order === 'fading' ? am.change - bm.change
        : order === 'now' ? bm.now - am.now
          : bm.change - am.change
      return n || a.name.localeCompare(b.name)
    })
    const max = Math.max(0.0001, ...rows.flatMap((row) => row.series.map((point) => Number(point.share) || 0)))
    const decadeBySlug = new Map((data.decades || []).map((decade) => [decade.slug, decade]))
    const decadeHead = (data.decades || []).map((decade) => `<span>${esc(decade.label)}</span>`).join('')
    const body = rows.map((row) => {
      const m = metric(row.series)
      const shown = order === 'now'
        ? `${(m.now * 100).toFixed(1)}%`
        : `${m.change >= 0 ? '+' : '−'}${Math.abs(m.change * 100).toFixed(1)} pp`
      const bars = row.series.map((point) => {
        const decade = decadeBySlug.get(point.decade)
        if (!decade) return ''
        const share = Number(point.share) || 0
        const pct = `${(share * 100).toFixed(1)}%`
        return `<a class="tide-decade" href="${esc(searchHash(topicPhrase(row.slug), {
          topic: row.slug, from: String(decade.from), to: String(decade.to),
        }))}" title="${esc(`${row.name}, ${decade.label}: ${pct}, ${NUM.format(point.count || 0)} labelled speeches`)}"
          aria-label="${esc(`${row.name}, ${decade.label}: ${pct}. Open ${NUM.format(point.count || 0)} labelled speeches`)}">
          <i aria-hidden="true" style="height:${Math.max(1.5, (share / max) * 100).toFixed(2)}%"></i>
        </a>`
      }).join('')
      return `<li class="tide-row">
        <a class="tide-topic" href="${esc(subjectHash('topic', row.slug))}">${esc(row.name)}</a>
        <span class="tide-quartet">${bars}</span><strong>${shown}</strong>
      </li>`
    }).join('')
    const scopeWords = scope === 'federal' ? 'Federal parliament' : 'all five parliaments'
    view.innerHTML = `
      <div class="tide-column-head" aria-hidden="true"><span></span><span>${decadeHead}</span><span>${order === 'now' ? 'Now' : 'Change'}</span></div>
      <ol class="tide-list">${body}</ol>
      ${coverageRuleHTML(data.decades)}
      <p class="fineprint">Each bar is a topic's share of speeches carrying any topic label in that decade for ${scopeWords}. Each bar opens the speeches behind it. Labels are applied so far; the coverage rule shows how much of the indexed speech record has been reached. Federal is the default because it has the longest comparable run. <a href="/methods">How the record is built</a></p>`
  }

  const load = async () => {
    status.textContent = 'Counting the labelled record by decade…'
    // Paper placeholder rows in the shape of the list, so the dialog never
    // stands empty while the decades are counted (see .chart-skeleton).
    view.innerHTML = `<ol class="tide-list chart-skeleton" aria-hidden="true">${Array.from({ length: 6 }, () => `
      <li><i class="sk-name"></i><span class="sk-bars"><i style="height:78%"></i><i style="height:52%"></i><i style="height:36%"></i><i style="height:24%"></i></span></li>`).join('')}</ol>`
    controller?.abort()
    controller = new AbortController()
    const wanted = scope
    try {
      let data = cache.get(wanted)
      if (!data) {
        const response = await fetch(`/api/tide?scope=${wanted}`, { signal: controller.signal })
        data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
        cache.set(wanted, data)
      }
      if (destroyed || wanted !== scope) return
      status.textContent = ''
      paint(data)
    } catch (error) {
      if (error.name === 'AbortError' || destroyed) return
      status.textContent = 'The decade view could not be loaded. Try again shortly.'
    }
  }

  for (const button of container.querySelectorAll('[data-tide-scope]')) {
    button.addEventListener('click', () => {
      if (button.dataset.tideScope === scope) return
      scope = button.dataset.tideScope
      setPressed('scope', scope)
      load()
    })
  }
  for (const button of container.querySelectorAll('[data-tide-order]')) {
    button.addEventListener('click', () => {
      if (button.dataset.tideOrder === order) return
      order = button.dataset.tideOrder
      setPressed('order', order)
      const data = cache.get(scope)
      if (data) paint(data)
    })
  }

  load()
  return {
    destroy () {
      destroyed = true
      controller?.abort()
      container.replaceChildren()
    },
  }
}
