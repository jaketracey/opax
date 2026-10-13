import test from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {dependencyKey, dependencyInventory, prepareDependencies} from '../../scripts/gate_dependencies.mjs';

const toolchain = {node: 'v24.fixture', npm: '11.fixture', abi: 'fixture', platform: 'darwin', arch: 'arm64', settings: {}};
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'opax-dependencies-test-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const cacheRoot = join(root, 'cache');
  const portal = name => {
    const path = join(root, name);
    mkdirSync(path);
    writeFileSync(join(path, 'package.json'), '{"devDependencies":{"fixture":"1.0.0"}}');
    writeFileSync(join(path, 'package-lock.json'), '{"lockfileVersion":3,"fixture":"1.0.0"}');
    return path;
  };
  let installs = 0;
  const install = path => {
    installs++;
    const modules = join(path, 'node_modules');
    rmSync(modules, {recursive: true, force: true});
    mkdirSync(join(modules, 'fixture'), {recursive: true});
    mkdirSync(join(modules, '.bin'));
    writeFileSync(join(modules, 'fixture/cli'), 'fixture bytes\n', {mode: 0o755});
    symlinkSync('../fixture/cli', join(modules, '.bin/fixture'));
  };
  return {portal, cacheRoot, install, installs: () => installs};
}

test('unchanged inputs reuse exact dependency bytes without reinstalling, with isolated copies', t => {
  const f = fixture(t), first = f.portal('first'), second = f.portal('second');
  const build = portalRoot => prepareDependencies({...f, portalRoot, toolchain});
  assert.equal(build(first).source, 'install');
  const original = dependencyInventory(join(first, 'node_modules'));
  assert.equal(build(first).source, 'existing');
  assert.equal(build(second).source, 'cache');
  assert.equal(f.installs(), 1);
  assert.deepEqual(dependencyInventory(join(second, 'node_modules')), original);
  assert.equal(statSync(join(second, 'node_modules/fixture/cli')).mode & 0o777, 0o755);
  writeFileSync(join(second, 'node_modules/fixture/cli'), 'fixture mutation\n');
  assert.equal(readFileSync(join(first, 'node_modules/fixture/cli'), 'utf8'), 'fixture bytes\n');
  assert.equal(build(second).source, 'cache');
  assert.equal(f.installs(), 1);
  assert.deepEqual(dependencyInventory(join(second, 'node_modules')), original);
});

test('lockfile, manifest, npm config and every toolchain component invalidate reuse', t => {
  const f = fixture(t), portalRoot = f.portal('portal');
  const key = dependencyKey(portalRoot, toolchain);
  for (const field of ['node', 'npm', 'abi', 'platform', 'arch', 'libc', 'osRelease', 'imageVersion', 'settings']) {
    assert.notEqual(dependencyKey(portalRoot, {...toolchain, [field]: 'changed'}), key, field);
  }
  for (const file of ['package.json', 'package-lock.json', '.npmrc']) {
    const original = file === '.npmrc' ? null : readFileSync(join(portalRoot, file));
    writeFileSync(join(portalRoot, file), 'changed');
    assert.notEqual(dependencyKey(portalRoot, toolchain), key, file);
    if (original) writeFileSync(join(portalRoot, file), original);
    else rmSync(join(portalRoot, file));
  }
  prepareDependencies({...f, portalRoot, toolchain});
  assert.equal(prepareDependencies({...f, portalRoot, toolchain: {...toolchain, npm: 'new'}}).source, 'install');
  assert.equal(f.installs(), 2);
});

test('damaged, partial or executable-mode-changed caches force a fresh install', t => {
  const f = fixture(t), portalRoot = f.portal('portal');
  const {key} = prepareDependencies({...f, portalRoot, toolchain});
  const saved = join(f.cacheRoot, key);
  writeFileSync(join(saved, 'fixture/cli'), 'damaged');
  rmSync(join(portalRoot, 'node_modules'), {recursive: true});
  assert.equal(prepareDependencies({...f, portalRoot, toolchain}).source, 'install');
  assert.equal(f.installs(), 2);
  rmSync(join(saved, '.opax-dependencies.json'));
  rmSync(join(portalRoot, 'node_modules'), {recursive: true});
  assert.equal(prepareDependencies({...f, portalRoot, toolchain}).source, 'install');
  assert.equal(f.installs(), 3);
  chmodSync(join(saved, 'fixture/cli'), 0o644);
  rmSync(join(portalRoot, 'node_modules'), {recursive: true});
  assert.equal(prepareDependencies({...f, portalRoot, toolchain}).source, 'install');
  assert.equal(f.installs(), 4);
});

test('failed installs cannot leave a reusable receipt or cache', t => {
  const f = fixture(t), portalRoot = f.portal('portal');
  assert.throws(() => prepareDependencies({...f, portalRoot, toolchain, install() {throw Error('fixture failure');}}), /fixture failure/);
  assert.equal(prepareDependencies({...f, portalRoot, toolchain}).source, 'install');
});
