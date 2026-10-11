// Wrangler-only fixture entry. Never imported by the production Worker.
import worker from '../src/index.ts';
import {tablePrivacyCheck} from '../src/table-privacy.ts';
import {divisionTableConfig, voteTableConfig, divisionRows, votingRows} from '../public/vote-tables.js';
import {applyQuery, parseQuery, toCSV} from '../public/datatable.js';
import {MONEY_GRAPHS, isOrganisationDonor} from '../public/donor-entity.js';
import {divisions, votes, hubDivisions} from './fixtures/dt-votes.mjs';

let fixture;
async function fixtures(assets) {
  if (!fixture) fixture = (async () => {
    const read = async path => (await assets.fetch(new Request('https://fixture.test'+path))).json();
    const [roster, records, bill, hubs, ...graphs] = await Promise.all([
      read('/parliamentarians.json'), read('/votes.json'), read('/bills/au-federal-r7534.json'), read('/hubs/index.json'), ...MONEY_GRAPHS.map(read),
    ]);
    const member = roster.people.find(p => p.pid && records[p.pid]?.for?.length >= 6);
    const withheld = graphs.flatMap(g => g.nodes.filter(n => n.kind === 'donor' && !isOrganisationDonor(n)).map(n => n.label)).slice(0,2);
    const check = await tablePrivacyCheck(assets);
    const privateDivisions = [...divisions, ...withheld.map((text,i) => ({...divisions[i], key:`withheld-${i}`, stage:text}))];
    const privateVotes = [...votes, ...withheld.map((text,i) => ({...votes[i], title:text, party_position:text}))];
    const publicVotes = votingRows(privateVotes).filter(row => check(JSON.stringify(row)));
    const publicDivisions = privateDivisions.filter(d => check(JSON.stringify(d)));
    const week = hubs.weeks.find(w => w.start === '2026-09-14');
    const index = {...hubs, weeks:hubs.weeks.map(w => w === week ? {...w,bills:[],divisions:hubDivisions} : w)};
    const assetsByPath = new Map([
      ['/bills/au-federal-r7534.json', {...bill,divisions:publicDivisions}],
      ['/hubs/index.json', index],
      ['/seo/recent-votes.json', {_meta:{schema:1,source:'opax-parli-db',coverage:'recorded'}, people:{[member.pid]:{name:member.name,recent:votes}}}],
    ]);
    const wrapped = {fetch:request => assetsByPath.has(new URL(request.url).pathname)
      ? Promise.resolve(Response.json(assetsByPath.get(new URL(request.url).pathname))) : assets.fetch(request)};
    return {member, check, privateDivisions, privateVotes, publicVotes, wrapped};
  })();
  return fixture;
}

export default {
  async fetch(request, env, ctx) {
    const f = await fixtures(env.ASSETS), url = new URL(request.url);
    if (url.pathname === '/__fixtures/table/meta') return Response.json({pid:f.member.pid, slug:f.member.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''), rows:64});
    if (/^\/api\/table\/(divisions|votes)$/.test(url.pathname)) {
      const isVote = url.pathname.endsWith('/votes');
      const checked = new Map();
      const check = text => {if (!checked.has(text)) checked.set(text,f.check(text)); return checked.get(text);};
      const config = isVote ? voteTableConfig(f.member.pid,'Voting record',check) : divisionTableConfig({},'Divisions','bill',check);
      let rows = isVote ? votingRows(f.privateVotes) : divisionRows(url.searchParams.has('start') ? hubDivisions : f.privateDivisions);
      // Exercise the endpoint's server-side cap with generated public rows.
      if (url.searchParams.get('fixture') === 'cap') rows = Array.from({length:50003},(_,i) => rows[i % 64]);
      const query = parseQuery(url.searchParams);
      if (url.searchParams.get('format') === 'csv') {
        const all = applyQuery(rows,config,{...query,page:1,pageSize:50000});
        return new Response(toCSV(all.rows,config),{headers:{'content-type':'text/csv','x-table-export-truncated':String(all.total>50000)}});
      }
      return Response.json(applyQuery(rows,config,query));
    }
    // Only the read-only privacy validator reaches real API dispatch.
    if ((url.pathname.startsWith('/api/') && url.pathname !== '/api/table/privacy') || url.pathname.startsWith('/ingest/')) return Response.json({results:[],total:0,collections:[]});
    if (url.pathname.startsWith('/bill-texts/')) return new Response('No fixture text',{status:404});
    if (['/bills/au-federal-r7534.json','/hubs/index.json','/seo/recent-votes.json'].includes(url.pathname)) return f.wrapped.fetch(request);
    return worker.fetch(request,{...env,ASSETS:f.wrapped},ctx);
  },
};
