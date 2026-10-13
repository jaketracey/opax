// Fixture SSE streams for the stepped Ask UI (public/ask-steps.js), in the
// step-event contract shared with the route lane (13 Oct): status events with
// phase "step" as each lookup starts and ends, "writing" before the answer,
// and done.agentic {steps, ms}. Each entry is [event, data, waitBeforeMs].
// The figures are the gold set's (docs/design/agentic-ask-2026-10.md).

const source = (n, title, speaker, date) => ({
  resource: `fixture${String(n).padStart(26, '0')}`,
  title, speaker, date, kind: 'speech', state: 'federal', slug: `speech-fixture-${n}`,
  url: `/doc/speech-fixture-${n}`, cited: true,
});
const SOURCES = [
  source(1, 'Gaming Machines Amendment Bill', 'Justin Field', '2021-06-22'),
  source(2, 'Online Gambling Harm', 'Andrew Wilkie', '2023-02-15'),
];

const GAMBLING_STEPS = [
  { id: 1, label: 'Searching speeches', arg: 'gambling reform', ms: 947 },
  { id: 2, label: 'Counting by speaker', arg: '4,482 speeches', ms: 312 },
  { id: 3, label: 'Checking committee hearings', arg: 'gambling', ms: 1180 },
  { id: 4, label: 'Comparing years', arg: '2019 to 2026', ms: 690 },
  { id: 5, label: 'Checking votes', arg: 'Interactive Gambling Amendment', ms: 405 },
];
const ANSWER = 'Across every parliament in the record, Justin Field has made the most chamber speeches labelled gambling (87), followed by Andrew Wilkie (60) and Paterson (52). Committee-hearing turns are counted separately: David Pocock leads those with 130. Topic labels cover about 89% of 2020s speeches, so older years are under-counted.';

/** The run as live events: each step running, then done (or failed). */
function stepEvents(steps, { gap = 260, failed = [] } = {}) {
  const out = [];
  for (const s of steps) {
    const { ms, ...base } = s;
    out.push(['status', { phase: 'step', step: { ...base, state: 'running' } }, gap]);
    const state = failed.includes(s.id) ? 'failed' : 'done';
    out.push(['status', { phase: 'step', step: { ...base, state, ms } }, Math.min(ms, 900)]);
  }
  return out;
}
const done = (steps, failed = []) => steps.map(({ id, label, arg, ms }) => ({ id, label, arg, state: failed.includes(id) ? 'failed' : 'done', ms }));

export const STREAMS = {
  // Jake's question, five lookups, then the answer streamed as words.
  gambling: {
    question: 'Who is making the most speeches about gambling reform?',
    events: [
      ['status', { phase: 'searching' }, 120],
      ...stepEvents(GAMBLING_STEPS),
      ['status', { phase: 'writing' }, 200],
      ['delta', { text: ANSWER.slice(0, 120) }, 700],
      ['delta', { text: ANSWER.slice(120) }, 200],
      ['done', { answered: true, answer: ANSWER, citations: {}, sources: SOURCES, agentic: { steps: done(GAMBLING_STEPS), ms: 11_000 } }, 120],
    ],
  },
  // A lookup fails; the plan carries on and the answer still arrives (whole).
  failed: {
    question: 'Which senators have spoken most about gambling since 2022?',
    events: [
      ['status', { phase: 'searching' }, 120],
      ...stepEvents(GAMBLING_STEPS.slice(0, 4), { failed: [3] }),
      ['status', { phase: 'writing' }, 200],
      ['done', { answered: true, answer: 'Since 2022, David Pocock has made the most Senate speeches labelled gambling (4). Federal chamber Hansard from mid-2022 to mid-2025 is thin in the record, so counts in that window understate what was said.', citations: {}, sources: SOURCES.slice(1), agentic: { steps: done(GAMBLING_STEPS.slice(0, 4), [3]), ms: 9_400 } }, 900],
    ],
  },
  // A decline: the record cannot rank NSW speeches by party.
  decline: {
    question: 'Which NSW party has made the most speeches about gambling?',
    events: [
      ['status', { phase: 'searching' }, 120],
      ...stepEvents([
        { id: 1, label: 'Searching speeches', arg: 'gambling in NSW', ms: 820 },
        { id: 2, label: 'Counting by party', arg: 'NSW', ms: 300 },
      ]),
      ['done', { answered: false, reason: 'declined', answer: '', citations: {}, sources: SOURCES.slice(0, 1).map((s) => ({ ...s, cited: false })), agentic: { steps: [
        { id: 1, label: 'Searching speeches', arg: 'gambling in NSW', state: 'done', ms: 820 },
        { id: 2, label: 'Counting by party', arg: 'NSW', state: 'done', ms: 300 },
      ], ms: 4_100 } }, 400],
    ],
  },
  // A cached answer: no step events at all; the line comes from done.agentic.
  cached: {
    question: 'Who is making the most speeches about gambling reform?',
    events: [
      ['status', { phase: 'cached' }, 60],
      ['done', { answered: true, answer: ANSWER, citations: {}, sources: SOURCES, agentic: { steps: done(GAMBLING_STEPS), ms: 11_000 } }, 60],
    ],
  },
  // Normal Ask: no steps, no done.agentic. The emu and its text only.
  normal: {
    question: 'What has been said about pokies in clubs?',
    events: [
      ['status', { phase: 'searching' }, 120],
      ['status', { phase: 'retrieved', sources: SOURCES }, 900],
      ['status', { phase: 'writing' }, 300],
      ['delta', { text: 'Members have raised poker machines in clubs mainly in debates on harm minimisation.' }, 900],
      ['done', { answer: 'Members have raised poker machines in clubs mainly in debates on harm minimisation.', citations: {}, sources: SOURCES }, 200],
    ],
  },
};
