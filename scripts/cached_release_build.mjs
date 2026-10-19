import {createHash} from 'node:crypto';
import {readFile, writeFile, readdir, mkdir, rm, copyFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reportsPublished} from './reports_flag.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
export const CACHED_BUILDS = {
  'passage-names': {script: 'scripts/build_passage_names.mjs', inputs: ['scripts/build_passage_names.mjs', 'portal/public/parliamentarians.json', 'portal/package-lock.json'], outputs: ['portal/src/passage-names.json']},
  crawl: {script: 'scripts/build_crawl_catalog.mjs', inputs: ['scripts', 'portal/src', 'portal/public', 'portal/package-lock.json'], outputs: ['portal/public/crawl', 'portal/public/person-paths.js']},
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (path, roots) => roots.some(root => path === root || path.startsWith(root + '/'));

async function files(root, paths) {
  const result = [];
  const walk = async path => {
    let entries;
    try { entries = await readdir(join(root, path), {withFileTypes: true}); }
    catch (error) {
      if (error.code === 'ENOTDIR') {result.push(path); return;}
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error('Build cache does not accept symlinks');
      if (['node_modules', 'state', '_photos_work'].includes(entry.name)) continue;
      const child = path + '/' + entry.name;
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) result.push(child);
    }
  };
  for (const path of paths) await walk(path);
  return result.sort();
}

export async function buildCacheKey(name, root = repo) {
  const spec = CACHED_BUILDS[name];
  if (!spec) throw new Error('Unknown cached release build');
  const hash = createHash('sha256').update(JSON.stringify({version: 1, name, node: process.version, platform: process.platform, spec}));
  // Crawl has dynamic profile/chunk paths and transitive renderer imports. Use
  // a conservative superset, including earlier generated inputs, rather than
  // risk missing a dependency. Its own outputs must never feed its key.
  const paths = (await files(root, spec.inputs)).filter(path => !inside(path, spec.outputs) && /\.(?:json|[cm]?js|ts|mts|css)$/.test(path));
  for (const path of paths) hash.update(path + '\0').update(digest(await readFile(join(root, path))) + '\n');
  // wrangler.jsonc is not an input file (its epoch moves nightly), but the crawl
  // files follow its reports switch, so a flipped switch is a different build.
  if (name === 'crawl') hash.update(`reports:${reportsPublished(root)}\n`);
  return hash.digest('hex');
}

export async function cachedBuild(name, {root = repo, cacheRoot = process.env.OPAX_RELEASE_CACHE_DIR ? resolve(process.env.OPAX_RELEASE_CACHE_DIR) : undefined, run} = {}) {
  const spec = CACHED_BUILDS[name];
  if (!spec) throw new Error('Unknown cached release build');
  run ||= () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, spec.script)], {cwd: join(root, 'portal'), stdio: 'inherit'});
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Cached builder failed: ${name}`)));
  });
  if (!cacheRoot) {await run(); return {hit: false};}
  const key = await buildCacheKey(name, root), directory = join(resolve(root, cacheRoot), name);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    if (manifest.key !== key || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Cache miss');
    const paths = await files(join(directory, 'files'), spec.outputs);
    if (JSON.stringify(paths) !== JSON.stringify(manifest.files.map(entry => entry.path))) throw new Error('Cache inventory mismatch');
    if (!spec.outputs.every(output => paths.some(path => inside(path, [output])))) throw new Error('Cache output missing');
    for (const {path, hash} of manifest.files) {
      if (path.split('/').includes('..') || !inside(path, spec.outputs) || digest(await readFile(join(directory, 'files', path))) !== hash) throw new Error('Cache checksum mismatch');
    }
  } catch {manifest = null;}
  if (manifest) {
    // Only the declared generated outputs are replaced, at the original build
    // position. Restored assets still pass through final asset stamping.
    for (const path of spec.outputs) await rm(join(root, path), {recursive: true, force: true});
    for (const {path} of manifest.files) {
      await mkdir(dirname(join(root, path)), {recursive: true});
      await copyFile(join(directory, 'files', path), join(root, path));
    }
    console.log(`Release build cache hit: ${name}`);
    return {hit: true, key};
  }
  await run();
  await rm(directory, {recursive: true, force: true});
  await mkdir(directory, {recursive: true});
  const inventory = [];
  for (const path of await files(root, spec.outputs)) {
    const bytes = await readFile(join(root, path));
    inventory.push({path, hash: digest(bytes)});
    await mkdir(dirname(join(directory, 'files', path)), {recursive: true});
    await writeFile(join(directory, 'files', path), bytes);
  }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({key, files: inventory}) + '\n');
  console.log(`Release build cache saved: ${name}`);
  return {hit: false, key};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cachedBuild(process.argv[2]);
