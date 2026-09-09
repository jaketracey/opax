const parliaments = {federal:'Federal',nsw:'New South Wales',vic:'Victoria',qld:'Queensland',sa:'South Australia',wa:'Western Australia',tas:'Tasmania',act:'ACT',nt:'Northern Territory'};
const houses = {representatives:'House of Representatives',senate:'Senate',assembly:'Legislative Assembly',council:'Legislative Council',nsw_la:'Legislative Assembly',nsw_lc:'Legislative Council',vic_la:'Legislative Assembly',vic_lc:'Legislative Council',qld_la:'Legislative Assembly',sa_ha:'House of Assembly',sa_lc:'Legislative Council'};
export function profileJurisdictions(person) {
  const jurisdictions = [...new Set(person?.states || [])].map(id=>({id,label:parliaments[id]||id}));
  const chambers = [...new Set((person?.chambers || []).filter(c=>!c.includes('committee')))].map(c=>houses[c]||c.replaceAll('_',' '));
  const representations = (person?.representation || []).filter(r=>person.states.includes(r.jurisdiction)&&person.chambers.includes(r.chamber)&&r.electorate);
  return {jurisdictions,chambers,representations};
}
