// Whether this build publishes the standing reports: the Worker's own switch,
// REPORTS_ENABLED in portal/wrangler.jsonc, so one line turns the pages, the
// menus, the search catalogue and the crawl files on or off together.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '../portal/node_modules/typescript/lib/typescript.js';
import { reportsEnabled } from '../portal/src/reports-gate.ts';

const repo = fileURLToPath(new URL('../', import.meta.url));

export function reportsPublished(root = repo) {
  const { config, error } = ts.parseConfigFileTextToJson('wrangler.jsonc', readFileSync(join(root, 'portal/wrangler.jsonc'), 'utf8'));
  if (error || !config) throw new Error('portal/wrangler.jsonc could not be read');
  return reportsEnabled(config.vars?.REPORTS_ENABLED);
}
