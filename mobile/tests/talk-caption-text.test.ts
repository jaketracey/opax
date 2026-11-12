import { captionText, workingCaption } from '../src/features/talk/caption-text';

const agent = (text: string) => captionText({ role: 'agent', text });
const user = (text: string) => captionText({ role: 'user', text });

test.each([
  ['twenty twenty-six', '2026'],
  ['August twenty twenty-six', 'August 2026'],
  ['August nineteen twenty twenty-six', '19 August 2026'],
  ['August nineteenth, twenty twenty-six', '19 August 2026'],
  ['August 19, 2026', '19 August 2026'],
  ['the nineteenth of August', '19 August'],
  ['nineteen August twenty twenty-six', '19 August 2026'],
  ['the twenty-first of May twenty twenty-five', '21 May 2025'],
  ['December thirty-one two thousand and twenty-six', '31 December 2026'],
  ['nineteen ninety-nine and two thousand and nine', '1999 and 2009'],
  ['19 August 2026', '19 August 2026'],
  ['February twenty-nine twenty twenty-four', '29 February 2024'],
  ['eleven ayes and twenty-four noes', '11 ayes and 24 noes'],
  ['Eleven ayes and twenty-four noes', '11 ayes and 24 noes'],
  [
    'Twenty-four votes were cast by the group.',
    '24 votes were cast by the group.',
  ],
  ['one aye, two noes and nine votes', '1 aye, 2 noes and 9 votes'],
  ['one hundred and twenty-four votes', '124 votes'],
  ['two point five million dollars', '$2.5 million'],
  ['Two point five million dollars', '$2.5 million'],
  ['five dollars and twenty-five cents', '$5 and 25 cents'],
  ['three hundred thousand dollars', '$300000'],
  ['two billion dollars', '$2 billion'],
  ['two point five per cent and eleven percent', '2.5% and 11%'],
  ['Five per cent', '5%'],
  ['three kilometres in two hours', '3 kilometres in 2 hours'],
  [
    'eleven senators supported two amendments',
    '11 senators supported two amendments',
  ],
  ['one no and three votes', '1 no and 3 votes'],
])('writes figures conservatively: %s', (spoken, written) => {
  expect(agent(spoken)).toBe(written);
});

test.each([
  'One amendment and two related bills have nine supporters.',
  'Senator David Pocock and Senator Barbara Pocock spoke with Penny Wong.',
  'One Nation, Seven West Media, Twenty One Pilots and May Gibbs.',
  'August and May spoke to Senator O’Neill.',
  'I spoke to August Twenty and May First.',
  'This is the nineteenth proposal, with twenty or so supporters.',
  'one and a half million dollars',
  'two million five hundred thousand dollars',
  'August thirty-two',
  'February thirty-one',
  'the thirty-first of February',
  'Seven Days and Seven West Media.',
  'Senator One votes against the bill.',
  'Let me check the record of attendance',
])('leaves prose, names and uncertain figures alone: %s', (text) => {
  expect(agent(text)).toBe(text);
});

test.each([
  'Let me check the record.',
  'Let me check.',
  'Let me look that up.',
  'One moment.',
  'Let me just check the records.',
])('removes a leading opening from captions: %s', (opening) => {
  expect(agent(`${opening} The bill passed.`)).toBe('The bill passed.');
  expect(agent(opening)).toBe('');
  expect(workingCaption({ role: 'agent', id: 1, text: opening })).toBe(opening);
});

test('keeps meaningful uses of an opening phrase and raw audio text intact', () => {
  const turn = {
    role: 'agent' as const,
    id: 1,
    text: 'Let me check the record. August nineteen twenty twenty-six had eleven ayes.',
  };
  expect(captionText(turn)).toBe('19 August 2026 had 11 ayes.');
  expect(turn.text).toBe(
    'Let me check the record. August nineteen twenty twenty-six had eleven ayes.',
  );
  expect(agent('They said, “Let me check the record.”')).toBe(
    'They said, “Let me check the record.”',
  );
  expect(workingCaption(turn)).toBeNull();
  expect(workingCaption(undefined)).toBeNull();
});

test.each([
  ['Uh, has he he tried to pass a bill?', 'has he tried to pass a bill?'],
  ['Um, erm, ah, the the amendment?', 'the amendment?'],
  [
    'Can you give me the votes for that, uh, thing?',
    'Can you give me the votes for that, thing?',
  ],
  ['uh um erm ah', ''],
  ['Um?', ''],
  ['Uhlmann asked Emma and Ahmed.', 'Uhlmann asked Emma and Ahmed.'],
  ['Has Malcolm Ah Chee spoken?', 'Has Malcolm Ah Chee spoken?'],
  ['Uh, August nineteen twenty twenty-six?', '19 August 2026?'],
])('cleans displayed user speech: %s', (spoken, written) => {
  expect(user(spoken)).toBe(written);
});
