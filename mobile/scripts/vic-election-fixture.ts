import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  decodeFind,
  decodeOverview,
  decodeSeat,
  type FindResponse,
  type SeatDetail,
} from '../src/features/vic-election/decoders';
import overview from './fixtures/vic-election/overview.json';

// Validate the portal's pinned responses at startup, then serve their payloads.
// Only <slug>.json is a route: <slug>-candidates.json is a render-test variant
// and must never overwrite the unpublished seat according to directory order.
const o = decodeOverview(overview);
const seats = new Map<string, SeatDetail>();
const finds = new Map<string, FindResponse>();
const directory = join(__dirname, 'fixtures/vic-election');
for (const file of readdirSync(directory).filter((f) => f.endsWith('.json'))) {
  const raw = JSON.parse(readFileSync(join(directory, file), 'utf8'));
  if ('members' in raw && 'kind' in raw) {
    const seat = decodeSeat(raw);
    if (file === `${seat.slug}.json`) seats.set(seat.slug, raw);
  }
  if ('hits' in raw) {
    const find = decodeFind(raw);
    finds.set(find.q.toLocaleLowerCase('en-AU'), raw);
  }
}
export function vicElectionFixture(path: string, enabled: boolean) {
  const u = new URL(path, 'http://fixture.invalid');
  const root = '/api/app/v1/vic-election';
  if (u.pathname !== root && !u.pathname.startsWith(`${root}/`)) return null;
  const absent = (error: string) => ({ status: 404, body: { error } });
  if (!enabled) return absent('not_published');
  const finding = u.pathname === `${root}/find`;
  const q = u.searchParams.get('q')?.trim().slice(0, 60).trim();
  if (finding ? !q || [...u.searchParams.keys()].length !== 1 : !!u.search)
    return { status: 400, body: { error: 'invalid_query' } };
  if (u.pathname === '/api/app/v1/vic-election')
    return { status: 200, body: overview };
  if (u.pathname.startsWith('/api/app/v1/vic-election/seat/')) {
    const seat = seats.get(u.pathname.slice(`${root}/seat/`.length));
    return seat ? { status: 200, body: seat } : absent('not_found');
  }
  if (u.pathname === '/api/app/v1/vic-election/find') {
    const query = q!;
    const lower = query.toLocaleLowerCase('en-AU');
    const pinned = finds.get(lower);
    if (pinned) return { status: 200, body: pinned };
    const rows = [...o.districts, ...o.regions].filter(
      (d) =>
        d.name.toLocaleLowerCase('en-AU').includes(lower) ||
        (d.kind === 'district'
          ? d.member.name
          : d.members.map((m) => m.name).join(' ')
        )
          .toLocaleLowerCase('en-AU')
          .includes(lower),
    );
    const source = finds.values().next().value!;
    return {
      status: 200,
      body: {
        ...source,
        q: query,
        hits: rows.slice(0, 8).map((d) => ({
          name: d.name,
          kind: d.kind === 'district' ? 'District' : 'Region',
          seats: [{ ...d, share: null }],
        })),
        split: false,
        empty: rows.length
          ? null
          : /^\d{4}$/.test(query)
            ? 'postcode'
            : 'place',
      },
    };
  }
  return absent('not_found');
}
