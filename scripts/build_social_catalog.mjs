// A small publication shortlist drawn only from records visible on recipient pages.
// Dates are agreement start dates, never inferred publication or payment dates.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../portal/public/', import.meta.url));
const graph = JSON.parse(readFileSync(root + 'graph/grants.federal.json', 'utf8'));
const asOf = graph.meta.generated.slice(0, 10);
const until = Date.parse(asOf + 'T00:00:00Z');
const grants = [];
for (let i = 0; i < graph.meta.shards; i++) {
  const shard = JSON.parse(readFileSync(root + `grants/federal/shard-${String(i).padStart(2, '0')}.json`, 'utf8'));
  for (const recipient of Object.values(shard)) {
    if (!/^abn:\d{11}$/.test(recipient.id) || recipient.k === 'person') continue;
    for (const g of recipient.grants || []) {
      const start = Date.parse(g.s + 'T00:00:00Z');
      const purpose = String(g.desc || g.n || '').replace(/\s+/g, ' ').trim();
      if (!/^GA\d+(?:-A\d+)?$/.test(g.id) || !g.guid || !Number.isFinite(g.v) || g.v <= 0 || purpose.length < 55 || !Number.isFinite(start) || start > until || until - start > 365 * 86400000) continue;
      grants.push({ id: g.id, recipientId: recipient.id, recipient: recipient.n, amount: g.v, start: g.s, purpose, agency: g.ag, program: g.pr, category: g.cat, sourceUrl: `https://www.grants.gov.au/Ga/Show/${encodeURIComponent(g.guid)}` });
    }
  }
}
grants.sort((a, b) => b.start.localeCompare(a.start) || a.id.localeCompare(b.id));
mkdirSync(root + 'social', { recursive: true });
writeFileSync(root + 'social/grants.json', JSON.stringify({ asOf, basis: 'Published award values and agreement start dates; not payments.', grants: grants.slice(0, 1500) }) + '\n');
console.log(`Social grant shortlist: ${Math.min(grants.length, 1500)} source records, as of ${asOf}`);
