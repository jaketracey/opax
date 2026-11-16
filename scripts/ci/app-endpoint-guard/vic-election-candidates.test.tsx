// The Victorian election endpoint, as each app build still in use reads it.
//
// scripts/ci/app-data-guard.sh copies this file into the app tree's tests/ and runs it once per build:
// with the app line's own mobile/src, then with each pinned build's (OPAX_DECODERS_SRC, named by
// OPAX_DECODERS_LABEL). The fixtures (OPAX_ENDPOINT_FIXTURES) are what the Worker really answers for the
// overview and three seats, generated from the built hub data (scripts/ci/app-endpoint-fixtures.mjs).
//
// Builds to 1.1.5 draw any `party` they are sent as a link to their own party screen, which has no record
// for most registered Victorian parties. So the endpoint sends `party: null` and the party as nominated on
// a second line of `name` (portal/src/app-vic-election.ts candidateRow). For each build with election
// screens this checks that the answer decodes, that every candidate and every party is printed, and that
// no candidate row has a party link or a party action. A build with no election screens must not read the
// endpoint at all. The last line printed says which build's source was read; the script requires it.
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { act, type ReactElement } from 'react';
import { Text as NativeText, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context';

const SRC = resolve(process.env.OPAX_DECODERS_SRC ?? join(__dirname, '../src'));
const LABEL = process.env.OPAX_DECODERS_LABEL || 'this tree';
const FIXTURES = resolve(process.env.OPAX_ENDPOINT_FIXTURES ?? '');
const ENDPOINT = '/api/app/v1/vic-election';
const hasElection = existsSync(join(SRC, 'features/vic-election/decoders.ts'));
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
const seatFiles = () =>
  readdirSync(FIXTURES).filter((f) => /^seat-.+\.json$/.test(f)).sort();

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const Link = ({ children, ...props }: { children: unknown }) =>
    React.createElement('Link', props, children);
  Link.Trigger = ({ children }: { children: unknown }) => children;
  function Noop() {
    return null;
  }
  Link.Preview = Link.Menu = Link.MenuAction = Noop;
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    Link,
    useLocalSearchParams: () => ({}),
    useNavigation: () => ({ setParams: jest.fn() }),
    useFocusEffect: jest.fn(),
    useIsPreview: () => false,
  };
});

function draw(element: ReactElement) {
  let result!: TestRenderer.ReactTestRenderer;
  act(() => {
    result = TestRenderer.create(
      <SafeAreaFrameContext.Provider
        value={{ x: 0, y: 0, width: 390, height: 844 }}
      >
        <SafeAreaInsetsContext.Provider
          value={{ top: 47, bottom: 34, left: 0, right: 0 }}
        >
          <View>{element}</View>
        </SafeAreaInsetsContext.Provider>
      </SafeAreaFrameContext.Provider>,
    );
  });
  return result;
}

/** The build's own decoders and candidate rows, with the network runtime stubbed. */
function build() {
  jest.doMock(join(SRC, 'api/runtime'), () => ({
    apiClient: {},
    catalogs: {},
    portraits: { get: jest.fn(async () => null) },
  }));
  jest.doMock(join(SRC, 'api/useOffline'), () => ({ useOffline: () => false }));
  const decoders = require(join(SRC, 'features/vic-election/decoders'));
  const { Candidates } = require(join(SRC, 'features/vic-election/Candidates'));
  return { ...decoders, Candidates };
}

/** One seat drawn by the build: its printed words and, per candidate row, its links and actions. */
function drawSeat(
  b: ReturnType<typeof build>,
  payload: { candidates: { list: unknown[] } },
  overview: unknown,
) {
  const record = {
    data: b.decodeSeat(payload),
    stale: false,
    savedAt: Date.parse('2026-11-16'),
    asOf: null,
  };
  const r = draw(
    <b.Candidates
      record={record}
      o={b.decodeOverview(overview)}
      now={new Date('2026-11-16T10:00:00+11:00')}
    />,
  );
  const words = r.root
    .findAllByType(NativeText)
    .map((n) => n.props.children)
    .flat(10)
    .join('\n');
  const rows = payload.candidates.list.map((_, i) => {
    const node = r.root
      .findAllByProps({ testID: `vic-seat-candidate-${i}` })
      .find((n) => typeof n.type === 'string')!;
    return {
      label: String(node.props.accessibilityLabel ?? ''),
      actions: (node.props.accessibilityActions ?? []).length as number,
      links: node.findAll(
        (n) =>
          typeof n.props?.onPress === 'function' ||
          n.props?.accessibilityRole === 'link',
      ).length,
    };
  });
  act(() => r.unmount());
  return { decoded: record.data, words, rows };
}

/** Every source file under a folder. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? sources(path)
      : /\.(?:ts|tsx|js|json)$/.test(name)
        ? [path]
        : [];
  });
}

test(`the Victorian election endpoint under ${LABEL}`, () => {
  expect(seatFiles().length).toBeGreaterThanOrEqual(2);
  if (!hasElection) {
    // No election screens: nothing in this build may ask for the endpoint.
    const readers = sources(SRC).filter((path) =>
      readFileSync(path, 'utf8').includes(ENDPOINT),
    );
    expect(readers).toEqual([]);
    console.log(`endpoint: ${LABEL} ${SRC} no election screens; does not read ${ENDPOINT}`);
    return;
  }
  const b = build();
  const overview = fixture('overview.json');
  let rows = 0, parties = 0, links = 0, actions = 0, unendorsed = 0;
  const partyNames = new Set<string>();
  for (const file of seatFiles()) {
    const payload = fixture(file);
    const drawn = drawSeat(b, payload, overview);
    expect(drawn.decoded.candidates.list).toHaveLength(payload.candidates.list.length);
    for (const [i, c] of payload.candidates.list.entries()) {
      rows++;
      // What is sent: never a party for the build to link.
      expect(c.party).toBeNull();
      expect(drawn.decoded.candidates.list[i].party).toBeNull();
      expect(drawn.decoded.candidates.list[i].name).toBe(c.name);
      // What is drawn: the candidate, and the party as nominated, in print and in the spoken label.
      expect(drawn.words).toContain(c.candidate_name);
      expect(drawn.rows[i]!.label).toContain(c.candidate_name);
      if (c.party_name) {
        parties++;
        partyNames.add(c.party_name);
        expect(c.name).toBe(`${c.candidate_name}\n${c.party_name}`);
        expect(drawn.words).toContain(c.party_name);
        expect(drawn.rows[i]!.label).toContain(c.party_name);
      } else {
        unendorsed++;
        expect(c.name).toBe(c.candidate_name);
      }
      links += drawn.rows[i]!.links;
      actions += drawn.rows[i]!.actions;
    }
  }
  // The fixtures do cover many parties and candidates nominated without one.
  expect(partyNames.size).toBeGreaterThanOrEqual(10);
  expect(unendorsed).toBeGreaterThanOrEqual(2);
  expect(links).toBe(0);
  expect(actions).toBe(0);
  // The check can see a link: the shape these builds were first sent does draw one per party.
  const old = fixture(seatFiles()[0]!);
  for (const c of old.candidates.list) {
    c.name = c.candidate_name;
    c.party = c.party_name;
  }
  const before = drawSeat(b, old, overview);
  const named = old.candidates.list.filter((c: { party: string | null }) => c.party).length;
  expect(named).toBeGreaterThan(0);
  expect(before.rows.filter((row) => row.links > 0)).toHaveLength(named);
  expect(before.rows.filter((row) => row.actions > 0)).toHaveLength(named);
  console.log(
    `endpoint: ${LABEL} ${SRC} seats=${seatFiles().length} rows=${rows} parties printed=${parties} of ${partyNames.size} names, party links=${links}, party actions=${actions}`,
  );
});
