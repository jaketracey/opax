import fixtures from '../scripts/fixtures/records/contracts.json';
import { Records } from '../src/features/records/data';
import { decodeDocument } from '../src/features/records/model';
import { assertAllowedPath } from '../src/api/policy';

const speech = decodeDocument(
  fixtures.responses['/api/resource/speech-1205524'],
);
const result = (slug: string) => ({
  slug,
  title: 'Example speech',
  date: '2024-03-27',
  speaker: null,
});

test('similar speeches uses bounded keyword retrieval and the Search deadline in one GET', async () => {
  const get = jest.fn(async (path, decode) => {
    assertAllowedPath(path);
    return {
      data: decode({
        results: [
          result(speech.slug),
          result('speech-1'),
          result('speech-1'),
          result('speech-2'),
        ],
      }),
      savedAt: 1,
    };
  });
  const records = new Records({ get } as never);
  const first = await records.similar(speech, new Set(['gambling']));
  expect(first.data.map((row) => row.slug)).toEqual(['speech-1', 'speech-2']);
  const params = new URLSearchParams(get.mock.calls[0]![0].split('?')[1]);
  expect(Object.fromEntries(params)).toMatchObject({
    kind: 'speech',
    per: '6',
    top_k: '20',
    mode: 'keyword',
    topic: 'gambling',
  });
  expect(get).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Function),
    false,
    expect.objectContaining({
      timeoutMs: 15000,
      signal: expect.any(AbortSignal),
    }),
  );
  await records.similar(speech, new Set(['gambling']));
  expect(get).toHaveBeenCalledTimes(1);
});

test.each([[[]], [[result(speech.slug)]]])(
  'a successful empty or self-only retrieval is empty, not an error',
  async (results) => {
    const get = jest.fn(async (_path, decode) => ({
      data: decode({ results }),
      savedAt: 1,
    }));
    const records = new Records({ get } as never);
    expect((await records.similar(speech, new Set())).data).toEqual([]);
  },
);

test('a failed similar read is not retried until another explicit action', async () => {
  const get = jest
    .fn()
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockImplementation(async (_path, decode) => ({
      data: decode({ results: [] }),
      savedAt: 1,
    }));
  const records = new Records({ get } as never);
  await expect(records.similar(speech, new Set())).rejects.toThrow(
    'Unavailable',
  );
  expect(get).toHaveBeenCalledTimes(1);
  expect((await records.similar(speech, new Set())).data).toEqual([]);
  expect(get).toHaveBeenCalledTimes(2);
});
