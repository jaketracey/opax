import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {constants, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {arch, platform, release} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(import.meta.url);
const RECEIPT = '.opax-dependencies.json';
const INSTALL_ARGS = ['ci', '--include=dev', '--no-audit', '--no-fund'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function dependencyKey(portalRoot, toolchain) {
  const inputs = ['package.json', 'package-lock.json', '.npmrc'].map(file =>
    [file, existsSync(join(portalRoot, file)) ? hash(readFileSync(join(portalRoot, file))) : null]);
  return hash(JSON.stringify({inputs, toolchain, install: INSTALL_ARGS, builder: hash(readFileSync(script))}));
}

function currentToolchain(portalRoot) {
  const npm = execFileSync('npm', ['--version'], {cwd: portalRoot, encoding: 'utf8'}).trim();
  // Only installation-shaping settings enter the key. Do not store or print
  // npm's registry credentials or its complete configuration.
  const config = JSON.parse(execFileSync('npm', ['config', 'list', '--json'], {cwd: portalRoot, encoding: 'utf8'}));
  const settings = Object.fromEntries(['install-strategy', 'legacy-peer-deps', 'strict-peer-deps',
    'ignore-scripts', 'bin-links', 'install-links', 'omit', 'include', 'optional',
    'production', 'cpu', 'os', 'libc', 'engine-strict', 'allow-scripts',
    'dangerously-allow-all-scripts', 'strict-allow-scripts', 'allow-git', 'allow-directory'].map(key => [key, config[key] ?? null]));
  const nativeEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    /^(?:CC|CXX|CFLAGS|CXXFLAGS|LDFLAGS|ESBUILD_BINARY_PATH|SHARP_\w+|npm_config_(?:build_from_source|target|arch|platform|nodedir|disturl))$/.test(name)).sort());
  return {node: process.version, npm, abi: process.versions.modules, platform: platform(), arch: arch(),
    osRelease: release(), libc: process.report.getReport().header.glibcVersionRuntime ?? null,
    image: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, settings, nativeEnvironment};
}

export function dependencyInventory(directory) {
  const files = [];
  const walk = current => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name), file = relative(directory, path);
      if (file === RECEIPT) continue;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(path), destination = relative(directory, resolve(dirname(path), target));
        if (destination === '..' || destination.startsWith('../')) throw Error('Dependencies contain an external symlink');
        files.push({file, link: target});
      } else if (stat.isDirectory()) {
        files.push({file, directory: true});
        walk(path);
      } else if (stat.isFile()) files.push({file, mode: stat.mode & 0o777, hash: hash(readFileSync(path))});
      else throw Error('Unsupported dependency file');
    }
  };
  walk(directory);
  return files;
}

function reusable(directory, key) {
  try {
    const receipt = JSON.parse(readFileSync(join(directory, RECEIPT)));
    return receipt.key === key && JSON.stringify(receipt.files) === JSON.stringify(dependencyInventory(directory));
  } catch { return false; }
}

export function prepareDependencies({portalRoot, cacheRoot, toolchain = currentToolchain(portalRoot),
  install = root => execFileSync('npm', INSTALL_ARGS, {cwd: root, stdio: 'inherit'})}) {
  portalRoot = resolve(portalRoot);
  const key = dependencyKey(portalRoot, toolchain), target = join(portalRoot, 'node_modules');
  const saved = cacheRoot ? join(resolve(cacheRoot), key) : null;
  const copy = (from, to) => cpSync(from, to, {recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE});
  let source;
  if (reusable(target, key)) source = 'existing';
  else if (saved && reusable(saved, key)) {
    rmSync(target, {recursive: true, force: true});
    copy(saved, target);
    source = 'cache';
  } else {
    install(portalRoot);
    const receipt = {key, files: dependencyInventory(target)};
    writeFileSync(join(target, RECEIPT), JSON.stringify(receipt) + '\n');
    source = 'install';
  }
  // Copies stay private to the disposable gate. Tests cannot mutate the cache.
  if (saved && source !== 'cache' && !reusable(saved, key)) {
    mkdirSync(dirname(saved), {recursive: true});
    const temp = saved + '.' + process.pid;
    try {
      rmSync(temp, {recursive: true, force: true});
      copy(target, temp);
      rmSync(saved, {recursive: true, force: true});
      renameSync(temp, saved);
    } finally { rmSync(temp, {recursive: true, force: true}); }
  }
  return {key, source};
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  const portalRoot = resolve(process.cwd());
  const toolchain = currentToolchain(portalRoot);
  if (process.argv.includes('--key')) console.log(dependencyKey(portalRoot, toolchain));
  else {
    const result = prepareDependencies({portalRoot, toolchain, cacheRoot: process.env.OPAX_DEPENDENCY_CACHE_DIR});
    console.log(`dependencies: ${result.source} (${result.key.slice(0, 12)}); checksum inventory verified`);
  }
}
