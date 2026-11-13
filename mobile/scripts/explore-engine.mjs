// Loads the web's quiz engine (portal/public/quiz.js) from a portal checkout.
// The engine is imported by file URL, so its own relative imports
// (donor-disclosure.js and the rest) resolve beside it, exactly as in the
// browser. A data: URL cannot follow them, which is how the app's deck once
// fell behind the web's figures.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Imports `quiz.js` from `publicRoot` and returns it with its SHA-256. */
export async function loadEngine(publicRoot) {
  const path = resolve(publicRoot, 'quiz.js');
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  const engine = await import(pathToFileURL(path).href);
  for (const name of ['buildRound', 'createRng', 'validateQuestion'])
    if (typeof engine[name] !== 'function')
      throw new Error(`${path} does not export ${name}`);
  return { engine, hash };
}

/**
 * The app has no report screens: a question's report link opens the topic
 * page instead (the inverse of topicReport in src/features/reports/model.ts).
 */
export const REPORT_TOPICS = {
  gambling: 'gambling',
  housing: 'housing',
  climate: 'climate-environment',
  immigration: 'immigration',
  indigenous: 'indigenous-affairs',
  media: 'media-communications',
};

/** Points every report link at its topic page; an unknown report throws. */
export function topicLinks(question) {
  const match = /^\/reports\/([^/?#]+)$/.exec(question.link?.href ?? '');
  if (!match) return question;
  const topic = REPORT_TOPICS[match[1]];
  if (!topic) throw new Error(`No topic page for report ${match[1]}`);
  return {
    ...question,
    link: { ...question.link, href: `/subject/topic/${topic}` },
  };
}

/**
 * The web links a party by its URL slug; the app's party page resolves the
 * party's name. Name the party as its link label does ("Open X in the record").
 */
export function partyLinks(question) {
  if (!/^\/subject\/party\/[^/?#]+$/.test(question.link?.href ?? ''))
    return question;
  const name = /^Open (.+) in the record$/.exec(question.link.label)?.[1];
  if (!name) throw new Error(`No party name in "${question.link.label}"`);
  return {
    ...question,
    link: {
      ...question.link,
      href: `/subject/party/${encodeURIComponent(name)}`,
    },
  };
}

/** Templates Today's question may use (see src/features/explore/README.md). */
export const FRONT_PAGE_TEMPLATES = new Set([
  'words-topic-higher-lower',
  'words-topic-figure',
  'words-year-order',
  'words-peak-year',
  'words-portrait-topic',
  'words-year-voice',
  'words-biggest-source',
  'words-record-true-false',
  'money-party-peak-year',
  'money-party-from-industry',
  'money-true-false',
]);

/** The same FNV-1a id as quizId in src/features/explore/quiz-model.ts. */
export function questionId(q) {
  const text = `${q.template}\n${q.prompt}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `q${hash.toString(16).padStart(8, '0')}`;
}

/** Today's deck: each eligible question in the rounds once, sorted by id. */
export function frontPageDeck(rounds) {
  const derived = new Map();
  for (const deck of ['mixed', 'money', 'words'])
    for (const round of rounds[deck])
      for (const q of round) {
        const id = questionId(q);
        if (FRONT_PAGE_TEMPLATES.has(q.template) && !derived.has(id))
          derived.set(id, { id, ...q });
      }
  return [...derived.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}
