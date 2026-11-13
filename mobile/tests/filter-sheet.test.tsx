import { RouteOptions } from '../src/navigation/preview';
import { router } from 'expo-router';
import { act, Children, type ReactElement } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  Button,
  PopUpButton,
  SegmentedPicker,
  SwitchRow,
} from '../src/design/controls';
import {
  FilterFacet,
  filterRowValue,
  FilterSheet,
  FilterYears,
} from '../src/design/filter-sheet';
import { InsetGroup } from '../src/design/layout';
import { LinkRow } from '../src/design/rows';
import { Text } from '../src/design/text';
import { minimumTarget, rhythm } from '../src/design/tokens';
import {
  beginFilterSession,
  createFilterStore,
  filterStore,
  registerFilterModel,
  type FilterModel,
  type FilterValues,
} from '../src/features/sheets/filter-model';
import {
  allocationFilterModel,
  askFilterModel,
  billsFilterModel,
  connectionsFilterModel,
  declarationsFilterModel,
  directoryFilterModel,
  divisionsFilterModel,
  filterModels,
  moneyFilterModel,
  searchFilterModel,
} from '../src/features/sheets/filter-models';
import {
  FilterFacetRoute,
  FilterRoute,
} from '../src/features/sheets/FilterRoutes';
import {
  filterFacetRoute,
  filtersRoute,
} from '../src/navigation/routes/filters';

jest.mock('../src/api/runtime', () => ({ catalogs: { roster: jest.fn() } }));
jest.mock('../src/features/ask/session', () => ({ askSession: {} }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => ({ getParent: () => ({ goBack: jest.fn() }) }),
}));
const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  return renderer;
}
beforeEach(() => {
  jest.clearAllMocks();
  act(() =>
    Dimensions.set({
      window: { width: 390, height: 844, scale: 3, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 3, fontScale: 1 },
    }),
  );
  mockParams = {};
});
afterEach(() =>
  act(() => mounted.splice(0).forEach((renderer) => renderer.unmount())),
);
const row = (model: FilterModel<FilterValues>, key: string) =>
  model.rows.find((item) => item.key === key)!;

test.each(Object.keys(filterModels) as (keyof typeof filterModels)[])(
  '%s model has at most five facets, unique rows, usable choices and a complete reset',
  (list) => {
    const model = filterModels[list]();
    expect(model.rows.length).toBeLessThanOrEqual(5);
    expect(new Set(model.rows.map((item) => item.key)).size).toBe(
      model.rows.length,
    );
    expect(model.isDefault(model.initial)).toBe(true);
    for (const item of model.rows.filter((item) => item.kind === 'facet')) {
      const choices = item.choices(model.initial);
      expect(new Set(choices.map((choice) => choice.value)).size).toBe(
        choices.length,
      );
      for (const choice of choices) {
        const next = item.select(model.initial, choice.value);
        expect(model.isDefault(model.reset(next))).toBe(true);
      }
    }
    for (const toggle of model.toggles ?? []) {
      const next = toggle.select(model.initial, !toggle.value(model.initial));
      expect(model.isDefault(next)).toBe(false);
      expect(model.isDefault(model.reset(next))).toBe(true);
    }
  },
);
test('bills facets preserve counts and reset filters while retaining the chosen sort', () => {
  const model = billsFilterModel({
    parliaments: [
      { value: '48', label: '48th Parliament (2025 to now)', count: 27 },
    ],
    portfolios: [{ value: 'health', label: 'Health', count: 0 }],
    resultCount: () => 0,
  });
  expect(model.rows.map((item) => item.title)).toEqual([
    'Parliament',
    'Status',
    'Chamber',
    'Portfolio',
    'Sort',
  ]);
  expect(row(model, 'parliament').select(model.initial, '48').parliament).toBe(
    48,
  );
  expect(row(model, 'portfolio').choices(model.initial)[1]?.count).toBe(0);
  expect(
    model.reset({
      ...model.initial,
      parliament: 48,
      divided: true,
      sort: 'oldest',
    }),
  ).toMatchObject({ parliament: undefined, divided: false, sort: 'oldest' });
  expect(model.resultLine?.(model.initial)).toBe('No bills match');
  expect(
    billsFilterModel({ scope: 'before' }).rows.map((item) => item.key),
  ).not.toContain('status');
});
test('divisions omit Kind until stage classifications are supplied', () => {
  expect(divisionsFilterModel().rows.map((item) => item.key)).toEqual([
    'chamber',
    'outcome',
  ]);
  const model = divisionsFilterModel({
    kinds: [{ value: 'reading', label: 'Bill readings' }],
  });
  const next = row(model, 'kind').select(model.initial, 'reading');
  expect(model.isDefault(next)).toBe(false);
  expect(model.reset(next).kind).toBe('');
});
test('declarations only offer Parliament for multiple jurisdictions', () => {
  expect(
    declarationsFilterModel({
      jurisdictions: [{ value: 'federal', label: 'Federal Parliament' }],
    }).rows.map((item) => item.key),
  ).toEqual(['chamber']);
  const model = declarationsFilterModel({
    jurisdictions: [
      { value: 'federal', label: 'Federal Parliament' },
      { value: 'nsw', label: 'New South Wales Parliament' },
    ],
  });
  expect(model.rows.map((item) => [item.key, item.title])).toEqual([
    ['chamber', 'Chamber'],
    ['jurisdiction', 'Parliament'],
  ]);
  expect(row(model, 'jurisdiction').choices(model.initial)).toHaveLength(3);
  expect(model.initial).not.toHaveProperty('parliament');
  expect(
    model.reset({ ...model.initial, jurisdiction: 'nsw' }).jurisdiction,
  ).toBe('all');
});
test('connections has all five kinds and clears the chosen kind', () => {
  const model = connectionsFilterModel();
  expect(
    row(model, 'kind')
      .choices(model.initial)
      .map((choice) => choice.label),
  ).toEqual(['All', 'Programs', 'Places', 'Electorates', 'Organisations']);
  expect(model.summary(row(model, 'kind').select(model.initial, 'place'))).toBe(
    '1 filter',
  );
  expect(model.reset({ kind: 'place' }).kind).toBe('');
});
test.each(['person', 'party', 'electorate'] as const)(
  'directory %s has its own facets, switches and sort with no portrait QA control',
  (kind) => {
    const model = directoryFilterModel({ kind });
    expect(model.rows.at(-1)?.key).toBe('sort');
    expect(model.rows.length).toBeLessThanOrEqual(5);
    expect(model.toggles?.map((item) => item.label)).not.toContain(
      'Has a portrait',
    );
    expect(
      model.isDefault(model.reset({ ...model.initial, sort: 'different' })),
    ).toBe(true);
  },
);
test('directory copies available facet choices and existing sitting/votes state grammar', () => {
  const model = directoryFilterModel({
    facets: [
      {
        key: 'party',
        label: 'Party',
        choices: [{ value: 'Independent', label: 'Independent' }],
      },
    ],
  });
  expect(
    row(model, 'party')
      .choices(model.initial)
      .map((choice) => choice.value),
  ).toEqual(['', 'Independent']);
  const sitting = model.toggles!.find((item) => item.key === 'sitting')!;
  expect(sitting.select(model.initial, true).sitting).toBe('1');
});
test('Search rows follow search 2.9 and Ask rows follow ask 4, with the same Years data', () => {
  const options = {
    years: [2024, 2025, 2026],
    members: [{ value: 'Member', label: 'Member' }],
  };
  const search = searchFilterModel(options),
    ask = askFilterModel(options);
  expect(search.rows.map((item) => item.title)).toEqual([
    'Type',
    'Parliament',
    'Years',
    'Party or speaker',
    'Topic',
  ]);
  expect(ask.rows.map((item) => item.title)).toEqual([
    'Person',
    'Party',
    'Parliament',
    'Topic',
    'Years',
  ]);
  expect(ask.years).toEqual(search.years);
  expect(search.segments).toBeUndefined();
  expect(ask.segments?.options.map((option) => option.label)).toEqual([
    'All records',
    'Speeches only',
  ]);
  // Search's default Type reads "Speeches"; every other default is "Any",
  // except Party or speaker, which the spec names "Anyone".
  expect(
    search.rows.map((item) => filterRowValue(item, search.initial)),
  ).toEqual(['Speeches', 'Any', 'Any', 'Anyone', 'Any']);
  expect(ask.rows.map((item) => filterRowValue(item, ask.initial))).toEqual([
    'Any',
    'Any',
    'Any',
    'Any',
    'Any',
  ]);
  expect(
    row(search, 'kind')
      .choices(search.initial)
      .map((choice) => choice.label),
  ).toEqual(['Speeches', 'Media releases and transcripts']);
  const who = row(search, 'speaker');
  const labor = who.select(search.initial, 'party:Labor');
  expect(labor).toMatchObject({ party: 'Labor', speaker: '' });
  expect(filterRowValue(who, labor)).toBe('Labor');
  const member = who.select(labor, 'speaker:Member');
  expect(member).toMatchObject({ party: '', speaker: 'Member' });
  expect(filterRowValue(who, member)).toBe('Member');
  const exact = search.toggles!.find((item) => item.key === 'mode')!;
  expect(exact.label).toBe('Exact words only');
  expect(exact.select(search.initial, true).mode).toBe('keyword');
  expect(search.isDefault(exact.select(search.initial, true))).toBe(false);
  expect(search.initial.kind).toBe('speech');
  expect(ask.initial.kind).toBe('all');
  expect(
    row(search, 'state')
      .choices(search.initial)
      .map((choice) => choice.value),
  ).toEqual(['', 'federal', 'nsw', 'vic', 'qld', 'sa', 'act']);
  expect(
    search.isDefault(
      search.reset({ ...search.initial, from: '2025', speaker: 'Member' }),
    ),
  ).toBe(true);
});
test('shared Years menus constrain To and keep live ranges valid when From changes', () => {
  const model = searchFilterModel({ years: [2024, 2025, 2026] }),
    onChange = jest.fn();
  const root = render(
    <FilterYears
      model={model}
      value={{ ...model.initial, from: '2025', to: '2025' }}
      onChange={onChange}
    />,
  ).root;
  const [from, to] = root.findAllByType(PopUpButton);
  expect(
    to!.props.options.map((choice: { value: string }) => choice.value),
  ).toEqual(['', '2025', '2026']);
  act(() => from!.props.onChange('2026'));
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ from: '2026', to: '2026' }),
  );
});
test('money computes Latest year from available annual returns and resets all layers', () => {
  const model = moneyFilterModel({
    years: [2021, 2022, 2023, 2024, 2025],
    annualReturnYears: [2023, 2024],
    industries: ['unions', 'finance'],
    loaded: true,
  });
  const years = row(model, 'years');
  expect(
    years.choices(model.initial).find((choice) => choice.value === 'latest')
      ?.label,
  ).toBe('Latest year (2024–25)');
  expect(years.select(model.initial, 'latest')).toMatchObject({
    from: 2024,
    to: 2024,
  });
  expect(years.select(model.initial, 'three')).toMatchObject({
    from: 2022,
    to: 2024,
  });
  expect(
    row(model, 'industry')
      .choices(model.initial)
      .map((choice) => choice.label),
  ).toEqual(['All industries', 'Finance', 'Unions']);
  expect(
    model.isDefault(
      model.reset({
        ...model.initial,
        donations: false,
        inflation: true,
        industry: 'finance',
      }),
    ),
  ).toBe(true);
  // Shell 10: while the map loads, every data row reads "All" and pushes
  // a skeleton list, never "Loads with the map".
  const loading = moneyFilterModel({ loaded: false });
  expect(loading.rows.every((item) => item.loading && !item.disabled)).toBe(
    true,
  );
  expect(
    loading.rows.map((item) => filterRowValue(item, loading.initial)),
  ).toEqual(['All', 'All', 'All']);
  const facetRoot = render(
    <FilterFacet
      model={loading}
      facet="industry"
      value={loading.initial}
      onChange={jest.fn()}
      onBack={jest.fn()}
      onDone={jest.fn()}
    />,
  ).root;
  expect(
    facetRoot.findAll((node) => node.props.testID === 'filters-choices-loading')
      .length,
  ).toBeGreaterThan(0);
  expect(facetRoot.findAllByType(LinkRow)).toHaveLength(0);
});
test('allocation uses full state names and data years newest first only for earlier grants', () => {
  expect(allocationFilterModel().rows.map((item) => item.key)).toEqual([
    'state',
  ]);
  const model = allocationFilterModel({
    earlier: true,
    years: [2021, 2023, 2022],
    loaded: false,
  });
  expect(
    row(model, 'year')
      .choices(model.initial)
      .map((choice) => choice.label),
  ).toEqual(['All years', '2023', '2022', '2021']);
  expect(row(model, 'state').choices(model.initial)[1]?.label).toBe(
    'New South Wales',
  );
  expect(model.rows.every((item) => item.disabled)).toBe(true);
  expect(model.isDefault(model.reset({ state: 'nsw', year: 2022 }))).toBe(true);
});
test('live state notifies its list, Cancel restores the snapshot, and owners stay isolated', () => {
  const model = connectionsFilterModel(),
    onChange = jest.fn();
  const store = registerFilterModel(model, { owner: 'today', onChange });
  const other = registerFilterModel(model, { owner: 'ask' });
  const session = beginFilterSession(store);
  store.set({ kind: 'place' });
  expect(onChange).toHaveBeenLastCalledWith({ kind: 'place' });
  expect(other.get()).toEqual(model.initial);
  expect(filterStore('connections', 'today')).toBe(store);
  session.cancel();
  expect(store.get()).toEqual(session.snapshot);
});
test('template has plain Done and Cancel, no Apply, and Reset only while a filter is on', () => {
  const model = connectionsFilterModel(),
    onChange = jest.fn(),
    onDone = jest.fn(),
    onCancel = jest.fn();
  const props = { model, value: model.initial, onChange, onDone, onCancel };
  const renderer = render(<FilterSheet {...props} />);
  expect(renderer.root.findAllByType(Button)).toHaveLength(0);
  const options = renderer.root.findByType(RouteOptions).props.options;
  expect(options.unstable_headerRightItems()[0]).toMatchObject({
    label: 'Done',
    variant: 'plain',
  });
  act(() => options.unstable_headerLeftItems()[0].onPress());
  expect(onCancel).toHaveBeenCalledTimes(1);
  act(() =>
    renderer.update(<FilterSheet {...props} value={{ kind: 'place' }} />),
  );
  const reset = renderer.root.findByType(Button);
  expect(reset.props.label).toBe('Reset filters');
  act(() => reset.props.onPress());
  expect(onChange).toHaveBeenCalledWith({ kind: '' });
});
test('facet rows carry list and owner ids into the shared route', () => {
  const model = connectionsFilterModel();
  const root = render(
    <FilterSheet
      model={model}
      value={model.initial}
      onChange={jest.fn()}
      onDone={jest.fn()}
      onCancel={jest.fn()}
      owner="my-list"
    />,
  ).root;
  act(() => root.findByType(LinkRow).props.onPress());
  expect(router.push).toHaveBeenCalledWith(
    filterFacetRoute('connections', 'kind', 'my-list'),
  );
  expect(filtersRoute('ask')).toEqual({
    pathname: '/filters/[list]',
    params: { list: 'ask' },
  });
});
test('facet choices expose checkmarks, apply immediately and pop after a single choice', () => {
  const model = connectionsFilterModel(),
    onChange = jest.fn(),
    onBack = jest.fn();
  const root = render(
    <FilterFacet
      model={model}
      facet="kind"
      value={model.initial}
      onChange={onChange}
      onBack={onBack}
      onDone={jest.fn()}
    />,
  ).root;
  const choice = root
    .findAllByType(LinkRow)
    .find((item) => item.props.title === 'Places')!;
  expect(choice.props.accessory).toBe('checkmark');
  act(() => choice.props.onPress());
  expect(onChange).toHaveBeenCalledWith({ kind: 'place' });
  expect(onBack).toHaveBeenCalled();
});
test('generic routes resolve a list model and handle missing lists and facets', () => {
  mockParams = { list: 'search', owner: 'route-test' };
  const root = render(<FilterRoute />).root;
  expect(root.findByType(FilterSheet).props.model.list).toBe('search');
  // search 2.9: Type is a labelled row, first, with the other rows.
  expect(root.findAllByType(SegmentedPicker)).toHaveLength(0);
  expect(root.findAllByType(LinkRow)[0]!.props).toMatchObject({
    title: 'Type',
    value: 'Speeches',
  });
  mockParams = { list: 'search', facet: 'missing', owner: 'route-test' };
  expect(
    render(<FilterFacetRoute />).root.findAll(
      (node) => node.props.title === 'Nothing to show',
    ).length,
  ).toBeGreaterThan(0);
});
test('model stores retain state when Done or swipe dismissal makes no further writes', () => {
  const store = createFilterStore(connectionsFilterModel());
  beginFilterSession(store);
  store.set({ kind: 'program' });
  expect(store.get()).toEqual({ kind: 'program' });
});

test('loaded choices refresh an open store while retaining live switches', () => {
  const store = registerFilterModel(moneyFilterModel({ loaded: false }), {
    owner: 'arrival-test',
  });
  const session = beginFilterSession(store);
  store.set({ ...store.get(), inflation: true });
  const loaded = registerFilterModel(
    moneyFilterModel({
      loaded: true,
      years: [2023, 2024],
      annualReturnYears: [2024],
      industries: ['finance'],
    }),
    { owner: 'arrival-test' },
  );
  expect(loaded).toBe(store);
  expect(store.model.rows.every((item) => !item.disabled)).toBe(true);
  expect(store.get()).toMatchObject({ from: 2023, to: 2024, inflation: true });
  session.cancel();
  expect(store.get()).toMatchObject({ from: 2023, to: 2024, inflation: false });
});

test('bills ignore stale Year filters and drop them during normalisation', () => {
  const model = billsFilterModel();
  const stale = { ...model.initial, year: 2024 };
  expect(model.initial).not.toHaveProperty('year');
  expect(model.isDefault(stale)).toBe(true);
  expect(model.summary(stale)).toBe('');
  expect(model.normalise!(stale)).not.toHaveProperty('year');
  expect(stale.year).toBe(2024);
});
test.each([
  [1, '1 vote matches'],
  [1204, '1,204 votes match'],
  [0, 'No votes match'],
])('divisions result count %s uses public vote wording', (count, expected) => {
  const model = divisionsFilterModel({ resultCount: () => Number(count) });
  expect(model.resultLine!(model.initial)).toBe(expected);
});
test('divisions have Any chamber and an optional procedural filter that Reset clears', () => {
  const model = divisionsFilterModel();
  expect(row(model, 'chamber').choices(model.initial)[0]?.label).toBe('Any');
  const procedural = model.toggles!.find((item) => item.key === 'procedural')!;
  expect(procedural.label).toBe('Leave out procedural votes');
  expect(procedural.value(model.initial)).toBe(false);
  const changed = procedural.select(model.initial, true);
  expect(model.isDefault(changed)).toBe(false);
  expect(model.summary(changed)).toBe('1 filter');
  expect(model.reset(changed).procedural).toBe(false);
});
test.each(['person', 'electorate'] as const)(
  'directory %s Party starts with All parties',
  (kind) => {
    const model = directoryFilterModel({ kind });
    expect(row(model, 'party').choices(model.initial)[0]).toEqual({
      value: '',
      label: 'All parties',
    });
    const nonParty = model.rows.find(
      (item) => item.key !== 'party' && item.key !== 'sort',
    )!;
    expect(nonParty.choices(model.initial)[0]?.label).toBe('Any');
  },
);
test('Ask and Search default Years span 1993 to the current Sydney year', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-12-31T13:30:00Z'));
  try {
    for (const model of [askFilterModel(), searchFilterModel()]) {
      expect(model.years!.options).toHaveLength(2027 - 1993 + 1);
      expect(model.years!.options[0]).toEqual({ value: '1993', label: '1993' });
      expect(model.years!.options.at(-1)).toEqual({
        value: '2027',
        label: '2027',
      });
      const root = render(
        <FilterYears
          model={model}
          value={{ ...model.initial, from: '2026' }}
          onChange={jest.fn()}
        />,
      ).root;
      const [from, to] = root.findAllByType(PopUpButton);
      expect(from!.props.options[0]).toEqual({ value: '', label: 'Any' });
      expect(
        to!.props.options.map((item: { value: string }) => item.value),
      ).toEqual(['', '2026', '2027']);
    }
    expect(searchFilterModel({ years: [] }).years!.options).toEqual([]);
  } finally {
    jest.useRealTimers();
  }
});
test.each([
  [1, 'row'],
  [3.571, 'column'],
])(
  'Years draw as two grouped rows at font scale %s',
  (fontScale, direction) => {
    act(() =>
      Dimensions.set({
        window: {
          width: 390,
          height: 844,
          scale: 3,
          fontScale: Number(fontScale),
        },
        screen: {
          width: 390,
          height: 844,
          scale: 3,
          fontScale: Number(fontScale),
        },
      }),
    );
    const model = searchFilterModel({ years: [2026] });
    const root = render(
      <FilterYears model={model} value={model.initial} onChange={jest.fn()} />,
    ).root;
    const group = root.findByType(InsetGroup);
    expect(Children.toArray(group.props.children)).toHaveLength(2);
    for (const [index, label] of ['From', 'To'].entries()) {
      const picker = root.findAllByType(PopUpButton)[index]!;
      const row = picker.parent!;
      expect(
        row
          .findAllByType(Text)
          .some(
            (node) =>
              node.props.children === label && node.props.variant === 'body',
          ),
      ).toBe(true);
      expect(StyleSheet.flatten(row.props.style)).toMatchObject({
        minHeight: minimumTarget,
        paddingVertical: rhythm.row,
        flexDirection: direction,
      });
    }
  },
);
test('money groups the three Show switches separately from inflation and its footer', () => {
  const model = moneyFilterModel({ dollarsYear: 2025 });
  const root = render(
    <FilterSheet
      model={model}
      value={model.initial}
      onChange={jest.fn()}
      onDone={jest.fn()}
      onCancel={jest.fn()}
    />,
  ).root;
  const groups = root.findAllByType(InsetGroup);
  const show = groups.find(
    (node) => node.props.testID === 'filters-toggle-group-show',
  )!;
  const inflation = groups.find(
    (node) => node.props.testID === 'filters-toggle-group-inflation',
  )!;
  expect(show.props.header).toBe('Show');
  expect(show.findAllByType(SwitchRow).map((node) => node.props.label)).toEqual(
    ['Money to parties', 'Grants to donors', 'Contracts to donors'],
  );
  expect(
    inflation.findAllByType(SwitchRow).map((node) => node.props.label),
  ).toEqual(['Adjust for inflation']);
  expect(inflation.props.footer).toBe('In 2025–26 dollars.');
  expect(
    inflation
      .findAllByType(Text)
      .find((node) => node.props.children === 'In 2025–26 dollars.')?.props
      .variant,
  ).toBe('footnote');
  expect(model.footer).toBeUndefined();
});
test('a lone toggle group has no group header', () => {
  const money = moneyFilterModel();
  const model = {
    ...money,
    rows: [],
    toggles: money.toggles!.filter((toggle) => toggle.group === 'show'),
  };
  const root = render(
    <FilterSheet
      model={model}
      value={model.initial}
      onChange={jest.fn()}
      onDone={jest.fn()}
      onCancel={jest.fn()}
    />,
  ).root;
  const show = root
    .findAllByType(InsetGroup)
    .find((node) => node.props.testID === 'filters-toggle-group-show')!;
  expect(show.props.header).toBeUndefined();
});
test('declarations Chamber reads Any by default, as every list without a named word', () => {
  const model = declarationsFilterModel({
    jurisdictions: [
      { value: 'federal', label: 'Federal' },
      { value: 'qld', label: 'Queensland' },
    ],
  });
  expect(model.rows.map((item) => filterRowValue(item, model.initial))).toEqual(
    ['Any', 'Any'],
  );
});

test('Ask uses the centred Options title while list filters keep Filters', () => {
  const { askOptionsModel } = jest.requireActual('../src/features/ask/Options');
  for (const [model, title] of [
    [askOptionsModel(), 'Options'],
    [searchFilterModel(), 'Filters'],
  ] as const) {
    const page = render(
      <FilterSheet
        model={model}
        value={model.initial}
        onChange={jest.fn()}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(page.root.findByType(RouteOptions).props.options).toMatchObject({
      title,
      headerTitleAlign: 'center',
    });
  }
});
