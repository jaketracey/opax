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

// The daily post's own cut (portal/src/daily-post.ts `clip`), copied so the
// fixtures have the shapes production sends: the edition's body is the
// summary's first sentence cut at 145 characters, and the cover line is the
// same sentence cut at 150, then the bill's stage.
function clip(text: string, limit: number): string {
  const chars = [...text];
  if (chars.length <= limit) return text;
  const cut = chars.slice(0, Math.max(0, limit - 1)).join('');
  const atWord = cut.replace(/\s+\S*$/, '');
  return (
    (atWord.length >= limit * 0.6 ? atWord : cut).replace(/[\s,;:]+$/, '') + '…'
  );
}
// Invented text. LONG is cut on the cover and cut shorter in the body (the
// reported bill's shape); FITS is whole on the cover and cut in the body.
const LONG =
  'The bill would protect specified fixture treatment and compensation entitlements for fixture members and their dependants from fixture spending caps and reviews under the fixture scheme rules.';
const FITS =
  'The bill would protect specified fixture treatment and compensation entitlements for fixture members and their dependants from fixture spending caps.';
const STATUS = 'Introduced 15 Sep 2026; before parliament';
const body = (sentence: string) => clip(sentence, 145);
const cover = (sentence: string) => `${clip(sentence, 150)} ${STATUS}`;
const viewOf = (sentence: string): EditionView => ({
  ...ready.data!,
  kind: 'bill',
  kindShort: 'Bill',
  title: 'Fixture Entitlements Protection Bill 2026',
  cardTitle: 'Fixture Entitlements Protection Bill 2026',
  shortTitle: null,
  path: '/bill/au-federal-r0001',
  paragraphs: [body(sentence), STATUS],
  machineWritten: { attribution: 'Machine-written by a fixture model.' },
  facts: {
    ...ready.data!.facts,
    kicker: 'Bill · Fixture portfolio',
    line: cover(sentence),
    events: [],
    division: null,
    figures: [],
  },
});
const count = (text: string, part: string) => text.split(part).length - 1;

describe('the plate line never repeats the summary below it', () => {
  test('the fixtures have production’s two shapes', () => {
    // Cut on the cover, cut shorter below: the cover's piece is the longer.
    expect([...LONG].length).toBeGreaterThan(150);
    expect(clip(LONG, 150).endsWith('…')).toBe(true);
    expect(body(LONG).endsWith('…')).toBe(true);
    expect(clip(LONG, 150).length).toBeGreaterThan(body(LONG).length);
    expect(clip(LONG, 150)).not.toContain(body(LONG));
    // 146 to 150 characters: whole on the cover, cut below.
    expect([...FITS].length).toBeGreaterThanOrEqual(146);
    expect([...FITS].length).toBeLessThanOrEqual(150);
    expect(clip(FITS, 150)).toBe(FITS);
    expect(body(FITS).endsWith('…')).toBe(true);
  });

  test.each([
    ['cut on the cover and cut shorter below', LONG],
    ['whole on the cover and cut below', FITS],
  ])('the summary %s goes; the stage after it stays', (_shape, sentence) => {
    expect(plateLine(cover(sentence), [body(sentence)])).toBe(STATUS);
    // The story page shows every paragraph, the stage among them, so its
    // plate has nothing left to say.
    expect(plateLine(cover(sentence), [body(sentence), STATUS])).toBeNull();
    // The summary alone leaves no line at all.
    expect(plateLine(clip(sentence, 150), [body(sentence)])).toBeNull();
    // Spacing and case do not hide a repeat.
    expect(
      plateLine(cover(sentence).toUpperCase().replace(/ /g, '  '), [
        body(sentence),
      ]),
    ).toBe(STATUS.toUpperCase());
    // The other way round (the longer copy below) is the same repeat.
    expect(plateLine(`${body(sentence)} ${STATUS}`, [sentence])).toBe(STATUS);
  });

  // The shape of two real bills whose titles carry "No. 1" / "No. 2": a
  // full stop inside the summary's first sentence. Invented words.
  const NUMBERED =
    'The Fixture Laws Amendment (Scheme Measures No. 1) Bill would change how fixture payments are indexed and reported each year across the fixture scheme and its related programs.';
  const NUMBERED_FITS =
    'The Fixture Laws Amendment (Scheme Measures No. 2) Bill would change how fixture payments are indexed and then reported each year across the schemes.';
  test('a full stop inside the summary ("No. 1") leaves no fragment on the plate', () => {
    expect(clip(NUMBERED, 150).endsWith('…')).toBe(true);
    expect(plateLine(cover(NUMBERED), [body(NUMBERED)])).toBe(STATUS);
    expect(plateLine(clip(NUMBERED, 150), [body(NUMBERED)])).toBeNull();
    // Whole on the cover, cut below.
    expect([...NUMBERED_FITS].length).toBeGreaterThanOrEqual(146);
    expect([...NUMBERED_FITS].length).toBeLessThanOrEqual(150);
    expect(plateLine(cover(NUMBERED_FITS), [body(NUMBERED_FITS)])).toBe(STATUS);
  });

  test('two whole sentences that open alike are different sentences: both stay', () => {
    const short =
      'The bill would repeal the fixture levy on fixture producers and fixture importers.';
    const long =
      'The bill would repeal the fixture levy on fixture producers and fixture importers and amend related laws.';
    expect(short.length).toBeGreaterThanOrEqual(60);
    expect(plateLine(`${short} ${STATUS}`, [long])).toBe(`${short} ${STATUS}`);
    expect(plateLine(`${long} ${STATUS}`, [short])).toBe(`${long} ${STATUS}`);
    // The same pair with the shorter one cut is a repeat.
    expect(plateLine(`${long} ${STATUS}`, [`${short.slice(0, -1)}…`])).toBe(
      STATUS,
    );
    // The same sentence in other spacing and case is still a repeat.
    expect(plateLine(`${short.toUpperCase()} ${STATUS}`, [short])).toBe(STATUS);
  });

  test('a shared opening shorter than a real cut is not a repeat', () => {
    const line = `The bill would protect specified fixture treatment… ${STATUS}`;
    expect(plateLine(line, [body(LONG)])).toBe(line);
    expect(plateLine(`The bill… ${STATUS}`, [body(LONG)])).toBe(
      `The bill… ${STATUS}`,
    );
    // A different summary of real length stays, and so does one whose
    // opening only passes through the text below without starting it.
    const other = `${clip(LONG.replace('The bill', 'This fixture bill'), 150)} ${STATUS}`;
    expect(plateLine(other, [body(LONG)])).toBe(other);
    const inside = `${clip(LONG.slice(15), 150)} ${STATUS}`;
    expect(plateLine(inside, [body(LONG)])).toBe(inside);
    expect(plateLine(cover(LONG))).toBe(cover(LONG));
  });
});

describe.each([
  ['phone', { width: 402, height: 874 }],
  ['wide', { width: 1024, height: 768 }],
] as const)('the edition card on a %s layout', (_name, window) => {
  const SUMMARY = body(LONG);
  const block: Block<EditionView> = { ...ready, data: viewOf(LONG) };

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
    const text = host(root, 'today-edition-text')[0]!;
    const all = strings(host(root, 'today-edition-card')[0]!);
    // Once on the whole card, and that once is the body.
    expect(count(all, 'The bill would protect')).toBe(1);
    expect(count(all, 'fixture spending')).toBe(1);
    expect(strings(text)).toBe(SUMMARY);
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

  test('a summary whole on the cover and cut below is printed once too', () => {
    const root = render(
      <EditionCard
        edition={{ ...ready, data: viewOf(FITS) }}
        tier="fresh"
        today={addDays(date, 1)}
      />,
    );
    const all = strings(host(root, 'today-edition-card')[0]!);
    expect(count(all, 'The bill would protect')).toBe(1);
    expect(strings(host(root, 'today-edition-text')[0]!)).toBe(body(FITS));
    expect(strings(host(root, 'today-edition-line')[0]!)).toBe(STATUS);
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
