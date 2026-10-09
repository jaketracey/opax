import { act, type ReactElement } from 'react';
import { ActionSheetIOS, Alert, useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import {
  decodeRecentInterests,
  recentBillsFor,
  recentDeclarationsFor,
} from '../src/api/catalogs';
import { BillCarousel, billCardText } from '../src/features/today/BillCarousel';
import {
  DeclarationRow,
  originalLabel,
} from '../src/features/today/DeclarationRow';
import { LeadsCard } from '../src/features/today/LeadsCard';
import { Masthead, mastheadDate } from '../src/features/today/Masthead';
import { TodayBlock } from '../src/features/today/TodayBlock';
import { UpdatedCaption, shortDay } from '../src/features/today/parts';
import {
  billRoute,
  declarationsRoute,
  leadsRoute,
} from '../src/navigation/routes';
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

beforeEach(() => {
  jest.mocked(router.push).mockClear();
  jest.mocked(useWindowDimensions).mockReturnValue(standard);
});

describe('the masthead', () => {
  test('dates the front page on this iPhone’s calendar', () => {
    expect(mastheadDate(new Date(2026, 9, 7, 9))).toBe('Wednesday 7 October');
    expect(mastheadDate(new Date(2027, 0, 1, 0, 5))).toBe('Friday 1 January');
  });
  test('keeps the independence line, which starts "OPAX is"', () => {
    const { root } = render(<Masthead />);
    expect(strings(host(root, 'today-screen-message')[0]!)).toBe(
      'OPAX is independent and non-partisan. It is not a government app.',
    );
    // Sentence case (D6): no uppercase labels.
    expect(strings(host(root, 'today-date')[0]!)).toBe(
      mastheadDate(new Date()),
    );
  });
});

describe('the quiet caption', () => {
  test('says when the record was updated, and when a saved copy was saved', () => {
    const year = new Date().getFullYear();
    expect(shortDay(`${year}-10-04`)).toBe('4 Oct');
    expect(shortDay('2025-10-04')).toBe('4 Oct 2025');
    const { root } = render(
      <UpdatedCaption asAt="2025-10-04" savedAt={null} testID="c" />,
    );
    expect(strings(root)).toBe('Updated 4 Oct 2025');
    const unknown = render(<UpdatedCaption asAt={null} testID="c" />);
    expect(strings(unknown.root)).toBe('Date not published');
  });
  test('a Today block names no source and links none', () => {
    const block = recentBillsFor(bills, 6);
    const { root } = render(
      <TodayBlock
        block={block}
        empty="None"
        onRetry={() => {}}
        testID="today-bills"
      >
        {() => null}
      </TodayBlock>,
    );
    expect(strings(host(root, 'today-bills-as-at')[0]!)).toMatch(
      /^Updated \d{1,2} \w{3}( \d{4})?$/,
    );
    expect(strings(root)).not.toMatch(/Source|ParlInfo/);
  });
});

describe('recently introduced bills', () => {
  const recent = recentBillsFor(bills, 6).data!;
  test('one card per bill, in a horizontal rail, each opening its bill', () => {
    const { root } = render(<BillCarousel bills={recent} />);
    expect(
      root.find((n) => n.props.testID === 'today-bills-rail').props.horizontal,
    ).toBe(true);
    expect(recent.map((_, i) => host(root, `today-bill-${i}`).length)).toEqual(
      recent.map(() => 1),
    );
    act(() => pressable(root, 'today-bill-0').props.onPress());
    expect(router.push).toHaveBeenCalledWith(billRoute(recent[0]!.key));
  });
  test('at accessibility sizes the cards stack, one per row', () => {
    jest.mocked(useWindowDimensions).mockReturnValue(ax5);
    const { root } = render(<BillCarousel bills={recent} />);
    expect(
      root.findAll((n) => n.props.testID === 'today-bills-rail'),
    ).toHaveLength(0);
    expect(host(root, 'today-bill-5')).toHaveLength(1);
  });
  test('the status is said in words, with the introduced date and who brought it', () => {
    const bill = recent[0]!;
    const text = billCardText(bill);
    expect(text.status).toBe('Before parliament');
    const { root } = render(<BillCarousel bills={[bill]} />);
    const card = host(root, 'today-bill-0')[0]!;
    expect(card.props.accessibilityLabel).toBe(text.label);
    expect(text.label).toContain(bill.title);
    expect(text.label).toContain('Before parliament');
    expect(strings(card)).toContain(bill.title);
    expect(strings(card)).toContain('Before parliament');
    // Bill titles are never cut short.
    expect(
      root.findAll((n) => n.props.numberOfLines !== undefined),
    ).toHaveLength(0);
  });
});

describe('a recent declaration', () => {
  const recent = decodeRecentInterests(pinned('/interests/recent.json'));
  const items = recentDeclarationsFor(recent, 6, catalogs).data!;
  const item = items[0]!;
  test('one line for the member, party and category; the change and date beneath', () => {
    const { root } = render(<DeclarationRow item={item} index={0} />);
    const person = host(root, 'today-declaration-person-0')[0]!;
    expect(strings(person)).toBe(`${item.name}LNP${item.category}`);
    expect(strings(root)).toContain(`Added ${shortDay(item.date)}`);
    const row = host(root, 'today-declaration-0')[0]!;
    expect(row.props.accessibilityLabel).toContain(item.name);
    expect(row.props.accessibilityLabel).toContain('LNP');
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
      const style = Object.assign(
        {},
        ...[layout.props.style].flat(Infinity).filter(Boolean),
      );
      expect(style.flexDirection).toBe(direction);
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

test('the Leads card opens Leads and keeps its caveat', () => {
  const { root } = render(<LeadsCard />);
  const card = host(root, 'today-leads-open')[0]!;
  expect(card.props.accessibilityRole).toBe('button');
  expect(card.props.accessibilityLabel).toContain('a lead is not a finding');
  act(() => pressable(root, 'today-leads-open').props.onPress());
  expect(router.push).toHaveBeenCalledWith(leadsRoute);
});
