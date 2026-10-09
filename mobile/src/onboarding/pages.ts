/**
 * The welcome tour's pages. Plain, factual Australian English; every claim is
 * one the app's own screens make (About, Your MP, profiles, Bills, Today and
 * Search). Each page's scene is a picture built from the app's components;
 * pages marked `example` show sample records and say so.
 */
export const deceasedPersonsNotice =
  'Aboriginal and Torres Strait Islander readers are advised that this app contains names and images of people who have died.';

export interface WelcomePage {
  id: 'about' | 'your-mp' | 'profiles' | 'bills-today' | 'search';
  title: string;
  body: string;
  notice?: string;
  /** The scene shows sample records, labelled "Example". */
  example: boolean;
}

export const welcomePages: readonly WelcomePage[] = [
  {
    id: 'about',
    notice: deceasedPersonsNotice,
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
    body: 'A profile brings together votes, pay, claimed expenses and declared interests. Each part shows when its record was updated and links to the original.',
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

/**
 * iPad: what each page's picture shows. The picture is one VoiceOver image,
 * read before the page's words; every iPad picture shows sample records, so
 * each summary starts "Example".
 */
export const padSceneSummaries: Record<WelcomePage['id'], string> = {
  about:
    'Example: Today on iPad, beside the sidebar, with recently introduced bills, recent declarations and the money map.',
  'your-mp':
    'Example: Your MP on iPad, with electorates beside your member and your senators.',
  profiles:
    'Example: a profile on iPad, beside the list of parliamentarians, with the voting record, pay, claimed expenses and declared interests, each showing when it was updated.',
  'bills-today':
    'Example: a bill on iPad, beside the list of bills, with its labelled machine summary and key dates.',
  search:
    'Example: Search on iPad, with suggestions for people, electorates and bills.',
};

/** VoiceOver's reading of a page: its position, title and words. */
export function pageAnnouncement(index: number, count = welcomePages.length) {
  const page = welcomePages[index]!;
  return `Page ${index + 1} of ${count}. ${page.title}. ${page.body}${page.notice ? ` ${page.notice}` : ''}`;
}
