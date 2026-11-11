import {
  applyEvent,
  emptySnapshot,
  recoverSnapshot,
  type TalkSnapshot,
} from '../src/features/talk/model';
import type { TranscriptTurn, VoiceEvent } from '../src/voice';

const bill = { title: 'Gambling Reform Bill', path: '/bill/gambling' };
const person = { title: 'David Pocock', path: '/subject/person/david-pocock' };
const division = { title: 'Division 42', path: '/doc/division-42' };
const question: TranscriptTurn = {
  role: 'user',
  id: 1,
  text: 'What happened?',
};
const first: TranscriptTurn = {
  role: 'agent',
  id: 1,
  text: 'The bill passed.',
};
const secondQuestion: TranscriptTurn = {
  role: 'user',
  id: 2,
  text: 'How many votes?',
};
const second: TranscriptTurn = { role: 'agent', id: 2, text: '11 ayes.' };
const reduce = (...events: VoiceEvent[]) =>
  events.reduce(applyEvent, emptySnapshot);

test('attaches sources before text to the next answer, including matching user/agent IDs', () => {
  const pending = reduce(
    { type: 'transcript', turns: [question] },
    { type: 'sources', sources: [bill] },
  );
  expect(pending.sourceTurns).toEqual({ [bill.path]: null });
  const answered = applyEvent(pending, {
    type: 'transcript',
    turns: [question, first],
  });
  expect(answered.sourceTurns).toEqual({ [bill.path]: first.id });
});

test('new arrivals attach to the current answer, cumulative repeats and corrections keep ownership', () => {
  const snapshot = reduce(
    { type: 'transcript', turns: [question, first] },
    { type: 'sources', sources: [bill, person] },
    { type: 'transcript', turns: [question, first, secondQuestion] },
    { type: 'sources', sources: [bill, person, division] },
    { type: 'transcript', turns: [question, first, secondQuestion, second] },
    { type: 'sources', sources: [bill, person, division] },
    {
      type: 'transcript',
      turns: [
        question,
        { ...first, text: 'Corrected answer.' },
        secondQuestion,
        second,
      ],
    },
  );
  expect(snapshot.sourceTurns).toEqual({
    [bill.path]: 1,
    [person.path]: 1,
    [division.path]: 2,
  });
});

test('a working opener is still the current agent turn for arrival attribution', () => {
  const snapshot = reduce(
    {
      type: 'transcript',
      turns: [question, { ...first, text: 'Let me check the record.' }],
    },
    { type: 'sources', sources: [bill] },
    { type: 'transcript', turns: [question, first] },
  );
  expect(snapshot.sourceTurns?.[bill.path]).toBe(1);
});

test('a new call clears attribution even when it returns the same sources', () => {
  const snapshot = reduce(
    { type: 'transcript', turns: [question, first] },
    { type: 'sources', sources: [bill] },
    { type: 'transcript', turns: [] },
    { type: 'sources', sources: [] },
    { type: 'sources', sources: [bill] },
    { type: 'transcript', turns: [secondQuestion, second] },
  );
  expect(snapshot.sourceTurns).toEqual({ [bill.path]: 2 });
});

test('snapshot recovery preserves known associations and leaves unobserved sources in the sheet only', () => {
  const current: TalkSnapshot = reduce(
    { type: 'transcript', turns: [question, first] },
    { type: 'sources', sources: [bill] },
  );
  const recovered = recoverSnapshot(
    current,
    {
      ...emptySnapshot,
      transcript: [question, first],
      sources: [bill, person],
    },
    new Set(),
  );
  expect(recovered.sourceTurns).toEqual({ [bill.path]: 1 });
  expect(recovered.sourceTurns?.[person.path]).toBeUndefined();
});
