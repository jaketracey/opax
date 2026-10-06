// Node-only fixture measurement. No production requests or device coordinates.
import { writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { server } from './fixture-server';
import snapshot from './fixture-snapshot.json';
import { fixtureBytes } from '../tests/fixture-bytes';
import {
  decodeElectorate,
  decodeElectorateIndex,
  type ElectorateDetail,
} from '../src/api/catalogs';
import { loadOutlines } from '../src/features/electorate-map/suggestion';
async function main() {
  if (!server.listening) await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const pinned = fixtureBytes(snapshot);
  const manifest = JSON.parse(pinned('/electorates/manifest.json').toString());
  const seats = decodeElectorateIndex(
    JSON.parse(pinned(manifest.index_url).toString()),
  ).electorates;
  const cached = new Map<string, ElectorateDetail>();
  let bytes = 0,
    requests = 0;
  const load = async (path: string) => {
    let data = cached.get(path);
    if (!data) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      if (!response.ok) throw new Error('Fixture request failed');
      const body = await response.arrayBuffer();
      bytes += body.byteLength;
      requests++;
      data = decodeElectorate(JSON.parse(new TextDecoder().decode(body)));
      cached.set(path, data);
    }
    return { data };
  };
  const start = performance.now();
  const { outlines } = await loadOutlines(seats, load, () => {});
  const coldMs = performance.now() - start;
  const warmStart = performance.now();
  await loadOutlines(seats, load, () => {});
  const warmMs = performance.now() - warmStart;
  const compact = {
    schema_version: 1,
    release_id: manifest.release_id,
    purpose: 'display_suggestion_only',
    seats: outlines.map((o) => {
      const detail = cached.get(o.seat.detail_url)!;
      const boundary = detail.boundaries.find(
        (b) => b.geometry === o.geometry,
      )!;
      return {
        name: o.seat.name,
        state_code: o.seat.state_code,
        detail_url: o.seat.detail_url,
        ...boundary,
      };
    }),
  };
  const { gzipSync, brotliCompressSync } = await import('node:zlib');
  const bulk = Buffer.from(JSON.stringify(compact));
  const result = {
    basis:
      'Local fixture HTTP, four concurrent reads, JSON decoding; warm in-memory records, not a phone/network forecast',
    seats: outlines.length,
    bytes,
    requests,
    coldMs,
    warmMs,
    bulkProposal: {
      jsonBytes: bulk.length,
      gzipBytes: gzipSync(bulk).length,
      brotliBytes: brotliCompressSync(bulk).length,
    },
  };
  const output = process.argv[2];
  if (output) writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  server.close();
}
main().catch((error) => {
  server.close();
  throw error;
});
