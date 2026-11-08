import { act, type ReactElement, type ReactNode } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import snapshot from '../scripts/fixture-snapshot.json';
import {
  decodeEdition,
  editionFor,
  type Block,
  type EditionView,
} from '../src/api/catalogs';
import { editionPath } from '../src/api/policy';
import { Button } from '../src/design/controls';
import { Card } from '../src/design/card';
import { SourceLine } from '../src/design/source';
import { EditionCard } from '../src/features/edition/EditionCard';
import { editionInSlot } from '../src/features/today/order';
import { addDays, editionTier } from '../src/features/today/rules';
import { editionRoute } from '../src/navigation/routes';
import { responseBytes } from './fixture-bytes';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    bills: jest.fn(() => new Promise(() => {})),
    bill: jest.fn(() => new Promise(() => {})),
    roster: jest.fn(() => new Promise(() => {})),
    slugs: jest.fn(() => new Promise(() => {})),
    directory: jest.fn(() => new Promise(() => {})),
  },
  portraits: { get: jest.fn(async () => null) },
  yearPictures: { get: jest.fn(async () => null) },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
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

const ready = editionFor(
  decodeEdition(JSON.parse(responseBytes(snapshot, editionPath).toString())),
);
const date = ready.data!.date.slice(0, 10);
const missing: Block<EditionView> = {
  status: 'missing',
  data: null,
  asAt: null,
  sources: [],
  stale: false,
  savedAt: null,
};

const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  return renderer.root;
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

describe('the edition on Today', () => {
  test('fresh: one whole-card link to the daily edition, no button, its line inside the card', () => {
    const root = render(
      <EditionCard edition={ready} tier="fresh" today={addDays(date, 1)} />,
    );
    const card = root
      .findAllByType(Card)
      .find((c) => c.props.testID === 'today-edition')!;
    expect(card.props.href).toEqual(editionRoute());
    expect(card.props.accessibilityLabel).toMatch(/^Daily edition\. /);
    expect(
      card.props.accessibilityActions.map((a: { name: string }) => a.name),
    ).toContain('Sources');
    expect(root.findAllByType(Button)).toHaveLength(0);
    const frame = host(root, 'today-edition-card')[0]!;
    expect(frame.findAllByType(SourceLine).map((s) => s.props.testID)).toEqual([
      'today-edition-sources',
    ]);
    expect(strings(root)).not.toMatch(/Daily edition ·|Open the bill/);
  });
  test('an old edition is never drawn; loading is the skeleton; a 404 draws nothing', () => {
    expect(
      render(<EditionCard edition={ready} tier="old" />).findAllByType(Card),
    ).toHaveLength(0);
    expect(
      host(render(<EditionCard edition={null} />), 'today-edition-loading'),
    ).toHaveLength(1);
    expect(
      render(<EditionCard edition={missing} />).findAllByType(Card),
    ).toHaveLength(0);
  });
  test('a saved copy says Saved in the card’s own line', () => {
    const savedAt = Date.parse('2026-10-05T01:00:00Z');
    const root = render(
      <EditionCard
        edition={{ ...ready, stale: true, savedAt }}
        tier="fresh"
        today={addDays(date, 1)}
      />,
    );
    const line = root
      .findAllByType(SourceLine)
      .find((s) => s.props.testID === 'today-edition-sources')!;
    expect(line.props.dateLabel).toBe('Saved 5 Oct 2026');
  });
});

describe('tiers place the edition', () => {
  test('fresh 0 to 3 days, recent 4 to 14, old after', () => {
    expect(editionTier(date, addDays(date, 3))).toBe('fresh');
    expect(editionTier(date, addDays(date, 4))).toBe('recent');
    expect(editionTier(date, addDays(date, 14))).toBe('recent');
    expect(editionTier(date, addDays(date, 15))).toBe('old');
  });
  test('the top slot in case A; a recent edition at the late slot in B and C; old nowhere', () => {
    expect(editionInSlot('edition', 'A', 'fresh')).toBe(true);
    expect(editionInSlot('edition-late', 'A', 'fresh')).toBe(false);
    expect(editionInSlot('edition', 'B', 'recent')).toBe(false);
    expect(editionInSlot('edition-late', 'B', 'recent')).toBe(true);
    expect(editionInSlot('edition-late', 'B', 'fresh')).toBe(true);
    expect(editionInSlot('edition', 'C', 'fresh')).toBe(true);
    expect(editionInSlot('edition-late', 'C', 'recent')).toBe(true);
    expect(editionInSlot('edition', 'C', 'old')).toBe(false);
    expect(editionInSlot('edition-late', 'C', 'old')).toBe(false);
  });
});
