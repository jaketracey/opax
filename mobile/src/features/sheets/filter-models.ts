import {
  counted,
  formatFinancialYear as financialYear,
} from '../../design/format';
import type { FilterList } from '../../navigation/routes/filters';
import {
  directorySorts,
  type DirectoryKind,
  type Facet,
} from '../directories/model';
import { defaultFilters, parties, topics } from '../search/contracts';
import {
  defineModel,
  facet,
  filterStore,
  registerFilterModel,
  toggle,
  type FilterChoice,
  type FilterModel,
  type FilterValues,
} from './filter-model';

const any = (label = 'Any'): FilterChoice => ({ value: '', label });
const bothChambers: FilterChoice[] = [
  any(),
  { value: 'house', label: 'House of Representatives' },
  { value: 'senate', label: 'Senate' },
];
export const stateChoices: FilterChoice[] = [
  ['nsw', 'New South Wales'],
  ['vic', 'Victoria'],
  ['qld', 'Queensland'],
  ['wa', 'Western Australia'],
  ['sa', 'South Australia'],
  ['tas', 'Tasmania'],
  ['act', 'Australian Capital Territory'],
  ['nt', 'Northern Territory'],
].map(([value, label]) => ({ value: value!, label: label! }));
const alphabetical = (choices: readonly FilterChoice[]) =>
  [...choices].sort((a, b) => a.label.localeCompare(b.label, 'en-AU'));
const numericFacet = (
  key: string,
  title: string,
  choices: readonly FilterChoice[],
) =>
  facet(key, title, choices, {
    select: (state, value) => ({
      ...state,
      [key]: value ? Number(value) : undefined,
    }),
  });

export function billsFilterModel(
  options: {
    scope?: 'all' | 'before' | 'passed';
    parliaments?: FilterChoice[];
    statuses?: FilterChoice[];
    chambers?: FilterChoice[];
    portfolios?: FilterChoice[];
    resultCount?: (state: FilterValues) => number;
  } = {},
) {
  const model = defineModel({
    list: 'bills',
    initial: {
      parliament: undefined,
      status: undefined,
      chamber: undefined,
      portfolio: undefined,
      divided: false,
      sort: 'newest',
    },
    preserveOnReset: ['sort'],
    rows: [
      numericFacet('parliament', 'Parliament', [
        any(),
        ...(options.parliaments ?? []),
      ]),
      ...(!options.scope || options.scope === 'all'
        ? [
            facet('status', 'Status', [
              any(),
              ...(options.statuses ?? [
                { value: 'before', label: 'Before parliament' },
                { value: 'exposure', label: 'Exposure draft' },
                { value: 'passed', label: 'Passed' },
                { value: 'lapsed', label: 'Lapsed' },
              ]),
            ]),
          ]
        : []),
      facet(
        'chamber',
        'Chamber',
        options.chambers ? [any(), ...options.chambers] : bothChambers,
      ),
      facet('portfolio', 'Portfolio', [
        any(),
        ...alphabetical(options.portfolios ?? []),
      ]),
      facet('sort', 'Sort', [
        { value: 'newest', label: 'Newest first' },
        { value: 'oldest', label: 'Oldest first' },
        { value: 'title', label: 'Name' },
        { value: 'divisions', label: 'Most recorded votes' },
      ]),
    ],
    toggles: [toggle('divided', 'Has a recorded vote')],
    resultLine: options.resultCount
      ? (state) => {
          const count = options.resultCount!(state);
          return count
            ? `${count} ${count === 1 ? 'bill matches' : 'bills match'}`
            : 'No bills match';
        }
      : undefined,
  });
  return {
    ...model,
    normalise: (state: FilterValues) => {
      const current = { ...state };
      delete current.year;
      return model.normalise!(current);
    },
  };
}
export function divisionsFilterModel(
  options: {
    kinds?: FilterChoice[];
    resultCount?: (state: FilterValues) => number;
  } = {},
) {
  return defineModel({
    list: 'divisions',
    initial: {
      chamber: '',
      outcome: '',
      procedural: false,
      ...(options.kinds ? { kind: '' } : {}),
    },
    rows: [
      facet('chamber', 'Chamber', bothChambers),
      facet('outcome', 'Outcome', [
        any(),
        { value: 'agreed', label: 'Agreed' },
        { value: 'not-agreed', label: 'Not agreed' },
      ]),
      ...(options.kinds
        ? [facet('kind', 'Kind', [any('All divisions'), ...options.kinds])]
        : []),
    ],
    toggles: [toggle('procedural', 'Leave out procedural votes')],
    resultLine: options.resultCount
      ? (state) => {
          const count = options.resultCount!(state);
          return count
            ? `${counted(count, 'vote matches', 'votes match')}`
            : 'No votes match';
        }
      : undefined,
  });
}
export function declarationsFilterModel(
  options: {
    chambers?: FilterChoice[];
    jurisdictions?: FilterChoice[];
  } = {},
) {
  return defineModel({
    list: 'declarations',
    initial: { chamber: 'all', jurisdiction: 'all' },
    rows: [
      facet('chamber', 'Chamber', [
        { value: 'all', label: 'Any' },
        ...(options.chambers ?? bothChambers.slice(1)),
      ]),
      ...(options.jurisdictions && options.jurisdictions.length > 1
        ? [
            facet('jurisdiction', 'Parliament', [
              { value: 'all', label: 'Any' },
              ...options.jurisdictions,
            ]),
          ]
        : []),
    ],
  });
}
export function connectionsFilterModel() {
  return defineModel({
    list: 'connections',
    initial: { kind: '' },
    rows: [
      facet('kind', 'Kind', [
        any('All'),
        { value: 'program', label: 'Programs' },
        { value: 'place', label: 'Places' },
        { value: 'electorate', label: 'Electorates' },
        { value: 'organisation', label: 'Organisations' },
      ]),
    ],
  });
}

export function directoryFilterModel(
  options: { kind?: DirectoryKind; facets?: Facet[] } = {},
) {
  const kind = options.kind ?? 'person';
  const supplied = (key: string) =>
    options.facets?.find((item) => item.key === key)?.choices ?? [];
  const choose = (key: string, title: string, fallback: FilterChoice[] = []) =>
    facet(key, title, [
      // people 2.6 names "All parties"; the other rows say "Any".
      any(key === 'party' ? 'All parties' : 'Any'),
      ...alphabetical(supplied(key).length ? supplied(key) : fallback),
    ]);
  const rows =
    kind === 'person'
      ? [
          choose(
            'party',
            'Party',
            parties.map((name) => ({ value: name, label: name })),
          ),
          choose('parliament', 'Parliament'),
          choose('chamber', 'Chamber', bothChambers.slice(1)),
          choose('state', 'State', stateChoices),
        ]
      : kind === 'party'
        ? [choose('jur', 'Disclosed to')]
        : [
            choose('jur', 'Parliament'),
            choose('chamber', 'Chamber', bothChambers.slice(1)),
            choose('state', 'State', stateChoices),
            choose('party', 'Member’s party'),
          ];
  const toggles =
    kind === 'person'
      ? [
          toggle('sitting', 'Sitting members only', true),
          toggle('votes', 'Has a voting record', true),
        ]
      : kind === 'party'
        ? [
            toggle('has_speeches', 'Has speeches', true),
            toggle('has_members', 'Has members', true),
            toggle('has_donations', 'Has disclosed receipts', true),
          ]
        : [
            {
              key: 'status',
              label: 'Current electorates only',
              value: (state: FilterValues) => state.status === 'current',
              select: (state: FilterValues, value: boolean) => ({
                ...state,
                status: value ? 'current' : '',
              }),
            },
            toggle('results', 'Has election results', true),
          ];
  const sort = directorySorts[kind];
  return defineModel({
    list: 'directory',
    initial: {
      ...Object.fromEntries(
        [...rows.map((row) => row.key), ...toggles.map((row) => row.key)].map(
          (key) => [key, ''],
        ),
      ),
      sort: sort[0]!.value,
    },
    rows: [...rows, facet('sort', 'Sort', sort)],
    toggles,
    footer:
      kind === 'person' ? 'Sitting members always come first.' : undefined,
  });
}

/** D-8: Ask and Search share the five rows, type control and Years editor. */
export function recordFilterModel(
  list: 'search' | 'ask',
  options: {
    members?: FilterChoice[];
    parties?: FilterChoice[];
    topics?: FilterChoice[];
    years?: number[];
    defaultKind?: string;
  } = {},
) {
  const currentYear = Number(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
    }).format(new Date()),
  );
  const years = [
    ...new Set(
      options.years ??
        Array.from(
          { length: currentYear - 1993 + 1 },
          (_, index) => 1993 + index,
        ),
    ),
  ]
    .sort((a, b) => a - b)
    .map((year) => ({ value: String(year), label: String(year) }));
  const initial = {
    ...defaultFilters,
    kind: options.defaultKind ?? (list === 'search' ? 'speech' : 'all'),
  };
  const parliament = [
    ['federal', 'Federal Parliament'],
    ['nsw', 'New South Wales Parliament'],
    ['vic', 'Victorian Parliament'],
    ['qld', 'Queensland Parliament'],
    ['sa', 'South Australian Parliament'],
    ['act', 'ACT Legislative Assembly'],
  ].map(([value, label]) => ({ value: value!, label: label! }));
  const members = alphabetical(options.members ?? []);
  const partyChoices = alphabetical(
    options.parties ?? parties.map((name) => ({ value: name, label: name })),
  );
  const parliamentRow = facet('state', 'Parliament', [any(), ...parliament]);
  const topicRow = facet('topic', 'Topic', [
    any(),
    ...alphabetical(
      options.topics ??
        Object.entries(topics).map(([value, label]) => ({ value, label })),
    ),
  ]);
  const yearsRow = facet('years', 'Years', [], {
    kind: 'years',
    value: (state) =>
      state.from || state.to
        ? `${state.from || 'Any'} to ${state.to || 'Any'}`
        : 'Any',
  });
  const yearsControl = { options: years, from: 'from', to: 'to' } as const;
  if (list === 'search')
    // search 2.9: five rows in this order, Type first and labelled; "Party
    // or speaker" is one row whose choice sets party or speaker and clears
    // the other; "Exact words only" is the one switch.
    return defineModel({
      list,
      initial,
      rows: [
        facet('kind', 'Type', [
          { value: 'speech', label: 'Speeches' },
          { value: 'press_release', label: 'Media releases and transcripts' },
        ]),
        parliamentRow,
        yearsRow,
        facet(
          'speaker',
          'Party or speaker',
          [
            any('Anyone'),
            ...partyChoices.map((choice) => ({
              ...choice,
              value: `party:${choice.value}`,
            })),
            ...members.map((choice) => ({
              ...choice,
              value: `speaker:${choice.value}`,
            })),
          ],
          {
            searchPlaceholder: 'Party or name',
            value: (state) =>
              state.party
                ? `party:${String(state.party)}`
                : state.speaker
                  ? `speaker:${String(state.speaker)}`
                  : '',
            select: (state, value) => {
              const [kind, ...rest] = value.split(':');
              const chosen = rest.join(':');
              return {
                ...state,
                party: kind === 'party' ? chosen : '',
                speaker: kind === 'speaker' ? chosen : '',
              };
            },
          },
        ),
        topicRow,
      ],
      toggles: [
        {
          key: 'mode',
          label: 'Exact words only',
          value: (state) => state.mode === 'keyword',
          select: (state, value) => ({
            ...state,
            mode: value ? 'keyword' : 'hybrid',
          }),
        },
      ],
      years: yearsControl,
      footer: 'Put words in quotes to match an exact phrase.',
    });
  // ask 4: Member, Party, Parliament, Topic, Years, then the unlabelled
  // "All records | Speeches only" control.
  return defineModel({
    list,
    initial,
    rows: [
      facet('speaker', 'Person', [any(), ...members], {
        searchPlaceholder: 'Name or electorate',
      }),
      facet('party', 'Party', [any(), ...partyChoices]),
      parliamentRow,
      topicRow,
      yearsRow,
    ],
    years: yearsControl,
    segments: {
      key: 'kind',
      label: 'Type',
      options: [
        { value: 'all', label: 'All records' },
        { value: 'speech', label: 'Speeches only' },
      ],
      value: (state) => String(state.kind),
      select: (state, value) => ({ ...state, kind: value }),
    },
    footer: 'Put words in quotes to match an exact phrase.',
  });
}
export const searchFilterModel = (
  options?: Parameters<typeof recordFilterModel>[1],
) => recordFilterModel('search', options);
export const askFilterModel = (
  options?: Parameters<typeof recordFilterModel>[1],
) => recordFilterModel('ask', options);

export function moneyFilterModel(
  options: {
    years?: number[];
    annualReturnYears?: number[];
    industries?: string[];
    loaded?: boolean;
    dollarsYear?: number;
    /** The Show toggle for the parties' figure (records.partiesFigureWords). */
    donationsLabel?: string;
  } = {},
) {
  const years = [...new Set(options.years ?? [])].sort((a, b) => a - b);
  const latest = [...(options.annualReturnYears ?? [])]
    .filter((year) => years.includes(year))
    .sort((a, b) => b - a)[0];
  const from = years[0],
    to = years.at(-1);
  const yearChoices = years.map((year) => ({
    value: String(year),
    label: financialYear(year),
  }));
  // Shell 10: while the map's data loads, rows read "All" and their lists
  // draw a skeleton; they fill in place when the graph arrives.
  const loading = options.loaded === false || !years.length;
  const yearRow = facet(
    'years',
    'Years',
    [
      any('All years'),
      ...(latest != null
        ? [
            {
              value: 'latest',
              label: `Latest year (${financialYear(latest)})`,
            },
            { value: 'three', label: 'Last three years' },
          ]
        : []),
      ...yearChoices.slice().reverse(),
    ],
    {
      loading,
      value: (state) =>
        state.from === from && state.to === to
          ? ''
          : state.from === state.to
            ? String(state.from)
            : `${financialYear(Number(state.from))} to ${financialYear(Number(state.to))}`,
      select: (state, value) =>
        value === ''
          ? { ...state, from, to }
          : value === 'latest' && latest != null
            ? { ...state, from: latest, to: latest }
            : value === 'three' && latest != null
              ? {
                  ...state,
                  from: Math.max(from ?? latest, latest - 2),
                  to: latest,
                }
              : { ...state, from: Number(value), to: Number(value) },
    },
  );
  return defineModel({
    list: 'money',
    initial: {
      from,
      to,
      industry: '',
      donations: true,
      grants: true,
      contracts: true,
      inflation: false,
    },
    rows: [
      yearRow,
      facet('range', 'Custom range', [], {
        kind: 'years',
        loading,
        value: (state) =>
          state.from != null && state.to != null
            ? `${financialYear(Number(state.from))} to ${financialYear(Number(state.to))}`
            : 'All years',
      }),
      facet(
        'industry',
        'Industry',
        [
          any('All industries'),
          ...alphabetical(
            (options.industries ?? []).map((group) => ({
              value: group,
              label: group.replace(/(^|[\s-])\S/g, (c) =>
                c.toLocaleUpperCase('en-AU'),
              ),
            })),
          ),
        ],
        { loading },
      ),
    ],
    years: { options: yearChoices, from: 'from', to: 'to', numeric: true },
    toggles: [
      {
        ...toggle('donations', options.donationsLabel ?? 'Money to parties'),
        group: 'show',
      },
      { ...toggle('grants', 'Grants to donors'), group: 'show' },
      { ...toggle('contracts', 'Contracts to donors'), group: 'show' },
      { ...toggle('inflation', 'Adjust for inflation'), group: 'inflation' },
    ],
    toggleGroups: [
      { key: 'show', header: 'Show' },
      {
        key: 'inflation',
        footer:
          options.dollarsYear != null
            ? `In ${financialYear(options.dollarsYear)} dollars.`
            : undefined,
      },
    ],
  });
}
export function allocationFilterModel(
  options: { years?: number[]; earlier?: boolean; loaded?: boolean } = {},
) {
  const availability = {
    disabled: options.loaded === false,
    disabledLabel: 'Loads with the list',
  };
  const years = [...new Set(options.years ?? [])]
    .sort((a, b) => b - a)
    .map((year) => ({ value: String(year), label: String(year) }));
  return defineModel({
    list: 'allocation',
    initial: { state: '', year: '' },
    rows: [
      facet(
        'state',
        'State or territory',
        [any('All states'), ...stateChoices],
        availability,
      ),
      ...(options.earlier
        ? [
            {
              ...numericFacet('year', 'Published by', [
                any('All years'),
                ...years,
              ]),
              ...availability,
            },
          ]
        : []),
    ],
  });
}
export const filterModels: Record<FilterList, () => FilterModel<FilterValues>> =
  {
    bills: billsFilterModel,
    divisions: divisionsFilterModel,
    declarations: declarationsFilterModel,
    connections: connectionsFilterModel,
    directory: directoryFilterModel,
    search: searchFilterModel,
    ask: askFilterModel,
    money: moneyFilterModel,
    allocation: allocationFilterModel,
  };
export function ensureFilterModel(list: FilterList, owner?: string) {
  return (
    filterStore(list, owner) ??
    registerFilterModel(filterModels[list](), { owner })
  );
}
