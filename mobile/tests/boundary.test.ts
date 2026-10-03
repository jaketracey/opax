import { unacceptedAdvisories } from '../scripts/advisory-policy';
import { scanSource, secretPattern } from '../scripts/source-boundary';
import { remoteImageURI } from '../src/api/image-policy';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { variant: 'production', apiOrigin: 'https://example.test' },
    },
  },
}));
test.each([
  ['leak.js', `fetch('https://example.test/api/ask')`],
  ['leak.ts', `globalThis['fet' + 'ch']('x')`],
  ['leak.ts', `const Request = XMLHttpRequest; new Request()`],
  ['leak.ts', `new globalThis.WebSocket('x')`],
  ['leak.tsx', `<Image source={{uri: origin + '/og/a'}}/>`],
  ['leak.ts', `File.downloadFileAsync(origin + '/api/search-all?kind=all')`],
  ['leak.mjs', `const Source = EventSource`],
  ['leak.cts', `import View from 'react-native-webview'`],
])('rejects transport planted in %s', (path, content) =>
  expect(scanSource(path, content)).not.toEqual([]),
);
test('remote image expressions must call the imported policy helper', () => {
  expect(
    scanSource(
      'src/photo.tsx',
      `import { remoteImageURI as portrait } from './api/image-policy'; <Image source={{ uri: portrait('/photos/10007.webp') }} />`,
    ),
  ).toEqual([]);
  expect(
    scanSource(
      'src/photo.tsx',
      `const remoteImageURI = x => x; <Image source={{ uri: remoteImageURI('/og/x') }} />`,
    ),
  ).not.toEqual([]);
});
test('only same-origin portrait WebP assets enter the image transport', () => {
  expect(remoteImageURI('/photos/10007.webp')).toBe(
    'https://example.test/photos/10007.webp',
  );
  for (const path of [
    '/og/person.webp',
    '/photos/people.json',
    '/photos/../x.webp',
    '/photos/%2e.webp',
    '//example.test/a.webp',
    '/photos/a.webp?q=x',
  ])
    expect(() => remoteImageURI(path)).toThrow();
});
test('secret signatures cover text files as well as source', () => {
  expect(secretPattern.test(`access_token="${'x'.repeat(32)}"`)).toBe(true);
  expect(secretPattern.test(`ghp_${'x'.repeat(36)}`)).toBe(true);
});

test('acceptance of one advisory cannot hide a new runtime advisory in the same package', () => {
  const accepted = [
    {
      package: 'decoder',
      advisory: 'GHSA-old',
      exposure: 'runtime',
      reason: 'Reviewed',
    },
  ];
  expect(
    unacceptedAdvisories(
      [
        { name: 'decoder', url: 'https://github.com/advisories/GHSA-old' },
        { name: 'decoder', url: 'https://github.com/advisories/GHSA-new' },
      ],
      accepted,
    ),
  ).toEqual([
    { name: 'decoder', url: 'https://github.com/advisories/GHSA-new' },
  ]);
});

test('transport exemptions apply only to the single actual API client', () => {
  expect(scanSource('src/features/api/client.ts', `fetch('x')`)).not.toEqual(
    [],
  );
  expect(
    scanSource(
      'src/photo.tsx',
      `import { Image as Portrait } from 'react-native'; <Portrait source={arbitrarySource} />`,
    ),
  ).not.toEqual([]);
});
