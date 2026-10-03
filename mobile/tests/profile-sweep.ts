// Compare the five profile blocks with both pre-fix round 1 and its approved
// follow-up on identical, immutable public bytes. No historical worktree needed.
import { strictEqual, ok } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { posix, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import snapshot from '../scripts/fixture-snapshot.json';
import { catalogs, people, pinned } from './pinned';
import {
  profileFor,
  joinPerson,
  decodeInterest,
  decodeMoney,
  decodeInterestTies,
  interestKey,
  type PersonId,
} from '../src/api/catalogs';
import { object, matching } from '../src/api/validation';
const root = resolve(__dirname, '../..');
const blocks = ['portrait', 'votes', 'interests', 'pay', 'expenses'] as const;
type Status = 'ready' | 'missing' | 'error';
const rank = { error: 0, missing: 1, ready: 2 };
function statuses(profile: unknown) {
  const data = object(object(profile).blocks);
  return Object.fromEntries(
    blocks.map((key) => [
      key,
      matching(/^(ready|missing|error)$/)(object(data[key]).status),
    ]),
  ) as Record<(typeof blocks)[number], Status>;
}
function historicalSelector(revision: string) {
  const modules = new Map<string, Record<string, unknown>>();
  const load = (path: string): Record<string, unknown> => {
    if (!path.startsWith('mobile/src/api/') || !path.endsWith('.ts'))
      throw new Error('Historical selector import is outside the API modules.');
    const cached = modules.get(path);
    if (cached) return cached;
    const source = execFileSync('git', ['show', `${revision}:${path}`], {
      cwd: root,
      maxBuffer: 1024 * 1024,
    }).toString();
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const module = { exports: {} as Record<string, unknown> };
    modules.set(path, module.exports);
    runInNewContext(
      code,
      {
        module,
        exports: module.exports,
        URL,
        require: (request: string) =>
          load(
            `${posix.normalize(posix.join(posix.dirname(path), request))}.ts`,
          ),
      },
      { timeout: 5000 },
    );
    return module.exports;
  };
  const select = load('mobile/src/api/selectors.ts').profileFor;
  if (typeof select !== 'function')
    throw new Error('Historical profile selector is unavailable.');
  return select as (id: PersonId, data: unknown) => unknown;
}
const baselineSelectors = [
  historicalSelector('6d10a02852c3a318518afa3f49aa32865aaaf69b'),
  historicalSelector('7d2b3be05d9081b585803bbfcdd5d61c7a744eb9'),
];
const input = {
  ...catalogs,
  money: decodeMoney(pinned('/graph/money.json')),
  ties: decodeInterestTies(pinned('/interests/ties-by-donor.json')),
};
const details = new Map<string, ReturnType<typeof decodeInterest>>();
function withInterest(
  id: PersonId,
  select: (id: PersonId, data: unknown) => unknown,
) {
  const initial = object(select(id, input));
  if (typeof initial.interestKey !== 'string') return initial;
  const key = interestKey(initial.interestKey);
  if (!details.has(key)) {
    const bytes = execFileSync(
      'git',
      ['show', `${snapshot.sourceCommit}:portal/public/interests/${key}.json`],
      { cwd: root, maxBuffer: 1024 * 1024 },
    );
    details.set(key, decodeInterest(JSON.parse(bytes.toString())));
  }
  return select(id, { ...input, interest: details.get(key) });
}
const current = people.people.filter((p) =>
  p.electorates.some((s) => s.current),
);
const counts = Object.fromEntries(
  blocks.map((key) => [key, { ready: 0, missing: 0, error: 0 }]),
) as Record<(typeof blocks)[number], Record<Status, number>>;
let comparisons = 0,
  verifiedStatePay = 0;
for (const person of current) {
  const view = profileFor(person.person_id, input);
  const selected = withInterest(person.person_id, (id, data) =>
    profileFor(id, data as typeof input),
  );
  const actual = statuses(selected);
  strictEqual(
    joinPerson(
      view.slug,
      catalogs.slugs,
      catalogs.roster,
      people,
      catalogs.manifest,
    ).canonicalPersonId,
    person.person_id,
  );
  for (const key of blocks) counts[key][actual[key]]++;
  for (const baseline of baselineSelectors) {
    const before = statuses(withInterest(person.person_id, baseline));
    for (const key of blocks) {
      comparisons++;
      ok(
        rank[actual[key]] >= rank[before[key]],
        `${person.name}: ${key} regressed from ${before[key]} to ${actual[key]}`,
      );
    }
  }
  if (person.jurisdiction !== 'federal' && view.blocks.pay.data) {
    ok(
      view.blocks.pay.data.person.pid,
      `${person.name}: state pay must have a verified ID`,
    );
    strictEqual(
      view.blocks.pay.data.person.pid,
      view.blocks.identity.data?.legacyPersonId,
    );
    verifiedStatePay++;
  }
}
console.log(
  JSON.stringify({
    members: current.length,
    comparisons,
    regressions: 0,
    counts,
    verifiedStatePay,
  }),
);
