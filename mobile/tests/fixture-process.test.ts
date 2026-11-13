import { fixtureStartupTimeout, startFixture } from './fixture-process';

test('a fixture that never becomes ready fails at the shared start-up wait, with its output', async () => {
  jest.useFakeTimers();
  try {
    const fixture = startFixture({}, () => false);
    await new Promise<void>((resolve) =>
      fixture.child.stdout!.on('data', (chunk: Buffer) => {
        if (String(chunk).includes('OPAX_FIXTURE_READY')) resolve();
      }),
    );
    jest.advanceTimersByTime(fixtureStartupTimeout - 1);
    let settled = false;
    fixture.ready.then(
      () => (settled = true),
      () => (settled = true),
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    jest.advanceTimersByTime(1);
    await expect(fixture.ready).rejects.toThrow(
      new RegExp(
        `^Fixture startup timeout after ${fixtureStartupTimeout}ms: [^]*OPAX_FIXTURE_READY port=[1-9]`,
      ),
    );
    await fixture.stop();
    expect(fixture.child.exitCode ?? fixture.child.signalCode).not.toBeNull();
  } finally {
    jest.useRealTimers();
  }
}, 20_000);
