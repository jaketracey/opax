// Only fixed categories and counts cross the analytics boundary.
const fields = {
  opax_view: ['page_path', 'page_section'],
  opax_ask: ['question_length', 'from_section'],
  opax_search: ['query_length', 'search_kind', 'search_mode'],
  opax_chip: ['chip_kind'],
  opax_game_open: ['game'],
  opax_download: [],
  opax_outbound: ['host'],
  opax_source_open: ['from_section'],
  opax_ask_started: ['from_section'],
  opax_ask_completed: ['from_section', 'duration_ms', 'source_count', 'has_answer'],
  opax_ask_failed: ['from_section', 'duration_ms', 'cancelled'],
  opax_search_started: ['page', 'filter_count'],
  opax_search_completed: ['page', 'result_count', 'total_count', 'duration_ms'],
  opax_search_failed: ['page', 'duration_ms'],
  opax_export: ['format', 'row_count'],
};
export function safePath(value) {
  try {
    const url = new URL(value, 'https://opax.com.au');
    const path = url.hash.startsWith('#/') ? url.hash.slice(1).split('?')[0] : url.pathname;
    // Unknown paths can contain arbitrary reader input; never collect them.
    if (!/^\/(?:$|ask(?:\/|$)|chat(?:\/|$)|search(?:\/|$)|money(?:\/|$)|reports(?:\/|$)|explore(?:\/|$)|doc(?:\/|$)|subject(?:\/|$)|declared(?:\/|$)|about(?:\/|$)|methods(?:\/|$)|stats(?:\/|$)|expenses(?:\/|$)|bills?(?:\/|$))/.test(path)) return '/other';
    return path;
  } catch { return '/other'; }
}
export function cleanEvent(event, props = {}) {
  if (!Object.hasOwn(fields, event)) return null;
  const clean = {};
  for (const key of fields[event]) {
    const value = props[key];
    if (key === 'page_path') clean[key] = safePath(value);
    else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === 'boolean') clean[key] = value;
    else if (typeof value === 'string' && value.length <= 100 && /^[a-zA-Z0-9_.:-]+$/.test(value)) clean[key] = value;
  }
  return clean;
}
export function beforeSend(event) {
  if (!event) return null;
  const p = event.properties;
  delete p.$set;
  delete p.$set_once;
  // SDK enrichment includes referrers, initial URLs, titles and campaign/search
  // parameters even when the application captures no free text. The referring
  // domain alone (no path, no query) is kept so traffic sources are visible.
  for (const key of Object.keys(p)) {
    if (key === '$current_url' || key === '$pathname' || key === '$referring_domain') continue;
    if (/^\$.*(?:url|referr|initial|title|search|keyword)|^(?:utm_|gclid|fbclid|msclkid)/i.test(key)) delete p[key];
  }
  p.$pathname = safePath(p.$pathname || p.$current_url || '/');
  p.$current_url = `https://opax.com.au${p.$pathname}`;
  return event;
}
