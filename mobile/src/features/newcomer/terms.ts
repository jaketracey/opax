/**
 * Plain words (newcomer design pass, 14 Nov 2026; prototype). One short
 * answer for each idea a reader meets in the app without an explanation.
 * Written for someone who has never followed politics: plain, warm, never
 * talking down, Australian. No em dashes. Every figure here is a fixed fact
 * of the federal Parliament (150 electorates, 76 senators).
 *
 * `question` is the tap target's words and the sheet's title. `gloss` is the
 * one line option C draws under a heading. `body` is the sheet.
 */
export type TermId =
  | 'mp'
  | 'electorate'
  | 'senator'
  | 'parliament'
  | 'government'
  | 'party'
  | 'bill'
  | 'division'
  | 'reading'
  | 'interests'
  | 'sitting'
  | 'record'
  | 'machine';

export interface Term {
  id: TermId;
  /** The word as the glossary lists it. */
  word: string;
  question: string;
  gloss: string;
  body: readonly string[];
}

export const terms: Record<TermId, Term> = {
  mp: {
    id: 'mp',
    word: 'MP',
    question: 'What’s an MP?',
    gloss: 'Your MP is the one person elected to speak for your area.',
    body: [
      'MP is short for member of parliament. Australia is split into 150 areas, and the voters in each one choose a single person to speak for them in Canberra. That person is the area’s MP.',
      'MPs debate and vote on the laws that run the country. Yours works for you whether or not you voted for them.',
    ],
  },
  electorate: {
    id: 'electorate',
    word: 'Electorate',
    question: 'What’s an electorate?',
    gloss: 'An electorate is the area you vote in. Each one elects one MP.',
    body: [
      'An electorate is the area you vote in. There are 150 across Australia, each with roughly the same number of voters, and each one elects one MP.',
      'Which one you’re in depends on where you live. Electorates have names, like Grayndler or Kooyong, and are sometimes called seats.',
    ],
  },
  senator: {
    id: 'senator',
    word: 'Senator',
    question: 'What’s a senator?',
    gloss: 'Senators are elected by your whole state, not one local area.',
    body: [
      'A senator is elected by a whole state or territory instead of one local area. Each state has 12 and each territory has 2, which makes 76.',
      'So you have one MP for your area, and a group of senators for your state. Both vote on the same laws, in different rooms.',
    ],
  },
  parliament: {
    id: 'parliament',
    word: 'Parliament, the House and the Senate',
    question: 'What are the House and the Senate?',
    gloss: 'Parliament has two halves. A new law has to pass both.',
    body: [
      'Parliament is where Australia’s national laws are made, in Canberra. It has two halves.',
      'The House of Representatives holds the 150 MPs, one for each electorate. The Senate holds the 76 senators, who speak for the states and territories.',
      'A new law has to be voted through both. That second look is what the Senate is for.',
    ],
  },
  government: {
    id: 'government',
    word: 'Government, opposition and ministers',
    question: 'Who is the government?',
    gloss:
      'The government is the side with the most MPs. Ministers are its senior members.',
    body: [
      'After an election, the party or group with the most MPs in the House forms the government. Its leader is the Prime Minister.',
      'Ministers are senior members of the government, each in charge of an area such as health or defence. That area is called a portfolio.',
      'The largest party outside the government is the opposition. Its job is to question what the government does.',
    ],
  },
  party: {
    id: 'party',
    word: 'Party, independent and crossbench',
    question: 'What’s a party?',
    gloss: 'A party is a team of politicians who usually vote together.',
    body: [
      'A party is a team of politicians with shared policies, who usually vote the same way. Labor, the Liberals, the Nationals and the Greens are parties.',
      'An independent belongs to no party. The crossbench is everyone who is in neither the government nor the opposition.',
    ],
  },
  bill: {
    id: 'bill',
    word: 'Bill',
    question: 'What’s a bill?',
    gloss: 'A bill is a proposed law that Parliament is still deciding on.',
    body: [
      'A bill is a proposed law. Parliament debates it, can change it, and votes on it.',
      'If both the House and the Senate pass it, it becomes law. From then on it is called an Act.',
    ],
  },
  division: {
    id: 'division',
    word: 'Vote or division',
    question: 'What’s a division?',
    gloss: 'A division is a vote where every name is counted and written down.',
    body: [
      'A division is a vote where every name is counted. Those in favour move to one side of the room (the ayes) and those against move to the other (the noes).',
      'The names are written down, which is how OPAX can show you how each person voted. Plenty of votes are settled by voice alone, and those leave no list of names.',
    ],
  },
  reading: {
    id: 'reading',
    word: 'First, second and third reading',
    question: 'What’s a second reading?',
    gloss:
      'The second reading is the main vote on a bill. The third is the final one.',
    body: [
      'A bill moves through steps called readings. The first reading simply introduces it.',
      'The second reading is the main debate and vote on what the bill sets out to do. The third reading is the final vote in that half of Parliament.',
    ],
  },
  interests: {
    id: 'interests',
    word: 'Declared interests',
    question: 'What do they declare?',
    gloss:
      'Politicians must list things that could sway them, like shares and gifts.',
    body: [
      'Politicians have to list anything that could sway their decisions: shares, property, gifts, free travel, other jobs. The list is public and is called the register of interests.',
      'OPAX shows what each person has declared and when it changed, so you can set it beside how they vote.',
    ],
  },
  sitting: {
    id: 'sitting',
    word: 'Sitting day',
    question: 'What’s a sitting day?',
    gloss: 'A sitting day is a day Parliament meets in Canberra.',
    body: [
      'Parliament doesn’t meet every day. A sitting day is a day the House, the Senate or both meet in Canberra to debate and vote.',
      'The rest of the year, MPs and senators mostly work in their own electorates and states.',
    ],
  },
  record: {
    id: 'record',
    word: 'The record',
    question: 'What’s “the record”?',
    gloss: 'The record is what Parliament and its agencies officially publish.',
    body: [
      'The record is everything officially published about Parliament: who voted for what, what was said, what was declared, who donated, where public money went.',
      'It is public, but it is scattered across dozens of websites. OPAX gathers it in one place, and every figure links back to where it came from. Hansard is the word-for-word record of what was said.',
    ],
  },
  machine: {
    id: 'machine',
    word: 'Machine-written',
    question: 'What does machine-written mean?',
    gloss: 'A computer wrote this summary from the records it links to.',
    body: [
      'Some summaries and every Ask answer are written by a computer from the records they link to. They are always labelled, and the records are one tap away so you can check them.',
    ],
  },
};

/** The glossary's order: the way the ideas build on each other. */
export const termOrder: readonly TermId[] = [
  'electorate',
  'mp',
  'senator',
  'parliament',
  'government',
  'party',
  'bill',
  'reading',
  'division',
  'interests',
  'sitting',
  'record',
  'machine',
];

export const plainWordsCopy = {
  title: 'Plain words',
  lead: 'The ideas OPAX uses, in a sentence or two each.',
  all: 'All plain words',
  /** Option B's switch in Account, and the sheet's way to it. */
  switchLabel: 'Explain terms',
  switchNote:
    'Shows a small question mark beside terms like MP and division. Turn it off any time.',
} as const;

/** The electorate step's opening lines in every option. */
export const newcomerSeatWhy =
  'Your electorate is the area you vote in. Find yours and OPAX will show you your MP: who they are, and how they vote.';
export const newcomerSeatHelp =
  'Not sure of its name? Use your location and OPAX will find it.';
/** Today's invitation card, for a reader with no electorate yet. */
export const newcomerInvitation =
  'Your MP is the one person elected to speak for your area in Parliament. Find your electorate to meet them.';
