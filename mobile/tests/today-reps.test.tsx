import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { StyleSheet, Text as NativeText } from 'react-native';
import { catalogs } from '../src/api/runtime';
import {
  decodeElectorateIndex,
  yourMPFor,
  type Electorate,
} from '../src/api/catalogs';
import {
  PartyLabel,
  PersonRow,
  Portrait,
  YourMPMark,
} from '../src/design/people';
import { Icon } from '../src/design/icon';
import { LinkRow } from '../src/design/rows';
import {
  linesLabel,
  REPS_HEADING,
  repLabel,
} from '../src/features/today/RepsGroup';
import {
  DISSOLVED_STAND_IN,
  electionDayWords,
  formFromIndex,
  formFromRecord,
  NEUTRAL_STAND_IN,
  resultLoaded,
  stateForm,
  type StateForm,
} from '../src/features/today/dissolution';
import { decodeOverview } from '../src/features/vic-election/decoders';
import electionOverview from '../scripts/fixtures/vic-election/overview.json';
import {
  federalRole,
  keptStateRow,
  stateLines,
  repsShape,
  stateRole,
  stateSeatFor,
  YourMPCard,
  YourMPPending,
  yourMPSources,
} from '../src/features/today/YourMPCard';
import { MyMemberContext } from '../src/features/your-mp/MyMemberContext';
import { migrateSeatChoice } from '../src/features/your-mp/useSeat';
import { index, manifest, people, pinned, roster, slugs } from './pinned';

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
/** The election record as the app decodes it (pinned fixture). */
const overview = decodeOverview(electionOverview);
/** The election day the Assembly is dissolved for, from that record. */
const ELECTION_DAY = overview.election_day;
/** After the record's caretaker date, before its election day. */
const DURING = new Date('2026-11-15T12:00:00+11:00');
const DISSOLVED: StateForm = { kind: 'dissolved', electionDay: ELECTION_DAY };
const NEUTRAL: StateForm = { kind: 'neutral' };
const dissolvedEssendon = stateLines(essendon, directory, DISSOLVED)!;

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
/** A text node's characters, through nested text. */
const textLength = (node: TestRenderer.ReactTestRendererNode): number =>
  typeof node === 'string'
    ? node.length
    : (node.children ?? []).reduce((sum, child) => sum + textLength(child), 0);
/**
 * A row's height where text wraps at `wrapAt` characters a line (a line
 * held to `numberOfLines` wraps no further), as at an accessibility size.
 */
function rowHeight(
  renderer: TestRenderer.ReactTestRenderer,
  id: string,
  wrapAt: number,
): number {
  const measure = (node: TestRenderer.ReactTestRendererNode | null): number => {
    if (!node || typeof node === 'string') return 0;
    const style = (StyleSheet.flatten(node.props.style) ?? {}) as Record<
      string,
      number | string | undefined
    >;
    if (style.position === 'absolute') return 0;
    if (node.type === 'Text') {
      const lines = Math.max(1, Math.ceil(textLength(node) / wrapAt));
      return (
        Number(style.lineHeight ?? 0) *
        Math.min(lines, Number(node.props.numberOfLines ?? Infinity))
      );
    }
    const kids = (node.children ?? []).map(measure);
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
  };
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
  return measure(find(renderer.toJSON() as TestRenderer.ReactTestRendererJSON));
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

  describe('the state row names a member only when the data decides it', () => {
    const last = memberOf(essendon);
    const stateLines_ = (r: TestRenderer.ReactTestRenderer) =>
      r.root
        .findAllByType(NativeText)
        .filter((t) => /^today-rep-state-line-/.test(t.props.testID ?? ''));
    const words = (r: TestRenderer.ReactTestRenderer) =>
      stateLines_(r).map((t) => t.props.children);

    test('dissolved: four lines in order, and nobody is called a member', async () => {
      const renderer = await card({ stateForm: DISSOLVED });
      expect(words(renderer)).toEqual([
        'Victoria · Legislative Assembly',
        'Essendon',
        'Assembly dissolved for the 28 November election',
        expect.stringMatching(new RegExp(`^Last member: ${last}, \\w+`)),
      ]);
      expect(words(renderer)).toEqual([...dissolvedEssendon]);
      expect(stateLines_(renderer).map((t) => t.props.testID)).toEqual(
        [1, 2, 3, 4].map((n) => `today-rep-state-line-${n}`),
      );
      expect(strings(renderer).join(' ')).not.toMatch(
        /member for|Victorian Legislative Assembly ·|last held/,
      );
      // The federal row is unchanged: the House of Representatives sits.
      expect(rows(renderer).map((row) => row.props.testID)).toEqual([
        'today-rep-federal',
      ]);
      await act(async () => renderer.unmount());
    });

    test('neutral: with no election record and nothing kept, the row states the roster’s dated record and makes no current-member claim', async () => {
      const form = stateForm(
        essendon,
        { overview: null, reading: false },
        DURING,
        null,
      );
      expect(form).toEqual({ kind: 'neutral' });
      const renderer = await card({ stateForm: form });
      expect(words(renderer)).toEqual([
        'Victoria · Legislative Assembly',
        'Essendon',
        expect.stringMatching(
          new RegExp(`^On the roster at 9 Sep 2026: ${last}, \\w+$`),
        ),
      ]);
      expect(ids(renderer)).toContain('today-rep-state-neutral');
      // Not a member's row, and no word that says the person is the member.
      expect(rows(renderer).map((row) => row.props.testID)).toEqual([
        'today-rep-federal',
      ]);
      const row = host(renderer, 'today-rep-state-neutral');
      expect(row.findAllByType(Portrait)).toHaveLength(0);
      expect(row.findAllByType(PartyLabel)).toHaveLength(0);
      expect(
        `${strings(renderer).join(' ')} ${row.props.accessibilityLabel}`,
      ).not.toMatch(/member for|Your state member|Last member|dissolved/i);
      expect(row.props.accessibilityLabel).toBe(linesLabel(words(renderer)));
      // The source note says why, and cites no election record.
      const line = renderer.root.findAll(
        (n) =>
          typeof n.type !== 'string' &&
          n.props.testID === 'today-your-mp-sources',
      )[0]!.props;
      expect(line.citation.map((c: { label: string }) => c.label)).toEqual([
        expect.any(String),
        'Parliament of Victoria',
      ]);
      expect(line.notes.join(' ')).toMatch(/names nobody as the member/);
      await act(async () => renderer.unmount());
    });

    test('the last member is not styled as a current member: no portrait, no party dot or link, no name as the title', async () => {
      const renderer = await card({ stateForm: DISSOLVED });
      const row = host(renderer, 'today-rep-state-dissolved');
      expect(row.findAllByType(Portrait)).toHaveLength(0);
      expect(row.findAllByType(PartyLabel)).toHaveLength(0);
      const style = (n: number) =>
        StyleSheet.flatten(stateLines_(renderer)[n]!.props.style);
      expect(style(0).fontSize).toBe(
        StyleSheet.flatten(
          renderer.root
            .findAllByType(NativeText)
            .find((t) => t.props.testID === 'today-rep-federal-name')!.props
            .style,
        ).fontSize,
      );
      expect(style(3).fontSize).toBe(style(2).fontSize);
      expect(style(3).fontWeight).toBe(style(2).fontWeight);
      expect(style(3).color).toBe(style(2).color);
      expect(style(3).fontSize).toBeLessThan(style(0).fontSize as number);
      await act(async () => renderer.unmount());
    });

    test('VoiceOver reads the row as one element, the four lines in order, and a tap opens the last member’s profile', async () => {
      const renderer = await card({ stateForm: DISSOLVED });
      const row = host(renderer, 'today-rep-state-dissolved');
      expect(row.props.accessible).toBe(true);
      expect(row.props.accessibilityRole).toBe('link');
      expect(row.props.accessibilityLabel).toBe(linesLabel(dissolvedEssendon));
      expect(row.props.accessibilityLabel).toMatch(
        new RegExp(
          `^Victoria, Legislative Assembly\\. Essendon\\. Assembly dissolved for the 28 November election\\. Last member: ${last}, \\w+\\.$`,
        ),
      );
      expect(row.props.accessibilityHint).toBe(
        'Opens the last member’s profile',
      );
      expect(
        row.findAll(
          (n) => n !== row && typeof n.type === 'string' && n.props.accessible,
        ),
      ).toHaveLength(0);
      await act(async () => renderer.unmount());
    });

    test('the election record decides it; no date is written in the app', () => {
      // Before the record's caretaker date the Assembly sits, and the
      // decision holds only until that instant.
      const caretaker = overview.key_dates.find(
        (d) => d.id === 'caretaker',
      )!.passes_at!;
      expect(
        formFromRecord(
          essendon,
          overview,
          new Date('2026-11-01T12:00:00+11:00'),
        ),
      ).toEqual({ kind: 'member', until: caretaker });
      expect(formFromRecord(essendon, overview, DURING)).toEqual(DISSOLVED);
      // Another election, another day: whatever the record says.
      const later = {
        ...overview,
        election_day: '2030-11-30',
        key_dates: overview.key_dates.map((d) =>
          d.id === 'caretaker'
            ? { ...d, passes_at: '2030-11-05T18:00:00+11:00' }
            : d,
        ),
      };
      expect(formFromRecord(essendon, later, DURING).kind).toBe('member');
      expect(
        formFromRecord(essendon, later, new Date('2030-11-06T09:00:00+11:00')),
      ).toEqual({ kind: 'dissolved', electionDay: '2030-11-30' });
      expect(electionDayWords('2030-11-30')).toBe('30 November');
      // A record with no caretaker date decides nothing: the neutral row.
      expect(
        formFromRecord(essendon, { ...overview, key_dates: [] }, DURING),
      ).toEqual({ kind: 'neutral' });
      // A seat that is not one of the record's districts is not its business.
      expect(formFromRecord(maribyrnong, overview, DURING)).toEqual({
        kind: 'member',
        until: null,
      });
      // No source file names the dissolution or election date.
      for (const file of [
        'dissolution.ts',
        'YourMPCard.tsx',
        'RepsGroup.tsx',
      ]) {
        const source = readFileSync(
          join(__dirname, '../src/features/today', file),
          'utf8',
        );
        expect(source).not.toMatch(/2026-11-\d\d|\b(3|28) November\b/);
      }
      expect(
        readFileSync(join(__dirname, '../src/features/Today.tsx'), 'utf8'),
      ).not.toMatch(/2026-11-\d\d/);
    });

    test('the switch to the new member is the seat’s latest_election reaching election day, never the roster’s fetch date', async () => {
      const after = new Date('2026-12-02T12:00:00+11:00');
      // The roster refetched after election day, with no result loaded:
      // its date moves, the last member is still not drawn as sitting.
      const refetched = { ...essendon, representation_as_of: '2026-11-30' };
      expect(resultLoaded(refetched, ELECTION_DAY)).toBe(false);
      expect(formFromRecord(refetched, overview, after)).toEqual(DISSOLVED);
      // The result loaded into the electorates index: the member's row.
      const declared = { ...essendon, latest_election: ELECTION_DAY };
      expect(resultLoaded(declared, ELECTION_DAY)).toBe(true);
      expect(formFromRecord(declared, overview, after)).toEqual({
        kind: 'member',
        until: null,
      });
      // An earlier election's result is not this one's.
      expect(
        resultLoaded({ latest_election: '2022-11-26' }, ELECTION_DAY),
      ).toBe(false);
      // With the record out of reach, a kept dissolved row answers by the
      // same field.
      const none = { overview: null, reading: false };
      const kept = keptStateRow(essendon, directory, DISSOLVED);
      expect(stateForm(essendon, none, after, kept)).toEqual(DISSOLVED);
      expect(stateForm(refetched, none, after, kept)).toEqual(DISSOLVED);
      expect(stateForm(declared, none, after, kept)).toEqual({
        kind: 'member',
        until: null,
      });
      const renderer = await card({
        stateForm: stateForm(declared, none, after, kept),
      });
      expect(rows(renderer)[1]!.props.place).toBe(
        'Victorian Legislative Assembly · Essendon',
      );
      expect(ids(renderer)).not.toContain('today-rep-state-dissolved');
      await act(async () => renderer.unmount());
    });

    test('the electorates index answers first when it carries dissolved_for: no record needed, and nothing kept overrides it', () => {
      const none = { overview: null, reading: true };
      const decided = { kind: 'member' as const, until: null };
      const dissolvedSeat = { ...essendon, dissolved_for: '2030-11-30' };
      const sittingSeat = { ...essendon, dissolved_for: null };
      // Dissolved for whatever election the index names.
      expect(formFromIndex(dissolvedSeat)).toEqual({
        kind: 'dissolved',
        electionDay: '2030-11-30',
      });
      expect(stateForm(dissolvedSeat, none, DURING, decided)).toEqual({
        kind: 'dissolved',
        electionDay: '2030-11-30',
      });
      // Null: the post-result roster is loaded, so the member's row, even
      // while the election record still says its caretaker period runs.
      expect(formFromIndex(sittingSeat)).toEqual(decided);
      expect(
        stateForm(sittingSeat, { overview, reading: false }, DURING, null),
      ).toEqual(decided);
      expect(
        stateForm(
          sittingSeat,
          none,
          DURING,
          keptStateRow(essendon, directory, DISSOLVED),
        ),
      ).toEqual(decided);
      // An index that predates the field says nothing: the record decides.
      expect(essendon.dissolved_for).toBeUndefined();
      expect(formFromIndex(essendon)).toBeUndefined();
      expect(
        stateForm(essendon, { overview, reading: false }, DURING, null),
      ).toEqual(DISSOLVED);
    });

    test('an index row with dissolved_for decodes: a day, null, or absent; anything else is not a row', () => {
      const raw = pinned(manifest.index_url) as {
        electorates: Record<string, unknown>[];
      };
      const withValue = (value: unknown) => ({
        ...raw,
        electorates: raw.electorates.map((row) =>
          row.electorate_id === essendon.electorate_id
            ? { ...row, dissolved_for: value }
            : row,
        ),
      });
      const decoded = (value: unknown) =>
        decodeElectorateIndex(withValue(value)).electorates.find(
          (s) => s.electorate_id === essendon.electorate_id,
        );
      expect(decoded('2026-11-28')!.dissolved_for).toBe('2026-11-28');
      expect(decoded(null)!.dissolved_for).toBeNull();
      expect(
        decodeElectorateIndex(raw).electorates.find(
          (s) => s.electorate_id === essendon.electorate_id,
        )!.dissolved_for,
      ).toBeUndefined();
      // A malformed value drops that one row, never the index.
      expect(decoded('soon')).toBeUndefined();
      expect(decodeElectorateIndex(withValue('soon')).electorates.length).toBe(
        decodeElectorateIndex(raw).electorates.length - 1,
      );
    });

    test('a kept member row answers while the record is out, until its caretaker instant', () => {
      const out = { overview: null, reading: true };
      const before = new Date('2026-10-20T12:00:00+11:00');
      const caretaker = overview.key_dates.find(
        (d) => d.id === 'caretaker',
      )!.passes_at!;
      // Decided for good (the new member, or a seat the record never
      // covered): a member's row, record or no record, reading or not.
      const decided = { kind: 'member' as const, until: null };
      expect(stateForm(essendon, out, DURING, decided)).toEqual(decided);
      // Decided before the caretaker date: holds until that instant only.
      const sitting = { kind: 'member' as const, until: caretaker };
      expect(stateForm(essendon, out, before, sitting)).toEqual(sitting);
      expect(stateForm(essendon, out, DURING, sitting)).toEqual({
        kind: 'held',
        lines: null,
      });
      expect(
        stateForm(
          essendon,
          { overview: null, reading: false },
          DURING,
          sitting,
        ),
      ).toEqual({ kind: 'neutral' });
      // Nothing kept and the record on its way: held, never a member.
      expect(stateForm(essendon, out, DURING, null)).toEqual({
        kind: 'held',
        lines: null,
      });
      // Kept lines hold themselves while the record is read again.
      const neutral = keptStateRow(essendon, directory, { kind: 'neutral' })!;
      expect(stateForm(essendon, out, DURING, neutral)).toEqual({
        kind: 'held',
        lines: (neutral as { lines: readonly string[] }).lines,
      });
    });

    test('the group cites the Victorian Electoral Commission for the election day, and says why there is no member', async () => {
      const renderer = await card({ stateForm: DISSOLVED });
      const line = renderer.root.findAll(
        (n) =>
          typeof n.type !== 'string' &&
          n.props.testID === 'today-your-mp-sources',
      )[0]!.props;
      expect(line.citation.map((c: { label: string }) => c.label)).toEqual([
        expect.any(String),
        'Parliament of Victoria',
        'Victorian Electoral Commission',
      ]);
      expect(line.notes.join(' ')).toMatch(/dissolved for the election/);
      expect(line.notes.join(' ')).not.toMatch(/Your state member/);
      await act(async () => renderer.unmount());
    });

    test.each([
      ['Large', 1, 'dissolved'],
      ['AX3', 2.353, 'dissolved'],
      ['AX5', 3.571, 'dissolved'],
      ['Large', 1, 'neutral'],
      ['AX5', 3.571, 'neutral'],
    ] as const)(
      'at %s (scale %d) the held %s row has its lines’ height from the first frame: the kept lines, unseen, beside the row’s own chevron',
      async (_size, fontScale, kind) => {
        dimensions.mockReturnValue({
          width: 402,
          height: 874,
          scale: 3,
          fontScale,
        });
        const form = kind === 'dissolved' ? DISSOLVED : NEUTRAL;
        const kept = stateLines(essendon, directory, form)!;
        const held = pendingGroup({ state: true, senators: true, lines: kept });
        const loaded = await card({ stateForm: form });
        expect(ids(held)).toContain('today-rep-state-lines-loading');
        expect(ids(held)).not.toContain('today-rep-state-loading');
        const drawn = (r: TestRenderer.ReactTestRenderer) =>
          stateLines_(r).map((t) => [
            t.props.children,
            StyleSheet.flatten(t.props.style).fontSize,
            StyleSheet.flatten(t.props.style).lineHeight,
          ]);
        expect(drawn(held)).toEqual(drawn(loaded));
        expect(drawn(held)).toHaveLength(kind === 'dissolved' ? 4 : 3);
        expect(
          stateLines_(held).every(
            (t) => StyleSheet.flatten(t.props.style).opacity === 0,
          ),
        ).toBe(true);
        // The chevron is the row's own icon, at the row's own scale, so the
        // lines have the same width to wrap in at every text size.
        const chevrons = (r: TestRenderer.ReactTestRenderer, id: string) =>
          host(r, id)
            .findAllByType(Icon)
            .filter((icon) => icon.props.size === 13)
            .map((icon) => [icon.props.name, icon.props.maxScale]);
        expect(chevrons(held, 'today-rep-state-lines-loading')).toEqual(
          chevrons(loaded, `today-rep-state-${kind}`),
        );
        expect(chevrons(held, 'today-rep-state-lines-loading')).toHaveLength(1);
        expect(groupHeight(held, 'today-reps-loading-group')).toBe(
          groupHeight(loaded, 'today-reps-group'),
        );
        act(() => held.unmount());
        await act(async () => loaded.unmount());
      },
    );

    test('with nothing kept, the stand-ins are as long as the longest real district and member lines', () => {
      const districts = index.electorates.filter((s) => s.chamber === 'vic_la');
      const longest = (form: StateForm, line: number) =>
        Math.max(
          ...districts.map(
            (s) => stateLines(s, directory, form)![line]!.length,
          ),
        );
      expect(DISSOLVED_STAND_IN[1]!.length).toBeGreaterThanOrEqual(
        longest(DISSOLVED, 1),
      );
      expect(DISSOLVED_STAND_IN[2]!.length).toBeGreaterThanOrEqual(
        longest(DISSOLVED, 2),
      );
      expect(DISSOLVED_STAND_IN[3]!.length).toBeGreaterThanOrEqual(
        longest(DISSOLVED, 3),
      );
      expect(NEUTRAL_STAND_IN[2]!.length).toBeGreaterThanOrEqual(
        longest(NEUTRAL, 2),
      );
      expect(NEUTRAL_STAND_IN).toHaveLength(3);
      const held = pendingGroup({
        state: true,
        senators: true,
        lines: DISSOLVED_STAND_IN,
      });
      // Unseen and unspoken: the stand-in is never read to anyone.
      expect(
        host(held, 'today-rep-state-lines-loading').props
          .importantForAccessibility,
      ).toBe('no-hide-descendants');
      act(() => held.unmount());
    });

    test('while the election record is on its way the row’s place is held, and nobody is drawn as a member', async () => {
      const renderer = await card({
        stateForm: { kind: 'held', lines: null },
      });
      expect(rows(renderer).map((row) => row.props.testID)).toEqual([
        'today-rep-federal',
      ]);
      expect(ids(renderer)).toContain('today-rep-state-lines-loading');
      expect(words(renderer)).toEqual([...DISSOLVED_STAND_IN]);
      expect(
        host(renderer, 'today-rep-state-lines-loading').props
          .importantForAccessibility,
      ).toBe('no-hide-descendants');
      await act(async () => renderer.unmount());
    });
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
      expect(repsShape(seat, directory, saved.stateSeatIds)).toMatchObject({
        state: false,
        senators: true,
        stateRow: null,
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
    expect(stateRole(qld).role).toBe(
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
    const renderer = await card({ stateForm: DISSOLVED });
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
      ).toMatchObject({ state: true, senators: true, stateRow: null });
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

    test('at AX3 a long name wraps in the held row as it wraps in the loaded row, so the row is as tall before it loads as after', async () => {
      dimensions.mockReturnValue({
        width: 402,
        height: 874,
        scale: 3,
        fontScale: 2.353,
      });
      const long = 'Kathleen Alexandra Matthews-Ward Fitzgerald';
      const seat = {
        ...maribyrnong,
        representatives: [
          {
            ...maribyrnong.representatives[0]!,
            person: { ...maribyrnong.representatives[0]!.person, name: long },
          },
        ],
      } as Electorate;
      const longIndex = {
        ...index,
        electorates: index.electorates.map((s) =>
          s.electorate_id === seat.electorate_id ? seat : s,
        ),
      };
      const longDirectory = {
        ...directory,
        electorates: result(longIndex),
      } as typeof directory;
      jest
        .mocked(catalogs.yourMP)
        .mockImplementation(async (id: string) =>
          yourMPFor(id, longIndex, manifest, []),
        );
      // A line of text wraps: a dozen characters to the line at this size.
      const wrapped = (renderer: TestRenderer.ReactTestRenderer, id: string) =>
        rowHeight(renderer, id, 12);
      const held = pendingGroup(repsShape(seat, longDirectory, []));
      const loaded = await card({
        seat,
        directory: longDirectory,
        stateSeatIds: [],
      });
      expect(strings(loaded)).toContain(long);
      const first = wrapped(held, 'today-rep-federal-loading');
      const final = wrapped(loaded, 'today-rep-federal');
      // The name takes four lines, not one.
      expect(final).toBeGreaterThan(
        rowHeight(loaded, 'today-rep-federal', Infinity),
      );
      expect(first).toBe(final);
      // Unseen: the held words are never read to anyone.
      expect(strings(held)).toContain(long);
      act(() => held.unmount());
      await act(async () => loaded.unmount());
    });

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
