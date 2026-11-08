import { sourceRoute } from '../src/features/ask/AskRows';
import { fromWebPath } from '../src/navigation/external/paths';

jest.mock('../src/api/runtime', () => ({}));

type Source = Parameters<typeof sourceRoute>[0];
const source = (href: string) => ({ href }) as unknown as Source;

test('a cited path opens its native route, with or without a query or fragment', () => {
  const bare = fromWebPath('/bills');
  expect(bare).not.toBeNull();
  expect(sourceRoute(source('/bills'))).toEqual(bare);
  // When the full href has no route, its path alone is tried, with no
  // production origin in the source (qa-static).
  for (const href of ['/bills?utm=x&y=1', '/bills#top', '/bills?x=1#top'])
    expect(sourceRoute(source(href))).toEqual(
      fromWebPath(href) ?? fromWebPath('/bills'),
    );
});

test('an absolute or empty href is not a native route', () => {
  expect(sourceRoute(source('https://example.test/bills'))).toBeNull();
  expect(sourceRoute(source(''))).toBeNull();
});
