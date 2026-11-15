import { act, type ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import TestRenderer from 'react-test-renderer';
import { PersonRow } from '../src/design/people';
import { PARTY_NOT_RECORDED } from '../src/design/party';
import { joinPerson } from '../src/api/person-identity';
import {
  decodeYear,
  rosterMatch,
  voiceParty,
} from '../src/features/explore/model';
import { voiceIdentities } from '../src/features/explore/voice-identity';
import { YearVoices, yearVoices } from '../src/features/explore/YearVoices';
import { manifest, people, roster, slugs } from './pinned';

jest.mock('expo-router', () => {
  const pass = ({ children }: { children?: unknown }) => children;
  return {
    router: { push: jest.fn() },
    useSegments: () => [],
    Link: Object.assign(pass, {
      Trigger: pass,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
  };
});
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/follows/store', () => ({
  useFollows: () => [],
  loadFollows: jest.fn(async () => []),
  follow: jest.fn(),
  unfollow: jest.fn(),
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));

const year = (y: number) =>
  decodeYear(
    JSON.parse(
      readFileSync(
        resolve(__dirname, `../../portal/public/years/${y}.json`),
        'utf8',
      ),
    ),
    y,
  );
const lookup = (dated = true) => ({
  people: roster.people,
  slugs: slugs.slugs,
  identity: voiceIdentities(roster, slugs, dated ? { manifest, people } : null),
});
function draw(element: ReactElement) {
  let root!: TestRenderer.ReactTestRenderer;
  act(() => {
    root = TestRenderer.create(element);
  });
  return root.root;
}

// The 2026 file records no party on any of Katy Gallagher's three sampled
// speeches (a minister's Senate rows carry none), and the list said "Party
// not recorded" for a sitting Labor senator.
test('a voice whose speeches carry no party label takes the party every other list shows', () => {
  const data = year(2026);
  const voice = data.voices.speakers.find((s) => s.name === 'Katy Gallagher')!;
  expect(voice.party).toBeNull();
  for (const dated of [true, false]) {
    const root = draw(
      <YearVoices
        data={data}
        meta={{ asOf: data.generated_at, savedAt: null }}
        roster={lookup(dated)}
      />,
    );
    const row = root
      .findAllByType(PersonRow)
      .find((r) => r.props.name === 'Katy Gallagher')!;
    expect(row.props.party).toBe('Labor');
    const slug = rosterMatch(voice.name, roster.people, slugs.slugs)!;
    expect(row.props.party).toBe(
      joinPerson(slug, slugs, roster, people, manifest).party,
    );
  }
});

test('the year’s own speech label wins, and a later party is not read back into an earlier year', () => {
  const defector = {
    party: 'One Nation',
    rosterParty: 'Nationals',
    rosterRow: { last: 2026 },
  };
  expect(voiceParty({ party: 'LNP' }, 2026, defector)).toBe(
    voiceParty({ party: 'LNP' }, 2026, null),
  );
  expect(voiceParty({ party: null }, 2026, defector)).toBe('One Nation');
  expect(voiceParty({ party: null }, 2012, defector)).toBe('Nationals');
  expect(
    voiceParty({ party: null }, 2012, { ...defector, rosterParty: null }),
  ).toBe('One Nation');
  expect(voiceParty({ party: null }, 2026, null)).toBeNull();
  expect(
    voiceParty({ party: ' ' }, 2026, { party: null, rosterParty: null }),
  ).toBeNull();
});

test('no shown voice in any year reads "Party not recorded" while the roster records a party', () => {
  const roll = lookup();
  const misses: string[] = [];
  let filled = 0;
  for (let y = 1998; y <= 2026; y++) {
    const data = year(y);
    for (const voice of yearVoices(data)) {
      const slug = rosterMatch(voice.name, roll.people, roll.slugs);
      if (!slug || voice.party) continue;
      const row = roster.people.find((p) => p.name === voice.name)!;
      const party = voiceParty(voice, y, roll.identity(slug));
      if (party) filled++;
      else if (row.party || row.party_now) misses.push(`${y} ${voice.name}`);
    }
  }
  expect(misses).toEqual([]);
  expect(filled).toBeGreaterThan(20);
  expect(PARTY_NOT_RECORDED).toBe('Party not recorded');
});
