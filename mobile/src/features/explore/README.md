# Explore

Today's "Quizzes and tools" row opens the hub. Only the selected tool mounts;
the hub does no data reads.

## Hub and chrome

- `Hub.tsx`: "Quizzes and tools", five `Tile`s in a `TileGrid lead`, in a
  fixed order: the record quiz (the lead, full width), Time machine, the tide,
  Who owns which debate, Words per dollar. The quiz tile reads the round in
  progress from `quiz-session.ts` ("Resume question 4 of 8", `?resume=1`).
  `tools` and `toolName(id)` hold each tool's one name.
- `parts.tsx`: `ExploreChrome`, the bar for every Explore screen: Share, then
  one ⋯ menu with an optional Sort by submenu, Copy link and Open on
  opax.com.au. The title fades in by scroll (`Screen barTitle` and a level 1
  heading); `title` fixes it instead (a quiz round). Every tool uses this
  shared chrome; the earlier header alias is removed.
- `explore/[tool].tsx`: the five tools; any other tool returns to the hub
  already in the stack (`dismissTo`) or redirects to it. `q` and `resume` go
  to the quiz; the Time machine reads `year` and `photo` from the same params.

## The record quiz

- `Quiz.tsx` is the controller: phase (intro, round, result, Today's
  question), scoring, the saved best streak and the round in memory. Views
  are in `quiz/`: `QuizIntro`, `QuestionView`, `ProgressStrip`, `ChoiceList`,
  `RankList`, `GuessSlider`, `ComparisonTiles`, `Reveal`, `ResultView`,
  `AnswerReview`, `QuizFooter`, and `data.ts` (the bundled decks).
- `quiz-model.ts`: grade strings, the web's streak scoring, the slider
  mapping (`toSlider`, `fromSlider`, `roundGuess` for drags only,
  `formatGuess`), share text and question ids. A typed guess is kept exactly;
  only a drag rounds, to two significant figures.
- `quiz-session.ts`: the round in progress, in memory for this session only.
  Today's question only asks `inProgress()`.
- `quiz-source.ts`: `quizPublisher(q)`, the explore spec's E4 table (the
  engine's `publisher` when set, else by template, then by source). Speech
  counts are "OPAX topics" and machine text "OPAX"; Hansard publishes only a
  speech shown as itself.
- `quiz-links.ts`: where a question's link goes, always natively. A donor
  pushes its `money-record`; an industry opens the in-tab money map filtered
  to it; party and topic links open those pages; "How OPAX is built" opens
  Methods; a speaker's year in the record drafts in Ask through `useOpenAsk`
  and never sends. Every donor's record opens, as on the web.
- Best streaks use the device's two-slot store (`quiz-store.ts`).

### Data

`quiz-rounds.json` holds 48 eight-question rounds, 16 for each web deck, from
the web question engine (`portal/public/quiz.js`) over the public static
exports, read from an up-to-date portal main checkout (not this repo's own
`portal/public` copy, which lags). The engine is imported by file URL
(`scripts/explore-engine.mjs`), so its own imports such as
`donor-disclosure.js` resolve and donor figures count each receipt once, as on
the web. Prompts, answers, grading and donor names follow that engine.
Today's question has its own generator (below). From `mobile/`, regenerate
with:

```sh
node scripts/generate-explore.mjs --portal <portal main checkout>/portal
npx prettier --write src/features/explore/quiz-rounds.json
```

After regenerating, update the pinned money hash and donor totals in
`tests/explore-generator.test.ts` from the donor records in that checkout.

The snapshot records input SHA-256 hashes, including the engine's. Two old web
caveats predate the money export's public-money additions; the app uses the
export's current methodology wording. The engine's copy changes (explore spec
4.9, E1 to E6: ids, publishers, no em dashes, "More" and "Fewer", plain words)
belong to the engine. Until they land, `plainQuestion` replaces an em dash
with a comma on screen and writes "and" in the topic and industry names in
`quizAmpersandNames` (organisation and donor names keep their "&"), and
`quizId` and `quizPublisher` supply ids and publishers.

### `quiz-front-page.json` (Today's question)

The deck Today's `QuestionCard` reads. It asks about the public record, never
about OPAX: one fact from one record each. It keeps the shape every shipped
build reads (1.1.3 build 57 onwards): an array of questions in the engine's
shape, each with a stable `id`:

```ts
type FrontPageQuestion = {
  id: string; // "q" + 8 hex digits: FNV-1a of `${template}\n${prompt}` (quizId)
  template: string; // e.g. "bill-became-law"
  deck: 'money' | 'words';
  kind: 'mc' | 'tf' | 'slider'; // (the type also allows the rounds' kinds)
  prompt: string; // the question: what Today's card shows
  fact: string; // the answer, the one place it is written
  explanation: string;
  source: string;
  link: { href: string; label: string }; // label: the record's name
  options?: { label: string; correct: boolean }[];
  answer?: number;
  min?: number;
  max?: number;
  scale?: 'log' | 'linear';
  format?: 'money' | 'count';
}[];
```

From `mobile/`, regenerate from an up-to-date portal main checkout (only
`bills/`, `divisions/`, `grants/federal/programs/`, `agencies.json` and
`agencies/` are read; no network, no model):

```sh
node scripts/generate-today-question.mjs --portal <portal main checkout>/portal
npx prettier --write src/features/explore/quiz-front-page.json src/features/explore/quiz-front-page-sources.json tests/fixtures/today-question-records.json
```

- Templates (`scripts/today-question.mjs`), each answer one field of one
  record:
  - `bill-became-law` (true or false). True: a government bill this
    parliament with Royal Assent (`status`, the `royal_assent` key date).
    False: a government bill whose ending the record dates (`ended` of
    negatived, discharged, removed or not proceeding, with `status_as_of`
    equal to its last key date). A lapse is never asked: the record does not
    date it. Nor is a bill dropped on the day a sibling from its package
    (same portfolio and introduction date) passed, as the Build to Rent bill
    was: the measure may have gone through in the sibling. True and False
    take turns, so neither is a safe guess.
  - `bill-portfolio`: `portfolio`; the wrong options are other portfolios
    with five or more bills this parliament. Never when a word of the
    portfolio, in any form ("Sport", "Sporting"), is in the title. Bills whose
    title year is later than their introduction are left out.
  - `division-third-reading`: the `ayes` of the division that decided the
    bill at its third reading, chosen by the shared rule in
    `portal/public/bill-division.js` (`decidingDivision`, also behind the
    daily post's vote slide) from the question the Chair put, so never a
    closure filed under the same name (Senate 9971 and 9972). No question
    when the rule finds no third reading: no fallback to another division.
    The slider runs to 76 (Senate) or 150 (House) and reads in votes. Do
    not edit the helper here: it changes in the social lane's copy.
  - `grant-program-agency` and `grant-program-year-total`: a GrantConnect
    program is every round (GO id) that carries its name, under one agency.
    The agency question sums the rounds with grants in 2025-26 and says so
    ("Across 2 funding rounds with grants in 2025-26"). The year total is
    asked only of a one-round program, so the figure is the one its page
    shows. Both say "published on GrantConnect by" the date of the files the
    figures come from (`generated`). Agency names AusTender lists with no 2026 contract (a
    renamed department) are never an answer or a wrong option, and of twin
    names ("Incentive System", "Incentives Programme") one is asked.
  - `contract-largest-supplier` and `contract-largest-value`: each
    department's largest contract starting in 2026 (`supplier`, `amount`),
    counted across all its AusTender records ("Department of Foreign Affairs
    and Trade" and "... - Australian Aid Program"). The link opens the record
    that lists the contract. Only suppliers the record calls a company are
    named, never a person or a trust. The name is the one that record shows:
    its contract row and its supplier entry must agree, or there is no
    question. When the ABN's legal name differs, the reveal adds "X is now Y
    (same ABN)". "Largest" is as at the export: the reveal says "AusTender had
    published by" the `agencies.json` date, since more 2026 contracts appear
    later.
  - Regenerate from main's exports, never this repo's `portal/public` copy:
    that copy is an older export (21 September 2026 at the time of writing)
    with older supplier names and fewer contracts.
- Left out: royal commissions (and RC acronyms), the Victorian Big Build
  commission, class actions, hearings and transcripts, anything Victorian,
  private members' bills, and any text with "OPAX", "report" or "speeches".
  No two options in a question are near twins, and one answer is right at
  most twice in a deck.
- Order: a fixed rotation (bill, grant, vote, contract, portfolio, grant
  total, vote, contract value) in which no family follows itself, even
  across the wrap from the last day to the first. Each record is asked once.
- `quiz-front-page-sources.json` holds each template's as-at date, keyed by
  template name (bills: the bills index; votes: the latest division; grants
  and contracts: their exports), and input hashes. `questionAsOf` in
  `quiz/data.ts` dates each record question's source line from it by its
  exact template; the rounds keep `quizAsOf`.
- Each link opens its record natively from the reveal's source sheet
  (`quizDestination`): a bill, a bill's division, a grant program, or an
  agency's Contracts filtered to the supplier. Publishers: ParlInfo, They
  Vote For You, GrantConnect and AusTender.
- `tests/fixtures/today-question-records.json` holds each question's record
  excerpt; `tests/today-question.test.ts` checks every answer against it, the
  stored shape against build 57's, the banned words and the balance. It also
  feeds the generator small records that reproduce each wrong question the
  #485 review found (a closure on the third reading, a program split across
  rounds, a department split across records, a sibling bill that passed) and
  checks the answers against those records. `tests/quiz.test.tsx` opens new
  questions through the reveal and checks the source line.
- A person reviews the deck before it ships: write it out as a table
  (question, answer, figure, record) for that review.
- Today picks index = (days since 1 January 2026, Sydney) mod the deck's
  length, shows `prompt`, and links to `exploreQuizRoute(id)`
  (`/explore/quiz?q=<id>`). Read it through `frontPageDeck` and
  `frontPageQuestion(id)` in `quiz/data.ts`.
- Builds before this deck keep their own bundled questions: a new deck
  reaches readers in the next app build.

## Tools

- Time machine: static `/years/{year}.json`, bills and the web's
  `/years/pictures.json` manifest. Photographs load that year's unchanged
  `/years/pictures/YYYY/name.webp` files through the existing bounded WebP
  cache. Native images read local files only, with a fixed aspect-ratio
  placeholder and Reduce Motion-aware fade. The manifest is also read when
  Sources and licences opens photo credits; it includes all years from 1998
  to 2026. Live headline probes and their per-speech generated briefs are not
  part of this static view.
  An unlinked visit resolves the saved year before mounting the year's data
  reads. The year sheet returns its choice only to the menu that opened it.
  Bills show three preview rows; the disclosure mounts one page of up to
  twenty additional bills, with previous and next controls.
- Tide: exactly `/api/tide?scope=federal` or `/api/tide?scope=all` on open or
  scope selection. Sorting is local.
- Debate matrix and Words per dollar: the existing `/api/matrix` action read,
  shared across both tools. Money uses the static graph export. Rows delegate
  to the native topic screen and its action reads.

## Read costs

Paid reads use `getForAction`: one attempt per uncached path, session memory,
no automatic retries. A failed request can be tried again explicitly.
Fixtures are pinned to checked-in exports and never proxy the production
Worker. The quiz is bundled and reads nothing.

Photographs are free static reads; no paid request changed. The
origin-separated photo cache holds up to 8 MB / 96 files, uses three
concurrent reads, deduplicates requests, reuses fresh files for a day, and
keeps valid cached files offline. Fixtures include six unchanged 2025 WebP
files (under 1 MB in total). No production GET is needed to regenerate or test
any Explore data.

Then vs now stays on the web.

## Product decision pending: percentage bases (11 November 2026)

The two matrix consumers currently answer different questions:

| Screen                                                                      | Calculation                                                                 | Presentation                                                                                                           |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Who owns which debate (`Matrix.tsx`)                                        | Party cell divided by `totals[topic]`, the full topic-labelled speech total | Each party, including the folded Other column, rounded independently                                                   |
| Words per dollar (`WordsDollars.tsx`, `model.ts:wordsPanel`, `partyShares`) | Party cell divided by the sum of that topic's party cells (`partyBase`)     | Whole percentages apportioned to sum to 100 across all positive cells; shares hidden below 200 party-labelled speeches |

The Worker in `portal/src/index.ts:apiMatrix` preserves the topic's filtered
total separately from the party facets. It folds parties beyond its column
cap into Other. `partyBase` includes Other, although Words per dollar omits
the Other row. Thus a topic whose full total exceeds its party-facet total
can show different percentages for the same party in the two tools. In an
illustrative fixture with a topic total of 1,000, party cells totalling 600
and a party cell of 300, the percentages are 30% and 50%, respectively.
The current Matrix source note (`MATRIX_NOTE`) describes the recorded-party
base even though its rendered calculation uses the full topic total.

Product must choose a common denominator, or retain both questions and name
the bases clearly in the visible and spoken copy. The decision must also
cover Other, rounding and the thin-base threshold. Any UI change belongs in
`Matrix.tsx`, `WordsDollars.tsx`, `PairRow.tsx` and the share helpers/notes in
`model.ts`; an API contract change belongs to the Worker/data owner. Existing
tests cover Other and party-share apportionment in
`explore-tool-regressions.test.tsx` and `explore-tools.test.ts`. No percentage
calculation or product copy was changed in the d3 search/explore bug pass.
