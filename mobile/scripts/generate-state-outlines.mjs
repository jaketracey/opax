// Regenerate from checked-in public exports only. Never fetch the live Worker.
//
// The state electorate finder runs on the device against bundled outlines,
// so a location never leaves the phone and no request depends on it
// (control hub privacy rule, 10 Oct). This writes every current state and
// territory lower-house district outline in the dated electorate release:
// ABS SED 2025 statistical approximations (CC BY 4.0), already simplified by
// the ABS service at 0.003° (maxAllowableOffset). Rings are integer deltas in
// 1e-4° (about 11 m), a third of the release's JSON size.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(mobile, '../portal/public');
const output = resolve(
  mobile,
  'src/features/electorate-map/state-outlines.json',
);
const hashes = {};
const read = (path) => {
  const bytes = readFileSync(resolve(publicRoot, path.replace(/^\//, '')));
  hashes[path] = createHash('sha256').update(bytes).digest('hex');
  return JSON.parse(bytes);
};
// Lower houses only: each is single-district, so a point names one seat.
// Upper-house regions are chosen by hand (most have no outline here).
const chambers = new Set([
  'act_la',
  'nsw_la',
  'nt_la',
  'qld_la',
  'sa_ha',
  'tas_ha',
  'vic_la',
  'wa_la',
]);
const precision = 1e4;
const manifest = read('/electorates/manifest.json');
const index = read(manifest.index_url);
if (index.meta.release_id !== manifest.release_id)
  throw new Error('The seat index does not match its manifest.');
const seats = {};
const vintages = new Set();
// The geometry's source is the one every outline cites; ACT and Tasmania
// also cite their commission's seat-capacity record, which draws no line.
let sourceIds = null;
const ring = (positions) => {
  const flat = [];
  let x0 = 0,
    y0 = 0;
  for (const [x, y] of positions) {
    const x1 = Math.round(x * precision),
      y1 = Math.round(y * precision);
    flat.push(x1 - x0, y1 - y0);
    x0 = x1;
    y0 = y1;
  }
  return flat;
};
for (const seat of index.electorates) {
  if (seat.status !== 'current' || !chambers.has(seat.chamber)) continue;
  const detail = read(seat.detail_url);
  if (detail.electorate_id !== seat.electorate_id)
    throw new Error(`Mismatched outline: ${seat.electorate_id}`);
  const boundary = (detail.boundaries ?? [])
    .filter((b) => b.geometry && b.crs === 'EPSG:4326')
    .sort((a, b) => b.vintage.localeCompare(a.vintage))[0];
  if (!boundary) throw new Error(`No outline: ${seat.name} (${seat.chamber})`);
  vintages.add(boundary.vintage);
  sourceIds = sourceIds
    ? new Set(boundary.sources.filter((id) => sourceIds.has(id)))
    : new Set(boundary.sources);
  const polygons =
    boundary.geometry.type === 'Polygon'
      ? [boundary.geometry.coordinates]
      : boundary.geometry.coordinates;
  seats[seat.electorate_id] = polygons.map((rings) => rings.map(ring));
}
if (vintages.size !== 1) throw new Error(`Mixed vintages: ${[...vintages]}`);
const sources = manifest.sources
  .filter((s) => sourceIds.has(s.source_id))
  .map(({ label, url, licence }) => ({ label, url, licence }));
if (sources.length !== 1 || sources[0].licence !== 'CC BY 4.0')
  throw new Error('The outline source or its licence changed: review it.');
const body = {
  schema: 1,
  release_id: manifest.release_id,
  vintage: [...vintages][0],
  geometry_kind: 'statistical',
  note: 'ABS statistical approximations of state and territory electoral districts, simplified at 0.003°. Not for address allocation.',
  source: sources[0],
  precision,
  inputs: Object.fromEntries(
    Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)),
  ),
  seats,
};
writeFileSync(output, JSON.stringify(body) + '\n');
console.log(
  `${Object.keys(seats).length} districts, ${readFileSync(output).length} bytes → ${output}`,
);
