import type {
  CatalogRecord,
  Expenses,
  InterestDetail,
  Pay,
  RecentInterests,
} from './catalog-decoders';
import { payPersonRecord } from './transforms';
import type { CatalogKind } from './policy';

// Offline fixture projection from pinned files. Same texts/hrefs as
// scripts/build_search_catalog.mjs; no production ranking or ARAG fallback.
export function catalogSearchRows(
  kind: Exclude<CatalogKind, 'person'>,
  data: {
    pay: Pay;
    expenses: Expenses;
    interests: InterestDetail[];
    recent: RecentInterests;
  },
): CatalogRecord[] {
  const rows: CatalogRecord[] = [];
  const href = (name: string) => '/subject/person/' + encodeURIComponent(name);
  const cash = (amount: number) =>
    amount.toLocaleString('en-AU', {
      style: 'currency',
      currency: 'AUD',
      maximumFractionDigits: 0,
    });
  if (kind === 'pay') {
    for (const id of Object.keys(data.pay.people)) {
      const record = payPersonRecord(data.pay, id);
      if (record)
        rows.push({
          kind,
          title: record.title,
          href: record.href,
          snippet: record.snippet,
          slug: record.extra.slug,
          resource: '',
          source: record.extra.source,
          url: record.extra.url,
        });
    }
  } else if (kind === 'expense') {
    for (const [id, p] of Object.entries(data.expenses.people))
      rows.push({
        kind,
        title: `${p.name} — parliamentary expenses`,
        href: href(p.name),
        snippet: `${cash(p.total)} reported expenditure. ${p.by_category.map(([n, v]) => `${n}: ${cash(v)}`).join('; ')}.`,
        slug: 'expense-' + id,
        resource: '',
        source: 'Independent Parliamentary Expenses Authority',
        url: data.expenses.meta.source_url,
      });
  } else {
    for (const p of data.interests)
      for (const [category, bucket] of Object.entries(p.buckets))
        bucket.items.forEach((item, i) =>
          rows.push({
            kind,
            title: `${p.name} — ${category.replaceAll('_', ' ')}`,
            href: href(p.name),
            snippet: `${item.description}. ${item.holder}. ${item.kind}.`,
            slug: `${p.name}-${category}-${i}`,
            resource: '',
            source: 'Register of interests',
            url: p.source_url,
          }),
        );
    for (const item of data.recent.items)
      rows.push({
        kind,
        title: `${item.name} — ${item.kind}`,
        href: '/declared?person=' + encodeURIComponent(item.name),
        snippet: item.description,
        slug: 'interest-' + item.id,
        resource: '',
        source: 'Register alteration',
        url: item.url,
      });
  }
  return rows;
}
