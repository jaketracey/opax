export const SEARCH_SORTS = new Set(['relevance', 'newest', 'oldest', 'title_asc', 'title_desc', 'type'])
type SortableRecord = { title?: string; kind?: string; speaker?: string | null; href?: string; date?: string | null; sort_date?: string; score?: number; slug?: string }
const textOrder = new Intl.Collator('en-AU', { sensitivity: 'base', numeric: true })
// Match the visible document heading, which omits repeated speaker/date metadata.
export function searchSortTitle(row: SortableRecord): string {
  if (row.href) return row.title || ''
  if (row.speaker && row.title === `${row.speaker} — ${row.date}`) return `Speech by ${row.speaker}`
  const key = (s: string) => s.replace(/\s+/g,' ').trim().toLowerCase()
  const parts = (row.title || '').trim().split(/(\s+—\s+)/)
  if (row.speaker && key(parts[0]) === key(row.speaker)) parts.splice(0,2)
  const iso = (row.date || '').slice(0,10)
  const dates = [iso]
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y,m,d] = iso.split('-').map(Number)
    dates.push(`${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]} ${y}`)
  }
  if (parts.length && dates.filter(Boolean).map(key).includes(key(parts.at(-1)!))) parts.splice(-2)
  return parts.join('').trim() || row.title || row.slug || ''
}
const kindLabels: Record<string,string> = { person:'People', party:'Political parties', agency:'Government agencies', donor:'Donors', receipt:'Political receipts', supplier:'Suppliers', contract:'Government contracts', grant:'Grants', interest:'Declared interests', expense:'Parliamentary expenses', access:'Meetings and lobbying registers', campaigner:'Campaigners and associated entities', bill:'Bills', speech:'Speeches and hearings', division:'Divisions', press_release:'Government transcripts and releases', report:'Research reports' }
export function compareSearchResults(a: SortableRecord, b: SortableRecord, sort: string): number {
  const fallback = (b.score || 0) - (a.score || 0) || textOrder.compare(a.slug || '', b.slug || '')
  if (sort === 'newest' || sort === 'oldest') {
    const ad = a.date || a.sort_date || '', bd = b.date || b.sort_date || ''
    // An unknown date belongs at the end in both directions.
    if (!ad || !bd) return ad ? -1 : bd ? 1 : fallback
    return (sort === 'oldest' ? ad.localeCompare(bd) : bd.localeCompare(ad)) || fallback
  }
  if (sort === 'title_asc' || sort === 'title_desc') return textOrder.compare(searchSortTitle(a), searchSortTitle(b)) * (sort === 'title_desc' ? -1 : 1) || fallback
  if (sort === 'type') return textOrder.compare(kindLabels[a.kind || ''] || a.kind || '', kindLabels[b.kind || ''] || b.kind || '') || textOrder.compare(searchSortTitle(a), searchSortTitle(b)) || fallback
  return fallback
}
