import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const [destination, root] = process.argv.slice(2);
if (!destination || !root)
  throw new Error('Expected destination and Maestro artifact directory');
mkdirSync(destination, { recursive: true });
let count = 0;
function visit(directory: string, namedScreenshot = false): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      visit(path, namedScreenshot || entry.name === 'takeScreenshot');
    else if (namedScreenshot && entry.name.endsWith('.png')) {
      copyFileSync(path, join(destination!, basename(path)));
      count++;
    }
  }
}
visit(root);
console.log(`Collected ${count} named Maestro screenshots in ${destination}`);
