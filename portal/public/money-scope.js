// Display only: figures and source keys pass through unchanged.
export const fy = value => String(value ?? '').replace(/(\d{4})[-–](\d{2})(?![\d-])/g, '$1–$2');
export const financialYear = year => fy(`${year}-${String((Number(year) + 1) % 100).padStart(2, '0')}`);
export function moneyScope(kind, {year = '', branches = 0} = {}) {
  if (kind === 'map') return `from named donors on the map, all receipt types from AEC federal returns${year ? `, ${fy(year)}` : ''}`;
  if (kind === 'return') return `total receipts on the ${fy(year)} AEC federal return, all receipt types${branches > 1 ? `, ${branches} branches summed` : ''}`;
  return '';
}
const INDUSTRIES = {
  media: 'Media', telecom: 'Telecom', 'media & tech': 'Media & tech',
  legal: 'Legal', lobbying: 'Lobbying', 'legal & lobbying': 'Legal & lobbying',
  'fossil fuels': 'Fossil fuels', mining: 'Mining', energy: 'Energy', 'mining & energy': 'Mining & energy',
  property: 'Property', construction: 'Construction', 'property & construction': 'Property & construction',
  individual: 'Individual', individuals: 'Individual', finance: 'Finance', unions: 'Unions', gambling: 'Gambling',
  health: 'Health', retail: 'Retail', other: 'Other', parties: 'Parties', 'public money': 'Public money',
};
export function industryName(value) {
  const key = String(value ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!key || /^(?:not supplied|industry not recorded)$/i.test(key)) return 'Industry not recorded';
  return INDUSTRIES[key.toLowerCase()] || key.charAt(0).toUpperCase() + key.slice(1);
}
