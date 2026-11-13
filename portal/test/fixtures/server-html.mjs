// Invented organisations and speakers. Shared by the offline Worker and browser checks.
export const recipientId = 'abn:00000000001';
export const agencyIds = ['a-00000000000000000001', 'a-00000000000000000002'];
export const topics = ['housing', 'climate-environment'];
export const counts = {count: 43, labelled: 500, parties: [['Example Party', 30]], states: [['federal',43,0.086]]};
export const speeches = {results: Array.from({length:25}, (_,i)=>({slug:`fixture-speech-${i+1}`, resource:`fixture-${i+1}`, title:`Example debate ${i+1}`, speaker:'Alex Example', party:'Example Party', date:`2026-10-${String(30-i).padStart(2,'0')}`, state:'federal', chamber:'representatives', url:`https://example.org/hansard/${i+1}`, snippet:'A fixture passage about the recorded proposal.'}))};
export const files = {'/social/programs.json': {programs:[]}};
for (const jur of ['federal','qld']) {
  const programId = jur === 'federal' ? 'GO-FIXTURE' : 'example-recovery';
  const key = programId.toLowerCase();
  const name = jur === 'federal' ? 'Example Community Programme' : 'Example Queensland Recovery';
  const recipient = {id:recipientId,n:'Example Community Ltd',t:25000,c:25,sh:0,k:'company'};
  const grants = Array.from({length:25},(_,i)=>({id:`GA${100+i}`,n:`Example award ${i+1}`,pr:name,ag:'Department of Example Services',v:1000,fy:'2025-26',s:'2026-01-02',rid:recipientId,rn:recipient.n,k:'company',guid:`fixture-${i+1}`}));
  const program = {id:programId,key,n:name,jur,ag:'Department of Example Services',t:25000,c:25,r:1,y0:'2025-26',y1:'2025-26',grants,grants_total:25,grants_listed:25,recipients:[[recipientId,recipient.n,25000,25,'company']],agencies:[['Department of Example Services',25000]],by:[],cats:[],pbs:[],electorates:[]};
  program.grants = grants.map((grant, i) => i === 1 || i === 24
    ? {...grant, rid:'name:example outside catalogue ltd', rn:'Example Outside Catalogue Ltd'} : grant);
  files[`/graph/grants.${jur}.json`] = {meta:{label:jur==='qld'?'Queensland':'Commonwealth',sourceShort:'Example source',source_url:'https://example.org/grants',years:['2025-26'],counts:{dollars:25000,grants:25,recipients:1,donor_recipients:0,donor_share:0,donor_dollars:0,abn_known_share:1,top_listed:1},generated:'2026-10-30',coverage:'2025-26'},programs:[program],recipients:[recipient],agencies:['Department of Example Services'],years:{'2025-26':{t:25000,c:25,dt:0}},categories:[],kinds:{company:{r:1,t:25000}},electorates:[]};
  files[`/grants/${jur}/programs/${key}.json`] = program;
  files[`/grants/${jur}/shard-00.json`] = {'abn-00000000001': {...recipient,jur,grants,more:0,programs:[[name,25000,25]],agencies:[['Department of Example Services',25000,25]],by:[]}};
}
const agencies = agencyIds.map((id,i)=>({id,name:`Department of Example ${i+1}`,total:50000,count:25,supplier_count:25,profile_path:`/agencies/${id}.json`}));
files['/agencies.json'] = {meta:{source:'AusTender, Department of Finance',source_url:'https://www.tenders.gov.au/'},agencies};
for(const agency of agencies) files[agency.profile_path] = {...agency,
  suppliers:Array.from({length:25},(_,i)=>({id:`s-${String(i+1).padStart(20,'0')}`,name:`Example Supplier ${i+1} Pty Ltd`,total:2000,count:1,donor_links:[]})).reverse(),
  contracts:Array.from({length:25},(_,i)=>({id:`CN${i+1}`,title:`Example contract ${i+1}`,supplier:'Example Supplier Pty Ltd',amount:2000,start_date:'2026-01-02',url:`https://www.tenders.gov.au/Search/KeywordSearch?keyword=CN${i+1}`})),years:[],undated:{total:0,count:0},withheld:[]};
export const paths = [
  ...['federal','qld'].map(jur=>`/money/grants/${jur}/recipient/${encodeURIComponent(recipientId)}`),
  ...agencyIds.map(id=>`/subject/agency/${id}`),
  '/money/grants?jur=federal&program=GO-FIXTURE', '/money/grants?jur=qld&program=example-recovery',
  ...topics.map(slug=>`/subject/topic/${slug}`),
];
