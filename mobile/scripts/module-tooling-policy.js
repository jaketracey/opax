const { dirname, isAbsolute, relative, resolve } = require('node:path');

/** @param {string} path @param {string} [cwd] @param {string} [modulesRoot] */
function isModuleTooling(path, cwd = process.cwd(), modulesRoot = 'modules') {
  const parts = relative(resolve(cwd, modulesRoot), resolve(cwd, path))
    .split('\\')
    .join('/')
    .split('/');
  return parts[0] !== '..' && parts[0] !== '' && parts[1] === 'scripts';
}

/** @param {string} path @param {string} specifier @param {string} [cwd] */
function importsModuleTooling(path, specifier, cwd = process.cwd()) {
  if (specifier.startsWith('.') || isAbsolute(specifier))
    return isModuleTooling(
      resolve(dirname(resolve(cwd, path)), specifier),
      cwd,
    );
  if (specifier.startsWith('@/'))
    return isModuleTooling(resolve(cwd, 'src', specifier.slice(2)), cwd);
  if (isModuleTooling(resolve(cwd, specifier), cwd)) return true;
  // Local modules can also be addressed by their package name/subpath.
  const parts = specifier.split('/');
  const module = parts[0].startsWith('@')
    ? parts.slice(0, 2).join('/')
    : parts[0];
  const subpath = parts.slice(module.startsWith('@') ? 2 : 1).join('/');
  return isModuleTooling(
    resolve(cwd, 'modules', module.split('/').pop(), subpath),
    cwd,
  );
}
module.exports = { isModuleTooling, importsModuleTooling };
