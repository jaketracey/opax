import {readFile, readdir, mkdir, writeFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join, resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {TABLE_DATASETS} from '../portal/src/table-datasets.mjs';
import {tableSchema,tableName,quote,arrayColumns} from './table-schema.mjs';
import {moneyFlowType} from '../portal/public/money-records.js';
import {instrumentTableRows} from '../portal/public/instruments.js';
import {categoryMembers} from '../portal/public/register-tables.js';
import {donorDisclosure} from '../portal/public/donor-disclosure.js';
import {contractTitle, placeholderContract, ausTenderURL} from '../portal/public/contracts-table.js';
import {divisionRows,votingRows,personVoteRecords} from '../portal/public/vote-tables.js';

const defaultRoot = fileURLToPath(new URL('../portal/public/', import.meta.url));
export async function interestTableRows(root) {
  const read = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
  const rows = [];
  for (const file of (await readdir(join(root, 'interests'))).filter(f => f.endsWith('.json')).sort()) {
    if (['index.json', 'recent.json', 'ties-by-donor.json'].includes(file)) continue;
    const v = await read('interests/' + file);
    for (const [category, bucket] of Object.entries(v.buckets || {})) for (const [i, item] of (bucket.items || []).entries()) {
      const date = item.date || v.as_at || null;
      const row = {id: `${file.slice(0, -5)}:${category}:${i}`, name: v.name, category, holder: item.holder || '', jurisdiction: v.jurisdiction, chamber: v.chamber, description: item.description || '', date, year: Number(String(date || '').slice(0, 4)) || null, url: v.source_url || ''};
      rows.push({row});
    }
  }
  return rows;
}

/** Read existing public snapshots only. No database or network operations. */
export async function tableRows(root = defaultRoot, {moneyOnly = false, graphs: suppliedGraphs, observe} = {}) {
  const read = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
  const files = async name => (await readdir(join(root, name))).filter(f => f.endsWith('.json')).sort();
  const graphs = suppliedGraphs || await Promise.all(['/graph/money.json','/graph/money.qld.json','/graph/money.vic.json','/graph/money.tas.json'].map(name => read(name.slice(1))));
  const rows = Object.fromEntries(Object.keys(TABLE_DATASETS).map(name => [name, []]));
  const add = (name,row) => rows[name].push({row});
  for (const [g,graph] of graphs.entries()) {
    const jurisdiction = ['federal','qld','vic','tas'][g], nodes = new Map(graph.nodes.map(n=>[n.id,n]));
    for (const [i,edge] of graph.edges.entries()) {
      const type = moneyFlowType(edge,nodes);if (!type) continue;
      const from = nodes.get(edge.source),to = nodes.get(edge.target);
      const donors = [from,to].filter(n=>n.kind==='donor');
      const identity=donors[0] ? donorDisclosure(donors[0]) : null;
      const row = {return_reference:identity?.reference || '',from_href:from.kind==='donor' ? donorDisclosure(from).href : from.profileUrl || '',to_href:to.kind==='donor' ? donorDisclosure(to).href : to.profileUrl || '',id:`${jurisdiction}:${i}`,from:from.label,to:to.label,type,jurisdiction,industry:donors[0]?.industry || '',amount:edge.total,count:edge.count ?? 0,firstYear:edge.firstYear ?? null,lastYear:edge.lastYear ?? null};
      add('money-connections',row);
      if (type==='receipts') add('party-money',row);
    }
  }
  for (const s of (await read('suppliers.json')).suppliers) add('suppliers', {id:s.id,name:s.name,abn:s.abn,jurisdiction:'federal',total:s.total,count:s.count,agency_count:s.agency_count,first_year:s.first_year,last_year:s.last_year});
  const contractIds = new Set();
  for (const file of await files('suppliers')) for (const s of Object.values((await read('suppliers/' + file)).profiles)) for (const c of s.contracts || []) {
    if (contractIds.has(c.id) || placeholderContract(c)) continue;
    contractIds.add(c.id);
    add('contracts', {id: c.id, title: contractTitle({...c,supplier:s.name}), supplier: s.name, supplier_id:s.id, agency: c.agency || '', procurement_method: c.procurement_method || '', jurisdiction: 'federal', amount: c.amount, start_date: c.start_date || null, end_date: c.end_date || null, description: c.description || '', url: ausTenderURL(c) || ''});
  }
  for (const jur of ['federal', 'qld']) {
    const index = await read(`graph/grants.${jur}.json`).catch(()=>({recipients:[]}));
    const profiles = new Set((index.recipients || []).map(r => String(r.id)));
    for (const file of (await files('grants/' + jur)).filter(f => f.startsWith('shard-'))) for (const r of Object.values(await read(`grants/${jur}/${file}`))) for (const [i, g] of (r.grants || []).entries()) {
      add('grants', {id: String(g.id ?? `${r.id}:${i}`), title: g.n || g.pr || g.id || '', recipient: r.n, agency: g.ag || '', program: g.pr || '', category: g.cat || '', jurisdiction: jur, amount: g.v, year: Number(String(g.fy || g.s || '').slice(0, 4)) || null, start_date: g.s || null, description: g.desc || '', url: g.guid ? `https://www.grants.gov.au/Ga/Show/${g.guid}` : '', electorate: g.el || 'Not recorded', recipientId: r.id, recipientKind: r.k || r.identity?.kind || '', recipientABNType: r.abr?.etype || r.abr?.type || r.identity?.type || '', recipientAvailable: profiles.has(String(r.id)) ? 1 : 0});
    }
  }
  if (moneyOnly) return {rows};
  const bills = (await read('bills/index.json')).bills, billScopes = new Map(), stages = new Map();
  for (const bill of bills) {
    const seen = new Set();
    for (const division of (await read(`bills/${bill.key}.json`)).divisions || []) {
      const duplicate = [division.date,division.stage,division.ayes,division.noes,division.house].join('|');
      if (seen.has(duplicate)) continue;
      seen.add(duplicate);
      const scope = billScopes.get(division.key) || []; scope.push(bill.key); billScopes.set(division.key,scope);
      if (division.stage) stages.set(division.key,division.stage);
    }
  }
  const weeks = (await read('hubs/index.json')).weeks;
  for (const d of (await read('divisions/index.json')).divisions) {
    const v = await read('divisions/' + d.slug + '.json');
    const projected = divisionRows([{...v,title:v.name,stage:stages.get(d.key)}])[0];
    add('divisions', {...projected,id:v.slug,bill:billScopes.get(d.key) || [],sitting:v.jurisdiction==='federal' ? weeks.filter(w=>v.date>=w.start && v.date<=w.end).map(w=>w.start) : [],name:v.name,question:v.question,jurisdiction:v.jurisdiction,house:v.house,result:v.result,member_count:d.member_count,url:v.source_url});
  }
  // Preserve the schema-1 votes export byte for byte; this is a separate projection.
  const recent = await read('seo/recent-votes.json');
  const votes = await read('votes.json');
  for (const [person, v] of Object.entries(votes)) if (v && typeof v === 'object' && typeof v.name === 'string') {
    const records = personVoteRecords([person],votes,recent).rows;
    for (const [i,record] of votingRows(records,bills).entries()) add('votes', {...record,id:`${person}:${i}`,person,name:v.name,party:v.party,jurisdiction:v.jurisdiction,house:v.house,ayes:v.ayes,noes:v.noes,divisions_total:v.divisions_total,first_year:v.years?.[0] ?? null,last_year:v.years?.at(-1) ?? null});
  }
  const instruments = await read('instruments/index.json');
  const projected = new Map((await instrumentTableRows(path=>read(path.slice(1)),await read('instruments/manifest.json'),instruments.records)).map(row=>[row.id,row]));
  for (const values of instruments.records) {
    const v = Object.fromEntries(instruments.fields.map((field, i) => [field, values[i]]));
    add('instruments', {id: v.id, title: v.title, portfolios: projected.get(v.id).portfolios, type: v.type, status: v.status, commenced: v.commenced || null, year: projected.get(v.id).year, registered:projected.get(v.id).registered});
  }
  for (const v of (await read('audit/index.json')).records) add('audit-reports', {id: v.id, title: v.title, report_label: v.report_label, sectors: categoryMembers(v.sectors), entities: v.entities, jurisdiction: 'qld', number: v.number, year: Number(String(v.year).slice(0, 4)) || null, tabled_date: v.tabled_date, canonical_url: v.canonical_url});
  for (const entry of await interestTableRows(root)) add('interests',entry.row);
  return {rows};
}


const literal = value => value == null ? 'NULL' : typeof value === 'number' && Number.isFinite(value) ? String(value) : "'" + String(value).replaceAll("'","''") + "'";

/** Sanitised SQL chunks live outside public/. No raw source snapshot is copied. */
export async function buildTableSQL({root=defaultRoot,output=fileURLToPath(new URL('../portal/private/dt-api/sql/',import.meta.url)),datasets}={}) {
  if (!datasets) {const loaded=await tableRows(root);datasets=loaded.rows;}
  await mkdir(output,{recursive:true});
  for (const file of await readdir(output)) if (/^\d+-.*\.sql$|^manifest\.json$/.test(file)) await rm(join(output,file));
  const files=[],counts={};let bytes=0,part=0;
  const put=async (suffix,sql)=>{const file=String(part++).padStart(4,'0')+'-'+suffix+'.sql';await writeFile(join(output,file),sql);files.push(file);bytes+=Buffer.byteLength(sql);};
  // Rebuild these projections when reloading an earlier summary-only database.
  let setup=['divisions','votes'].map(name=>`DROP TABLE IF EXISTS table_${name}_fts;\nDROP TABLE IF EXISTS table_${name}_facets;\nDROP TABLE IF EXISTS table_${name};\n`).join('')+tableSchema();
  for (const name of Object.keys(TABLE_DATASETS)) {const table=tableName(name);setup+=`DELETE FROM ${table};\nDELETE FROM ${table}_facets;\n`;}
  setup+='DELETE FROM table_meta;\n';
  await put('schema',setup);
  let sql='',pending=new Map();
  const insert=(prefix,values)=>{let list=pending.get(prefix)||[];if(list.length && Buffer.byteLength(prefix+' VALUES '+list.join(',')+','+values)>80_000){sql+=prefix+' VALUES '+list.join(',')+';\n';list=[];}list.push(values);pending.set(prefix,list);if(list.length>=100){sql+=prefix+' VALUES '+list.join(',')+';\n';pending.delete(prefix);}};
  const flush=async suffix=>{for(const [prefix,list]of pending)sql+=prefix+' VALUES '+list.join(',')+';\n';pending.clear();if(sql){await put(suffix,sql);sql='';}};
  for (const [name,config] of Object.entries(TABLE_DATASETS)) {
    const table=tableName(name);counts[name]=0;
    for (const {row} of datasets[name] || []) {
      const rowid=++counts[name];
      const values=config.columns.filter(c=>!c.computed).map(c=>arrayColumns.has(c.key) && Array.isArray(row[c.key]) ? JSON.stringify(row[c.key]) : row[c.key] ?? null);
      const search=config.columns.filter(c=>!c.computed && (config.searchKeys ? config.searchKeys.includes(c.key) : !['url','canonical_url'].includes(c.key))).map(c=>Array.isArray(row[c.key]) ? row[c.key].join(' ') : row[c.key] ?? '').join(' ');
      insert(`INSERT INTO ${table} (rowid,${config.columns.filter(c=>!c.computed).map(c=>quote(c.key)).join(',')},search)`,`(${rowid},${[...values,search].map(literal).join(',')})`);
      const facets=config.columns.filter(c=>c.facet==='multi'||c.facet==='chips').flatMap(c=>[...new Set([row[c.key]].flat().filter(v=>v!=null&&v!==''))].map(value=>`(${literal(c.key)},${literal(value)},${rowid})`));
      for(const facet of facets)insert(`INSERT INTO ${table}_facets (key,value,rowid)`,facet);
      if (sql.length>2_000_000) await flush(name);
    }
    await flush(name);
    await put(name+'-fts',`INSERT INTO ${table}_fts (${table}_fts) VALUES ('rebuild');\n`);
  }
  const version=createHash('sha256');for(const file of files)version.update(await readFile(join(output,file)));
  // Publish the data version after all projections and their indexes are loaded.
  await put('version',`INSERT INTO table_meta VALUES ('version','${version.digest('hex').slice(0,24)}');\nANALYZE;\n`);
  const manifest={files,bytes,counts,publicAssets:0};
  await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
// CI uses metadata-only releases to skip private reload SQL preparation.
// --sql remains available to the separate table reload lane.
export function tableMetadataOnly(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--metadata-only') && argv.includes('--sql')) throw new Error('Conflicting table build modes');
  return !argv.includes('--sql') && (argv.includes('--metadata-only') || env.OPAX_TABLE_METADATA_ONLY === '1');
}
export async function buildTableAssets({root=defaultRoot, output, metadataOnly=false, datasets}={}) {
  if (metadataOnly) return {publicAssets:0};
  datasets ||= (await tableRows(root)).rows;
  return buildTableSQL({root,output,datasets});
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const result=await buildTableAssets({metadataOnly:tableMetadataOnly()});
    console.log(JSON.stringify({sqlFiles:result.files?.length || 0,bytes:result.bytes || 0,...(result.counts?{rows:result.counts}:{}),publicTableAssets:0}));
  } catch {console.error('Table load preparation failed; no source identities are logged.');process.exitCode=1;}
}
