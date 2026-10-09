/**
 * OPAX news rail — "In the news right now": live Australian-politics headlines
 * that pivot into the parliamentary record.
 *
 * Plain browser ES module, no dependencies, no build step.
 *
 *   import { mountNewsRail } from '/newsrail.js'
 *   const rail = mountNewsRail(container, { limit: 6 })
 *   rail.destroy()  // removes DOM + aborts any in-flight fetch
 *
 * Data source (same-origin): GET /api/news — the Worker fetches and parses the
 * RSS feeds server-side and hands back {items:[{title,url,source,published,topic}]}.
 *
 * Honesty rule: the headlines are the outlets' work, linked out with credit.
 * OPAX only supplies the pivot — what the parliamentary record says about the
 * same topic. If the feed is down or empty the rail renders nothing at all.
 */

const STYLE_ID = 'nr-styles'

const CSS = `
.nr-root {
  font: var(--type-body);
  color: var(--ink);
}
.nr-title {
  font: var(--type-heading);
  margin: 0 0 var(--space-heading); color: var(--ink);
}
/* One list, rows split by hairlines: no card per headline. */
.nr-list {
  list-style: none; margin: 0; padding: 0;
  border-top: var(--border-hairline) solid var(--divider-default);
}
.nr-card {
  padding: var(--space-row) 0;
  border-bottom: var(--border-hairline) solid var(--divider-subtle);
}
.nr-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-tight);
  font: var(--type-fine); color: var(--ink-soft);
  margin-bottom: var(--space-line);
}
.nr-headline {
  font: var(--type-subheading);
  margin: 0 0 var(--space-tight);
}
.nr-headline a {
  color: var(--ink); text-decoration: none;
}
.nr-headline a:hover, .nr-headline a:focus-visible {
  color: var(--bronze-ink); text-decoration: underline;
  text-decoration-color: var(--bronze-rule); text-underline-offset: 3px;
}
.nr-actions { display: flex; flex-wrap: wrap; gap: var(--space-line) var(--space-block); }
.nr-pivot {
  display: inline-flex; align-items: center; min-height: var(--size-target);
  font: var(--type-label);
  color: var(--bronze-ink); text-decoration: underline;
  text-decoration-color: var(--bronze-rule); text-underline-offset: 3px; text-decoration-thickness: 1px;
}
.nr-pivot:hover, .nr-pivot:focus-visible { text-decoration-color: var(--bronze-ink); }
.nr-fineprint {
  margin: var(--space-row) 0 0; font: var(--type-fine);
  color: var(--ink-soft);
}
/* Loading: layout-stable bars, no motion. */
.nr-skeleton {
  padding: var(--space-row) 0;
  border-bottom: var(--border-hairline) solid var(--divider-subtle);
}
.nr-skeleton .nr-bone {
  height: 0.75rem; border-radius: var(--radius-sm);
  background: var(--paper-sunken);
  margin-bottom: var(--space-tight);
}
.nr-skeleton .nr-bone:first-child { width: 30%; }
.nr-skeleton .nr-bone:last-child { width: 85%; margin-bottom: 0; }
`

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/** "3 h ago" — coarse on purpose; a news rail needs freshness, not precision. */
function relativeTime(iso) {
  if (!iso) return ''
  const ms = Date.now() - Date.parse(iso)
  if (Number.isNaN(ms) || ms < 0) return ''
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function renderItems(root, items) {
  const list = el('ul', 'nr-list')
  for (const item of items) {
    const card = el('li', 'nr-card')

    const meta = el('div', 'nr-meta')
    meta.appendChild(el('span', 'ui-tag nr-source', item.source))
    const when = relativeTime(item.published)
    if (when) meta.appendChild(el('span', '', when))
    card.appendChild(meta)

    const headline = el('h3', 'nr-headline')
    const link = el('a', '', item.title)
    link.href = item.url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    card.appendChild(headline)
    headline.appendChild(link)

    // The pivots are plain hash anchors: clicking one sets location.hash, the
    // router takes over, and keyboard/middle-click behave like real links.
    const topic = item.topic || item.title
    const actions = el('div', 'nr-actions')
    const ask = el('a', 'nr-pivot', 'What does the record say?')
    ask.href = `#/ask?q=${encodeURIComponent(`What has parliament said about ${topic}?`)}`
    ask.setAttribute('aria-label', `What does the parliamentary record say about: ${item.title}`)
    const search = el('a', 'nr-pivot', 'Search speeches')
    search.href = `#/search?q=${encodeURIComponent(topic)}`
    search.setAttribute('aria-label', `Search speeches about: ${item.title}`)
    actions.appendChild(ask)
    actions.appendChild(search)
    card.appendChild(actions)

    list.appendChild(card)
  }
  root.appendChild(list)
  root.appendChild(
    el(
      'p',
      'nr-fineprint',
      'Headlines from ABC News and The Guardian. The answers come from the parliamentary record; OPAX does not write news.',
    ),
  )
}

export function mountNewsRail(container, { limit = 6 } = {}) {
  injectStyles()

  const root = el('section', 'nr-root')
  root.setAttribute('aria-label', 'In the news right now')
  root.appendChild(el('h2', 'nr-title', 'In the news right now'))

  // Loading skeleton — static blocks, no motion needed.
  const skeletons = el('div')
  for (let i = 0; i < Math.min(limit, 3); i++) {
    const sk = el('div', 'nr-skeleton')
    sk.setAttribute('aria-hidden', 'true')
    sk.appendChild(el('div', 'nr-bone'))
    sk.appendChild(el('div', 'nr-bone'))
    sk.appendChild(el('div', 'nr-bone'))
    skeletons.appendChild(sk)
  }
  root.appendChild(skeletons)
  container.appendChild(root)

  const ac = new AbortController()
  ;(async () => {
    let items = []
    try {
      const res = await fetch('/api/news', { signal: ac.signal })
      if (res.ok) items = (await res.json())?.items ?? []
    } catch {
      /* silent — the empty state below handles it */
    }
    if (ac.signal.aborted) return
    skeletons.remove()
    items = items.filter((it) => it && it.title && it.url).slice(0, limit)
    if (!items.length) {
      // Silent empty state: no headlines means no rail at all.
      root.remove()
      return
    }
    renderItems(root, items)
  })()

  return {
    destroy() {
      ac.abort()
      root.remove()
    },
  }
}
