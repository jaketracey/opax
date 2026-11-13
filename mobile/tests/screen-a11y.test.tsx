import { createElement, type ReactElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { auditAccessibility, type AuditRule } from './screen-a11y';

// Host fixtures make every rule independent of native mocks and layout engines.
const view = (props: object = {}, ...children: ReactElement[]) =>
  createElement('View', props, ...children);
const text = (label: string, props: object = {}) =>
  createElement('Text', props, label);
function audit(element: ReactElement, platform: 'ios' | 'android' = 'ios') {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  const findings = auditAccessibility(tree.root, {
    platform,
    nativeTitle: 'Fixture',
  });
  act(() => tree.unmount());
  return findings;
}
const rules = (element: ReactElement) => audit(element).map((f) => f.rule);

test('a heading styled as a section title must expose the header role', () => {
  function FixtureHeading(_props: { variant: string }) {
    return text('Records');
  }
  expect(
    rules(createElement(FixtureHeading, { variant: 'sectionTitle' })),
  ).toContain('heading');
});

test('title typography can explicitly describe ordinary text', () => {
  function FixtureText(props: { variant: string; accessibilityRole: string }) {
    return text('November 2026', {
      accessibilityRole: props.accessibilityRole,
    });
  }
  expect(
    rules(
      createElement(FixtureText, {
        variant: 'subsectionTitle',
        accessibilityRole: 'text',
      }),
    ),
  ).not.toContain('heading');
});

test.each([
  ['$28.7bn', '28,682,373,476 dollars'],
  ['$28.7bn', '28.6 billion dollars'],
  ['-$28.7bn', '28.7 billion dollars'],
  ['$448k', '448 million dollars'],
  ['$4,500', '4,501 dollars'],
  ['$1m-$2m', '1 million dollars minus 2 million dollars'],
])(
  'spoken money must match the visible figure %s, including rounding and sign',
  (drawn, spoken) => {
    expect(
      rules(
        view(
          {
            accessible: true,
            accessibilityLabel: `Sample recipient, ${spoken}`,
          },
          text(drawn),
        ),
      ),
    ).toContain('spoken-figures');
    expect(rules(text(drawn, { accessibilityLabel: spoken }))).toContain(
      'spoken-figures',
    );
  },
);

test.each([
  ['$28.7bn', '28.7 billion dollars'],
  ['-$28.7bn', 'minus 28.7 billion dollars'],
  ['$448k', '448 thousand dollars'],
  ['$4,500', '4,500 dollars'],
  ['$1m-$2m', '1 million dollars-2 million dollars'],
])('spoken money accepts the visible rounding %s', (drawn, spoken) => {
  // Even when child figures are hidden from accessibility, they remain visible.
  expect(
    audit(
      view(
        { accessible: true, accessibilityLabel: spoken },
        view({ accessibilityElementsHidden: true }, text(drawn)),
      ),
    ),
  ).toEqual([]);
});

test.each([
  { accessibilityRole: 'tab' },
  { accessibilityRole: 'button', disabled: true },
  {
    accessibilityRole: 'button',
    accessibilityLabel: 'Collapse details',
    onPress: () => {},
  },
])('missing selected, disabled and expanded state is rejected: %o', (props) => {
  expect(
    rules(
      view({
        accessible: true,
        accessibilityLabel: 'Fixture control',
        ...props,
      }),
    ),
  ).toContain('state');
});

test.each<[AuditRule, ReactElement]>([
  [
    'touchable-role',
    view({ accessible: true, onPress: () => {} }, text('Open record')),
  ],
  [
    'touchable-label',
    view({ accessible: true, onPress: () => {}, accessibilityRole: 'button' }),
  ],
  ['image-label', createElement('Image', { source: { uri: 'fixture.png' } })],
  [
    'state',
    view({
      accessible: true,
      accessibilityRole: 'switch',
      accessibilityLabel: 'Captions',
    }),
  ],
  ['spoken-figures', text('$2.4m')],
  [
    'grouping',
    view(
      { accessible: true },
      view(
        { accessible: true, onPress: () => {}, accessibilityRole: 'button' },
        text('Different action'),
      ),
    ),
  ],
  [
    'live-region',
    view({
      accessible: true,
      accessibilityRole: 'progressbar',
      accessibilityLabel: 'Loading records',
    }),
  ],
  [
    'target-size',
    view({
      accessible: true,
      onPress: () => {},
      accessibilityRole: 'button',
      accessibilityLabel: 'Open',
      style: { width: 30, height: 30 },
    }),
  ],
])('%s rejects a broken host fixture', (rule, element) => {
  expect(rules(element)).toContain(rule);
});

test('text fallback names a button, and its content forms one group', () => {
  expect(
    audit(
      view(
        {
          accessible: true,
          onPress: () => {},
          accessibilityRole: 'button',
          style: { minHeight: 44, minWidth: 44 },
        },
        text('Open record'),
        text('2.4 million dollars'),
      ),
    ),
  ).toEqual([]);
});

test('decorative trees are skipped and content images keep their label', () => {
  expect(
    audit(
      view(
        {},
        view(
          {
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants',
          },
          createElement('Image'),
        ),
        createElement('Image', {
          accessibilityLabel: 'A building in the archive',
        }),
      ),
    ),
  ).toEqual([]);
});

test.each(['selected', 'checked', 'disabled', 'expanded'] as const)(
  '%s state is retained for assistive technology',
  (state) => {
    const r =
      state === 'checked' ? 'switch' : state === 'selected' ? 'tab' : 'button';
    expect(
      audit(
        view({
          accessible: true,
          accessibilityRole: r,
          accessibilityLabel: 'Fixture control',
          disabled: state === 'disabled',
          accessibilityState: { [state]: true },
        }),
      ),
    ).toEqual([]);
  },
);

test('live-region and explicit announcements satisfy loading checks', () => {
  expect(
    audit(
      view({
        accessible: true,
        accessibilityRole: 'progressbar',
        accessibilityLabel: 'Loading records',
        accessibilityLiveRegion: 'polite',
      }),
    ),
  ).toEqual([]);
});

test('hitSlop and platform minimums are checked without inventing flex measurements', () => {
  const button = (style: object, hitSlop?: object | number) =>
    view({
      accessible: true,
      onPress: () => {},
      accessibilityRole: 'button',
      accessibilityLabel: 'Open',
      style,
      hitSlop,
    });
  expect(audit(button({ width: 44, height: 44 }), 'ios')).toEqual([]);
  expect(
    audit(button({ width: 44, height: 44 }), 'android').filter(
      (f) => f.rule === 'target-size',
    ),
  ).toHaveLength(2);
  expect(audit(button({ width: 44, height: 44 }, 2), 'android')).toEqual([]);
  expect(audit(button({ flex: 1, minHeight: 48 }), 'android')).toEqual([]);
});

test('a screen without a title fails, and a native title is accepted', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(text('Record body'));
  });
  expect(
    auditAccessibility(tree.root, { platform: 'ios' }).map((f) => f.rule),
  ).toContain('screen-title');
  expect(
    auditAccessibility(tree.root, { platform: 'ios', nativeTitle: 'Records' }),
  ).toEqual([]);
  act(() => tree.unmount());
});
