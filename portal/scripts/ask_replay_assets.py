"""Rebuild the trimmed assets the Ask replay fixtures hold (portal/test/ask-replay.test.mjs) from public/.

Run from portal/ only when re-recording a fixture: it rewrites the assets of 03-money-ranking, 04-pay and 06-vote.
Donors are renamed to invented companies, so no real donor (company or private person) is named in the fixtures.
"""
import json
from urllib.parse import quote
P='public/'; D='test/fixtures/ask-replay/'
def load(p): return json.load(open(P+p))
def fx(n): return json.load(open(D+n))
def save(n,f): json.dump(f,open(D+n,'w'),indent=1,ensure_ascii=False); open(D+n,'a').write('\n')
# pay: every rate and the base history, with four sitting members (two office holders, two backbenchers); no other people.
pay=load('pay.json')
keep=[c for c in pay['current'] if c['post'] in ('Prime Minister','Treasurer')]+[c for c in pay['current'] if c['pct']==0][:2]
ids={c['id'] for c in keep}
small={**pay,'current':keep,'people':{k:v for k,v in pay['people'].items() if k in ids},'names':{k:v for k,v in pay['names'].items() if v in ids}}
small['meta']={**pay['meta'],'people':len(small['people']),'sitting':len(keep)}
offices=load('pay-offices.json'); offices={**offices,'offices':offices['offices'][:4]}
f=fx('04-pay.json'); f['assets']={'/pay.json':small,'/pay-offices.json':offices}; save('04-pay.json',f)
# money: the Liberal Party node and its four largest 2022-23 donor flows, every donor renamed to an invented company.
money=load('graph/money.json')
lib=next(n for n in money['nodes'] if n['id']=='party:Liberal')
edges=sorted([e for e in money['edges'] if e['target']=='party:Liberal' and e['byYear'].get('2022') and e['source'].startswith('donor:')],key=lambda e:-e['byYear']['2022'][0])[:4]
names=['Example Freight Pty Ltd','Sample Banking Group Ltd','Harbour Example Holdings','Placeholder Medical Industries Ltd']
nodes=[lib];newedges=[]
for e,name in zip(edges,names):
    src=next(n for n in money['nodes'] if n['id']==e['source'])
    nid='donor:'+name.lower()
    n={k:v for k,v in src.items() if k not in ('aliases','contracts','grants','publicMoney','associated_entity','via','associatedTag','associatedWith')}
    n.update(id=nid,label=name,aliases=[],source_name=name,lookup_names=[name],returnReferences=[{**r,'source_name':name} for r in src.get('returnReferences',[])[:3]])
    if 'match' in n: n['match']={**n['match'],'href':'/subject/donor/'+quote(name),'entity_id':name.lower().replace(' ','-')}
    nodes.append(n); newedges.append({**e,'source':nid})
meta={k:v for k,v in money['meta'].items() if not isinstance(v,(dict,list)) or k in ('by_year',)}
meta.update(donor_nodes=len(nodes)-1,party_nodes=1,edge_count=len(newedges))
f=fx('03-money-ranking.json'); f['assets']={'/graph/money.json':{'meta':meta,'nodes':nodes,'edges':newedges}}; save('03-money-ranking.json',f)
# vote: the NACC Bill's divisions in the index, and the division files the lookup reads.
idx=load('divisions/index.json')
divs=[x for x in idx['divisions'] if any(b['key']=='au-federal-r6917' for b in x.get('bills',[]))]
files={f'/divisions/division-{x["key"]}.json':load(f'divisions/division-{x["key"]}.json') for x in divs if x['key'].startswith('federal-senate')}
f=fx('06-vote.json'); f['assets']={'/divisions/index.json':{**{k:v for k,v in idx.items() if k!='divisions'},'count':len(divs),'divisions':divs},**files}; save('06-vote.json',f)
