import { copy } from '../../design/copy';
import { phoneCopy } from '../../design/phone-copy';

// About OPAX (account.md 3.3), in typographic marks. The privacy sentences
// summarise the privacy page; they say less than it, never something else.
export const aboutCopy = {
  barTitle: 'About OPAX',
  name: 'OPAX',
  fullName: 'Open Parliamentary Accountability Exchange',
  intro:
    'OPAX brings together Australian parliamentary speeches, votes, political funding and public disclosures, with links to the records behind them.',
  independence: copy.independence,
  culturalNotice: 'Cultural notice',
  privacy: 'Privacy',
  machine: 'Machine-written text',
  coverage: 'Coverage',
  privacyReading: () =>
    phoneCopy(
      'Reading OPAX needs no account. Like any website, OPAX’s servers see your iPhone’s IP address and keep it for up to 31 days.',
    ),
  privacySearch: () => phoneCopy('Searches aren’t saved on this iPhone.'),
  // docs/ANALYTICS.md, "iOS and Android app": shown only in builds that send it.
  privacyUsage: () =>
    phoneCopy(
      'OPAX counts how the app is used, such as which screens open and how many sources an answer had, with a random ID made on this iPhone. It also sends anonymous crash and error reports, which say where in the app something went wrong. The counts and reports never include what you type, ask or search for, and aren’t linked to your account.',
    ),
  // journeys/follow.md 13.1 row 6: the one home of the storage line.
  privacyFollows: () =>
    phoneCopy(
      'Your electorate and follows are saved on this iPhone only. Device backups may include them.',
    ),
  privacyAsk:
    'Ask sends your question to OPAX’s server, Progress Agentic RAG and an AI model reached through OpenRouter.',
  privacyTalk:
    'Talk sends your voice to ElevenLabs, OPAX’s voice provider. No audio is kept, and ElevenLabs deletes transcripts after a day (checked 9 September 2026).',
  machineText:
    'Some summaries and answers in OPAX are written by a model from the record. They always carry this label. Check the linked record. Patterns OPAX points out are leads, not findings.',
  machineExample: 'Example label: Machine-written',
  speeches: 'parliamentary speeches in OPAX',
  coverageRow: 'Coverage',
  coverageError: 'Coverage couldn’t be loaded.',
  loadingCoverage: 'Loading coverage',
  sourceCitation: 'OPAX',
  sourceOriginal: 'OPAX record summary',
  sourceNote: 'These counts are what OPAX holds, not search totals.',
} as const;
