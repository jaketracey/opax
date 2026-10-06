import { assertAllowedPath, catalogKinds } from '../src/api/policy';
import { assertPortraitPath } from '../src/api/portrait-policy';
import { files, servedFiles } from './pinned';
import {
  personId,
  legacyPersonId,
  billKey,
  interestKey,
  personSlug,
} from '../src/api/ids';
test.each(servedFiles.filter((p) => p.endsWith('.json')))(
  'reviewed fixture GET is allowed: %s',
  (p) => expect(() => assertAllowedPath(p)).not.toThrow(),
);
test.each(catalogKinds)('one explicit P0 search kind is allowed: %s', (kind) =>
  expect(() =>
    assertAllowedPath(`/api/search-all?q=Albanese&kind=${kind}&page=1&per=20`),
  ).not.toThrow(),
);
test.each([
  '/graph/money.json?refresh=1',
  '/interests/ties-by-donor.json',
  '/api/ask',
  '/api/search?q=x&mode=keyword',
  '/api/search-all?q=x&kind=all',
  '/api/search-all?q=x&kind=bill',
  '/api/search-all?q=x&kind=topic',
  '/api/search-all?q=x&kind=party',
  '/api/search-all?q=x&kind=grant',
  '/api/search-all?q=x',
  '/api/search-all?q=x&kind=person&kind=pay',
  '/api/search-all?q=x&kind=person&mode=keyword',
  '/api/search-all?q=x&kind=person&topic=housing',
  '/api/search-all?q=x&kind=person&page=NaN',
  '/api/search-all?q=x&kind=person&per=201',
  '/api/search-all?q=x&kind=person&page=0',
  '/api/search-all?q=x&kind=person&unknown=1',
  '/og/person/x',
  '/og/story/x',
  '/mcp',
  '/api/resource?id=x',
  '/api/brief',
  '/topics.json',
  '/api/topics',
  '/api/daily-post/preview',
  '/bills/../votes.json',
  '/bills/au-federal-r7534.json?nocache=1',
  '/votes.json?',
  '/votes.json#x',
  '/votes.json\n',
  '/%76otes.json',
  '//opax.com.au/votes.json',
  '/electorates/releases/not-a-release/people.json',
  '/electorates/releases/b56417062ccc33cf/reference.json',
  '/interests/n-../../pay.json',
  '/interests/person_123.json',
  '/interests/10007.json?as_at=2026-09-04',
  '/photos/10007.jpg',
  '/photos/jpg/10007.jpg',
  '/photos/../../og/x',
  '/photos/wd-Qfoo.webp',
])('outside reviewed P0 paths is rejected: %s', (p) =>
  expect(() => assertAllowedPath(p)).toThrow(),
);
test('ID types validate separate namespaces at runtime', () => {
  expect(personId('person_2b850aa643795ce8902f754b')).toContain('person_');
  expect(legacyPersonId('10007')).toBe('10007');
  expect(interestKey('n-sandy-bolton')).toBe('n-sandy-bolton');
  expect(billKey('au-federal-alrc-4437')).toBe('au-federal-alrc-4437');
  for (const operation of [
    () => personId('10007'),
    () => legacyPersonId('person_2b850aa643795ce8902f754b'),
    () => personSlug('catalog-2?x'),
    () => billKey('10007'),
  ])
    expect(operation).toThrow();
});
test.each(Object.keys(files).filter((p) => p.endsWith('.webp')))(
  'pinned portrait %s is allowed only by the reviewed WebP policy',
  (path) => {
    expect(() => assertPortraitPath(path)).not.toThrow();
    expect(() => assertAllowedPath(path)).not.toThrow();
  },
);
test.each([
  '/og/person/x',
  '/photos/10007.webp?x=1',
  '/photos/10007.webp#x',
  '/photos/../10007.webp',
  '/photos/%31.webp',
  '/photos/wd-Qfoo.webp',
  '/photos/unknown.webp',
  '//opax.com.au/photos/10007.webp',
  '/votes.json',
])('image policy rejects %s', (path) =>
  expect(() => assertPortraitPath(path)).toThrow(),
);
