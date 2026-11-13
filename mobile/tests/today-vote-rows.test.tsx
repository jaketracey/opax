import { act, type ReactElement } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { divisionsFixture } from '../scripts/divisions-fixture';
import { catalogs } from '../src/api/runtime';
import { DivisionRow } from '../src/design/rows';
import { VotesBlock } from '../src/features/today/VotesBlock';
import {
  decodeRecentDivisions,
  recentReadingVotes,
  voteMeta,
} from '../src/features/today/votes';
import { countWords } from '../src/features/bills/divisions';
import { pinnedBytes, servedFiles } from './pinned';

jest.mock('expo-router', () => {
  const pass = ({ children }: { children?: unknown }) => children;
  return {
    router: { push: jest.fn(), navigate: jest.fn() },
    useSegments: () => [],
    Link: Object.assign(pass, {
      Trigger: pass,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
  };
});
jest.mock('../src/api/runtime', () => ({
  catalogs: { recentDivisions: jest.fn() },
}));
jest.mock('../src/features/follows/store', () => ({
  useFollows: () => [],
  loadFollows: jest.fn(async () => []),
  follow: jest.fn(),
  unfollow: jest.fn(),
}));

// Sweep 1, item 3: Today's vote rows say the counts the way the bill page
// does ("40 ayes, 83 noes"), and the meta line never breaks inside a date.
const file = decodeRecentDivisions(
  JSON.parse(divisionsFixture(pinnedBytes, servedFiles).toString()),
);
const NBSP = ' ';

const mounted: TestRenderer.ReactTestRenderer[] = [];
async function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  return renderer.root;
}
afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
});
const texts = (node: ReactTestInstance) =>
  node
    .findAll((n) => n.type === 'Text')
    .map((n) =>
      ([] as unknown[])
        .concat(n.props.children)
        .filter((c): c is string => typeof c === 'string')
        .join(''),
    );

test('the meta line shortens the chamber and keeps the date in one piece', () => {
  expect(
    voteMeta({
      stageWords: 'Second reading',
      chamberWords: 'House of Representatives',
      date: '2026-08-19',
    }),
  ).toBe(`Second reading · House · 19${NBSP}Aug${NBSP}2026`);
  expect(
    voteMeta({
      stageWords: 'Third reading',
      chamberWords: 'Senate',
      date: '2026-08-18',
    }),
  ).toBe(`Third reading · Senate · 18${NBSP}Aug${NBSP}2026`);
  expect(
    voteMeta({ stageWords: null, chamberWords: null, date: '2026-08-18' }),
  ).toBe(`18${NBSP}Aug${NBSP}2026`);
});

test('How parliament voted says "N ayes, N noes", as the bill page does', async () => {
  jest.mocked(catalogs.recentDivisions).mockResolvedValue({
    status: 'ready',
    data: file,
    sources: [
      {
        label: 'They Vote For You',
        url: 'https://theyvoteforyou.org.au/divisions',
      },
    ],
    asAt: file.generated_at,
    stale: false,
    savedAt: null,
  } as never);
  const root = await render(<VotesBlock attempt={0} onRetry={() => {}} />);
  const votes = recentReadingVotes(file, 3);
  const rows = root.findAllByType(DivisionRow);
  expect(rows).toHaveLength(votes.length);
  const drawn = texts(root);
  expect(drawn.join('\n')).not.toMatch(/votes? to/);
  for (const [i, vote] of votes.entries()) {
    const row = rows[i]!;
    expect(row.props.countsStyle).toBe('ayesNoes');
    // The bill page's own wording, from the same helper.
    const words = countWords(vote.ayes, vote.noes);
    expect(texts(row)).toContain(words);
    expect(row.props.meta).toBe(voteMeta(vote));
    expect(row.props.meta).not.toMatch(/House of Representatives/);
    // VoiceOver hears plain spaces, never the layout's no-break ones.
    const pressable = row.find(
      (n) => typeof n.type === 'string' && n.props.testID === `today-vote-${i}`,
    );
    expect(pressable.props.accessibilityLabel).toContain(words);
    expect(pressable.props.accessibilityLabel).not.toContain(NBSP);
  }
});
