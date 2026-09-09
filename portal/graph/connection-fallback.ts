import type { MoneyGraph, MoneyMapHandle, MoneyMapOptions, MoneyScene } from './index.ts'
import { windowFigures } from './index.ts'
import { filterMoneyEdges, readMoneyFilters, type MoneyFilters } from '../public/money-records.js'
import { formatMoney } from './map-types.ts'

/** The fallback uses the same directed edges and year windows as the 3D scene. */
export function connectionRows(data: MoneyGraph, scene?: MoneyScene, group?: string | null) {
  const nodes = new Map(data.nodes.map(node => [node.id, node]))
  const pairs = scene?.edges ? new Set(scene.edges.map(edge => JSON.stringify([edge.source, edge.target]))) : null
  return data.edges.filter(edge => {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) return false
    if (pairs) return pairs.has(JSON.stringify([edge.source, edge.target]))
    if (scene) return edge.source === scene.focusId || edge.target === scene.focusId
    return !group || [nodes.get(edge.source), nodes.get(edge.target)].some(node => node?.group === group || node?.industry === group)
  }).map(edge => scene ? windowFigures(edge, scene.from ?? -Infinity, scene.to ?? Infinity) : edge)
    .filter(edge => Number.isFinite(edge.total) && edge.total > 0)
    .sort((a, b) => b.total - a.total)
}

/** A readable, keyboard-accessible graph when this device cannot create WebGL 2. */
export function mountConnectionFallback(container: HTMLElement, data: MoneyGraph, options: MoneyMapOptions = {}): MoneyMapHandle {
  const root = document.createElement('div')
  root.className = 'mm-connections'
  root.setAttribute('role', 'region')
  root.setAttribute('aria-label', 'Money connections')
  container.append(root)
  const nodes = new Map(data.nodes.map(node => [node.id, node]))
  let current: MoneyScene | undefined = options.focus ? { focusId: options.focus } : undefined
  let route = options.chrome !== 'mini' && typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
  let filters: MoneyFilters = options.filters || readMoneyFilters(route)
  const years = data.edges.flatMap(e => [e.firstYear, e.lastYear]).filter((n): n is number => typeof n === 'number')
  const yearMin = years.length ? Math.min(...years) : -Infinity, yearMax = years.length ? Math.max(...years) : Infinity
  const period = () => {
    const read = (key: string, fallback: number) => /^\d{4}$/.test(route.get(key) || '') ? Math.max(yearMin, Math.min(yearMax, Number(route.get(key)))) : fallback
    const from = current?.from ?? read('from', yearMin), to = current?.to ?? read('to', yearMax)
    return { from: Math.min(from, to), to: Math.max(from, to), cpi: route.get('cpi') === '1' }
  }
  let group: string | null = filters.industry || null
  let destroyed = false
  const add = (tag: string, parent: HTMLElement, value?: string) => {
    const node = document.createElement(tag)
    if (value !== undefined) node.textContent = value
    parent.append(node)
    return node
  }
  function render() {
    if (destroyed) return
    root.replaceChildren()
    add('p', root, 'Connections · 2D view').className = 'mm-connections-title'
    add('p', root, 'Showing a lighter map for this browser.').className = 'mm-connections-note'
    const window = period()
    const windowed = { ...data, edges: data.edges.map(e => windowFigures(e, window.from, window.to, window.cpi)).filter(e => e.byYear || (e.firstYear ?? yearMin) <= window.to && (e.lastYear ?? yearMax) >= window.from) }
    const rows = filterMoneyEdges({ ...data, edges: connectionRows({ ...windowed, edges: windowed.edges.map(e => ({ ...e, byYear: undefined })) }, current ? { ...current, from: undefined, to: undefined } : undefined, group) }, filters)
    const ids = new Set(rows.flatMap(e => [e.source, e.target]))
    options.onViewChange?.({ ...data, nodes: data.nodes.filter(n => ids.has(n.id)), edges: rows }, { ...filters, industry: group || '' }, window)
    const shown = rows.slice(0, 24)
    if (!shown.length) add('p', root, 'No recorded connections in this view.')
    const list = add('ul', root)
    const maximum = Math.max(1, ...shown.map(edge => edge.total))
    for (const edge of shown) {
      const row = add('li', list)
      const labels = add('div', row)
      labels.className = 'mm-connection-names'
      for (const [index, id] of [edge.source, edge.target].entries()) {
        if (index) { const arrow = add('span', labels, '→'); arrow.setAttribute('aria-label', 'to') }
        const node = nodes.get(id)!
        const button = add('button', labels) as HTMLButtonElement
        button.type = 'button'
        const dot = add('i', button)
        dot.setAttribute('aria-hidden', 'true')
        dot.style.background = /^#[0-9a-f]{6}$/i.test(node.colour ?? '') ? node.colour! : '#53788c'
        add('span', button, node.label)
        if (node.profileUrl && /^\/subject\/(agency|supplier)\//.test(node.profileUrl)) {
          const link = add('a', row, `Open ${node.label} profile`) as HTMLAnchorElement
          link.href = node.profileUrl
        }
        button.addEventListener('click', () => {
          options.onInteract?.()
          current = { focusId: id }
          render()
          options.onSelect?.(node)
        })
      }
      add('strong', row, formatMoney(edge.total))
      const track = add('div', row)
      track.className = 'mm-connection-bar'
      track.setAttribute('aria-hidden', 'true')
      add('span', track).style.width = `${100 * edge.total / maximum}%`
    }
    if (rows.length > shown.length) add('p', root, `Showing the ${shown.length} largest of ${rows.length} connections. Choose a recipient or tap a name to explore.`)
  }
  render()
  return {
    setFilters: (value, nextRoute) => { if (nextRoute) route = nextRoute; current = undefined; filters = { ...value }; group = value.industry || null; render() },
    presentScene: scene => {
      if (destroyed || !nodes.has(scene.focusId)) return false
      current = scene
      route = new URLSearchParams()
      filters = {}
      group = null
      render()
      root.scrollTop = 0
      return true
    },
    clearScene: () => { route = new URLSearchParams(); current = undefined; group = null; filters = {}; render() },
    select: id => { current = id ? { focusId: id } : undefined; render() },
    isolate: value => { group = value; current = undefined; render() },
    fit: () => { current = undefined; group = null; render() },
    pauseScene: () => {},
    setPaused: () => {},
    destroy: () => { destroyed = true; root.remove(); container.classList.remove('mm-root') },
  }
}
