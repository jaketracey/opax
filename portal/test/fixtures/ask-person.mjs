// Synthetic parliamentary evidence and model replies. Never contacts a service.
export const speaker='David Shoebridge';
export const themes=[['integrity-democracy','Integrity & democracy'],['justice-law','Justice & law'],['defence-security','Defence & security'],['housing','Housing'],['climate-environment','Climate & environment']];
export const speeches=Array.from({length:1649},(_,i)=>{
 const theme=themes[i%5];
 return {slug:'speech-'+(i+1),resource:(i+1).toString(16).padStart(32,'0'),title:i===1648?'Parliamentary scrutiny':theme[1]+' debate',speaker,
  date:i===1648?'2026-10-09':i===1647?'2026-10-08':i<100?'2026-05-01':'2020-02-01',topics:[theme[0]],state:'federal',chamber:'senate',
  text:`I called for parliamentary scrutiny of ${theme[1].toLowerCase()} and proposed that the committee examine the evidence. The public record should explain the proposal and its stated limits.\n\nSenator Other: This later reply is excluded from the indexed speaking turn.`};
});
export const bills=[{key:'au-federal-example-2026',title:'Example Scrutiny Bill 2026',introduced:'2026-06-01',sponsor:speaker,speech_dates:['2026-09-01']}];
export const catalogueCounts=Object.fromEntries(themes.map(([slug])=>[slug,speeches.filter(s=>s.topics.includes(slug)).length]));
export function resource(s){return {slug:s.slug,title:s.title,origin:{collaborators:[s.speaker],url:'https://www.aph.gov.au/fixture-record'},extra:{metadata:{date:s.date,person_id:'11010'}},
 usermetadata:{classifications:[{labelset:'kind',label:'speech'},{labelset:'state',label:s.state},{labelset:'chamber',label:s.chamber},{labelset:'party',label:'Greens'}]},
 computedmetadata:{field_classifications:[{classifications:s.topics.map(label=>({labelset:'topic',label}))}]},
 fields:{'t/body':{paragraphs:{[s.resource+'/t/body/0-200']:{text:s.text,score:0.95,score_type:'RERANKER'}}}},data:{texts:{body:{value:{body:s.text}}}}};}
export function stubModel(body){
 const records=(body.extra_context || []).map(v=>JSON.parse(v));
 const aggregate=JSON.parse(records[0].record);
 const speechIndex=theme=>records.findIndex(r=>r.kind==='speech'&&r.record.includes('Topic label: '+theme));
 const recentIndex=records.findIndex(r=>r.kind==='speech'&&r.record.includes('2026-10-09'));
 const billIndex=records.findIndex(r=>r.kind==='bill');
 const footnotes={};let n=0;
 const cite=index=>{footnotes['block-F'+(++n)]='USER_CONTEXT_'+index;return `[^${n}]`};
 const q=i=>records[i].record.split('\n').slice(1).join('\n').split('. ')[0]+'.';
 const answer=[
  `David Shoebridge’s ${aggregate.speeches.toLocaleString()} indexed speeches cover five recurring themes. ${aggregate.topics.map(t=>`${t.name.toLowerCase()} appears in ${t.count} speeches (${t.recent_count} in the year to 10 October 2026)`).join('; ')}. Topic labels overlap, so these counts are not added together.${cite(0)}`,
  `On integrity & democracy and justice & law, he called for committees to examine the evidence behind proposals.${cite(speechIndex('Integrity & democracy'))}${cite(speechIndex('Justice & law'))} His speeches on defence & security, housing and climate & environment also recorded calls for parliamentary scrutiny.${cite(speechIndex('Defence & security'))}${cite(speechIndex('Housing'))}${cite(speechIndex('Climate & environment'))}`,
  '**Recent speeches and bills**',
  `His latest dated speech in this fixture record was “Parliamentary scrutiny” on 9 October 2026. It called for a committee to examine the evidence and for proposals to state their limits.${cite(recentIndex)} The Example Scrutiny Bill 2026 was introduced on 1 June 2026; the bill export links a speech by Shoebridge on 1 September 2026. These are introduction and speech dates, and do not establish how he voted.${cite(billIndex)}`,
  '**In his words**',
  `> ${q(speechIndex('Integrity & democracy'))}${cite(speechIndex('Integrity & democracy'))}`,
  `> ${q(speechIndex('Housing'))}${cite(speechIndex('Housing'))}`,
 ].join('\n\n')+'\n\n'+Object.keys(footnotes).map((block,i)=>`[^${i+1}]: ${block}`).join('\n');
 return {answer,citation_footnote_to_context:footnotes,retrieval_results:{resources:{}}};
}
