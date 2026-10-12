// Synthetic figures and people, not a live current-term snapshot.
export const question='Who is making the most speeches about gambling reform';
export const fixtureDeps={
 async kb(path,body){
  const text=JSON.stringify(body),hasCommittee=text.includes('"chamber","label":"senate_committee"'),chamberOnly=text.includes('"not":{"or"');
  const rows=chamberOnly?{'Taylor Example':87,'Pat Example':60,'Alex Example':52}:hasCommittee?{'Alex Example':130,'Sam Sample':94,'Casey Sample':65}:{'Alex Example':182,'Sam Sample':94,'Taylor Example':87,'Casey Sample':65,'Pat Example':60};
  const collaborator=/"collaborator":"([^"]+)"/.exec(text)?.[1];
  return {fulltext:{total:collaborator?rows[collaborator]??0:Object.values(rows).reduce((a,b)=>a+b,0),facets:{'/u/o':Object.fromEntries(Object.entries(rows).map(([name,n])=>['/u/o/'+name,n]))}}};
 },
 async asset(path){return path==='/parliamentarians.json'?{people:['Taylor Example','Pat Example','Alex Example','Sam Sample','Casey Sample'].map(name=>({name,party:'Greens'}))}:path==='/bills/index.json'?{bills:[]}:null},
 async generate(_q,prompt){return {text:prompt.user.includes('Plan the record')?JSON.stringify({shape:'ranking',steps:[{tool:'count_speeches',args:{topic:'gambling',group_by:'speaker'}}]}):'Unsupported 999 [1].',tokens:{input:10,output:5},costUsd:0.001}}
};
