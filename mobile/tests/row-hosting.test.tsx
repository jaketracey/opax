import { act, type ReactElement } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Link, router } from 'expo-router';
import { LinkRow, BillRow } from '../src/design/rows';
import { Tile, TileGrid } from '../src/design/card';
import { PersonRow } from '../src/design/people';
import { RowLink, RowTrigger } from '../src/design/row-link';
import { InsetGroup } from '../src/design/layout';

jest.mock('../src/features/follows/store', () => ({
  useFollows: () => [],
  loadFollows: jest.fn(async () => []),
  follow: jest.fn(async () => 'followed'),
  unfollow: jest.fn(async () => undefined),
}));

// The real Link needs the whole navigator. This one keeps the two pieces
// that touch the row: BaseExpoRouterLink's asChild Slot (expo-router 57.0.24
// build/link/BaseExpoRouterLink.js:82-87) around the real Link.Trigger, which
// slots its props into the row again (build/link/elements.js:170-183). Both
// go through Radix's mergeProps, which spreads the child's style.
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const actual = jest.requireActual('expo-router');
  const { Slot } = jest.requireActual('expo-router/build/ui/Slot');
  const { LinkTrigger } = jest.requireActual('expo-router/build/link/elements');
  const push = jest.fn();
  function Link({
    children,
    href,
    onPress,
  }: {
    children?: React.ReactNode;
    href: string;
    onPress?: (event: { preventDefault: () => void }) => void;
  }) {
    const kids = React.Children.toArray(children) as React.ReactElement[];
    const trigger =
      kids.find((child) => child.type === LinkTrigger) ??
      React.createElement(LinkTrigger, null, children);
    return React.createElement(
      Slot,
      {
        href,
        role: 'link',
        onPress: () => {
          let prevented = false;
          onPress?.({ preventDefault: () => (prevented = true) });
          if (!prevented) push(href);
        },
      },
      trigger,
    );
  }
  return {
    ...actual,
    Link: Object.assign(Link, {
      Trigger: LinkTrigger,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    router: { push, navigate: jest.fn() },
  };
});

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
  act(() => {
    for (const renderer of mounted.splice(0)) renderer.unmount();
  });
});
const target = (root: ReactTestInstance, testID: string) =>
  root.find(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const rowPressable = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) =>
      typeof node.props.style === 'function' && node.props.testID === testID,
  )[0] ??
  target(root, testID).find(
    (node) =>
      typeof node.type !== 'string' && typeof node.props.style === 'function',
  );
const host = (root: ReactTestInstance, testID: string) => {
  const accessible = target(root, testID);
  const pressable = accessible.findAll(
    (node) =>
      typeof node.type !== 'string' && typeof node.props.style === 'function',
  )[0];
  return pressable?.find((node) => typeof node.type === 'string') ?? accessible;
};
const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

// The parent host view of an instance: where it actually lays out.
function hostParent(node: ReactTestInstance) {
  let parent = node.parent;
  while (parent && typeof parent.type !== 'string') parent = parent.parent;
  return parent;
}
// The direct host children of a host view, in drawing order.
function hostChildren(node: ReactTestInstance): ReactTestInstance[] {
  return node.children.flatMap((child) =>
    typeof child === 'string'
      ? []
      : typeof child.type === 'string'
        ? [child]
        : hostChildren(child),
  );
}
// The direct host child of `row` that holds `node`.
function slotOf(row: ReactTestInstance, node: ReactTestInstance) {
  let at: ReactTestInstance | null =
    typeof node.type === 'string'
      ? node
      : (node.findAll((child) => typeof child.type === 'string')[0] ?? null);
  while (at && hostParent(at) !== row) at = hostParent(at);
  return at ? hostChildren(row).indexOf(at) : -1;
}
const symbolNamed = (root: ReactTestInstance, name: string) =>
  root.find(
    (node) =>
      typeof node.type !== 'string' &&
      (node.type as { name?: string }).name === 'Icon' &&
      node.props.name === name,
  );
const textOf = (root: ReactTestInstance, text: string) =>
  root.find(
    (node) =>
      typeof node.type === 'string' &&
      [node.props.children].flat().includes(text),
  );

/**
 * One line: the row lays out horizontally, and the leading glyph (or
 * portrait), the text block and the trailing chevron are three separate
 * cells of it, in that order. The wave 4 regression drew them as a column.
 */
function expectOneLine(
  root: ReactTestInstance,
  testID: string,
  parts: { leading?: ReactTestInstance; text: ReactTestInstance },
) {
  const row = host(root, testID);
  expect(flat(row.props.style).flexDirection).toBe('row');
  expect(flat(row.props.style).alignItems).toBe('center');
  const chevron = slotOf(row, symbolNamed(row, 'chevron.right'));
  const text = slotOf(row, parts.text);
  expect(text).toBeGreaterThanOrEqual(0);
  expect(chevron).toBe(hostChildren(row).length - 1);
  expect(text).toBeLessThan(chevron);
  if (parts.leading) {
    const leading = slotOf(row, parts.leading);
    expect(leading).toBeGreaterThanOrEqual(0);
    expect(leading).toBeLessThan(text);
  }
  return row;
}
const press = (root: ReactTestInstance, testID: string) =>
  act(() => {
    rowPressable(root, testID).props.onPress();
  });

beforeEach(() => jest.mocked(router.push).mockClear());

describe('rows keep one line in every host (iOS, through Link.Trigger)', () => {
  test('the platform is iOS, where rows go through the native Link', () => {
    expect(Platform.OS).toBe('ios');
  });

  test('LinkRow with an href in an InsetGroup', () => {
    const tree = render(
      <InsetGroup header="Browse">
        <LinkRow
          title="Parties"
          symbol="person.3"
          href="/parties"
          testID="browse-party"
        />
        <LinkRow
          title="Topics"
          symbol="number"
          detail="Every topic"
          href="/topics"
          testID="browse-topics"
        />
      </InsetGroup>,
    );
    expectOneLine(tree.root, 'browse-party', {
      leading: symbolNamed(host(tree.root, 'browse-party'), 'person.3'),
      text: textOf(tree.root, 'Parties'),
    });
    expectOneLine(tree.root, 'browse-topics', {
      leading: symbolNamed(host(tree.root, 'browse-topics'), 'number'),
      text: textOf(tree.root, 'Every topic'),
    });
    press(tree.root, 'browse-party');
    expect(router.push).toHaveBeenCalledWith('/parties');
  });

  test('PersonRow with an href in an InsetGroup', () => {
    const tree = render(
      <InsetGroup>
        <PersonRow
          name="Anthony Albanese"
          place="Member for Grayndler"
          href="/subject/person/anthony-albanese"
          testID="search-result-anthony-albanese"
        />
      </InsetGroup>,
    );
    const row = host(tree.root, 'search-result-anthony-albanese');
    expectOneLine(tree.root, 'search-result-anthony-albanese', {
      text: textOf(row, 'Member for Grayndler'),
    });
    expect(
      target(tree.root, 'search-result-anthony-albanese').props.accessible,
    ).toBe(true);
  });

  test('BillRow with an href in an InsetGroup and bare', () => {
    const bill = (testID: string) => (
      <BillRow
        billKey={testID}
        title="Child Support Amendment Bill 2026"
        status="Before parliament"
        date="2026-09-17"
        meta={{ portfolio: 'Social Services portfolio' }}
        href={`/bill/${testID}`}
        testID={testID}
      />
    );
    const tree = render(
      <View>
        <InsetGroup>{bill('grouped')}</InsetGroup>
        {bill('bare')}
      </View>,
    );
    for (const testID of ['grouped', 'bare'])
      expectOneLine(tree.root, testID, {
        text: host(tree.root, `${testID}-title`),
      });
  });

  test("the edition's subject rows, composed as EditionStory hosts them", () => {
    // features/edition/EditionStory.tsx: one subject row in an InsetGroup,
    // with an href and an empty menu (bill, politician, money or topic day).
    const tree = render(
      <View>
        <InsetGroup>
          <BillRow
            billKey="r7529"
            title="Interactive Gambling Amendment Bill 2026"
            href="/bill/r7529"
            status=""
            showStatus={false}
            menu={[]}
            testID="subject-bill"
          />
        </InsetGroup>
        <InsetGroup>
          <PersonRow
            name="Alex Hawke"
            party="Liberal"
            place="Mitchell, NSW"
            href="/subject/person/alex-hawke"
            menu={[]}
            testID="subject-person"
          />
        </InsetGroup>
        <InsetGroup>
          <LinkRow
            title="Critical Metals CRC"
            symbol="dollarsign.circle"
            href="/money/grant"
            value="$4,000,000"
            valueEmphasis
            testID="subject-money"
          />
        </InsetGroup>
      </View>,
    );
    expectOneLine(tree.root, 'subject-bill', {
      text: host(tree.root, 'subject-bill-title'),
    });
    expectOneLine(tree.root, 'subject-person', {
      text: textOf(host(tree.root, 'subject-person'), 'Mitchell, NSW'),
    });
    expectOneLine(tree.root, 'subject-money', {
      leading: symbolNamed(
        host(tree.root, 'subject-money'),
        'dollarsign.circle',
      ),
      text: textOf(tree.root, '$4,000,000'),
    });
  });

  test('a row Pressable handed to RowLink keeps its own style function', () => {
    const style = jest.fn(({ pressed }: { pressed: boolean }) => [
      { flexDirection: 'row' as const, alignItems: 'center' as const },
      pressed ? { opacity: 0.5 } : null,
    ]);
    const select = jest.fn();
    const tree = render(
      <RowLink href="/x" select={select}>
        <Pressable testID="custom" style={style}>
          <View testID="custom-text" />
        </Pressable>
      </RowLink>,
    );
    expect(style).toHaveBeenCalled();
    expect(flat(host(tree.root, 'custom').props.style).flexDirection).toBe(
      'row',
    );
    press(tree.root, 'custom');
    expect(select).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  test('LinkRow inside a bare Link asChild', () => {
    const tree = render(
      <InsetGroup>
        <Link href="/money" asChild>
          <LinkRow title="Money map" symbol="map" testID="money-map" />
        </Link>
      </InsetGroup>,
    );
    expectOneLine(tree.root, 'money-map', {
      leading: symbolNamed(host(tree.root, 'money-map'), 'map'),
      text: textOf(tree.root, 'Money map'),
    });
  });
});

/**
 * Build 36: once RowTrigger carried the tile's own style into the Link, its
 * `height: '100%'` reached Yoga inside TileGrid's wrapping row, where a
 * percentage height resolves against the whole grid and compounds on every
 * layout pass (Today's More to explore grid laid out about 48,000 pt tall;
 * the Explore hub's quiz tile filled the screen). A tile fills its cell by
 * growing, never by a percentage of anything.
 */
describe('tiles keep a bounded height through the Link slot', () => {
  const dimensions = [
    'height',
    'minHeight',
    'maxHeight',
    'flexBasis',
    'width',
    'minWidth',
    'maxWidth',
  ] as const;
  const percentages = (style: Record<string, unknown>) =>
    dimensions.filter((key) => /%\s*$/.test(String(style[key] ?? '')));
  const tiles = (
    <TileGrid testID="grid">
      <Tile
        title="Public money"
        line="Grants and contracts by program and place"
        symbol="building.columns"
        ink="money"
        href="/money"
        testID="tile-money"
      />
      <Tile
        title="Leads"
        line="Names that appear in both money and the record"
        symbol="person.3"
        ink="interests"
        href="/leads"
        testID="tile-leads"
      />
      <Tile
        title="Largest grants"
        line="The biggest new grant agreements each month"
        symbol="dollarsign.circle"
        ink="money"
        href="/grants"
        testID="tile-grants"
      />
    </TileGrid>
  );

  test('no host view under the grid carries a percentage dimension', () => {
    const tree = render(tiles);
    const grid = host(tree.root, 'grid');
    const hosts = grid.findAll((node) => typeof node.type === 'string');
    expect(hosts.length).toBeGreaterThan(3);
    for (const node of hosts)
      expect({
        testID: node.props.testID,
        bad: percentages(flat(node.props.style)),
      }).toEqual({ testID: node.props.testID, bad: [] });
  });

  test('the tile Pressable grows into its cell in both pressed states', () => {
    const tree = render(tiles);
    const pressable = rowPressable(tree.root, 'tile-money');
    expect(pressable).toBeDefined();
    for (const pressed of [false, true]) {
      const style = flat(pressable.props.style({ pressed }));
      expect(percentages(style)).toEqual([]);
      expect(style.flexGrow).toBe(1);
      expect(style.minHeight).toBeGreaterThan(0);
    }
    // The host view the Pressable renders keeps the grown, bounded style.
    const row = host(tree.root, 'tile-money');
    expect(flat(row.props.style).flexGrow).toBe(1);
    expect(flat(row.props.style).height).toBeUndefined();
  });

  test('the lead tile of the Explore hub grid is bounded too', () => {
    const tree = render(
      <TileGrid lead testID="hub">
        {tiles.props.children}
      </TileGrid>,
    );
    const hosts = host(tree.root, 'hub').findAll(
      (node) => typeof node.type === 'string',
    );
    expect(hosts.length).toBeGreaterThan(3);
    for (const node of hosts)
      expect(percentages(flat(node.props.style))).toEqual([]);
  });
});

describe('RowTrigger', () => {
  test('merges the slot into the row as Radix would, keeping the row style', () => {
    const rowPress = jest.fn();
    const slotPress = jest.fn();
    const ref = jest.fn();
    const tree = render(
      <RowTrigger
        row={
          <Pressable
            testID="row"
            accessibilityRole="button"
            onPressIn={rowPress}
            style={({ pressed }) => [
              { flexDirection: 'row' },
              pressed ? { opacity: 0.5 } : null,
            ]}
          />
        }
        style={{ marginTop: 4 }}
        accessibilityRole="link"
        onPressIn={slotPress}
        onPress={slotPress}
        ref={ref}
      />,
    );
    const row = host(tree.root, 'row');
    expect(flat(row.props.style)).toMatchObject({
      flexDirection: 'row',
      marginTop: 4,
    });
    const pressable = tree.root.findAll(
      (node) => typeof node.type !== 'string' && node.props.testID === 'row',
    )[0];
    expect(pressable.props.accessibilityRole).toBe('button');
    act(() => pressable.props.onPressIn());
    expect(rowPress).toHaveBeenCalledTimes(1);
    expect(slotPress).toHaveBeenCalledTimes(1);
    expect(pressable.props.onPress).toBe(slotPress);
    expect(ref).toHaveBeenCalledWith(expect.anything());
  });
});
