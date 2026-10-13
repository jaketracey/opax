import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// The gate has already generated types. Derive the remaining checks from the
// ordinary script so policy removals or additions have one source of truth.
export function checksAfterTypes(command) {
  const prefix = 'wrangler types && ';
  if (typeof command !== 'string' || !command.startsWith(prefix) || !command.slice(prefix.length).trim()) {
    throw Error('check:built requires check to start with "wrangler types && "');
  }
  return command.slice(prefix.length);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portal = resolve(import.meta.dirname, '../portal');
  const {scripts} = JSON.parse(readFileSync(resolve(portal, 'package.json'), 'utf8'));
  // This is the same committed, trusted shell recipe npm runs for `check`.
  const child = spawn(checksAfterTypes(scripts.check), {cwd: portal, shell: true, stdio: 'inherit'});
  process.exitCode = await new Promise((done, reject) => {child.on('error', reject); child.on('close', code => done(code ?? 1));});
}
