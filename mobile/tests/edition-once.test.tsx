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
import { Card } from '../src/design/card';
import { EditionCard } from '../src/features/edition/EditionCard';
import { plateLine } from '../src/features/edition/model';
import { addDays } from '../src/features/today/rules';
import { responseBytes } from './fixture-bytes';

let mockWindow = { width: 402, height: 874 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...mockWindow, scale: 3, fontScale: 1 }),
}));
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

// Invented text in the shape of a bill edition whose cover line opens with
// its summary cut short, then states the bill's stage.
const SUMMARY =
  'The bill would protect specified fixture treatment entitlements from spending caps and reviews of the fixture scheme.';
const SECOND = 'It would also set a fixture reporting date.';
const STATUS = 'Introduced 15 Sep 2026; before parliament';
const CUT =
  'The bill would protect specified fixture treatment entitlements from spending caps and reviews…';
const view: EditionView = {
  ...ready.data!,
  kind: 'bill',
  kindShort: 'Bill',
  title: 'Fixture Entitlements Protection Bill 2026',
  cardTitle: 'Fixture Entitlements Protection Bill 2026',
  shortTitle: null,
  path: '/bill/au-federal-r0001',
  paragraphs: [`${SUMMARY} ${SECOND}`],
  machineWritten: { attribution: 'Machine-written by a fixture model.' },
  facts: {
    ...ready.data!.facts,
    kicker: 'Bill · Fixture portfolio',
    line: `${CUT} ${STATUS}`,
    events: [],
    division: null,
    figures: [],
  },
};
const block: Block<EditionView> = { ...ready, data: view };
const count = (text: string, part: string) => text.split(part).length - 1;

describe('the plate line never repeats the summary below it', () => {
  test('a summary cut short with "…" goes; the stage after it stays', () => {
    expect(plateLine(`${CUT} ${STATUS}`, [`${SUMMARY} ${SECOND}`])).toBe(
      STATUS,
    );
    // The cut piece alone leaves no line at all.
    expect(plateLine(CUT, [SUMMARY])).toBeNull();
    // Spacing and case do not hide a repeat.
    expect(
      plateLine(`the bill would  protect specified fixture… ${STATUS}`, [
        SUMMARY,
      ]),
    ).toBe(STATUS);
  });

  test('a cut piece the text below does not contain is kept, and so is a short one', () => {
    expect(plateLine(`A different fixture summary… ${STATUS}`, [SUMMARY])).toBe(
      `A different fixture summary… ${STATUS}`,
    );
    expect(plateLine(`The bill… ${STATUS}`, [SUMMARY])).toBe(
      `The bill… ${STATUS}`,
    );
    expect(plateLine(`${CUT} ${STATUS}`)).toBe(`${CUT} ${STATUS}`);
  });
});

describe.each([
  ['phone', { width: 402, height: 874 }],
  ['wide', { width: 1024, height: 768 }],
] as const)('the edition card on a %s layout', (_name, window) => {
  beforeEach(() => {
    mockWindow = { ...window };
  });
  afterAll(() => {
    mockWindow = { width: 402, height: 874 };
  });

  test('prints the machine-written summary once, under its label; the plate keeps the title and the stage', () => {
    const root = render(
      <EditionCard edition={block} tier="fresh" today={addDays(date, 1)} />,
    );
    const plate = host(root, 'today-edition-plate')[0]!;
    const body = host(root, 'today-edition-text')[0]!;
    const all = strings(host(root, 'today-edition-card')[0]!);
    // Once on the whole card, and that once is the body.
    expect(count(all, 'The bill would protect')).toBe(1);
    expect(count(all, 'spending caps and')).toBe(1);
    expect(strings(body)).toBe(`${SUMMARY} ${SECOND}`);
    // The plate: the title and the stage, none of the summary.
    // The title is drawn word-safe (its spaces may not be plain spaces).
    expect(strings(plate).replace(/[\s\u2060]+/g, ' ')).toContain(
      'Fixture Entitlements Protection Bill 2026',
    );
    expect(strings(host(root, 'today-edition-line')[0]!)).toBe(STATUS);
    expect(strings(plate)).not.toContain('The bill would protect');
    // The label sits directly above the summary it marks.
    const ids = root
      .findAll((n) => typeof n.type === 'string' && !!n.props.testID)
      .map((n) => String(n.props.testID));
    expect(ids.indexOf('today-edition-machine')).toBeGreaterThan(
      ids.indexOf('today-edition-plate'),
    );
    expect(ids.indexOf('today-edition-text')).toBeGreaterThan(
      ids.indexOf('today-edition-machine'),
    );
    expect(strings(host(root, 'today-edition-machine')[0]!)).toBe(
      'Machine-written',
    );
  });

  test('VoiceOver hears the summary once, after "Machine-written"', () => {
    const root = render(
      <EditionCard edition={block} tier="fresh" today={addDays(date, 1)} />,
    );
    const label: string = root
      .findAllByType(Card)
      .find((c) => c.props.testID === 'today-edition')!.props
      .accessibilityLabel;
    expect(count(label, 'The bill would protect')).toBe(1);
    expect(label.indexOf('Machine-written.')).toBeGreaterThan(0);
    expect(label.indexOf('The bill would protect')).toBeGreaterThan(
      label.indexOf('Machine-written.'),
    );
    // The drawn text is hidden from VoiceOver; the card's label speaks.
    expect(
      root.findAll((n) => n.props.accessibilityElementsHidden === true).length,
    ).toBeGreaterThan(0);
  });
});
