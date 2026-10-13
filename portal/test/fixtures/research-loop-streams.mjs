// Fixture SSE streams for the research-loop Ask UI (public/ask-steps.js and
// the sources block in public/app.js), in the contract the core lane builds to
// (briefs/research-loop-contract.md, 14 Oct): status events with phase "step"
// carrying the loop's optional tool, round, results and ms; a final payload
// with research { mode, rounds, trail, sources }. Each entry is
// [event, data, waitBeforeMs]. Counts and records are synthetic.

const source = (n, title, speaker, date, extra = {}) => ({
  resource: `research${String(n).padStart(24, '0')}`,
  title, speaker, date, kind: 'speech', state: 'federal', party: 'IND', slug: `speech-research-${n}`,
  url: `/doc/speech-research-${n}`, cited: true,
  snippet: 'The harm is not abstract. It is in every suburb with a club and a row of machines, and this parliament has the power to act on it.',
  ...extra,
});

// The passages the answer cites, as the ordinary Ask sends them.
const SOURCES = [
  source(1, 'Gambling Harm Reduction Bill 2023', 'Andrew Wilkie', '2023-02-15'),
  source(2, 'Online Gambling: Advertising', 'Andrew Wilkie', '2024-06-26'),
];
const CITED_ANSWER = 'Andrew Wilkie has argued for poker machine reform for most of his time in parliament, framing it as harm that falls hardest on poorer suburbs. In 2023 he said that the harm "is not abstract", and that parliament "has the power to act on it". By 2024 his speeches had widened to online betting advertising.';
const citations = {
  [`${SOURCES[0].resource}/t/body/0`]: [[0, 163]],
  [`${SOURCES[1].resource}/t/body/0`]: [[164, CITED_ANSWER.length]],
};

/** Live events for a run: each lookup running, then done (or error). */
function stepEvents(steps, { gap = 240 } = {}) {
  const out = [];
  for (const s of steps) {
    const { ms, results, state = 'done', ...base } = s;
    out.push(['status', { phase: 'step', step: { ...base, state: 'running' } }, gap]);
    out.push(['status', { phase: 'step', step: { ...base, state, ms, ...(state === 'done' && results != null ? { results } : {}) } }, Math.min(ms, 800)]);
  }
  return out;
}
const trailOf = (steps) => steps.map(({ id, tool, label, arg, results, ms, state = 'done' }) => ({
  id, tool, label, ...(arg ? { arg } : {}), ...(state === 'done' && results != null ? { results } : {}), ms, ok: state === 'done',
}));

// Two rounds: the first finds and counts, the second reads and checks votes.
const LOOP_STEPS = [
  { id: 1, round: 1, tool: 'search', label: 'Searching speeches', arg: 'poker machine reform', results: 128, ms: 1240 },
  { id: 2, round: 1, tool: 'find_people', label: 'Finding the member', arg: 'Andrew Wilkie', results: 1, ms: 310 },
  { id: 3, round: 1, tool: 'count_speeches', label: 'Counting by year', arg: 'gambling', results: 14, ms: 640 },
  { id: 4, round: 2, tool: 'read_passage', label: 'Reading a passage', arg: 'Gambling Harm Reduction Bill 2023', results: 1, ms: 220 },
  { id: 5, round: 2, tool: 'member_votes', label: 'Checking votes', arg: 'gambling', results: 12, ms: 410 },
  { id: 6, round: 2, tool: 'read_passage', label: 'Reading a passage', arg: 'Online Gambling: Advertising', results: 1, ms: 380 },
];
// The records the chosen facts came from: two are the cited passages (the
// panel must not list them twice), three are the research's own.
const LOOP_SOURCES = [
  { title: 'Gambling Harm Reduction Bill 2023', url: '/doc/speech-research-1', date: '2023-02-15', kind: 'speech' },
  { title: 'Online Gambling: Advertising', url: '/doc/speech-research-2', date: '2024-06-26', kind: 'speech' },
  { title: 'Interactive Gambling Amendment (Credit Card Ban) Bill 2023 — Third Reading', url: '/divisions/house-2023-11-29-3', date: '2023-11-29', kind: 'division' },
  { title: 'Poker machine harm: second reading debate on a private member’s bill to cap losses per hour and require precommitment cards in every venue', url: '/doc/speech-research-3', date: '2019-09-12', kind: 'speech' },
  { title: 'Community Affairs References Committee: online gambling', url: '/doc/speech-research-4', date: '2023-03-21', kind: 'committee' },
];

// The planner's fixed run (the fallback), with its trail as research.
const PLANNER_STEPS = [
  { id: 1, label: 'Searching speeches', arg: 'gambling reform', ms: 947 },
  { id: 2, label: 'Counting by speaker', arg: 'gambling', ms: 312 },
  { id: 3, label: 'Checking committee hearings', arg: 'gambling', ms: 1180 },
  { id: 4, label: 'Comparing years', arg: '2019 to 2026', ms: 690 },
];
const PLANNER_TOOLS = ['count_speeches', 'count_speeches', 'count_speeches', 'speech_trend'];
const PLANNER_RESULTS = [15, 15, 9, 8];
const COUNT_ANSWER = 'Across every parliament in the record, Andrew Wilkie has made the most chamber speeches labelled gambling (60), followed by two other members (52 and 41). Committee-hearing turns are counted separately. Topic labels cover about 89% of 2020s speeches, so older years are under-counted.';
const FACT_SOURCES = [
  { resource: 'fact-1', slug: '', kind: 'speech', title: 'Andrew Wilkie: 60 speeches labelled gambling', href: '/search?q=gambling&speaker=Andrew%20Wilkie', url: '/search?q=gambling&speaker=Andrew%20Wilkie', snippet: 'Andrew Wilkie: 60 speeches labelled gambling', cited: true },
  { resource: 'coverage', slug: '', kind: 'record', title: 'Source coverage and methods', href: 'https://opax.com.au/methods', url: 'https://opax.com.au/methods', snippet: 'Topic labels cover about 89% of 2020s speeches.', cited: true },
];

// One lookup fails; the loop carries on in one round and still answers.
const ERROR_STEPS = [
  { id: 1, round: 1, tool: 'search', label: 'Searching speeches', arg: 'water buybacks', results: 64, ms: 1110 },
  { id: 2, round: 1, tool: 'member_votes', label: 'Checking votes', arg: 'water', state: 'error', ms: 5000 },
  { id: 3, round: 1, tool: 'find_quotes', label: 'Finding passages to quote', arg: 'Murray–Darling Basin Plan', results: 6, ms: 860 },
];

export const STREAMS = {
  // The research loop, two rounds, a qualitative cited answer streamed.
  loop: {
    question: 'What has Andrew Wilkie said about poker machine reform?',
    events: [
      ['status', { phase: 'searching' }, 120],
      ...stepEvents(LOOP_STEPS),
      ['status', { phase: 'writing' }, 200],
      ['delta', { text: CITED_ANSWER.slice(0, 140) }, 600],
      ['delta', { text: CITED_ANSWER.slice(140) }, 200],
      ['done', {
        answered: true, answer: CITED_ANSWER, citations, sources: SOURCES,
        agentic: { steps: trailOf(LOOP_STEPS).map(({ id, label, arg, ok, ms }) => ({ id, label, arg, state: ok ? 'done' : 'failed', ms })), ms: 13_600 },
        research: { mode: 'loop', rounds: 2, trail: trailOf(LOOP_STEPS), sources: LOOP_SOURCES },
      }, 120],
    ],
  },
  // A failed lookup in a one-round loop: the row says so, the answer arrives.
  error: {
    question: 'What have senators said about water buybacks?',
    events: [
      ['status', { phase: 'searching' }, 120],
      ...stepEvents(ERROR_STEPS),
      ['status', { phase: 'writing' }, 200],
      ['delta', { text: 'Senators have mostly argued about water buybacks as a question of who carries the cost: irrigation towns or the river. ' }, 600],
      ['done', {
        answered: true,
        answer: 'Senators have mostly argued about water buybacks as a question of who carries the cost: irrigation towns or the river.',
        citations: { [`${SOURCES[0].resource}/t/body/0`]: [[0, 118]] }, sources: SOURCES.slice(0, 1).map((s) => ({ ...s, title: 'Water Amendment (Restoring Our Rivers) Bill 2023', speaker: 'Sarah Hanson-Young', party: 'GRN', date: '2023-11-27' })),
        agentic: { steps: [], ms: 8_200 },
        research: { mode: 'loop', rounds: 1, trail: trailOf(ERROR_STEPS), sources: [{ title: 'Murray–Darling Basin Plan: senators’ speeches, 2023', url: '/search?q=Murray-Darling%20Basin%20Plan&chamber=senate', date: '2023-12-01', kind: 'record' }] },
      }, 200],
    ],
  },
  // The planner's run (no tool, round or results on its live events), its
  // trail sent as research with mode "planner".
  planner: {
    question: 'Who is making the most speeches about gambling reform?',
    events: [
      ['status', { phase: 'searching' }, 120],
      ...stepEvents(PLANNER_STEPS),
      ['status', { phase: 'writing' }, 200],
      ['delta', { text: COUNT_ANSWER }, 600],
      ['done', {
        answered: true, answer: COUNT_ANSWER, citations: { 'fact-1/t/body/0': [[0, 120]], 'coverage/t/body/0': [[200, COUNT_ANSWER.length]] }, sources: FACT_SOURCES,
        agentic: { steps: PLANNER_STEPS.map((s) => ({ ...s, state: 'done' })), ms: 11_000 },
        research: { mode: 'planner', rounds: 1, trail: PLANNER_STEPS.map((s, i) => ({ id: s.id, tool: PLANNER_TOOLS[i], label: s.label, arg: s.arg, results: PLANNER_RESULTS[i], ms: s.ms, ok: true })), sources: [] },
      }, 120],
    ],
  },
};
