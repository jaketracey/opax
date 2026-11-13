/** The election copy deck. API wording is printed verbatim by callers. */
export const vicCopy = {
  title: 'Victorian election 2026',
  bar: 'Victorian election',
  /**
   * Android's toolbar title is one line beside the search and More actions;
   * at accessibility sizes the full bar title ends "Victorian ele…". The
   * page heading below carries the full title.
   */
  barShort: 'Vic election',
  placeholder: 'Suburb, postcode or district',
  yourDistrict: 'Your district',
  stateDistrict: 'Your state district',
  findDistrict: 'Find your district',
  findDetail: 'By suburb, postcode or district name',
  dates: 'Key dates',
  districtNote:
    'Each row shows who last held the seat and the winning margin at the 2022 election, in percentage points, unless a later by-election is named.',
  regionNote: 'Each region elects five members.',
  districts: (n: number) => `Lower house: ${n} districts`,
  regions: (n: number) => `Upper house: ${n} regions`,
  ahead: (d: string) => `Election day is ${d}`,
  closedToday: (d: string) => `Election day was ${d}`,
  inDays: (n: number) => (n === 1 ? 'Tomorrow' : `In ${n} days`),
  today: 'Election day is today',
  closed: 'Voting has closed',
  hours: (a: string, b: string) => `Polls are open from ${a} to ${b}`,
  until: (n: number, d: string) =>
    `${n === 1 ? 'day' : 'days'} until election day, ${d}`,
  closedBody: (t: string, d: string) =>
    `Polls closed at ${t} on ${d}. OPAX shows results from 2022 and by-elections since. For 2026 results, go to the VEC.`,
  voting: 'Where and how to vote',
  vec: 'VEC election page',
  vecWebsite: 'Opens the VEC website.',
  by: (party: string, n: string) => `${party} by ${n}`,
  contest: (year: string, kind: string) =>
    `${year} ${kind === 'general' ? 'election' : kind === 'supplementary' ? 'supplementary election' : 'by-election'}`,
  lastResult: 'Last result',
  lastHeld: 'Last held by',
  margin: 'Winning margin',
  points: (n: string) => `${n} points`,
  beforeResult: 'These are results from before the 2026 election.',
  preferences: (p: string, n: string, a: string, s: string) =>
    `${p} ${n}, ${a} ${s} after preferences`,
  rowAX: (name: string, person: string, party: string | null, result: string) =>
    `${name}. Last held by ${person}${party ? `, ${party}` : ''}. ${result}`,
  resultAX: (party: string, margin: string, contest: string) =>
    `${party} won by ${margin} points at the ${contest}.`,
  shareAX: (
    name: string,
    share: string,
    place: string,
    person: string,
    party: string | null,
  ) =>
    `${name}. ${share} of ${place}’s residents. Last held by ${person}${party ? `, ${party}` : ''}.`,
  all: 'All',
  underOne: 'Under 1%',
  underOneAX: 'Under 1 per cent',
  perCent: (n: number | string) => `${n} per cent`,
  residents: 'of residents',
  regionName: (n: string) => `${n} Region`,
  more: (n: number) => `and ${n} more`,
  split: 'Some places cross district lines.',
  exactAddress: 'Check your exact address with the VEC',
  address: 'Check your address with the VEC',
  noPostcode: (q: string) =>
    `No Victorian postcode area matches “${q}”. PO box postcodes aren’t included: try your suburb.`,
  noPlace: (q: string) =>
    `No suburb, postcode or district matches “${q}”. Try a nearby suburb.`,
  findFailed: 'Places couldn’t be searched.',
  placesMissing:
    'Suburbs and postcodes couldn’t be searched just now. Districts and members are shown.',
  found: (n: number) => (n ? `${n} places found` : 'No matches'),
  about: (s: string) =>
    `About this data: ${s.charAt(0).toLowerCase()}${s.slice(1)}`,
  methods: 'How this page is built',
  districtHead: (n: string) => `Lower house district in ${n} Region.`,
  formerly: (n: string) => `Called ${n} before 2022.`,
  created: 'First contested in 2022.',
  regionHead: (members: number, n: number) =>
    `Upper house region with ${members === 5 ? 'five' : members} members and ${n} districts.`,
  candidates: 'Candidates',
  candidateGroup: (group: string, name?: string) =>
    `Group ${group}${name ? ` · ${name}` : ''}`,
  ungroupedCandidates: 'Ungrouped candidates',
  ballot: (d: string) =>
    `In ballot paper order, as published by the VEC on ${d}.`,
  noCandidates:
    'Candidates aren’t listed here yet. The VEC lists them on its election page.',
  done: (n: string) => `What ${n} has done`,
  speeches: 'Speeches',
  speechYears: (a: number, b: number) =>
    `Speeches in Parliament, ${a}${a === b ? '' : ` to ${b}`}`,
  votes: (y: string) => `Votes recorded in ${y}`,
  voteCounts: (a: number, n: number) => `${a} for, ${n} against`,
  recent: 'Recent votes',
  positions: {
    aye: 'Voted for',
    no: 'Voted against',
    abstain: 'Abstained',
    absent: 'Absent',
  } as Record<string, string>,
  divisions: (a: string, b: string) =>
    `Votes cover divisions recorded from ${a} to ${b}.`,
  upper: (n: string) => `Upper house: ${n} Region`,
  upperDetail: (n: string, m: number) =>
    `Voters in ${n} also elect this region’s ${m === 5 ? 'five' : m} upper house members.`,
  records: 'Members and their records',
  memberList: 'Members',
  members: (a: string, b: string) => `Members, ${a} to ${b}`,
  memberSpeeches: (n: number, a: number, b: number) =>
    `${n} speeches, ${a}${a === b ? '' : ` to ${b}`}`,
  memberVotes: (n: number, y: string) => `${n} votes in ${y}`,
  regionDistricts: 'Districts in this region',
  districtMap: 'District map and profile (VEC)',
  regionMap: 'Region map and profile (VEC)',
  openWeb: 'Open on opax.com.au',
  share: 'Share',
  copyLink: 'Copy link',
  browseDetail: 'Find your district and who is standing',
  searchTitle: (d: string) => `Victorian election 2026 · ${d}`,
  hubFailed: 'The election page couldn’t be loaded',
  seatFailed: 'This seat couldn’t be loaded',
  notFound: 'No district or region by that name',
  allDistricts: 'All districts',
  unavailable: 'This page isn’t available',
  unpublished: 'The Victorian election pages are not published right now.',
  retry: 'Try again',
  loading: 'Loading the Victorian election',
  searching: 'Searching places',
  vecSource: 'Victorian Electoral Commission',
  parliament: 'Parliament of Victoria',
  abs: 'Australian Bureau of Statistics',
  census: '2021 Census',
  licence: 'VEC licence',
  roster: 'Parliament of Victoria roster',
  updated: (d: string) => `Updated ${d}`,
  saved: (d: string) => `Saved ${d}`,
  resultsAt: (d: string) => `Results as at ${d}`,
  published: (d: string) => `Published ${d}`,
  asAt: (d: string) => `As at ${d}`,
  vecResult: (c: string) => `VEC result, ${c}`,
  candidateList: 'VEC candidate list',
};
