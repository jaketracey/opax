// Ask's people rows never wait for the people catalogue. At 97b649f58 they
// were drawn only once that read had answered, up to the client's 8 second
// timeout on a slow network. They are drawn at once from the roster, and
// the place lines are sharpened in place when the read arrives: the same
// rows, in the same order, each the same height. Every name is invented.
import { act } from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import type { PeopleCatalog, Roster } from '../src/api/catalog-decoders';
import { PersonRow } from '../src/design/people';
import {
  loadAskProfiles,
  placeForms,
  rosterProfiles,
  type AskPerson,
} from '../src/features/ask/people';
import { people } from './pinned';

type Row = Roster['people'][number];
const template = people.people.find((p) =>
  p.electorates.some((e) => e.jurisdiction === 'federal'),
)!;
const seatLike = template.electorates.find(
  (e) => e.jurisdiction === 'federal',
)!;
const row = (name: string, electorate: string, over: Partial<Row> = {}): Row =>
  ({
    name,
    pid: `pid-${name}`,
    party: 'Invented Party',
    speeches: 1,
    current: true,
    states: ['federal', 'nsw'],
    chambers: ['representatives', 'nsw_lc'],
    representation: [
      {
        jurisdiction: 'federal',
        chamber: 'representatives',
        electorate,
        state: 'NSW',
      },
    ],
    ...over,
  }) as unknown as Row;
const sitting = row('Invented Member', 'Calare');
const moved = row('Invented Mover', 'Werriwa');
const plain = row('Invented Sitting', 'Watson', { states: ['federal'] });
const roster = {
  meta: { generated: '2026-11-16' },
  people: [sitting, moved, plain],
} as unknown as Roster;
const dated = (person: Row, current: boolean) => ({
  ...template,
  person_id: `person_${person.name.replace(/\W/g, '')}`,
  name: person.name,
  aliases: [],
  legacy_person_id: person.pid,
  electorates: [
    {
      ...seatLike,
      name: person.representation![0]!.electorate,
      chamber: 'representatives',
      current,
    },
  ],
});
const catalogue = {
  ...people,
  people: [dated(sitting, true), dated(moved, false)],
} as unknown as PeopleCatalog;
const slugs = { slugs: {} };
const rosterLines = {
  'Invented Member': 'Calare, New South Wales',
  'Invented Mover': 'Werriwa, New South Wales',
  'Invented Sitting': 'Member for Watson, New South Wales',
};
const lines = (profiles: Map<string, AskPerson>) =>
  Object.fromEntries([...profiles].map(([name, p]) => [name, p.place]));

function source(peopleRead: () => Promise<unknown>) {
  return {
    roster: jest.fn(async () => ({ data: roster })),
    slugs: jest.fn(async () => ({ data: slugs })),
    manifest: jest.fn(async () => ({ data: { people_url: '/people.json' } })),
    people: jest.fn(peopleRead),
  } as never;
}

describe('Ask’s people rows load in two steps', () => {
  test('with the people read still pending, the rows are drawn at once with the roster’s lines', async () => {
    const shown: Map<string, AskPerson>[] = [];
    let names: string[] = [];
    let answer!: (value: { data: PeopleCatalog }) => void;
    const pending = new Promise<{ data: PeopleCatalog }>((resolve) => {
      answer = resolve;
    });
    const done = loadAskProfiles(
      source(() => pending),
      (profiles, people) => {
        shown.push(profiles);
        names = people;
      },
    );
    // A few turns of the queue: the roster has answered, the people read
    // has not, and the rows are already there.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(shown).toHaveLength(1);
    expect(lines(shown[0]!)).toEqual(rosterLines);
    expect(names).toEqual(roster.people.map((p) => p.name));

    // The read arrives: the lines are sharpened in place.
    answer({ data: catalogue });
    await done;
    expect(shown).toHaveLength(2);
    expect(lines(shown[1]!)).toEqual({
      'Invented Member': 'Member for Calare, New South Wales',
      'Invented Mover': 'Former member for Werriwa, New South Wales',
      'Invented Sitting': 'Member for Watson, New South Wales',
    });
    // The same people, in the same order, with nothing else changed.
    expect([...shown[1]!.keys()]).toEqual([...shown[0]!.keys()]);
    expect(shown[1]!.size).toBe(shown[0]!.size);
    for (const [name, after] of shown[1]!) {
      const before = shown[0]!.get(name)!;
      expect({ ...after, place: null }).toEqual({ ...before, place: null });
      // Each line is one of the forms the row already holds room for.
      expect(after.placeForms).toContain(after.place);
      expect(before.placeForms).toContain(before.place);
    }
  });

  test('the people read is started beside the roster’s, not after it', async () => {
    const order: string[] = [];
    const from = {
      roster: async () => {
        order.push('roster');
        return { data: roster };
      },
      slugs: async () => ({ data: slugs }),
      manifest: async () => {
        order.push('manifest');
        return { data: { people_url: '/people.json' } };
      },
      people: async () => ({ data: catalogue }),
    } as never;
    await loadAskProfiles(from, () => undefined);
    expect(order[0]).toBe('manifest');
  });

  test('a people read that fails leaves the first rows standing, shown once', async () => {
    const shown: Map<string, AskPerson>[] = [];
    await loadAskProfiles(
      source(() => Promise.reject(new Error('timeout'))),
      (profiles) => shown.push(profiles),
    );
    expect(shown).toHaveLength(1);
    expect(lines(shown[0]!)).toEqual(rosterLines);
  });

  test('a roster that fails still fails, as before', async () => {
    const from = {
      roster: () => Promise.reject(new Error('offline')),
      slugs: async () => ({ data: slugs }),
      manifest: async () => ({ data: { people_url: '/people.json' } }),
      people: async () => ({ data: catalogue }),
    } as never;
    await expect(loadAskProfiles(from, () => undefined)).rejects.toThrow(
      'offline',
    );
  });
});

describe('the row holds room for every line it may show', () => {
  const all = [
    'Calare, New South Wales',
    'Member for Calare, New South Wales',
    'Former member for Calare, New South Wales',
  ];
  type Json = TestRenderer.ReactTestRendererJSON;
  const mounted: TestRenderer.ReactTestRenderer[] = [];
  afterEach(() => act(() => mounted.splice(0).forEach((r) => r.unmount())));
  const draw = (place: string) => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <PersonRow
          name="Invented Member"
          party="Invented Party"
          place={place}
          placeForms={all}
          onPress={() => undefined}
          testID="row"
        />,
      );
    });
    mounted.push(r);
    return r;
  };
  /** The tree as layout sees it: without what only changes what is seen. */
  const laidOut = (node: Json | string): Json | string => {
    if (typeof node === 'string') return node;
    const {
      accessibilityLabel: _label,
      accessibilityElementsHidden: _hidden,
      importantForAccessibility: _important,
      ...props
    } = node.props;
    const style = { ...StyleSheet.flatten(props.style) };
    delete style.opacity;
    return {
      ...node,
      props: { ...props, style },
      children: node.children?.map(laidOut) ?? null,
    };
  };

  test('the profiles carry the three forms in one fixed order', () => {
    const profiles = rosterProfiles(roster, slugs as never);
    expect(profiles.get('Invented Member')!.placeForms).toEqual(all);
    const forms = placeForms(sitting)!;
    expect([forms.plain, forms.current, forms.former]).toEqual(all);
  });

  test('the row lays out the same whichever line it shows: only what is seen differs', () => {
    const trees = all.map((place) => draw(place));
    const [first, ...rest] = trees.map((r) => laidOut(r.toJSON() as Json));
    for (const other of rest)
      expect(JSON.stringify(other)).toBe(JSON.stringify(first));
    trees.forEach((r, i) => {
      const cell = r.root.find(
        (n) => typeof n.type === 'string' && n.props.testID === 'row-place',
      );
      expect(StyleSheet.flatten(cell.props.style)).toMatchObject({
        flexDirection: 'row',
        alignItems: 'flex-start',
      });
      const layers = cell.children as TestRenderer.ReactTestInstance[];
      expect(layers).toHaveLength(3);
      layers.forEach((layer, j) => {
        const style = StyleSheet.flatten(layer.props.style);
        // In the layout, each across the full width, laid over the first.
        expect(style.position).toBeUndefined();
        expect(style.width).toBe('100%');
        expect(style.marginLeft).toBe(j > 0 ? '-100%' : undefined);
        // Only the line the row is showing is seen, and read.
        expect(style.opacity === 0).toBe(j !== i);
        expect(!!layer.props.accessibilityElementsHidden).toBe(j !== i);
      });
    });
  });

  test('a row with no forms draws its place line as before', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <PersonRow name="Invented Member" place="Calare" testID="row" />,
      );
    });
    mounted.push(r);
    expect(
      r.root.findAll(
        (n) => typeof n.type === 'string' && n.props.testID === 'row-place',
      ),
    ).toHaveLength(0);
  });
});
