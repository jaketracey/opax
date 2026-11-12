import { vicElectionFixture } from '../scripts/vic-election-fixture';
import {
  decodeOverview,
  decodeFind,
  decodeSeat,
} from '../src/features/vic-election/decoders';
test('the local fixture serves portal pins and the publication flag', () => {
  const root = '/api/app/v1/vic-election';
  const overview = vicElectionFixture(root, true)!;
  expect(overview.status).toBe(200);
  expect(decodeOverview(overview.body).schema_version).toBe(1);
  expect(decodeOverview(overview.body).districts).toHaveLength(88);
  expect(decodeOverview(overview.body).regions).toHaveLength(8);
  expect(
    decodeSeat(vicElectionFixture(`${root}/seat/albert-park`, true)!.body).slug,
  ).toBe('albert-park');
  expect(
    decodeFind(vicElectionFixture(`${root}/find?q=St%20Kilda`, true)!.body)
      .split,
  ).toBe(true);
  expect(
    decodeFind(vicElectionFixture(`${root}/find?q=9999`, true)!.body).empty,
  ).toBe('postcode');
  expect(vicElectionFixture(root, false)).toEqual({
    status: 404,
    body: { error: 'not_published' },
  });
  expect(vicElectionFixture(`${root}/seat/missing`, true)).toEqual({
    status: 404,
    body: { error: 'not_found' },
  });
  // The candidates variant shares a slug, but cannot replace the base pin.
  expect(
    decodeSeat(vicElectionFixture(`${root}/seat/albert-park`, true)!.body)
      .candidates,
  ).toBeNull();
  expect(
    vicElectionFixture(`${root}/seat/albert-park-candidates`, true)!.status,
  ).toBe(404);
  expect(
    vicElectionFixture(`${root}/seat/extra/albert-park`, true)!.status,
  ).toBe(404);
  expect(vicElectionFixture(`${root}-other`, true)).toBeNull();
});

test.each(['', '?q=', '?q=Bass&q=allan', '?q=Bass&extra=1'])(
  'invalid finder query %s has the contract error',
  (query) => {
    expect(
      vicElectionFixture(`/api/app/v1/vic-election/find${query}`, true),
    ).toEqual({ status: 400, body: { error: 'invalid_query' } });
  },
);
