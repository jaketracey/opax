import { apiClient } from '../src/api/runtime';
import { loadRecipientGrant } from '../src/features/money-public/recipient-grant';
import { pinned } from './pinned';

jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
const index = pinned('/graph/grants.federal.json') as any;
const shard = pinned('/grants/federal/shard-04.json') as Record<string, any>;
const recipient = Object.values(shard).find(
  (row) => row.n === 'Fraser Coast Regional Council',
)!;

beforeEach(() => {
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(path.startsWith('/graph/') ? index : shard),
    asOf: null,
    savedAt: 1000,
    stale: false,
  }));
});
test('a recipient award without a program key retains its own value and GrantConnect original', async () => {
  const grant = recipient.grants[0];
  const record = await loadRecipientGrant(
    'federal',
    recipient.id,
    grant.id,
    false,
  );
  expect(record.data.amount).toBe(grant.v);
  expect(record.data.name).toBe('Fraser Coast Regional Council');
  expect(record.data.originals[0]?.url).toBe(
    `https://www.grants.gov.au/Ga/Show/${grant.guid}`,
  );
  expect(jest.mocked(apiClient.get).mock.calls.map(([path]) => path)).toEqual([
    '/graph/grants.federal.json',
    '/grants/federal/shard-04.json',
  ]);
});
test('an unknown award never substitutes a recipient total or another award', async () => {
  await expect(
    loadRecipientGrant('federal', recipient.id, 'not-an-award', false),
  ).rejects.toMatchObject({ code: 'not-found' });
});

test('a recipient award retains the oldest saved date and partial state from both catalogues', async () => {
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(path.startsWith('/graph/') ? index : shard),
    asOf: null,
    savedAt: path.startsWith('/graph/') ? 100 : 1000,
    stale: path.startsWith('/graph/'),
    partial: path.startsWith('/graph/'),
    staleReason: path.startsWith('/graph/') ? 'unreadable' : undefined,
  }));
  const record = await loadRecipientGrant(
    'federal',
    recipient.id,
    recipient.grants[0].id,
    true,
  );
  expect(record).toMatchObject({
    stale: true,
    partial: true,
    savedAt: 100,
    staleReason: 'unreadable',
  });
});

test('an individual recipient has no identifying original link through the recipient shard', async () => {
  const privateRecipient = {
    ...recipient,
    n: 'Fixture Private Recipient',
    k: 'individual',
  };
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(path.startsWith('/graph/') ? index : { fixture: privateRecipient }),
    asOf: null,
    savedAt: 1000,
    stale: false,
  }));
  const record = await loadRecipientGrant(
    'federal',
    recipient.id,
    recipient.grants[0].id,
    false,
  );
  expect(record.data.name).toBe('Individual recipient');
  expect(record.data.originals).toEqual([]);
  expect(record.data.path).toBeNull();
  expect(JSON.stringify(record.data)).not.toContain('Fixture Private Recipient');
});
