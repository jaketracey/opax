// Every Ask answer a language model wrote carries the visible "Machine-written" label on the web, as it does in the
// iOS app (mobile AnswerView.tsx) and as /support says. An answer no model wrote (a calculated table, passages from
// the record, a decline or a prompt to narrow the question, all fixed wording) does not.
//
// The real runAsk, sendChat, renderChatThread, chatAnswerEl, loadChatSession and modelWrittenAnswer run here against
// the real index.html and the real pill (labels.js). Everything else they reach for is a do-nothing stand-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { machineLabelHTML } from '../public/labels.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../public/app.js');
const source = ts.createSourceFile('app.js', app, ts.ScriptTarget.Latest, true);
const fn = name => source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(source);
const constant = name => source.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(source) === name)).getText(source);
const indexHtml = read('../public/index.html'); // its scripts do not run: the fixture evaluates code from outside only

// A stand-in for anything the fixture does not define: callable, indexable, empty, and not a promise.
const nothing = new Proxy(function () {}, {
  get: (_t, key) => key === 'then' ? undefined : key === Symbol.toPrimitive ? () => '' : key === Symbol.iterator ? function* () {} : key === 'length' ? 0 : nothing,
  apply: () => nothing,
  construct: () => nothing,
});

function fixture(t, { url = 'https://offline.invalid/ask', docked = false } = {}) {
  const dom = new JSDOM(indexHtml, { url, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  if (docked) w.document.documentElement.dataset.chat = 'docked';
  w.Element.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: false });
  const held = Object.create(null);
  // Names app.js declares elsewhere resolve here: what a test or the code assigned, or the stand-in.
  w.__scope = new Proxy({}, {
    has: (_t, key) => typeof key === 'string' && !(key in w),
    get: (_t, key) => typeof key === 'string' ? (key in held ? held[key] : nothing) : undefined,
    set: (_t, key, value) => { held[key] = value; return true; },
  });
  w.__label = machineLabelHTML;
  w.eval(`with (__scope) {
    const spare = {};
    const $ = id => document.getElementById(id) || (spare[id] ||= document.createElement('div'));
    const uiLabels = { machineLabelHTML: __label };
    const machineLabelHTML = opts => uiLabels.machineLabelHTML(opts);
    const renderAnswer = (el, text) => { el.textContent = String(text); };
    const streamSafeText = text => text;
    const researchOf = data => data.research;
    const fixtureImport = async () => ({ chatContext: () => ({ context: [], prior_resources: [] }) });
    const chatIsPage = () => document.documentElement.dataset.chat !== 'docked';
    const liftAway = async () => {};
    const sourceItem = s => Object.assign(document.createElement('li'), { textContent: s.title });
    // A failure inside the real code must fail the test, not pass as an unlabelled answer.
    const setStatus = (_el, message, failed) => { if (failed) window.__failed = String(message); };
    let chatThread = [], chatKind = 'all', chatSpeaker = '', chatBusy = false, chatAbort = null, saDisplayHelpers = null, transcriptNoteHelpers = null;
    let askAbort = null, askSteps = null, lastAsk = null;
    const store = { active: null, chats: [] };
    const activeChat = make => store.chats.find(c => c.id === store.active) || (make ? (store.chats.push({ id: 'new', thread: [] }), store.active = 'new', store.chats.at(-1)) : undefined);
    ${constant('NOT_MODEL_WRITTEN')}
    ${['modelWrittenAnswer', 'renderAnswerOverview', 'streamRenderer', 'revealAskResult', 'runAsk', 'chatAnswerEl', 'renderChatThread', 'trimUnanswered', 'loadChatSession', 'saveChatSession', 'sendChat']
      .map(fn).join('\n').replace(/import\(/g, 'fixtureImport(')}
    window.__ask = async (payload, deltas, during) => {
      askRecord = async (_body, _signal, on) => {
        for (const text of deltas || []) on.delta(text);
        if (during) { await new Promise(resolve => setTimeout(resolve, 0)); during(); }
        return payload;
      };
      await runAsk('Fixture question');
      if (window.__failed) throw new Error(window.__failed);
    };
    window.__restore = thread => {
      store.chats = [{ id: 'saved', kind: 'all', thread }]; store.active = 'saved';
      chatThread = [];
      loadChatSession();
      renderChatThread();
    };
    window.__send = async (payload, deltas, during) => {
      askRecord = async (_body, _signal, on) => {
        for (const text of deltas || []) on.delta(text);
        if (during) { await new Promise(resolve => setTimeout(resolve, 0)); during(); }
        return payload;
      };
      await sendChat('Fixture follow-up');
    };
    window.__modelWritten = modelWrittenAnswer;
    window.__saved = () => chatThread;
  }`);
  const doc = w.document;
  /** Each "Machine-written" label under a root that is not hidden within it, as the words a screen reader meets. */
  const labels = root => [...root.querySelectorAll('.ui-machine > summary')].filter(el => !root.contains(el.closest('[hidden]'))).map(el => el.textContent.replace('✦', '').trim());
  return { w, doc, labels, result: doc.getElementById('ask-result'), thread: doc.getElementById('chat-thread') };
}

/** The label is read once, and before the answer's own words. */
function assertLabelledOnce(f, root, answer) {
  assert.deepEqual(f.labels(root), ['Machine-written']);
  const summary = root.querySelector('.ui-machine > summary');
  assert.ok(summary.compareDocumentPosition(answer) & f.w.Node.DOCUMENT_POSITION_FOLLOWING, 'the label comes before the answer');
  assert.equal(summary.querySelector('.ui-machine-glyph').getAttribute('aria-hidden'), 'true');
}
const kicker = f => f.result.querySelector('.kicker').textContent;
const speech = { resource: 'speech-1', title: 'A speech', cited: true };

const WRITTEN = {
  'overview': { answer: 'An overview of the debate.', is_overview_intent: true, answer_status: 'answered', sources: [speech] },
  'normal researched answer': { answer: 'A researched answer.', answer_status: 'answered', sources: [speech], research: { trail: [{ tool: 'search' }] } },
  'written answer with citations': { answer: 'A written answer [1].', answer_status: 'answered', sources: [speech], citations: { 'speech-1/0': [[0, 20]] } },
  'partly cited answer': { answer: 'A partly cited answer.', answer_status: 'partly_cited', sources: [speech] },
  'uncited answer': { answer: 'An answer with no citations.', answer_status: 'uncited', sources: [speech] },
  'answer from an older payload with no status': { answer: 'An answer.', sources: [speech] },
  'answer the Worker marks model-written': { answer: 'A written answer.', answer_status: 'answered', machine_written: true, sources: [speech] },
  'clarify prompt with a suggested question': { answer: '“and him?” doesn’t say enough to search the record on. Did you mean: What has Alex Example said about housing?', answer_status: 'needs_question', suggested_question: 'What has Alex Example said about housing?', machine_written: true, sources: [] },
  'older clarify prompt with a suggested question and no word from the Worker': { answer: 'That doesn’t say enough to search the record on. Did you mean: What has Alex Example said about housing?', answer_status: 'needs_question', suggested_question: 'What has Alex Example said about housing?', sources: [] },
};
const NOT_WRITTEN = {
  'decline': { answer: '', answered: false, reason: 'no_support', sources: [speech] },
  'calculated money answer': { answer: '| Donor | Total |\n|---|---|\n| A | $1 |', answer_status: 'calculated', money_ranking: { rows: [] }, sources: [speech] },
  'calculated pay answer': { answer: 'The base salary is $1.', answer_status: 'calculated', pay_answer: { rows: [] }, sources: [speech] },
  'transcript-only answer': { answer: 'Passages from the record.', answer_status: 'evidence_only', evidence_excerpts: [], sources: [speech] },
  'records do not cover it': { answer: 'The disclosures do not cover this.', answer_status: 'evidence_gap', sources: [] },
  'choose the scope': { answer: 'Which donor do you mean?', answer_status: 'needs_scope', money_ranking: { rows: [] }, sources: [] },
  'choose the period': { answer: 'Which year do you mean?', answer_status: 'needs_period', sources: [] },
  'blank answer': { answer: '   ', answer_status: 'answered', sources: [speech] },
  'clarify prompt with no suggestion': { answer: 'That doesn’t say enough to search the record on. Ask a full question, naming the person, party or topic you mean.', answer_status: 'needs_question', machine_written: false, sources: [] },
  'identity fact from the roster': { answer: 'Jacqui Lambie is a senator for Tasmania.', answer_status: 'answered', identity_fact: true, machine_written: false, sources: [speech] },
  'party clarification': { answer: 'Which party do you mean? Please name the party directly so I can check the records for your question.', answer_status: 'uncited', machine_written: false, sources: [] },
  'transcript quote lines': { answer: 'Alex Example said on hearing day 3 (5 March 2024): “We did not know.”\n\nThese are from hearing transcripts: evidence, not findings.', answer_status: 'answered', machine_written: false, sources: [speech] },
  'record-summary fallback': { answer: 'Here is what the record shows.\n- Second reading speech, 5 March 2024.', answered: true, fallback: 'record_summary', machine_written: false, sources: [speech] },
  'no-record fallback': { answer: 'OPAX searched Hansard speeches and found no record that answers this question.', answered: true, fallback: 'no_record', machine_written: false, sources: [] },
};

for (const [kind, payload] of Object.entries(WRITTEN)) {
  test(`Ask page, ${kind}: labelled Machine-written, once, before the answer`, async t => {
    const f = fixture(t);
    await f.w.__ask(payload);
    assert.equal(f.result.hidden, false);
    assertLabelledOnce(f, f.result, f.doc.getElementById('ask-answer'));
    assert.equal(f.doc.getElementById('ask-answer').textContent, payload.answer);
    assert.equal(kicker(f), kind === 'uncited answer' ? 'Answer, without citations' : 'Answer', 'the heading keeps its words');
  });
}

for (const [kind, payload] of Object.entries(NOT_WRITTEN)) {
  test(`Ask page, ${kind}: not labelled Machine-written`, async t => {
    const f = fixture(t);
    await f.w.__ask(payload);
    assert.equal(f.result.hidden, false);
    assert.deepEqual(f.labels(f.result), []);
  });
}

test('Ask page, calculated answer under a written overview paragraph: the paragraph is labelled, once', async t => {
  const f = fixture(t);
  await f.w.__ask({ ...NOT_WRITTEN['calculated money answer'], money_overview: 'A written paragraph about the table.' });
  assertLabelledOnce(f, f.result, f.doc.querySelector('#ask-overview > p'));
  assert.equal(f.doc.querySelector('#ask-overview > p').textContent, 'A written paragraph about the table.');
});

test('Ask page, while streaming: the label is there with the first words, and goes if the answer ends as passages', async t => {
  const f = fixture(t);
  let during;
  await f.w.__ask(WRITTEN['normal researched answer'], ['A researched '], () => { during = { labels: f.labels(f.result), hidden: f.result.hidden }; });
  assert.deepEqual(during, { labels: ['Machine-written'], hidden: false });
  assertLabelledOnce(f, f.result, f.doc.getElementById('ask-answer'));
  await f.w.__ask(NOT_WRITTEN['transcript-only answer'], ['A summary that '], () => { during = f.labels(f.result); });
  assert.deepEqual(during, ['Machine-written']);
  assert.deepEqual(f.labels(f.result), [], 'the withdrawn summary takes its label with it');
});

test('shared page: an /ask?q= link runs the same Ask, and a cached answer is labelled on first paint', async t => {
  assert.match(app, /else \{ runAsk\(q\); askedInPlace = onAskPage; \}/, 'the route asks the question in the address');
  const f = fixture(t, { url: 'https://offline.invalid/ask?q=Fixture%20question' });
  await f.w.__ask(WRITTEN['written answer with citations']); // whole, nothing streamed: the generation cache
  assertLabelledOnce(f, f.result, f.doc.getElementById('ask-answer'));
});

const turn = payload => ({ role: 'answer', text: (payload.answer || '').trim() || '(no answer)', ...payload, answer: undefined });
const savedThread = () => [
  { role: 'user', text: 'First question' }, turn(WRITTEN['overview']),
  { role: 'user', text: 'Second question' }, turn(WRITTEN['uncited answer']),
  { role: 'user', text: 'Third question' }, turn(NOT_WRITTEN['calculated money answer']),
  { role: 'user', text: 'Fourth question' }, turn(NOT_WRITTEN['transcript-only answer']),
  { role: 'user', text: 'Fifth question' }, turn(NOT_WRITTEN['decline']),
  { role: 'user', text: 'Sixth question' }, turn(NOT_WRITTEN['blank answer']),
  { role: 'user', text: 'Seventh question' }, turn(WRITTEN['normal researched answer']),
  { role: 'user', text: 'and him?' }, turn(WRITTEN['older clarify prompt with a suggested question and no word from the Worker']),
  { role: 'user', text: 'Ninth question' }, turn(NOT_WRITTEN['identity fact from the roster']),
];

for (const docked of [false, true]) {
  const where = docked ? 'docked assistant' : 'saved conversation restored';
  test(`${where}: each model-written turn is labelled once before its answer, the others are not`, t => {
    const f = fixture(t, { docked });
    f.w.__restore(JSON.parse(JSON.stringify(savedThread())));
    const turns = [...f.thread.querySelectorAll('.chat-turn-answer')];
    assert.equal(turns.length, 9);
    assert.deepEqual(turns.map(el => f.labels(el).length), [1, 1, 0, 0, 0, 0, 1, 1, 0]);
    for (const el of turns.filter(el => f.labels(el).length)) assertLabelledOnce(f, el, el.querySelector('.answer'));
  });

  test(`${where}: a new answer is labelled while it streams and when it lands; a calculated one is not`, async t => {
    const f = fixture(t, { docked });
    let during;
    await f.w.__send(WRITTEN['written answer with citations'], ['A written '], () => { during = f.labels(f.thread); });
    assert.deepEqual(during, ['Machine-written'], 'while streaming');
    const landed = [...f.thread.querySelectorAll('.chat-turn-answer')];
    assert.equal(landed.length, 1);
    assertLabelledOnce(f, landed[0], landed[0].querySelector('.answer'));
    await f.w.__send(NOT_WRITTEN['calculated money answer']);
    await f.w.__send(WRITTEN['clarify prompt with a suggested question']);
    await f.w.__send(NOT_WRITTEN['identity fact from the roster']);
    assert.deepEqual([...f.thread.querySelectorAll('.chat-turn-answer')].map(el => f.labels(el).length), [1, 0, 1, 0]);
    // What was saved carries the Worker's word and the suggestion, so the conversation reopens labelled the same way.
    const saved = JSON.parse(JSON.stringify(f.w.__saved()));
    assert.deepEqual(saved.filter(m => m.role === 'answer').map(m => [m.machine_written, m.suggested_question]), [[undefined, undefined], [undefined, undefined], [true, 'What has Alex Example said about housing?'], [false, undefined]]);
    f.w.__restore(saved);
    assert.deepEqual([...f.thread.querySelectorAll('.chat-turn-answer')].map(el => f.labels(el).length), [1, 0, 1, 0]);
  });
}

test('the condition: the Worker’s word when it gives one, else answered and a written overview, a suggested question or a status that is not fixed wording', t => {
  const { w } = fixture(t);
  for (const [kind, payload] of Object.entries(WRITTEN)) assert.equal(w.__modelWritten(payload, payload.answer), true, kind);
  for (const [kind, payload] of Object.entries(NOT_WRITTEN)) assert.equal(w.__modelWritten(payload, payload.answer), false, kind);
  // Every status the Worker can send is classified, from every file that sets one and every branch of the expression
  // that sets it (a ternary's two arms, a type's alternatives), so a new one cannot pass unclassified.
  const sent = new Set();
  for (const file of readdirSync(new URL('../src/', import.meta.url)).filter(name => /\.(?:ts|mjs)$/.test(name) && !name.endsWith('.d.ts')))
    for (const m of read('../src/' + file).matchAll(/answer_status\??\s*[:=]([^,;{}\n]*)/g))
      for (const literal of m[1].matchAll(/'([a-z_]+)'/g)) sent.add(literal[1]);
  const labelled = ['answered', 'partly_cited', 'uncited', 'reasoned'], unlabelled = ['calculated', 'evidence_only', 'evidence_gap', 'needs_scope', 'needs_period', 'needs_question'];
  assert.deepEqual([...sent].filter(status => !labelled.includes(status) && !unlabelled.includes(status)), []);
  for (const status of ['reasoned', 'answered', 'needs_question', 'evidence_gap']) assert.ok(sent.has(status), status);
  for (const status of labelled) assert.equal(w.__modelWritten({ answer_status: status }, 'Text.'), true, status);
  for (const status of unlabelled) assert.equal(w.__modelWritten({ answer_status: status }, 'Text.'), false, status);
  // The Worker's word wins over the status, either way.
  assert.equal(w.__modelWritten({ answer_status: 'answered', machine_written: false }, 'Text.'), false);
  assert.equal(w.__modelWritten({ answer_status: 'needs_question', machine_written: true }, 'Text.'), true);
  assert.equal(w.__modelWritten({ answered: false, machine_written: true }, 'Text.'), false);
});
