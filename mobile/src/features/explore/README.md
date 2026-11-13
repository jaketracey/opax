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
the web. Prompts, answers, grading and donor names follow that engine. The
same run writes `quiz-front-page.json`. From `mobile/`, regenerate with:

```sh
node scripts/generate-explore.mjs --portal <portal main checkout>/portal
npx prettier --write src/features/explore/quiz-rounds.json src/features/explore/quiz-front-page.json
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

The deck Today's `QuestionCard` reads (wave 5). An array of questions in the
engine's own shape, each with a stable `id`:

```ts
type FrontPageQuestion = {
  id: string; // "q" + 8 hex digits: FNV-1a of `${template}\n${prompt}` (quizId)
  template: string; // the engine template, e.g. "words-peak-year"
  deck: 'money' | 'words';
  kind: 'mc' | 'tf' | 'higher-lower' | 'portrait' | 'order' | 'slider' | 'year';
  prompt: string; // the question: what Today's card shows
  fact: string; // the answer as the engine writes it
  explanation: string;
  source: string;
  link: { href: string; label: string };
  options?: {
    label: string;
    correct?: boolean;
    value?: number;
    photo?: string;
  }[];
  answer?: number | string[];
  min?: number;
  max?: number;
  scale?: 'log' | 'linear';
  format?: 'money' | 'count' | 'year';
  comparison?: {
    shownLabel: string;
    shownDisplay: string;
    hiddenLabel: string;
    hiddenDisplay: string;
  };
}[];
```

- Its source date is `quiz-rounds.json`'s `generated` (`quizAsOf` in
  `quiz/data.ts`); both files come from the same engine run.
- Today picks index = (days since 1 January 2026, Sydney) mod the deck's
  length, shows `prompt`, and links to `exploreQuizRoute(id)`
  (`/explore/quiz?q=<id>`). Read it through `frontPageDeck` and
  `frontPageQuestion(id)` in `quiz/data.ts`, which apply the same on-screen
  punctuation as the quiz.
- `generate-explore.mjs` writes it from the rounds by this rule: every
  question in `quiz-rounds.json` whose subject a general reader
  recognises (parliament, its record, parliamentarians, parties, the AEC's
  rules), one per id, sorted by id. Templates: `words-topic-higher-lower`,
  `words-topic-figure`, `words-year-order`, `words-peak-year`,
  `words-portrait-topic`, `words-year-voice`, `words-biggest-source`,
  `words-record-true-false`, `money-party-peak-year`,
  `money-party-from-industry`, `money-true-false`. No donor or industry
  question. `tests/explore.test.ts` checks the file against this rule.
- 77 questions today. It is a candidate for the reviewed deck (DIRECTION
  data lane D5): Jake reviews it before ship.

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
