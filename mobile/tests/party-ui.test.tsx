import { act } from 'react';
import {
  AppState,
  Text as NativeText,
  useWindowDimensions,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import { catalogs as runtime } from '../src/api/runtime';
import { Catalogs } from '../src/api/catalogs';
import { PartySplits, RecordedParty } from '../src/features/bills/parts';
import { PartyPage } from '../src/features/Party';
import { PartyLabel, PersonRow } from '../src/design/people';
import { openOnWeb } from '../src/navigation/external';
import { partyRoute } from '../src/navigation/routes';
import { partyColors } from '../src/design/palette';
import { pinned, slugs } from './pinned';
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({ catalogs: { partyPage: jest.fn() } }));
jest.mock('../src/navigation/external', () => ({
  openOnWeb: jest.fn(),
  openSource: jest.fn(),
  sourceUrl: (s: string) => s,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const api = new Catalogs({
  get: async (path, decoder) => ({
    data: decoder(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});
let view: Awaited<ReturnType<typeof api.partyPage>>;
beforeAll(async () => {
  view = await api.partyPage('Labor');
});
beforeEach(() => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  jest.clearAllMocks();
  jest.mocked(runtime.partyPage).mockResolvedValue(view);
});
async function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<PartyPage input="Labor" />);
  });
  return renderer;
}
const press = (r: TestRenderer.ReactTestRenderer, id: string) =>
  act(() =>
    r.root
      .find(
        (n) => n.props.testID === id && typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
test('profile chips and grouped person-row VoiceOver actions open the same native party route', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <PartyLabel party="Labor" status="current" testID="chip" />,
    );
  });
  press(r, 'chip');
  expect(router.push).toHaveBeenCalledWith(partyRoute('Labor'));
  act(() => {
    r.update(
      <PersonRow
        name="Anthony Albanese"
        party="Labor"
        partyStatus="current"
        onPress={() => undefined}
        testID="person"
      />,
    );
  });
  const row = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'person',
  );
  expect(row.props.accessibilityActions).toContainEqual({
    name: 'openParty',
    label: 'Open Labor party page',
  });
  act(() =>
    row.props.onAccessibilityAction({
      nativeEvent: { actionName: 'openParty' },
    }),
  );
  expect(router.push).toHaveBeenLastCalledWith(partyRoute('Labor'));
  act(() => r.unmount());
});
test.each([
  'Independent',
  'IND',
  'Independent Liberal',
  'Unaligned',
  'Non-aligned',
])(
  '%s chips, vote labels and VoiceOver actions are plain affiliations',
  (party) => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <PartyLabel party={party} status="current" testID="chip" />,
      );
    });
    expect(
      r.root.findAll(
        (n) =>
          typeof n.type === 'string' && n.props.accessibilityRole === 'link',
      ),
    ).toHaveLength(0);
    expect(
      r.root.findAll((n) => typeof n.props.onPress === 'function'),
    ).toHaveLength(0);
    act(() => r.update(<RecordedParty party={party} />));
    expect(
      r.root.findAll((n) => n.props.accessibilityRole === 'link'),
    ).toHaveLength(0);
    const openProfile = jest.fn();
    act(() =>
      r.update(
        <PersonRow
          name="Fixture member"
          party={party}
          formerly={party}
          partyStatus="current"
          onPress={openProfile}
          testID="person"
        />,
      ),
    );
    const row = r.root.find(
      (n) => typeof n.type === 'string' && n.props.testID === 'person',
    );
    expect(row.props.accessibilityActions).toEqual([]);
    act(() => {
      for (const actionName of ['openParty', 'openPreviousParty'])
        row.props.onAccessibilityAction({ nativeEvent: { actionName } });
    });
    expect(router.push).not.toHaveBeenCalled();
    press(r, 'person');
    expect(openProfile).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
  },
);
test('previous party links remain available for an Independent, while previous Independent actions are omitted', () => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <PartyLabel
        party="Independent"
        formerly="Labor"
        status="current"
        testID="chip"
      />,
    );
  });
  const chip = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'chip',
  );
  expect(chip.props.onPress).toBeUndefined();
  expect(chip.props.accessibilityActions).toEqual([
    { name: 'openPreviousParty', label: 'Open Labor party page' },
  ]);
  act(() =>
    chip.props.onAccessibilityAction({
      nativeEvent: { actionName: 'openPreviousParty' },
    }),
  );
  expect(router.push).toHaveBeenCalledWith(partyRoute('Labor'));
  jest.mocked(router.push).mockClear();
  act(() =>
    r.update(
      <PartyLabel
        party="Labor"
        formerly="Independent"
        status="current"
        testID="chip"
      />,
    ),
  );
  const changed = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'chip',
  );
  expect(changed.props.accessibilityActions).toBeUndefined();
  act(() =>
    r.update(
      <PersonRow
        name="Fixture member"
        party="Labor"
        formerly="Independent"
        partyStatus="current"
        onPress={() => undefined}
        testID="person"
      />,
    ),
  );
  const row = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'person',
  );
  expect(row.props.accessibilityActions).toEqual([
    { name: 'openParty', label: 'Open Labor party page' },
  ]);
  act(() =>
    row.props.onAccessibilityAction({
      nativeEvent: { actionName: 'openPreviousParty' },
    }),
  );
  expect(router.push).not.toHaveBeenCalled();
  act(() => r.unmount());
});
test('bill links exclude presiding roles and unrecorded affiliations, including folded splits', () => {
  // UI-only synthetic parties and anonymous roles; no public person's votes
  // or bill record is changed. These rare role codes are register fields.
  const row = (party: string, label: string, ayes = 1) => ({
    party,
    label,
    ayes,
    noes: 0,
  });
  const splits = {
    drawn: Array.from({ length: 5 }, (_, i) =>
      row(`Fixture party ${i + 1}`, `Fixture party ${i + 1}`, 5),
    ).concat(row('Independent', 'Independent', 2)),
    folded: [
      row('Fixture small party', 'Fixture small party'),
      row('PRES', 'Presiding officer'),
      row('SPK', 'Speaker'),
      row('', 'Not recorded'),
      row('Independent Liberal', 'Independent Liberal'),
      row('Unaligned', 'Unaligned'),
      row('Non-aligned', 'Non-aligned'),
    ],
    max: 5,
    notes: [],
    recorded: true,
  };
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <PartySplits splits={splits} basisNote="" testID="splits" />,
    );
  });
  press(r, 'splits');
  const links = r.root.findAll(
    (n) => typeof n.type === 'string' && n.props.accessibilityRole === 'link',
  );
  expect(links).toHaveLength(6);
  for (const link of links)
    expect(link.props.accessibilityLabel).not.toMatch(
      /^(Presiding officer|Speaker|Not recorded|Independent|Unaligned|Non-aligned)/,
    );
  const independent = r.root.find(
    (n) =>
      typeof n.type === 'string' && n.props.testID === 'splits-independent',
  );
  expect(independent.props.accessibilityLabel).toBe(
    'Independent, 2 ayes, no noes',
  );
  expect(independent.props.onPress).toBeUndefined();
  for (const party of [' ', 'PRES', 'SPK']) {
    act(() => r.update(<RecordedParty party={party} />));
    expect(
      r.root.findAll((n) => n.props.accessibilityRole === 'link'),
    ).toHaveLength(0);
  }
  act(() => r.unmount());
});
test('the Independent grey dot is drawn as a label, never a link; other affiliations get none', () => {
  // The dots are decorative views beside the label text.
  const dots = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          n.props.accessibilityElementsHidden === true &&
          [n.props.style].flat(2).some((s) => s?.borderRadius === 5),
      )
      .map(
        (n) =>
          Object.assign({}, ...[n.props.style].flat(2)).backgroundColor as
            | string
            | undefined,
      );
  const links = (r: TestRenderer.ReactTestRenderer) =>
    r.root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        (n.props.accessibilityRole === 'link' ||
          typeof n.props.onPress === 'function'),
    );
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <PartyLabel party="Independent" status="current" testID="chip" />,
    );
  });
  expect(dots(r)).toEqual([partyColors.independent]);
  expect(links(r)).toHaveLength(0);
  act(() => r.update(<RecordedParty party="Independent" />));
  expect(dots(r)).toEqual([partyColors.independent]);
  expect(links(r)).toHaveLength(0);
  const split = (party: string, label: string) => ({
    party,
    label,
    ayes: 2,
    noes: 0,
  });
  act(() =>
    r.update(
      <PartySplits
        splits={{
          drawn: [
            split('Independent', 'Independent'),
            split('PRES', 'Presiding officer'),
            split('SPK', 'Speaker'),
            split('Unaligned', 'Unaligned'),
          ],
          folded: [],
          max: 2,
          notes: [],
          recorded: true,
        }}
        basisNote=""
        testID="splits"
      />,
    ),
  );
  press(r, 'splits');
  expect(dots(r)).toEqual([partyColors.independent]);
  expect(
    r.root.findAll(
      (n) => typeof n.type === 'string' && n.props.accessibilityRole === 'link',
    ),
  ).toHaveLength(0);
  for (const party of [
    'IND',
    'Independent Liberal',
    'Unaligned',
    'Non-aligned',
    'PRES',
    'SPK',
  ]) {
    act(() => r.update(<PartyLabel party={party} status="current" />));
    expect(dots(r)).toEqual([]);
    act(() => r.update(<RecordedParty party={party} />));
    expect(dots(r)).toEqual([]);
  }
  // A party keeps its dot and its link.
  act(() => r.update(<PartyLabel party="Labor" status="current" />));
  expect(dots(r)).toEqual([partyColors.labor]);
  expect(links(r)).toHaveLength(1);
  act(() => r.unmount());
});
test('member disclosure opens native profiles; the total and every block have provenance', async () => {
  const r = await render();
  press(r, 'party-current-toggle');
  press(r, 'party-member-anthony-albanese');
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/person/[slug]',
    params: { slug: 'anthony-albanese' },
  });
  for (const id of [
    'party-members-as-at',
    'party-receipts-as-at',
    'party-associated-as-at',
    'party-divisions-as-at',
  ])
    expect(r.root.findAll((n) => n.props.testID === id).length).toBeGreaterThan(
      0,
    );
  const total = r.root.find(
    (n) =>
      typeof n.type === 'string' && n.props.testID === 'party-receipts-total',
  );
  expect(total.props.accessibilityLabel).toBe(
    'Received (disclosed), $1,120,198,704',
  );
  act(() => r.unmount());
});
test('AX5 party text remains uncapped and current/recorded disclosures expose their expanded state', async () => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.571 });
  const r = await render();
  press(r, 'party-current-toggle');
  press(r, 'party-recorded-toggle');
  for (const text of r.root.findAllByType(NativeText)) {
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.maxFontSizeMultiplier).toBe(0);
  }
  for (const id of ['party-current-toggle', 'party-recorded-toggle']) {
    const control = r.root.find(
      (n) => typeof n.type === 'string' && n.props.testID === id,
    );
    expect(control.props.accessibilityState.expanded).toBe(true);
  }
  act(() => r.unmount());
});
test('authoritative unresolved party follows the web fallback', async () => {
  jest
    .mocked(runtime.partyPage)
    .mockResolvedValue({ data: null, stale: false });
  const r = await render();
  expect(openOnWeb).toHaveBeenCalledWith('/subject/party/Labor', 'Labor');
  act(() => r.unmount());
});
test('failed read offers retry and does not mistake a network failure for an unknown party', async () => {
  jest
    .mocked(runtime.partyPage)
    .mockRejectedValue(new Error('fixture unavailable'));
  const r = await render();
  expect(openOnWeb).not.toHaveBeenCalled();
  expect(
    r.root.findAll((n) => n.props.testID === 'party-error').length,
  ).toBeGreaterThan(0);
  act(() => r.unmount());
});

test('title and Members render before receipts, associations and splits settle', async () => {
  let publish!: (record: typeof view) => void;
  let finish!: (record: typeof view) => void;
  jest
    .mocked(runtime.partyPage)
    .mockImplementation((_input, _refresh, progress) => {
      publish = progress!;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
  const r = await render();
  const loading = {
    status: 'loading' as const,
    data: null,
    asAt: null,
    sources: [],
    stale: false,
    savedAt: null,
  };
  await act(async () =>
    publish({
      ...view,
      data: {
        ...view.data!,
        receipts: loading,
        associated: loading,
        divisions: loading,
        moneyMeta: null,
      },
    }),
  );
  for (const id of [
    'party-title',
    'party-current-count',
    'party-receipts-loading',
    'party-associated-loading',
    'party-divisions-loading',
  ])
    expect(r.root.findAll((n) => n.props.testID === id).length).toBeGreaterThan(
      0,
    );
  await act(async () => finish(view));
  expect(
    r.root.findAll((n) => n.props.testID === 'party-receipts-total').length,
  ).toBeGreaterThan(0);
  act(() => r.unmount());
  // Progress from an obsolete request must be ignored along with its completion.
  act(() => publish(view));
});

test.each(['pull', 'foreground'] as const)(
  '%s refresh of a saved record keeps loaded sections and disclosures mounted',
  async (trigger) => {
    let release!: () => void;
    let started!: () => void;
    let activate!: () => void;
    const optional = new Promise<void>((resolve) => {
      release = resolve;
    });
    const optionalStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const subscription = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        activate = () => listener('active');
        return { remove: jest.fn() };
      });
    const saved = new Catalogs({
      get: async (path, decoder, refresh = false) => {
        if (refresh && path === '/bills/index.json') {
          started();
          await optional;
        }
        return {
          data: decoder(path === '/api/person-slugs' ? slugs : pinned(path)),
          stale: true,
          savedAt: 1000,
          asOf: null,
        };
      },
    });
    jest
      .mocked(runtime.partyPage)
      .mockImplementation((...args) => saved.partyPage(...args));
    const r = await render();
    try {
      press(r, 'party-donor-years-toggle');
      press(r, 'party-recorded-toggle');
      const ids = [
        'party-receipts-total',
        'party-associated-as-at',
        'party-divisions-as-at',
      ];
      const nodes = ids.map((id) =>
        r.root.find((n) => typeof n.type === 'string' && n.props.testID === id),
      );
      await act(async () => {
        if (trigger === 'foreground') activate();
        else
          r.root
            .findAll((n) => !!n.props.refreshControl)[0]!
            .props.refreshControl.props.onRefresh();
        await optionalStarted;
      });
      for (const [i, id] of ids.entries())
        expect(
          r.root.find(
            (n) => typeof n.type === 'string' && n.props.testID === id,
          ),
        ).toBe(nodes[i]);
      expect(
        r.root.findAll((n) =>
          /party-(receipts|associated|divisions)-loading/.test(
            n.props.testID ?? '',
          ),
        ),
      ).toHaveLength(0);
      for (const id of ['party-donor-years-toggle', 'party-recorded-toggle'])
        expect(
          r.root.find(
            (n) => typeof n.type === 'string' && n.props.testID === id,
          ).props.accessibilityState.expanded,
        ).toBe(true);
      await act(async () => {
        release();
        await jest.mocked(runtime.partyPage).mock.results.at(-1)!.value;
      });
      expect(
        r.root.findAll(
          (n) => n.props.refreshControl?.props.refreshing === true,
        ),
      ).toHaveLength(0);
    } finally {
      release();
      act(() => r.unmount());
      subscription.mockRestore();
    }
  },
);
