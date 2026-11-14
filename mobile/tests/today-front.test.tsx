import { act, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import {
  decodeRecentInterests,
  recentBillsFor,
  recentDeclarationsFor,
} from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import { formatDate, unbroken } from '../src/design/format';
import { InsetGroup } from '../src/design/layout';
import { Tile } from '../src/design/card';
import { Button } from '../src/design/controls';
import { SeatInvitation } from '../src/features/today/SeatInvitation';
import { SurfaceContext } from '../src/design/row-padding';
import { Icon } from '../src/design/icon';
import { PartyLabel, PersonRow, Portrait } from '../src/design/people';
import { symbols } from '../src/design/symbols';
import { rhythm } from '../src/design/tokens';
import { PageFoot } from '../src/design/record';
import { BillRow } from '../src/design/rows';
import { SourceLine } from '../src/design/source';
import { InlineError, OfflineLine } from '../src/design/states';
import { Text } from '../src/design/text';
import { BillFeed, billRowText } from '../src/features/today/BillFeed';
import {
  DeclarationGroup,
  DeclarationEntry,
  LONG_ENTRY,
  declarationsForRoute,
  entryPreview,
  DECLARANT_PORTRAIT,
  PREVIEW_LINES,
} from '../src/features/today/DeclarationRow';
import { TodayFoot } from '../src/features/today/Foot';
import { Masthead, mastheadDate } from '../src/features/today/Masthead';
import {
  MoreToExplore,
  exploreTiles,
} from '../src/features/today/MoreToExplore';
import {
  billsSources,
  declarationsSources,
  oldestDate,
  publishers,
  rules,
} from '../src/features/today/sources';
import {
  TodayBlock,
  blockState,
  type TodayBlockState,
} from '../src/features/today/TodayBlock';
import { registerChangeLabel } from '../src/features/your-mp/model';
import { changeDate } from '../src/features/follows/changes';
import {
  exploreRoute,
  largestGrantsRoute,
  leadsRoute,
  publicMoneyRoute,
  recentRecordsRoute,
} from '../src/navigation/routes';
import { bills, catalogs, pinned } from './pinned';
import { learnRoute } from '../src/features/learn/routes';

jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn(async () => null) },
  catalogs: {},
}));
jest.mock('../src/features/explore/runtime', () => ({
  explore: { pictures: jest.fn(() => new Promise(() => {})) },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const Wrap = ({ children, ...props }: { children?: ReactNode }) =>
    React.createElement(Native.View, props, children);
  const Link = Object.assign(
    (props: { children?: ReactNode }) => React.createElement(Wrap, props),
    {
      Trigger: (props: { children?: ReactNode }) =>
        React.createElement(Wrap, props),
      Preview: () => null,
      Menu: (props: { children?: ReactNode }) =>
        React.createElement(Wrap, props),
      MenuAction: (props: { children?: ReactNode }) =>
        React.createElement(Wrap, props),
    },
  );
  return {
    Link,
    router: { push: jest.fn(), navigate: jest.fn() },
    useSegments: () => [],
  };
});
const standard = { width: 402, height: 874, scale: 3, fontScale: 1 };

const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  return renderer;
}
afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
});
const host = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const strings = (node: ReactTestInstance): string =>
  node
    .findAll((n) => n.type === 'Text')
    .flatMap((n) =>
      ([] as unknown[])
        .concat(n.props.children)
        .filter((c): c is string => typeof c === 'string'),
    )
    .join(' ');
/** The href each Link (RowLink, Card) in the tree carries, in order. */
const hrefs = (root: ReactTestInstance) => {
  const seen: string[] = [];
  for (const node of root.findAll(
    (n) => typeof n.type !== 'string' && n.props.href !== undefined,
  )) {
    const key = JSON.stringify(node.props.href);
    if (seen.at(-1) !== key) seen.push(key);
  }
  return seen.map((key) => JSON.parse(key));
};
/** Strings Today must never show (the brief's acceptance list). */
const banned = /Daily edition ·|snapshot|export|indexed|native|Try again\.|—/i;

const recentBills = recentBillsFor(bills, 3);
const passedBills = recentBillsFor(bills, 3, 'passed');
const recentDeclarations = recentDeclarationsFor(
  decodeRecentInterests(pinned('/interests/recent.json')),
  3,
  catalogs,
);

beforeEach(() => {
  jest.mocked(router.push).mockClear();
  jest.mocked(useWindowDimensions).mockReturnValue(standard);
});

describe('the date line', () => {
  test('dates the page on the Sydney calendar', () => {
    expect(mastheadDate(new Date('2026-10-06T22:00:00Z'))).toBe(
      'Wednesday 7 October',
    );
    expect(mastheadDate(new Date('2026-12-31T13:05:00Z'))).toBe(
      'Friday 1 January',
    );
  });
  test('is plain text, not a header, with the offline line only when offline', () => {
    const now = new Date('2026-11-08T01:00:00Z');
    const online = render(<Masthead now={now} offlineSavedAt={null} />).root;
    const line = host(online, 'today-screen-message')[0]!;
    expect(strings(line)).toBe('Sunday 8 November');
    expect(line.props.accessibilityRole).not.toBe('header');
    expect(online.findAllByType(OfflineLine)).toHaveLength(0);
    const offline = render(
      <Masthead
        now={now}
        offlineSavedAt={Date.parse('2026-11-07T01:00:00Z')}
      />,
    ).root;
    expect(offline.findAllByType(OfflineLine)).toHaveLength(1);
  });
});

test.each([1, 3.571])(
  'Tile chevrons share the title row at font scale %s',
  (fontScale) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ ...standard, fontScale });
    const { root } = render(
      <Tile
        title="A long tile title that wraps"
        line="A description under the title"
        symbol="text.bubble"
        ink="navy"
        href="/ask"
      />,
    );
    const title = root
      .findAllByType(Text)
      .find((n) => n.props.children === 'A long tile title that wraps')!;
    const description = root
      .findAllByType(Text)
      .find((n) => n.props.children === 'A description under the title')!;
    const row = title.parent!;
    expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('row');
    expect(StyleSheet.flatten(title.props.style).flex).toBe(1);
    const chevron = row.findByType(Icon);
    expect(chevron.props).toMatchObject({
      name: 'chevron.right',
      size: 13,
      weight: 'semibold',
      tone: 'inkFaint',
    });
    expect(row.findAllByType(Text)).not.toContain(description);
    act(() =>
      title.props.onTextLayout({
        nativeEvent: { lines: [{ height: 24 * fontScale }] },
      }),
    );
    expect(StyleSheet.flatten(chevron.parent!.props.style)).toMatchObject({
      height: 24 * fontScale,
      justifyContent: 'center',
    });
  },
);

test.each([1, 3.571])(
  'Use my location is centred with a 44 pt target at font scale %s',
  (fontScale) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ ...standard, fontScale });
    const { root } = render(<SeatInvitation />);
    const button = root
      .findAllByType(Button)
      .find((n) => n.props.testID === 'today-invitation-location')!;
    expect(StyleSheet.flatten(button.parent!.props.style).alignSelf).toBe(
      'center',
    );
    const target = host(root, 'today-invitation-location')[0]!;
    expect(
      StyleSheet.flatten(target.props.style).minHeight,
    ).toBeGreaterThanOrEqual(44);
  },
);

describe('the foot', () => {
  test('PageFoot’s Today variant: the independence line and Report a correction, nothing else', () => {
    const { root } = render(<TodayFoot />);
    expect(root.findAllByType(PageFoot)).toHaveLength(1);
    expect(root.findByType(PageFoot).props.variant).toBe('today');
    for (const id of [
      'today-foot',
      'today-independence',
      'today-screen-footer',
    ])
      expect(host(root, id)).toHaveLength(1);
    expect(strings(root)).toContain(
      'OPAX is independent and non-partisan. It is not a government app.',
    );
    expect(strings(root)).toContain('Report a correction');
    expect(strings(root)).not.toMatch(/leads, not findings/);
    expect(root.findAllByType(SourceLine)).toHaveLength(0);
  });
});

describe('the block shell', () => {
  const draw = (state: TodayBlockState<string[]>) =>
    render(
      <TodayBlock
        title="Bills"
        state={state}
        skeleton={<Text testID="skeleton">…</Text>}
        empty="No bills introduced yet."
        error="Bills couldn’t be loaded."
        onRetry={() => {}}
        line={{ ...billsSources(recentBills), testID: 'today-bills-sources' }}
        testID="today-bills"
      >
        {() => <Text testID="rows">rows</Text>}
      </TodayBlock>,
    ).root;
  test('content, then its line as the last element', () => {
    const root = draw({ kind: 'ready', data: ['a'] });
    expect(host(root, 'rows')).toHaveLength(1);
    const block = host(root, 'today-bills')[0]!;
    const body = block.children.at(-1) as ReactTestInstance;
    expect(
      (body.children.at(-1) as ReactTestInstance).findAllByType(SourceLine),
    ).toHaveLength(1);
  });
  test('loading draws the skeleton and a place for the line', () => {
    const root = draw({ kind: 'loading' });
    expect(host(root, 'skeleton')).toHaveLength(1);
    expect(root.findAllByType(SourceLine)).toHaveLength(0);
  });
  test('one error with Try again and no line; empty keeps its line; collapse draws nothing', () => {
    const failed = draw({ kind: 'error' });
    expect(failed.findAllByType(InlineError)).toHaveLength(1);
    expect(failed.findAllByType(SourceLine)).toHaveLength(0);
    const empty = draw({ kind: 'empty' });
    expect(strings(empty)).toContain('No bills introduced yet.');
    expect(empty.findAllByType(SourceLine)).toHaveLength(1);
    expect(draw({ kind: 'collapse' }).children).toHaveLength(0);
  });
  test('states from a read: missing collapses; an optional empty block collapses', () => {
    expect(blockState(null)).toEqual({ kind: 'loading' });
    expect(
      blockState({ ...recentBills, status: 'missing', data: null }),
    ).toEqual({ kind: 'collapse' });
    expect(blockState({ ...recentBills, data: [] })).toEqual({ kind: 'empty' });
    expect(
      blockState({ ...recentBills, data: [] }, { emptyCollapses: true }),
    ).toEqual({ kind: 'collapse' });
    expect(
      blockState({
        ...recentBills,
        data: null,
        status: 'error',
        error: new ApiError('offline', 'Offline'),
      }),
    ).toEqual({ kind: 'error' });
  });
});

describe('the lines’ words', () => {
  test('short publisher names and the rules, word for word', () => {
    expect(publishers).toMatchObject({
      bills: 'ParlInfo',
      declarations: 'Registers of interests',
      votes: 'They Vote For You',
    });
    expect(billsSources(recentBills).citation).toEqual([
      expect.objectContaining({ label: 'ParlInfo' }),
    ]);
    expect(billsSources(recentBills).rule).toBe(rules.billsNew);
    expect(billsSources(recentBills, 'passed').rule).toBe(
      'Newest passed or given Royal Assent first.',
    );
    expect(declarationsSources(recentDeclarations).rule).toBe(
      'Newest declarations first, from both registers.',
    );
  });
  test('a saved copy says Saved in the line itself', () => {
    const savedAt = Date.parse('2026-10-03T01:00:00Z');
    const details = billsSources({ ...recentBills, stale: true, savedAt });
    expect(details).toMatchObject({ savedAt, state: 'saved' });
    const { root } = render(<SourceLine {...details} testID="line" />);
    expect(host(root, 'line')[0]!.props.accessibilityLabel).toMatch(
      /^Saved 3 Oct 2026, ParlInfo/,
    );
  });
  test('each register page once, and the oldest date for a combined line', () => {
    const originals = declarationsSources(recentDeclarations).originals!;
    expect(new Set(originals.map((o) => o.label)).size).toBe(originals.length);
    expect(oldestDate(['2026-10-05', null, '2026-10-01T03:00:00Z'])).toBe(
      '2026-10-01',
    );
  });
});

describe('Bills', () => {
  test('three rows in one inset group, each a BillRow opening its bill', () => {
    const { root } = render(<BillFeed bills={recentBills.data!} />);
    expect(root.findAllByType(InsetGroup)).toHaveLength(1);
    const rows = root.findAllByType(BillRow);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.props.testID)).toEqual([
      'today-bill-0',
      'today-bill-1',
      'today-bill-2',
    ]);
  });
  test('New shows the capsule and the introduced date; Passed has no capsule', () => {
    const neu = render(<BillFeed bills={recentBills.data!} />).root;
    expect(
      neu.findAllByType(BillRow).every((r) => r.props.showStatus === true),
    ).toBe(true);
    const bill = recentBills.data![0]!;
    expect(billRowText(bill).date?.replace(/\s/g, ' ')).toBe(
      `Introduced ${formatDate(bill.introduced!, 'short')}`.replace(/\s/g, ' '),
    );
    const passed = render(
      <BillFeed bills={passedBills.data!} kind="passed" />,
    ).root;
    expect(
      passed.findAllByType(BillRow).every((r) => r.props.showStatus === false),
    ).toBe(true);
    for (const b of passedBills.data!) {
      expect(b.status).toBe('passed');
      expect(billRowText(b, 'passed').label).not.toContain('Before parliament');
    }
  });
});

describe('Just declared', () => {
  const items = recentDeclarations.data!;
  const item = items[0]!;
  const one = (entry = item) => (
    <DeclarationGroup entries={[{ item: entry, index: 0 }]} />
  );
  test('the member and entry share one link to the filtered feed', () => {
    const { root } = render(one());
    expect(host(root, 'today-declaration-person-0-name')).not.toHaveLength(0);
    expect(strings(host(root, 'today-declaration-change-0')[0]!)).toBe(
      `${item.category} · ${unbroken(`${registerChangeLabel(item.kind)} ${changeDate(item.date)}`)}`,
    );
    expect(hrefs(root)).toContainEqual(declarationsForRoute(item.name));
    expect(declarationsForRoute(item.name)).toEqual({
      pathname: '/declarations',
      params: { person: item.name },
    });
    expect(strings(root)).not.toMatch(/The entry in full|\bMore\b/);
  });
  // Sweep 1, item 3: portrait, then "Name · party" on one line beside it,
  // the item 8 pt under, three lines at most, then the meta line. Party
  // text has one style in the list, whether or not it has a party page.
  test.each(['Liberal', 'Independent'])(
    '%s: the declarant reads name and party on one line, the item 8 pt under it',
    (party) => {
      jest.mocked(useWindowDimensions).mockReturnValue(standard);
      const { root } = render(
        one({ ...item, party, profileSlug: 'susan-mcdonald' }),
      );
      const portrait = root.findByType(Portrait);
      expect(portrait.props.size).toBe(DECLARANT_PORTRAIT);
      expect(DECLARANT_PORTRAIT).toBe(40);
      const identity = host(root, 'today-declaration-identity-0')[0]!;
      expect(StyleSheet.flatten(identity.props.style)).toMatchObject({
        flexDirection: 'row',
        minHeight: DECLARANT_PORTRAIT,
      });
      const label = root.findByType(PartyLabel);
      expect(label.props.linked).toBe(false);
      // Drawn in the label's own ink, never a link's navy.
      const partyText = host(root, 'today-declaration-party-0-link')[0]!;
      expect(partyText.props.onPress).toBeUndefined();
      expect(partyText.props.accessibilityRole).toBeUndefined();
      const ink = (
        StyleSheet.flatten(partyText.props.style) as { color?: string }
      ).color;
      expect(ink).toBe(
        (
          StyleSheet.flatten(
            host(root, 'today-declaration-change-0')[0]!.props.style,
          ) as { color?: string }
        ).color,
      );
      // The name and party are one line's children; the item follows it.
      expect(
        identity.findAll(
          (n) =>
            typeof n.type === 'string' &&
            n.props.testID === 'today-declaration-person-0-name',
        ),
      ).not.toHaveLength(0);
      const words = host(root, 'today-declaration-text-0')[0]!;
      let column = identity.parent!;
      while (column.type !== 'View') column = column.parent!;
      const gap = (StyleSheet.flatten(column.props.style) as { gap: number })
        .gap;
      const marginTop = (
        StyleSheet.flatten(words.props.style) as { marginTop: number }
      ).marginTop;
      expect(gap + marginTop).toBe(8);
      expect(words.props.numberOfLines).toBe(PREVIEW_LINES);
      expect(PREVIEW_LINES).toBe(3);
    },
  );
  test.each([1, 3.571])(
    'each declaration has one link, one chevron and padded content at font scale %s',
    (fontScale) => {
      jest
        .mocked(useWindowDimensions)
        .mockReturnValue({ ...standard, fontScale });
      const profiled = { ...item, profileSlug: 'susan-mcdonald' };
      const { root } = render(one(profiled));
      expect(root.findAllByType(PersonRow)).toHaveLength(0);
      const links = root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessible === true &&
          node.props.accessibilityRole === 'link',
      );
      expect(links).toHaveLength(1);
      const row = host(root, 'today-declaration-0')[0]!;
      expect(links[0]).toBe(row);
      expect(row.props.accessible).toBe(true);
      expect(row.props.accessibilityLabel).toContain(item.name);
      expect(row.props.accessibilityLabel).toContain(item.party);
      expect(row.props.accessibilityLabel).toContain(item.category);
      expect(row.props.accessibilityLabel).toContain(
        entryPreview(item.description!),
      );
      expect(
        root
          .findAllByType(Icon)
          .filter((node) => node.props.name === symbols.chevron),
      ).toHaveLength(1);
      const pressable = row.find(
        (node) =>
          node.type === 'View' &&
          node.props.accessible === false &&
          node.props.accessibilityRole === 'link',
      );
      expect(StyleSheet.flatten(pressable.props.style)).toMatchObject({
        paddingTop: rhythm.row,
        paddingBottom: rhythm.row + rhythm.heading,
      });
      const name = host(root, 'today-declaration-person-0-name')[0]!;
      const words = host(root, 'today-declaration-text-0')[0]!;
      const meta = host(root, 'today-declaration-change-0')[0]!;
      const columnOf = (node: ReactTestInstance) => {
        let column = node.parent!;
        while (column.type !== 'View') column = column.parent!;
        return column;
      };
      // Name and party share one line, whose column is the words' column.
      const identity = host(root, 'today-declaration-identity-0')[0]!;
      expect(columnOf(name) === identity).toBe(true);
      expect(columnOf(identity) === columnOf(words)).toBe(true);
      expect(columnOf(meta) === columnOf(words)).toBe(true);
      expect(columnOf(columnOf(words)).props.accessibilityElementsHidden).toBe(
        true,
      );
      // Only the entry's words are clamped, to three lines, and only at
      // Large: names, party and meta are never cut.
      expect(
        root
          .findAll(
            (node) =>
              typeof node.type === 'string' &&
              node.props.numberOfLines !== undefined,
          )
          .map((node) => [node.props.testID, node.props.numberOfLines]),
      ).toEqual(
        fontScale === 1 ? [['today-declaration-text-0', PREVIEW_LINES]] : [],
      );
      act(() => row.props.onAccessibilityTap());
      expect(router.push).toHaveBeenLastCalledWith(
        declarationsForRoute(item.name),
      );
    },
  );
  test.each([1, 3.571])(
    'every grouped row keeps the larger bottom inset when its meta wraps at font scale %s',
    (fontScale) => {
      jest
        .mocked(useWindowDimensions)
        .mockReturnValue({ ...standard, fontScale });
      const { root } = render(
        <SurfaceContext.Provider value="sunken">
          <InsetGroup>
            {items.map((entry, index) => (
              <DeclarationEntry
                key={entry.id}
                item={{
                  ...entry,
                  category: 'Sponsored travel or hospitality',
                  date: '2026-10-09',
                  kind: 'addition',
                }}
                index={index}
              />
            ))}
          </InsetGroup>
        </SurfaceContext.Provider>,
      );
      for (const index of items.keys()) {
        const meta = host(root, `today-declaration-change-${index}`)[0]!;
        expect(strings(meta)).toBe(
          'Sponsored travel or hospitality · added\u00a09\u00a0Oct',
        );
        const lineHeight =
          StyleSheet.flatten(meta.props.style).lineHeight * fontScale;
        const height = lineHeight * 2;
        // Supply a two-line native measurement, including at AX5. Jest does
        // not lay out native glyphs; the row must leave space after both lines.
        act(() => {
          meta.props.onLayout({
            nativeEvent: { layout: { x: 0, y: 100, width: 240, height } },
          });
          meta.props.onTextLayout({
            nativeEvent: {
              lines: ['Sponsored travel or ', 'hospitality · added 9 Oct'].map(
                (text, line) => ({
                  text,
                  x: 0,
                  y: line * lineHeight,
                  width: 240,
                  height: lineHeight,
                }),
              ),
            },
          });
        });
        const row = host(root, `today-declaration-${index}`)[0]!;
        const pressable = row.find(
          (node) =>
            node.type === 'View' &&
            node.props.accessible === false &&
            node.props.accessibilityRole === 'link',
        );
        const style = StyleSheet.flatten(pressable.props.style);
        expect(style.paddingTop).toBe(rhythm.row);
        expect(style.paddingBottom).toBe(rhythm.row + rhythm.heading);
        expect(style.paddingBottom).toBeGreaterThan(style.paddingTop);
        expect(style.height).toBeUndefined();
        expect(style.maxHeight).toBeUndefined();
        expect(StyleSheet.flatten(meta.props.style).minHeight).toBe(
          Math.ceil(height) + 1,
        );
        expect(meta.props.allowFontScaling).toBe(true);
        expect(meta.props.maxFontSizeMultiplier).toBe(0);
        expect(meta.props.numberOfLines).toBeUndefined();
      }
    },
  );
  test('a long entry shows its opening, cut at a word, in the record’s words', () => {
    const long = items.find((i) => (i.description?.length ?? 0) > LONG_ENTRY);
    if (!long) return;
    const { root } = render(one(long));
    const preview = strings(host(root, 'today-declaration-text-0')[0]!);
    expect(preview).toBe(entryPreview(long.description!));
    expect(preview).toMatch(/…$/);
  });
  test('a preview is cut at a word, with an ellipsis, and a short entry is left whole', () => {
    const words = 'Shareholding in Example Holdings Pty Ltd held by spouse';
    expect(entryPreview(words)).toBe(words);
    const long = Array.from({ length: 12 }, () => words).join(', ');
    const cut = entryPreview(long);
    expect(cut.length).toBeLessThanOrEqual(LONG_ENTRY + 1);
    expect(cut).toMatch(/[^\s,]…$/);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(entryPreview('x'.repeat(300))).toBe(`${'x'.repeat(LONG_ENTRY)}…`);
  });
});

describe('More to explore', () => {
  test('four tiles in order, then Quizzes and tools and How Parliament works; no Money map, Explore, Reports or Community tile', () => {
    const { root } = render(<MoreToExplore />);
    expect(strings(host(root, 'today-explore')[0]!)).toMatch(
      /^More to explore/,
    );
    expect(exploreTiles.map((t) => t.testID)).toEqual([
      'today-public-money',
      'today-leads-open',
      'today-largest-grants',
      'today-records-open',
    ]);
    expect(hrefs(root)).toEqual([
      publicMoneyRoute,
      leadsRoute,
      largestGrantsRoute(),
      recentRecordsRoute,
      exploreRoute,
      learnRoute,
    ]);
    expect(
      exploreTiles.find((t) => t.testID === 'today-largest-grants')!.line,
    ).toBe('The biggest new grant agreements each month');
    for (const id of [
      'today-money-map',
      'today-reports',
      'today-community',
      'today-pair',
    ])
      expect(host(root, id)).toHaveLength(0);
    expect(strings(host(root, 'today-explore-open')[0]!)).toContain(
      'Quizzes and tools',
    );
    expect(strings(host(root, 'today-learn-open')[0]!)).toContain(
      'How Parliament works',
    );
  });
  test('case A draws the daily pair under the header', () => {
    const { root } = render(
      <MoreToExplore pair={<View testID="today-pair" />} />,
    );
    expect(host(root, 'today-pair')).toHaveLength(1);
  });
});

test('no block says a retired or pipeline word, or an em dash', () => {
  const now = new Date('2026-11-08T01:00:00Z');
  const pages = [
    <Masthead key="m" now={now} offlineSavedAt={null} />,
    <TodayFoot key="f" />,
    <BillFeed key="b" bills={recentBills.data!} />,
    <BillFeed key="p" bills={passedBills.data!} kind="passed" />,
    <DeclarationGroup
      key="d"
      entries={recentDeclarations.data!.map((item, index) => ({ item, index }))}
    />,
    <MoreToExplore key="e" />,
  ];
  for (const page of pages) {
    const { root } = render(page);
    expect(strings(root)).not.toMatch(banned);
    const labels = root
      .findAll((n) => typeof n.props.accessibilityLabel === 'string')
      .map((n) => n.props.accessibilityLabel as string)
      .join(' ');
    expect(labels).not.toMatch(banned);
  }
});
