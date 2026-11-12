import { formatDate } from '../../design/format';
export const reportTypeLabel = (type?: string) =>
  ({
    royal_commission: 'Royal commission',
    integrity_report: 'Integrity report',
    annual_report: 'Annual report',
    agency_report: 'Agency report',
  })[type ?? ''] ?? 'Report';
const dateBasis: Record<string, string> = {
  tabled: 'Tabled',
  tabled_vic: 'Tabled in the Parliament of Victoria',
  published: 'Published',
  stated: 'Dated',
  dated: 'Dated',
  updated: 'Page updated',
  released: 'Released',
};
export function reportDate(date: string | null, basis: string | null) {
  return date
    ? `${basis ? (Object.hasOwn(dateBasis, basis) ? dateBasis[basis] : basis) : 'Dated'} ${formatDate(date, 'short')}`
    : 'No published or tabled day is recorded.';
}
