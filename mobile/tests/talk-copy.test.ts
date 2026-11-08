import {
  endCopy,
  failureCopy,
  talkCopy,
  voiceTime,
  voiceTimeSpoken,
} from '../src/features/talk/model';
import { sourceKind, sourceMeta } from '../src/features/talk/sources';

// Talk's words, pinned as specs/account.md 7.6 and 7.7 print them.
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function')
    return [String((value as (arg: unknown) => string)('Fixture'))];
  if (value && typeof value === 'object')
    return Object.values(value).flatMap(strings);
  return [];
}
const all = [failureCopy, endCopy, talkCopy].flatMap(strings);

test('the house rules: no "Microphone off", typographic quotes, no em dash', () => {
  for (const text of all) {
    expect([text, text.includes('Microphone off')]).toEqual([text, false]);
    expect([text, /['"]/.test(text)]).toEqual([text, false]);
    expect([text, text.includes('\u2014')]).toEqual([text, false]);
  }
});

test('no "Try again." inside a sentence', () => {
  for (const text of all)
    expect([text, /Try again\.\s+\S/.test(text)]).toEqual([text, false]);
});

test('status, controls and the primary actions', () => {
  expect(Object.values(talkCopy.status)).toEqual([
    'Checking voice',
    'Ready to talk',
    'Connecting',
    'Listening',
    'Thinking',
    'OPAX is speaking',
    'Muted',
    'Ending the call',
  ]);
  expect(Object.values(talkCopy.controls)).toEqual([
    'Mute',
    'Type',
    'Sources',
    'End',
  ]);
  expect(
    [
      talkCopy.start,
      talkCopy.startAgain,
      talkCopy.signIn,
      talkCopy.askInstead,
      talkCopy.tryAgain,
      talkCopy.openSettings,
    ].join(' · '),
  ).toBe(
    'Start · Start again · Sign in · Ask instead · Try again · Open Settings',
  );
  expect(talkCopy.composer).toBe('Type to OPAX');
  expect(talkCopy.disclosure).toBe(
    'AI voice by ElevenLabs. It can be wrong, so check the sources.',
  );
  expect(talkCopy.freeMinutes(10)).toBe(
    'A free OPAX account includes 10 minutes of voice.',
  );
  expect(talkCopy.example('Which bills passed?')).toBe(
    'Try “Which bills passed?”',
  );
});

test('failures share their sentences', () => {
  expect(failureCopy.signedOut).toBe('Talk needs a free OPAX account.');
  for (const key of [
    'network',
    'timeout',
    'policy',
    'invalidResponse',
    'cancelled',
  ] as const)
    expect(failureCopy[key]).toBe(
      'Couldn’t connect. Check your connection and try again.',
    );
  for (const key of [
    'forbidden',
    'unavailable',
    'unsupportedFormat',
    'queueOverflow',
    'deletionVerificationFailed',
  ] as const)
    expect(failureCopy[key]).toBe(
      'Something went wrong with voice. Try again.',
    );
  expect(endCopy.deadline).toBe(endCopy.callLimit);
  expect(endCopy.network).toBe('The call dropped.');
});

test('voice time: one formatter, whole minutes never rounded up', () => {
  const at = (remainingSeconds: number, unlimited = false) => ({
    remainingSeconds,
    unlimited,
  });
  expect(voiceTime(at(599))).toBe('9 min left');
  expect(voiceTime(at(60))).toBe('1 min left');
  expect(voiceTime(at(59))).toBe('59 sec left');
  expect(voiceTime(at(0))).toBe('No minutes left');
  expect(voiceTime(at(0, true))).toBe('Unlimited');
  expect(voiceTimeSpoken(at(599))).toBe('9 minutes left');
  expect(voiceTimeSpoken(at(60))).toBe('1 minute left');
  expect(voiceTimeSpoken(at(1))).toBe('1 second left');
});

test('a source never silently drops its date', () => {
  expect(sourceMeta({ title: 'Fixture', path: '/bill/fixture' })).toBe(
    'Bill · Date not published',
  );
  expect(sourceKind('/divisions/fixture')).toBe('Division');
  expect(sourceKind('/somewhere/else')).toBe('Record');
  expect(
    sourceMeta({ title: 'Fixture', path: '/bill/fixture', date: '2026-09-17' }),
  ).toMatch(/^Bill · .*2026/);
});
