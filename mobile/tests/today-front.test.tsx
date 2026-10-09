import { act, type ReactElement } from 'react';
import { ActionSheetIOS, Alert, useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import snapshot from '../scripts/fixture-snapshot.json';
import {
  decodeEdition,
  decodeRecentInterests,
  editionFor,
  recentBillsFor,
  recentDeclarationsFor,
} from '../src/api/catalogs';
import { editionPath } from '../src/api/policy';
import { partyText } from '../src/design/party';
import {
  Card,
  EmptyState,
  ErrorState,
  RowList,
  SourceLine,
  Tag,
  Text,
} from '../src/design/primitives';
import { ApiError } from '../src/api/errors';
import { BillFeed, billRowText } from '../src/features/today/BillFeed';
import {
  DeclarationRow,
  originalLabel,
} from '../src/features/today/DeclarationRow';
import { ExploreGrid } from '../src/features/today/ExploreGrid';
import { TodayFoot, todaySources } from '../src/features/today/Foot';
import { Masthead, mastheadDate } from '../src/features/today/Masthead';
import { TodayBlock } from '../src/features/today/TodayBlock';
import { shortDay, shortWrittenDay } from '../src/features/today/parts';
import { registerChangeLabel } from '../src/features/your-mp/model';
import {
  billRoute,
  declarationsRoute,
  leadsRoute,
  moneyRoute,
  recentRecordsRoute,
} from '../src/navigation/routes';
import { responseBytes } from './fixture-bytes';
import { bills, catalogs, pinned } from './pinned';

jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn(async () => null) },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const standard = { width: 402, height: 874, scale: 3, fontScale: 1 };
const ax5 = { ...standard, fontScale: 3.571 };
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}
const host = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
// The component instance that owns the press (host nodes carry responders).
const pressable = (root: ReactTestInstance, testID: string) =>
  root.find(
    (node) =>
      node.props.testID === testID && typeof node.props.onPress === 'function',
  );
const strings = (node: ReactTestInstance): string =>
  node
    .findAll((n) => n.type === 'Text')
    .flatMap((n) =>
      ([] as unknown[])
        .concat(n.props.children)
        .filter((c): c is string => typeof c === 'string'),
    )
    .join('');
const flat = (style: unknown) =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

const recentBills = recentBillsFor(bills, 6);
const recentDeclarations = recentDeclarationsFor(
  decodeRecentInterests(pinned('/interests/recent.json')),
  6,
  catalogs,
);
const feeds = { bills: recentBills, declarations: recentDeclarations };
const edition = editionFor(
  decodeEdition(JSON.parse(responseBytes(snapshot, editionPath).toString())),
);

beforeEach(() => {
  jest.mocked(router.push).mockClear();
  jest.mocked(useWindowDimensions).mockReturnValue(standard);
});

describe('the masthead', () => {
  test('dates the front page on this iPhone’s calendar', () => {
    expect(mastheadDate(new Date(2026, 9, 7, 9))).toBe('Wednesday 7 October');
    expect(mastheadDate(new Date(2027, 0, 1, 0, 5))).toBe('Friday 1 January');
  });
  test.each([false, true])(
    'is the date alone, in sentence case, as the first line (broadsheet: %s)',
    (broadsheet) => {
      const { root } = render(<Masthead broadsheet={broadsheet} />);
      // D6: sentence case; D4: the independence line is at the foot.
      expect(strings(host(root, 'today-screen-message')[0]!)).toBe(
        mastheadDate(new Date()),
      );
      expect(strings(root)).toBe(mastheadDate(new Date()));
    },
  );
});

describe('the foot', () => {
  test('one source line for the page, then the independence line (D4) and the leads reminder', () => {
    const { root } = render(<TodayFoot feeds={feeds} edition={edition} />);
    expect(root.findAllByType(SourceLine)).toHaveLength(1);
    expect(strings(host(root, 'today-independence')[0]!)).toBe(
      'OPAX is independent and non-partisan. It is not a government app.',
    );
    expect(strings(host(root, 'today-screen-footer')[0]!)).toBe(
      'Patterns in the public record are leads, not findings. Check the linked sources.',
    );
    const line = host(root, 'today-sources')[0]!;
    expect(line.props.accessibilityLabel).toMatch(
      /^Updated \d{1,2} \w{3} \d{4}, ParlInfo bill records and 2 more$/,
    );
  });
  test('the sheet names every source, each original record shown, and each block’s own date', () => {
    const details = todaySources(feeds, edition);
    // The oldest feed date: no block is newer than the line says.
    const dates = [recentBills.asAt!, recentDeclarations.asAt!]
      .map((d) => d.slice(0, 10))
      .sort();
    expect(details.asOf).toBe(dates[0]);
    expect(details.citation).toEqual([
      'ParlInfo bill records',
      recentDeclarations.sources[0]!.label,
      'OPAX daily edition',
    ]);
    const urls = details.originals!.map((original) => original.url);
    expect(urls).toContain('https://parlinfo.aph.gov.au/');
    for (const item of recentDeclarations.data!)
      expect(urls).toContain(item.url);
    expect(urls).toContain(edition.data!.path);
    const notes = details.notes!.filter(Boolean).join('\n');
    expect(notes).toContain(
      'New in parliament: the most recently introduced bills, from ParlInfo bill records, as at',
    );
    expect(notes).toContain(
      'Just declared: the newest alterations to the registers of interests, as at',
    );
    expect(notes).toContain('Daily edition: OPAX’s post for 4 October 2026');
    expect(details.state).toBeNull();
  });
  test('a saved copy anywhere on the page is the line’s state', () => {
    const savedAt = Date.parse('2026-10-03T01:00:00Z');
    const details = todaySources(
      { ...feeds, bills: { ...recentBills, stale: true, savedAt } },
      edition,
    );
    expect(details).toMatchObject({ state: 'saved', savedAt });
  });
  test('until a block loads there is no source line, only the independence line', () => {
    const { root } = render(<TodayFoot feeds={null} edition={null} />);
    expect(root.findAllByType(SourceLine)).toHaveLength(0);
    expect(host(root, 'today-independence')).toHaveLength(1);
  });
  test('an undated feed still says so on the line', () => {
    const undated = {
      ...feeds,
      bills: { ...recentBills, asAt: null },
      declarations: { ...recentDeclarations, asAt: null },
    };
    const { root } = render(<TodayFoot feeds={undated} edition={null} />);
    expect(host(root, 'today-sources')[0]!.props.accessibilityLabel).toMatch(
      /^Date not published, ParlInfo bill records and 1 more$/,
    );
  });
});

describe('a Today feed', () => {
  const draw = (block: Parameters<typeof TodayBlock>[0]['block']) =>
    render(
      <TodayBlock
        block={block}
        empty="None"
        onRetry={() => {}}
        testID="today-bills"
      >
        {() => <Text testID="rows">rows</Text>}
      </TodayBlock>,
    ).root;
  test('a current feed draws its rows and no date or source line of its own', () => {
    const root = draw(recentBills);
    expect(host(root, 'rows')).toHaveLength(1);
    expect(host(root, 'today-bills-as-at')).toHaveLength(0);
    expect(strings(root)).not.toMatch(/Source|ParlInfo|Updated/);
  });
  test('a saved copy says so above its rows and dates the copy in its own source line', () => {
    const savedAt = Date.parse('2026-10-03T01:00:00Z');
    const root = draw({
      ...recentBills,
      stale: true,
      staleReason: 'unavailable',
      savedAt,
    });
    expect(strings(root)).toContain('Showing the saved copy.');
    expect(
      host(root, 'today-bills-as-at')[0]!.props.accessibilityLabel,
    ).toMatch(/^Updated .+, ParlInfo bill records, Saved 3 Oct 2026$/);
  });
  test('failure and an empty feed sit on the paper, not in a box', () => {
    const failed = draw({
      ...recentBills,
      data: null,
      status: 'error',
      error: new ApiError('invalid-data', 'The catalog could not be read.'),
    });
    expect(failed.findAllByType(ErrorState)).toHaveLength(1);
    expect(failed.findAllByType(Card)).toHaveLength(0);
    const empty = draw({ ...recentBills, data: [] });
    expect(empty.findAllByType(EmptyState)).toHaveLength(1);
    expect(empty.findAllByType(Card)).toHaveLength(0);
  });
});

describe('new in parliament', () => {
  const recent = recentBills.data!;
  test('one row per bill between hairlines, not cards, each opening its bill', () => {
    const { root } = render(<BillFeed bills={recent} />);
    expect(root.findAllByType(RowList)).toHaveLength(1);
    expect(root.findAllByType(Card)).toHaveLength(0);
    expect(recent.map((_, i) => host(root, `today-bill-${i}`).length)).toEqual(
      recent.map(() => 1),
    );
    act(() => pressable(root, 'today-bill-0').props.onPress());
    expect(router.push).toHaveBeenCalledWith(billRoute(recent[0]!.key));
  });
  test('the status is said in words, with the introduced date and who brought it', () => {
    const bill = recent[0]!;
    const text = billRowText(bill);
    expect(text.status).toBe('Before parliament');
    const { root } = render(<BillFeed bills={[bill]} />);
    const row = host(root, 'today-bill-0')[0]!;
    expect(row.props.accessibilityLabel).toBe(text.label);
    expect(text.label).toContain(bill.title);
    expect(text.label).toContain('Before parliament');
    expect(strings(row)).toContain(bill.title);
    expect(strings(row)).toContain(`Introduced ${shortDay(bill.introduced!)}`);
  });
  test.each([standard, ax5])(
    'titles are never cut short and never broken mid-word',
    (size) => {
      jest.mocked(useWindowDimensions).mockReturnValue(size);
      const { root } = render(<BillFeed bills={recent} />);
      expect(
        root.findAll((n) => n.props.numberOfLines !== undefined),
      ).toHaveLength(0);
      const titles = root
        .findAllByType(Text)
        .filter((n) => recent.some((b) => n.props.children === b.title));
      expect(titles).toHaveLength(recent.length);
      expect(titles.every((n) => n.props.wordSafe === true)).toBe(true);
    },
  );
});

describe('a declaration', () => {
  const items = recentDeclarations.data!;
  const item = items[0]!;
  test('name and party as a dot and its name; the category joins the date line', () => {
    const { root } = render(<DeclarationRow item={item} index={0} />);
    const person = host(root, 'today-declaration-person-0')[0]!;
    const party = partyText({
      party: item.party!,
      status: item.partyStatus,
      formerly: item.formerly,
    }).visible;
    expect(strings(person)).toBe(`${item.name}${party}`);
    expect(strings(host(root, 'today-declaration-change-0')[0]!)).toBe(
      `${item.category} · ${registerChangeLabel(item.kind)} ${shortDay(item.date)}`,
    );
    // No filled chips in the row: the category is words on the date line.
    expect(root.findAllByType(Tag)).toHaveLength(0);
    const row = host(root, 'today-declaration-0')[0]!;
    expect(row.props.accessibilityLabel).toContain(item.name);
    expect(row.props.accessibilityLabel).toContain('Senate');
    expect(row.props.accessibilityLabel).toContain(item.category);
    expect(row.props.accessibilityLabel).toContain(item.description!);
  });
  test.each([
    [standard, 'row'],
    [ax5, 'column'],
  ])(
    'the portrait sits beside the text, and above it at AX5',
    (size, direction) => {
      jest.mocked(useWindowDimensions).mockReturnValue(size);
      const { root } = render(<DeclarationRow item={item} index={0} />);
      const layout = host(root, 'today-declaration-layout-0')[0]!;
      expect(flat(layout.props.style).flexDirection).toBe(direction);
    },
  );
  test('no credit, licence or register link rows', () => {
    const { root } = render(<DeclarationRow item={item} index={0} />);
    expect(strings(root)).not.toMatch(/licence|credit|Register of/i);
  });
  test('two lines until tapped, the whole entry after', () => {
    const { root } = render(<DeclarationRow item={item} index={0} />);
    const visible = () =>
      root.findAll(
        (n) =>
          typeof n.type === 'string' &&
          n.props.testID === 'today-declaration-text-0',
      )[0]!;
    expect(visible().props.numberOfLines).toBe(2);
    // The unseen measure reports the full entry's lines.
    const measure = host(root, 'today-declaration-measure-0')[0]!;
    act(() =>
      measure.props.onTextLayout({
        nativeEvent: { lines: [{}, {}, {}, {}] },
      }),
    );
    const row = host(root, 'today-declaration-0')[0]!;
    expect(row.props.accessibilityState).toMatchObject({ expanded: false });
    act(() => pressable(root, 'today-declaration-0').props.onPress());
    expect(visible().props.numberOfLines).toBeUndefined();
    expect(
      host(root, 'today-declaration-0')[0]!.props.accessibilityState,
    ).toMatchObject({ expanded: true });
    // A tap only expands; it never leaves Today.
    expect(router.push).not.toHaveBeenCalled();
  });
  test('View original opens the register page, from touch and hold and from VoiceOver', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    const { root } = render(<DeclarationRow item={item} index={0} />);
    act(() => pressable(root, 'today-declaration-0').props.onLongPress());
    const [options, choose] = sheet.mock.calls[0]!;
    expect(options).toEqual({
      title: item.name,
      options: ['View original', 'All recent declarations', 'Cancel'],
      cancelButtonIndex: 2,
    });
    act(() => choose(0));
    expect(alert).toHaveBeenLastCalledWith(
      `Source record: ${originalLabel(item)}`,
      item.url,
    );
    act(() => choose(1));
    expect(router.push).toHaveBeenLastCalledWith(declarationsRoute);
    act(() => choose(2));
    expect(alert).toHaveBeenCalledTimes(1);
    const row = host(root, 'today-declaration-0')[0]!;
    expect(row.props.accessibilityActions).toEqual([
      { name: 'viewOriginal', label: 'View original' },
      { name: 'allDeclarations', label: 'All recent declarations' },
    ]);
    act(() =>
      row.props.onAccessibilityAction({
        nativeEvent: { actionName: 'viewOriginal' },
      }),
    );
    expect(alert).toHaveBeenCalledTimes(2);
    sheet.mockRestore();
    alert.mockRestore();
  });
});

describe('explore the record', () => {
  const tiles = [
    ['today-leads-open', 'Leads', leadsRoute],
    ['today-money-map', 'Money map', moneyRoute()],
    ['today-public-money', 'Public money', '/public-money'],
    ['today-reports', 'Reports', { pathname: '/reports' }],
    ['today-community', 'Community', '/community/home'],
    ['today-explore-open', 'Explore', '/explore'],
    ['today-records-open', 'Just added', recentRecordsRoute],
  ] as const;
  test('one heading and seven tiles of one card style, in order, each opening its screen', () => {
    const { root } = render(<ExploreGrid />);
    expect(strings(root)).toMatch(/^Explore the record/);
    expect(root.findAllByType(Card)).toHaveLength(tiles.length);
    expect(
      root.findAllByType(Card).map((card) => card.props.testID as string),
    ).toEqual(tiles.map(([id]) => id));
    for (const [id, title, route] of tiles) {
      const tile = host(root, id)[0]!;
      expect(tile.props.accessibilityRole).toBe('button');
      expect(tile.props.accessibilityLabel).toMatch(new RegExp(`^${title}\\.`));
      act(() => pressable(root, id).props.onPress());
      expect(router.push).toHaveBeenLastCalledWith(route);
    }
  });
  test('the Leads tile keeps its caveat', () => {
    const { root } = render(<ExploreGrid />);
    expect(
      host(root, 'today-leads-open')[0]!.props.accessibilityLabel,
    ).toContain('a lead is not a finding');
  });
  test.each([
    [standard, '40%'],
    [ax5, '100%'],
  ])('two tiles a row, one at accessibility sizes', (size, basis) => {
    jest.mocked(useWindowDimensions).mockReturnValue(size);
    const { root } = render(<ExploreGrid />);
    const cells = root.findAll(
      (n) =>
        typeof n.type === 'string' &&
        flat(n.props.style).flexBasis !== undefined,
    );
    expect(cells.map((n) => flat(n.props.style).flexBasis)).toEqual(
      tiles.map(() => basis),
    );
  });
});

test('a publisher’s written date drops only this year', () => {
  const now = new Date(2026, 9, 10);
  expect(shortWrittenDay('12 Aug 2026', now)).toBe('12 Aug');
  expect(shortWrittenDay('12 Aug 2025', now)).toBe('12 Aug 2025');
  expect(shortWrittenDay('2026', now)).toBe('2026');
});
