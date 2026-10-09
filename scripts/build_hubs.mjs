// Built on every nightly deploy from published exports. No network or new cron.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { deriveWeek, latest, recentWindow, recentRecords } from '../portal/public/hubs-data.js';

export async function buildHubs(root, configRoot = fileURLToPath(new URL('./hubs/', import.meta.url))) {
  const read = async p => JSON.parse(await readFile(join(root, p.replace(/^\//, '')), 'utf8'));
  const config = async p => JSON.parse(await readFile(join(configRoot, p), 'utf8'));
  const [calendar, estimates, billsIndex, divisionsIndex, agencies, grants] = await Promise.all([
    config('sitting-2026.json'), config('estimates-2026-10.json'), read('bills/index.json'),
    read('divisions/index.json'), read('agencies.json'), read('graph/grants.federal.json'),
  ]);
  const titles = new Map();
  const bills = [];
  for (const row of billsIndex.bills) {
    const b = await read(`bills/${row.key}.json`);
    for (const d of b.divisions || []) if (d.title) titles.set(d.key.replace(/^division-/, ''), d.title);
    if (calendar.periods.some(w => w.start <= b.introduced && b.introduced <= w.end)) {
      bills.push(Object.fromEntries(['key','title','jurisdiction','introduced','originating_house','sponsor','sponsor_person_id','summary','sources'].map(k => [k,b[k] ?? null])));
    }
  }
  const divisions = [];
  for (const row of divisionsIndex.divisions) {
    if (!/^(?:au-)?federal-/.test(row.key) || !calendar.periods.some(w => w.start <= row.date && row.date <= w.end)) continue;
    const d = await read(`divisions/${row.slug}.json`);
    divisions.push(Object.fromEntries(['key','slug','title','name','question','date','house','jurisdiction','result','ayes','noes','source_url'].map(k => [k,k === 'title' ? d.title || titles.get(d.key) || null : d[k] ?? null])));
  }
  const weeks = calendar.periods.map(w => deriveWeek(w,bills,divisions,calendar.updated));
  const contractWindow = recentWindow(agencies.meta.generated_at);
  const grantWindow = recentWindow(grants.meta.generated);
  const wanted = new Set(estimates.committees.flatMap(c => c.program?.agencies || c.portfolios.flatMap(p => p.agencies)));
  const records = new Map();
  for (const name of wanted) {
    const entry = agencies.agencies.find(a => a.name === name);
    if (!entry) throw new Error(`Unknown configured portfolio agency: ${name}`);
    const profile = await read(entry.profile_path);
    records.set(name,{ id:entry.id,name:entry.name,contracts:recentRecords(profile.contracts,contractWindow,'published','amount'),grants:{ count:0,total:0,largest:[] } });
  }
  const agencyGrants = new Map([...wanted].map(n => [n,[]]));
  const names = new Map([...wanted].flatMap(n => [[n,n],...(estimates.grant_agency_aliases?.[n] || []).map(alias => [alias,n])]));
  for (const file of (await readdir(join(root,'grants/federal'))).filter(f => /^shard-\d+\.json$/.test(f)).sort()) {
    const shard = await read(`grants/federal/${file}`);
    for (const recipient of Object.values(shard)) for (const g of recipient.grants || []) {
      const name = names.get(g.ag);
      if (!name) continue;
      const privateRecipient = ['individual','person','undisclosed'].includes(recipient.k) || recipient.id?.startsWith('person:');
      agencyGrants.get(name).push({ id:g.id,value:g.v,title:g.n || g.pr || g.id,date:g.s,
        recipient:privateRecipient ? 'Recipient name withheld' : recipient.n,
        url:g.guid ? `https://www.grants.gov.au/Ga/Show/${encodeURIComponent(g.guid)}` : 'https://www.grants.gov.au/Ga/List',
        link_scope:g.guid ? 'award' : 'source_register' });
    }
  }
  // Strip every funding/donor/party field from the projection before publication.
  for (const [name,a] of records) {
    a.contracts.largest = a.contracts.largest.map(c => Object.fromEntries(['id','title','supplier','amount','published','start_date','url','link_scope'].map(k => [k,c[k] ?? null])));
    a.grants = recentRecords(agencyGrants.get(name),grantWindow,'date','value');
  }
  const estimatePage = { ...estimates,contractWindow,grantWindow,contractUpdated:agencies.meta.generated_at,grantUpdated:grants.meta.generated,
    agencies:[...records.values()].sort((a,b) => a.name.localeCompare(b.name,'en')) };
  const pages = [{path:'/sitting',lastmod:latest(weeks.map(w => w.lastmod))},...weeks.map(w => ({path:`/sitting/${w.start}`,lastmod:w.lastmod})),{path:`/estimates/${estimates.id}`,lastmod:estimates.updated}];
  await mkdir(join(root,'hubs'),{recursive:true});
  await writeFile(join(root,'hubs/index.json'),JSON.stringify({updated:calendar.updated,sources:calendar.sources,weeks,pages})+'\n');
  await writeFile(join(root,`hubs/estimates-${estimates.id}.json`),JSON.stringify(estimatePage)+'\n');
  return {weeks:weeks.length,agencies:records.size,pages:pages.length};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log('Hubs:',JSON.stringify(await buildHubs(fileURLToPath(new URL('../portal/public/',import.meta.url)))));
