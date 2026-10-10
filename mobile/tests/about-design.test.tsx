import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import { Catalogs } from '../src/api/catalogs';
import type { ApiClient, RecordResult } from '../src/api/client';
import { dataAsOf } from '../src/api/client';
import {
  Button,
  Disclosure,
  Heading,
  LinkRow,
  Section,
  Text,
} from '../src/design/primitives';
import About from '../src/features/About';
import { openOnWeb } from '../src/navigation/external';
import { pinned } from './pinned';

// Design pass 4D: About is prose under the sheet's one title. No heading
// repeats the title, no section carries an accent mark or an ⓘ, coverage
// ends on its one source line with the details behind disclosures, and the
// web pages are rows.
jest.mock('../src/api/runtime', () => ({ catalogs: { about: jest.fn() } }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/navigation/external', () => ({
  ...jest.requireActual('../src/navigation/external'),
  openOnWeb: jest.fn(),
}));
const client: Pick<ApiClient, 'get'> = {
  async get<T>(
    path: string,
    decode: (input: unknown) => T,
  ): Promise<RecordResult<T>> {
    const raw = pinned(path);
    return {
      data: decode(raw),
      asOf: dataAsOf(raw),
      stale: false,
      savedAt: 200,
    };
  },
};
const fixture = new Catalogs(client);

let renderer: TestRenderer.ReactTestRenderer;
beforeEach(async () => {
  jest.mocked(runtime.about).mockResolvedValue(await fixture.about());
  await act(async () => {
    renderer = TestRenderer.create(<About />);
  });
});
afterEach(() => act(() => renderer.unmount()));
const texts = () =>
  renderer.root
    .findAllByType(Text)
    .flatMap((node) => node.props.children)
    .filter((value) => typeof value === 'string')
    .join('\n');

test('one title: the sheet names the page, so no heading repeats it', () => {
  expect(
    renderer.root
      .findAllByType(Heading)
      .filter((node) => node.props.level === 1),
  ).toEqual([]);
  expect(
    renderer.root
      .findAllByType(Section)
      .map((node) => node.props.title)
      .filter(Boolean),
  ).toEqual([
    'Cultural notice',
    'Coverage',
    'Read the record',
    'Sources and methods',
    'Machine-written text',
    'Corrections and contact',
    'Privacy',
  ]);
  // The independence statement stays on About (D4).
  expect(texts()).toContain('OPAX is independent and non-partisan.');
});

test('prose carries no accent marks and no ⓘ', () => {
  for (const section of renderer.root.findAllByType(Section)) {
    expect(section.props.accent).toBeUndefined();
    expect(section.props.info).toBeUndefined();
  }
});

test('coverage: two figures, one caveat line, the details behind disclosures, no Refresh button', () => {
  expect(texts()).toMatch(
    /Counts describe collected records, not live search totals\./,
  );
  expect(
    renderer.root.findAllByType(Disclosure).map((node) => node.props.label),
  ).toEqual([
    'Record counts',
    'Structured sources',
    'Inclusion and limitations',
  ]);
  // Pull to refresh reads coverage again; nothing drawn asks for it.
  expect(renderer.root.findAllByType(Button)).toEqual([]);
  // Coverage stays dated, one tap from its source.
  expect(
    renderer.root.findByProps({ testID: 'about-coverage-as-at' }),
  ).toBeTruthy();
});

test('web pages are rows that say they leave the app', () => {
  const rows = renderer.root.findAllByType(LinkRow);
  const support = rows.find((node) => node.props.testID === 'about-support')!;
  const privacy = rows.find((node) => node.props.testID === 'about-privacy')!;
  for (const row of [support, privacy]) expect(row.props.external).toBe(true);
  act(() => privacy.props.onPress());
  expect(openOnWeb).toHaveBeenLastCalledWith('/privacy', 'Privacy policy');
  // In-app pages keep their chevron.
  for (const id of ['about-sources-open', 'about-stats', 'about-methods'])
    expect(
      rows.find((node) => node.props.testID === id)!.props.external,
    ).toBeFalsy();
});
