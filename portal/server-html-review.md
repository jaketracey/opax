# Server HTML review

The recipient, agency, grant program and topic pages now use the same exported records or cached API responses as their interactive views. Person and bill pages in `src/index.ts` and `src/seo-content.ts` supplied the pattern: build factual content from the existing reader, escape values, print a bounded list and feed the same identity into the head and schema graph.

The overview remains visible through hydration. Existing interactive lists, charts and controls mount below it. Their duplicate headings are hidden; the overview's heading and preview stay in place. Links open the full interactive list or its exported JSON, including for readers without JavaScript. SPA navigation removes the previous record's overview.

## Acceptance review

1. **Core server content:** title, factual paragraph, figures, at most 20 rows per table, source and full-list links on all four types. `node --test test/server-html.test.mjs` checks two fixture URLs per type through the actual Worker, including Queensland programs. Local `curl` checks returned HTTP 200 with rows, figures, sources and canonicals for eight fixture URLs and six published-export URLs.
2. **Identity and metadata:** fixture tests assert exact titles, paragraphs, descriptions and canonicals, plus record schema URLs. Both grant jurisdictions resolve source IDs through their own catalogue. The browser checks ensure title, description and canonical survive hydration.
3. **Record facts and privacy:** summaries use names, amounts, counts and years from the records. The existing recipient privacy classifier suppresses individual program recipients. Fixtures use invented organisations and speakers. Tests distinguish missing amounts from published zero values and unavailable topics from zero counts.
4. **Reads and cost:** the table below records each read. Recipient identity normalisation reads only the index, avoiding a second detail render. No external calls are introduced for recipients, agencies or programs. Topics reuse the exact existing count and search cache entries. Offline tests and the benchmark record zero network requests.
5. **Hydration and no-JS:** `test/server-html-browser.mjs` passed 32 journeys: eight URLs at 1440 and 390 pixels, with JavaScript enabled and disabled. It checks unchanged overview HTML, document position, width, height and metadata after hydration, plus recipient pagination, agency supplier filtering and removal of the old overview when a program is closed in place. `test/go7867-browser.mjs` also passed its existing desktop and mobile journeys, including showing all invited projects.
6. **Language:** authored copy uses Australian English and no em dashes. Source fields are escaped, without generating prose about missing fields.

## Data reads and local timing

| Page | Reads | Cache |
| --- | --- | --- |
| Recipient | `/graph/grants.{jur}.json`, the recipient's existing `/grants/{jur}/shard-NN.json` | Shared catalogue per jurisdiction; four detail files |
| Agency | `/agencies.json`, `/agencies/{id}.json` | Existing directory memo; eight previews retaining only 20 suppliers and 20 contracts each |
| Program | `/graph/grants.{jur}.json`, `/grants/{jur}/programs/{key}.json`; federal share cards also use existing `/social/programs.json` | Shared catalogue and four detail files |
| Topic | Existing `apiTopic` and `apiSearch` responses, using the browser's exact query and 200-result retrieved window; HTML takes the first 20 | Existing topic/census stale-while-revalidate cache and search page/window caches |

`node test/server-html-benchmark.mjs` measures a disk-backed Worker with network disabled. It visits two URLs per type, then repeats each ten times. First visits share an isolate, so earlier catalogue reads can already be warm. Topic responses are fixture-seeded API cache hits. `Server-Timing` separates detail reads from new HTML generation; wall time also includes routing, metadata, schema and response assembly.

| Page | First detail read, ms | New HTML, first visit, ms | Warm detail plus HTML median, ms | Warm full response median, ms |
| --- | ---: | ---: | ---: | ---: |
| Recipient, federal / Qld | 40.9 / 4.9 | 4.8 / 0.4 | 0.3 / 0.3 | 4.8 / 4.9 |
| Agency, Defence / second audit example | 232.9 / 19.0 | 1.1 / 0.4 | 0.3 / 0.3 | 2.8 / 2.9 |
| Program, federal / Qld | 1.0 / 1.0 | 1.5 / 0.3 | 0.3 / 0.3 | 4.8 / 5.2 |
| Topic, housing / climate | 3.8 / 1.5 | 0.5 / 0.2 | 1.7 / 1.3 | 5.7 / 3.7 |

The federal program detail read already existed; its added work is the HTML column. The largest agency export is 16 MB, so its first parse remains material. Only the small preview survives in memory. An uncached topic still performs the same upstream retrieval and facet calls its client already used; this latency now precedes the HTML response. Cold upstream latency was not measured or contacted. Failed topic loads return a retryable 503 page without invented counts.

## Reproduction

From `portal/`, start the fixture-only Worker:

```sh
npx wrangler dev --config test/server-html.wrangler.jsonc --port 8915 --inspector-port 0
```

The two URLs per type are exported as `paths` in `test/fixtures/server-html.mjs`. This runs `curl` against all eight:

```sh
node --input-type=module -e 'import {paths} from "./test/fixtures/server-html.mjs"; import {execFileSync} from "node:child_process"; for (const path of paths) execFileSync("curl", ["-fsS", "http://localhost:8915" + path], {stdio:"inherit"});'
PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node test/server-html-browser.mjs
```

Published-export checks use the ordinary local Worker on port 8916: the two recipients and two agencies from audit findings 15 and 16, federal `go7215` and Queensland `disaster-recovery-funding-arrangements-drfa`. Topic checks use local fixtures rather than production services. Raw HTML, screenshots and request timings stay in ignored `private/server-html/`.

## Gates

All required gates passed on the final implementation:

```sh
npx wrangler types >/dev/null
npm run build:release
npx tsc --noEmit
npm test -- --test-concurrency=4
```

The full portal suite passed 4,838 tests with zero failures. Its Python-backed tests used the repository dependencies installed with `uv sync --frozen`, with the repository `.venv/bin` on `PATH`. The restored tree also passed all 32 browser journeys and all 14 local curl checks. The existing GO7867 browser journey passed at desktop and mobile widths. Initial failures from missing Python dependencies, old metadata test harnesses and new stylesheet rules were corrected before the final gate pass.

Ten generated tracked files and stamped import versions were restored; the generated untracked voice chunk was removed. `git diff --check` passed. No push, PR or deployment.
