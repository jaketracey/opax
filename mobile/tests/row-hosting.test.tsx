import { act, type ReactElement } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Link, router } from 'expo-router';
import { LinkRow, BillRow } from '../src/design/rows';
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
const host = (root: ReactTestInstance, testID: string) =>
  root.find(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
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
    // The outermost element carrying the row's id is its Pressable, holding
    // whatever onPress the host handed it.
    root
      .findAll(
        (node) =>
          typeof node.type !== 'string' &&
          node.props.testID === testID &&
          typeof node.props.onPress === 'function',
      )[0]
      .props.onPress();
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
    expect(row.props.accessible).toBe(true);
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
