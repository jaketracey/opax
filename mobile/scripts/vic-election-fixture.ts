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

// Contract examples to start with. Additional API pins are discovered by shape,
// so full seat and finder responses can be added without changing the server.
const o = decodeOverview(overview);
const seats = new Map<string, SeatDetail>();
const finds = new Map<string, FindResponse>();
const directory = join(__dirname, 'fixtures/vic-election');
for (const file of readdirSync(directory).filter((f) => f.endsWith('.json'))) {
  const raw = JSON.parse(readFileSync(join(directory, file), 'utf8'));
  if ('members' in raw && 'kind' in raw) {
    const seat = decodeSeat(raw);
    seats.set(seat.slug, seat);
  }
  if ('hits' in raw) {
    const find = decodeFind(raw);
    finds.set(find.q.toLocaleLowerCase('en-AU'), find);
  }
}
export function vicElectionFixture(path: string, enabled: boolean) {
  const u = new URL(path, 'http://fixture.invalid');
  if (!u.pathname.startsWith('/api/app/v1/vic-election')) return null;
  const absent = (error: string) => ({ status: 404, body: { error } });
  if (!enabled) return absent('not_published');
  if (u.pathname === '/api/app/v1/vic-election')
    return { status: 200, body: o };
  if (u.pathname.startsWith('/api/app/v1/vic-election/seat/')) {
    const seat = seats.get(u.pathname.split('/').at(-1)!);
    return seat ? { status: 200, body: seat } : absent('not_found');
  }
  if (u.pathname === '/api/app/v1/vic-election/find') {
    const q = u.searchParams.get('q')!.trim();
    const lower = q.toLocaleLowerCase('en-AU');
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
        q,
        hits: rows.slice(0, 8).map((d) => ({
          name: d.name,
          kind: d.kind === 'district' ? 'District' : 'Region',
          seats: [{ ...d, share: null }],
        })),
        split: false,
        empty: rows.length ? null : /^\d{4}$/.test(q) ? 'postcode' : 'place',
      },
    };
  }
  return absent('not_found');
}
