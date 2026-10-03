# OPAX for iOS: surfaces, UX and design language

Discovery, 3 October 2026. This is the product and UX half of the iOS discovery and feeds the public design document `docs/IOS-APP.md`. The data, the API contract and the native architecture comparison are written in parallel in `docs/IOS-API-CONTRACT.md`. Where a screen below needs data that the web does not yet publish in a form a phone can use, this document names the need and leaves its shape to that contract.

Nothing here is built. Statements about the web app were read from the source at commit `8f1305e3` or from a local render of it, unless they say otherwise.

## How this was gathered

- **Source.** `portal/public/navigation.js`; `route()` in `portal/public/app.js`; the Worker's route table in `portal/src/index.ts` (`route()`, `matchSeoRoute()`, `STATIC_PAGES`) and `portal/src/page-entry.ts`; every HTML file in `portal/public/`; the page modules; `style.css` and `ui-controls.css`; and the docs named in each section.
- **Renders.** Pages served from `portal/public` by a local static server and captured in headless Chrome at 390 and 1440 CSS pixels, with analytics scripts and every request to opax.com.au blocked. `/api` was not reachable in that setup, so sections that need it rendered their error states. No Ask, chat, voice or question-builder request was made anywhere, locally included.
- **Production.** Two plain GETs with an identified user agent: `/today` (to read its redirect) and `/sitemap.xml`. No browser was pointed at opax.com.au.
- **Apple.** The App Review Guidelines, fetched 3 October 2026. The page states "Last Updated: June 8, 2026".

## 1. Surface inventory

### How completeness was checked

The inventory was built from four lists and reconciled by hand:

1. `navigation.js`: the seven `sections` (Ask & search; Topics; People & organisations with 8 destinations; Money; Bills; Reports with 8 destinations; About with 6 destinations) and the five `money` sub-navigation links.
2. `route()` in `app.js`: every branch. `subject` (supplier, agency, topic, a named entity, a directory), `bill` and `bills`, `declared`, `doc`, `chat`, `search`, `discover`, `reports`, `money` (receipts, grants list, a grant recipient, the month's largest grants), `connections`, `money` (the map), `explore` (nine modules), `about`, `methods`, `stats`, `expenses`, and the default branch (Ask, or a not-found trail for an unknown path).
3. The Worker: `pageEntry()` (`/` serves `home.html`; `/search` and `/?q=` redirect into Ask or Search), `matchSeoRoute()` (static pages, reports, topics, directories, subjects, documents, bills, grant recipients), and the special routes `/today`, `/community`, `/map`, `/og/*`, `/bill-texts/*`, `/mcp`, `/ingest/*` and `/api/*`.
4. The 13 HTML files in `portal/public/` and `.assetsignore`.

A script then loaded `navigation.js` in Node and confirmed that each of its 30 destinations appears in the tables (the seven report links through the reports row), that every `route()` view and all nine Explore modules are named, and that all 13 HTML files are listed. A cross-check against the production sitemap (25,125 URLs on 3 October 2026: 21,459 supplier pages, 1,562 people, 814 donors, 626 electorates, 439 campaigners, 165 agencies, 22 topics, 20 parties, 8 report URLs and the static pages) found no page kind missing from the tables below.

**Verdicts.** *Core v1*: ships natively in the first release. *Later*: a native candidate after v1, with its priority from section 2. *Web only*: stays on opax.com.au; the app links to it and does not imitate it.

### Home and research

| Surface | Web route | Purpose | Data it shows (source) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Homepage | `/` (serves `home.html`) | Front door: purpose, research entry, latest records | Purpose statement; Ask and Search entry with sample questions; money map embed with industry filters; Browse the record; topics and reports; Spotlight; recently introduced bills; recent declarations; newly indexed records; From the record; Collection & coverage. `home-data.js` reads `/bills/index.json`, `/interests/recent.json`, `/graph/money.json`, `/graph/grants.federal.json`, `/votes.json`, `/photos/people.json`, `/reports/index.json`, `/corpus.json`, `/api/recent`, `/api/stats` | Ask or search; filter the map; step the carousel; choose the Spotlight topic | **Core v1, recomposed** as the Today tab. The map embed and Spotlight are later. |
| Ask | `/ask`, `/ask?q=` | An answer written by a model from retrieved records, with citations | `POST /api/ask`; calculated money and pay answers; sources | Question, filters, Build a question, follow-ups | **Later (P2).** v1 hands Ask to the web. |
| Keep asking | `/chat` | A conversation over the record | `/api/ask`, `/api/followups`; conversations kept in the browser and, for members, in `member_chats` | Follow-ups, saved conversations | **Web only** in v1. |
| Docked assistant and voice | Chat dock; "Talk to Opax" panel; `/api/voice/*` | Voice conversation, 10 minutes per account | ElevenLabs agent, community session | Start talking, mute, end | **Web only.** |
| Search | `/ask?view=search` (legacy `/search` redirects) | Find speeches, divisions, bills, releases and grant records | `GET /api/search` with `kind`, `speaker`, `party`, `state`, `topic`, `from`, `to`, `mode`, `sort`, `page`; machine briefs from `/api/brief`; a generated summary from `/api/search-summary` | Query, filter chips, sort, paging, export | **Core v1**, without the generated summary. |
| Quick search suggestions | Header search panel and the menu drawer | Jump straight to an entity | Built in the browser from the electorates index, `/speakers.json`, the topic list, `/graph/money.json` nodes and the reports index | Type two characters; arrows, Enter, Escape | **Core v1** as native search suggestions. |
| Document | `/doc/<slug>` | One record: a speech, division, release, bill text or grant record | `GET /api/resource/<slug>`; machine brief; topics; bill panel; similar records | Cite, similar, speaker, original source | **Core v1.** Every figure in the app resolves to a document or an external source. |

### People and organisations

| Surface | Web route | Purpose | Data it shows (source) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Parliamentarians directory | `/subject/person` | Browse everyone in the record | `/parliamentarians.json` (1,557 people, 313 flagged current) | Filter by chamber, party, state; search | **Core v1**, inside Search. |
| Parliamentarian | `/subject/person/<slug>` (a name URL 301s to the slug) | Everything the record holds on one person | Portrait and credit (`/photos/people.json`); party now and "formerly"; jurisdiction, chamber and electorate links (electorates release); infobox. Sections: What they talk about (`/api/person-topics`, `/api/topics`); Voting record (`/votes.json`); Declared interests and declared ties (`/interests/<id>.json`, `/interests/ties-by-donor.json`); Speeches (`/api/search` by speaker); Ministerial diary for NSW and Queensland ministers (`/access.json`); In the news (`/api/news`); Pay for the posts held (`/pay.json`); Claimed expenses (`/expenses.json`, `/expense-categories.json`); Mentions in parliament (`/api/search`) | Jump links; All, Then, Now era toggle; "How votes are counted"; ask about their speeches; a party receipts link captioned "Party disclosures, not this person's finances." | **Core v1.** |
| Committee witness | Same route, when the record names only a witness | Hearing appearances, without asserting a person | `/api/search` | Open the evidence | **Core v1** as a minimal entry: no party, seat or portrait. |
| Electorates directory | `/subject/electorate` | 625 constituencies in nine jurisdictions | `/electorates/manifest.json` and the release index | Filter by parliament, chamber, state, party | **Core v1**, behind Your MP and Search. |
| Electorate | `/subject/electorate/<slug>`, `?asof=YYYY-MM-DD` | Who represents a place, and its elections | Representatives with a verified-as-of date; historical lookup; election timeline with candidates and counts; boundary outline; Census 2021 profile; related upper-house constituencies; sources (`/electorates/releases/<id>/el_*.json`) | Change the as-of date; expand an election | **Core v1.** The boundary map is P1. |
| Parties directory and party | `/subject/party`, `/subject/party/<name>` | A party's money, members and votes | Received total and rank, where it came from (`/graph/money.json`); receipts on the return, debts, associated entities (`/graph/aec-extras.json`); members; bill divisions with party splits; access records; In parliament; news; the money map narrowed to the party | Explain this money; open a donor | **Later (P1)** as a basic native page. The money map part stays web only. |
| Donors directory and donor | `/subject/donor`, `/subject/donor/<name>` | Who gives, and to whom | Money graph, aliases, evidence, declared ties, state money, tax and charity status, access, mentions | Explain this money; download JSON | **Later (P2)**, organisations only. See section 8. |
| Agencies and suppliers | `/subject/agency[/<name>]`, `/subject/supplier[/<name>]` | Government contracts by buyer and by supplier | `/agencies.json`, `/suppliers.json` (6.8 MB), `/agencies/` (36 MB), `/suppliers/` (82 MB) | Filters, contract tables | **Web only** for now: size and wide tables. |
| Campaigners and third parties | `/subject/campaigner[/<name>]` | Political spenders that are not parties | `/graph/campaigners.json` | Filter | **Later.** |
| Declared interests | `/declared` | Newest register additions and deletions, by week | `/interests/recent.json` (300 of 1,660 items; generated 4 September 2026) | Filter | **Later (P1)**; feeds Today and follows. |

### Topics

| Surface | Web route | Purpose | Data it shows (source) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Topics index and topic | `/subject/topic`, `/subject/topic/<slug>` (22 topics) | What parliament has said on a subject over time | `/api/topics`, `/api/topic/<slug>`, `/api/tide`, briefs | Pick a topic; open speakers and speeches | **Later (P1).** In v1 a topic is a search filter. |

### Money

| Surface | Web route | Purpose | Data it shows (source) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Money map ("3D connections") | `/money`, `/map` (`map.html`) | The 250 largest disclosed donors around the parties, by industry and year | `/graph/money*.json`, three.js scene | Drag years, filter industries, layers, focus a node | **Web only**: a 3D WebGL scene that needs a large screen. |
| Money journeys | `/money?journey=…&step=…&focus=…` | Guided steps through the map, with a written story | Graph scenes, plus `/api/journey-story` (model-written) | Choose a lens and subject, step or play | **Web only**: 3D, and the story is a paid model call. |
| Political receipts | `/money/receipts` | Every disclosed donor-to-party flow, as a ledger | `/graph/money*.json` | Filter, sort, export | **Later (P2).** |
| Government contracts and discovery leads | `/discover` | Leads: donor and supplier overlaps, receipt concentration, supplier concentration | `/discovery.json` (signals with title, summary, metrics, evidence, caveats; 31 concentration charts) | Choose a category, an agency, sort | **Later (P1)** as Leads. |
| Grants, programs, largest grants, grant recipient | `/money/grants`, `?program=`, `?largest=YYYY-MM`, `/money/grants/<federal\|qld>/recipient/<id>` | Who receives grants, where and from which program | `/graph/grants.*.json`, `/grants/` (88 MB), `/social/programs.json`, `/social/grants-largest.json` | Filters, program view, recipient file | **Later (P2).** Daily editions link here, so v1 hands these URLs to the web. |
| Programs & places | `/connections`, `?entity=` | Organisations, programs and places named across records | `/evidence/` (157 MB) | Filter, open excerpts | **Web only.** |

### Bills

| Surface | Web route | Purpose | Data it shows (source) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Bills | `/bills` | 2,989 federal bills, 2013 to 2026 | `/bills/index.json` (1.7 MB; generated 29 September 2026): 1,793 passed, 1,076 lapsed, 119 before parliament, 1 exposure draft; 1,711 with a summary | Search, filter by year, status, parliament | **Core v1.** |
| Bill | `/bill/<key>` | One bill: what it changes and how it was decided | `/bills/<key>.json`: title, status and status date, sponsor, portfolio, key dates, summary with its attribution, changes, who is affected, divisions with party splits, speeches, sources; bill text from `/bill-texts/` | Open a division, a speech, a source | **Core v1.** Bill text links to the source in v1. |

### Reports

| Surface | Web route | Purpose | Data it shows (source) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Reports and report | `/reports`, `/reports/<slug>`, `/reports/<slug>/s/<n>` | Standing investigations: Where community funding goes (`grants-allocation`); Climate & Energy (`climate`); Gambling (`gambling`); Housing (`housing`); Immigration (`immigration`); First Nations (`indigenous`); Media Ownership (`media`) | `/reports/index.json`, `/reports/<slug>.json` | Read, jump to a section | **Later (P1)** reader. The grants-allocation map stays web only. |

### Explore

| Surface | Web route | Purpose | Data it shows (source) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Explore and its modules | `/explore`, `?game=` | Build your ballot, Time machine, The tide, The record quiz, Who owns which debate, Words per dollar, Then vs now. Ledger and Who gets the grants forward to `/money/receipts` and `/money/grants` | Module JSON and `/api/tide`, `/api/matrix` | Interactive dialogs | **Web only.** The quiz is a later candidate. |

### About, community and edges

| Surface | Web route | Purpose | Data it shows (source) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| About, Methods, Sources & coverage, Expense definitions | `/about`, `/methods`, `/stats`, `/expenses` | What OPAX is, how it works, what it covers | Static text in `index.html`; `/api/stats`, `/corpus.json`; `/expense-categories.json` | Read, cite | **Core v1** as a native About and sources screen. Methods opens on the web. |
| Community | `/community` (`community.html`; views: home, members, member, thread, new thread, lists, list, account, sign-in, privacy, guidelines, tools, moderation, messages) | Accounts, discussions, reading lists, follows, direct messages, MCP tokens | `/api/community/*` | Sign in by emailed link; post; follow; message; report; block | **Later (P2)**, with conditions in section 2. |
| Daily edition | `/today` | 302 to the page behind the latest daily social edition (read from the `social_editions` table). On 3 October 2026 it pointed at `/reports/indigenous` | Edition journal | None: a redirect | **Core v1** concept: the Today tab. Needs a read route (section 2). |
| Share images | `/og/<path>.png`, `/og/story/*` | Link previews and social cards | Drawn by the Worker | None | **Not a screen.** The app never requests them. |
| Machine and plumbing routes | `/api/*`, `/bill-texts/*`, `/mcp`, `/ingest/*`, `/sitemap.xml`, `/robots.txt`, `/.well-known/atproto-did`, `/connections.html` (redirect) | Data, analytics proxy, crawlers, identity | | | **Not screens.** The app never calls `/ingest/*` or `/mcp`. |
| Contributor references | `ui-workbench.html`, `home-prototype.html` | Design references | | | Excluded from deployment by `.assetsignore`. Not a surface. |
| Test harnesses | `lg-test.html`, `nr-test.html`, `qz-test.html`, `st-test.html`, `tm-test.html`, `wb-test.html` | Component harnesses (ledger, news rail, quiz, stages, time machine, wombat loader) | | | Deployed but unlinked. Not a surface. |

### Names in the brief that have no page of their own

- **Pay.** No route. It is the person-page section "Pay for the posts held" from `/pay.json` (federal parliament only, from 7 December 1999, as at 17 September 2026) and a calculated Ask answer. In the app it lives on the MP profile.
- **Interests.** `/declared`, the person-page sections, and "Named in members' registers" on donor pages.
- **The disconnect score.** Not live. `docs/DISCOVERY.md`: "The old disconnect engine is not part of the current live portal; its historical score table is not used by these leads." There is no route, export or API for it. Section 2 recommends against a score in v1.
- **The daily edition.** The `/today` redirect and the social channels; there is no edition page.

## 2. Candidate v1 scope

Five principles decide the scope:

1. Go native where a phone adds something the website cannot: a saved place, follows, offline reading, the share sheet, universal links.
2. Every figure links to its record.
3. No paid model call from the app in v1.
4. No account in v1.
5. Read cheap, cacheable data: the static exports and the GET routes the web already serves.

### P0: must ship

| # | Feature | What ships | Why | Data it needs |
| --- | --- | --- | --- | --- |
| 1 | **Your MP** | Find your seat by postcode, location or search; your member, your senators and, where OPAX has them, your state members; saved on the device | The one question a phone answers better than a website: who represents me, and what is on their record | Electorates release; roster; a postcode-to-electorate table that does not exist yet (below) |
| 2 | **MP profile** | Native profile with voting record, speeches, declared interests, pay, expenses and party receipts link | The core entity; Your MP, search and bills all lead here | Per-person bundle (section 4.3) |
| 3 | **Electorate** | Representatives, as-of date, elections, Census context, sources | Your MP's spine; the answer to "is this my seat" | `el_*.json` per electorate |
| 4 | **Search** | Native search with suggestions and record search with filters | The universal way in | Static suggestion indices; `GET /api/search` |
| 5 | **Bills** | Tracker list and bill detail with divisions and party splits | A bill has a clear life cycle worth following, and every stage links to the record | `/bills/index.json`, `/bills/<key>.json` |
| 6 | **Today** | Latest records: the daily edition card, recently introduced bills, register changes, newly indexed records | Gives a reason to open the app on a day without a question | Edition read route (missing); `/bills/index.json`; `/interests/recent.json`; `/api/recent` |
| 7 | **Record reader** | Native document page for speeches and divisions, with the original source link | The evidence pattern needs a destination for every figure | `GET /api/resource/<slug>`, `/api/brief` |
| 8 | **About and sources** | Independence statement, sources and licences, coverage, corrections, privacy | Guidelines 1.5 and 5.1.1(i); the "not a government app" statement | `/corpus.json`, `/api/stats`, static text |
| 9 | **Share and universal links** | Canonical opax.com.au URLs in and out | One page, one URL, on the web and in the app | An `apple-app-site-association` file (section 3) |

### P1: should ship

| Feature | Why | Note |
| --- | --- | --- |
| Follows with local change notices | Turns the app from a lookup into a habit without an account | Section 2, "Follows and alerts" |
| Party page (basic) | The party chip on every profile should not dead-end | Members, receipts total and top sources, bill divisions; the money map stays web |
| Leads (`/discover`) and declared interests feed | The most distinctive material on OPAX, already structured as leads with caveats | `/discovery.json` is 156 KB |
| Reports and topics reader | Long-form reading suits the phone | `/reports/<slug>.json` |
| Electorate boundary map | Confirms a seat at a glance | MapKit polygon from the release outline, labelled as a display outline |

### P2: later

Ask in the app (behind consent), push notifications, community accounts, donors (organisations only), receipts ledger, grants and recipients, the Explore modules. Voice, the money map, money journeys, contracts and Programs & places stay on the web.

### Your MP

**Flow.** First launch offers three ways in, in this order: enter a postcode; use my location once; search for an electorate or a name. The result is every plausible seat, never one guessed answer: the federal House seat or seats, the state's senators, and state seats where OPAX has a verified roster. The person confirms; the choice is stored on the device only.

**What the data allows today.**

- No postcode or location lookup is live. `docs/ELECTORATE_REFERENCE.md`: "Postcode lookup, precise point-in-polygon lookup … are not enabled."
- A research table of 2,358 postcode mappings exists without source, version or date. `docs/ELECTORATES.md` says it "can suggest lookup candidates, but must be validated against a sourced geography before becoming a definitive lookup", and that "postcode lookup returns all plausible seats rather than one guessed answer."
- Federal display polygons are the AEC's 2025-election boundaries, simplified. The reference is explicit: "Never use display geometry for precise allocation."
- Verified rosters: federal (150 representatives and 76 senators, checked 4 September 2026) and Victoria (128 members, 9 September 2026). NSW, Queensland, SA, WA, Tasmania, the ACT and the NT are pending.

**Recommendation.**

- Postcode is the primary path and needs a sourced, dated postcode-to-division table published with the electorates release. Until it exists, Your MP ships with location and search only.
- Location is a one-shot, when-in-use request with a manual alternative (guideline 5.1.1(iv)). The point is tested on the device against the published outlines to rank candidates. The result is labelled approximate and the person confirms it. Coordinates never leave the phone.
- State members show only where a verified roster exists; elsewhere the screen says "OPAX does not yet have a verified roster of NSW members" rather than showing old open-ended rows.

**What the Your MP screen shows.** Member cards that open the profile; their latest divisions, speeches and register changes; pay; and the party receipts link with its caption. **No disconnect score.** It is not live; there is no published method or export; and a single number attached to a named person reads as a verdict, which the evidence-first rule and guideline 1.1.1 both argue against. The closest live, evidence-backed comparisons are already on the profile: a member's topic share against the whole labelled record, and the bills they voted for and against. If a score returns, it needs a published method, a link from every input to its record and its own review.

### Search

Native search (`.searchable`) with two layers:

1. **Suggestions while typing**, built on the device from small static indices, exactly as `quickSearchSuggestions()` does: people (`/speakers.json`, 52 KB), electorates (release index), parties and donors (`/graph/money.json` labels), topics, reports, plus bill titles from `/bills/index.json`. The first row is always "Search the record for …". No network call per keystroke.
2. **Record search** on submit through `GET /api/search`, with filters in a sheet: record kind, parliament (`state`), party, topic, year range, sort. Applied filters appear as removable tokens.

Leave out the generated summary (`/api/search-summary`): it is a model call, and on the web a crawler once fired about 350 of them a day. Keep the machine briefs (`/api/brief`), which are precomputed and labelled "Machine brief".

The search limiter allows 120 requests a minute per client IP. Phones behind carrier-grade NAT share addresses, so the contract should say how the app is limited fairly, for example with a per-install token or App Attest.

### MP profiles, party and electorate pages

The profile is P0 and follows the web's order, which puts the structured record first: identity, voting record, what they talk about, declared interests, speeches, pay, expenses, mentions. In the news and the ministerial diary are P1. The ask-about-their-speeches form becomes "Ask on opax.com.au" (see Ask, below).

The electorate page is P0 because Your MP depends on it. The party page is P1. In v1 a party chip opens the party page on the web, so nothing dead-ends.

Today the profile assembles itself from whole-site files: `/votes.json` is 1.2 MB, `/pay.json` 576 KB, `/expenses.json` 452 KB and `/parliamentarians.json` 400 KB, all fetched to show one person. A phone needs per-person slices or a per-person bundle. That is the contract lane's call; this document lists the blocks each slice must serve (section 4.3).

### Bills tracker

P0. The list opens on bills before parliament (119 on 29 September 2026) and recently introduced bills, with filters for status, year and parliament and title search. The detail shows the summary under its attribution line, "Written by a model from the explanatory memorandum; not the record", and never without it. Divisions show ayes, noes and party splits with labels, and each division opens its record. Following a bill is P1 (follows).

### The daily edition and discover leads

**The daily edition** is one source-based post a day (`docs/DAILY-POST.md`), rotated by weekday: bill, grant program, politician, grant award, bill, the month's largest grants, topic. Each edition links to one opax.com.au page and no model runs at posting time. On the web it exists only as the `/today` redirect. For the app it is the natural first card on Today, but it needs a read route that returns the latest edition's date, kind, headline facts, source URL and caveat. That belongs in the API contract. Until then Today ships with its record feeds, and the edition card follows when the route exists.

Three days in seven are public-money editions (grant program, grant award, the month's largest grants) that link to grant pages, which are web only in v1. The card opens those on opax.com.au and says so.

**Discover leads** (P1) are already shaped for a phone: each signal in `/discovery.json` has a neutral title ("Westpac Banking Corporation appears in party receipts and contracts"), a summary, labelled metrics, example evidence records and caveats ("Matching names are not verified legal identities"; "No sequence or causal link is inferred"). The app shows them as lead cards (section 4) and keeps the caveats visible, not behind a tap.

### Follows and alerts

**Local only first (P1).** Follow an MP, an electorate or a bill. Follows are stored on the device. When the app opens, and when iOS grants a background refresh, it fetches small change markers, compares them with what the person last saw, and marks what is new: a new division, speech, register entry, bill stage. Optional local notifications can announce those changes with no server, no device token and no account. Background refresh runs when iOS allows, so the app must not promise timing.

This needs one thing from the data side: a small per-refresh list of entity keys that changed, with dates, so the app does not download whole exports to compare. The nightly corpus refresh is the natural producer.

**Push (P2).** Remote push needs a server that stores device tokens and what each token follows. That is personal data with a privacy policy, retention and deletion, and an operator on call when the nightly refresh misfires. It should wait until local notices prove the demand.

### Ask and voice

**Recommendation: v1 links out.** An "Ask on opax.com.au" action opens the web Ask in Safari, outside the app, with the question prefilled only if the person typed one.

- **Cost.** Every uncached `/api/ask` is a paid model call (DeepSeek V4 Pro through OpenRouter, behind the knowledge box) plus retrieval. The Worker limits Ask to 20 requests a minute per client IP and caches answers for seven days. Scraper fleets already drive enough paid calls that the Worker blocks whole networks on model routes (`BLOCKED_ASNS`, `GENERATION_BLOCKED_ASNS`, `GENERATION_BLOCKED_CIDRS`). An app adds a client that is easy to script and shares IPs behind carrier NAT.
- **Review risk.** Guideline 5.1.2(i) requires the app to "clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so." A typed question can contain personal data and goes to a model provider. Answers can be wrong (guideline 1.1.6, false information), so every answer needs its labels and citations, as on the web.
- **Privacy label.** Opening the web in Safari keeps question text out of the app's own data collection. An in-app web view would load the site's analytics (PostHog, and Google Tag Manager on the production hosts) inside the app.
- **Universal links.** `/ask` (without `view=search`) and `/chat` must be excluded from the app's link claims, or "Ask on opax.com.au" would reopen the app (section 3).

**Voice stays on the web.** It needs a community account, microphone permission and a third-party voice provider, and carries a 10-minute lifetime allowance per account. None of that belongs in v1.

**Native Ask later (P2)** needs: an explicit consent sheet naming the providers; per-install or App Attest rate limiting; the same labels, citations and "Answers may be mistaken" line; and a decision on whether conversations sync (which brings accounts with it).

### Community accounts

**What an account adds on the web today:** private and shared reading lists, a public profile, discussions with replies and likes, following members, direct messages, blocking, reporting, moderation, saved Ask conversations synced across devices, MCP access tokens, and the voice allowance. "Source records remain accessible without an account."

**App Store consequences if accounts come into the app:**

- **Account deletion in the app (5.1.1(v)).** "If your app supports account creation, you must also offer account deletion within the app." The web community has no self-service account deletion today: lists, threads, replies and messages can be deleted, the account cannot (checked in `community.js` and `src/community*.ts`). Deletion has to exist server-side first.
- **User-generated content (1.2).** The app must filter objectionable material, offer reporting with timely responses, let people block abusive users, and publish contact information. The web has reporting, blocking and moderation. Pre-posting filtering is not evident, and OPAX "has no dedicated inbox": the About page sends people to GitHub issues. Both need an answer.
- **Sign in with Apple (4.8)** is not required while sign-in stays OPAX's own emailed link. It becomes required, as an equivalent option, only if a third-party or social login is added.
- **Sign-in links.** Tokens travel in URL fragments. The app would need to receive the emailed link (a universal link for the sign-in path) or run sign-in in `ASWebAuthenticationSession`.
- **Privacy label.** Accounts bring email address, user content and identifiers into the label. Direct messages "are not end-to-end encrypted", which the privacy policy already says.

**Recommendation:** no accounts in v1. Follows are local; community stays on the web behind an "Open the community on opax.com.au" link. Revisit once account deletion ships on the web.

## 3. Information architecture

### Tab bar

Four tabs in v1, with room for a fifth:

| Tab | SF Symbol (proposal) | Root screen | Holds |
| --- | --- | --- | --- |
| **Today** | `newspaper` | Today feed | Daily edition, recent bills, register changes, newly indexed records; Leads in P1 |
| **Your MP** | `person.crop.circle` | Your seat and members | Your MP home; Following (P1); the setup flow |
| **Bills** | `doc.text` | Bills tracker | List, filters, bill detail |
| **Search** | `magnifyingglass` (search role) | Search home | Suggestions, browse directories (parliamentarians and electorates in v1; parties and topics in P1), record results |

The fifth slot is reserved for **Money** (Leads, receipts, grants) when those ship natively. About is a toolbar button on Today and Your MP that opens a sheet, not a tab. On iOS 26 the search tab uses the system search role, which places it at the trailing end of the tab bar.

### Navigation stack

Each tab owns a `NavigationStack` of typed routes that carry identifiers only: `person(slug)`, `electorate(slug, asOf?)`, `party(name)`, `bill(key)`, `document(slug)`, `topic(slug)`, `report(slug, section?)`, `lead(id)`, `searchResults(query, filters)`, `directory(kind, filters)`.

| Moving to | Presentation |
| --- | --- |
| Another OPAX entity or record | Push onto the current tab's stack |
| Filters, sort, "How votes are counted", citation formats, a source's details | Sheet with detents |
| An external source record (APH, AEC, TheyVoteForYou, ParlInfo, GrantConnect, data.gov.au) | `SFSafariViewController`, visibly presented, never hidden (guideline 5.1.1(vii)) |
| A web-only OPAX page (Ask, community, money map, grants, Methods) | Safari, outside the app, with an "Opens on opax.com.au" cue |

Breadcrumbs become the back stack. The web's crumb labels are a good source for back-button titles.

### Universal links

Associated Domains: `applinks:opax.com.au`. The Worker 308s `www.opax.com.au` requests that reach it to the apex (`canonicalPageRedirect`), and Apple's fetcher does not follow redirects. The association file must therefore be served as JSON, without a redirect, on every host the app claims: a static asset outside `run_worker_first` would be, or `www` is simply not claimed.

| Web URL | App screen | Notes |
| --- | --- | --- |
| `/`, `/today` | Today | `/today` is resolved by the app, not by following the 302 |
| `/subject/person/<slug>` | MP profile | A name segment is resolved through the roster, as the web does |
| `/subject/electorate`, `/subject/electorate/<slug>` | Electorates directory, electorate | Keep `?asof=` |
| `/subject/person` | Parliamentarians directory in Search | |
| `/subject/party`, `/subject/party/<name>` | Parties directory, party (P1) | v1: excluded, opens on the web |
| `/bills`, `/bill/<key>` | Bills, bill | Keep list filters |
| `/doc/<slug>` | Record reader | |
| `/ask?view=search…`, `/search…` | Search results | Keep query, filters, sort, page |
| `/subject/topic/<slug>`, `/reports/<slug>[/s/<n>]`, `/discover`, `/declared` | P1 screens | Excluded until they ship |
| `/about` | About sheet | `/methods`, `/stats`, `/expenses` stay web |
| `/ask` (no `view=search`), `/chat`, `/community*`, `/money*`, `/map`, `/connections*`, `/explore*`, `/subject/donor*`, `/subject/supplier*`, `/subject/agency*`, `/subject/campaigner*`, `/og/*`, `/api/*`, `/bill-texts/*`, `/mcp`, `/ingest/*`, `/.well-known/*`, the test harnesses | Not claimed | Opens in Safari |

Any path the app receives but cannot show opens in Safari. A link never lands on an empty screen.

### Share sheet

- Share the canonical web URL: the person slug form, no UTM parameters, no app-only state. Section anchors (`#person-pay`) only when the person shared from that section.
- Title: the page title without the site suffix ("Anthony Albanese"); the URL carries the rest.
- Provide the link metadata locally (title and app icon) so sharing does not fetch the page from the phone. Recipients' apps still fetch the page's own share image.
- Record reader adds **Copy citation**, using the formats on `/methods`.
- Context menus on rows offer Share, Copy link, Follow (P1) and Open on opax.com.au.

### State restoration

- Per scene: selected tab, each tab's route path (identifiers only), the search query and filters, and the expanded state of disclosures. `SceneStorage` with `Codable` routes.
- On the device only: the chosen seat or postcode, follows and their last-seen markers, and the cache with each file's as-of date.
- Restoring shows cached content immediately with its as-of date, then refreshes. Restoration never repeats a paid request; v1 makes none.

## 4. Screen specs for P0

### Shared patterns

**Evidence row.** A figure, its label and a link to its record. Every figure on every screen is one of these. The link opens the record reader for an OPAX record, or the original source in `SFSafariViewController`.

```
$4,537,500                                        >
Contract value · AusTender CN3407266 · 6 Feb 2017
```

**As-at line.** Under each data block: "As at 17 September 2026 · Source: Remuneration Tribunal; Parliamentary Handbook". The date is the source file's own (`pay.json` `meta.as_of`, `bills/index.json` `generated_at`, `interests/recent.json` `meta.generated`, the expenses quarter, the roster check date). `votes.json` carries no as-of date today; the contract should add one.

**Lead card.** A pattern is always a lead, never a finding.

```
Lead · Companies in both
Westpac Banking Corporation appears in party
receipts and contracts
$76,984,493   recorded party receipts        >
$9,102,500    recorded contract value        >
Example records (2)                          >
Matching names are not verified legal identities.
The records can cover different years. No sequence
or causal link is inferred.
```

**Machine text.** Always labelled where it appears: "Machine brief" for briefs; the bill summary's attribution line in full.

**Portraits and people rows.** Portrait, name, party dot with label, then place and date. A person without a portrait gets a blank circle, never initials. Official APH portraits carry their credit on the profile.

**States, everywhere.**

| State | Treatment |
| --- | --- |
| Loading | Layout-stable placeholders (`.redacted(reason: .placeholder)`) in the block's final shape; no spinner over content already shown |
| Empty | Say what is absent, in the web's words where it has them: "No mentions found in the indexed record."; "None of their recorded divisions was a vote on a bill itself." A block with nothing to show for this person is left out, as on the web, rather than shown empty |
| Error | Plain sentence plus Try again. The other blocks keep working: one failed block never blanks the screen |
| Offline | Cached content stays readable with its as-at line. An uncached screen says "This record is not saved on this iPhone yet. It will load when you are back online." |
| Stale | When the cache is older than the latest known refresh: "Saved 2 October 2026" in the as-at line and a refresh in progress; never silently mixed with fresh data |

### 4.1 Today

```
Today                                      (i)
───────────────────────────────────────────────
Today's edition · Saturday 3 October
First Nations
[headline fact from the edition]
Read the report                              >
───────────────────────────────────────────────
Recently introduced bills
Child Support and Family Assistance …        >
  Social Services · introduced 17 Sep 2026
…                                     All bills
───────────────────────────────────────────────
Recent declarations
(photo) Susan McDonald  ● LNP · Senate · Qld
        Sponsored travel or hospitality,
        added 2 Sep 2026                     >
…
As at 4 September 2026 · Registers of interests
───────────────────────────────────────────────
Newly indexed records
…
```

| Order | Block | Data (web source) |
| --- | --- | --- |
| 1 | Following: changes since last look (P1, only when something is followed) | Change markers (contract) |
| 2 | Today's edition | Edition read route (contract); today only `/today` |
| 3 | Recently introduced bills | `/bills/index.json`, newest `introduced` |
| 4 | Recent declarations | `/interests/recent.json` |
| 5 | Newly indexed records | `/api/recent` |
| 6 | Leads (P1) | `/discovery.json` |

No editorial ranking and no hand-picked stories: feeds are date-ordered, as on the web. Pull to refresh.

### 4.2 Your MP

**Setup.**

```
Find your MP
Postcode       [               ]  [Find]
Use my location once                  >
Search for an electorate or a name    >
Your location is used on this iPhone only.
```

Postcode results list every plausible seat, with "A postcode can cover more than one electorate. Choose yours." The location result is labelled "Approximate, from the published boundary outlines".

**Home.**

```
Your MP                                    (i)
Grayndler · House of Representatives · NSW
As at 4 September 2026
───────────────────────────────────────────────
(photo) Anthony Albanese
        ● Australian Labor Party
        Member for Grayndler                >
───────────────────────────────────────────────
Latest in the record
Division · [bill] · voted aye · [date]      >
Speech · [title] · [date]                   >
Register · added [category] · [date]        >
───────────────────────────────────────────────
Your senators (12)                          >
State member
OPAX does not yet have a verified roster of
NSW members.
───────────────────────────────────────────────
Following (P1)
Change seat
```

Bracketed values are placeholders for the live rows. In Victoria, where the roster is verified, the state member card appears in place of the notice.

| Order | Block | Data (web source) |
| --- | --- | --- |
| 1 | Seat header with as-at date | Electorate file; roster date |
| 2 | Member card(s) | Roster, portrait map, party now |
| 3 | Latest in the record | Per-person latest divisions, speeches, register changes (contract slice of `votes.json`, `/api/search`, `/interests/<id>.json`) |
| 4 | Senators for the state | Roster |
| 5 | State member(s), where verified | Electorates release (Victoria only today) |
| 6 | Following (P1) | Local follows |

States: no seat chosen shows Setup; a vacant seat says "Vacant since [date]" from the release, never a guessed holder.

### 4.3 MP profile

```
<  Your MP                        [Share] [···]
(photo)  Anthony Albanese
         ● Australian Labor Party
         Member for Grayndler · NSW
         House of Representatives
───────────────────────────────────────────────
Voting record
2,929 recorded divisions · 1,251 ayes · 1,678 noes
[aye/noe bar]  43% ayes in the federal
parliament, 2006 to 2026
Voted for
Income Tax Rates Amendment (Tax Reform
No. 1) Bill 2026 · 2026                      >
Voted against
[bill] · [year]                              >
How votes are counted                        v
Source: They Vote For You (ODbL)
───────────────────────────────────────────────
What they talk about        [All|Then|Now]
[topic]   [share]  | whole record [share]    >
…
───────────────────────────────────────────────
Declared interests                            >
Declared ties to disclosed money              >
───────────────────────────────────────────────
Speeches                                      >
───────────────────────────────────────────────
Pay for the posts held
$622,102 a year as Prime Minister: the
$239,270 base salary plus a 160% loading,
since 23 May 2022.
[salary entitlement by financial year chart]
As at 17 September 2026 · Remuneration
Tribunal; Parliamentary Handbook
───────────────────────────────────────────────
Claimed expenses                              >
───────────────────────────────────────────────
Party receipts                                >
Party disclosures, not this person's finances.
───────────────────────────────────────────────
Open on opax.com.au · Ask on opax.com.au
```

Figures shown are from the OPAX exports at `8f1305e3` (`votes.json`, `pay.json`); bracketed values are placeholders.

| Order | Block | Data (web source) | Empty or partial state |
| --- | --- | --- | --- |
| 1 | Identity: portrait and credit, name, party now with "formerly", seat, chamber, jurisdiction | Roster (`party_now`, `representation`), `/photos/people.json`, electorates release | No portrait: blank circle |
| 2 | Voting record: totals, aye share, voted for and against (six each), method disclosure, source | Per-person slice of `/votes.json` | Block hidden when no record, as on the web |
| 3 | What they talk about, with era control and whole-record marker | `/api/person-topics`, `/api/topics` | "No topic-labelled speeches are held for this era yet." |
| 4 | Declared interests and declared ties | `/interests/<id>.json`, `/interests/ties-by-donor.json` | Hidden when no register file; state members outside covered registers say so |
| 5 | Speeches, newest first, with machine briefs | `GET /api/search?speaker=` | Witness entries list hearings only |
| 6 | Pay for the posts held | Per-person slice of `/pay.json` | Hidden for state members and service before 1999, as on the web |
| 7 | Claimed expenses by year and category, with benchmark and category definitions | Per-person slice of `/expenses.json`, `/expense-categories.json` | Hidden when none; IPEA starts April 2017 |
| 8 | Party receipts link with its caption | `/graph/money.json` party node | Independent: link to receipts overview on the web |
| 9 | Mentions in parliament (P1), In the news (P1), ministerial diary (P1) | `/api/search`, `/api/news`, `/access.json` | |

The per-person data need for the contract, in one line: roster entry, slug, portrait key and credit, electorate links, votes summary with for and against lists, register file, pay spells, expenses summary, topic profile, and each block's as-of date.

### 4.4 Electorate

```
<  Your MP                                [Share]
Grayndler
House of Representatives · New South Wales
───────────────────────────────────────────────
Latest verified representation
(photo) Anthony Albanese ● Labor             >
As at 4 September 2026. Election winners and
present-day representation can differ.
Representation on another date                >
───────────────────────────────────────────────
[boundary outline] (P1)
AEC election boundary · 2025 election
Simplified for display
───────────────────────────────────────────────
Elections
3 May 2025 · General election                v
  [candidates, primary and two-candidate counts]
21 May 2022 · General election               v
18 May 2019 · General election               v
───────────────────────────────────────────────
Local context (Census 2021)
Population … · Median income … · …
───────────────────────────────────────────────
Related constituencies                       >
Sources and coverage                         >
```

Data: `/electorates/releases/<id>/el_<id>.json` and the release index. The web currently shows the member's party as text only on this page; the app adds the dot and portrait so every people row looks the same. The as-of control maps to a date picker in a sheet; a historical view is labelled "Representation on [date]" and never as current. Census figures keep their 2021 geography label. A multi-member electorate leads with Representatives and never invents a single holder.

### 4.5 Search

```
Search
[ Search people, bills, places, the record   ]
Suggestions (while typing)
  Search the record for "housing"      Search
  Housing                              Topic
  Grayndler                    Federal electorate
  [name]                               Speaker
Browse
  Parliamentarians · Electorates
───────────────────────────────────────────────
Results for "housing"      [Filters] [Sort]
[party: Greens ×] [2020 to 2026 ×]
Speech · [speaker] ● [party] · 12 Mar 2025   >
  Machine brief: …
Division · [question] · 19 Aug 2026          >
```

| Block | Data (web source) |
| --- | --- |
| Suggestions | On-device indices from `/speakers.json`, electorates index, `/graph/money.json` labels, topic list, `/reports/index.json`, `/bills/index.json` titles |
| Browse | `/parliamentarians.json`, electorates index (parties and topics join in P1) |
| Results | `GET /api/search` (`q`, `kind`, `speaker`, `party`, `state`, `topic`, `from`, `to`, `sort`, `page`) |
| Briefs | `/api/brief` |

States: under two characters shows Browse; no results says what was searched and offers to clear each filter, as `renderSearchRecovery()` does; a rate-limit response says "Search is busy. Try again in a minute."

### 4.6 Bills

```
Bills                                    [Filter]
[Before parliament | Recent | All]
───────────────────────────────────────────────
Child Support and Family Assistance Legislation
Amendment (Ending Financial Abuse in the Child
Support Scheme No. 1) Bill 2026
Before parliament · Social Services
Introduced 17 Sep 2026                       >
…
As at 29 September 2026 · ParlInfo bill records
```

Data: `/bills/index.json` (`status`, `introduced`, `portfolio`, `sponsor`, `has_summary`, `divisions`, `speeches`). Filters: status, year, parliament, has summary. Search within bills uses the same on-device index. 1.7 MB is acceptable once and then cached, but the contract may prefer a smaller list file.

### 4.7 Bill detail

```
<  Bills                          [Share] [···]
Interactive Gambling (Cost Recovery Levy) Bill 2026
Passed · as at 26 Aug 2026
Infrastructure, Transport, Regional Development,
Communications, Sport and the Arts
Introduced 17 Aug 2026 in the House of
Representatives
───────────────────────────────────────────────
In short · Machine summary
This bill would charge licensed online wagering
providers a levy to fund regulation of wagering
advertising. …
What it changes
• …
Who is affected
…
Written by a model from the explanatory
memorandum; not the record.
───────────────────────────────────────────────
Key dates
Introduced · House · 17 Aug 2026             >
Third reading · House · 18 Aug 2026          >
───────────────────────────────────────────────
Divisions
19 Aug 2026 · Senate · Limitation of debate
Negatived · 11 ayes, 24 noes
Party splits                                 v
  ● Labor         0 ayes · 21 noes
  ● Greens        9 ayes · 0 noes
  …
───────────────────────────────────────────────
Speeches                                      >
Sources: explanatory memorandum, bill home,
the Act on the Federal Register               >
```

Data: `/bills/<key>.json` (values above are from `au-federal-r7534`). Party splits read each voter's party at the division's date (`meta.party_basis_note` in the index), and that note belongs in the splits disclosure. Outcomes use the web's words, "Agreed to" and "Negatived". A missing sponsor is said in words ("Sponsor not recorded"); the web currently also draws a party dot labelled "Not recorded" beside it, which the app should not copy. Exposure drafts show their consultation details and "became" link.

### 4.8 Record reader

```
<  Back                          [Share] [Cite]
(photo) [Speaker]
● [party] · House of Representatives
12 March 2025 · [debate title]
[topic tags]
───────────────────────────────────────────────
Machine brief
[brief]
───────────────────────────────────────────────
[speech text in Merriweather, interjections
indented and italic]
───────────────────────────────────────────────
Original record (ParlInfo)                    >
Similar records                               >
Related bill                                  >
```

Data: `GET /api/resource/<slug>`, `/api/brief`. Divisions show the question, outcome, ayes and noes and the member lists. Long text stays selectable and readable at every Dynamic Type size. The caveat banners the web shows for repaired or partial records come across unchanged.

### 4.9 About and sources

A sheet with grouped sections (the one place a native grouped list fits):

1. What OPAX is: one paragraph beginning "The Open Parliamentary Accountability Exchange brings together", and "OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party."
2. Coverage: counts and as-at dates from `/corpus.json` and `/api/stats`.
3. Sources and licences: the per-source list from the About page, each with its licence.
4. Machine-written text: what is written by models and how it is labelled.
5. Corrections and contact.
6. Privacy: what the app stores on the device and what it sends (section 8).
7. Open source and acknowledgements, including the font licences.

## 5. Design language mapped to native

### Colour

The web is "Light-only by design" (`style.css`). The light tokens translate one to one into an asset catalog. Ratios are WCAG 2.x contrast against `--paper` unless noted.

| Token | Hex | Role | Contrast |
| --- | --- | --- | --- |
| `--paper` | `#FAF9F6` | Page background | n/a |
| `--paper-raised` | `#FFFFFF` | Raised surfaces | n/a |
| `--paper-sunken` | `#F1EFE8` | Subdued surfaces | n/a |
| `--ink` | `#23271F` | Primary text | 14.44:1 (15.20 on raised, 13.21 on sunken) |
| `--ink-soft` | `#575C52` | Secondary text | 6.52:1 (5.97 on sunken) |
| `--ink-faint` | `#6F7468` | Tertiary text | 4.56:1: passes AA, with no margin |
| `--bronze-ink` | `#8A5A12` | Record links, highlights | 5.62:1 (4.67 on the bronze wash) |
| `--bronze` | `#A0761B` | Rules and chart marks only | 3.91:1: not for text |
| `--bronze-wash` | `rgba(160,118,27,0.16)` = `#ECE4D3` on paper | Tag fill | `--ink` on it 12.02:1 |
| `--danger` | `#A4262C` | Errors, destructive actions | 6.90:1 |
| `--navy` | `#142A43` | Structure, primary actions | `--on-navy` white on it 14.56:1 |
| `--on-navy-soft` | `#B7C6D9` | Secondary text on navy | 8.39:1 on navy |
| `--bronze-bright` | `#D9A84A` | Bronze on navy (the mark) | 6.69:1 on navy |
| `--divider-default` | `#B8B4A8` | Major section rules | 1.97:1, decorative |
| `--divider-subtle` (`--line`) | `#DFDCD2` | Rows, subheadings | 1.30:1, decorative |
| `--line-strong` | `#8D897B` | Control boundaries only | 3.33:1: meets 3:1 for controls |

Party colours (dot only, always with a label):

| Party | Light | Dot contrast on paper | Proposed dark | Dot contrast on dark |
| --- | --- | --- | --- | --- |
| ALP | `#B02E33` | 6.07:1 | `#E5676B` | 5.53:1 |
| Liberal | `#1D4F91` | 7.73:1 | `#7FA7E0` | 7.25:1 |
| Nationals, CLP | `#8F6E00` | 4.53:1 | `#D4B04A` | 8.61:1 |
| LNP | `#4A90D9` | 3.17:1 | `#7FB6EC` | 8.35:1 |
| Greens | `#2E7D32` | 4.87:1 | `#6DBB71` | 7.67:1 |
| One Nation | `#BF5B15` | 4.22:1 | `#EE9257` | 7.57:1 |
| Independent | `#3E5B77` | 6.72:1 | `#93AECB` | 7.80:1 |
| Other | `#7C6690` | 4.79:1 | `#B8A3CC` | 7.80:1 |

All light dots clear the 3:1 non-text minimum. The light party colours fall to 2.2 to 3.8:1 on a dark background, so a dark palette needs its own party set.

**Proposed dark palette (a proposal, not a decision).** It keeps the broadsheet roles: a navy-black ground, warm off-white ink, bronze lightened for links.

| Role | Proposed hex | Contrast on the dark ground |
| --- | --- | --- |
| Ground (`paper`) | `#101820` | n/a |
| Raised | `#17222D` | n/a |
| Sunken | `#0B1117` | n/a |
| Ink | `#ECE9E1` | 14.75:1 (13.28 on raised) |
| Ink soft | `#B9B5AA` | 8.74:1 |
| Ink faint | `#9C9A92` | 6.35:1 |
| Bronze ink (links) | `#E0B565` | 9.35:1 |
| Bronze (rules) | `#C99A3A` | 6.96:1 |
| Danger | `#F28B82` | 7.49:1 |
| Control boundary | `#76808A` | 4.45:1 |
| Divider default | `#46525E` | 2.24:1, decorative |
| Divider subtle | `#2E3A46` | 1.54:1, decorative |

With **Increase Contrast** on, each text token steps to the next stronger one (faint to soft, soft to ink) and subtle dividers take the default divider colour.

### Type

**Licences and files.** Both families are under the SIL Open Font License 1.1, with the licence texts in `portal/public/fonts/`. Merriweather carries the Reserved Font Name "Merriweather"; Public Sans has none. The web files are Google Fonts subsets in WOFF2 split by script (latin, latin-ext, vietnamese): Merriweather 2.100, a variable font (weight 300 to 900, declared 400 to 900) with a separate italic (2.101); Public Sans 2.001, variable (weight 100 to 900, declared 400 to 700), roman only. Both have tabular figures (`tnum`).

For iOS, bundle the unmodified upstream TTFs from each project's release rather than converting the web subsets. Unmodified files keep the Reserved Font Name question out of the way, cover every script in one file, and register cleanly with `UIAppFonts`. Static instances (Merriweather Regular, SemiBold, Bold and Italic; Public Sans Regular, SemiBold, Bold) are simpler to address than variable axes. The OFL text goes in the app's acknowledgements.

**Mapping to text styles.** Each custom style is declared with its base size and the text style it scales with (`Font.custom(_:size:relativeTo:)`, or `UIFontMetrics(forTextStyle:)` in UIKit), so every size follows Dynamic Type up to AX5.

| Role | Web | Font and weight | Base size (pt) | Scales with |
| --- | --- | --- | --- | --- |
| Screen title | `--heading-page`, Merriweather 400 | Merriweather Regular | 34 | `.largeTitle` |
| Section heading | `--heading-section`, Merriweather 600, 22.4 px | Merriweather SemiBold | 22 | `.title2` |
| Subsection heading | `--heading-subsection`, Merriweather 600, 18 px | Merriweather SemiBold | 18 | `.title3` |
| Record text (speeches, report prose) | `.doc-text`, Merriweather 400, 17 px, line height 1.8 | Merriweather Regular, generous line spacing | 17 | `.body` |
| Interjections | Merriweather italic | Merriweather Italic | 17 | `.body` |
| Body and interface text | Public Sans 400, 16 px | Public Sans Regular | 17 | `.body` |
| Lede | Public Sans | Public Sans Regular | 16 | `.callout` |
| Metadata lines | `.result-meta` | Public Sans Regular, `ink-soft` | 15 | `.subheadline` |
| Fine print, source and as-at lines | `.fineprint` | Public Sans Regular, `ink-soft` | 13 | `.footnote` |
| Figures in tiles | Public Sans 700 | Public Sans Bold, tabular | 28 | `.title` |
| Tags, chips, kicker | Public Sans 600, 13 px | Public Sans SemiBold | 13 | `.footnote` |
| Tab bar, navigation bar buttons, alerts, menus | system | SF Pro (system) | system | system |

System chrome stays in SF Pro: the tab bar, bar buttons, menus, alerts and the keyboard. The house fonts are for content.

**Dynamic Type to AX5.** At AX5, `.body` is about 53 pt. Rules: no `lineLimit` on names, bill titles, figures or labels; side-by-side layouts (tiles, voted for and against columns, figure and label) stack vertically at accessibility sizes; charts gain a table view; nothing is clipped to a fixed height. Navigation titles in Merriweather are set through the bar appearance with a scaled font, so they grow too.

### Spacing, rules, targets and controls

**Spacing.** The phone column of the web scale, exactly: 4, 6, 8, 16, 26, 32 and 52 pt (`--space-1` to `--space-7` at 700 px and below). Screen side margins are 20 pt, matching `.wrap` at 390 px. The row gap is 8 pt either side of a hairline; a second list within a section starts 32 pt down; a section starts 52 pt down.

**Rules.** 1 pt rules (one CSS pixel is one point): `divider-default` between major sections, `divider-subtle` for rows and subheadings, bronze only for intentional accents. Lists use the plain style with hairline separators and serif section headers. Do not wrap sections in inset-grouped cards: the web avoids "a card or filled box merely to create a section boundary". The grouped style is right for About and filter sheets, which are settings-like.

**Targets.** 44 by 44 pt minimum for anything tappable. The web's sizes map as compact 44, default 48 and large 56 pt minimum heights, growing with text rather than clipping. Corner radius 4 pt for buttons, fields, chips and tags.

**Buttons.** Primary: navy fill, white label. Secondary: outlined with `line-strong`. Quiet: plain text button. Destructive: the `destructive` role, in `danger`. There is no bronze or gold button.

**Tags.** Topic metadata: bronze-wash fill, a decorative hash glyph, `bronze-ink` label, 28 pt visual height inside a 44 pt hit area. A tag is never a filter control or a submit button.

**Filter chips.** Applied filters, shown as removable search tokens or a wrapping chip row under the search field. The whole chip removes the filter, with an accessible name like "Remove the party filter, Australian Greens". 4 pt radius, not capsules.

**Segmented control.** For one choice among peers (the topic era All, Then, Now; bill status). Use the native segmented picker at `.controlSize(.large)` and measure its height with the Accessibility Inspector; if it is under 44 pt, use the house version (48 pt outside height, 4 pt radius) instead.

**Party identity.** A 10 pt dot plus a readable label, never colour alone. Full names on profiles; the web's short labels (ALP, LIB, GRN) only in dense rows, with the full name as the accessibility label.

### Mark, wordmark and app icon

**What exists.**

- The masthead mark: mainland Australia and Tasmania in `--bronze-bright` (#D9A84A), with seven small four-pointed stars in `--on-navy-soft` arced around it, on the navy masthead.
- The wordmark: "OPAX" in white beside the mark. The X is not styled separately.
- The favicon: a seven-pointed star in #D9A84A on a navy rounded square. Note that a seven-pointed star on navy is the shape of the Commonwealth Star.

**App icon directions (for Jake).**

1. **The Australia mark alone** (recommended): gold land on navy, stars dropped or reduced to what survives at 60 pt and in the small Settings sizes. It reads as OPAX without borrowing national symbols.
2. **The full masthead mark** with the arc of stars. Closest to the web, but the stars blur at small sizes and, with navy and gold, lean towards the look of official insignia.
3. **The favicon star.** Not recommended: a gold seven-pointed star on navy looks like the Commonwealth Star, which invites the "is this a government app" question that sections 6 and 8 work to avoid.

Whichever direction is chosen: no text in the icon; layers prepared for iOS 26's default, dark, clear and tinted appearances (land and background as separate layers); no coat of arms or crest anywhere in the app or its listing. The launch screen is the navy ground with the mark only.

**Decoration.** Hairline bronze line work and restrained motion, as with the web's wombat loader: one quiet beat at most, nothing that reads as a mascot.

### What translates, what becomes native, what not to copy

| Translates directly | Becomes a native idiom | Do not copy from the web |
| --- | --- | --- |
| Colour roles and tokens; light palette | Tab bar instead of the masthead, megamenus and hamburger drawer | Hash routes and the hash-to-path folding |
| Merriweather for headings and the record, Public Sans for interface text | Large titles instead of the masthead heading | Breadcrumb strip (the back stack replaces it) |
| Hairline section structure; no boxes as boundaries | `.searchable` with suggestions instead of the header search panel | Sticky header and Safari viewport tricks |
| Party dot plus label | Sheets with detents for filters, options, "How votes are counted", citation | Hover popovers (expense terms become a tap-to-open popover or sheet) |
| Bronze reserved for record links, tags and accents | Context menus on rows: Share, Copy link, Follow, Open on opax.com.au | Carousel prev and next buttons (use a native scroll) |
| Evidence-first copy, labels on machine text, as-at dates, disclosed caveats | Swipe actions in Following: unfollow, mark as seen | The 3D money map, journeys and the Explore games |
| Blank circle for a missing portrait | Pull to refresh on Today, Your MP and Bills | The docked assistant, voice panel and question builder; at 390 px the dock's floating button sits over body text on bill, electorate and contracts pages |
| 4 pt radius, 44 pt targets | Swift Charts with audio graphs for votes, pay and topic shares | Analytics scripts (PostHog, Google Tag Manager): the app ships none in v1 |
| `DisclosureGroup` for method notes | `SFSafariViewController` for external sources; `ShareLink` for sharing | Capsule chips, gold or bronze buttons, uppercase eyebrows beyond the kicker, a separately styled X |

## 6. Copy and voice

### Rules

- **Name.** "Open Parliamentary Accountability Exchange", exactly. "OPAX" in short. The X is not styled separately, so "eXchange" is wrong. (The About page currently says "the Open Parliamentary Accountability eXchange"; the app follows `docs/UI_DESIGN_LANGUAGE.md`, and the web may want the same fix.) The web mixes "OPAX" and "Opax" (the voice panel and community use "Opax"); the app uses "OPAX" throughout unless Jake decides otherwise.
- **Tone.** Plain, exact, evidence-first, non-partisan. Say what the record shows and stop. No hype ("powerful", "AI-powered", "uncover the truth").
- **Headings** have no full stops. No em dashes anywhere. No redundant instructions or helper hints ("Tap a band to filter"); controls speak for themselves.
- **Leads, not accusations.** Use descriptive verbs: "appears in both", "accounts for 78% of", "gave", "declared", "voted for". Never "bought", "corrupt", "rort", "influence", "scandal", "secret", "linked to" (as insinuation) or "exposed".
- **Standing caveats**, kept in the web's words:
  - "Party disclosures, not this person's finances."
  - A donor receiving a grant "is a fact on the public record, not a finding".
  - Registering on the foreign influence scheme "is a legal disclosure, not a finding of wrongdoing".
  - "Every donation, meeting and grant figure here is a floor, not a ceiling."
  - On expenses: "a bar past its tick is a fact, not a finding."
  - On pay: "These are entitlements set by instrument, not payslips."
  - On leads: "Matching names are not verified legal identities"; "No sequence or causal link is inferred."
  - On grants: an award is not a payment; an invitation or application is not an award.
- **Machine text** is always labelled: "Machine brief"; "Written by a model from the explanatory memorandum; not the record". It is never called "the record".
- **Balance.** Where parties are grouped, Labor, the Coalition and the crossbench appear together, in that order, in the same words whichever government is in office.
- **No editorial picks.** Feeds are date-ordered or reproducible; no "top stories" chosen by hand.

### Numbers and dates

- Locale en-AU. Counts with thousands separators: 13,867.
- Money: to the dollar for records and rates of pay ("$4,537,500"; "$622,102 a year"). In running text, "$4.7 million". Compact forms only in charts and tight figures, in one style. The web has three today: "$24.4M" and "$507K" (`fmtMoney` on entity pages), "$2.3bn" and "$211.6m" (the contracts view) and "$10m" (the daily edition). This document proposes "$4.7m" and "$2.3bn" for the app.
- Percentages: one decimal for shares of a whole (78.4%); whole numbers that add to 100 where a set of shares is shown together (largest remainder), as the grants exports do.
- Dates: "17 September 2026"; "17 Sep 2026" in dense rows. The web mixes "4 Sept 2026" (electorate pages) with "26 Aug 2026" (bills); the app uses three-letter months throughout. Financial years with an en dash: "2024–25". Ranges in prose: "1998 to 2026".
- As-at dates: the web says both "As of 4 Sept 2026" (electorates) and "as at 26 Aug 2026" (bills, pay). The app uses "As at", the Australian form, followed by the source and, where it applies, the licence: "As at 17 September 2026 · Source: IPEA quarterly expenditure reports, CC BY 4.0, to June 2026".

### App Store drafts for Jake

> **DRAFT, for Jake's decision. Not final copy.**
>
> **Name** (30 characters at most): "OPAX". If unavailable: "OPAX Accountability".
>
> **Subtitle** (30 at most), options:
> 1. "What MPs say, do and disclose" (29 characters; echoes the homepage heading)
> 2. "Australian politics on record" (29)
> 3. "Parliament's public record" (26)
>
> **Promotional text** (170 at most): "Find your MP and see their votes, speeches, declared interests and pay. Follow bills through parliament. Every figure links to the public record it comes from." (159 characters)
>
> **Description, first lines:** "The Open Parliamentary Accountability Exchange (OPAX) puts the public record of Australian politics in one place: what members said, how they voted, what they declared and who gave money to their party. OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party."

Subtitles avoid unverifiable claims ("most complete", "trusted"), as guideline 2.3.7 requires.

## 7. Accessibility and inclusion

**Dynamic Type to AX5, with no truncated meaning.** Every screen is checked at the default size, at AX1 and at AX5. Names, bill titles, figures and caveats wrap; side-by-side layouts stack; charts offer a table; nothing important sits in a fixed-height container. Check with Xcode's Accessibility Inspector and the simulator's Dynamic Type override, not with speech.

**VoiceOver labels (spec; to be verified in the Accessibility Inspector).**

| Element | Label |
| --- | --- |
| Party dot | Hidden from VoiceOver; the party name is in the row's text |
| People row | "Anthony Albanese, Australian Labor Party, Member for Grayndler, New South Wales" |
| Aye and noe bar | "43 percent ayes, 57 percent noes", the web's own `role="img"` label format |
| Topic bar | "[Topic], [share] percent of their labelled speeches. Whole labelled record, [share] percent." |
| Pay chart | Audio graph through the chart descriptor (`AXChartDescriptor`), with the values also in a table |
| Division party split | "Greens, 9 ayes, no noes" |
| Lead card | Title, then each metric as "label, value", then the caveats; the evidence link last |
| Evidence row | "4,537,500 dollars, contract value, AusTender CN3407266, 6 February 2017, opens the source" |
| Tag | "Topic: Housing" |
| Filter chip | "Remove the party filter, Australian Greens" |
| Portrait | "Official portrait of [name]", or hidden when the name is beside it; portraits ignore Smart Invert |

Values come from the examples in section 4; bracketed values are placeholders.

**Reduced motion.** No auto-advancing carousels; no animated map; cross-fades instead of slides where the system allows; the loader becomes static.

**Meaning never depends on colour.** Party by label; ayes and noes by word and number; lead categories by text; bill status by text; required and error states by text and icon.

**Contrast.** Text tokens meet 4.5:1, except `--bronze`, which is reserved for rules and chart marks (3.91:1). `--ink-faint` passes at 4.56:1 with no margin, so it is not used for running text. Increase Contrast steps every token up one level.

**Also supported:** Bold Text; Voice Control, with visible labels that match accessibility labels; Full Keyboard Access; the Large Content Viewer for the tab bar; en-AU language tagging so names and party abbreviations are read sensibly.

**Inclusion.** Portraits include former parliamentarians who have died. Many Australian publishers warn Aboriginal and Torres Strait Islander readers that a page may contain images and names of people who have died; the web has no such notice today. This is an open question (section 9), not a recommendation made here.

## 8. App Store and policy notes

Checked 3 October 2026 against the App Review Guidelines, last updated 8 June 2026.

| Guideline | What it says (short) | What it means for OPAX |
| --- | --- | --- |
| **5.1.1(viii)** | "Apps that compile personal information from any source that is not directly from the user or without the user's explicit consent, even public databases, are not permitted." | **The largest review risk.** OPAX compiles public records about named people. Keep v1 to elected office holders and their official conduct (votes, speeches, registers, pay, expenses); keep private individuals (individual donors, grant recipients identified as persons, committee witnesses) out of the app as entity pages; explain the sources and the public-office scope in the review notes, with a link to Methods. |
| 1.1.1 | No defamatory or mean-spirited content that could "humiliate, intimidate, or harm a targeted individual" | Leads, not accusations; caveats stay visible; corrections path in About. |
| 1.1.6 | No false information | Machine text labelled; as-at dates; sources on every figure. |
| 1.5 | Support URL and an easy way to contact the developer | OPAX has no dedicated inbox today; GitHub issues alone may not satisfy review. |
| 2.3, 2.3.7, 2.3.9 | Accurate metadata; name 30 characters; no unverifiable claims; rights to materials in screenshots | Screenshots show the real app. APH portraits are CC BY-NC-ND, so marketing screenshots should avoid them or use openly licensed portraits. |
| 4.2, 4.2.2 | More than a repackaged website; not primarily a content aggregator or collection of links | Your MP, local follows, the native reader and offline cache are the app-like core; web-only areas are links, not the product. |
| 5.1.1(i) | Privacy policy in the metadata and in the app | Needs an app privacy policy page; the existing privacy text covers community accounts. |
| 5.1.1(iv) | Respect permissions; offer alternatives (for example manual entry instead of Location) | Postcode and search as alternatives to location. |
| 5.1.1(v) | Account deletion in the app if accounts can be created | Blocks community in the app until deletion exists. |
| 5.1.1(vii) | `SFSafariViewController` must be visible, not hidden | External sources open visibly. |
| 5.1.2(i) | Explicit permission before sharing personal data with third parties, including third-party AI | Applies to a native Ask (model provider) or voice (voice provider). |
| 1.2 | UGC needs filtering, reporting, blocking and published contact | Applies if community ships in the app. |
| 4.8 | Third-party sign-in requires an equivalent privacy-preserving option | Not triggered by OPAX's emailed sign-in links. |
| 5.2.1, 5.2.2 | Only content you own or are licensed to use; no misleading representations | Federal Hansard and the House and Senate registers are CC BY-NC-ND: the app must stay free, with no ads or in-app purchase, and registers appear as facts with links, as on the web. TheyVoteForYou data is ODbL with attribution. Portraits carry their individual licences and credits. |

**Not a government app.** No guideline names government affiliation directly. The relevant rules are 2.3 (accurate metadata) and 5.2.1 ("misleading … representations"). The description, the About sheet and the review notes should all say that OPAX is independent and not affiliated with any parliament, government or party; the icon and screenshots should avoid national insignia.

**Data collected (for the privacy label).** v1 as scoped stores the seat, follows and cache on the device and sends no identifiers. Requests still reach the Worker with an IP address, which the rate limiters read and Worker logs may record. Whether that counts as collection under Apple's definition depends on retention, and needs Jake's check before the label is filled in.

**Age rating.** Political public records, no objectionable content. Two answers need care: user-generated content (only if community ships) and whether opening source pages in `SFSafariViewController` counts as unrestricted web access.

**Code licence.** The OPAX code is AGPL-3.0. Distributing AGPL code through the App Store is legally contested. Jake can license the iOS code on its own terms as its copyright holder, but any code reused from contributors to the web app needs their permission. This is not a review guideline, but it should be settled before the first submission.

## 9. Open questions for the maintainer

1. **Disconnect score.** Confirm it stays out of v1, or name the method and owner if it returns.
2. **Postcode lookup.** Will the electorates release publish a sourced, dated postcode-to-division table? Without it, Your MP launches with location and search only.
3. **Daily edition.** Can the Worker expose the latest edition as a read route, so Today does not depend on the `/today` redirect?
4. **Dark mode.** Keep the app light-only like the web, or adopt the proposed dark palette?
5. **App icon.** Australia mark alone, the full masthead mark, or something else?
6. **Private individuals.** Agree that individual donors, persons as grant recipients and committee witnesses stay off app entity pages (guideline 5.1.1(viii))?
7. **Contact.** Which support URL and contact address can be published for guideline 1.5 (and 1.2 if community ships)?
8. **Developer account.** Submit as Jake Tracey or as an organisation? This affects 5.2.1 and the seller name shown on the store.
9. **Code licence.** AGPL for the iOS app, or a separate licence?
10. **Name casing.** "OPAX" everywhere, retiring "Opax" in voice and community copy?
11. **Money format.** "$4.7m", "$4.7M" or "$4.7 million" in compact positions?
12. **Cultural notice.** Add a notice about images and names of people who have died, on the web and in the app?
13. **IP addresses.** How long do Worker logs and limiters keep client IPs? The answer decides the privacy label.
