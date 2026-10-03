import { readFileSync } from 'node:fs';
import { secretPattern } from './source-boundary';

export function scanSecrets(paths: Iterable<string>): string[] {
  return [...new Set(paths)].filter((path) => {
    const body = readFileSync(path);
    return !body.includes(0) && secretPattern.test(body.toString());
  });
}
