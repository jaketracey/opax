/* eslint-disable @typescript-eslint/no-require-imports -- Native host doubles pin platform output. */
import { act, type ReactElement } from 'react';
import { Dimensions, Platform, View, Pressable } from 'react-native';
import TestRenderer from 'react-test-renderer';
import * as C from '../src/design/controls';
import * as L from '../src/design/labels';
import * as R from '../src/design/rows';
import { Card, Tile, TileGrid } from '../src/design/card';
import { PersonRow, PartyLabel } from '../src/design/people';
import { SectionHeader } from '../src/design/layout';
import { StatTile, PageFoot } from '../src/design/record';
import { SourceAffordance } from '../src/design/source';
import { Disclosure } from '../src/design/disclosure';
import { Text, Heading } from '../src/design/text';
import { ContextMenu } from '../src/design/context-menu';
import { Icon } from '../src/design/icon';
import { BarSeries } from '../src/design/charts';
import { Slider, Stepper } from '../src/design/adjustable';
jest.mock('@expo/ui/jetpack-compose', () => {
  throw new Error('Compose must not load on iOS');
});
jest.mock('expo-router', () => {
  const React = require('react');
  const part = ({ children, ...props }: { children?: unknown }) =>
    React.createElement('RouteHost', props, children);
  return {
    ...jest.requireActual('expo-router'),
    Link: Object.assign(part, {
      Trigger: part,
      Preview: part,
      Menu: part,
      MenuAction: part,
    }),
    router: { push: jest.fn() },
  };
});
jest.mock('../src/design/accessibility', () => ({
  useIncreaseContrast: () => false,
  useBoldText: () => false,
  useHighTextContrast: () => false,
  useReduceMotion: () => true,
  useAccessibilitySize: () =>
    require('react-native').useWindowDimensions().fontScale >= 1.786,
}));
jest.mock('../src/features/follows/store', () => ({
  useFollows: () => [],
  followKey: () => 'bill:b',
  FOLLOW_LIMIT: 50,
}));
jest.mock('../src/features/follows/useFollowStates', () => ({
  markSeenNow: jest.fn(),
}));
jest.mock('expo-glass-effect', () => ({
  GlassView: require('react-native').View,
  isLiquidGlassAvailable: () => false,
}));
const noop = () => undefined;
const options = [
  { value: 'all', label: 'All' },
  { value: 'passed', label: 'Passed' },
];
const cases: [string, () => ReactElement][] = [
  [
    'Button',
    () => (
      <View>
        {(['primary', 'secondary', 'plain', 'destructive'] as const).flatMap(
          (variant) =>
            [false, true].map((disabled) => (
              <C.Button
                key={`${variant}-${disabled}`}
                variant={variant}
                label="Show more"
                disabled={disabled}
                onPress={noop}
              />
            )),
        )}
      </View>
    ),
  ],
  ['FollowButton', () => <C.FollowButton kind="bill" id="b" title="A bill" />],
  [
    'IconButton',
    () => (
      <C.IconButton
        symbol="ellipsis"
        accessibilityLabel="More"
        onPress={noop}
      />
    ),
  ],
  [
    'PopUpButton',
    () => (
      <C.PopUpButton
        label="Status"
        value="all"
        options={options}
        onChange={noop}
      />
    ),
  ],
  [
    'SegmentedPicker',
    () => (
      <C.SegmentedPicker
        accessibilityLabel="Status"
        value="all"
        options={options}
        onChange={noop}
      />
    ),
  ],
  [
    'SegmentedControl',
    () => <C.SegmentedControl value="all" segments={options} onChange={noop} />,
  ],
  [
    'ChoiceChips',
    () => <C.ChoiceChips value="all" segments={options} onChange={noop} />,
  ],
  [
    'FilterChip',
    () => <C.FilterChip filter="status" value="Passed" onRemove={noop} />,
  ],
  [
    'SwitchRow',
    () => (
      <C.SwitchRow
        label="Sitting members"
        detail="Current parliament"
        value
        onValueChange={noop}
      />
    ),
  ],
  [
    'Field',
    () => (
      <C.Field
        label="Find your MP"
        defaultValue="Grayndler"
        hint="Electorate or name"
      />
    ),
  ],
  [
    'Composer',
    () => (
      <C.Composer
        label="Question"
        submitLabel="Ask"
        value="Housing"
        onChangeText={noop}
        onSubmit={noop}
        placeholder="Ask a question"
      />
    ),
  ],
  [
    'MonthPager',
    () => (
      <C.MonthPager
        month="November 2026"
        previous={{ label: 'October', onPress: noop }}
        next={null}
      />
    ),
  ],
  [
    'StepButtons',
    () => (
      <C.StepButtons
        previous={{
          label: 'Previous',
          accessibilityLabel: 'Previous month',
          onPress: noop,
        }}
        next={{
          label: 'Next',
          accessibilityLabel: 'Next month',
          onPress: noop,
        }}
      />
    ),
  ],
  ['Tag', () => <L.Tag label="Housing" onPress={noop} />],
  [
    'ChoiceChip',
    () => <L.ChoiceChip label="Housing" selected onPress={noop} />,
  ],
  [
    'MachinePill',
    () => (
      <L.MachinePill
        note={{ title: 'How this was written', body: ['From the record.'] }}
      />
    ),
  ],
  [
    'Card',
    () => (
      <Card onPress={noop}>
        <Text>From the record</Text>
      </Card>
    ),
  ],
  [
    'Tile',
    () => (
      <Tile
        title="Explore"
        line="From the record"
        symbol="doc.text"
        ink="navy"
        href="/workbench"
      />
    ),
  ],
  [
    'TileGrid',
    () => (
      <TileGrid>
        <Text>One</Text>
        <Text>Two</Text>
      </TileGrid>
    ),
  ],
  [
    'SectionHeader',
    () => (
      <SectionHeader
        title="Bills"
        action={{
          label: 'See all',
          accessibilityLabel: 'See all bills',
          onPress: noop,
        }}
      />
    ),
  ],
  ['LinkRow', () => <R.LinkRow title="Bills" onPress={noop} />],
  [
    'ValueRow',
    () => <R.ValueRow label="Status" value="Passed" onPress={noop} />,
  ],
  [
    'BillRow',
    () => (
      <R.BillRow
        title="Housing Bill 2026"
        status="Before parliament"
        onPress={noop}
      />
    ),
  ],
  [
    'RecordRow',
    () => (
      <R.RecordRow
        meta="4 October 2026"
        title="Housing"
        href="/workbench"
        menu={[]}
      />
    ),
  ],
  [
    'DivisionRow',
    () => (
      <R.DivisionRow
        title="Housing Bill 2026"
        meta="4 October 2026"
        outcome="Agreed"
        ayes={76}
        noes={55}
        countsStyle="votes"
        expandable
      />
    ),
  ],
  [
    'MoneyRow',
    () => <R.MoneyRow name="Public body" amount={1000} href="/workbench" />,
  ],
  ['SuggestionRow', () => <R.SuggestionRow name="Housing" onPress={noop} />],
  [
    'PersonRow',
    () => <PersonRow name="Member name" party="Labor" onPress={noop} />,
  ],
  ['PartyLabel', () => <PartyLabel party="Labor" status="current" linked />],
  ['StatTile', () => <StatTile value="123" label="Bills" onPress={noop} />],
  ['PageFoot', () => <PageFoot />],
  [
    'SourceAffordance',
    () => (
      <SourceAffordance
        glyph="doc.text"
        name="Parliament"
        accessibilityLabel="Parliament"
        onPress={noop}
      />
    ),
  ],
  [
    'Disclosure',
    () => (
      <Disclosure label="More" defaultOpen>
        <Text>Record</Text>
      </Disclosure>
    ),
  ],
  [
    'ContextMenu',
    () => (
      <ContextMenu items={[{ title: 'Copy link', onPress: noop }]}>
        <Pressable accessibilityLabel="Record">
          <Text>Record</Text>
        </Pressable>
      </ContextMenu>
    ),
  ],
  [
    'Text',
    () => (
      <View>
        <Heading level={1} kind="page">
          Parliament and public records
        </Heading>
        <Text variant="figure">1,234,567</Text>
        <Text wordSafe>Representatives</Text>
      </View>
    ),
  ],
  ['Icon', () => <Icon name="checkmark" />],
  [
    'BarSeries',
    () => (
      <BarSeries
        data={[{ label: '2026', value: 100 }]}
        ink="ink"
        format={String}
        tableTitle="Records"
        dateRange={{ start: '2026-01-01', end: '2026-11-01' }}
        citation="Parliament"
        onSelect={noop}
      />
    ),
  ],
];
describe.each([1, 2])('iOS design at font scale %s', (fontScale) => {
  test.each(cases)('%s retains its iOS output', (_name, element) => {
    expect(Platform.OS).toBe('ios');
    act(() =>
      Dimensions.set({
        window: { width: 412, height: 915, scale: 3, fontScale },
      }),
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(element());
    });
    expect(renderer.toJSON()).toMatchSnapshot();
    act(() => renderer.unmount());
  });
});
test.each([Slider, Stepper])(
  'additive Android controls do not load Compose on iOS: %p',
  (Control) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Control
          label="Year"
          min={2024}
          max={2026}
          value={2025}
          onValueChange={noop}
        />,
      );
    });
    expect(renderer.toJSON()).toBeNull();
    act(() => renderer.unmount());
  },
);
test('the workbench Android controls gallery draws nothing on iOS', () => {
  const { AndroidControls } =
    require('../src/workbench/AndroidControls') as typeof import('../src/workbench/AndroidControls');
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<AndroidControls />);
  });
  expect(renderer.toJSON()).toBeNull();
  act(() => renderer.unmount());
});
