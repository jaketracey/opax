// Node-only start-up for the suites that spawn scripts/fixture-server.ts
// (fixture, voice-fixture, voice-fixture-drift); never imported by app code.
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * The one start-up wait for a spawned fixture server. Start-up takes about
 * 0.5 s on the Mac at load 76 (13 Nov): tsx loads the server and the pinned
 * blobs come from the verified on-disk cache (tests/fixture-bytes.ts). Under
 * gate load the three spawning suites timed out at their old 15 s waits; 30 s
 * is 60 times the idle start and still fails, with the server's output, a
 * server that never prints OPAX_FIXTURE_READY.
 */
export const fixtureStartupTimeout = 30_000;
/** For a hook or test that starts a fixture: the wait plus its own requests. */
export const fixtureHookTimeout = fixtureStartupTimeout + 10_000;

export interface Fixture {
  child: ChildProcess;
  /** Settles once the server is ready; rejects on exit or the start-up wait. */
  ready: Promise<void>;
  log: () => string;
  port: () => number;
  stop: () => Promise<void>;
}

/**
 * Starts the fixture server on an OS-assigned loopback port, never a fixed
 * one (the portal suite binds 8941). `isReady` can wait for more output than
 * the ready line, such as a drift notice printed before it.
 */
export function startFixture(
  env: Record<string, string> = {},
  isReady: (log: string) => boolean = () => true,
): Fixture {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/fixture-server.ts'],
    {
      cwd: resolve(__dirname, '..'),
      env: { ...process.env, ...env, OPAX_FIXTURE_PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  let port = 0;
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Fixture startup timeout after ${fixtureStartupTimeout}ms: ${log}`,
        ),
      );
      child.kill('SIGTERM');
    }, fixtureStartupTimeout);
    const receive = (chunk: Buffer) => {
      log += chunk.toString();
      const line = /OPAX_FIXTURE_READY port=(\d+)/.exec(log);
      if (!line || !isReady(log)) return;
      clearTimeout(timer);
      port = Number(line[1]);
      if (port) resolve();
      else reject(new Error(`Missing OS-assigned fixture port: ${log}`));
    };
    child.stdout!.on('data', receive);
    child.stderr!.on('data', receive);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Fixture exited ${code}: ${log}`));
    });
  });
  // Exits are expected after the test; only startup failures reject.
  ready.catch(() => undefined);
  return {
    child,
    ready,
    log: () => log,
    port: () => port,
    stop: () =>
      child.pid && child.exitCode === null && child.signalCode === null
        ? new Promise<void>((resolve) => {
            child.once('exit', () => resolve());
            child.kill('SIGTERM');
          })
        : Promise.resolve(),
  };
}
