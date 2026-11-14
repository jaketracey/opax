import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import { catalogs } from '../src/api/runtime';
import {
  decodeElectorate,
  electorateFor,
  yourMPFor,
} from '../src/api/catalogs';
import { Card } from '../src/design/card';
import { InsetGroup } from '../src/design/layout';
import { PersonRow, Portrait } from '../src/design/people';
import {
  TILE_MAX_WIDTH,
  YourMPCard,
  yourMPHook,
  yourMPLabel,
  yourMPSources,
} from '../src/features/today/YourMPCard';
import {
  LatestRows,
  type LatestRecord,
} from '../src/features/your-mp/LatestRows';
import { RepresentativesGroup } from '../src/features/your-mp/RepresentativesGroup';
import { breaksMidWord } from '../src/design/text';
import { textRampScale } from '../src/design/text-scale';
import { textStyles } from '../src/design/tokens';
import { textWidth } from './row-layout';
import { index, manifest, people, pinned, roster, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    yourMP: jest.fn(),
    electorateFor: jest.fn(),
    profileFor: jest.fn(),
    bills: jest.fn(),
  },
  portraits: { get: jest.fn(async () => null) },
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));
jest.mock('../src/design/row-link', () => ({
  ...jest.requireActual('../src/design/row-link'),
  RowLink: ({ children }: { children: React.ReactNode }) => children,
}));
const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const seat = index.electorates.find((row) => row.name === 'Grayndler')!;
const directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(index),
};
const view = yourMPFor(seat.electorate_id, index, manifest);
const electorate = electorateFor(decodeElectorate(pinned(seat.detail_url)));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(catalogs.yourMP).mockResolvedValue(view);
  jest.mocked(catalogs.electorateFor).mockResolvedValue(result(electorate));
  jest.mocked(catalogs.profileFor).mockRejectedValue(new Error('Unavailable'));
  jest.mocked(catalogs.bills).mockRejectedValue(new Error('Unavailable'));
});

/** Today's tile, mounted with the pinned seat unless told otherwise. */
async function tile(
  props: Partial<React.ComponentProps<typeof YourMPCard>> = {},
) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <YourMPCard
        seat={seat}
        directory={directory}
        stateSeatIds={[]}
        attempt={0}
        onRetry={jest.fn()}
        {...props}
      />,
    );
  });
  return renderer;
}
const ids = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAll((n) => typeof n.type === 'string' && !!n.props.testID)
    .map((n) => n.props.testID as string);
const text = (renderer: TestRenderer.ReactTestRenderer, testID: string) =>
  renderer.root.findAllByType(NativeText).find((n) => n.props.testID === testID)
    ?.props.children;

describe('Today\u2019s Your MP tile', () => {
  const member = view.members.data![0]!;
  // Jest's window is at an accessibility size by default: Large unless a
  // test says otherwise.
  let dimensions: jest.SpyInstance;
  beforeEach(() => {
    dimensions = jest
      .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
      .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
  });
  afterEach(() => dimensions.mockRestore());

  test('shows who the member is in one tile: name, party, electorate and the plain line', async () => {
    const renderer = await tile();
    const card = renderer.root.findByType(Card);
    expect(card.props.testID).toBe('today-your-mp-member');
    expect(text(renderer, 'today-your-mp-name')).toBe(member.person.name);
    expect(text(renderer, 'today-your-mp-seat')).toBe(seat.name);
    expect(text(renderer, 'today-your-mp-separator')).toBe('\u00b7');
    expect(text(renderer, 'today-your-mp-hook')).toBe(
      'Represents you in federal parliament',
    );
    expect(ids(renderer)).toContain('today-your-mp-party');
    expect(ids(renderer)).toContain('today-your-mp-mark');
    // One portrait, by the shared rules: a blank circle, never initials.
    const portrait = renderer.root.findByType(Portrait);
    expect(portrait.props.name).toBe(member.person.name);
    expect(portrait.props.localURI).toBeUndefined();
    await act(async () => renderer.unmount());
  });

  test('is one link to the profile with one spoken label built from the record', async () => {
    const renderer = await tile();
    const card = renderer.root.findByType(Card);
    expect(card.props.href.params.slug).toBe('anthony-albanese');
    expect(card.props.accessibilityLabel).toMatch(
      new RegExp(
        `^Your MP, ${member.person.name}, .+, ${seat.name}\\. Represents you in federal parliament\\.$`,
      ),
    );
    expect(card.props.accessibilityHint).toBe('Opens the profile');
    expect(
      card.props.accessibilityActions.map((a: { label: string }) => a.label),
    ).toEqual(['Follow', `Open ${seat.name}`, 'Change electorate']);
    expect(
      card.props.menu.map((item: { title: string }) => item.title),
    ).toEqual(
      expect.arrayContaining([`Open ${seat.name}`, 'Change electorate']),
    );
    await act(async () => renderer.unmount());
  });

  test('draws no votes, declarations, bills or senators, and reads none of them', async () => {
    const renderer = await tile();
    const drawn = ids(renderer);
    for (const id of drawn) {
      expect(id).not.toMatch(/latest|senators|declaration|your-mp-group/);
    }
    expect(drawn.filter((id) => id === 'today-your-mp-sources')).toHaveLength(
      1,
    );
    expect(catalogs.yourMP).toHaveBeenCalledTimes(1);
    expect(catalogs.profileFor).not.toHaveBeenCalled();
    expect(catalogs.electorateFor).not.toHaveBeenCalled();
    expect(catalogs.bills).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  test('a seat with no recorded member says so and opens the electorate', async () => {
    jest.mocked(catalogs.yourMP).mockResolvedValue({
      ...view,
      members: { ...view.members, data: [] },
    });
    const renderer = await tile();
    const card = renderer.root.findByType(Card);
    expect(card.props.testID).toBe('today-your-mp-vacant');
    expect(card.props.accessibilityLabel).toBe(
      `Your electorate, ${seat.name}. No member is recorded for this seat yet.`,
    );
    expect(card.props.accessibilityHint).toBe('Opens the electorate');
    expect(text(renderer, 'today-your-mp-none')).toBe(
      'No member is recorded for this seat yet.',
    );
    expect(ids(renderer)).not.toContain('today-your-mp-member');
    expect(ids(renderer)).not.toContain('today-your-mp-hook');
    await act(async () => renderer.unmount());
  });

  test('on a narrow phone at Large a wrapped party and seat line never starts with the separator', async () => {
    dimensions.mockReturnValue({
      width: 320,
      height: 568,
      scale: 2,
      fontScale: 1,
    });
    const renderer = await tile();
    // The seat is its own unit, drawn whole: no separator in front of it.
    expect(text(renderer, 'today-your-mp-seat')).toBe(seat.name);
    expect(text(renderer, 'today-your-mp-separator')).toBe('·');
    // The separator ends the party's unit, so a wrap breaks after it.
    const holds = (node: TestRenderer.ReactTestInstance, id: string) =>
      node.findAll((n) => n.props.testID === id).length > 0;
    /** The innermost host view holding all of `inside` and none of `outside`. */
    const innermost = (inside: string[], outside: string[] = []) =>
      renderer.root
        .findAll(
          (n) =>
            n.type === 'View' &&
            inside.every((id) => holds(n, id)) &&
            !outside.some((id) => holds(n, id)),
        )
        .at(-1)!;
    const unit = innermost(
      ['today-your-mp-party', 'today-your-mp-separator'],
      ['today-your-mp-seat'],
    );
    expect(unit).toBeDefined();
    expect(StyleSheet.flatten(unit.props.style)).toMatchObject({
      flexDirection: 'row',
    });
    expect(StyleSheet.flatten(unit.props.style).flexWrap).toBeUndefined();
    // The line that wraps holds the party's unit and the seat as siblings.
    const line = innermost(['today-your-mp-separator', 'today-your-mp-seat']);
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
    });
    await act(async () => renderer.unmount());
  });

  test('cites the member note only under a member', async () => {
    const note =
      'Your member, their party and their seat from the parliament roster.';
    const notes = (renderer: TestRenderer.ReactTestRenderer) =>
      renderer.root.find(
        (n) =>
          typeof n.type !== 'string' &&
          n.props.testID === 'today-your-mp-sources',
      ).props.notes;
    const shown = await tile();
    expect(notes(shown)).toEqual([note]);
    await act(async () => shown.unmount());
    for (const data of [[], [...view.members.data!, ...view.members.data!]]) {
      jest.mocked(catalogs.yourMP).mockResolvedValue({
        ...view,
        members: { ...view.members, data },
      });
      const vacant = await tile();
      expect(vacant.root.findByType(Card).props.testID).toBe(
        'today-your-mp-vacant',
      );
      expect(notes(vacant)).toEqual([]);
      await act(async () => vacant.unmount());
    }
  });

  test('when the roster fails the seat still shows, with Change electorate and a retry', async () => {
    jest.mocked(catalogs.yourMP).mockRejectedValue(new Error('Unavailable'));
    const onRetry = jest.fn();
    const renderer = await tile({ onRetry });
    const drawn = ids(renderer);
    expect(drawn).toContain('today-your-mp-error');
    expect(drawn).toContain('today-your-mp-error-seat');
    const header = renderer.root.find(
      (n) =>
        typeof n.type === 'string' &&
        n.props.testID === 'today-your-mp-error-seat',
    );
    expect(header.props.accessibilityLabel).toMatch(
      new RegExp(`^${seat.name}, `),
    );
    expect(
      header.findAllByType(NativeText).map((n) => n.props.children),
    ).toContain(seat.name);
    // Touch and hold: the RowLink around the header carries the menu.
    let link = header.parent;
    while (link && !link.props.menu) link = link.parent;
    expect(
      link!.props.menu.map((item: { title: string }) => item.title),
    ).toContain('Change electorate');
    await act(async () => renderer.unmount());
  });

  test('at accessibility sizes the portrait stacks over the words and the electorate takes its own line', async () => {
    dimensions.mockReturnValue({
      width: 402,
      height: 874,
      scale: 3,
      fontScale: 3.571,
    });
    const renderer = await tile();
    expect(text(renderer, 'today-your-mp-seat')).toBe(seat.name);
    const portrait = renderer.root.findByType(Portrait);
    expect(StyleSheet.flatten(portrait.parent!.props.style).flexDirection).toBe(
      'column',
    );
    for (const id of ['today-your-mp-name', 'today-your-mp-hook']) {
      const node = renderer.root
        .findAllByType(NativeText)
        .find((n) => n.props.testID === id)!;
      expect(node.props.numberOfLines).toBeUndefined();
    }
    await act(async () => renderer.unmount());
  });

  test('the chevron centres on the name\u2019s first line as drawn, at any text size', async () => {
    const renderer = await tile();
    const chevron = () =>
      StyleSheet.flatten(
        renderer.root.find(
          (n) =>
            typeof n.type === 'string' &&
            n.props.testID === 'today-your-mp-name-chevron',
        ).props.style,
      );
    expect(chevron().height).toBe(textStyles.subsectionTitle.lineHeight);
    const name = renderer.root
      .findAllByType(NativeText)
      .find((n) => n.props.testID === 'today-your-mp-name')!;
    act(() =>
      name.props.onTextLayout({
        nativeEvent: { lines: [{ text: 'Anthony', height: 78 }] },
      }),
    );
    expect(chevron().height).toBe(78);
    expect(chevron().justifyContent).toBe('center');
    await act(async () => renderer.unmount());
  });

  test('never stretches past a card\u2019s width on a wide single column', async () => {
    const renderer = await tile();
    const block = renderer.root.find(
      (n) => typeof n.type === 'string' && n.props.testID === 'today-your-mp',
    );
    expect(StyleSheet.flatten(block.props.style)).toMatchObject({
      width: '100%',
      maxWidth: TILE_MAX_WIDTH,
    });
    expect(TILE_MAX_WIDTH).toBeLessThanOrEqual(600);
    await act(async () => renderer.unmount());
  });

  test('the plain line is said only of a federal lower-house seat', () => {
    expect(yourMPHook(seat)).toBe('Represents you in federal parliament');
    expect(
      yourMPHook({ jurisdiction: 'federal', chamber: 'senate' }),
    ).toBeNull();
    expect(
      yourMPHook({ jurisdiction: 'vic', chamber: 'representatives' }),
    ).toBeNull();
  });

  test('the spoken label drops what the record lacks', () => {
    expect(
      yourMPLabel({
        name: 'Jo Briskey',
        party: 'Labor',
        electorate: 'Maribyrnong',
        hook: 'Represents you in federal parliament',
      }),
    ).toBe(
      'Your MP, Jo Briskey, Labor, Maribyrnong. Represents you in federal parliament.',
    );
    expect(
      yourMPLabel({
        name: 'Jo Briskey',
        party: null,
        electorate: 'Maribyrnong',
        hook: null,
      }),
    ).toBe('Your MP, Jo Briskey, Maribyrnong.');
  });
});

test('Today keeps the recorded member when their profile cannot be linked: the tile opens the electorate', async () => {
  const unlinked = { ...directory, slugs: result({ ...slugs, slugs: {} }) };
  const renderer = await tile({ directory: unlinked });
  const member = view.members.data![0]!;
  const card = renderer.root.findByType(Card);
  expect(card.props.testID).toBe('today-your-mp-member');
  expect(card.props.accessibilityHint).toBe('Opens the electorate');
  expect(card.props.accessibilityLabel).toContain(member.person.name);
  expect(text(renderer, 'today-your-mp-name')).toBe(member.person.name);
  expect(ids(renderer)).not.toContain('today-your-mp-none');
  await act(async () => renderer.unmount());
});

test('Your MP keeps the recorded member when their profile cannot be linked', async () => {
  const unlinked = { ...directory, slugs: result({ ...slugs, slugs: {} }) };
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <RepresentativesGroup
        seat={seat}
        directory={unlinked}
        view={view}
        electorate={electorate}
      />,
    );
  });
  const member = view.members.data![0]!;
  const row = renderer.root
    .findAllByType(PersonRow)
    .find((node) => node.props.name === member.person.name);
  expect(row).toBeDefined();
  expect(row!.props.href).toBeUndefined();
  expect(row!.props.party).toBe(member.party);
  expect(
    renderer.root.findAllByProps({ testID: 'your-member-none' }),
  ).toHaveLength(0);
  await act(async () => renderer.unmount());
});

test('Today cites the House roster alone, dated and labelled as saved when it is', () => {
  const source = yourMPSources({
    ...view,
    members: {
      ...view.members,
      asAt: '2026-11-10',
      stale: true,
      savedAt: 123,
      sources: [
        { label: 'Fixture House roster', url: 'https://example.org/house' },
      ],
    },
    senators: [
      {
        ...view.senators[0]!,
        asAt: '2026-10-01',
        sources: [
          {
            label: 'Fixture Senate roster',
            url: 'https://example.org/senate',
          },
        ],
      },
    ],
  });
  // The senators no longer draw on Today, so their roster is not cited.
  expect(source.asOf).toBe('2026-11-10');
  expect(source.citation).toEqual([
    { label: 'Fixture House roster', asOf: '2026-11-10' },
  ]);
  expect(source.originals).toEqual([
    {
      label: 'Fixture House roster',
      url: 'https://example.org/house',
      asOf: '2026-11-10',
    },
  ]);
  expect(source.state).toBe('saved');
  expect(source.savedAt).toBe(123);
  expect(yourMPSources(view).state).toBeNull();
});

test('Latest shows a long gift title in full words, never cut at 79 characters', async () => {
  // Build 61 on an iPhone Duo: "…provided by Endeavou…" on the Today card
  // (the rows now live on Your MP and the profile).
  const title =
    'Fixture Cup Final: hospitality and a ticket to the match on 26/09/26 provided by Fixture Hospitality Group';
  expect(title.length).toBeGreaterThan(80);
  const records = [
    {
      key: 'register-fixture',
      kind: 'register',
      date: '2026-09-28',
      action: 'Declared a gift',
      title,
      detail: '',
      url: 'https://example.invalid/register',
    },
  ] as unknown as LatestRecord[];
  // Default text size: at accessibility sizes the title runs in full.
  const dimensions = jest
    .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: 951, height: 669, scale: 3, fontScale: 1 });
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <InsetGroup>
        <LatestRows records={records} testID="your-mp-latest" />
      </InsetGroup>,
    );
  });
  const node = renderer.root.findAll(
    (n) =>
      typeof n.type === 'string' && n.props.testID === 'your-mp-latest-0-title',
  )[0];
  expect(node).toBeDefined();
  expect(node!.props.children).toBe(title);
  expect(node!.props.numberOfLines).toBeGreaterThanOrEqual(3);
  await act(async () => renderer.unmount());
  dimensions.mockRestore();
});

// Exercise LatestRows' mounted Text, not just an isolated wordSafe example,
// on the narrow Duo column.
test.each([
  ['AX3', 2.643],
  ['AX5', 3.571],
] as const)(
  '%s: the existing Your MP vote title fitting keeps words whole on Duo',
  async (_size, fontScale) => {
    const window = Dimensions.get('window');
    const platform = jest.replaceProperty(Platform, 'OS', 'ios');
    const title =
      'Online Safety Amendment (Strengthening Enforcement for the Social Media Minimum Age) Bill 2026 amendment';
    const records = [
      {
        key: 'vote-fixture',
        kind: 'vote',
        date: '2026-09-28',
        action: 'Voted for',
        title,
        detail: 'Third reading',
        url: 'https://example.invalid/vote',
      },
    ] as unknown as LatestRecord[];
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        Dimensions.set({
          window: { ...window, width: 402, height: 678, fontScale },
        });
        renderer = TestRenderer.create(
          <InsetGroup>
            <LatestRows records={records} testID="your-mp-latest" />
          </InsetGroup>,
        );
      });
      const text = () =>
        renderer.root
          .findAllByType(NativeText)
          .find((node) => node.props.testID === 'your-mp-latest-0-title')!;
      expect(text()).toBeDefined();
      expect(text().props.numberOfLines).toBeUndefined();
      const column = 110;
      const ramp =
        textRampScale(textStyles.rowRecord.dynamicTypeRamp, fontScale) ?? 1;
      let lines: { text: string; width: number; height: number }[] = [];
      let lastSize = 0;
      for (let step = 0; step < 40; step++) {
        const style = StyleSheet.flatten(text().props.style);
        const size = style.fontSize * ramp;
        if (size === lastSize) break;
        lastSize = size;
        const height = style.lineHeight * ramp;
        lines = [];
        let line = '';
        const push = () => {
          lines.push({
            text: line,
            width: textWidth(line.trimEnd(), size),
            height,
          });
          line = '';
        };
        for (const word of title.split(/(?<= )/)) {
          if (textWidth((line + word).trimEnd(), size) <= column) {
            line += word;
            continue;
          }
          if (line) push();
          for (const glyph of word) {
            if (line && textWidth((line + glyph).trimEnd(), size) > column)
              push();
            line += glyph;
          }
        }
        if (line) push();
        act(() =>
          text().props.onLayout({
            nativeEvent: {
              layout: {
                x: 0,
                y: 0,
                width: column,
                height: lines.length * height,
              },
            },
          }),
        );
        act(() => text().props.onTextLayout({ nativeEvent: { lines } }));
      }
      expect(lines.map((line) => line.text).join('')).toBe(title);
      expect(breaksMidWord(lines)).toBe(false);
      // This word still cannot fit at the default 17pt size; the inherited
      // step-down must continue below it rather than stopping at cap 1.
      expect(lastSize).toBeLessThan(textStyles.rowRecord.fontSize);
      expect(lastSize).toBeGreaterThanOrEqual(10.8);
    } finally {
      await act(async () => {
        renderer?.unmount();
        Dimensions.set({ window });
      });
      platform.restore();
    }
  },
);
