/* A member's seats as "Next in the record" rows (next-steps.js memberNextSteps), from the
   electorate people file. The person page (app.js, through electorates.js) and the Worker's
   first paint of that page (src/seo-content.ts memberNextStepsHTML) both read them here, so
   the rows the Worker draws are the rows the page keeps. */

export const CHAMBERS = { representatives: 'House of Representatives', senate: 'Senate', nsw_la: 'NSW Legislative Assembly', nsw_lc: 'NSW Legislative Council', vic_la: 'Victorian Legislative Assembly', vic_lc: 'Victorian Legislative Council', qld_la: 'Queensland Legislative Assembly', sa_ha: 'SA House of Assembly', sa_lc: 'SA Legislative Council', wa_la: 'WA Legislative Assembly', wa_lc: 'WA Legislative Council', tas_ha: 'Tasmanian House of Assembly', tas_lc: 'Tasmanian Legislative Council', nt_la: 'NT Legislative Assembly', act_la: 'ACT Legislative Assembly' };

/** The one electorate-file person with this name or alias; none when two share it. */
export function findPerson(people, name) {
  const key = String(name).toLocaleLowerCase();
  const matches = people.filter((p) => [p.name, ...(p.aliases || [])].some((n) => n.toLocaleLowerCase() === key));
  return matches.length === 1 ? matches[0] : null;
}

/** Their current seats, else every seat the file records: name, address and house. */
export function memberSeats(person) {
  const seats = person?.electorates || [];
  const current = seats.filter((e) => e.current);
  return (current.length ? current : seats).map((e) => ({ name: e.name, href: e.url, chamber: CHAMBERS[e.chamber] || '' }));
}
