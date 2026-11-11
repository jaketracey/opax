// The "Other suppliers to these agencies" lists on server-rendered supplier pages
// show an agency's ten largest suppliers other than the page's own. Eleven rows,
// largest first (a stable sort), always leave ten after removing that supplier.
// The release build ranks every agency once (scripts/build_growth_modules.mjs)
// so a page never parses an agency file (Defence's is 13.6 MB) to list ten names.
export const AGENCY_TOP_SUPPLIERS_PATH = '/growth/agency-top-suppliers.json';
export function agencyTopRows(suppliers) {
  return [...(suppliers || [])].sort((a, b) => b.total - a.total).slice(0, 11).map(({id, name, total}) => ({id, name, total}));
}
