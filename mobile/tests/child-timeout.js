// A synchronous child process blocks the Jest worker's only thread, so Jest's
// own test and hook timeouts can never fire while it runs: a stuck child
// stalls the whole run (row 97's gate sat 30 minutes in web-router.test.ts).
// Every execFileSync, execSync and spawnSync a suite makes without its own
// `timeout` gets this one, and a timeout fails with the command and the limit
// instead of a bare ETIMEDOUT. Async children (tests/fixture-process.ts) stay
// under Jest's timeouts and their own timers.
//
// Two minutes is generous: the slowest unbounded child takes a few seconds on
// an idle Mac. OPAX_TEST_CHILD_TIMEOUT_MS overrides it for one run.
const childProcess = require('node:child_process');

const patched = Symbol.for('opax.test.child-timeout');
const defaultTimeout =
  Number(process.env.OPAX_TEST_CHILD_TIMEOUT_MS) || 120_000;

function describeCommand(file, args) {
  const words = [file, ...(Array.isArray(args) ? args : [])].map((word) => {
    const text = String(word).replace(/\s+/g, ' ');
    // Keep both ends: a long path still shows its file name.
    return text.length > 100
      ? `${text.slice(0, 40)}...${text.slice(-57)}`
      : text;
  });
  return words.join(' ');
}

function timedOut(error, command, timeout, signal) {
  return Object.assign(
    new Error(
      `Child process timed out after ${timeout / 1000} s and was killed with ${signal}: ${command}`,
      { cause: error },
    ),
    { code: 'ETIMEDOUT', signal },
  );
}

/**
 * Adds the timeout to the options: execSync(command, options?) keeps them
 * second; execFileSync and spawnSync(file, args?, options?) take them second
 * only when no args array is given.
 */
function withTimeout(args, takesArgs) {
  let optionsAt = 1;
  if (takesArgs && (Array.isArray(args[1]) || args[1] == null)) optionsAt = 2;
  const options = args[optionsAt];
  const given = options && typeof options === 'object' ? options : {};
  const ours = given.timeout === undefined || given.timeout === 0;
  const timeout = ours ? defaultTimeout : given.timeout;
  const killSignal = given.killSignal ?? (ours ? 'SIGKILL' : 'SIGTERM');
  const next = [...args];
  while (next.length < optionsAt) next.push(undefined);
  next[optionsAt] = { ...given, timeout, killSignal };
  return { next, ours, timeout, killSignal };
}

if (!childProcess[patched]) {
  childProcess[patched] = true;
  const { execFileSync, execSync, spawnSync } = childProcess;

  childProcess.execFileSync = function (...args) {
    const { next, timeout, killSignal } = withTimeout(args, true);
    try {
      return execFileSync.apply(this, next);
    } catch (error) {
      if (error?.code !== 'ETIMEDOUT') throw error;
      throw timedOut(
        error,
        describeCommand(args[0], next[1]),
        timeout,
        killSignal,
      );
    }
  };

  childProcess.execSync = function (...args) {
    const { next, timeout, killSignal } = withTimeout(args, false);
    try {
      return execSync.apply(this, next);
    } catch (error) {
      if (error?.code !== 'ETIMEDOUT') throw error;
      throw timedOut(error, describeCommand(args[0]), timeout, killSignal);
    }
  };

  childProcess.spawnSync = function (...args) {
    const { next, ours, timeout, killSignal } = withTimeout(args, true);
    const result = spawnSync.apply(this, next);
    if (result.error?.code !== 'ETIMEDOUT') return result;
    const error = timedOut(
      result.error,
      describeCommand(args[0], next[1]),
      timeout,
      killSignal,
    );
    // A suite that set its own timeout reads the result itself; ours throws,
    // since the suite would otherwise only see a null status.
    if (ours) throw error;
    return { ...result, error };
  };
}
