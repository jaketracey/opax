import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isProceduralDivision, PROCEDURAL_TITLES_PATH} from '../public/vote-tables.js';

/** Titles only, without members or question text. Older bill exports omit the title.
 * Rebuilt from published files at release, using the same rule as both renderers. */
export function proceduralTitles(root = new URL('../public/', import.meta.url)) {
  const titles = {};
  for (const file of readdirSync(new URL('divisions/', root)).filter(f => /^division-.*\.json$/.test(f)).sort()) {
    const division = JSON.parse(readFileSync(new URL(`divisions/${file}`, root), 'utf8'));
    const title = division.title || division.name || '';
    if (isProceduralDivision(title)) titles[division.key] = title;
  }
  return titles;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = new URL(`../public${PROCEDURAL_TITLES_PATH}`, import.meta.url);
  const output = JSON.stringify(proceduralTitles()) + '\n';
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== output) throw new Error('Procedural division titles are stale. Run npm run build:procedural-titles.');
  } else writeFileSync(target, output);
}
