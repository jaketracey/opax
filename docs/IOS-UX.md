# OPAX for iOS: surfaces, UX and design language

Discovery, 3 October 2026, revised the same day after review. This is the product and UX half of the iOS discovery and feeds the public design document `docs/IOS-APP.md`. Data, the API contract and the native architecture comparison are in `docs/IOS-API-CONTRACT.md`. The voice assistant's protocol, audio path and Worker changes are in `docs/IOS-VOICE.md`; this document covers the voice screens and sign-in experience and refers to that document for everything underneath them.

**Scope decision.** Version 1 is read-only public data plus the voice assistant. Every public screen works without an account. Voice is the one signed-in feature, behind the existing community email sign-in, so the app must also let people delete that account. Community discussions, synced follows and push notifications are not in v1.

Nothing here is built. Statements about the web app were read from the source at commit `8f1305e3` or from a local render of it, unless they say otherwise. Sizes are raw file bytes in decimal units (1 MB is 1,000,000 bytes), not compressed transfer sizes.

## How this was gathered

- **Source.** `portal/public/navigation.js`; `route()` in `portal/public/app.js`; the Worker's route table in `portal/src/index.ts` (`route()`, `apiUnifiedSearch()`, `matchSeoRoute()`, `STATIC_PAGES`) and `portal/src/page-entry.ts`; `portal/public/community.js`; every HTML file in `portal/public/`; the page modules; `style.css` and `ui-controls.css`; and the docs named in each section.
- **Renders.** Pages served from `portal/public` by a local static server and captured in headless Chrome at 390 and 1440 CSS pixels, with analytics scripts and every request to opax.com.au blocked. `/api` was not reachable in that setup, so sections that need it rendered their error states. No Ask, chat, voice, community or question-builder request was made anywhere, locally included.
- **Production.** Two plain GETs with an identified user agent: `/today` (to read its redirect) and `/sitemap.xml`. No browser was pointed at opax.com.au.
- **Apple.** The App Review Guidelines, fetched 3 October 2026. The page states "Last Updated: June 8, 2026".

## 1. Surface inventory

### How completeness was checked

The inventory was built from five lists and reconciled by hand:

1. `navigation.js`: the seven `sections` (Ask & search; Topics; People & organisations with 8 destinations; Money; Bills; Reports with 8 destinations; About with 6 destinations) and the five `money` sub-navigation links.
2. `route()` in `app.js`: every branch. `subject` (supplier, agency, topic, a named entity, a directory), `bill` and `bills`, `declared`, `doc`, `chat`, `search`, `discover`, `reports`, `money` (receipts, grants list, a grant recipient, the month's largest grants), `connections`, `money` (the map), `explore` (nine modules), `about`, `methods`, `stats`, `expenses`, and the default branch (Ask, or a not-found trail for an unknown path).
3. The Worker: `pageEntry()` (`/` serves `home.html`; `/search` and `/?q=` redirect into Ask or Search), `matchSeoRoute()` (static pages, reports, topics, directories, subjects, documents, bills, grant recipients), and the special routes `/today`, `/community`, `/map`, `/og/*`, `/bill-texts/*`, `/mcp`, `/ingest/*` and `/api/*`.
4. The community views dispatched by `community.js`.
5. The 12 HTML files in `portal/public/` and `.assetsignore`.

A script then loaded `navigation.js` in Node and confirmed that each of its 30 distinct destinations appears in the tables (the seven report links through the reports row), that every `route()` view and all nine Explore modules are named, and that all 12 HTML files are listed.

A cross-check against the production sitemap (25,125 URLs on 3 October 2026) found no page kind missing. Every sitemap count below includes the directory's own index page: 21,459 supplier URLs, 1,562 people, 814 donors, 626 electorates (625 electorates plus the index), 439 campaigners, 165 agencies, 22 topics (21 topics plus the index), 20 parties and 8 reports (7 reports plus the index), with the static pages. No `/bill/` page is in the sitemap.

**Verdicts.** *Core v1*: ships natively in the first release. *Later*: a native candidate after v1, with its priority from section 2. *Web only*: stays on opax.com.au; the app links to it and does not imitate it.

**Cost classes.** Following the API contract, a block is *static* when it reads published files, *catalog* when it uses the catalog-only branch of `/api/search-all`, and *ARAG* when it reads the knowledge-box service (search, reranking, record text, stored briefs, facets, recent records, live counters), even though no answer is written. Model generation and voice are separate, paid classes.

### Home and research

| Surface | Web route | Purpose | Data it shows (source, cost class) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Homepage | `/` (serves `home.html`) | Front door: purpose, research entry, latest records | Purpose statement; Ask and Search entry with sample questions; money map embed; Browse the record; topics and reports; Spotlight; recently introduced bills; recent declarations; newly indexed records; From the record; Collection & coverage. `home-data.js` reads static `/bills/index.json`, `/interests/recent.json`, `/graph/money.json`, `/graph/grants.federal.json`, `/votes.json`, `/photos/people.json`, `/reports/index.json`, `/corpus.json`, and ARAG `/api/recent`, `/api/stats` | Ask or search; filter the map; step the carousel; choose the Spotlight topic | **Core v1, recomposed** as the Today tab from its static feeds. Newly indexed records, the map embed and Spotlight are later. |
| Ask | `/ask`, `/ask?q=` | An answer written by a model from retrieved records, with citations | `POST /api/ask` (model generation); calculated money and pay answers; sources | Question, filters, Build a question, follow-ups | **Web only** in v1; the app links to it. Native Ask is P2. |
| Keep asking | `/chat` | A conversation over the record | `/api/ask`, `/api/followups`; conversations kept in the browser and, for members, in `member_chats` | Follow-ups, saved conversations | **Web only.** |
| Voice ("Talk to Opax") | Panel opened from the chat composer's microphone; `/api/voice/*` | Spoken conversation over the public record, 600 seconds in total per ordinary account | Status, reservation, WebSocket relay, server tools; signed-in member session (paid third party) | Start talking, mute, end; transcript and sources | **Core v1** as a native screen, the one signed-in feature (sections 2 and 4.10). |
| Chat dock | Bottom-right dock on app pages | Keeps the chat panel open beside a page | `#panel-chat` lifted into a dock | Open, close | **Web only.** |
| Search | `/ask?view=search` (legacy `/search` redirects) | Find people, money, registers, bills and documents | `GET /api/search-all`: the catalog branch for catalog kinds (person, party, donor, agency, supplier, receipt, contract, grant, interest, expense, access, campaigner, report, pay); `kind=all` and `kind=bill` also call document search, which reaches ARAG `/api/search`. Machine briefs from ARAG `/api/brief`; a model-written summary from `/api/search-summary` | Query, filter chips, sort, paging, export | **Core v1 for selected catalog kinds only.** Document search is P1; the generated summary stays web only. |
| Quick search suggestions | Header search panel and the menu drawer | Jump straight to an entity | Built in the browser from the electorates index, `/speakers.json`, the topic list, `/graph/money.json` nodes and the reports index (static) | Type two characters; arrows, Enter, Escape | **Core v1** as native suggestions, limited to destinations the app shows natively (section 2). |
| Document | `/doc/<slug>` | One record: a speech, division, release, bill text or grant record | ARAG `/api/resource/<slug>` and `/api/brief`; similar records through search | Cite, similar, speaker, original source | **Later (P1).** In v1, record links open on opax.com.au or at the original source. |

### People and organisations

| Surface | Web route | Purpose | Data it shows (source, cost class) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Parliamentarians directory | `/subject/person` | Browse everyone in the roster | `/parliamentarians.json` (405.7 kB; 1,557 people, 313 flagged current) | Filter by chamber, party, state; search | **Core v1**, inside Search. |
| Parliamentarian | `/subject/person/<slug>` (a name URL 301s to the slug) | Everything the record holds on one person | Static: portrait and credit (`/photos/people.json`); party now and "formerly"; jurisdiction, chamber, electorate links (electorates release); Voting record (`/votes.json`, 1.30 MB); Declared interests and declared ties (`/interests/<id>.json`, `/interests/ties-by-donor.json`); Ministerial diary for NSW and Queensland ministers (`/access.json`); Pay for the posts held (`/pay.json`, 589.8 kB); Claimed expenses (`/expenses.json`, 462.7 kB). ARAG: What they talk about (`/api/person-topics`, `/api/topics`); Speeches and Mentions (`/api/search`, `/api/brief`). RSS: In the news (`/api/news`). Web order: topics, votes, interests, speeches, diary, news, pay, expenses, mentions | Jump links; All, Then, Now era toggle; "How votes are counted"; ask about their speeches; party receipts link captioned "Party disclosures, not this person's finances." | **Core v1** with its static blocks. Topics, speeches and mentions are P1 (section 4.3). |
| Committee witness | Same route, when the record names only a witness | Hearing appearances, without asserting a person | ARAG `/api/search` | Open the evidence | **Web only.** No native profile for people outside the roster (section 2, "Who gets a native page"). |
| Electorates directory | `/subject/electorate` | 625 constituencies in nine jurisdictions | `/electorates/manifest.json` and the release index (static) | Filter by parliament, chamber, state, party | **Core v1**, behind Your MP and Search. |
| Electorate | `/subject/electorate/<slug>`, `?asof=YYYY-MM-DD` | Who represents a place, and its elections | Representatives with a verified-as-of date; historical lookup; election timeline with candidates and counts; display outline; Census 2021 profile; related upper-house constituencies; sources (`/electorates/releases/<id>/el_*.json`, static) | Change the as-of date; expand an election | **Core v1.** The outline map is P1. |
| Parties directory and party | `/subject/party`, `/subject/party/<name>` | A party's money, members and votes | Static: received total and rank, where it came from (`/graph/money.json`, 681.1 kB); receipts on the return, debts, associated entities (`/graph/aec-extras.json`); members; bill divisions with party splits; access records. ARAG: In parliament. RSS: news | Explain this money; open a donor | **Later (P1)** as a basic native page. The money map part stays web only. |
| Donors directory and donor | `/subject/donor`, `/subject/donor/<name>` | Who gives, and to whom | Money graph (400 donor nodes, 64 labelled "individual"), aliases, evidence, declared ties, state money, tax and charity status, access, mentions | Explain this money; download JSON | **Later (P2)**, organisations only (section 2). |
| Agencies and suppliers | `/subject/agency[/<name>]`, `/subject/supplier[/<name>]` | Government contracts by buyer and by supplier | `/agencies.json`, `/suppliers.json` (7.1 MB), `/agencies/` (37.5 MB), `/suppliers/` (85.3 MB) | Filters, contract tables | **Web only** for now: size and wide tables. |
| Campaigners and third parties | `/subject/campaigner[/<name>]` | Political spenders that are not parties | `/graph/campaigners.json` | Filter | **Later.** |
| Declared interests | `/declared` | Newest register additions and deletions, by week | `/interests/recent.json` (145.8 kB; 300 of 1,660 items; generated 4 September 2026) | Filter | **Later (P1)** as a feed; its newest rows already appear on Today in v1. |

### Topics

| Surface | Web route | Purpose | Data it shows (source, cost class) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Topics index and topic | `/subject/topic`, `/subject/topic/<slug>` (21 topics, from `portal/src/topic-names.mjs`) | What parliament has said on a subject over time | ARAG `/api/topics`, `/api/topic/<slug>`, `/api/tide`; briefs | Pick a topic; open speakers and speeches | **Later (P1).** |

### Money

| Surface | Web route | Purpose | Data it shows (source, cost class) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Money map ("3D connections") | `/money`, `/map` (`map.html`) | The 250 largest disclosed donors around the parties, by industry and year | `/graph/money*.json`, three.js scene | Drag years, filter industries, layers, focus a node | **Web only**: a 3D WebGL scene that needs a large screen. |
| Money journeys | `/money?journey=…&step=…&focus=…` | Guided steps through the map, with a written story | Graph scenes, plus `/api/journey-story` (model generation) | Choose a lens and subject, step or play | **Web only**: 3D, and the story is a paid model call. |
| Political receipts | `/money/receipts` | Every disclosed donor-to-party flow, as a ledger | `/graph/money*.json` | Filter, sort, export | **Later (P2).** |
| Government contracts and discovery leads | `/discover` | Leads: donor and supplier overlaps, receipt concentration, supplier concentration | `/discovery.json` (158.6 kB; 60 signals: 29 overlaps, 28 procurement and 3 receipt concentrations; each with metrics, evidence and caveats) | Choose a category, an agency, sort | **Later (P1)** as Leads. |
| Grants, programs, largest grants, grant recipient | `/money/grants`, `?program=`, `?largest=YYYY-MM`, `/money/grants/<federal\|qld>/recipient/<id>` | Who receives grants, where and from which program | `/graph/grants.*.json`, `/grants/` (89.9 MB), `/social/programs.json`, `/social/grants-largest.json` | Filters, program view, recipient file | **Later (P2).** Daily editions link here, so v1 hands these URLs to the web. |
| Programs & places | `/connections`, `?entity=` | Organisations, programs and places named across records | `/evidence/` (163.5 MB in total; the page loads an index and one bucket) | Filter, open excerpts | **Web only.** |

### Bills

| Surface | Web route | Purpose | Data it shows (source, cost class) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Bills | `/bills` | 2,989 federal bills, 2013 to 2026 | `/bills/index.json` (1.73 MB; generated 29 September 2026): 1,793 passed, 1,076 lapsed, 119 before parliament, 1 exposure draft; 1,711 with a stored summary (static) | Search, filter by year, status, parliament | **Core v1.** |
| Bill | `/bill/<key>` | One bill: what it changes and how it was decided | `/bills/<key>.json` (static): title, status and status date, sponsor, portfolio, key dates, stored summary with its attribution, changes, who is affected, divisions with party splits and a They Vote For You link each, speeches with stored briefs, source links. Original text through ARAG `/bill-texts/` | Open a division, a speech, a source | **Core v1.** Original text opens at its source in v1. |

### Reports and Explore

| Surface | Web route | Purpose | Data it shows (source, cost class) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| Reports and report | `/reports`, `/reports/<slug>`, `/reports/<slug>/s/<n>` | Standing investigations: Where community funding goes (`grants-allocation`); Climate & Energy (`climate`); Gambling (`gambling`); Housing (`housing`); Immigration (`immigration`); First Nations (`indigenous`); Media Ownership (`media`) | `/reports/index.json`, `/reports/<slug>.json` (static, 1.29 MB in total) | Read, jump to a section | **Later (P1)** reader. The grants-allocation map stays web only. |
| Explore and its modules | `/explore`, `?game=` | Build your ballot, Time machine, The tide, The record quiz, Who owns which debate, Words per dollar, Then vs now. Ledger and Who gets the grants forward to `/money/receipts` and `/money/grants` | Module JSON; ARAG `/api/tide`, `/api/matrix` | Interactive dialogs | **Web only.** The quiz is a later candidate. |

### About, community and edges

| Surface | Web route | Purpose | Data it shows (source, cost class) | Key interactions | Mobile verdict |
| --- | --- | --- | --- | --- | --- |
| About, Methods, Sources & coverage, Expense definitions | `/about`, `/methods`, `/stats`, `/expenses` | What OPAX is, how it works, what it covers | Static text in `index.html`; `/corpus.json` (static); live counters from ARAG `/api/stats`; `/expense-categories.json` | Read, cite | **Core v1** as a native About and sources screen using `/corpus.json`. Live counters are P1. Methods opens on the web. |
| Community | `/community` (`community.html`). Views: home (Discussions), members, member, thread, new thread, lists, list, messages, **activity** (replies, likes and new followers, with unread counts and mark as read), account, **settings** ("Privacy & messages": who can message you, reply-email preferences, blocked members), sign-in, privacy, guidelines, tools (MCP tokens), moderation | Accounts, discussions, reading lists, member follows, direct messages, notifications, MCP tokens | `/api/community/*` (D1; email for sign-in and replies) | Sign in by emailed link; post; follow; message; report; block; set preferences | **Web only** in v1. The app uses the same account only to sign in for voice, sign out and delete the account (sections 4.11 and 4.12). |
| Daily edition | `/today` | 302 to the page behind the latest frozen daily edition. On 3 October 2026 it pointed at `/reports/indigenous` | Edition journal in D1 | None: a redirect | **Core v1** as the Today tab's edition card, once a read endpoint exists (section 2). |
| Share images | `/og/<path>.png`, `/og/story/*` | Link previews and social cards | Drawn by the Worker | None | **Not a screen.** The app never requests them. |
| Machine and plumbing routes | `/api/*`, `/bill-texts/*`, `/mcp`, `/ingest/*`, `/sitemap.xml`, `/robots.txt`, `/.well-known/atproto-did`, `/connections.html` (redirect) | Data, analytics proxy, crawlers, identity | | | **Not screens.** The app never calls `/ingest/*` or `/mcp`. |
| Contributor references | `ui-workbench.html`, `home-prototype.html` | Design references | | | Excluded from deployment by `.assetsignore`. Not a surface. |
| Test harnesses | `lg-test.html`, `nr-test.html`, `qz-test.html`, `st-test.html`, `tm-test.html`, `wb-test.html` | Component harnesses (ledger, news rail, quiz, stages, time machine, wombat loader) | | | Not excluded by `.assetsignore` and not linked. Not a surface. |

### Names in the brief that have no page of their own

- **Pay.** No route. It is the person-page section "Pay for the posts held" from `/pay.json` (federal parliament only, from 7 December 1999, as at 17 September 2026) and a calculated Ask answer. In the app it lives on the MP profile.
- **Interests.** `/declared`, the person-page sections, and "Named in members' registers" on donor pages.
- **The disconnect score.** Not live. `docs/DISCOVERY.md`: "The old disconnect engine is not part of the current live portal; its historical score table is not used by these leads." There is no route, export or API for it. Section 2 recommends against a score in v1.
- **The daily edition.** The `/today` redirect and the social channels; there is no edition page.

## 2. Candidate v1 scope

Five principles decide the scope:

1. Every public screen works signed out, from static exports and the catalog search branch. No ARAG read, reranker or model generation backs a public P0 block.
2. Voice is the one exception: paid, signed in, inside the existing allowance and monthly budget.
3. Every figure links to its record, or to the source register that holds it, and says which.
4. Native pages exist only for public office holders, places, parties and bills; never for private individuals.
5. Go native where a phone adds something: a saved seat, voice, offline reading, the share sheet.

### P0: must ship

| # | Feature | What ships | Data (cost class) | Launch dependency |
| --- | --- | --- | --- | --- |
| 1 | **Your MP** | Choose your seat by electorate or name search; your member, your senators and, where verified, your state members; saved on the device | Electorates release and roster (static) | None for search. Postcode entry needs D1. |
| 2 | **MP profile** | Identity, voting record summary, declared interests, pay, expenses, party receipts link | Roster, portraits, `votes.json`, interests, `pay.json`, `expenses.json`, money graph (static) | None. D5 recommended. |
| 3 | **Electorate** | Representatives with as-of date, elections, Census context, sources | Electorates release (static) | None |
| 4 | **Bills** | Tracker list and bill detail with stored summaries, divisions, party splits and speeches with stored briefs | `bills/index.json`, `bills/<key>.json` (static) | None |
| 5 | **Search** | On-device suggestions; catalog search for people, interests, pay and expenses | Roster, electorates index, bills index (static); `/api/search-all` with `kind=person`, `interest`, `pay` or `expense` (catalog) | Validate the catalog route's contract |
| 6 | **Today** | Daily edition card, recently introduced bills, recent declarations | Bills index, `interests/recent.json` (static); edition journal (D1 read) | The card needs D2; the feeds do not |
| 7 | **Talk to OPAX** | Native voice screen: sign-in, consent, microphone, live call, transcript, sources, allowance and every error state | Voice routes (paid, signed in) | D3 |
| 8 | **Account** | Sign in by emailed code, sign out, delete account | Community auth (D1, email) | D3, including deletion |
| 9 | **About, sources and privacy** | Independence statement, sources and licences, coverage, corrections, privacy, font licences | `/corpus.json`, static text | D6 |
| 10 | **Share and universal links** | Canonical opax.com.au URLs out; links in | Canonical URLs | Inbound links need D4; sharing does not |

**Named dependencies.** Each is a Worker or pipeline change and needs Jake's OK to deploy.

| ID | Change | Defined in |
| --- | --- | --- |
| D1 | A verified postcode-to-candidate-electorate export with source, licence, date and multi-seat handling | API contract, "Proposed Worker changes" |
| D2 | A read-only frozen daily-edition endpoint (journal read only, no preview or generation fallback) | API contract |
| D3 | Voice Worker changes 1 to 6: header-token sessions, the Origin rule for them, code sign-in, native sign-out, account deletion, a budget-closed signal | `docs/IOS-VOICE.md`, "Worker changes for option A" |
| D4 | `apple-app-site-association` for selected public paths | API contract |
| D5 | Compact per-person projection, so a profile does not download the whole of `votes.json`, `pay.json` and `expenses.json` | API contract |
| D6 | A privacy page covering the app: public reading, voice, ElevenLabs, retention and deletion | `docs/IOS-VOICE.md`, change 8 |
| D7 | An as-of date in `votes.json`, which has none today | This document |

**Five-line summary.**

1. Your MP by electorate or name search (postcode once D1 exists), with your member, senators and verified state members.
2. MP profile, electorate and bills from static exports: voting summary, interests, pay, expenses, party receipts link; bills with stored summaries, divisions and party splits.
3. Search with on-device suggestions and catalog-only results; Today from static feeds plus the frozen daily edition once D2 exists.
4. Talk to OPAX behind email-code sign-in, with consent, microphone permission, transcript, sources, allowance and error states, and account deletion in the app.
5. About, sources and privacy; share and universal links. No other ARAG or model-backed read in P0.

### P1: should ship next

| Feature | Why | What it needs |
| --- | --- | --- |
| Record reader | Many evidence links and voice sources are `/doc/` records | ARAG `/api/resource` and `/api/brief`, or a frozen record export |
| Speeches, topics and mentions on profiles | "What they say" is half of OPAX's purpose | ARAG today; a per-person recent-speeches export with stored briefs would bring speeches forward |
| Chronological division history | "Latest divisions" needs each vote with its division key and link | A per-person vote export with division keys and URLs (API contract: "per-person vote export"); `votes.json` holds totals and six bills each way only |
| Document search | Search inside speeches and records | ARAG `/api/search` through `/api/search-all` |
| Newly indexed records on Today | Shows the record growing | ARAG `/api/recent`, or a frozen list from the nightly refresh |
| Live coverage counters | Exact counts by kind | ARAG `/api/stats`, or a frozen snapshot |
| Party page (basic) | Party chips should not leave the app | Static; members, receipts total and sources, bill divisions |
| Leads and declared interests feed | The most distinctive material on OPAX, already shaped as leads with caveats | Static `/discovery.json`, `/interests/recent.json` |
| Reports and topics reader | Long-form reading suits the phone | Static reports; ARAG topics |
| Electorate outline map | Confirms a seat at a glance | Static release outline, labelled as a display outline |
| Follows with local change notices | Turns a lookup into a habit without an account | A per-refresh list of changed entity keys; nothing synced |

### P2: later

Location lookup (below), push notifications, native Ask, community discussions in the app, donors (organisations only), receipts ledger, grants and recipients, and the Explore quiz. The money map, money journeys, contracts, suppliers, agencies and Programs & places stay on the web.

### Who gets a native page

Apple's guideline 5.1.1(viii) reads: "Apps that compile personal information from any source that is not directly from the user or without the user's explicit consent, even public databases, are not permitted." It has no exception for public office holders. The scope below is this document's proposal for limiting that risk, not an exemption Apple grants.

| Subject | Native page | Suggestions and catalog search | Deep links |
| --- | --- | --- | --- |
| Parliamentarians on the roster (`parliamentarians.json`) | Yes | Yes, from the roster, not `speakers.json` | `/subject/person/<slug>` opens the profile |
| Names outside the roster, including committee witnesses | No | No | Open on opax.com.au |
| Electorates, parties, bills, reports | Yes (parties and reports in P1) | Yes, once the native page ships | Claimed when the page ships |
| Donors | P2, organisations only. 64 of the 400 donor nodes are labelled "individual" and 37 "other", which may include people; an organisation-only list needs a verified classification | No donor or receipt kinds in v1 | Not claimed |
| Grant recipients, suppliers, campaigners, people named in ministerial diaries | No | No `grant`, `supplier`, `contract`, `campaigner` or `access` kinds | Not claimed |

**Private people in public records.** Public documents name private people: constituents in speeches, family members in register declarations, individuals in grant and donation records. The app shows a public source as published when it shows that source at all, but never turns a private person's name into a profile, a suggestion, a follow target or a cross-record list. In P0 the only such text is register declarations, shown as declared under the member's name.

### Your MP

**What the data allows today.**

- No postcode or location lookup is live. `docs/ELECTORATE_REFERENCE.md`: "Postcode lookup, precise point-in-polygon lookup … are not enabled."
- A research table of 2,358 postcode mappings exists without source, version or date. `docs/ELECTORATES.md` says it "can suggest lookup candidates, but must be validated against a sourced geography before becoming a definitive lookup".
- Federal outlines are the AEC's 2025-election boundaries simplified for display; state outlines are ABS statistical geography. The reference says: "Never use display geometry for precise allocation." The API contract requires a separately validated geometry pack for any offline lookup.
- Verified rosters: federal (150 representatives and 76 senators, checked 4 September 2026) and Victoria (128 members, 9 September 2026). NSW, Queensland, SA, WA, Tasmania, the ACT and the NT are pending.

**Recommendation.**

- **v1 is search-first.** The person finds their seat by electorate name or their member's name. All matching seats are listed; the person chooses. For people who do not know their electorate, link to the AEC's own electorate finder (to be confirmed before launch).
- **Postcode** joins when D1 exists. It always lists every candidate seat with "A postcode can cover more than one electorate. Choose yours.", never one guessed answer.
- **Location** is P2. Before it ships it needs licensed, current boundaries validated for allocation (not the display outlines), an algorithm that returns several candidates near boundaries and says so, and a test set of known addresses. It never selects a seat on its own, and coordinates never leave the phone.
- State members show only where a verified roster exists. Elsewhere the screen says "OPAX does not yet have a verified roster of NSW members" rather than showing old open-ended rows.

**What Your MP shows.** Member cards that open the profile; recent bill votes and register changes; pay; and the party receipts link with its caption. Speeches and a chronological division history are P1.

**No disconnect score.** It is not live; there is no published method or export; and one number attached to a named person reads as a verdict, which the evidence-first rule and guideline 1.1.1 both argue against. The closest live, evidence-backed comparison is the bills a member voted for and against. If a score returns, it needs a published method, a link from every input to its record and its own review.

### Search

Two layers, both free of ARAG:

1. **Suggestions while typing**, built on the device from static files: roster people (`parliamentarians.json`), electorates (release index) and bill titles (`bills/index.json`). Parties, topics and reports join when their native pages ship. The first row is "Search the record for …". No network call per keystroke.
2. **Catalog search** on submit through `GET /api/search-all` with one catalog kind: `person`, `interest`, `pay` or `expense`. Results open MP profiles. Two kinds of row link elsewhere on the web and need handling: register alterations (`interest`) link to `/declared?person=…`, which the app maps to the member's register section; and three general `pay` rows link to web Ask questions (`/ask?q=…`, model generation), which the app leaves out. The app never sends `kind=all` or `kind=bill`, which also call ARAG document search. Bills are searched on the device instead.

Document search, machine briefs in results and the generated summary are P1 or web only. The search limiter allows 120 requests a minute per client IP; phones behind carrier-grade NAT share addresses, so the contract should define fair limiting for the app.

### MP profiles, party and electorate pages

The profile's static blocks are P0: identity, voting record summary, declared interests, pay, expenses and the party receipts link. Topics, speeches and mentions are P1. The ministerial diary and In the news are P1.

The native order is a **proposal**, not the web's: the web runs topics, votes, interests, speeches, diary, news, pay, expenses, mentions (`app.js:5302-5324`). The app leads with the voting record because the topic chart is not in P0.

The electorate page is P0 because Your MP depends on it. The party page is P1; in v1 a party chip opens the party page on the web.

Today the web profile downloads whole-site files to show one person: `votes.json` (1.30 MB), `pay.json` (589.8 kB), `expenses.json` (462.7 kB) and `parliamentarians.json` (405.7 kB). The app can read them as they are at launch; D5 makes them person-sized. Making them smaller does not add records they lack: `votes.json` has totals and six bills each way per person, without division keys or links (`app.js:4845-4851` links them through title searches), so a chronological history needs the P1 export.

### Bills tracker

P0. The list opens on bills before parliament (119 on 29 September 2026) and recently introduced bills, with filters for status, year and parliament and title search on the device. The detail shows the stored summary under its attribution line, "Written by a model from the explanatory memorandum; not the record", and never without it. Divisions show ayes, noes and party splits with labels, and each opens its They Vote For You record. Speeches show speaker, party, date and their stored brief, labelled "Machine brief", and open on opax.com.au until the record reader ships. Following a bill is P1.

### The daily edition and discover leads

**The daily edition** is one source-based post a day (`docs/DAILY-POST.md`), rotated by weekday: bill, grant program, politician, grant award, bill, the month's largest grants, topic. Each edition links to one opax.com.au page and no model runs at posting time. On the web it exists only as the `/today` redirect. The Today card needs D2. Until it exists, Today ships with its static feeds.

Three days in seven are public-money editions (grant program, grant award, the month's largest grants) that link to grant pages, which are web only in v1. The card opens those on opax.com.au and says so.

**Discover leads** (P1) are already shaped for a phone. Each signal in `/discovery.json` has a neutral title ("Westpac Banking Corporation appears in party receipts and contracts"), a summary, labelled metrics, example evidence and caveats. The app keeps every caveat visible on the card, not behind a tap.

### Follows and alerts

Not in v1. **Local follows (P1)** store follows on the device, compare small change markers when the app opens or when iOS grants a background refresh, and can raise local notifications with no server, device token or account. They need a per-refresh list of changed entity keys from the nightly refresh. Background refresh runs when iOS allows, so the app must not promise timing.

**Push (P2)** needs a server that stores device tokens and what each follows: personal data with a privacy policy, retention and deletion, and an operator when the nightly refresh misfires.

### Ask

**v1 links out.** "Ask on opax.com.au" opens the web Ask in Safari, outside the app.

- **Cost.** Every uncached `/api/ask` is a paid model call (DeepSeek V4 Pro through OpenRouter, behind the knowledge box) plus retrieval. The Worker limits ordinary Ask misses to 20 a minute per client IP and caches cited answers for up to seven days; the API contract notes a conversation branch that skips this limiter. Scraper fleets already drive enough paid calls that the Worker blocks whole networks on model routes.
- **Review risk.** Guideline 5.1.2(i): "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so." Answers can be wrong (guideline 1.1.6), so labels and citations would come across from the web.
- **Universal links.** `/ask` (without `view=search`) and `/chat` are excluded from the app's link claims, or "Ask on opax.com.au" would reopen the app.

**Native Ask (P2)** needs a consent step naming the providers, per-install or App Attest rate limiting, the web's labels and citations, and a decision on whether conversations sync.

### Voice in v1

Voice is the one paid, signed-in feature. `docs/IOS-VOICE.md` recommends "option A": the member signs in by an emailed one-time code, the app receives its own session token, and the existing WebSocket relay, tools, 600-second lifetime allowance and shared monthly budget stay as they are. This document specifies the screens (sections 4.10 to 4.12).

**Where voice lives: a persistent "Talk" button, not a tab.**

- Ordinary accounts get 600 seconds in total. A tab would spend a fifth of the tab bar on a feature that, for most people, ends after ten minutes and then shows "You have used your 10 free minutes".
- Voice needs sign-in; the four tabs never do. Keeping voice out of the tab bar keeps the public app visibly public.
- A button in the navigation bar of each tab's root screen is one tap from anywhere at the top level. It opens the voice screen as a full-height sheet with its own navigation stack, so a cited source can open inside the sheet while the call continues.
- Closing the sheet during a call asks "End the conversation?", matching the web, where closing the panel ends the call. Leaving the app ends the call, as `docs/IOS-VOICE.md` recommends.

If Jake wants voice more prominent, the same screen can sit in a fifth "Talk" tab; the screens below work in either place.

### Community accounts

**What the account adds on the web:** private and shared reading lists, a public profile, discussions with replies and likes, following members, direct messages, Activity notifications, Privacy & messages settings, blocking, reporting, moderation, synced Ask conversations, MCP tokens and the voice allowance. "Source records remain accessible without an account."

**In the app, the account exists only for voice.** The app does not show discussions, profiles, messages or reading lists. Consequences:

- **Account deletion is a launch dependency (5.1.1(v)).** "If your app supports account creation, you must also offer account deletion within the app." The first successful sign-in creates the member (`portal/src/community-auth.ts:23`), so signing in for voice creates an account. No self-service deletion exists today; it is Worker change 5 in `docs/IOS-VOICE.md`. Deletion removes the shared community account, not just the app's access, and never touches the public parliamentary record.
- **Login services (4.8).** Apps that use a third-party or social login for the primary account must also offer an equivalent login that limits data to name and email, lets people keep their email private, and does not collect interactions for advertising without consent. The guideline exempts apps that use only their company's own account system, which emailed codes are.
- **User-generated content (1.2)** applies only if member content is shown in the app. A voice account does not ship the community UI.
- **Sign-in handoff.** The web's link (`/community?view=signin#token=…`, 15 minutes, single use) and its browser cookie do not create a session in the app; browser and app sessions are separate. v1 uses the emailed code (D3) and claims no community path. A dedicated app sign-in link can come later.

## 3. Information architecture

### Tab bar

Four tabs, plus two persistent buttons in each root screen's navigation bar:

| Tab | SF Symbol (proposal) | Root screen | Holds |
| --- | --- | --- | --- |
| **Today** | `newspaper` | Today feed | Daily edition, recent bills, recent declarations; Leads in P1 |
| **Your MP** | `mappin.and.ellipse` | Your seat and members | Your MP home; the seat chooser; Following in P1 |
| **Bills** | `doc.text` | Bills tracker | List, filters, bill detail |
| **Search** | `magnifyingglass` (search role) | Search home | Suggestions, browse parliamentarians and electorates, catalog results |

| Navigation bar button | SF Symbol (proposal) | Opens |
| --- | --- | --- |
| **Talk** ("Talk to OPAX") | `waveform` | The voice sheet (section 4.10) |
| **Account and about** | `person.crop.circle`, filled when signed in | A sheet with About, sources, privacy, voice consent and the account (sections 4.9 and 4.12) |

A fifth tab slot stays free for **Money** (Leads, receipts, grants) when those ship natively. On iOS 26 the search tab uses the system search role, which shows it apart at the trailing end of the tab bar.

### Navigation stack

Each tab owns a `NavigationStack` of typed routes that carry identifiers only: `person(slug)`, `electorate(slug, asOf?)`, `bill(key)`, `searchResults(query, kind)`, `directory(kind, filters)`; and in P1 `party(name)`, `document(slug)`, `topic(slug)`, `report(slug, section?)`, `lead(id)`. The voice sheet has its own stack.

| Moving to | Presentation |
| --- | --- |
| Another native entity | Push onto the current stack |
| Filters, sort, "How votes are counted", a source's details | Sheet with detents |
| Voice, account and about | Full-height sheets from the navigation bar buttons |
| An external source record or register (They Vote For You, ParlInfo, AEC, AusTender, IPEA on data.gov.au, legislation.gov.au) | `SFSafariViewController`, visibly presented (guideline 5.1.1(vii)) |
| A web-only OPAX page (Ask, community, money map, grants, records before the reader ships, Methods) | Safari, outside the app, with an "Opens on opax.com.au" cue; during a call, see section 4.10 |

Breadcrumbs become the back stack. The web's crumb labels are a good source for back-button titles.

### Universal links

Associated Domains: `applinks:opax.com.au` (D4). The Worker 308s `www.opax.com.au` requests that reach it to the apex (`canonicalPageRedirect`), and Apple's fetcher does not follow redirects. The association file must be served as JSON, without a redirect, on every host the app claims, or `www` is not claimed.

| Web URL | App screen | Notes |
| --- | --- | --- |
| `/`, `/today` | Today | `/today` is resolved by the app, not by following the 302 |
| `/subject/person/<slug>` | MP profile | Only roster names; anything else falls back to the web |
| `/subject/person` | Parliamentarians directory in Search | |
| `/subject/electorate`, `/subject/electorate/<slug>` | Electorates directory, electorate | Keep `?asof=` |
| `/bills`, `/bill/<key>` | Bills, bill | Keep list filters |
| `/ask?view=search…`, `/search…` with a catalog kind the app supports | Search results | Other kinds open on the web |
| `/about` | Account and about sheet | `/methods`, `/stats`, `/expenses` stay web |
| `/subject/party*`, `/subject/topic*`, `/reports*`, `/discover`, `/declared`, `/doc/*` | P1 screens | Not claimed until they ship |
| `/ask` (no `view=search`), `/chat`, `/community*`, `/money*`, `/map`, `/connections*`, `/explore*`, `/subject/donor*`, `/subject/supplier*`, `/subject/agency*`, `/subject/campaigner*`, `/og/*`, `/api/*`, `/bill-texts/*`, `/mcp`, `/ingest/*`, `/.well-known/*`, the test harnesses | Not claimed | Opens in Safari. `/community*` stays unclaimed so web sign-in links keep working in the browser |

Any path the app receives but cannot show opens in Safari. A link never lands on an empty screen.

### Share sheet

- Share the canonical web URL: the person slug form, no UTM parameters, no app-only state. Section anchors (`#person-pay`) only when the person shared from that section.
- Title: the page title without the site suffix ("Anthony Albanese").
- Provide link metadata locally (title and app icon) so sharing does not fetch the page from the phone. Recipients' apps still fetch the page's share image.
- Context menus on rows offer Share, Copy link and Open on opax.com.au; Follow joins in P1.
- Voice transcripts are not shareable: they are never stored, as on the web.

### State restoration

- Per scene: selected tab, each tab's route path (identifiers only), the search query and kind, and expanded disclosures. `SceneStorage` with `Codable` routes.
- On the device: the chosen seat, the cache with each file's as-of date, voice consent, and the session token in the Keychain (never `UserDefaults`).
- Restoring shows cached content immediately with its as-of date, then refreshes. A call is never restored: the voice sheet reopens in its ready state.

## 4. Screen specs for P0

### Shared patterns

**Evidence links come in two kinds, and the app says which.**

| Kind | Example | Shown as |
| --- | --- | --- |
| Record link: a stable page for this exact record | A division on They Vote For You (`theyvoteforyou.org.au/divisions/senate/2026-08-19/6`); a bill home on ParlInfo | "They Vote For You · division, 19 Aug 2026" |
| Register link with a record ID: the source's search or home page, plus the ID to look up | AusTender contract CN3407266, linked to `https://www.tenders.gov.au/`; AEC receipts, linked to `https://transparency.aec.gov.au/` | "AusTender register · record CN3407266" |

All 89 evidence rows in `/discovery.json` are register links (`link_scope: "source_register"`). Direct record links for those sources need exporter work where the source has stable per-record pages.

```
$4,537,500                                        >
Contract value · 6 Feb 2017
AusTender register · record CN3407266
```

**As-at line.** Under each data block: "As at 17 September 2026 · Source: Remuneration Tribunal; Parliamentary Handbook". The date is the source file's own (`pay.json` `meta.as_of`, `bills/index.json` `generated_at`, `interests/recent.json` `meta.generated`, the expenses quarter, the roster check date). `votes.json` has none today (D7).

**Lead card (P1).** A pattern is always a lead, never a finding, and keeps every caveat the export carries.

```
Lead · Companies in both
Westpac Banking Corporation appears in party
receipts and contracts
$76,984,493   recorded party receipts        >
$9,102,500    recorded contract value        >
Example records (2): register links           >
Matching names are not verified legal
identities; unrelated entities can share a name.
The records can cover different years and
jurisdictions. No sequence or causal link is
inferred.
Annual party receipts are not all verified
gifts; source donation_type=direct is an
ingestion classification. State, election and
referendum disclosures are excluded.
```

**Machine text.** Always labelled where it appears: "Machine brief" for stored briefs; a bill summary's attribution line in full.

**Portraits and people rows.** Portrait, name, party dot with label, then place and date. A person without a portrait gets a blank circle, never initials. Official APH portraits carry their credit on the profile.

**States, everywhere.**

| State | Treatment |
| --- | --- |
| Loading | Layout-stable placeholders (`.redacted(reason: .placeholder)`) in the block's final shape; no spinner over content already shown |
| Empty | Say what is absent, in the web's words where it has them ("None of their recorded divisions was a vote on a bill itself."). A block with nothing for this person is left out, as on the web |
| Error | Plain sentence plus Try again. Other blocks keep working; one failed block never blanks the screen |
| Offline | Cached content stays readable with its as-at line. An uncached screen: "This record is not saved on this iPhone yet. It will load when you are back online." |
| Stale | When the cache is older than the latest known export: "Saved [date]" in the as-at line and a refresh in progress; never silently mixed with fresh data |

### 4.1 Today

```
Today                                 (≋) (◯)
───────────────────────────────────────────────
Today's edition · Saturday 3 October
First Nations
[headline fact from the edition]
Read the report on opax.com.au               >
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
```

`(≋)` is the Talk button and `(◯)` the account and about button; both appear on every root screen. Example rows are from the exports at `8f1305e3`; bracketed values are placeholders.

| Order | Block | Data (source) | Dependency |
| --- | --- | --- | --- |
| 1 | Today's edition | Edition journal | D2; hidden until it exists |
| 2 | Recently introduced bills | `bills/index.json`, newest `introduced` | None |
| 3 | Recent declarations | `interests/recent.json` | None |
| 4 | Newly indexed records (P1) | ARAG `/api/recent` or a frozen list | P1 |
| 5 | Leads (P1) | `/discovery.json` | P1 |

No editorial ranking and no hand-picked stories: feeds are date-ordered, as on the web. Pull to refresh.

### 4.2 Your MP

**Seat chooser.**

```
Find your MP
[ Electorate or member's name                ]
  Grayndler            House · NSW
  [other matching seats, each with its chamber]
Postcode (when D1 ships)
[ Postcode                  ]  [Find]
Not sure of your electorate?
AEC electorate finder                         ↗
Your choice is saved on this iPhone only.
```

Search runs on the device over the electorates index and the roster. Every match is listed with its parliament and chamber; nothing is selected automatically.

**Home.**

```
Your MP                               (≋) (◯)
Grayndler · House of Representatives · NSW
As at 4 September 2026
───────────────────────────────────────────────
(photo) Anthony Albanese
        ● Australian Labor Party
        Member for Grayndler                >
───────────────────────────────────────────────
Recent bill votes
Voted for · Income Tax Rates Amendment (Tax
Reform No. 1) Bill 2026 · Third reading ·
4 Jun 2026                                   >
Voted against · Online Safety Amendment
(Strengthening Enforcement for the Social
Media Minimum Age) Bill 2026 · Second
reading · 1 Jul 2026                         >
Votes on bills themselves only. Most questions
are decided on the voices.
───────────────────────────────────────────────
Register changes
[category] · added [date]                    >
───────────────────────────────────────────────
Your senators (12)                          >
State member
OPAX does not yet have a verified roster of
NSW members.
───────────────────────────────────────────────
Change seat
```

Vote rows are from `votes.json` at `8f1305e3`; bracketed values are placeholders. In Victoria, where the roster is verified, the state member card replaces the notice.

| Order | Block | Data (source) | Note |
| --- | --- | --- | --- |
| 1 | Seat header with as-at date | Electorate file; roster date | |
| 2 | Member card(s) | Roster, portrait map, party now | |
| 3 | Recent bill votes | `votes.json` `for` and `against` (six each, with stage and date), newest first | Each row opens the native bill page when its name matches `bills/index.json`, as the web's `decoratePersonVoteBills` does; otherwise it shows "Not matched to a bill record" and no link |
| 4 | Register changes | `interests/<id>.json` | Links to the register source page |
| 5 | Senators for the state | Roster | |
| 6 | State member(s), where verified | Electorates release (Victoria only today) | |

Speeches and a chronological division list are P1. States: no seat chosen shows the chooser. Representation is shown only as the release records it; where no verified representative is recorded for the date, the screen says so and never infers a vacancy or a holder.

### 4.3 MP profile

```
<  Your MP                    [Share] [···]
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
Online Safety Amendment (Strengthening
Enforcement for the Social Media Minimum Age)
Bill 2026 · 2026                             >
How votes are counted                        v
Source: They Vote For You (ODbL)
───────────────────────────────────────────────
Declared interests                            >
Declared ties to disclosed money              >
───────────────────────────────────────────────
Pay for the posts held
$622,102 a year as Prime Minister: the
$239,270 base salary plus a 160% loading.
Prime Minister since 23 May 2022.
[salary entitlement by financial year chart]
As at 17 September 2026 · Remuneration
Tribunal; Parliamentary Handbook
───────────────────────────────────────────────
Claimed expenses                              >
───────────────────────────────────────────────
Party receipts                                >
Party disclosures, not this person's finances.
───────────────────────────────────────────────
Speeches, topics and mentions on opax.com.au ↗
```

Figures are from `votes.json` and `pay.json` at `8f1305e3`. The current rate (as at 17 September 2026) and the date the post began are separate facts and stay on separate lines.

| Order | Block | Data (source) | Empty or partial state |
| --- | --- | --- | --- |
| 1 | Identity: portrait and credit, name, party now with "formerly", seat, chamber, jurisdiction | Roster (`party_now`, `representation`), `/photos/people.json`, electorates release | No portrait: blank circle |
| 2 | Voting record: totals, aye share, voted for and against (six each), method disclosure, source | `votes.json` (or D5) | Hidden when no record, as on the web |
| 3 | Declared interests and declared ties | `/interests/<id>.json`, `/interests/ties-by-donor.json` | Hidden when no register file; members outside covered registers say so |
| 4 | Pay for the posts held | `pay.json` (or D5) | Hidden for state members and service before 7 December 1999, as on the web |
| 5 | Claimed expenses by year and category, with benchmark and category definitions | `expenses.json`, `expense-categories.json` (or D5) | Hidden when none; IPEA data starts April 2017 |
| 6 | Party receipts link with its caption | `/graph/money.json` party node | Independents and parties not on the map: link to receipts on the web |
| P1 | What they talk about; speeches; mentions; In the news; ministerial diary | ARAG (`/api/person-topics`, `/api/topics`, `/api/search`, `/api/brief`); RSS `/api/news`; static `/access.json` | Until then, one link to the profile on opax.com.au |

The per-person need for the contract (D5): roster entry, slug, portrait key and credit, electorate links, the votes summary as `votes.json` holds it, register file, pay spells, expenses summary, and each block's as-of date.

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
Elections
3 May 2025 · General election                v
  [candidates, primary and two-candidate counts]
21 May 2022 · General election               v
18 May 2019 · General election               v
───────────────────────────────────────────────
Local context (Census 2021)
[indicators with their 2021 geography label]
───────────────────────────────────────────────
Related constituencies                       >
Sources and coverage                         >
```

Data: `/electorates/releases/<id>/el_<id>.json` and the release index. The web currently shows the member's party as text only on this page; the app adds the dot and portrait so every people row looks the same. The as-of control is a date picker in a sheet; a historical view is labelled "Representation on [date]" and never as current. Census figures keep their 2021 geography label. A multi-member electorate leads with Representatives and never invents a single holder. Coverage gaps stay visible, as the web says under its timeline: "Gaps indicate missing coverage."

### 4.5 Search

```
Search
[ Search people, places and bills            ]
Suggestions (while typing)
  Search the record for "housing"      Search
  Grayndler                    Federal electorate
  [member name]                       Member
  [bill title]                          Bill
Browse
  Parliamentarians · Electorates
───────────────────────────────────────────────
Results for "[query]"       [People ▾]
[member name] ● [party] · [chamber]          >
  [matching register entry or pay record]
```

| Block | Data (source) |
| --- | --- |
| Suggestions | On the device: `parliamentarians.json`, the electorates index, `bills/index.json` titles |
| Browse | `parliamentarians.json`, the electorates index |
| Results | `GET /api/search-all?q=…&kind=person\|interest\|pay\|expense` (catalog branch only); the kind picker offers People, Declared interests, Pay and Expenses. Rows that link to `/declared` open the member's register section; rows that link to `/ask` are left out |

States: under two characters shows Browse; no results says what was searched and which kind, and offers the other kinds; a 429 says "Search is busy. Try again in a minute."; a 503 says "Search is temporarily unavailable."

### 4.6 Bills

```
Bills                                 (≋) (◯)
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

Data: `bills/index.json` (`status`, `introduced`, `portfolio`, `sponsor`, `has_summary`, `divisions`, `speeches`). Filters: status, year, parliament, has summary. Title search uses the on-device index. At 1.73 MB the index is acceptable once and then cached; the contract may offer a smaller paged list.

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
They Vote For You · division                 >
Party splits                                 v
  ● Labor         0 ayes · 21 noes
  ● Greens        9 ayes · 0 noes
  …
───────────────────────────────────────────────
Speeches
Tony Burke ● Labor · 18 Aug 2026
Machine brief: [stored brief]
On opax.com.au                               ↗
───────────────────────────────────────────────
Sources: explanatory memorandum, bill home,
the Act on the Federal Register               >
```

Data: `/bills/<key>.json`; values above are from `au-federal-r7534`. Party splits read each voter's party at the division's date (`meta.party_basis_note` in the index), and that note belongs in the splits disclosure. Outcomes use the web's words, "Agreed to" and "Negatived". A missing sponsor is said in words ("Sponsor not recorded"); the web also draws a party dot labelled "Not recorded" beside it, which the app should not copy. Exposure drafts show their consultation details and "became" link.

### 4.8 Record links before the reader ships

The record reader is P1 (ARAG). In v1, an OPAX record link (`/doc/<slug>`) opens on opax.com.au in Safari with the "Opens on opax.com.au" cue, and a source link opens the original in `SFSafariViewController`. The P1 reader will show speaker, party, chamber, date, topic tags, the stored brief, the text in Merriweather, the original record link, similar records and the related bill, with the web's caveat banners for repaired or partial records.

### 4.9 Account and about

A full-height sheet from the `person.crop.circle` button, with grouped sections (the one place a native grouped list fits):

```
Account and about                        Done
───────────────────────────────────────────────
Account
  Not signed in. An account is only needed to
  talk to OPAX.                    Sign in  >
  [or: Signed in as [email] · Account  >]
Voice
  Voice consent: Given [date]      Withdraw
───────────────────────────────────────────────
About OPAX                                   >
Sources and licences                          >
Coverage                                     >
Corrections and contact                       >
Privacy                                      >
Acknowledgements and font licences            >
```

1. **About OPAX**: one paragraph beginning "The Open Parliamentary Accountability Exchange brings together", then "OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party."
2. **Coverage**: counts and the version date from `/corpus.json` (static). Live counters are P1.
3. **Sources and licences**: the per-source list from the About page, each with its licence.
4. **Machine-written text**: what is written by models and how it is labelled.
5. **Corrections and contact**.
6. **Privacy**: public reading collects nothing that identifies the reader (section 8); voice uses an email address, member ID, voice audio and words (D6).
7. **Acknowledgements**, including the OFL texts for Merriweather and Public Sans.

### 4.10 Talk to OPAX (voice)

Protocol, audio, interruptions and tests: `docs/IOS-VOICE.md`. This section is the screen.

**Order on first use.** Status check, then sign in (if needed), then the consent step (once), then microphone permission (once, before any time is reserved), then reserve and connect. Each step can stop the flow without spending time.

```
Talk to OPAX                                Close
───────────────────────────────────────────────
Explore the record with your voice.
Ask about Australian politics, spending and the
public record. You can interrupt or ask a
follow-up.
───────────────────────────────────────────────
[status line: Ready when you are]
10:00 free · 10 minutes total per account
              [ Start talking ]
───────────────────────────────────────────────
AI voice powered by ElevenLabs. Answers may be
mistaken; check the linked records.
Your microphone starts when you choose Start
talking. Voice privacy                        >
```

**During a call.**

```
Talk to OPAX                                 End
● Listening to you                       7:42
───────────────────────────────────────────────
You
  [user turn]
OPAX
  [agent turn, with record links]
…
Sources (3)                                  v
  [title]                                    >
───────────────────────────────────────────────
[ Type instead…                       ] [Send]
     [ Mute mic ]            [ End call ]
```

Copy on these two screens is the web panel's own (`portal/voice/client.js`), with "Opax" set as "OPAX" pending the casing decision, except "Type instead", which is new (`docs/IOS-VOICE.md`).

**Steps before the call.**

| Step | Screen behaviour |
| --- | --- |
| Entry | The Talk button on any root screen. Opening the sheet only checks status; it never loads audio, asks for the microphone or reserves time |
| Signed out | "Sign in to talk for free" opens sign-in (4.11). Nothing else in the app changes |
| Consent (first call, and after it is withdrawn) | A separate step before the microphone prompt: what is sent (your voice and the words of the conversation), who receives it (ElevenLabs, OPAX's voice provider), how long it is kept (no recordings; transcripts deleted within one day; OPAX keeps your remaining minutes and session times), and a privacy link. Buttons: "Agree and start" and "Not now". Withdraw from Account and about. This is guideline 5.1.2(i) consent, separate from the iOS microphone permission |
| Microphone permission | Asked on the first Start, after consent and before reserving time, using the purpose string in `docs/IOS-VOICE.md`. Denied: "Microphone access is off for OPAX. Turn it on in Settings to talk." with an Open Settings button; no time is reserved |
| Allowance | Always visible before starting: "10:00 free · 10 minutes total per account"; signed in, "[m:ss] remaining · 10 minutes free in total"; operator-approved unlimited accounts, "Unlimited voice access · up to 10 minutes per call". The local countdown is display only; the server's deadline decides |

**States during and after the call.**

| State | Status line and message |
| --- | --- |
| Checking | "Checking availability…" |
| Connecting | "Connecting…", with Cancel. After 35 seconds: "We could not connect in time. Your microphone is off. Please try again." |
| Listening | "Listening to you", with the system microphone indicator and a visible level mark (guideline 2.5.14) |
| Speaking | "OPAX is speaking". The person can interrupt by talking |
| Muted | "Your microphone is muted". Mute keeps the call and its time running |
| Ended by the person | "Conversation ended. Your microphone is off." |
| Time used | "Your 10 free minutes are complete. Your microphone is off." Unlimited accounts: "This call has finished. Start another whenever you're ready." |
| Allowance already used | "You have used your 10 free minutes. You can keep exploring the public records." Start is replaced by links to Search and Ask on opax.com.au |
| Call open elsewhere | "A voice conversation is already open on your account. End it there, then try again." |
| At capacity | "Voice is busy right now. Please try again in a little while." |
| Budget closed for the month | "Voice is closed for the rest of this month. The public records are still here." Needs the budget signal in D3; until then the server cannot tell this from busy, and the app shows the busy message |
| Voice switched off | "Voice is taking a break. You can still search the public records." |
| Network drop or provider failure | "The connection ended. Your microphone is off. You can try again." or "Voice ran into a problem. Your microphone is off. Please try again." |
| Offline | "You are offline. Your microphone is off. Reconnect to try again." |
| Interrupted (phone call, alarm, another app's audio) | The call ends cleanly: "The conversation ended because another app needed audio. Your microphone is off." It never restarts by itself |
| App left | Ending when OPAX goes to the background: "The conversation ended when you left OPAX. Your microphone is off. Start again when you are ready." A brief inactive state, such as Control Centre, does not end it |
| Route change (headphones on or off) | The call continues on the new route; no message unless the audio cannot restart, which ends the call with the provider-failure message |

The interruption, leaving-the-app and closed-budget messages are new; the rest are the web's, with "Ask" replaced by the public records where Ask is not in the app.

**Transcript and sources.** Both sides appear as text from the first turn, as captions, and corrections replace a turn in place. The transcript is not stored after the sheet closes and is never sent to analytics. Record links in agent turns and the Sources list (at most 12) pass the web's allow-list. Sources the app shows natively (people, electorates, bills) push inside the voice sheet while the call continues. Other sources (records, reports, money pages) are listed and open on opax.com.au after the call ends; tapping one during a call offers "Open after the call" or "End the conversation and open". The P1 record reader removes most of these cases.

**Text alternatives.** The live transcript is the alternative to listening. "Type instead" sends a typed message during a call (up to 2,000 characters; it still uses call time). Outside a call, Search and "Ask on opax.com.au" are the text routes.

**Closing.** Swipe-to-dismiss is disabled during a call. Close asks "End the conversation?" with End and Keep talking. The screen stays awake while connected.

### 4.11 Sign in by code

```
Sign in to talk                           Cancel
───────────────────────────────────────────────
An OPAX account lets you talk to OPAX. The rest
of the app works without one.
Email  [                                   ]
              [ Send code ]
Signing in creates an account if you do not
have one. Privacy                             >
───────────────────────────────────────────────
Enter the code
We sent a code to [email]. It expires in
15 minutes.
[ _ _ _ _ _ _ ]
              [ Sign in ]
Send a new code · Use a different email
```

- The code field uses one-time-code autofill. The email also contains the web sign-in link; tapping it opens the web, which signs in the browser, not the app.
- Errors: wrong code ("That code is not right. [n] tries left."); too many attempts or expired ("This code has expired. Send a new code."); rate limited ("Too many codes requested. Try again later."); offline.
- On success the session token goes to the Keychain and the flow returns to the voice screen, which continues to consent.
- Code length, attempt limit and expiry follow D3 (`docs/IOS-VOICE.md`: at least six digits, at most five attempts, 15 minutes).

### 4.12 Account, sign-out and deletion

```
Account                                    Done
───────────────────────────────────────────────
Signed in as [email]
Voice time: [m:ss] remaining
───────────────────────────────────────────────
Sign out of this iPhone
───────────────────────────────────────────────
Delete account
Your OPAX community account is also used on
opax.com.au.
```

- **Sign out** removes the token from the Keychain and revokes the session on the server (D3). Voice consent stays on the device unless withdrawn.
- **Delete account** opens a confirmation that says what is deleted and what is not: the account, its sign-in sessions on every device, and [voice usage and any web discussions, reading lists and messages, per the decision in `docs/IOS-VOICE.md` open question 2]. Public parliamentary records are not affected. Buttons: "Delete account" (destructive) and Cancel. After deletion the app is signed out and returns to the voice screen's signed-out state; everything public keeps working.
- Apple's guidance asks for deletion that is easy to find: it sits in Account and about, one tap from every root screen, and in the voice screen's account menu.

## 5. Design language mapped to native

### Colour

The web is "Light-only by design" (`style.css`). The light tokens translate one to one into an asset catalog. Ratios are WCAG 2.x contrast against `--paper` unless noted.

| Token | Hex | Role | Contrast |
| --- | --- | --- | --- |
| `--paper` | `#FAF9F6` | Page background | n/a |
| `--paper-raised` | `#FFFFFF` | Raised surfaces | n/a |
| `--paper-sunken` | `#F1EFE8` | Subdued surfaces, filled controls | n/a |
| `--ink` | `#23271F` | Primary text | 14.44:1 (15.20 on raised, 13.21 on sunken) |
| `--ink-soft` | `#575C52` | Secondary text | 6.52:1 (5.97 on sunken) |
| `--ink-faint` | `#6F7468` | Tertiary text, **on paper and raised only** | 4.56:1 (4.80 on raised); fails on sunken (4.17:1) and on the bronze wash (3.80:1) |
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

On sunken surfaces and tags, use `--ink-soft` where the web would use faint text. Dividers marked decorative never stand in for a control boundary.

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

All light dots clear the 3:1 non-text minimum on paper. On the proposed dark ground the light colours range from 2.20:1 (Liberal) to 5.35:1 (LNP), and three of eight (ALP 2.80, Independent 2.53, Liberal 2.20) fall below 3:1, so a dark palette needs its own party set.

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

**Licences and files.** Both families are under the SIL Open Font License 1.1, with the licence texts in `portal/public/fonts/`. Merriweather carries the Reserved Font Name "Merriweather"; Public Sans has none. The web files are WOFF2 subsets split by script (latin, latin-ext, vietnamese):

| Family | Web files | Properties |
| --- | --- | --- |
| Merriweather, roman | 3 files, version 2.100 | Variable, weight axis 300 to 900; declared on the web for 400 to 900 |
| Merriweather, italic | 3 files, version 2.101 | Static, a single instance named "Merriweather Light 18pt Italic"; declared on the web for 400 to 900 |
| Public Sans, roman | 3 files, version 2.001 | Variable, weight axis 100 to 900; declared on the web for 400 to 700. No italic |

Both have tabular figures (`tnum`). For iOS, bundle the unmodified upstream TTFs from each project's release rather than converting the web subsets: unmodified files keep the Reserved Font Name question out of the way, cover every script in one file and register cleanly with `UIAppFonts`. Static instances (Merriweather Regular, SemiBold, Bold and Italic; Public Sans Regular, SemiBold and Bold) are simpler to address than variable axes. The OFL texts go in Acknowledgements.

**Mapping to text styles.** The iOS sizes are proposals, set beside the web values they come from. Each custom style declares a base size and the text style it scales with (`Font.custom(_:size:relativeTo:)`, or `UIFontMetrics(forTextStyle:)` in UIKit), so every size follows Dynamic Type to AX5.

| Role | Web value | Proposed iOS font and weight | Base (pt) | Scales with |
| --- | --- | --- | --- | --- |
| Screen title | `--heading-page`: Merriweather 400, 30.4 to 44 px | Merriweather Regular | 34 | `.largeTitle` |
| Section heading | `--heading-section`: Merriweather 600, 22.4 px | Merriweather SemiBold | 22 | `.title2` |
| Subsection heading | `--heading-subsection`: Merriweather 600, 18 px | Merriweather SemiBold | 18 | `.title3` |
| Record text (P1 reader, reports) | `.doc-text`: Merriweather 400, 16.5 px, line height 1.75; on the document page `#panel-doc .doc-text` sets 17 px, line height 1.8, below 700 px wide and 18 px from 700 px | Merriweather Regular, line spacing near 1.7 | 17 | `.body` |
| Interjections | Merriweather italic | Merriweather Italic | 17 | `.body` |
| Body and interface text | Public Sans 400, 16 px | Public Sans Regular | 17 | `.body` |
| Lede | Public Sans | Public Sans Regular | 16 | `.callout` |
| Metadata lines | `.result-meta`, `ink-soft` | Public Sans Regular, `ink-soft` | 15 | `.subheadline` |
| Fine print, source and as-at lines | `.fineprint` | Public Sans Regular, `ink-soft` | 13 | `.footnote` |
| Figures in tiles | Public Sans 700 | Public Sans Bold, tabular | 28 | `.title` |
| Tags, chips, kicker | Public Sans 600, 13 px | Public Sans SemiBold | 13 | `.footnote` |
| Voice countdown | n/a | Public Sans SemiBold, tabular | 17 | `.body` |
| Tab bar, navigation bar buttons, alerts, menus | system | SF Pro (system) | system | system |

System chrome stays in SF Pro: the tab bar, bar buttons, menus, alerts and the keyboard. The house fonts are for content.

**Dynamic Type to AX5.** At AX5, `.body` is about 53 pt. Rules: no `lineLimit` on names, bill titles, figures or labels; side-by-side layouts (tiles, voted for and against columns, figure and label, voice controls) stack vertically at accessibility sizes; charts gain a table view; nothing is clipped to a fixed height. Navigation titles in Merriweather are set through the bar appearance with a scaled font.

### Spacing, rules, targets and controls

**Spacing.** The phone column of the web scale (`--space-1` to `--space-7` at 700 px and below: 4, 6.4, 8, 16, 25.6, 32 and 52 px), rounded to 4, 6, 8, 16, 26, 32 and 52 pt. Screen side margins are 20 pt, matching `.wrap` at 390 px. The row gap is 8 pt either side of a hairline; a second list within a section starts 32 pt down; a section starts 52 pt down.

**Rules.** 1 pt rules (one CSS pixel is one point): `divider-default` between major sections, `divider-subtle` for rows and subheadings, bronze only for intentional accents. Lists use the plain style with hairline separators and serif section headers. Do not wrap sections in inset-grouped cards: the web avoids "a card or filled box merely to create a section boundary". The grouped style suits Account and about, filter sheets and the consent step, which are settings-like.

**Targets.** 44 by 44 pt minimum for anything tappable. The web's control sizes map as compact 44, default 48 and large 56 pt minimum heights, growing with text rather than clipping. Corner radius 4 pt for buttons, fields, chips and tags.

**Buttons.** Primary: navy fill, white label. Secondary: outlined with `line-strong`. Quiet: plain text button. Destructive: the `destructive` role, in `danger` (Delete account, End call). There is no bronze or gold button.

**Tags.** Topic metadata: bronze-wash fill, a decorative hash glyph, `bronze-ink` label, 28 pt visual height inside a 44 pt hit area. Never `ink-faint` on a tag. A tag is never a filter control or a submit button.

**Filter chips.** Applied filters, shown as removable search tokens or a wrapping chip row under the field. The whole chip removes the filter, with an accessible name such as "Remove the kind filter, Declared interests". 4 pt radius, not capsules.

**Segmented control.** For one choice among peers (bill status; the topic era in P1). Use the native segmented picker at `.controlSize(.large)` and measure its height with the Accessibility Inspector; if it is under 44 pt, use the house version (48 pt outside height, 4 pt radius).

**Party identity.** A 10 pt dot plus a readable label, never colour alone. Full names on profiles; the web's short labels (ALP, LIB, GRN) only in dense rows, with the full name as the accessibility label.

### Mark, wordmark and app icon

**What exists.**

- The masthead mark: mainland Australia and Tasmania in `--bronze-bright` (#D9A84A), with seven small four-pointed stars in `--on-navy-soft` arced around it, on the navy masthead.
- The wordmark: "OPAX" in white beside the mark. The X is not styled separately.
- The favicon: a seven-pointed star in #D9A84A on a navy rounded square, the shape of the Commonwealth Star.

**App icon directions (for Jake).**

1. **The Australia mark alone** (recommended): gold land on navy, the stars dropped or reduced to what survives at small sizes. It reads as OPAX without borrowing national symbols.
2. **The full masthead mark** with its arc of stars: closest to the web, but the stars blur at small sizes and, with navy and gold, lean towards official insignia.
3. **The favicon star**: not recommended. A gold seven-pointed star on navy looks like the Commonwealth Star and invites the "is this a government app" question that sections 6 and 8 work to avoid.

Whichever is chosen: no text in the icon; layers prepared for iOS 26's default, dark, clear and tinted appearances; no coat of arms or crest in the app or its listing. The launch screen is the navy ground with the mark only.

**Decoration.** Hairline bronze line work and restrained motion, as with the web's wombat loader: one quiet beat at most, nothing that reads as a mascot. The voice level mark follows the same rule.

### What translates, what becomes native, what not to copy

| Translates directly | Becomes a native idiom | Do not copy from the web |
| --- | --- | --- |
| Colour roles and tokens; light palette | Tab bar instead of the masthead, megamenus and hamburger drawer | Hash routes and the hash-to-path folding |
| Merriweather for headings and the record, Public Sans for interface text | Large titles instead of the masthead heading | Breadcrumb strip (the back stack replaces it) |
| Hairline section structure; no boxes as boundaries | `.searchable` with suggestions instead of the header search panel | Sticky header and Safari viewport tricks |
| Party dot plus label | Sheets with detents for filters, "How votes are counted", sources | Hover popovers (expense terms become a tap-to-open popover or sheet) |
| Bronze reserved for record links, tags and accents | Context menus on rows: Share, Copy link, Open on opax.com.au | Carousel prev and next buttons (use a native scroll) |
| Evidence-first copy, labels on machine text, as-at dates, visible caveats | Voice as a sheet from a navigation bar button, not a floating panel | The floating chat dock: at 390 px its button sits over body text on bill, electorate and contracts pages |
| Blank circle for a missing portrait | Pull to refresh on Today, Your MP and Bills | The 3D money map, journeys, Explore games and the question builder |
| 4 pt radius, 44 pt targets | Swift Charts with audio graphs for votes and pay | Analytics scripts (PostHog, Google Tag Manager): the app ships none in v1 |
| `DisclosureGroup` for method notes | `SFSafariViewController` for external sources; `ShareLink` for sharing | Capsule chips, gold or bronze buttons, uppercase eyebrows beyond the kicker, a separately styled X |

## 6. Copy and voice

### Rules

- **Name.** "Open Parliamentary Accountability Exchange", exactly. "OPAX" in short. The X is not styled separately, so "eXchange" is wrong. (The About page currently says "the Open Parliamentary Accountability eXchange"; the app follows `docs/UI_DESIGN_LANGUAGE.md`.) The web mixes "OPAX" and "Opax" (the voice panel and community use "Opax"); the app uses "OPAX" unless Jake decides otherwise.
- **Tone.** Plain, exact, evidence-first, non-partisan. Say what the record shows and stop. No hype ("powerful", "AI-powered", "uncover the truth").
- **Headings** have no full stops. No em dashes anywhere. No redundant instructions or helper hints; controls speak for themselves.
- **Leads, not accusations.** OPAX's own sentences use descriptive verbs: "appears in both", "accounts for 78.4% of", "gave", "declared", "voted for". They never use "bought", "corrupt", "rort", "scandal", "secret", "exposed", "influence" or "linked to" as insinuation. The rule governs OPAX's editorial assertions, not quotations from the record or official names such as the Foreign Influence Transparency Scheme.
- **Standing caveats**, kept in the web's words:
  - "Party disclosures, not this person's finances."
  - A donor receiving a grant "is a fact on the public record, not a finding".
  - Registering on the foreign influence scheme "is a legal disclosure, not a finding of wrongdoing".
  - "Every donation, meeting and grant figure here is a floor, not a ceiling."
  - On expenses: "a bar past its tick is a fact, not a finding."
  - On pay: "These are entitlements set by instrument, not payslips."
  - On leads: every caveat in the export, in full, including "Annual party receipts are not all verified gifts".
  - On grants: an award is not a payment; an invitation or application is not an award.
- **Machine text** is always labelled: "Machine brief"; "Written by a model from the explanatory memorandum; not the record". It is never called "the record".
- **Voice.** "AI voice powered by ElevenLabs. Answers may be mistaken; check the linked records." appears on the voice screen before every call. The microphone state is always in words.
- **Balance.** Where parties are grouped, Labor, the Coalition and the crossbench appear together, in that order, in the same words whichever government is in office.
- **No editorial picks.** Feeds are date-ordered or reproducible; no "top stories" chosen by hand.

### Numbers and dates

The examples in this list illustrate formats only.

- Locale en-AU. Counts with thousands separators: "13,867".
- Money: to the dollar for records and rates of pay ("$4,537,500"; "$622,102 a year"). In running text, "$4.7 million". Compact forms only in charts and tight figures, in one style. The web has three today: "$24.4M" and "$507K" (`fmtMoney` on entity pages), "$2.3bn" and "$211.6m" (the contracts view) and "$10m" (the daily edition). This document proposes lowercase "m" and "bn" for the app.
- Percentages: one decimal for shares of a whole ("78.4%"); whole numbers that add to 100 where a set of shares is shown together (largest remainder), as the grants exports do.
- Dates: "17 September 2026"; "17 Sep 2026" in dense rows. The web mixes "4 Sept 2026" (electorate pages) with "26 Aug 2026" (bills); the app uses three-letter months throughout. Financial years with an en dash: "2024–25". Ranges in prose: "1998 to 2026".
- As-at dates: the web says both "As of 4 Sept 2026" (electorates) and "as at 26 Aug 2026" (bills, pay). The app uses "As at", the Australian form, followed by the source and, where it applies, the licence: "As at [date] · Source: IPEA quarterly expenditure reports, CC BY 4.0, to [quarter]".
- Voice time: minutes and seconds with tabular figures ("7:42"), and "10 minutes" in words in sentences.

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
> **Promotional text** (170 at most): "Find your MP and see their votes, declared interests and pay. Follow bills through parliament, or talk to OPAX about the record. Every figure links to its source." (162 characters)
>
> **Description, first lines:** "The Open Parliamentary Accountability Exchange (OPAX) puts the public record of Australian politics in one place: how members voted, what they declared, what they are paid and who gave money to their party. You can read everything without an account. Talking to OPAX by voice needs a free OPAX account. OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party."

Subtitles avoid unverifiable claims ("most complete", "trusted"), as guideline 2.3.7 requires.

## 7. Accessibility and inclusion

**Dynamic Type to AX5, with no truncated meaning.** Every screen is checked at the default size, at AX1 and at AX5. Names, bill titles, figures, caveats and voice controls wrap or stack; charts offer a table; nothing important sits in a fixed-height container. Check with Xcode's Accessibility Inspector and the simulator's Dynamic Type override, not with speech.

**VoiceOver labels (spec; to be verified in the Accessibility Inspector).**

| Element | Label |
| --- | --- |
| Party dot | Hidden from VoiceOver; the party name is in the row's text |
| People row | "Anthony Albanese, Australian Labor Party, Member for Grayndler, New South Wales" |
| Aye and noe bar | "43 percent ayes, 57 percent noes", the web's own `role="img"` label format |
| Pay chart | Audio graph through the chart descriptor (`AXChartDescriptor`), with the values also in a table |
| Division party split | "Greens, 9 ayes, no noes" |
| Lead card (P1) | Title, then each metric as "label, value", then every caveat; the evidence link last |
| Evidence row, register link | "4,537,500 dollars, contract value, 6 February 2017, AusTender register, record CN3407266, opens the register" |
| Tag | "Topic: Housing" |
| Filter chip | "Remove the kind filter, Declared interests" |
| Portrait | "Official portrait of [name]", or hidden when the name is beside it; portraits ignore Smart Invert |
| Voice status | Brief announcements of state changes only (connecting, listening, OPAX speaking, muted, ended with the reason); agent turns are not auto-announced because the agent speaks them |
| Voice transcript turn | One element each: "You said …", "OPAX said …"; sources are links |
| Voice countdown | "7 minutes 42 seconds remaining", updated on focus, not continuously |

Values come from the examples in section 4. `docs/IOS-VOICE.md` adds Magic Tap to toggle mute and a headphones suggestion when VoiceOver runs during a call.

**Reduced motion.** No auto-advancing carousels; no animated map; cross-fades instead of slides where the system allows; the loader and the voice level mark become static.

**Meaning never depends on colour.** Party by label; ayes and noes by word and number; lead categories by text; bill status by text; microphone and call state by text; required and error states by text and icon.

**Contrast.** Text tokens meet 4.5:1 on their permitted surfaces. `--bronze` (3.91:1) is reserved for rules and chart marks. `--ink-faint` is limited to paper and raised surfaces (4.56 and 4.80:1); on sunken surfaces and tags the app uses `--ink-soft`. Increase Contrast steps every token up one level.

**Also supported:** Bold Text; Voice Control, with visible labels that match accessibility labels; Full Keyboard Access; the Large Content Viewer for the tab bar; en-AU language tagging so names and party abbreviations are read sensibly.

**Implementation test plan additions.** For each P0 screen: headings and reading order in the Accessibility Inspector match the visual order; focus moves to the sheet's first element when a sheet opens and returns to the control that opened it when it closes; after an error, focus lands on the message and then on Try again; each chart's table view has the same fields and units as the chart; the voice screen keeps focus on the status line when the call state changes.

**Inclusion.** Portraits include former parliamentarians who have died. Many Australian publishers warn Aboriginal and Torres Strait Islander readers that a page may contain images and names of people who have died; the web has no such notice today. This is an open question, not a recommendation made here.

## 8. App Store and policy notes

Checked 3 October 2026 against the App Review Guidelines, last updated 8 June 2026. These are readings of the guidelines, not predictions of review.

| Guideline | What it says (short) | What it means for OPAX |
| --- | --- | --- |
| **5.1.1(viii)** | "Apps that compile personal information from any source that is not directly from the user or without the user's explicit consent, even public databases, are not permitted." | **The largest review risk.** No exception for public office holders is stated. The proposal in section 2 ("Who gets a native page") limits native pages to roster parliamentarians, places, parties and bills; keeps private individuals out of profiles, suggestions and links; and explains the sources and scope in the review notes, with a link to Methods |
| **5.1.1(v)** | Account deletion in the app if the app supports account creation; let people use the app without a login if it lacks significant account-based features | **Launch dependency.** Signing in for voice creates an account, so deletion ships with voice (D3). Everything else works signed out |
| **5.1.2(i)** | Disclose and obtain explicit permission before sharing personal data with third parties, including third-party AI | The voice consent step (4.10), separate from the microphone permission. Ask stays on the web |
| 5.1.1(i) to (iv) | Privacy policy in the metadata and in the app; consent; data minimisation; alternatives to permissions | D6. Microphone only for voice; seat chosen by search, so no location permission in v1 |
| 2.5.14 | Explicit consent and a clear indication when recording, including the microphone | Visible "Listening" state alongside the system indicator |
| 2.5.4 | Background services only for their intended purposes | No background audio; calls end when the app leaves the foreground (`docs/IOS-VOICE.md`) |
| 4.8 | Apps using a third-party or social login for the primary account must also offer an equivalent login that limits data to name and email, lets people keep their email private, and does not collect interactions for advertising without consent; apps using only their own account system are exempt | OPAX's emailed codes are its own system. A social login added later would need an equivalent option meeting those conditions |
| 4.7 | Covers chatbots not embedded in the binary, with filtering and reporting duties | Whether a first-party server assistant counts is unclear (`docs/IOS-VOICE.md` open question 7) |
| 1.2 | UGC needs filtering, reporting, blocking and published contact | Only if member content is shown in the app; not in v1 |
| 1.1.1 | No defamatory or mean-spirited content that could "humiliate, intimidate, or harm a targeted individual" | Leads, not accusations; caveats stay visible; a corrections path in Account and about |
| 1.1.6 | No false information | Machine text and voice labelled; as-at dates; sources on every figure |
| 1.5 | Support URL and an easy way to contact the developer | OPAX has no dedicated inbox today; GitHub issues alone may not satisfy review |
| 2.3, 2.3.7, 2.3.9 | Accurate metadata; name of 30 characters at most; no unverifiable claims; rights to materials in screenshots | Screenshots show the real app. APH portraits are CC BY-NC-ND 4.0; whether that permits their use in store screenshots is a rights question, so avoid them there or use openly licensed portraits |
| 4.2, 4.2.2 | More than a repackaged website; not primarily a content aggregator or collection of links | Your MP, native profiles and bills, voice and offline reading are the app-like core; web-only areas are links |
| 5.1.1(vii) | `SFSafariViewController` must be visible | External sources open visibly |
| 5.2.1, 5.2.2 | Only content you own or are licensed to use; no misleading representations | See "Licences" below |

**Not a government app.** No guideline names government affiliation. The relevant rules are 2.3 (accurate metadata) and 5.2.1 ("misleading … representations"). Saying in the description, Account and about, and the review notes that OPAX is independent and not affiliated with any parliament, government or party is a recommendation, not an assurance of acceptance. The icon and screenshots avoid national insignia.

**Licences.** Facts first, then proposals.

- *Facts.* The About page describes per-source licences: Hansard reproduced under CC BY-NC-ND terms; They Vote For You's compiled division data under the Open Database Licence; most money data under Creative Commons Attribution; the House and Senate registers of interests under CC BY-NC-ND, shown as facts with links; Queensland's register without a verified licence; and some sources (Western Australian, ACT and Northern Territory donations) kept off the public site. The repository's code is AGPL-3.0-only (`LICENSE`, `pyproject.toml`). The AGPL permits distributing covered works under its conditions and treats independent works in an aggregate separately.
- *Proposals, pending a rights review.* Keep the app free, with no advertising and no in-app purchase, as a conservative reading of the non-commercial terms; carry each source's licence and attribution into the app as the web does. Whether App Store distribution can meet the AGPL's conditions for any code reused from the web, and whether new iOS code should carry a different licence, are questions for that review. Reusing contributed code under the existing licence and relicensing it are different things: relicensing needs the agreement of the people who hold the rights.

**Privacy label.** Public reading: the app keeps the chosen seat, cache and consent on the device and sends no account or device identifier. Requests still reach the Worker with an IP address, which the rate limiters read and Worker logs may record; whether that is collection under Apple's definition depends on retention (open question). Voice adds Email Address, User ID, Audio Data, Other User Content (transcripts kept by the provider for one day) and voice usage, all linked to the person and used for app functionality only; `docs/IOS-VOICE.md` section 6 has the table. No tracking.

**Age rating.** Political public records, no objectionable content. The questionnaire's "Unrestricted Web Access" answer depends on how far in-app source views allow browsing; keep them to source pages.

## 9. Open questions for the maintainer

1. **Disconnect score.** Confirm it stays out of v1.
2. **Postcode lookup.** Will the electorates release publish a verified postcode-to-electorate table (D1)? Until then, Your MP is search-only.
3. **Daily edition.** Approve the frozen edition endpoint (D2)?
4. **Voice placement.** A Talk button on every root screen, or a fifth "Talk" tab?
5. **Account deletion scope.** What does deleting an account remove: voice usage, web discussions, lists and messages (`docs/IOS-VOICE.md` question 2)?
6. **Dark mode.** Keep the app light-only like the web, or adopt the proposed dark palette?
7. **App icon.** Australia mark alone, the full masthead mark, or something else?
8. **Private individuals.** Agree the native-page scope in section 2, including no donor pages until donors can be filtered to organisations?
9. **Contact.** Which support URL and contact address can be published for guideline 1.5?
10. **Rights review.** Who reviews the data licences for app distribution and the AGPL question, and before which milestone?
11. **Developer account.** Which legal entity submits the app? This sets the seller name and who holds the rights under 5.2.1.
12. **Name casing.** "OPAX" everywhere, including "Talk to OPAX", retiring "Opax"?
13. **Money format.** Lowercase "m" and "bn" in compact positions?
14. **Cultural notice.** Add a notice about images and names of people who have died, on the web and in the app?
15. **IP addresses.** How long do Worker logs and limiters keep client IPs? The answer decides the public-reading privacy label.
