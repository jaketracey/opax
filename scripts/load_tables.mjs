import {readFile, readdir, mkdir, writeFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {TABLE_DATASETS} from '../portal/src/table-datasets.mjs';
import {isOrganisationRecipient} from '../portal/src/table-recipient.mjs';
import {identityVariants, compileIdentityCheck} from '../portal/src/table-identities.mjs';
import {tableSchema,tableName,quote,arrayColumns} from './table-schema.mjs';
import {MONEY_GRAPHS, isOrganisationDonor, withheldPhrases} from '../portal/public/donor-entity.js';
import {moneyFlowType} from '../portal/public/money-records.js';
import {tablePrivacyCheck} from '../portal/src/table-privacy.mjs';

const defaultRoot = fileURLToPath(new URL('../portal/public/', import.meta.url));
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
export async function tableRows(root = defaultRoot, {moneyOnly = false, graphs: suppliedGraphs} = {}) {
  const read = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
  const files = async name => (await readdir(join(root, name))).filter(f => f.endsWith('.json')).sort();
  const graphs = suppliedGraphs || await Promise.all(MONEY_GRAPHS.map(name => read(name.slice(1))));
  const policy = await tableIdentityIndex(root, graphs);
  const rows = Object.fromEntries(Object.keys(TABLE_DATASETS).map(name => [name, []]));
  const aggregates = new Map();
  const add = (name, row, identity = '', hidden = false) => {
    if (TABLE_DATASETS[name].privacy && (hidden || policy.check(Object.values(row).flat().join(' ')))) {
      const key = name + ':' + (row.jurisdiction || '') + ':' + (row.type || '');
      let aggregate = aggregates.get(key);
      if (!aggregate) {aggregate = {name, jurisdiction:row.jurisdiction, type:row.type, identities:new Set(), amount:0, count:0, first:null,last:null};aggregates.set(key,aggregate);}
      aggregate.identities.add(identity || row.id);
      aggregate.amount += Number(row.amount ?? row.total) || 0;
      aggregate.count += Number(row.count) || 0;
      const first = row.firstYear ?? row.first_year, last = row.lastYear ?? row.last_year;
      if (first != null) aggregate.first = Math.min(aggregate.first ?? first,first);
      if (last != null) aggregate.last = Math.max(aggregate.last ?? last,last);
      return;
    }
    rows[name].push({row});
  };
  for (const [g,graph] of graphs.entries()) {
    const jurisdiction = ['federal','qld','vic','tas'][g], nodes = new Map(graph.nodes.map(n=>[n.id,n]));
    for (const [i,edge] of graph.edges.entries()) {
      const type = moneyFlowType(edge,nodes);if (!type) continue;
      const from = nodes.get(edge.source),to = nodes.get(edge.target);
      const donors = [from,to].filter(n=>n.kind==='donor');
      const row = {id:`${jurisdiction}:${i}`,from:from.label,to:to.label,type,jurisdiction,industry:donors[0]?.industry || '',amount:edge.total,count:edge.count ?? 0,firstYear:edge.firstYear ?? null,lastYear:edge.lastYear ?? null};
      const hidden = donors.some(n=>!isOrganisationDonor(n));
      add('money-connections',row,donors.map(n=>n.id).join('|'),hidden);
      if (type==='receipts') add('party-money',row,donors.map(n=>n.id).join('|'),hidden);
    }
  }
  for (const s of (await read('suppliers.json')).suppliers) add('suppliers', {id:s.id,name:s.name,abn:s.abn,jurisdiction:'federal',total:s.total,count:s.count,agency_count:s.agency_count,first_year:s.first_year,last_year:s.last_year},s.id,policy.suppliers.has(String(s.id)));
  const contractIds = new Set();
  for (const file of await files('suppliers')) for (const s of Object.values((await read('suppliers/' + file)).profiles)) for (const c of s.contracts || []) {
    if (contractIds.has(c.id)) continue;
    contractIds.add(c.id);
    add('contracts', {id: c.id, title: c.title || c.id, supplier: s.name, agency: c.agency || '', procurement_method: c.procurement_method || '', jurisdiction: 'federal', amount: c.amount, start_date: c.start_date || null, end_date: c.end_date || null, description: c.description || '', url: c.url || ''},s.id,policy.suppliers.has(String(s.id)) || !isOrganisationRecipient({...s,...s.identity}));
  }
  for (const jur of ['federal', 'qld']) for (const file of (await files('grants/' + jur)).filter(f => f.startsWith('shard-'))) for (const r of Object.values(await read(`grants/${jur}/${file}`))) for (const [i, g] of (r.grants || []).entries()) {
    add('grants', {id: String(g.id ?? `${r.id}:${i}`), title: g.n || g.pr || g.id || '', recipient: r.n, agency: g.ag || '', program: g.pr || '', category: g.cat || '', jurisdiction: jur, amount: g.v, year: Number(String(g.fy || g.s || '').slice(0, 4)) || null, start_date: g.s || null, description: g.desc || '', url: g.guid ? `https://www.grants.gov.au/Ga/Show/${g.guid}` : ''},r.id,!isOrganisationRecipient(r));
  }
  for (const [key,a] of aggregates) {
    const row = Object.fromEntries(TABLE_DATASETS[a.name].columns.map(c=>[c.key,null]));
    row.id = 'aggregate:' + key;row.jurisdiction = a.jurisdiction;
    const n = a.identities.size;
    if (a.name==='suppliers') Object.assign(row,{name:`Suppliers not named (${n})`,total:a.amount,count:a.count,first_year:a.first,last_year:a.last});
    else if (a.name==='contracts') Object.assign(row,{title:`Contracts with suppliers not named (${n})`,supplier:`Suppliers not named (${n})`,amount:a.amount});
    else if (a.name==='grants') Object.assign(row,{title:`Grants to recipients not named (${n})`,recipient:`Recipients not named (${n})`,amount:a.amount});
    else Object.assign(row,{from:`Donors not named (${n})`,type:a.type,amount:a.amount,count:a.count,firstYear:a.first,lastYear:a.last});
    rows[a.name].push({row});
  }
  if (moneyOnly) return {rows,policy};
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
  return {rows,policy};
}


/** Source identities stay in memory. The database receives only hashes. */
export async function tableIdentityIndex(root = defaultRoot, suppliedGraphs) {
  const read = async path => JSON.parse(await readFile(join(root,path),'utf8'));
  const graphs = suppliedGraphs || await Promise.all(MONEY_GRAPHS.map(path=>read(path.slice(1))));
  const phrases = new Set(), suppliers = new Set();
  const add = entity => {
    const values = [entity.label,entity.name,entity.n,entity.abn,entity.abr?.abn,entity.identity?.legal_name,entity.abr?.name,entity.abr?.legal_name, ...(entity.aliases || []), ...(entity.lookup_names || [])];
    for (const id of [entity.id,entity.canonical_id]) {if (String(id || '').startsWith('person:')) values.push(String(id).slice(7));if (/^(?:abn:)?\d{11}$/.test(String(id || ''))) values.push(String(id).replace(/^abn:/,''));}
    for (const value of values.filter(v=>typeof v==='string'||typeof v==='number')) for (const p of identityVariants(value)) phrases.add(p);
  };
  for (const graph of graphs) for (const node of graph.nodes) if (node.kind==='donor' && !isOrganisationDonor(node)) add(node);
  const profiles = new Map();
  for (const file of (await readdir(join(root,'suppliers'))).filter(f=>f.endsWith('.json')).sort()) {
    for (const s of Object.values((await read('suppliers/'+file)).profiles)) {
      profiles.set(String(s.id),s);
      if (!isOrganisationRecipient({...s,...s.identity})) {suppliers.add(String(s.id));add(s);}
    }
  }
  for (const s of (await read('suppliers.json')).suppliers) {
    const profile = profiles.get(String(s.id));
    if (!isOrganisationRecipient(profile ? {...s,...profile,...profile.identity} : s)) {suppliers.add(String(s.id));add(s);}
  }
  for (const jur of ['federal','qld']) {
    for (const r of (await read(`graph/grants.${jur}.json`)).recipients) if (!isOrganisationRecipient(r)) add(r);
    for (const file of (await readdir(join(root,'grants',jur))).filter(f=>f.startsWith('shard-') && f.endsWith('.json')).sort()) for (const r of Object.values(await read(`grants/${jur}/${file}`))) if (!isOrganisationRecipient(r)) add(r);
  }
  const lengths = [...new Set([...phrases].map(p=>p.split(' ').length))].sort((a,b)=>a-b);
  return {phrases,suppliers,lengths,check:compileIdentityCheck(phrases)};
}
const literal = value => value == null ? 'NULL' : typeof value === 'number' && Number.isFinite(value) ? String(value) : "'" + String(value).replaceAll("'","''") + "'";

/** Sanitised SQL chunks live outside public/. No raw source snapshot is copied. */
export async function buildTableSQL({root=defaultRoot,output=fileURLToPath(new URL('../portal/private/dt-api/sql/',import.meta.url)),datasets,policy}={}) {
  if (!datasets) {const loaded=await tableRows(root);datasets=loaded.rows;policy=loaded.policy;}
  await mkdir(output,{recursive:true});
  for (const file of await readdir(output)) if (/^\d+-.*\.sql$|^manifest\.json$/.test(file)) await rm(join(output,file));
  const files=[],counts={};let bytes=0,part=0;
  const put=async (suffix,sql)=>{const file=String(part++).padStart(4,'0')+'-'+suffix+'.sql';await writeFile(join(output,file),sql);files.push(file);bytes+=Buffer.byteLength(sql);};
  let setup=tableSchema();
  for (const name of Object.keys(TABLE_DATASETS)) {const table=tableName(name);setup+=`DELETE FROM ${table};\nDELETE FROM ${table}_facets;\n`;}
  setup+='DELETE FROM table_private_identity;\nDELETE FROM table_meta;\n';
  await put('schema',setup);
  let sql='',pending=new Map();
  const insert=(prefix,values)=>{let list=pending.get(prefix)||[];if(list.length && Buffer.byteLength(prefix+' VALUES '+list.join(',')+','+values)>80_000){sql+=prefix+' VALUES '+list.join(',')+';\n';list=[];}list.push(values);pending.set(prefix,list);if(list.length>=100){sql+=prefix+' VALUES '+list.join(',')+';\n';pending.delete(prefix);}};
  const flush=async suffix=>{for(const [prefix,list]of pending)sql+=prefix+' VALUES '+list.join(',')+';\n';pending.clear();if(sql){await put(suffix,sql);sql='';}};
  for (const p of policy?.phrases || []) {
    const hash=createHash('sha256').update(p).digest('hex');
    insert('INSERT OR IGNORE INTO table_private_identity',`('${hash}',${p.split(' ').length})`);
    if (sql.length>2_000_000) await flush('privacy');
  }
  sql+=`INSERT INTO table_meta VALUES ('privacy_lengths',${literal(JSON.stringify(policy?.lengths || []))});\n`;
  await flush('privacy');
  for (const [name,config] of Object.entries(TABLE_DATASETS)) {
    const table=tableName(name);counts[name]=0;
    for (const {row} of datasets[name] || []) {
      // A second barrier protects callers supplying rows directly in tests/tools.
      if (config.privacy && policy?.check(Object.values(row).flat().join(' '))) throw new Error('Unsanitised financial row');
      const rowid=++counts[name];
      const values=config.columns.map(c=>arrayColumns.has(c.key) && Array.isArray(row[c.key]) ? JSON.stringify(row[c.key]) : row[c.key] ?? null);
      const search=config.columns.filter(c=>!['url','canonical_url'].includes(c.key)).map(c=>Array.isArray(row[c.key]) ? row[c.key].join(' ') : row[c.key] ?? '').join(' ');
      insert(`INSERT INTO ${table} (rowid,${config.columns.map(c=>quote(c.key)).join(',')},search)`,`(${rowid},${[...values,search].map(literal).join(',')})`);
      const facets=config.columns.filter(c=>c.facet==='multi'||c.facet==='chips').flatMap(c=>[...new Set([row[c.key]].flat().filter(v=>v!=null&&v!==''))].map(value=>`(${literal(c.key)},${literal(value)},${rowid})`));
      for(const facet of facets)insert(`INSERT INTO ${table}_facets (key,value,rowid)`,facet);
      if (sql.length>2_000_000) await flush(name);
    }
    await flush(name);
    await put(name+'-fts',`INSERT INTO ${table}_fts (${table}_fts) VALUES ('rebuild');\n`);
  }
  const version=createHash('sha256');for(const file of files)version.update(await readFile(join(output,file)));
  await put('version',`INSERT INTO table_meta VALUES ('version','${version.digest('hex').slice(0,24)}');\nANALYZE;\n`);
  const manifest={files,bytes,counts,privateIdentities:policy?.phrases.size||0,publicAssets:0};
  await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const result=await buildTableSQL();
    console.log(JSON.stringify({sqlFiles:result.files.length,bytes:result.bytes,rows:result.counts,privateIdentityHashes:result.privateIdentities,publicTableAssets:0}));
  } catch {console.error('Table load preparation failed; no source identities are logged.');process.exitCode=1;}
}
