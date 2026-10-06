/**
 * The welcome tour's pages. Plain, factual Australian English; every claim is
 * one the app's own screens make (About, Your MP, profiles, Bills, Today and
 * Search). Each page's scene is a picture built from the app's components;
 * pages marked `example` show sample records and say so.
 */
export interface WelcomePage {
  id: 'about' | 'your-mp' | 'profiles' | 'bills-today' | 'search';
  title: string;
  body: string;
  /** The scene shows sample records, labelled "Example". */
  example: boolean;
}

export const welcomePages: readonly WelcomePage[] = [
  {
    id: 'about',
    title: 'Welcome to OPAX',
    body: 'OPAX brings together Australian parliamentary speeches, votes, political funding and public disclosures, with links to the records behind them. It is independent and non-partisan. It is not a government app.',
    example: false,
  },
  {
    id: 'your-mp',
    title: 'Your MP',
    body: 'Choose your electorate to see your member and your senators. Your choice is saved on this device.',
    example: true,
  },
  {
    id: 'profiles',
    title: 'Profiles',
    body: 'A profile brings together votes, pay, claimed expenses and declared interests. Each part names its source and gives an as-at date.',
    example: true,
  },
  {
    id: 'bills-today',
    title: 'Bills and Today',
    body: 'Today shows recently introduced bills and recent declarations, each with its date. A bill’s page has its key dates, divisions and speeches. Summaries written by a model are labelled.',
    example: true,
  },
  {
    id: 'search',
    title: 'Search',
    body: 'Search people, declared interests, pay and expenses. Suggestions for people, electorates and bills appear as you type.',
    example: true,
  },
];

export const finishLabel = 'Choose your electorate';

/** VoiceOver's reading of a page: its position, title and words. */
export function pageAnnouncement(index: number, count = welcomePages.length) {
  const page = welcomePages[index]!;
  return `Page ${index + 1} of ${count}. ${page.title}. ${page.body}`;
}
