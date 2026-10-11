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
import { formatDate } from '../src/design/format';
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
  DeclarationGroup,
  LONG_ENTRY,
  originalLabel,
} from '../src/features/today/DeclarationRow';
import { ExploreGrid } from '../src/features/today/ExploreGrid';
import { TodayFoot } from '../src/features/today/Foot';
import { billsSources, editionSources } from '../src/features/today/sources';
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
  test('the edition’s source line, then the independence line (D4) and the leads reminder', () => {
    const { root } = render(<TodayFoot edition={edition} />);
    expect(root.findAllByType(SourceLine)).toHaveLength(1);
    expect(strings(host(root, 'today-independence')[0]!)).toBe(
      'OPAX is independent and non-partisan. It is not a government app.',
    );
    expect(strings(host(root, 'today-screen-footer')[0]!)).toBe(
      'Patterns in the public record are leads, not findings. Check the linked sources.',
    );
    // The edition's own date, not the oldest feed's.
    expect(host(root, 'today-sources')[0]!.props.accessibilityLabel).toBe(
      'Updated 4 Oct 2026, OPAX daily edition',
    );
  });
  test('the sheet names the edition, its page and its own notes', () => {
    const details = editionSources(edition.data!);
    expect(details.asOf).toBe('2026-10-04');
    expect(details.originals!.map((original) => original.url)).toEqual([
      edition.data!.path,
    ]);
    const notes = details.notes!.filter(Boolean).join('\n');
    expect(notes).toContain('OPAX’s post for 4 October 2026');
    for (const row of edition.data!.sourceRows) expect(notes).toContain(row);
  });
  test('until the edition loads, or with no edition, only the independence line', () => {
    for (const block of [null, { ...edition, status: 'missing' as const }]) {
      const { root } = render(<TodayFoot edition={block} />);
      expect(root.findAllByType(SourceLine)).toHaveLength(0);
      expect(host(root, 'today-independence')).toHaveLength(1);
    }
  });
  test('a saved edition carries its own line in the card, so the foot has none', () => {
    const savedAt = Date.parse('2026-10-03T01:00:00Z');
    const { root } = render(
      <TodayFoot edition={{ ...edition, stale: true, savedAt }} />,
    );
    expect(root.findAllByType(SourceLine)).toHaveLength(0);
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
        sources={billsSources}
        sourceTitle="About these bills"
      >
        {() => <Text testID="rows">rows</Text>}
      </TodayBlock>,
    ).root;
  test('a current feed closes with its own source line and its own date', () => {
    const root = draw(recentBills);
    expect(host(root, 'rows')).toHaveLength(1);
    expect(host(root, 'today-bills-as-at')[0]!.props.accessibilityLabel).toBe(
      `Updated ${formatDate(recentBills.asAt!, 'short')}, ParlInfo bill records`,
    );
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
  const one = (entry = item) => (
    <DeclarationGroup entries={[{ item: entry, index: 0 }]} />
  );
  test('name and party as a dot and its name; the category joins the date line', () => {
    const { root } = render(one());
    const person = host(root, 'today-declaration-person-0')[0]!;
    const party = partyText({
      party: item.party!,
      status: item.partyStatus,
      formerly: item.formerly,
    }).visible;
    expect(strings(person)).toBe(`${item.name}${party}`);
    expect(person.props.accessibilityLabel).toBe(
      `${item.name}, ${party}, Senate`,
    );
    expect(strings(host(root, 'today-declaration-change-0')[0]!)).toBe(
      `${item.category} · ${registerChangeLabel(item.kind)} ${shortDay(item.date)}`,
    );
    // No filled chips in the row: the category is words on the date line.
    expect(root.findAllByType(Tag)).toHaveLength(0);
    const row = host(root, 'today-declaration-0')[0]!;
    expect(row.props.accessibilityLabel).toMatch(new RegExp(`^${item.name}, `));
    expect(row.props.accessibilityLabel).toContain(item.category);
  });
  test('no credit, licence or register link rows', () => {
    const { root } = render(one());
    expect(strings(root)).not.toMatch(/licence|credit|Register of/i);
  });
  test('View original opens the register page, from touch and hold and from VoiceOver', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    const { root } = render(one());
    act(() =>
      root
        .find(
          (n) =>
            n.props.testID === 'today-declaration-0' &&
            typeof n.props.onLongPress === 'function',
        )
        .props.onLongPress(),
    );
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
  test('a short entry shows in full; a long one opens from a disclosure, never clamped', () => {
    const short = items.find(
      (i) => (i.description?.length ?? 0) <= LONG_ENTRY,
    )!;
    const long = items.find((i) => (i.description?.length ?? 0) > LONG_ENTRY)!;
    const shown = render(one(short)).root;
    expect(strings(host(shown, 'today-declaration-text-0')[0]!)).toBe(
      short.description,
    );
    expect(host(shown, 'today-declaration-more-0')).toHaveLength(0);
    const folded = render(one(long)).root;
    expect(folded.findAll((n) => n.props.numberOfLines !== undefined)).toEqual(
      [],
    );
    expect(host(folded, 'today-declaration-text-0')).toHaveLength(0);
    const more = host(folded, 'today-declaration-more-0')[0]!;
    expect(more.props.accessibilityState).toMatchObject({ expanded: false });
    // The entry's own element names the change; the words are the disclosure's.
    expect(
      host(folded, 'today-declaration-0')[0]!.props.accessibilityLabel,
    ).not.toContain(long.description);
    act(() => pressable(folded, 'today-declaration-more-0').props.onPress());
    expect(strings(host(folded, 'today-declaration-text-0')[0]!)).toBe(
      long.description,
    );
    // Opening only shows the entry; it never leaves Today.
    expect(router.push).not.toHaveBeenCalled();
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
