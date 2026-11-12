import { vicElectionFixture } from '../scripts/vic-election-fixture';
import {
  decodeOverview,
  decodeFind,
  decodeSeat,
} from '../src/features/vic-election/decoders';
test('the local fixture serves contract examples and the publication flag', () => {
  const root = '/api/app/v1/vic-election';
  const overview = vicElectionFixture(root, true)!;
  expect(overview.status).toBe(200);
  expect(decodeOverview(overview.body).schema_version).toBe(1);
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
});
