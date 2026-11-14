#!/usr/bin/env node
// "How Parliament works": builds src/features/learn/content.generated.ts from
// the guide's own files in content/learn (chapters, glossary, examples). The
// guide's words belong to the content lane and are fact-checked there: this
// script only reshapes them for the app. It strips fact markers, resolves
// {{term}} links to glossary ids and fails on anything it cannot place.
//
//   node scripts/build-learn-content.mjs          # write the module
//   node scripts/build-learn-content.mjs --check  # fail while it is stale
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

/** The content commit the app's copy of the guide was taken from. */
export const SOURCE_SHA = '39d9d33bc';

const here = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(here, '..');
const CONTENT = join(MOBILE, '..', 'content', 'learn');
const OUT = join(MOBILE, 'src', 'features', 'learn', 'content.generated.ts');

/**
 * The app's typographic apostrophe (tests/typographic-apostrophes.test.ts):
 * "Who's" reads "Who’s", "voters' " reads "voters’ ". Typography only; the
 * guide's words are unchanged.
 */
export function typo(text) {
  return text
    .replace(/([A-Za-z])'([A-Za-z])/g, '$1’$2')
    .replace(/s'(?=[^A-Za-z]|$)/g, 's’');
}

function fail(message) {
  throw new Error(`learn content: ${message}`);
}

function frontmatter(text, file) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) fail(`${file} has no frontmatter`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':');
    if (at < 0) continue;
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  for (const key of ['slug', 'title', 'order', 'summary'])
    if (!meta[key]) fail(`${file} frontmatter has no ${key}`);
  return { meta, body: text.slice(match[0].length) };
}

function termResolver(terms) {
  const exact = new Map();
  const folded = new Map();
  for (const term of terms) {
    exact.set(term.slug, term.slug);
    exact.set(term.term, term.slug);
    folded.set(term.term.toLowerCase(), term.slug);
    folded.set(term.slug.toLowerCase(), term.slug);
  }
  return (shown, where) => {
    const name = shown.replace(/’/g, "'");
    const id = exact.get(name) ?? folded.get(name.toLowerCase());
    if (!id) fail(`${where}: {{${name}}} is not a glossary term`);
    return id;
  };
}

/**
 * Inline text to segments: a plain string, a glossary term `{ t, term }` or
 * a link `{ t, url }`. Fact markers go; the guide's wording stays as written.
 */
function inline(text, resolve, where) {
  const clean = typo(text)
    .replace(/\s*\[\[f:[^\]]+\]\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = [];
  const pattern = /\{\{([^}]+)\}\}|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of clean.matchAll(pattern)) {
    if (match.index > last) parts.push(clean.slice(last, match.index));
    if (match[1]) {
      const [shown, named] = match[1].includes('|')
        ? match[1].split('|')
        : [match[1], match[1]];
      parts.push({ t: shown.trim(), term: resolve(named.trim(), where) });
    } else {
      if (!/^https:\/\//.test(match[3])) fail(`${where}: bad link ${match[3]}`);
      parts.push({ t: match[2], url: match[3] });
    }
    last = match.index + match[0].length;
  }
  if (last < clean.length) parts.push(clean.slice(last));
  if (parts.some((part) => typeof part === 'string' && /[{}[\]]/.test(part)))
    fail(`${where}: unparsed markup in "${clean}"`);
  return parts;
}

function screens(body, resolve, file) {
  return body.split(/\n---screen---\n/).map((raw, index) => {
    const where = `${file} screen ${index + 1}`;
    const text = raw.replace(/<!--[\s\S]*?-->/g, '').trim();
    const heading = /^## (.+)$/m.exec(text);
    if (!heading || !text.startsWith('## '))
      fail(`${where} does not open with a ## heading`);
    const blocks = [];
    for (const chunk of text
      .slice(heading[0].length)
      .trim()
      .split(/\n\s*\n/)) {
      const lines = chunk.split('\n').filter((line) => line.trim());
      if (!lines.length) continue;
      if (lines.every((line) => line.startsWith('- '))) {
        blocks.push({
          kind: 'links',
          items: lines.map((line) => {
            const parts = inline(line.slice(2), resolve, where);
            const [first, ...rest] = parts;
            if (!first || typeof first === 'string' || !('url' in first))
              fail(`${where}: a list item must open with a link`);
            if (typeof rest[0] === 'string')
              rest[0] = rest[0].replace(/^:\s*/, '');
            if (rest[0] === '') rest.shift();
            return { label: first.t, url: first.url, note: rest };
          }),
        });
      } else if (lines.some((line) => /^(#|- |\d+\. |> )/.test(line))) {
        fail(`${where}: unsupported markdown in "${lines[0]}"`);
      } else {
        blocks.push({
          kind: 'p',
          inline: inline(lines.join(' '), resolve, where),
        });
      }
    }
    if (!blocks.length) fail(`${where} is empty`);
    return { heading: typo(heading[1].trim()), blocks };
  });
}

export function readContent(dir = CONTENT) {
  const files = [
    'glossary.json',
    'examples.json',
    ...readdirSync(join(dir, 'chapters'))
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => join('chapters', name)),
  ];
  const raw = Object.fromEntries(
    files.map((name) => [name, readFileSync(join(dir, name), 'utf8')]),
  );
  const hash = createHash('sha256');
  for (const name of files) hash.update(`${name}\0${raw[name]}\0`);
  return { files, raw, digest: hash.digest('hex').slice(0, 16) };
}

export function buildContent({ files, raw, digest }) {
  const glossary = JSON.parse(raw['glossary.json']).terms;
  const examples = JSON.parse(raw['examples.json']).examples;
  const resolve = termResolver(glossary);
  const ids = new Set(glossary.map((term) => term.slug));
  const terms = glossary.map((term) => {
    for (const other of term.see_also ?? [])
      if (!ids.has(other)) fail(`${term.slug} sees unknown term ${other}`);
    return {
      id: term.slug,
      word: typo(term.term),
      short: typo(term.short),
      more: typo(term.more),
      chapter: term.chapter,
      ...(term.example
        ? {
            example: {
              url: term.example.url,
              label: typo(term.example.label),
            },
          }
        : {}),
      seeAlso: term.see_also ?? [],
    };
  });
  const chapters = files
    .filter((name) => name.startsWith('chapters'))
    .map((name) => {
      const { meta, body } = frontmatter(raw[name], name);
      return {
        slug: meta.slug,
        title: typo(meta.title),
        order: Number(meta.order),
        summary: typo(meta.summary),
        screens: screens(body, resolve, name),
      };
    })
    .sort((a, b) => a.order - b.order);
  const chapterSlugs = new Set(chapters.map((chapter) => chapter.slug));
  for (const term of terms)
    if (!chapterSlugs.has(term.chapter))
      fail(`${term.id} names unknown chapter ${term.chapter}`);
  const shown = examples.map((example) => {
    if (!chapterSlugs.has(example.chapter))
      fail(`example ${example.id} names unknown chapter ${example.chapter}`);
    return {
      id: example.id,
      chapter: example.chapter,
      url: example.url,
      label: typo(example.label),
      lookAt: typo(example.look_at),
    };
  });
  const json = (value) => JSON.stringify(value, null, 1);
  return `// GENERATED by scripts/build-learn-content.mjs. Do not edit by hand.
// Source: content/learn at ${SOURCE_SHA} (input sha256 ${digest}).
// The guide's wording is the content lane's: fix it in content/learn and
// regenerate, never here.
import type {
  LearnChapter,
  LearnExample,
  LearnTerm,
} from './content-types';

export const learnSource = {
  sha: '${SOURCE_SHA}',
  digest: '${digest}',
} as const;

export const termIds = ${json(terms.map((term) => term.id))} as const;
export type TermId = (typeof termIds)[number];

export const glossaryTerms: readonly LearnTerm<TermId>[] = ${json(terms)};

export const learnChapters: readonly LearnChapter<TermId>[] = ${json(chapters)};

export const learnExamples: readonly LearnExample[] = ${json(shown)};
`;
}

export async function generated() {
  const source = buildContent(readContent());
  return format(source, {
    ...((await resolveConfig(OUT)) ?? {}),
    parser: 'typescript',
    filepath: OUT,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = await generated();
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(OUT, 'utf8');
    } catch {
      /* missing counts as stale */
    }
    if (current !== text) {
      console.error(
        'src/features/learn/content.generated.ts is stale: run node scripts/build-learn-content.mjs',
      );
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, text);
    console.log(`wrote ${OUT}`);
  }
}
