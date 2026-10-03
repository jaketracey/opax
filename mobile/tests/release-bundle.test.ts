import { assertNoFixtureOrigin } from '../scripts/release-bundle-policy';

test('production bundle rejects the configured non-default fixture port', () => {
  expect(() =>
    assertNoFixtureOrigin(Buffer.from('fixture :8953'), '8953'),
  ).toThrow(/configured fixture port/);
  expect(() =>
    assertNoFixtureOrigin(Buffer.from('release :8910'), '8953'),
  ).not.toThrow();
  expect(() =>
    assertNoFixtureOrigin(Buffer.from('fixture :8910'), '8910'),
  ).toThrow(/configured fixture port/);
  expect(() =>
    assertNoFixtureOrigin(Buffer.from('release https://example.test'), '8953'),
  ).not.toThrow();
});
test.each(['http://127.0.0.1:8999', 'https://localhost:443'])(
  'production bundle rejects any loopback origin: %s',
  (origin) => {
    expect(() => assertNoFixtureOrigin(Buffer.from(origin), '8953')).toThrow(
      /loopback origin/,
    );
  },
);
