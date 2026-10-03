import assert from 'node:assert/strict';

export function assertNoFixtureOrigin(body: Buffer, fixturePort: string) {
  for (const prefix of [
    'http://127.0.0.1',
    'http://localhost',
    'https://127.0.0.1',
    'https://localhost',
  ])
    assert(
      !body.includes(Buffer.from(prefix)),
      'Production bundle has a loopback origin',
    );
  assert(
    !body.includes(Buffer.from(`:${fixturePort}`)),
    'Production bundle contains the configured fixture port',
  );
}
