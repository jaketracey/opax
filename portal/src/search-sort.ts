export const SEARCH_SORTS = new Set(['relevance', 'newest', 'oldest', 'title_asc', 'title_desc', 'type'])
type SortableRecord = { title?: string; kind?: string; date?: string | null; sort_date?: string; score?: number; slug?: string }
const textOrder = new Intl.Collator('en-AU', { sensitivity: 'base', numeric: true })
const kindLabels: Record<string,string> = { person:'People', party:'Political parties', agency:'Government agencies', donor:'Donors', receipt:'Political receipts', supplier:'Suppliers', contract:'Government contracts', grant:'Grants', interest:'Declared interests', expense:'Parliamentary expenses', access:'Meetings and lobbying registers', campaigner:'Campaigners and associated entities', bill:'Bills', speech:'Speeches and hearings', division:'Divisions', press_release:'Government transcripts and releases', report:'Research reports' }
export function compareSearchResults(a: SortableRecord, b: SortableRecord, sort: string): number {
  const fallback = (b.score || 0) - (a.score || 0) || textOrder.compare(a.slug || '', b.slug || '')
  if (sort === 'newest' || sort === 'oldest') {
    const ad = a.date || a.sort_date || '', bd = b.date || b.sort_date || ''
    // An unknown date belongs at the end in both directions.
    if (!ad || !bd) return ad ? -1 : bd ? 1 : fallback
    return (sort === 'oldest' ? ad.localeCompare(bd) : bd.localeCompare(ad)) || fallback
  }
  if (sort === 'title_asc' || sort === 'title_desc') return textOrder.compare(a.title || '', b.title || '') * (sort === 'title_desc' ? -1 : 1) || fallback
  if (sort === 'type') return textOrder.compare(kindLabels[a.kind || ''] || a.kind || '', kindLabels[b.kind || ''] || b.kind || '') || textOrder.compare(a.title || '', b.title || '') || fallback
  return fallback
}
