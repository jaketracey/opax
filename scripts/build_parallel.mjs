import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// These builders read published inputs and write disjoint outputs. The caller
// waits for every child before final asset stamping.
export const INDEPENDENT_BUILDS = {
  social: ['../scripts/build_social_catalog.mjs'],
  'grants-map': ['grants-map/build.mjs'],
  analytics: ['analytics/build.mjs'],
  voice: ['voice/build.mjs'],
};

export async function buildIndependent(run = args => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, {cwd: fileURLToPath(new URL('../portal/', import.meta.url)), stdio: 'inherit'});
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Build failed (${signal || code})`)));
})) {
  const results = await Promise.allSettled(Object.entries(INDEPENDENT_BUILDS).map(async ([name, args]) => {
    await run(args);
    console.log(`Independent build complete: ${name}`);
  }));
  if (results.some(result => result.status === 'rejected')) throw new Error('Independent release build failed; release stopped before stamping.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildIndependent();
