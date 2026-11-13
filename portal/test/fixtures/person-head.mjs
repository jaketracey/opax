// Invented people, with the chamber and representation shapes used by the roster.
export const personHeadFixtures = [
  {
    person: {name: 'Aster Wattle', party: 'Labor', party_now: 'Labor', current: true,
      states: ['sa'], chambers: ['sa_lc'], first: 2026, last: 2026, speeches: 0, roster_only: true,
      representation: [{electorate: 'South Australia', jurisdiction: 'sa', chamber: 'sa_lc', state: 'SA'}]},
    role: 'MLC for South Australia',
  },
  {
    person: {name: 'Finley River', party: 'Independent', current: true,
      states: ['federal'], chambers: ['senate'], first: 2026, last: 2026, speeches: 10,
      representation: [{electorate: 'New South Wales', jurisdiction: 'federal', chamber: 'senate', state: 'NSW'}]},
    role: 'Senator for New South Wales',
  },
  {
    person: {name: 'Rowan Banks', party: 'Labor', current: true,
      states: ['nsw'], chambers: ['nsw_la'], first: 2026, last: 2026, speeches: 10,
      representation: [{electorate: 'Maitland', jurisdiction: 'nsw', chamber: 'nsw_la', state: 'NSW'}]},
    role: 'Member for Maitland',
  },
];
