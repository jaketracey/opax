import {readFile, readdir, mkdir, writeFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {TABLE_DATASETS, tableTerms, tableBucket, compareTableValues} from '../portal/public/table-datasets.js';
import {MONEY_GRAPHS, isOrganisationDonor, withheldPhrases} from '../portal/public/donor-entity.js';
import {moneyFlowType} from '../portal/public/money-records.js';
import {tablePrivacyCheck} from '../portal/src/table-privacy.mjs';

const defaultRoot = fileURLToPath(new URL('../portal/public/', import.meta.url));
export const TABLE_BUDGET = {files: 1500, bytes: 200 * 1024 * 1024, fileBytes: 20 * 1024 * 1024};
export const TABLE_SHARD_SIZE = 1024;

export function moneyTableRows(graphs) {
  const result = {'money-connections': [], 'party-money': []};
  const phrases = withheldPhrases(graphs, []);
  const namesWithheld = tablePrivacyCheck(phrases);
  for (const [g, graph] of graphs.entries()) {
    const jurisdiction = ['federal', 'qld', 'vic', 'tas'][g];
    const nodes = new Map(graph.nodes.map(n => [n.id, n]));
    for (const [i, edge] of graph.edges.entries()) {
      const type = moneyFlowType(edge, nodes);
      if (!type) continue;
      const from = nodes.get(edge.source), to = nodes.get(edge.target);
      const donors = [from, to].filter(n => n.kind === 'donor');
      if (donors.some(n => !isOrganisationDonor(n))) continue;
      const row = {id: `${jurisdiction}:${i}`, from: from.label, to: to.label, type, jurisdiction, industry: donors[0]?.industry || '', amount: edge.total, count: edge.count ?? 0, firstYear: edge.firstYear ?? null, lastYear: edge.lastYear ?? null};
      if (namesWithheld('donor ' + Object.values(row).join(' '))) continue;
      const entry = {row, ...(donors.length ? {donors: donors.map(n => ({label: n.label, aliases: n.aliases || []}))} : {})};
      result['money-connections'].push(entry);
      if (type === 'receipts') result['party-money'].push(entry);
    }
  }
  return result;
}

export async function interestTableRows(root, graphs) {
  const read = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
  const roster = await read('parliamentarians.json'), access = await read('access.json');
  const check = tablePrivacyCheck(withheldPhrases(graphs, [
    ...roster.people.flatMap(p => [p.name, p.full]), ...Object.values(access.ministers || {}).map(m => m.name),
  ].filter(Boolean)));
  const rows = [];
  for (const file of (await readdir(join(root, 'interests'))).filter(f => f.endsWith('.json')).sort()) {
    if (['index.json', 'recent.json', 'ties-by-donor.json'].includes(file)) continue;
    const v = await read('interests/' + file);
    for (const [category, bucket] of Object.entries(v.buckets || {})) for (const [i, item] of (bucket.items || []).entries()) {
      if (check(item.description, item.holder || '')) continue;
      const date = item.date || v.as_at || null;
      rows.push({row: {id: `${file.slice(0, -5)}:${category}:${i}`, name: v.name, category, holder: item.holder || '', jurisdiction: v.jurisdiction, chamber: v.chamber, description: item.description || '', date, year: Number(String(date || '').slice(0, 4)) || null, url: v.source_url || ''}});
    }
  }
  return rows;
}

/** Read existing public snapshots only. No database or network operations. */
export async function tableRows(root = defaultRoot, {moneyOnly = false} = {}) {
  const read = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
  const files = async name => (await readdir(join(root, name))).filter(f => f.endsWith('.json')).sort();
  const graphs = await Promise.all(MONEY_GRAPHS.map(name => read(name.slice(1))));
  // A table query is donor context, including a one-word name and office holders.
  const phrases = withheldPhrases(graphs, []);
  const check = tablePrivacyCheck(phrases);
  const namesWithheld = (...values) => check('donor ' + values.flat().join(' '));
  const rows = Object.fromEntries(Object.keys(TABLE_DATASETS).map(name => [name, []]));
  const add = (name, row, donors = []) => {
    if (donors.some(n => !isOrganisationDonor(n))) return;
    if (TABLE_DATASETS[name].privacy && namesWithheld(...Object.values(row).flat())) return;
    rows[name].push({row, ...(donors.length ? {donors: donors.map(n => ({label: n.label, aliases: n.aliases || []}))} : {})});
  };
  Object.assign(rows, moneyTableRows(graphs));
  for (const s of (await read('suppliers.json')).suppliers) add('suppliers', {id: s.id, name: s.name, abn: s.abn, jurisdiction: 'federal', total: s.total, count: s.count, agency_count: s.agency_count, first_year: s.first_year, last_year: s.last_year});
  const contractIds = new Set();
  for (const file of await files('suppliers')) for (const s of Object.values((await read('suppliers/' + file)).profiles)) for (const c of s.contracts || []) {
    if (contractIds.has(c.id)) continue;
    contractIds.add(c.id);
    add('contracts', {id: c.id, title: c.title || c.id, supplier: s.name, agency: c.agency || '', procurement_method: c.procurement_method || '', jurisdiction: 'federal', amount: c.amount, start_date: c.start_date || null, end_date: c.end_date || null, description: c.description || '', url: c.url || ''});
  }
  for (const jur of ['federal', 'qld']) for (const file of (await files('grants/' + jur)).filter(f => f.startsWith('shard-'))) for (const r of Object.values(await read(`grants/${jur}/${file}`))) for (const [i, g] of (r.grants || []).entries()) {
    add('grants', {id: String(g.id ?? `${r.id}:${i}`), title: g.n || g.pr || g.id || '', recipient: r.n, agency: g.ag || '', program: g.pr || '', category: g.cat || '', jurisdiction: jur, amount: g.v, year: Number(String(g.fy || g.s || '').slice(0, 4)) || null, start_date: g.s || null, description: g.desc || '', url: g.guid ? `https://www.grants.gov.au/Ga/Show/${g.guid}` : ''});
  }
  if (moneyOnly) return rows;
  for (const d of (await read('divisions/index.json')).divisions) {
    const v = await read('divisions/' + d.slug + '.json');
    add('divisions', {id: v.slug, name: v.name, question: v.question, jurisdiction: v.jurisdiction, house: v.house, result: v.result, date: v.date, ayes: v.ayes, noes: v.noes, member_count: d.member_count, url: v.source_url});
  }
  // Preserve the schema-1 votes export byte for byte; this is a separate projection.
  for (const [id, v] of Object.entries(await read('votes.json'))) if (v && typeof v === 'object' && typeof v.name === 'string') add('votes', {id, name: v.name, party: v.party, jurisdiction: v.jurisdiction, house: v.house, ayes: v.ayes, noes: v.noes, divisions_total: v.divisions_total, first_year: v.years?.[0] ?? null, last_year: v.years?.at(-1) ?? null});
  const instruments = await read('instruments/index.json');
  for (const values of instruments.records) {
    const v = Object.fromEntries(instruments.fields.map((field, i) => [field, values[i]]));
    add('instruments', {id: v.id, title: v.title, portfolios: v.portfolios, type: v.type, status: v.status, commenced: v.commenced || null, year: Number(String(v.commenced || '').slice(0, 4)) || null});
  }
  for (const v of (await read('audit/index.json')).records) add('audit-reports', {id: v.id, title: v.title, report_label: v.report_label, sectors: v.sectors, entities: v.entities, jurisdiction: 'qld', number: v.number, year: Number(String(v.year).slice(0, 4)) || null, tabled_date: v.tabled_date, canonical_url: v.canonical_url});
  rows.interests = await interestTableRows(root, graphs);
  return rows;
}

/** The index has postings and sorted numeric values; row bodies are fetched only
 * for the selected page/export. Sort files and term buckets are loaded on demand. */
export async function buildTableIndexes(root = defaultRoot, datasets) {
  datasets ??= await tableRows(root);
  const output = join(root, 'table-index');
  await mkdir(output, {recursive: true});
  const manifest = {schema: 2, datasets: {}, files: 0, bytes: 0, indexFiles: 0, indexBytes: 0};
  const put = async (name, data, index = true) => {
    const body = JSON.stringify(data), bytes = Buffer.byteLength(body);
    if (bytes > TABLE_BUDGET.fileBytes) throw new Error('Table asset exceeds byte budget');
    manifest.files++; manifest.bytes += bytes;
    if (index) { manifest.indexFiles++; manifest.indexBytes += bytes; }
    await writeFile(join(output, name), body);
  };
  const versions = new Set();
  for (const [name, config] of Object.entries(TABLE_DATASETS)) {
    const entries = datasets[name] || [];
    const version = createHash('sha256').update(JSON.stringify([3, config, entries])).digest('hex').slice(0, 16);
    const dir = name + '-' + version;
    versions.add(dir);
    await mkdir(join(output, dir), {recursive: true});
    const index = {schema: 2, count: entries.length, shardSize: TABLE_SHARD_SIZE, categories: {}, ranges: {}, terms: []};
    const postings = Array.from({length: 16}, () => Object.create(null));
    for (const [id, {row}] of entries.entries()) for (const term of new Set(tableTerms(Object.values(row).flat().join(' ')))) (postings[tableBucket(term)][term] ??= []).push(id);
    index.terms = postings.flatMap(p => Object.keys(p)).sort();
    for (const c of config.columns) {
      if (c.facet === 'multi' || c.facet === 'chips') {
        const values = Object.create(null);
        for (const [id, {row}] of entries.entries()) for (const value of new Set([row[c.key]].flat().filter(v => v != null && v !== '').map(String))) (values[value] ??= []).push(id);
        index.categories[c.key] = values;
      } else if (c.facet === 'range') {
        index.ranges[c.key] = entries.flatMap(({row}, id) => typeof row[c.key] === 'number' && Number.isFinite(row[c.key]) ? [[row[c.key], id]] : []).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      }
      if (c.sortable !== false) {
        const order = entries.map((_, id) => id).sort((a, b) => compareTableValues(entries[a].row[c.key], entries[b].row[c.key]) || a - b);
        await put(`${dir}/sort-${c.key}.json`, order);
      }
    }
    await put(`${dir}/index.json`, index);
    const facets = Object.fromEntries(Object.entries(index.categories).map(([key, values]) => [key,
      Object.entries(values).map(([value, ids]) => ({value, count: ids.length})).sort((a, b) => a.value.localeCompare(b.value, 'en')),
    ]));
    for (const [key, values] of Object.entries(index.ranges)) if (values.length) facets[key] = {min: values[0][0], max: values.at(-1)[0]};
    await put(`${dir}/summary.json`, {schema: 2, count: index.count, shardSize: index.shardSize, facets});
    for (let i = 0; i < postings.length; i++) await put(`${dir}/terms-${i}.json`, postings[i]);
    for (let start = 0; start < entries.length; start += TABLE_SHARD_SIZE) {
      const strings = [], dictionary = new Map();
      const stringId = value => { if (!dictionary.has(value)) {dictionary.set(value, strings.length);strings.push(value);} return dictionary.get(value); };
      const rows = entries.slice(start, start + TABLE_SHARD_SIZE).map(({row, donors}) => ({
        values: config.columns.map(c => {
          const value = row[c.key] ?? null;
          if (value == null || ['money', 'count', 'year'].includes(c.type)) return value;
          return Array.isArray(value) ? value.map(v => stringId(String(v))) : stringId(String(value));
        }), ...(donors ? {donors} : {}),
      }));
      await put(`${dir}/rows-${start / TABLE_SHARD_SIZE}.json`, {strings, rows}, false);
    }
    manifest.datasets[name] = {path: '/table-index/' + dir, version, count: entries.length};
  }
  // Reserve room for the manifest itself and enforce a total additive budget.
  if (manifest.files + 1 > TABLE_BUDGET.files || manifest.bytes + 4096 > TABLE_BUDGET.bytes) throw new Error('Table assets exceed total budget');
  manifest.files++; manifest.indexFiles++;
  let manifestBytes = 0;
  for (;;) {
    const bytes = Buffer.byteLength(JSON.stringify(manifest));
    if (bytes === manifestBytes) break;
    manifest.bytes += bytes - manifestBytes;
    manifest.indexBytes += bytes - manifestBytes;
    manifestBytes = bytes;
  }
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest));
  for (const entry of await readdir(output)) if (entry !== 'manifest.json' && !versions.has(entry)) await rm(join(output, entry), {recursive: true, force: true});
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const m = await buildTableIndexes();
  console.log(`table indexes: ${m.indexFiles} files, ${m.indexBytes} bytes; all table assets: ${m.files} files, ${m.bytes} bytes`);
  console.log(Object.entries(m.datasets).map(([name, v]) => `${name}: ${v.count}`).join('\n'));
}
