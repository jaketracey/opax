import { Link, router } from 'expo-router';
import {
  HeaderHeightContext,
  NavigationContext,
} from 'expo-router/react-navigation';
import { act, useContext, type ReactElement, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Text as NativeText,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Icon } from '../src/design/icon';
import {
  InsetGroup,
  PinnedRestContext,
  Screen,
  ScreenHeader,
  SectionHeader,
  TitleAnchor,
} from '../src/design/layout';
import { FaceStack, PersonRow, Portrait } from '../src/design/people';
import { RowLink, menuLeaves, rowMenus } from '../src/design/row-link';
import {
  BillRow,
  wordClamp,
  DivisionRow,
  LinkRow,
  MoneyRow,
  RecordRow,
  SuggestionRow,
  ValueRow,
} from '../src/design/rows';
import { Heading, Text } from '../src/design/text';
import { follow } from '../src/features/follows/store';

import * as adaptive from '../src/design/adaptive';
import { Hoverable } from '../src/design/adaptive';
import { AUTHORISATION_LINE } from '../src/design/authorisation';
import { Card, Tile, TileGrid } from '../src/design/card';
import { ChoiceChip, MachinePill, StatusCapsule } from '../src/design/labels';
import { FigureBlock, PageFoot, StatStrip } from '../src/design/record';
import {
  SelectedMark,
  selectedWash,
  splitRowStyles,
} from '../src/design/selection';
import { SourceLine } from '../src/design/source';
import {
  colors,
  layout,
  minimumTarget,
  radii,
  rhythm,
} from '../src/design/tokens';

jest.mock('../src/features/follows/store', () => ({
  useFollows: () => [],
  loadFollows: jest.fn(async () => []),
  follow: jest.fn(async () => 'followed'),
  unfollow: jest.fn(async () => undefined),
}));

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    person: jest.fn(async () => ({
      data: { canonicalPersonId: 'person_0123456789abcdef01234567' },
    })),
  },
}));

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const Wrap = ({ children, ...props }: { children?: ReactNode }) =>
    React.createElement(Native.View, props, children);
  const LinkRoot = (props: { children?: ReactNode }) =>
    React.createElement(Wrap, props);
  const Link = Object.assign(LinkRoot, {
    Trigger: (props: { children?: ReactNode }) =>
      React.createElement(Wrap, props),
    Preview: () =>
      React.createElement(Native.View, { testID: 'native-preview' }),
    Menu: (props: { children?: ReactNode }) => React.createElement(Wrap, props),
    MenuAction: (props: { children?: ReactNode }) =>
      React.createElement(Wrap, props),
  });
  return {
    Link,
    router: { push: jest.fn(), navigate: jest.fn() },
    useSegments: () => [],
  };
});
const mounted: TestRenderer.ReactTestRenderer[] = [];
const initialWindow = Dimensions.get('window'),
  initialScreen = Dimensions.get('screen');
const originalOS = Platform.OS;
function size(fontScale = 1, width = 402) {
  act(() =>
    Dimensions.set({
      window: { ...initialWindow, fontScale, width },
      screen: { ...initialScreen, fontScale, width },
    }),
  );
}
function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  return renderer;
}
function host(root: ReactTestInstance, testID: string) {
  return root.find(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
}
function row(root: ReactTestInstance, testID = 'row') {
  const direct = root.findAll(
    (node) =>
      typeof node.props.style === 'function' && node.props.testID === testID,
  )[0];
  // RowLink owns the accessible ID outside the native preview boundary;
  // the Pressable inside still owns the visual row and its style function.
  return (
    direct ??
    host(root, testID).find((node) => typeof node.props.style === 'function')
  );
}
const flat = (style: unknown) =>
  StyleSheet.flatten(style as never) as Record<string, unknown>;
const rowStyle = (node: ReactTestInstance, pressed = false) =>
  flat(
    typeof node.props.style === 'function'
      ? node.props.style({ pressed })
      : node.props.style,
  );
const strings = (root: ReactTestInstance) =>
  root
    .findAllByType(NativeText)
    .map((node) => node.props.children)
    .flat(4)
    .filter((child): child is string => typeof child === 'string');
const glyphs = (root: ReactTestInstance) =>
  root.findAllByType(Icon).map((node) => node.props.name);
beforeEach(() => {
  size();
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((renderer) => renderer.unmount());
    Dimensions.set({ window: initialWindow, screen: initialScreen });
  });
  Platform.OS = originalOS;
});

const href = '/person/person_0123456789abcdef01234567';

test.each([
  ['From', 'Australian Office of Financial Management'],
  ['Commonwealth Bank of Australia Limited', '$1,234,567'],
])(
  'inline ValueRow balances %s and %s without a zero-basis value',
  (label, value) => {
    const root = render(<ValueRow label={label} value={value} />).root;
    const [labelText, valueText] = root.findAllByType(NativeText);
    expect(labelText!.props.children).toBe(label);
    expect(flat(labelText!.props.style)).toMatchObject({
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      minWidth: '35%',
    });
    expect(flat(valueText!.props.style)).toMatchObject({
      flexShrink: 0,
      textAlign: 'right',
    });
    expect(flat(valueText!.props.style).maxWidth).toBeUndefined();
    expect(flat(valueText!.props.style).flex).toBeUndefined();
    expect(valueText!.props.numberOfLines).toBeUndefined();
  },
);

test.each([
  ['Median monthly mortgage repayment', '$3,000', 58],
  ['Unemployment', '1.2%', 40],
  ['Commonwealth Bank of Australia Limited', '$79,800', 72],
  ['Owed to banks and lenders', '$52,405', 72],
])(
  'ValueRow keeps %s beside the whole figure %s at 402 pt',
  (label, value, figureWidth) => {
    size(1, 402);
    const root = render(<ValueRow label={label} value={value} />).root;
    const [labelText, valueText] = root.findAllByType(Text);
    act(() => {
      labelText!.parent!.props.onLayout({
        nativeEvent: { layout: { width: 370 } },
      });
      valueText!.props.onTextLayout({
        nativeEvent: { lines: [{ text: value, width: figureWidth }] },
      });
    });
    const nativeValue = root.findAllByType(NativeText)[1]!;
    expect(nativeValue.props.children).toBe(value);
    expect(flat(nativeValue.props.style)).toMatchObject({ flexShrink: 0 });
    expect(flat(nativeValue.props.style).maxWidth).toBeUndefined();
    expect(nativeValue.props.numberOfLines).toBeUndefined();
    expect(flat(labelText!.props.style).flexShrink).toBe(1);
    expect(flat(labelText!.parent!.props.style).flexDirection).toBe('row');
  },
);

test('ValueRow stacks a long figure, then returns inline when the column widens', () => {
  const value = '$123,456,789,012,345,678';
  const renderer = render(<ValueRow label="Total debts" value={value} />);
  const nativeTexts = renderer.root.findAllByType(NativeText);
  const content = () => renderer.root.findAllByType(Text)[0]!.parent!;
  act(() => {
    content().props.onLayout({ nativeEvent: { layout: { width: 370 } } });
    renderer.root.findAllByType(Text)[1]!.props.onTextLayout({
      nativeEvent: {
        lines: [
          { text: '$123,456,789,', width: 140 },
          { text: '012,345,678', width: 120 },
        ],
      },
    });
  });
  expect(flat(content().props.style)).toMatchObject({
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
  });
  expect(strings(renderer.root)).toEqual(['Total debts', value]);
  const valueStyle = flat(
    renderer.root.findAllByType(NativeText)[1]!.props.style,
  );
  expect(valueStyle.flexShrink).toBe(0);
  expect(valueStyle.textAlign).toBeUndefined();
  act(() => {
    renderer.root.findAllByType(Text)[1]!.props.onTextLayout({
      nativeEvent: { lines: [{ text: value, width: 260 }] },
    });
  });
  expect(flat(content().props.style).flexDirection).toBe('column');
  act(() =>
    content().props.onLayout({ nativeEvent: { layout: { width: 600 } } }),
  );
  expect(flat(content().props.style).flexDirection).toBe('row');
  act(() =>
    content().props.onLayout({ nativeEvent: { layout: { width: 370 } } }),
  );
  expect(flat(content().props.style).flexDirection).toBe('column');
  act(() => renderer.update(<ValueRow label="Total debts" value="$3,000" />));
  expect(flat(content().props.style).flexDirection).toBe('row');
  renderer.root
    .findAllByType(NativeText)
    .forEach((text, index) => expect(text).toBe(nativeTexts[index]));
  size(3.571);
  renderer.root
    .findAllByType(NativeText)
    .forEach((text, index) => expect(text).toBe(nativeTexts[index]));
});

test.each([1.786, 3.571])(
  'ValueRow retains the stacked layout at font scale %s',
  (scale) => {
    size(scale);
    const root = render(
      <ValueRow
        label="From"
        value="Australian Office of Financial Management"
      />,
    ).root;
    const [label, value] = root.findAllByType(Text);
    expect(label!.props.style).toBeUndefined();
    expect(flat(value!.props.style)).toEqual({ flexShrink: 0 });
    expect(flat(label!.parent!.props.style)).toMatchObject({
      flexDirection: 'column',
      flexWrap: 'nowrap',
      alignItems: 'flex-start',
    });
  },
);

for (const scale of [1, 1.786, 3.571]) {
  describe(`row anatomy at fontScale ${scale}`, () => {
    const rows: [string, ReactElement, boolean][] = [
      [
        'LinkRow',
        <LinkRow key="LinkRow" title="Anne" href={href} testID="row" />,
        true,
      ],
      [
        'ValueRow',
        <ValueRow
          key="ValueRow"
          label="Pay"
          value="$25,000"
          href={href}
          testID="row"
        />,
        true,
      ],
      [
        'PersonRow',
        <PersonRow key="PersonRow" name="Anne" href={href} testID="row" />,
        true,
      ],
      [
        'BillRow',
        <BillRow
          key="BillRow"
          title="Example Bill"
          status="Before parliament"
          date="Introduced 17 Sep 2026"
          href={href}
          testID="row"
        />,
        true,
      ],
      [
        'RecordRow',
        <RecordRow
          key="RecordRow"
          title="A speech"
          meta="Speech · 17 Sep 2026"
          href={href}
          testID="row"
        />,
        true,
      ],
      [
        'DivisionRow',
        <DivisionRow
          key="DivisionRow"
          title="Example Bill"
          meta="Third reading"
          outcome="Agreed to"
          ayes={76}
          noes={55}
          countsStyle="votes"
          href={href}
          testID="row"
        />,
        true,
      ],
      [
        'MoneyRow',
        <MoneyRow
          key="MoneyRow"
          name="Organisation"
          amount={10000}
          href={href}
          testID="row"
        />,
        true,
      ],
      [
        'SuggestionRow',
        <SuggestionRow
          key="SuggestionRow"
          name="Anne"
          kind="person"
          portrait={null}
          secondary="Member for Grayndler"
          href={href}
          testID="row"
        />,
        false,
      ],
    ];
    test.each(rows)(
      '%s keeps its target, navigation and accessories',
      (_name, element, chevron) => {
        size(scale);
        const root = render(element).root;
        expect(rowStyle(row(root)).minHeight).toBeGreaterThanOrEqual(44);
        expect(root.findAllByType(RowLink)).toHaveLength(1);
        expect(glyphs(root).includes('chevron.right')).toBe(chevron);
      },
    );
    test.each([
      <PersonRow
        key="person"
        name="Anne"
        portrait={null}
        href={href}
        testID="row"
      />,
      <SuggestionRow
        key="suggestion"
        name="Anne"
        kind="person"
        portrait={null}
        href={href}
        testID="row"
      />,
    ])('portrait is before the name and stacks at AX1+', (element) => {
      size(scale);
      const root = render(element).root;
      const portrait = root.findByType(Portrait);
      const anatomy = portrait.parent!;
      expect(flat(anatomy.props.style).flexDirection).toBe(
        scale === 1 ? 'row' : 'column',
      );
      expect(anatomy.children[0]).toBe(portrait);
      expect(
        root.findAllByType(Text).some((node) => node.props.children === 'Anne'),
      ).toBe(true);
    });
  });
}

test('BillRow showStatus and dateLabel vary independently; spoken status stays', () => {
  for (const showStatus of [false, true]) {
    const root = render(
      <BillRow
        title="Example"
        status="Passed"
        date="2026-09-17"
        dateLabel="Assented"
        showStatus={showStatus}
        href={href}
        testID="row"
      />,
    ).root;
    expect(root.findAllByType(StatusCapsule)).toHaveLength(showStatus ? 1 : 0);
    expect(strings(root)).toContain('Assented 17 Sep 2026');
    expect(row(root).props.accessibilityLabel).toContain('Passed');
  }
  expect(
    strings(
      render(
        <BillRow
          title="Example"
          status="Passed"
          date="Introduced 17 Sep 2026"
        />,
      ).root,
    ),
  ).toContain('Introduced 17 Sep 2026');
});
test('LinkRow checkmark selection is explicit and independent of split selection', () => {
  for (const selected of [false, true]) {
    const root = render(
      <LinkRow
        title="Labor"
        accessory="checkmark"
        selected={selected}
        testID="row"
      />,
    ).root;
    expect(row(root).props.accessibilityState.selected).toBe(selected);
    expect(glyphs(root)).toEqual(selected ? ['checkmark'] : []);
    expect(root.findAllByType(SelectedMark)).toHaveLength(0);
    expect(rowStyle(row(root)).backgroundColor).toBeUndefined();
  }
  expect(
    glyphs(render(<LinkRow title="Labor" accessory="none" />).root),
  ).toEqual([]);
});
for (const selected of [false, true]) {
  test.each([
    <LinkRow
      key="link"
      title="Labor"
      href={href}
      selected={selected}
      testID="row"
    />,
    <BillRow
      key="bill"
      title="Bill"
      status="Passed"
      href={href}
      selected={selected}
      testID="row"
    />,
    <PersonRow
      key="person"
      name="Anne"
      href={href}
      selected={selected}
      testID="row"
    />,
  ])('split selection anatomy, selected=' + selected, (element) => {
    const root = render(element).root;
    expect(row(root).props.accessibilityState.selected).toBe(selected);
    expect(rowStyle(row(root))).toMatchObject(flat(splitRowStyles.bleed));
    expect(rowStyle(row(root)).backgroundColor).toEqual(
      selected ? selectedWash().backgroundColor : undefined,
    );
    expect(root.findAllByType(SelectedMark)).toHaveLength(selected ? 1 : 0);
    expect(glyphs(root)).not.toContain('chevron.right');
    expect(glyphs(root)).not.toContain('checkmark');
    expect(root.findByType(Hoverable).props).toHaveProperty('onHover');
  });
}
test.each(['link', 'bill', 'person'])(
  '%s keyboard activation respects select, onPress and href',
  (kind) => {
    for (const mode of ['href', 'onPress', 'select']) {
      const onPress = mode !== 'href' ? jest.fn() : undefined;
      const select = mode === 'select' ? jest.fn() : undefined;
      const props = { href, onPress, select, testID: 'row' };
      const root = render(
        kind === 'link' ? (
          <LinkRow title="Anne" {...props} />
        ) : kind === 'bill' ? (
          <BillRow title="Bill" status="Passed" {...props} />
        ) : (
          <PersonRow name="Anne" {...props} />
        ),
      ).root;
      jest.mocked(router.push).mockClear();
      act(() => root.findByType(Hoverable).props.onActivate());
      if (select) {
        expect(select).toHaveBeenCalledTimes(1);
        expect(onPress).not.toHaveBeenCalled();
      } else if (onPress) expect(onPress).toHaveBeenCalledTimes(1);
      else expect(router.push).toHaveBeenCalledWith(href);
      if (onPress || select) expect(router.push).not.toHaveBeenCalled();
    }
  },
);
test('PersonRow only says Your MP when its caller passes yourMP', () => {
  for (const yourMP of [false, true]) {
    const root = render(
      <PersonRow name="Anne" yourMP={yourMP} href={href} testID="row" />,
    ).root;
    expect(strings(root).includes('Your MP')).toBe(yourMP);
    expect(row(root).props.accessibilityLabel.includes('Your MP')).toBe(yourMP);
  }
});
test('RecordRow title can be omitted; stored stages move to the dated kind line', () => {
  for (const showTitle of [false, true]) {
    const root = render(
      <RecordRow
        title="Example Bill - Second reading"
        meta="Speech · Senate · 17 Sep"
        showTitle={showTitle}
        href={href}
        testID="row"
      />,
    ).root;
    expect(strings(root).includes('Example Bill')).toBe(showTitle);
    expect(strings(root)).toContain(
      'Speech · Senate · 17 Sep · Second reading',
    );
    expect(row(root).props.accessibilityLabel).not.toContain(
      ' - Second reading',
    );
  }
  expect(strings(render(<RecordRow meta="Speech · 17 Sep" />).root)).toEqual([
    'Speech · 17 Sep',
  ]);
});
test('compact excerpts clamp at 3 lines, then 2 at AX1+, with no nested More', () => {
  for (const scale of [1, 1.786]) {
    size(scale);
    const root = render(
      <RecordRow
        title="A speech"
        meta="Speech"
        excerpt={{
          text: 'A full passage with evidence',
          highlight: ['evidence'],
        }}
        compact
        href={href}
        testID="row"
      />,
    ).root;
    const excerpt = root
      .findAllByType(Text)
      .find((node) => node.props.variant === 'recordText')!;
    expect(excerpt.props.numberOfLines).toBe(scale === 1 ? 3 : 2);
    expect(strings(root)).not.toContain('More');
    expect(row(root).props.accessibilityLabel).toContain(
      'A full passage with evidence',
    );
  }
  const full = render(
    <RecordRow
      title="A speech"
      meta="Speech"
      excerpt={{ text: 'Full passage' }}
    />,
  );
  expect(strings(full.root)).not.toContain('More');
});
test('DivisionRow expands party content in place and leaves the navigation variant unchanged', () => {
  const renderer = render(
    <DivisionRow
      title="Example"
      meta="Third reading"
      outcome="Agreed to"
      ayes={76}
      noes={55}
      countsStyle="ayesNoes"
      expandable
      testID="row"
    >
      <Text>Labor: 60 ayes</Text>
    </DivisionRow>,
  );
  expect(row(renderer.root).props.accessibilityState).toEqual({
    expanded: false,
  });
  expect(strings(renderer.root)).not.toContain('Labor: 60 ayes');
  expect(glyphs(renderer.root)).toContain('chevron.down');
  act(() => row(renderer.root).props.onPress());
  expect(row(renderer.root).props.accessibilityState).toEqual({
    expanded: true,
  });
  expect(strings(renderer.root)).toContain('Labor: 60 ayes');
  act(() => row(renderer.root).props.onPress());
  expect(strings(renderer.root)).not.toContain('Labor: 60 ayes');
});
test('DivisionRow split can describe the member against their party, or remain the whole vote', () => {
  for (const split of [
    undefined,
    { ayes: 3, noes: 12, partyVote: 'no' as const },
  ]) {
    const root = render(
      <DivisionRow
        title="Example"
        meta="Third reading"
        outcome="Voted for"
        ayes={76}
        noes={55}
        countsStyle="ayesNoes"
        split={split}
        href={href}
        testID="row"
      />,
    ).root;
    expect(strings(root)).toContain(
      split ? '3 ayes, 12 noes' : '76 ayes, 55 noes',
    );
    expect(strings(root).includes('Party voted against')).toBe(!!split);
  }
});
test.each([1, 1.786])(
  'money amounts use strong tabular ink, stacking at AX1+, scale=%s',
  (scale) => {
    size(scale);
    const root = render(
      <MoneyRow name="Private recipient" amount={1250000} testID="row" />,
    ).root;
    expect(strings(root)).toContain('$1,250,000');
    const amount = root
      .findAllByType(Text)
      .find((node) => node.props.children === '$1,250,000')!;
    expect(amount.props).toMatchObject({
      variant: 'strong',
      tone: 'ink',
      tabular: true,
    });
    expect(flat(amount.parent!.props.style).flexDirection).toBe(
      scale === 1 ? 'row' : 'column',
    );
    expect(glyphs(root)).toEqual([]);
    expect(rowStyle(row(root), true).backgroundColor).toBeUndefined();
    expect(row(root).props.accessibilityLabel).toContain('1,250,000 dollars');
  },
);

test('every builder gives iOS the exact native menu leaves as accessibility actions', () => {
  const follow = { following: true, onFollow: jest.fn() };
  const menus = [
    rowMenus.person({
      name: 'Anne',
      slug: 'anne',
      ...follow,
      setSeat: { label: 'Set Grayndler as my electorate', onSelect: jest.fn() },
    }),
    rowMenus.bill({
      title: 'Bill',
      billKey: 'au-federal-example',
      onAsk: jest.fn(),
      ...follow,
    }),
    rowMenus.record({ title: 'Speech', slug: 'speech-123' }),
    rowMenus.place({
      title: 'Grayndler',
      path: '/subject/electorate/grayndler',
      ...follow,
    }),
    rowMenus.following({
      title: 'Anne',
      path: '/subject/person/anne',
      onUnfollow: jest.fn(),
    }),
    rowMenus.division({
      billTitle: 'Bill',
      billKey: 'au-federal-example',
      ...follow,
    }),
  ];
  for (const menu of menus) {
    const root = render(
      <RowLink href={href} menu={menu}>
        <Pressable testID="row">
          <Text>Anne</Text>
        </Pressable>
      </RowLink>,
    ).root;
    const leaves = menuLeaves(menu);
    expect(
      root.findAllByType(Link.MenuAction).map((node) => node.props.title),
    ).toEqual(leaves.map((item) => item.title));
    expect(
      host(root, 'row').props.accessibilityActions.map(
        (action: { name: string }) => action.name,
      ),
    ).toEqual(leaves.map((item) => item.title));
    const action = jest.fn();
    const target = render(
      <RowLink href={href} menu={[{ title: 'Follow', onPress: action }]}>
        <Pressable testID="row" />
      </RowLink>,
    ).root;
    act(() =>
      host(target, 'row').props.onAccessibilityAction({
        nativeEvent: { actionName: 'Follow' },
      }),
    );
    expect(action).toHaveBeenCalledTimes(1);
  }
});
test('iPad selection prevents a push and suppresses the preview', () => {
  const select = jest.fn(),
    preventDefault = jest.fn();
  const root = render(
    <RowLink href={href} select={select}>
      <Pressable testID="row" />
    </RowLink>,
  ).root;
  expect(root.findAllByProps({ testID: 'native-preview' })).toHaveLength(0);
  act(() => root.findByType(Link).props.onPress({ preventDefault }));
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(select).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
});
test('Android uses Pressable navigation, long press and accessibility actions', () => {
  Platform.OS = 'android';
  const action = jest.fn();
  const root = render(
    <RowLink href={href} menu={[{ title: 'Copy link', onPress: action }]}>
      <Pressable testID="row" />
    </RowLink>,
  ).root;
  const control = root.find(
    (node) =>
      node.props.testID === 'row' && typeof node.props.onPress === 'function',
  );
  act(() => control.props.onPress());
  expect(router.push).toHaveBeenCalledWith(href);
  expect(typeof control.props.onLongPress).toBe('function');
  act(() =>
    host(root, 'row').props.onAccessibilityAction({
      nativeEvent: { actionName: 'Copy link' },
    }),
  );
  expect(action).toHaveBeenCalledTimes(1);
});

test.each([402, 414, 420])(
  'Screen margin at %s pt and grouped inset surface',
  (width) => {
    size(1, width);
    const root = render(
      <Screen grouped testID="screen">
        <InsetGroup header="Recent">
          <LinkRow title="One" />
          <LinkRow title="Two" />
        </InsetGroup>
      </Screen>,
    ).root;
    const scroll = root.findByType(ScrollView);
    expect(flat(scroll.props.contentContainerStyle).paddingHorizontal).toBe(
      width < 414 ? 16 : 20,
    );
    expect(flat(scroll.props.contentContainerStyle).paddingBottom).toBe(36);
    expect(flat(scroll.props.style).backgroundColor).toEqual(colors.sunken);
    expect(
      root
        .findAllByType(View)
        .some(
          (node) => flat(node.props.style)?.borderRadius === radii.container,
        ),
    ).toBe(true);
  },
);
test.each([2, 3] as const)(
  'level %s section header rows keep the same height and centred gap with or without an action',
  (level) => {
    const withoutAction = render(
      <SectionHeader title="Try asking" level={level} />,
    ).root;
    const withAction = render(
      <SectionHeader
        title="Conversations"
        level={level}
        action={{
          label: 'See all conversations',
          accessibilityLabel: 'See all conversations',
          onPress: jest.fn(),
        }}
      />,
    ).root;
    const headerStyle = flat(withoutAction.findByType(View).props.style);
    expect(headerStyle).toEqual(flat(withAction.findByType(View).props.style));
    // Centring the heading in the action's existing height reserves the
    // same space below it, without adding padding or a margin to either row.
    expect(headerStyle).toEqual({
      flexDirection: 'row',
      alignItems: 'center',
      gap: rhythm.tight,
      minHeight: minimumTarget,
    });
    expect(
      rowStyle(
        withAction.find((node) => typeof node.props.style === 'function'),
      ).minHeight,
    ).toBe(headerStyle.minHeight);
  },
);
test('section actions wrap after the title at AX1+ and keep a named 44 pt target', () => {
  size(1.786);
  const root = render(
    <SectionHeader
      title="Bills"
      action={{ accessibilityLabel: 'See all bills', href }}
    />,
  ).root;
  // Beside the title while both fit, below it only when they do not: a
  // column put Today's "Bills" over a menu also reading Bills (sweep 1, 2.2).
  expect(flat(root.findByType(View).props.style)).toEqual({
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.tight,
    rowGap: rhythm.line,
    marginBottom: rhythm.heading - rhythm.block,
  });
  expect(strings(root)).toEqual(['Bills', 'See all']);
  expect(root.findByType(RowLink).props.href).toBe(href);
  expect(
    root.find((node) => typeof node.props.style === 'function').props
      .accessibilityLabel,
  ).toBe('See all bills');
  expect(
    rowStyle(root.find((node) => typeof node.props.style === 'function'))
      .minHeight,
  ).toBeGreaterThanOrEqual(44);
});
test('Screen registers its direct page heading as a title anchor', () => {
  const root = render(
    <Screen barTitle="Anne">
      <Heading level={1} kind="page">
        Anne
      </Heading>
    </Screen>,
  ).root;
  expect(root.findAllByType(TitleAnchor)).toHaveLength(1);
});
test('TileGrid lead spans the first pair, while the default spans an odd last tile', () => {
  for (const lead of [false, true]) {
    const root = render(
      <TileGrid lead={lead}>
        {[0, 1, 2].map((index) => (
          <Tile
            key={index}
            title={`Tool ${index}`}
            line="Explore the record"
            symbol="number"
            ink="navy"
            href={href}
          />
        ))}
      </TileGrid>,
    ).root;
    const tiles = root.findAllByType(Tile);
    const widths = tiles.map(
      (tile) => flat(tile.parent!.props.style).width as number,
    );
    expect(widths).toEqual(lead ? [402, 195, 195] : [195, 195, 402]);
  }
});
test('cards have continuous corners and no outline; FaceStack stops at six', () => {
  const root = render(
    <Card testID="card">
      <FaceStack
        portraits={[null, null, null, null, null, null, null]}
        max={10}
      />
    </Card>,
  ).root;
  expect(flat(host(root, 'card').props.style)).toMatchObject({
    borderRadius: radii.container,
    borderCurve: 'continuous',
    padding: 20,
  });
  expect(flat(host(root, 'card').props.style).borderWidth).toBeUndefined();
  expect(root.findAllByType(Portrait)).toHaveLength(6);
});
test('figures retain their required date and source; stat strips stack at AX1', () => {
  size(1.786);
  const source = { asOf: '2026-09-17', citation: 'ParlInfo' };
  const root = render(
    <FigureBlock
      value="92"
      label="Commonwealth grants"
      citation={source}
      caveat="Recorded grants only"
    />,
  ).root;
  expect(root.findByType(SourceLine).props).toMatchObject(source);
  expect(strings(root)).toContain('Recorded grants only');
  const strip = render(
    <StatStrip
      tiles={[
        { value: '92', label: 'grants' },
        { value: '12', label: 'programs' },
      ]}
      testID="strip"
    />,
  ).root;
  expect(flat(host(strip, 'strip').props.style).flexDirection).toBe('column');
});
test('MachinePill is a named button on a navy wash and standalone choices stay compact', () => {
  const root = render(
    <MachinePill
      note={{
        title: 'Machine-written',
        body: ['Written from the public record.'],
      }}
      testID="machine"
    />,
  ).root;
  expect(host(root, 'machine').props.accessibilityLabel).toBe(
    'Machine-written',
  );
  expect(host(root, 'machine').props.accessibilityHint).toBe(
    'Opens how this was written',
  );
  expect(root.findAllByType(Icon)[0]!.props.tone).toBe('navy');
  const choice = render(
    <ChoiceChip label="Bills" selected onPress={jest.fn()} />,
  ).root;
  expect(glyphs(choice)).not.toContain('checkmark');
  expect(choice.findAllByType(ChoiceChip)).toHaveLength(1);
  expect(choice.findAllByType(Pressable)).toHaveLength(0);
});
test.each([1, 3.571])(
  'PageFoot keeps the address whole at fontScale %s',
  (scale) => {
    size(scale);
    expect(strings(render(<PageFoot variant="today" />).root)).toContain(
      'OPAX is independent and non-partisan. It is not a government app.',
    );
    const root = render(<PageFoot variant="authorised" />).root;
    expect(strings(root)).toEqual([
      AUTHORISATION_LINE,
      'Report a correction:',
      'corrections@opax.com.au',
      'We aim to respond within 2 business days.',
    ]);
    expect(
      root
        .findAllByType(Text)
        .map((node) => [node.props.variant, node.props.tone]),
    ).toEqual([
      ['footnote', 'inkSoft'],
      ['footnote', 'navy'],
      ['footnote', 'navy'],
      ['footnote', 'inkSoft'],
    ]);
    const address = root
      .findAllByType(Text)
      .find((node) => node.props.children === 'corrections@opax.com.au')!;
    expect(address.props).toMatchObject({
      numberOfLines: 1,
      adjustsFontSizeToFit: true,
      minimumFontScale: 0.5,
    });
    expect(
      root.find((node) => node.props.accessibilityRole === 'link').props
        .accessibilityLabel,
    ).toBe('Report a correction by email to corrections@opax.com.au');
  },
);

test('standard bill and person menus stay available when split rows select', () => {
  for (const element of [
    <BillRow
      key="bill"
      billKey="au-federal-example"
      title="Bill"
      status="Passed"
      href="/bill/au-federal-example"
      selected
      select={jest.fn()}
    />,
    <PersonRow
      key="person"
      name="Anne"
      href={href}
      selected
      select={jest.fn()}
    />,
  ]) {
    const root = render(element).root;
    const link = root.findByType(RowLink);
    expect(typeof link.props.select).toBe('function');
    expect(menuLeaves(link.props.menu).map((item) => item.title)).toContain(
      'Follow',
    );
    expect(root.findAllByProps({ testID: 'native-preview' })).toHaveLength(0);
  }
});
test('Screen sets the bar title only when the measured window boundary flips', () => {
  const setOptions = jest.fn();
  const navigation = {
    setOptions,
    isFocused: () => true,
    addListener: () => () => undefined,
  };
  const root = render(
    <NavigationContext.Provider value={navigation as never}>
      <Screen barTitle="Anne">
        <Heading level={1} kind="page">
          Anne
        </Heading>
      </Screen>
    </NavigationContext.Provider>,
  ).root;
  let pageY = -20;
  const anchor = root.findByType(TitleAnchor).findByType(View);
  act(() =>
    anchor.props.ref({
      measure: (done: (...values: number[]) => void) =>
        done(0, 0, 300, 60, 0, pageY),
    }),
  );
  setOptions.mockClear();
  for (let index = 0; index < 40; index++)
    act(() =>
      root
        .findByType(ScrollView)
        .props.onScroll({ nativeEvent: { contentOffset: { y: 200 + index } } }),
    );
  expect(setOptions).toHaveBeenCalledTimes(1);
  pageY = 200;
  act(() =>
    root
      .findByType(ScrollView)
      .props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } }),
  );
  expect(setOptions).toHaveBeenCalledTimes(2);
});

test('a person menu follows the canonical identity instead of the route slug', async () => {
  const root = render(<PersonRow name="Anne" href="/person/anne" />).root;
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    menuLeaves(root.findByType(RowLink).props.menu)
      .find((item) => item.title === 'Follow')!
      .onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(follow).toHaveBeenCalledWith({
    kind: 'person',
    id: 'person_0123456789abcdef01234567',
    title: 'Anne',
  });
});

test('Screen places its one offline line after the marked date', () => {
  const root = render(
    <Screen offline={{ savedAt: '2026-11-07' }}>
      <ScreenHeader>
        <Text>9 November</Text>
      </ScreenHeader>
      <Text>Latest records</Text>
    </Screen>,
  ).root;
  expect(strings(root)).toEqual([
    '9 November',
    "You're offline. Showing what was saved on 7 Nov.",
    'Latest records',
  ]);
});

test.each([1, 3, 4, 8])(
  'RecordRow shows More only for a measured excerpt over three lines: %s',
  (count) => {
    const renderer = render(
      <RecordRow
        meta="Speech"
        excerpt={{ text: 'Full passage' }}
        testID="row"
      />,
    );
    const measure = renderer.root
      .findAllByType(Text)
      .find(
        (node) =>
          node.props.variant === 'recordText' && node.props.onTextLayout,
      )!;
    expect(measure.props.numberOfLines).toBeUndefined();
    act(() =>
      measure.props.onTextLayout({
        nativeEvent: {
          lines: Array.from({ length: count }, () => ({ text: 'line' })),
        },
      }),
    );
    expect(strings(renderer.root).includes('More')).toBe(count > 3);
    if (count > 3) {
      act(() =>
        renderer.root
          .find(
            (node) =>
              node.props.accessibilityLabel === 'More' &&
              typeof node.props.onPress === 'function',
          )
          .props.onPress(),
      );
      expect(
        renderer.root
          .findAllByType(Text)
          .filter(
            (node) =>
              node.props.variant === 'recordText' &&
              !node.props.accessibilityElementsHidden,
          ),
      ).toHaveLength(1);
    }
  },
);
test.each([
  [1, 1, 'ayesNoes', '1 aye, 1 no', '1 aye, 1 no'],
  [0, 25, 'ayesNoes', '25 noes', 'no ayes, 25 noes'],
  [1, 0, 'ayesNoes', '1 aye', '1 aye, no noes'],
  [1, 0, 'votes', '1 vote', '1 vote'],
  [0, 25, 'votes', '25 votes', '25 votes'],
  [1, 25, 'votes', '1 vote to 25', '1 vote to 25'],
] as const)(
  'division count wording %s:%s %s',
  (ayes, noes, countsStyle, visible, spoken) => {
    const root = render(
      <DivisionRow
        title="Bill"
        meta="Third reading"
        outcome="Agreed to"
        ayes={ayes}
        noes={noes}
        countsStyle={countsStyle}
        testID="row"
      />,
    ).root;
    expect(strings(root)).toContain(visible);
    expect(row(root).props.accessibilityLabel).toContain(spoken);
  },
);
test('passive record and division rows never draw a pressed highlight', () => {
  for (const element of [
    <RecordRow key="r" meta="Speech" testID="row" />,
    <DivisionRow
      key="d"
      title="Bill"
      meta="Third reading"
      outcome="Agreed to"
      ayes={1}
      noes={0}
      countsStyle="votes"
      testID="row"
    />,
  ]) {
    const control = row(render(element).root);
    expect(rowStyle(control, true).backgroundColor).toBeUndefined();
    expect(control.props.onPress).toBeUndefined();
  }
});
test('grouped cell highlights reach both edges while text and separators stay inset', () => {
  const root = render(
    <Screen grouped>
      <InsetGroup>
        <LinkRow title="One" symbol="number" href={href} testID="one" />
        <LinkRow title="Two" symbol="number" href={href} testID="two" />
      </InsetGroup>
    </Screen>,
  ).root;
  expect(rowStyle(row(root, 'one'), true)).toMatchObject({
    marginHorizontal: -16,
    paddingHorizontal: 16,
    backgroundColor: colors.dividerSubtle,
  });
  expect(
    root
      .findAllByType(View)
      .some((node) => flat(node.props.style)?.marginLeft === 44),
  ).toBe(true);
});
test('native preview triggers explicitly expose the row and its menu to accessibility', () => {
  const root = render(
    <RowLink href={href} menu={[{ title: 'Follow', onPress: jest.fn() }]}>
      <Pressable testID="row" accessibilityLabel="Anne" />
    </RowLink>,
  ).root;
  expect(host(root, 'row').props).toMatchObject({
    accessible: true,
    accessibilityElementsHidden: false,
    importantForAccessibility: 'yes',
    accessibilityLabel: 'Anne',
    accessibilityActions: [{ name: 'Follow', label: 'Follow' }],
  });
});

test('all three split row types draw hover tint and pass the hover handler', () => {
  const onHover = jest.fn();
  const hover = jest
    .spyOn(adaptive, 'useHover')
    .mockReturnValue([true, onHover]);
  try {
    for (const element of [
      <LinkRow
        key="l"
        title="Anne"
        href={href}
        selected={false}
        testID="row"
      />,
      <BillRow
        key="b"
        title="Bill"
        status="Passed"
        href={href}
        selected={false}
        testID="row"
      />,
      <PersonRow
        key="p"
        name="Anne"
        href={href}
        selected={false}
        testID="row"
      />,
    ]) {
      const root = render(element).root;
      expect(rowStyle(row(root)).backgroundColor).toEqual(colors.sunken);
      expect(root.findByType(Hoverable).props.onHover).toBe(onHover);
    }
  } finally {
    hover.mockRestore();
  }
});
test.each([undefined, 'Anne'])(
  'Screen matches the grouped ground below iOS 26, title=%s',
  (barTitle) => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
    Object.defineProperty(Platform, 'Version', {
      configurable: true,
      value: 18,
    });
    const setOptions = jest.fn();
    try {
      const navigation = {
        setOptions,
        isFocused: () => true,
        addListener: () => () => undefined,
      };
      render(
        <NavigationContext.Provider value={navigation as never}>
          <Screen grouped barTitle={barTitle}>
            <Text>Content</Text>
          </Screen>
        </NavigationContext.Provider>,
      );
      expect(
        setOptions.mock.calls.some(
          ([options]) => options.headerStyle?.backgroundColor === colors.sunken,
        ),
      ).toBe(true);
    } finally {
      Object.defineProperty(Platform, 'Version', descriptor);
    }
  },
);

test.each([
  [212_203_631_339, '$212.2bn', '212,203,631,339 dollars'],
  [19_099_757_999, '$19.1bn', '19,099,757,999 dollars'],
  [14_000_000_000, '$14bn', '14,000,000,000 dollars'],
  [7_516_486, '$7,516,486', '7,516,486 dollars'],
  [9_999_999, '$9,999,999', '9,999,999 dollars'],
  [10_000_000, '$10m', '10,000,000 dollars'],
])('MoneyRow formats %s and speaks full dollars', (value, display, spoken) => {
  const root = render(
    <MoneyRow
      name="Sample recipient"
      amount={value}
      detail="A long program and its dates"
      testID="row"
    />,
  ).root;
  const amount = root
    .findAllByType(Text)
    .find((text) => text.props.children === display)!;
  expect(amount.props).toMatchObject({ variant: 'strong', tabular: true });
  expect(StyleSheet.flatten(amount.props.style).textAlign).toBe('right');
  expect(row(root).props.accessibilityLabel).toContain(spoken);
  const link = root.findByType(LinkRow);
  expect(link.props).toMatchObject({ titleLines: undefined, detailLines: 2 });
  const name = root
    .findAllByType(Text)
    .find((text) => text.props.children === 'Sample recipient')!;
  expect(name.props.numberOfLines).toBeUndefined();
  const detail = root
    .findAllByType(Text)
    .find((text) => text.props.children === 'A long program and its dates')!;
  expect(detail.props.numberOfLines).toBe(2);
});

describe('Today bill previews at accessibility sizes (sweep 1, 2.3)', () => {
  const portfolio =
    'Infrastructure, Transport, Regional Development, Communications and the Arts';
  const preview = () =>
    render(
      <BillRow
        preview
        billKey="au-federal-example"
        title="Treasury Laws Amendment (Responsible Buy Now Pay Later and Other Measures) Bill 2026"
        status="Introduced"
        meta={{ portfolio }}
        href="/bill/au-federal-example"
        testID="bill"
      />,
    ).root;
  test('the title reads to six lines and the portfolio to two whole words', () => {
    size(2.643);
    const root = preview();
    expect(host(root, 'bill-title').props.numberOfLines).toBe(6);
    const probe = root.find(
      (node) =>
        node.props.testID === 'word-clamp-probe' &&
        typeof node.type === 'string',
    );
    act(() =>
      probe.props.onTextLayout({
        nativeEvent: {
          lines: [
            { text: 'Infrastructure, Transport, ' },
            { text: 'Regional Development, ' },
            { text: 'Communications and the Arts' },
          ],
        },
      }),
    );
    // Two laid-out lines, less the last word so the ellipsis fits.
    expect(strings(root)).toContain('Infrastructure, Transport, Regional…');
  });
  test('Large to XXXL keep their three-line clamp and plain portfolio', () => {
    size(1.353);
    const root = preview();
    expect(host(root, 'bill-title').props.numberOfLines).toBe(3);
    expect(
      root.findAll((node) => node.props.testID === 'word-clamp-probe'),
    ).toHaveLength(0);
    expect(strings(root)).toContain(portfolio);
  });
  test('wordClamp keeps whole words and leaves room for the ellipsis', () => {
    expect(wordClamp('Health', [{ text: 'Health' }], 2)).toBe('Health');
    expect(
      wordClamp(
        portfolio,
        [
          { text: 'Infrastructure, ' },
          { text: 'Transport, Regional ' },
          { text: 'Development, Communications' },
        ],
        2,
      ),
    ).toBe('Infrastructure, Transport…');
    // One long word per line still ends on a whole word.
    expect(
      wordClamp(
        'Parliamentary Superannuation',
        [{ text: 'Parliamentary ' }, { text: 'Superannuation' }],
        1,
      ),
    ).toBe('Parliamentary…');
  });
});

describe('Screen pins a band under the bar (sweep 1, item 1)', () => {
  const band = (os: 'ios' | 'android') => {
    jest.replaceProperty(Platform, 'OS', os);
    return render(
      <HeaderHeightContext.Provider value={100}>
        <Screen testID="page" pinned={<View testID="scopes" />}>
          <View testID="first" />
        </Screen>
      </HeaderHeightContext.Provider>,
    ).root;
  };
  test('iOS: the first child sticks, a line above the content', () => {
    const root = band('ios');
    const scroll = root.find(
      (node) => node.props.testID === 'page' && node.props.stickyHeaderIndices,
    );
    expect(scroll.props.stickyHeaderIndices).toEqual([0]);
    const pinned = host(root, 'screen-pinned');
    expect(pinned.findAll((n) => n.props.testID === 'scopes')).not.toHaveLength(
      0,
    );
    expect(flat(pinned.props.style).marginBottom).toBe(
      rhythm.line - layout.sectionGap,
    );
    // It holds at the bar's bottom edge, not under the bar at the top.
    const Sticky = scroll.props.StickyHeaderComponent;
    const sticky = (header: number, rest: number | null) => {
      const offset = new Animated.Value(rest ?? -header);
      const root = render(
        <HeaderHeightContext.Provider value={header}>
          <PinnedRestContext.Provider value={rest}>
            <Sticky scrollAnimatedValue={offset} onLayout={jest.fn()}>
              <View />
            </Sticky>
          </PinnedRestContext.Provider>
        </HeaderHeightContext.Provider>,
      ).root;
      act(() =>
        root
          .find(
            (n) =>
              n.props.testID === 'screen-pinned-header' &&
              typeof n.props.onLayout === 'function',
          )
          .props.onLayout({ nativeEvent: { layout: { y: 16, height: 52 } } }),
      );
      return (y: number) => {
        act(() => offset.setValue(y));
        const node = root.find(
          (n) =>
            n.props.testID === 'screen-pinned-header' &&
            typeof n.type === 'string',
        );
        const transform = flat(node.props.style).transform as {
          translateY: number;
        }[];
        return transform[0]!.translateY;
      };
    };
    // At rest (offset -100) and until its top meets the bar: it scrolls.
    const at = sticky(100, -100);
    expect(at(-100)).toBe(0);
    expect(at(16 - 100)).toBe(0);
    // Then it holds there.
    expect(at(16 - 100 + 240)).toBe(240);
    // Search's active field: the header still counts the hidden large title
    // (240 pt) over a 123 pt bar. At rest the band stays under the field,
    // above the count line, and sticks once its top reaches the bar.
    const stale = sticky(240, -123);
    expect(stale(-123)).toBe(0);
    expect(stale(16 - 123)).toBe(0);
    expect(stale(16 - 123 + 50)).toBe(50);
    // Before the reader first drags, nothing moves it.
    const undragged = sticky(240, null);
    expect(undragged(-123)).toBe(0);
    expect(undragged(300)).toBe(0);
  });
  test('the first drag from rest sets where the band sticks', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    // The provider wraps the scroll view, so the band (and its sticky
    // header) reads it.
    let rest: number | null | undefined;
    function RestProbe() {
      rest = useContext(PinnedRestContext);
      return null;
    }
    const root = render(
      <HeaderHeightContext.Provider value={240}>
        <Screen testID="page" pinned={<RestProbe />}>
          <View />
        </Screen>
      </HeaderHeightContext.Provider>,
    ).root;
    const drag = (y: number) =>
      act(() =>
        root
          .find(
            (node) =>
              node.props.testID === 'page' &&
              typeof node.props.onScrollBeginDrag === 'function',
          )
          .props.onScrollBeginDrag({ nativeEvent: { contentOffset: { y } } }),
      );
    expect(rest).toBeNull();
    // A drag from further down says nothing about the bar.
    drag(300);
    expect(rest).toBeNull();
    drag(-123);
    expect(rest).toBe(-123);
    drag(-40);
    expect(rest).toBe(-123);
  });
  test('Android: the band is the first thing in the content and scrolls', () => {
    const root = band('android');
    expect(
      root.findAll((node) => node.props.testID === 'screen-pinned'),
    ).toHaveLength(0);
    expect(
      root.findAll((node) => node.props.testID === 'scopes'),
    ).not.toHaveLength(0);
  });
});
