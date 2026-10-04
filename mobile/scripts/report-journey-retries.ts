import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { registerRetries, type RegisterRetry } from './journey-retry-policy';

const root = process.argv[2];
if (!root) throw new Error('Expected this run’s evidence directory');
const events: RegisterRetry[] = [];
let logsScanned = 0;
function visit(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.name === 'maestro.log' && basename(directory) === 'logs') {
      logsScanned++;
      events.push(
        ...registerRetries(
          readFileSync(path, 'utf8'),
          relative(root!, dirname(directory)),
        ),
      );
    }
  }
}
visit(root);
writeFileSync(
  join(root, 'retry-audit.json'),
  JSON.stringify(
    { registerRetries: events.length, events, logsScanned },
    null,
    2,
  ) + '\n',
);
console.log(
  `Register retries: ${events.length}; flow logs scanned: ${logsScanned}`,
);
