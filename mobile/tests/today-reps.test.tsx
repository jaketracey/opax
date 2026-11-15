import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { StyleSheet, Text as NativeText } from 'react-native';
import { catalogs } from '../src/api/runtime';
import { yourMPFor, type Electorate } from '../src/api/catalogs';
import { PersonRow, YourMPMark } from '../src/design/people';
import { LinkRow } from '../src/design/rows';
import { REPS_HEADING, repLabel } from '../src/features/today/RepsGroup';
import {
  federalRole,
  repsShape,
  stateRole,
  stateSeatFor,
  VIC_DISSOLVED_FROM,
  YourMPCard,
  YourMPPending,
  yourMPSources,
} from '../src/features/today/YourMPCard';
import { MyMemberContext } from '../src/features/your-mp/MyMemberContext';
import { migrateSeatChoice } from '../src/features/your-mp/useSeat';
import { index, manifest, people, roster, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: { yourMP: jest.fn() },
  portraits: { get: jest.fn(async () => null) },
}));
jest.mock('../src/features/CachedPortrait', () => {
  const { View } = jest.requireActual('react-native');
  // The row's 44 pt portrait, as a box, so the row's height can be read.
  return {
    CachedPortrait: () => <View style={{ width: 44, height: 44 }} />,
  };
});
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
const directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(index),
};
const current = (s: Electorate) => s.status !== 'historical';
const federal = (name: string) =>
  index.electorates.find(
    (s) =>
      s.name === name &&
      s.jurisdiction === 'federal' &&
      s.chamber === 'representatives' &&
      current(s),
  )!;
const district = (name: string, chamber: string) =>
  index.electorates.find(
    (s) => s.name === name && s.chamber === chamber && current(s),
  )!;
const maribyrnong = federal('Maribyrnong');
const essendon = district('Essendon', 'vic_la');
const grayndler = federal('Grayndler');
const griffith = federal('Griffith');
const region = index.electorates.find((s) => s.chamber === 'vic_lc')!;
/** A lower-house district of another state, as the directory holds it. */
const districtOf = (chamber: string) =>
  index.electorates.find((s) => s.chamber === chamber && current(s))!;
/**
 * The directory as it would be if the roster recorded that district's
 * member (it records none outside Victoria today).
 */
const withMember = (seat: Electorate) => {
  const recorded = {
    ...seat,
    representation_status: 'verified',
    representation_as_of: '2026-09-09',
    representatives: essendon.representatives,
  } as Electorate;
  return {
    seat: recorded,
    directory: {
      ...directory,
      electorates: result({
        ...index,
        electorates: index.electorates.map((s) =>
          s.electorate_id === seat.electorate_id ? recorded : s,
        ),
      }),
    } as typeof directory,
  };
};
/** A day the Victorian Legislative Assembly sat, and one after it dissolved. */
const SITTING = '2026-10-01';
const DISSOLVED = '2026-11-15';

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(catalogs.yourMP)
    .mockImplementation(async (id: string) =>
      yourMPFor(id, index, manifest, []),
    );
});

async function card(
  props: Partial<React.ComponentProps<typeof YourMPCard>> = {},
) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <YourMPCard
        seat={maribyrnong}
        directory={directory}
        stateSeatIds={[essendon.electorate_id]}
        today={SITTING}
        attempt={0}
        onRetry={jest.fn()}
        {...props}
      />,
    );
  });
  return renderer;
}
const pendingGroup = (props: React.ComponentProps<typeof YourMPPending>) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<YourMPPending {...props} />);
  });
  return renderer;
};
const ids = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAll((n) => typeof n.type === 'string' && !!n.props.testID)
    .map((n) => n.props.testID as string);
const strings = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root
    .findAllByType(NativeText)
    .flatMap((n) => [n.props.children].flat())
    .filter((child): child is string => typeof child === 'string');
const rows = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType(PersonRow);
const host = (renderer: TestRenderer.ReactTestRenderer, testID: string) =>
  renderer.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === testID,
  );
const memberOf = (seat: Electorate) => seat.representatives[0]!.person.name;

/**
 * A host tree's height from its styles, as a column or a row lays out:
 * padding, gaps, minimum heights and one line of each text style. Enough to
 * compare the loading group with the loaded one, line for line.
 */
function heightOf(node: TestRenderer.ReactTestRendererNode | null): number {
  if (!node || typeof node === 'string') return 0;
  const style = (StyleSheet.flatten(node.props.style) ?? {}) as Record<
    string,
    number | string | undefined
  >;
  if (style.position === 'absolute') return 0;
  if (node.type === 'Text') return Number(style.lineHeight ?? 0);
  const kids = (node.children ?? []).map(heightOf);
  const gap = Number(style.rowGap ?? style.gap ?? 0);
  const inner =
    style.flexDirection === 'row'
      ? Math.max(0, ...kids)
      : kids.reduce((sum, h) => sum + h, 0) +
        gap * Math.max(0, kids.filter((h) => h > 0).length - 1);
  const pad =
    2 * Number(style.paddingVertical ?? style.padding ?? 0) +
    Number(style.paddingTop ?? 0) +
    Number(style.paddingBottom ?? 0);
  return Math.max(
    typeof style.height === 'number' ? style.height : inner + pad,
    Number(style.minHeight ?? 0),
  );
}
const groupHeight = (renderer: TestRenderer.ReactTestRenderer, id: string) => {
  const tree = renderer.toJSON() as TestRenderer.ReactTestRendererJSON;
  const find = (
    node: TestRenderer.ReactTestRendererNode,
  ): TestRenderer.ReactTestRendererJSON | null => {
    if (typeof node === 'string') return null;
    if (node.props.testID === id) return node;
    for (const child of node.children ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  return heightOf(find(tree));
};

describe('Today’s representatives group', () => {
  let dimensions: jest.SpyInstance;
  beforeEach(() => {
    dimensions = jest
      .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
      .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
  });
  afterEach(() => dimensions.mockRestore());

  test('a heading stands over the group, as a header, in the section title style', async () => {
    const renderer = await card();
    const heading = renderer.root
      .findAllByType(NativeText)
      .find((n) => n.props.testID === 'today-reps-heading')!;
    expect(heading.props.children).toBe(REPS_HEADING);
    expect(REPS_HEADING).toBe('Your representatives');
    expect(heading.props.accessibilityRole).toBe('header');
    // The heading is the first thing in the block, over the group.
    expect(ids(renderer).indexOf('today-reps-heading')).toBeLessThan(
      ids(renderer).indexOf('today-reps-group'),
    );
    await act(async () => renderer.unmount());
  });

  test('no row carries the Your MP eyebrow, even for the reader’s own member', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    const mine = {
      slug: 'jo-briskey',
      canonicalPersonId: maribyrnong.representatives[0]!.person_id,
    };
    await act(async () => {
      renderer = TestRenderer.create(
        // Today sits inside the reader's member context on the device.
        <MyMemberContext.Provider value={mine as never}>
          <YourMPCard
            seat={maribyrnong}
            directory={directory}
            stateSeatIds={[essendon.electorate_id]}
            today={SITTING}
            attempt={0}
            onRetry={jest.fn()}
          />
        </MyMemberContext.Provider>,
      );
    });
    expect(renderer.root.findAllByType(YourMPMark)).toHaveLength(0);
    expect(strings(renderer)).not.toContain('Your MP');
    expect(strings(renderer)).not.toContain(
      'Represents you in federal parliament',
    );
    for (const row of rows(renderer))
      expect(
        host(renderer, row.props.testID).props.accessibilityLabel,
      ).not.toMatch(/Your MP/);
    await act(async () => renderer.unmount());
  });

  test('a Victorian reader sees two rows: the federal member, then the state lower-house member', async () => {
    const renderer = await card();
    expect(rows(renderer).map((row) => row.props.testID)).toEqual([
      'today-rep-federal',
      'today-rep-state',
    ]);
    const [fed, state] = rows(renderer);
    expect(fed!.props.name).toBe(memberOf(maribyrnong));
    expect(fed!.props.place).toBe('Federal · Maribyrnong');
    expect(state!.props.name).toBe(memberOf(essendon));
    expect(state!.props.place).toBe(
      'Victorian Legislative Assembly · Essendon',
    );
    // The same anatomy for both, whatever the party: a portrait, the party
    // by the shared label and the role line.
    for (const row of [fed!, state!]) {
      expect(row.props.portrait).toBeTruthy();
      expect(row.props.party).toBeTruthy();
      expect(row.props.size).toBeUndefined();
    }
    await act(async () => renderer.unmount());
  });

  test('each row opens that member’s profile', async () => {
    const renderer = await card();
    const [fed, state] = rows(renderer);
    expect(fed!.props.href.params.slug).toBe('jo-briskey');
    expect(state!.props.href.pathname).toBe(fed!.props.href.pathname);
    expect(state!.props.href.params.slug).toBeTruthy();
    expect(state!.props.href.params.slug).not.toBe('jo-briskey');
    const titles = (row: TestRenderer.ReactTestInstance) =>
      (row.props.menu as { title: string }[]).map((item) => item.title);
    expect(titles(fed!)).toEqual(
      expect.arrayContaining(['Open Maribyrnong', 'Change electorate']),
    );
    expect(titles(state!)).toEqual(
      expect.arrayContaining(['Open Essendon', 'Change state electorate']),
    );
    await act(async () => renderer.unmount());
  });

  test('VoiceOver reads each row as name, party and role', async () => {
    const renderer = await card();
    expect(host(renderer, 'today-rep-federal').props.accessibilityLabel).toBe(
      `${memberOf(maribyrnong)}, Labor, Federal member for Maribyrnong`,
    );
    expect(host(renderer, 'today-rep-state').props.accessibilityLabel).toMatch(
      new RegExp(
        `^${memberOf(essendon)}, .+, Victorian Legislative Assembly member for Essendon$`,
      ),
    );
    expect(host(renderer, 'today-rep-federal').props.accessibilityRole).toBe(
      'link',
    );
    expect(
      repLabel({
        name: 'Jo Briskey',
        party: null,
        partyStatus: 'current',
        spokenRole: 'Federal member for Maribyrnong',
      }),
    ).toBe('Jo Briskey, Federal member for Maribyrnong');
    await act(async () => renderer.unmount());
  });

  test('while the Victorian Assembly is dissolved the state row says who last held the seat, never "member for"', async () => {
    expect(DISSOLVED >= VIC_DISSOLVED_FROM).toBe(true);
    const renderer = await card({ today: DISSOLVED });
    const state = rows(renderer)[1]!;
    expect(state.props.place).toBe(
      'Victorian Legislative Assembly · last held Essendon',
    );
    const label = host(renderer, 'today-rep-state').props
      .accessibilityLabel as string;
    expect(label).toMatch(
      /, last held Essendon in the Victorian Legislative Assembly$/,
    );
    expect(label).not.toMatch(/member for/);
    // The federal row is unchanged: the House of Representatives sits.
    expect(rows(renderer)[0]!.props.place).toBe('Federal · Maribyrnong');
    expect(stateRole(essendon, SITTING).spokenRole).toBe(
      'Victorian Legislative Assembly member for Essendon',
    );
    await act(async () => renderer.unmount());
  });

  test('the federal row alone when there is no state member: no saved district, a region only, or a seat with no recorded member', async () => {
    const vacantState = {
      ...directory,
      electorates: result({
        ...index,
        electorates: index.electorates.map((s) =>
          s.electorate_id === essendon.electorate_id
            ? { ...s, representatives: [] }
            : s,
        ),
      }),
    };
    const unverified = {
      ...directory,
      electorates: result({
        ...index,
        electorates: index.electorates.map((s) =>
          s.electorate_id === essendon.electorate_id
            ? { ...s, representation_status: 'unverified' }
            : s,
        ),
      }),
    };
    for (const props of [
      { stateSeatIds: [] },
      { stateSeatIds: [region.electorate_id] },
      { stateSeatIds: ['el_000000000000000000000000'] },
      { directory: vacantState as typeof directory },
      { directory: unverified as typeof directory },
    ]) {
      const renderer = await card(props);
      expect(rows(renderer).map((row) => row.props.testID)).toEqual([
        'today-rep-federal',
      ]);
      // No placeholder stands in for the state member.
      expect(strings(renderer).join(' ')).not.toMatch(
        /No member is recorded|Essendon|Legislative/,
      );
      await act(async () => renderer.unmount());
    }
  });

  test('New South Wales and Queensland readers see their federal member alone: the device saves no state district for them', async () => {
    for (const [seat, state] of [
      [grayndler, 'New South Wales'],
      [griffith, 'Queensland'],
    ] as const) {
      // What the device can hold for this reader: a state seat id saved
      // with a seat outside Victoria is set aside by the saved-choice read.
      const stray = districtOf(seat === grayndler ? 'nsw_la' : 'qld_la');
      // The roster records no member for the district either.
      expect(stray.representatives).toHaveLength(0);
      expect(stateSeatFor(directory, [stray.electorate_id])).toBeNull();
      const saved = migrateSeatChoice(
        {
          version: 1,
          seatId: seat.electorate_id,
          stateSeatIds: [stray.electorate_id],
        },
        index.electorates,
      )!;
      expect(saved.stateSeatIds).toEqual([]);
      const renderer = await card({ seat, stateSeatIds: saved.stateSeatIds });
      expect(rows(renderer).map((row) => row.props.testID)).toEqual([
        'today-rep-federal',
      ]);
      expect(rows(renderer)[0]!.props.place).toBe(`Federal · ${seat.name}`);
      expect(rows(renderer)[0]!.props.name).toBe(memberOf(seat));
      expect(
        renderer.root.findAllByType(LinkRow).map((row) => row.props.title),
      ).toEqual([`Senators for ${state}`]);
      expect(repsShape(seat, directory, saved.stateSeatIds)).toEqual({
        state: false,
        senators: true,
      });
      await act(async () => renderer.unmount());
    }
  });

  test('a state row names its own parliament: nothing in the group is Victorian by default', async () => {
    const { seat: nsw, directory: recorded } = withMember(districtOf('nsw_la'));
    const renderer = await card({
      directory: recorded,
      seat: grayndler,
      stateSeatIds: [nsw.electorate_id],
      today: DISSOLVED,
    });
    const state = rows(renderer)[1]!;
    expect(state.props.name).toBe(memberOf(nsw));
    // The Victorian dissolution says nothing of another state's house.
    expect(state.props.place).toBe(
      `New South Wales Legislative Assembly · ${nsw.name}`,
    );
    expect(
      (state.props.menu as { title: string }[]).map((item) => item.title),
    ).not.toContain('Change state electorate');
    const qld = districtOf('qld_la');
    expect(stateRole(qld, DISSOLVED).role).toBe(
      `Queensland Legislative Assembly · ${qld.name}`,
    );
    await act(async () => renderer.unmount());
  });

  test('senators get one quiet link row to the existing list, never rows of their own', async () => {
    const renderer = await card();
    const links = renderer.root.findAllByType(LinkRow);
    expect(links).toHaveLength(1);
    expect(links[0]!.props.title).toBe('Senators for Victoria');
    expect(links[0]!.props.testID).toBe('today-reps-senators');
    const senate = index.electorates.find(
      (s) => s.chamber === 'senate' && s.state_code === maribyrnong.state_code,
    )!;
    expect(JSON.stringify(links[0]!.props.href)).toContain(
      senate.electorate_id,
    );
    // The group's last row, after the members.
    expect(ids(renderer).indexOf('today-reps-senators')).toBeGreaterThan(
      ids(renderer).indexOf('today-rep-state'),
    );
    expect(rows(renderer)).toHaveLength(2);
    await act(async () => renderer.unmount());
  });

  test('one source line under the group names each source used', async () => {
    const line = (renderer: TestRenderer.ReactTestRenderer) =>
      renderer.root.findAll(
        (n) =>
          typeof n.type !== 'string' &&
          n.props.testID === 'today-your-mp-sources',
      )[0]!.props;
    const both = await card();
    expect(
      ids(both).filter((id) => id === 'today-your-mp-sources'),
    ).toHaveLength(1);
    expect(line(both).citation.map((c: { label: string }) => c.label)).toEqual([
      expect.any(String),
      'Parliament of Victoria',
    ]);
    expect(
      line(both).originals.map((o: { label: string }) => o.label),
    ).toContain('Essendon');
    expect(line(both).notes).toHaveLength(2);
    await act(async () => both.unmount());
    const alone = await card({ stateSeatIds: [] });
    expect(line(alone).citation).toHaveLength(1);
    expect(line(alone).notes).toEqual([
      'Your federal member, their party and their seat from the parliament roster.',
    ]);
    expect(JSON.stringify(line(alone))).not.toMatch(/Parliament of Victoria/);
    await act(async () => alone.unmount());
    const view = yourMPFor(maribyrnong.electorate_id, index, manifest);
    expect(yourMPSources(view, essendon).asOf).toBe(
      [view.members.asAt, essendon.representation_as_of]
        .filter(Boolean)
        .map((d) => String(d).slice(0, 10))
        .sort()[0],
    );
  });

  test('no authorisation line and no campaign words draw on Today’s group, for a Victorian reader too', async () => {
    const renderer = await card({ today: DISSOLVED });
    expect(strings(renderer).join(' ')).not.toMatch(
      /authoris|vote for|candidate|—/i,
    );
    await act(async () => renderer.unmount());
  });

  test('a federal seat with no recorded member says so in the member’s place and opens the electorate', async () => {
    jest.mocked(catalogs.yourMP).mockImplementation(async (id: string) => {
      const view = yourMPFor(id, index, manifest, []);
      return { ...view, members: { ...view.members, data: [] } };
    });
    const renderer = await card({ stateSeatIds: [] });
    expect(rows(renderer)).toHaveLength(0);
    const vacant = renderer.root
      .findAllByType(LinkRow)
      .find((row) => row.props.testID === 'today-your-mp-vacant')!;
    expect(vacant.props.title).toBe('Maribyrnong');
    expect(vacant.props.detail).toBe(
      'No member is recorded for this seat yet.',
    );
    expect(vacant.props.accessibilityHint).toBe('Opens the electorate');
    await act(async () => renderer.unmount());
  });

  test('a member whose profile cannot be linked keeps their row, which opens the electorate', async () => {
    const unlinked = { ...directory, slugs: result({ ...slugs, slugs: {} }) };
    const renderer = await card({ directory: unlinked, stateSeatIds: [] });
    const row = rows(renderer)[0]!;
    expect(row.props.name).toBe(memberOf(maribyrnong));
    expect(JSON.stringify(row.props.href)).toContain(maribyrnong.electorate_id);
    await act(async () => renderer.unmount());
  });

  test('when the roster fails the seat still shows under the heading, with Change electorate and a retry', async () => {
    jest.mocked(catalogs.yourMP).mockRejectedValue(new Error('Unavailable'));
    const broken = {
      ...directory,
      manifest: { ...directory.manifest, data: null },
    } as unknown as typeof directory;
    const renderer = await card({ directory: broken });
    expect(ids(renderer)).toEqual(
      expect.arrayContaining([
        'today-reps-heading',
        'today-your-mp-error',
        'today-your-mp-error-seat',
      ]),
    );
    await act(async () => renderer.unmount());
  });

  describe('nothing moves after first paint', () => {
    test('the state seat with a member is known from the directory, and its absence too', () => {
      expect(stateSeatFor(directory, [essendon.electorate_id])).toBe(essendon);
      expect(
        stateSeatFor(directory, [region.electorate_id, essendon.electorate_id]),
      ).toBe(essendon);
      expect(stateSeatFor(directory, [])).toBeNull();
      expect(stateSeatFor(directory, [region.electorate_id])).toBeNull();
      expect(
        repsShape(maribyrnong, directory, [essendon.electorate_id]),
      ).toEqual({ state: true, senators: true });
      expect(federalRole(maribyrnong).role).toBe('Federal · Maribyrnong');
    });

    test('the place held while the directory is read has the loaded group’s rows: one or two, and the senators row', async () => {
      for (const stateSeatIds of [[], [essendon.electorate_id]]) {
        const shape = repsShape(maribyrnong, directory, stateSeatIds);
        const held = pendingGroup(shape);
        const loaded = await card({ stateSeatIds });
        const bones = ids(held).filter((id) =>
          /^today-rep-.*-loading$/.test(id),
        );
        expect(bones).toEqual(
          rows(loaded).map((row) => `${row.props.testID}-loading`),
        );
        expect(ids(held).includes('today-reps-loading-senators')).toBe(
          ids(loaded).includes('today-reps-senators'),
        );
        // The heading and the source line's band are in the first frame.
        expect(ids(held)).toEqual(
          expect.arrayContaining([
            'today-reps-heading',
            'today-reps-loading-source',
          ]),
        );
        act(() => held.unmount());
        await act(async () => loaded.unmount());
      }
    });

    test.each([
      ['Large', 1, []],
      ['Large', 1, [essendon.electorate_id]],
      ['AX3', 2.353, []],
      ['AX3', 2.353, [essendon.electorate_id]],
    ] as const)(
      'at %s the first frame’s group is as tall as the loaded group (state seats: %#)',
      async (_size, fontScale, stateSeatIds) => {
        dimensions.mockReturnValue({
          width: 402,
          height: 874,
          scale: 3,
          fontScale,
        });
        const held = pendingGroup(
          repsShape(maribyrnong, directory, stateSeatIds),
        );
        const loaded = await card({ stateSeatIds: [...stateSeatIds] });
        const first = groupHeight(held, 'today-reps-loading-group');
        const final = groupHeight(loaded, 'today-reps-group');
        expect(first).toBeGreaterThan(stateSeatIds.length ? 200 : 130);
        expect(first).toBe(final);
        act(() => held.unmount());
        await act(async () => loaded.unmount());
      },
    );

    test('the card’s own read, while out, draws the same held place and never a row less', async () => {
      // No directory answer to hold: the card waits on its read.
      const broken = {
        ...directory,
        manifest: { ...directory.manifest, data: null },
      } as unknown as typeof directory;
      jest.mocked(catalogs.yourMP).mockReturnValue(new Promise(() => {}));
      const renderer = await card({ directory: broken });
      expect(
        ids(renderer).filter((id) => /^today-rep-.*-loading$/.test(id)),
      ).toEqual(['today-rep-federal-loading', 'today-rep-state-loading']);
      await act(async () => renderer.unmount());
    });
  });
});
