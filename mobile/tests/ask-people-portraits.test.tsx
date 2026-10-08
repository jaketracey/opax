import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Image } from 'react-native';
import { PeoplePortraits } from '../src/api/people-portraits';
import type { Catalogs } from '../src/api/catalogs';
import type { PortraitCache } from '../src/api/portrait-cache';
import { rosterPeople, type Source, type Turn } from '../src/features/ask/model';
import { catalogs } from './pinned';
// The real verified index over the pinned roster, slugs and photo map.
jest.mock('../src/api/runtime', () => {
  const { PeoplePortraits } = jest.requireActual<
    typeof import('../src/api/people-portraits')
  >('../src/api/people-portraits');
  const { catalogs } = jest.requireActual<typeof import('./pinned')>('./pinned');
  const record = (data: unknown) => ({ data });
  return {
    portraits: new PeoplePortraits(
      {
        directory: async () => ({
          roster: record(catalogs.roster),
          slugs: record(catalogs.slugs),
          people: record(catalogs.people),
          manifest: record(catalogs.manifest),
        }),
        photoPeople: async () => record(catalogs.photoPeople),
        photoCredits: async () => record(catalogs.photoCredits),
      } as unknown as Catalogs,
      {
        get: async (key: string) => `file:///cache/${key}.webp`,
      } as unknown as PortraitCache,
    ),
  };
});
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// The loading veil's breathing loop never settles under act().
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: () => true,
}));
import { AnswerView } from '../src/features/ask/AnswerView';

const source = (speaker: string, i: number): Source => ({
  resource: `r${i}`,
  title: `${speaker} — Bills — 2026-05-14`,
  slug: `r${i}`,
  href: `/r/r${i}`,
  snippet: '',
  cited: true,
  speaker,
  answerRanges: [],
});
// TestFlight 8 Oct: these four rendered as blank circles under the answer.
const speakers = [
  'Sarah Witty',
  'Matt Smith',
  'Mike Freelander',
  'Mary Aldred',
  // A surname-only roster row must never borrow a Smith's face.
  'Smith',
];

test('People in this answer shows each verified roster portrait and nothing else', async () => {
  const people = rosterPeople(catalogs.roster, catalogs.slugs);
  for (const name of speakers) expect(people.has(name)).toBe(true);
  const turn: Turn = {
    role: 'answer',
    text: 'Answer.',
    sources: speakers.map(source),
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <AnswerView
        turn={turn}
        question={{ role: 'user', text: 'Illicit tobacco?' }}
        people={people}
      />,
    );
  });
  // The verified index builds in yielding steps; wait until no lookup is pending.
  const pending = () =>
    renderer.root.findAll(
      (n) =>
        typeof n.type !== 'string' &&
        n.props.loading === true &&
        n.props.name !== undefined,
    ).length;
  for (let i = 0; i < 2000 && (i === 0 || pending()); i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  expect(pending()).toBe(0);
  const shown = renderer.root
    .findAllByType(Image)
    .map((image) => image.props.source.uri);
  expect(shown.sort()).toEqual([
    'file:///cache/10872.webp',
    'file:///cache/wd-Q134384419.webp',
  ]);
  const ids = (suffix: string) =>
    renderer.root
      .findAll(
        (n) =>
          typeof n.props.testID === 'string' &&
          n.props.testID.startsWith('ask-person-portrait-') &&
          n.props.testID.endsWith(suffix) &&
          typeof n.type === 'string',
      )
      .map((n) => n.props.testID);
  expect(new Set(ids('-blank'))).toEqual(
    new Set([
      // No portrait is published for the 2025 intake (OpenAustralia block).
      'ask-person-portrait-matt-smith-blank',
      'ask-person-portrait-mary-aldred-blank',
      'ask-person-portrait-smith-blank',
    ]),
  );
  act(() => renderer.unmount());
});

test('a namesake or surname twin never resolves to another Smith', async () => {
  const reader = new PeoplePortraits(
    {
      directory: async () => ({
        roster: { data: catalogs.roster },
        slugs: { data: catalogs.slugs },
        people: { data: catalogs.people },
        manifest: { data: catalogs.manifest },
      }),
      photoPeople: async () => ({ data: catalogs.photoPeople }),
      photoCredits: async () => ({ data: catalogs.photoCredits }),
    } as unknown as Catalogs,
    {
      get: async (key: string) => `file:///cache/${key}.webp`,
    } as unknown as PortraitCache,
  );
  expect((await reader.get({ slug: 'tony-smith' }))?.info.key).toBe('10592');
  expect(await reader.get({ name: 'Matt Smith', slug: 'matt-smith' })).toBeNull();
  expect(await reader.get({ name: 'Smith', slug: 'smith' })).toBeNull();
  expect(await reader.get({ name: 'Smith' })).toBeNull();
});
