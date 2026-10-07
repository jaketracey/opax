import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import * as runtime from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import { Text } from '../src/design/primitives';
import { SourcesScreen } from '../src/features/sources/SourcesScreen';
import { datasets } from '../src/features/sources/datasets';
import { catalogs as pinnedCatalogs, pinned } from './pinned';

jest.mock('../src/api/runtime', () => ({
  portraits: { list: jest.fn() },
  catalogs: {
    expenses: jest.fn(),
    expenseCategories: jest.fn(),
    pay: jest.fn(),
    directory: jest.fn(),
    discovery: jest.fn(),
    about: jest.fn(),
  },
}));
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      fontAcknowledgements: [
        { name: 'Merriweather', notice: 'Copyright Merriweather.\n\nOFL.' },
      ],
    },
  },
}));
jest.mock('../src/navigation/external', () => ({
  openSource: jest.fn(),
  openOnWeb: jest.fn(),
}));

const mock = runtime as jest.Mocked<typeof runtime>;
const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .flatMap((n) => n.props.children)
    .filter((v) => typeof v === 'string')
    .join(' ');
const press = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  act(async () =>
    r.root
      .findAll(
        (n) =>
          n.props.testID === testID && typeof n.props.onPress === 'function',
      )[0]!
      .props.onPress(),
  );

const official = c.portraitFor(
  ['Anthony Albanese'],
  pinnedCatalogs.photoPeople!,
  pinnedCatalogs.photoCredits!,
  '10007',
);
const commons = c.portraitFor(
  ['Sheena Watt'],
  pinnedCatalogs.photoPeople!,
  pinnedCatalogs.photoCredits!,
)!;

beforeEach(() => {
  for (const fn of Object.values(mock.catalogs))
    (fn as jest.Mock).mockRejectedValue(new Error('not in this test'));
  jest.mocked(mock.portraits!.list).mockResolvedValue([
    ...(official
      ? [
          {
            slug: 'anthony-albanese',
            name: 'Anthony Albanese',
            info: official,
          },
        ]
      : []),
    { slug: 'sheena-watt', name: 'Sheena Watt', info: commons },
  ]);
});

test('every dataset keeps its publisher, licence and terms in one place', async () => {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<SourcesScreen />);
  });
  for (const dataset of datasets) {
    expect(texts(r)).toContain(dataset.name);
    await press(r, `sources-dataset-${dataset.id}`);
    expect(texts(r)).toContain(dataset.publisher);
    for (const term of dataset.terms) expect(texts(r)).toContain(term);
  }
  // Licences the record screens used to print inline.
  for (const licence of ['ODbL', 'CC BY 4.0', 'CC BY 3.0 AU', 'CC BY-NC-ND'])
    expect(texts(r)).toContain(licence);
  await act(async () => r.unmount());
});

test('portrait credits are listed and searchable, Commons crops said so', async () => {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<SourcesScreen />);
  });
  expect(texts(r)).toContain('Sheena Watt');
  expect(texts(r)).toContain(
    `${commons.credit} · ${commons.licence}, via Wikimedia Commons, cropped`,
  );
  await act(async () =>
    r.root
      .find(
        (n) =>
          n.props.testID === 'sources-portrait-search' &&
          typeof n.props.onChangeText === 'function',
      )
      .props.onChangeText('Watt'),
  );
  expect(texts(r)).toContain('Sheena Watt');
  expect(texts(r)).not.toContain('Anthony Albanese');
  await press(r, 'sources-font-Merriweather');
  expect(texts(r)).toContain('Copyright Merriweather.');
  await act(async () => r.unmount());
});

test('central sources preserve every held money-map attribution and reuse term', () => {
  const all = JSON.stringify(datasets);
  expect(all).toContain(
    'AEC disclosure returns as aggregated in the money map · CC BY 4.0',
  );
  for (const suffix of ['', '.qld', '.vic', '.tas']) {
    const graph = pinned(`/graph/money${suffix}.json`) as {
      meta: Record<string, string>;
    };
    for (const key of ['licence', 'grants_source', 'contracts_source']) {
      if (graph.meta[key]) expect(all).toContain(graph.meta[key]);
    }
    if (graph.meta.source_url) expect(all).toContain(graph.meta.source_url);
  }
});
