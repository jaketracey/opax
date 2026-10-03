import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sourceExtensions } from './source-boundary';
import { isModuleTooling } from './module-tooling-policy';

// Native ios/ source belongs to modules and must be read. Skip only generated
// dependency/build directories; never blanket-exclude a module's ios/ folder.
const generated = new Set([
  'node_modules',
  '.git',
  '.build',
  'build',
  'DerivedData',
  'Pods',
  'private',
  'coverage',
  '.expo',
]);
function files(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory())
      return generated.has(entry.name) ? [] : files(join(root, entry.name));
    return [join(root, entry.name)];
  });
}
export function boundaryFiles(sourceRoot = 'src', modulesRoot = 'modules') {
  const sources = files(sourceRoot).filter((path) =>
    sourceExtensions.test(path),
  );
  const modules = files(modulesRoot);
  const tooling = modules.filter((path) =>
    isModuleTooling(path, process.cwd(), modulesRoot),
  );
  const appModules = modules.filter((path) => !tooling.includes(path));
  return {
    javascript: [
      ...sources,
      ...appModules.filter((path) => sourceExtensions.test(path)),
    ],
    tooling,
    swift: modules.filter((path) => path.endsWith('.swift')),
    native: modules.filter((path) =>
      /\.(?:m|mm|c|h|cpp|cc|cxx|hpp|hh|hxx)$/.test(path),
    ),
  };
}
