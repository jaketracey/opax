import type { MoneyGraph, MoneyMapHandle, MoneyMapOptions, MoneyScene } from './index.ts'
import { windowFigures } from './index.ts'
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
  let group: string | null = null
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
    const rows = connectionRows(data, current, group)
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
        button.addEventListener('click', () => {
          options.onInteract?.()
          current = { focusId: id }
          render()
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
    presentScene: scene => {
      if (destroyed || !nodes.has(scene.focusId)) return false
      current = scene
      group = null
      render()
      root.scrollTop = 0
      return true
    },
    clearScene: () => { current = undefined; group = null; render() },
    select: id => { current = id ? { focusId: id } : undefined; render() },
    isolate: value => { group = value; current = undefined; render() },
    fit: () => { current = undefined; group = null; render() },
    pauseScene: () => {},
    setPaused: () => {},
    destroy: () => { destroyed = true; root.remove(); container.classList.remove('mm-root') },
  }
}
