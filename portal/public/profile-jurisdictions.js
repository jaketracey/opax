const parliaments = {federal:'Federal',nsw:'New South Wales',vic:'Victoria',qld:'Queensland',sa:'South Australia',wa:'Western Australia',tas:'Tasmania',act:'ACT',nt:'Northern Territory'};
const houses = {representatives:'House of Representatives',senate:'Senate',assembly:'Legislative Assembly',council:'Legislative Council',nsw_la:'Legislative Assembly',nsw_lc:'Legislative Council',vic_la:'Legislative Assembly',vic_lc:'Legislative Council',qld_la:'Legislative Assembly',sa_ha:'House of Assembly',sa_lc:'Legislative Council',wa_la:'Legislative Assembly',wa_lc:'Legislative Council',tas_ha:'House of Assembly',tas_lc:'Legislative Council',act_la:'Legislative Assembly',nt_la:'Legislative Assembly'};
export function profileJurisdictions(person) {
  const jurisdictions = [...new Set(person?.states || [])].map(id=>({id,label:parliaments[id]||id}));
  const chambers = [...new Set((person?.chambers || []).filter(c=>!c.includes('committee')))].map(c=>houses[c]||c.replaceAll('_',' '));
  const representations = (person?.representation || []).filter(r=>person.states.includes(r.jurisdiction)&&person.chambers.includes(r.chamber)&&r.electorate);
  return {jurisdictions,chambers,representations};
}

/** Each house in the record as one fact with its parliament ("Senate, Federal"),
 *  so the person header can wrap a house and its parliament together, and whether
 *  the roster shows a sitting member in it now:
 *  - 'current': a verified current seat (`seatsNow`, the electorate reference) is in
 *    that house; or, with no verified seat, a dated service record there is still open.
 *  - 'former': the member sits in another house now.
 *  - 'unknown': a sitting member with several houses and nothing saying which is
 *    current. The header leaves such a house out, so a former house is never shown unmarked.
 *  - '': not a sitting member, or a sitting member's only house. */
export function profileHouses(person, seatsNow = []) {
  const states = [...new Set(person?.states || [])];
  const stateOnly = states.filter(s => s !== 'federal');
  const parliamentOf = chamber => chamber === 'senate' || chamber === 'representatives' ? 'federal'
    : chamber.includes('_') && parliaments[chamber.split('_')[0]] ? chamber.split('_')[0]
    : stateOnly.length === 1 ? stateOnly[0] : '';
  const sitting = Boolean(person?.current);
  const seats = sitting ? seatsNow.filter(s => s?.chamber) : [];
  const open = sitting && !seats.length ? profileAffiliations(person).filter(r => !r.end) : [];
  const now = new Set([...seats, ...open].map(s => s.chamber));
  const ids = [...new Set([...seats.map(s => s.chamber), ...(person?.chambers || [])].filter(c => !c.includes('committee')))];
  const rows = ids.map(chamber => {
    const jurisdiction = seats.find(s => s.chamber === chamber)?.jurisdiction || parliamentOf(chamber);
    const house = houses[chamber] || chamber.replaceAll('_', ' ');
    return {chamber, jurisdiction, house, label: jurisdiction ? `${house}, ${parliaments[jurisdiction] || jurisdiction}` : house,
      status: now.size ? (now.has(chamber) ? 'current' : 'former') : sitting && ids.length > 1 ? 'unknown' : ''};
  });
  const order = {current: 0, '': 0, unknown: 0, former: 1};
  rows.sort((a, b) => order[a.status] - order[b.status]);
  const paired = new Set(rows.filter(r => r.status !== 'unknown').map(r => r.jurisdiction));
  return {rows, parliamentsOnly: states.filter(s => !paired.has(s)).map(s => parliaments[s] || s)};
}

export function profileAffiliations(person) {
  return (person?.affiliations || []).filter(r => r.electorate && r.start &&
    person.states?.includes(r.jurisdiction) && person.chambers?.includes(r.chamber))
    .map(r => ({...r, jurisdictionLabel: parliaments[r.jurisdiction] || r.jurisdiction,
      chamberLabel: houses[r.chamber] || r.chamber}));
}
