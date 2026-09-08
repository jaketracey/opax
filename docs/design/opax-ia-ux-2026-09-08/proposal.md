# Opax: IA and UX redesign proposal

Design review · 8 September 2026 · Proposal for discussion, before product implementation

## Recommendation

Organise Opax around the things people are investigating: a question, a topic, a person, a money trail or a bill. Give each a clear entry and a consistent path to the original record.

Use a public-facing **evidence guide** as the default experience, with the depth of a research workspace inside it. Retain Opax’s navy, bronze, Merriweather and Public Sans identity. The largest opportunity is the organisation and continuity of the product, rather than another visual reskin.

The assumed primary audience is a curious member of the public arriving from a headline or shared link. Journalists and researchers are the secondary audience. This is a design hypothesis awaiting audience confirmation, not a finding from user research.

Open [the interactive concept review](./concept-review.html) to compare three directions and inspect four proposed screen structures. The review uses illustrative layouts and clearly marked sample content; it does not query or modify production.

## Evidence and scope

Reviewed the live site at `https://opax.com.au` on desktop and at a 390 × 844 mobile viewport. Inspected the homepage, desktop Explore menu, mobile menu interaction, search and filters, a completed `robodebt` search, Discover, Explore and its ledger, bills and a bill detail, Housing topic and report, Andrew Bragg’s profile, and the money-map entry. Mapped other destinations from the current navigation, router and module source. This is a holistic IA review with representative workflow checks, not an exhaustive functional, accessibility, data-quality or performance audit. A fresh Ask response and every interactive tool were not exercised.

Source baseline: fetched `origin/main`, commit `e61a2ee`, which contains the current `portal/` application. The user’s checkout is on older commit `2a5f20d`, with unrelated local work in the former Next.js application. The proposals target the current portal. No existing application files were changed. The exact deployed Worker commit was not verified.

Source anchors in that baseline:

- `portal/public/index.html`: desktop menu, mobile drawer, shared panels.
- `portal/public/app.js`: route handling around line 1376; directories around 5385; interactive modules around 7448; Ask/chat around 8200–8800; search around 9300 onward.
- `portal/public/style.css`: existing visual tokens and responsive layout.
- `portal/public/ledger.js`: untyped edge mapping around line 88 and donor/party column definitions around 234.
- `docs/DISCOVERY.md`, `docs/MONEY-JOURNEYS.md`, `docs/BILLS-CONTRACT.md`: functional boundaries to preserve.

## Current information architecture

Desktop primary navigation has eight entries: **Ask, Search, Money map, Discover, Bills, Reports, Explore, About**, plus quick search.

| Surface | Current functionality | IA/UX implication |
|---|---|---|
| Home / Ask: `/`, `/ask`; follow-up `/chat` | Question entry, examples, answer sources and follow-up; homepage also carries maps, news, bills, topic feature, additions, declarations, reports and profiles | Clear question action, but an unusually large second job as an everything homepage |
| Search: `/search`; documents `/doc/:slug` | Record retrieval, speaker/party/parliament/topic/year/type filters, retrieval mode, passages/briefs, year distribution, sharing and citation exports | Valuable research flow; terminology and hidden scope make it harder for newcomers |
| Money map: `/money`, `/map` | Interactive connections, jurisdiction selection, guided journeys, source download and fullscreen | A distinctive view has become the name of a whole product area |
| Discover: `/discover` | Agency supplier concentration, party funding, cross-source name overlaps; charts and source examples | Label gives little clue that its default task is government contracts |
| Bills: `/bills`, `/bill/:key` | Directory, status/year/parliament filters, summaries, recorded stages, divisions and speeches | Coherent vertical; legal names in results could use brief plain-language explanations |
| Reports: `/reports`, `/reports/:slug` | Topic investigations with generated summaries, citations, current debate, history and money | Useful editorial entry, but relationship to live topic hubs is under-explained |
| Explore: `/explore?game=…` | Time machine, The tide, quiz, ledger, grants, party/debate matrix, Words per dollar, Then vs now | Mixes recreational discovery and serious research; tools open as dialogs |
| People and organisations: `/subject/person`, `/subject/party`, `/subject/donor`, `/subject/supplier`, `/subject/campaigner` and detail paths | Searchable directories and profiles; speeches, votes, interests and financial records vary by entity | Core content types sit under Explore → Encyclopedia rather than being first-class entries |
| Topics: `/subject/topic` and detail paths | Labelled debate, counts, chronology, coverage and links to reports/search | Natural organising spine already exists, but is buried |
| Declarations: `/declared` | Latest interest-register additions/deletions and person filters | Found from homepage/profile; needs a predictable home under people |
| About: `/about`, `/methods`, `/stats`, `/expenses` | Purpose, methods, citations, coverage and expense-category glossary | Essential trust material; expense definitions also belong beside relevant records |

Mobile uses a different hierarchy: Ask and Money map are prominent; Bills and Discover sit inside Explore; Encyclopedia is a separate group. Keep the same parent-child model across devices.

## Prioritised findings

| Priority | Observed evidence | Proposed change |
|---|---|---|
| P0 | Ledger default rows include Commonwealth contracts/grants under “Donor”, “Party” and “Donations”. Source maps all graph edges into donor/party fields without type discrimination. | Separate political receipts, contracts and grants before presenting totals. Correct table headings, links and CSV schemas. Test that a contract cannot enter a political-receipts total. This is a semantic defect, not just a label preference. |
| P1 | Eight mixed-level primary entries; Explore contains directories, games and financial tools. | Introduce a stable, content-led navigation model with clear task entry points. |
| P1 | Homepage offers quick search, main Ask and a separate Search destination; search hides “Corpus” and “Hybrid / Semantic / Keyword” in its filter dialog. | One explicit Ask / Find records entry, visible record scope, and a separate lightweight entity-jump function in the header. Rename technical search controls. |
| P1 | Ledger and grants are nested in Explore and launched into dialogs. | Give sustained research tools normal pages with stable URLs, local navigation and predictable Back behaviour. Keep short source previews in dialogs or side panels. |
| P1 | Reports and topics cover the same subject but provide different experiences; links exist, yet neither explains the distinction prominently. | Topic hub = live overview and all related material. Report = dated, sourced reading path. Link them with those names and purposes. |
| P1 | Mobile menu reorganises Bills, Discover and Encyclopedia relative to desktop. | Generate both menus from one navigation definition. Change presentation at breakpoints, not taxonomy. |
| P2 | Homepage puts two large maps and multiple question suggestions ahead of many other paths, especially on mobile. | Give users a short choice of starting tasks, then one featured investigation and concise recent activity. Move full visual tools to their destinations. |
| P2 | Search offers strong matches, a year chart and result pagination with different count contexts. | State whether every count means displayed, retrieved, indexed or labelled records; align chart labels and exports with that scope. Recheck the observed “44 matches” chart label beside 147 retrieved matches before shipping. |
| P2 | Profile voting sections foreground aggregate aye/no totals; individual entries include procedural stages. | Lead with identifiable motions/bills, date and stage. Keep procedural votes distinct from a bill’s final passage. Retain coverage notes. |
| P2 | “Corpus”, “The tide”, “Words per dollar”, “Encyclopedia” and “Divisions” require interpretation. | Use familiar task labels, with specialist terms explained at the point of use. Preserve distinctive names as secondary titles where useful. |

Existing strengths to keep: source access, transparent model-written labels, coverage disclosures, shareable directory/search state, source exports, profile section navigation, and evidence links from charts. No proposed redesign should remove these.

## Three viable directions

| Direction | Entry and structure | Best fit | Trade-off |
|---|---|---|---|
| **A. Evidence guide — recommended** | A clear Ask / Find records entry, visible Topics / People / Money / Bills, then a small selection of evidence-led stories | Public discovery with a path to serious research | Needs disciplined home-page curation and concise explanations |
| **B. Research workspace** | Search and filters beside results, source preview and a collection of selected records; persistent local navigation | Frequent journalists and researchers | Denser onboarding; saved collections would require new product behaviour and storage decisions |
| **C. Topic-led publication** | Topics and reports first; headline → explanation → source → underlying data | Readers arriving from news and search engines | Research tools become less immediate; requires a reliable editorial/review cadence |

Choose A as the shell. Borrow B’s results/source layout after the user starts researching, and C’s readable reports within topic hubs. These should be different depths of one product, not three site modes the user must understand.

## Proposed navigation and destination ownership

The logo returns Home. Six primary destinations:

```text
Ask & search
Topics
People & organisations
Money
Bills
Reports

Utilities: Find a person or organisation · About & methods
```

| Parent | Children / local navigation | Existing destinations and tools |
|---|---|---|
| Ask & search | Ask a question; Find records | `/ask`, `/search`, `/chat`, `/doc/:slug` |
| Topics | All topics; topic overview; debate over time; compare parties | `/subject/topic`; Time machine, The tide, party/debate matrix, Then vs now |
| People & organisations | Parliamentarians; parties; donors; suppliers; campaigners; declared interests | Existing subject directories/detail routes; `/declared` |
| Money | Political receipts; government contracts; grants; connections | Ledger; `/discover` comparison views; grants tool; `/money` and `/map`; Words per dollar |
| Bills | All bills; before parliament; passed; bill detail | Existing bill directory and routes; divisions remain attached to the relevant bill/record |
| Reports | All reports; report detail | Existing reports with topic and source cross-links |
| About & methods | About; sources and coverage; methodology; how to cite; expense definitions | Existing About routes; contextual links from figures and record types |

The quiz remains available through a secondary “Interactive tools” collection and relevant topic/home links. Existing `/explore` can serve that collection during migration. Tools have one canonical owner but can have multiple contextual entry points. No feature needs to disappear to simplify the primary menu.

Initial implementation can retain current URLs while changing grouping and labels. Subsequent routes such as `/money/receipts`, `/money/contracts`, `/money/grants` and `/money/connections` are proposals, not routes that currently exist. Keep `/money` and `/map` compatible with existing map links; do not silently change the meaning of bookmarked query parameters. Add new hub/child routes before redirecting anything.

## Core screen and interaction proposals

### 1. Home: make the first useful action obvious

Headline: **“Explore the evidence behind Australian politics.”**

One question/search field with explicit **Ask a question / Find records** modes. Supporting text changes with the mode: Ask produces a generated explanation with sources; Find records retrieves documents. Do not silently infer which mode the user intended. Start with two short examples, and show visible selected scope.

Immediately below: **Browse a topic · Find a parliamentarian · Follow the money · Understand a bill**. Each explains its destination in a sentence. Then one featured topic/report and a short “New in the record” list with dates and record types. Keep coverage one click away; remove raw corpus totals from the main decision path.

Retain the money map as Opax’s distinctive exploratory feature, with a deliberate entry. Avoid mounting an entire 3D scene before someone chooses to explore connections.

### 2. Search and Ask: same context, different output

Keep the query, supported filters and mode visible. Use “Record type”, “Parliament”, “Years” and “Speaker”. Move retrieval tuning into an advanced disclosure: “Match meaning and words”, “Match meaning”, “Match words”. Preserve the underlying values.

Search results show title, speaker, parliament, date, matched passage and source type. Selecting a result opens a source reader beside the result list on a wide screen. On mobile it opens a full page with **Back to results**, restoring query, filters and scroll position.

Ask responses retain source markers beside supported claims, and provide **Read sources**, **Find matching records** and **Ask a follow-up**. Switching modes preserves compatible scope; explain any unsupported filter rather than silently dropping it. Asking about a person from their profile visibly carries that person into scope.

Source reader: title and date → exact passage → surrounding context → official source → copy citation. Label generated summaries as “AI summary” and actual text as “Source passage”; never style one as a quotation from the other. Use the existing citation exports.

### 3. Topic: the connecting page

Housing, for example, opens a concise description followed by **Overview · Speeches · Bills · Money · Reports**. Existing capabilities support parts of this today; bill/topic association and common scope controls require explicit data mapping.

Overview answers: what material is available, what is recent, who appears in the debate, and where to go next. Reports retain their own URLs, dates and source sets. Speech charts remain linked to underlying records, and comparative coverage remains visible. Do not imply money caused a speech or that an industry/topic label establishes a relationship.

### 4. Money: separate the question from the visualisation

Start with **Political receipts · Government contracts · Grants · Connections**. Scope is visible above the content: jurisdiction, source period and record type. The table or comparison is the default for looking up records; graph and guided journeys are available under Connections.

Political receipts show payer, recipient party, disclosed category, financial period, amount and source. Call a receipt a donation only when the source category supports that claim. Contracts show buyer, supplier, recorded value and dates. Grants show program/grantor, recipient, award value and dates. Never combine these into one “donations” total.

Changing views carries only compatible filters. Financial years, calendar dates and whole-archive totals are different scopes. Explain unavailable jurisdiction/type combinations before showing an empty table. “No matching records” and “Data not available” must be different states.

### 5. People, bills and reports

Keep entity-specific information: a person has speeches, recorded votes and declared interests; a party has receipts and members; a supplier has public awards. A party-level receipt must not become a personal donation merely because a person belongs to that party.

Profiles get a compact identity block with supported role/period context and a clear section index. Bills keep official titles but gain a one-line labelled explanation where available, visible status/date, and direct routes to speeches and recorded votes. Reports begin with a short orientation, publication/update date and source coverage, then section navigation and the long-form content.

## Visual direction

Retain the current identity rather than invent a new palette: navy `#142A43`, paper `#FAF9F6`, white `#FFFFFF`, ink `#23271F`, bronze `#8A5A12`, divider `#DFDCD2`. Bronze marks source access and evidence actions; navy carries navigation and primary actions. Do not use party colour as an evaluative score.

Merriweather carries the main question, topic and document title. Public Sans carries controls, metadata, tables and body utilities. Use a restrained 14/16/20/28/40 scale, roughly 65–75 characters for prose, left-aligned reading and tabular numbers in tables. Desktop combines a broad workspace with a constrained reading column. Mobile stacks scope, results and evidence in that order. Keep the map as the single visually expressive surface; surrounding research controls should be quiet.

Design-plan critique: a generic homepage card grid would simply reorganise the current overload. The proposed homepage instead uses one entry, four concise task links and a single featured subject. A permanent dashboard sidebar would burden first-time visitors, so use it only within complex research views. The existing warm paper/serif style is intentional continuity with the live brand, not a new visual direction.

## Delivery sequence and acceptance criteria

1. **Semantics and navigation.** Fix ledger edge types and exports; introduce one navigation model for desktop/mobile; expose Topics, People and Money groupings; retain legacy routes. Acceptance: every existing destination has an owner; no public award appears as a political donation; keyboard focus and menu dismissal work; existing deep links survive.
2. **Home and finding.** Implement the simplified home, explicit Ask/Search modes and visible scope. Acceptance: question and filters survive supported mode changes; a user can find a person, a bill and a money dataset without knowing an internal feature name; errors offer a useful next step.
3. **Research continuity.** Build the source reader, topic connections and normal pages for ledger/grants. Acceptance: search → document → official source → Back preserves context; exports represent the selected type and scope; mobile uses readable record details instead of a compressed desktop workspace.
4. **Refinement and optional persistence.** Validate profiles, bills and reports together; improve contextual tool links. Consider saved evidence collections only after testing demand. They are new scope, not a prerequisite for the IA change. Define local storage, export, deletion and account expectations before promising them.

For implementation, start from a clean checkout of current `origin/main`, rather than changing the obsolete `opax/src/components/nav.tsx`. Likely seams are the portal shell, route metadata, shared directory renderer, money modules, and their focused tests. Do not turn the design exercise into a framework migration.

## Validation plan

Run a small moderated round with 5–6 public users and 2–3 researchers. This will identify usability problems, not establish population-wide statistical claims. Use tree tests before visual testing and observe these tasks without teaching the menu:

- Find what a named speaker said about housing and open the original passage.
- Find a party’s disclosed receipts and explain what the total includes.
- Find an agency’s leading supplier and inspect a source record.
- Understand a bill’s status and distinguish recorded divisions from passage.
- Move from a topic report into the relevant speech and return without losing place.

Proposed acceptance targets: at least 80% task completion without help; no participant mistakes a public award for a political donation; each critical source is reachable within two deliberate actions from a result or claim. Treat these as targets to test, not improvements already measured.

Check 390px mobile, intermediate widths, keyboard-only use, zoom/reflow, reduced motion, long names, slow loading, partial data and unavailable sources. Existing skip links, accessible names, model/source distinctions and focus restoration are requirements to preserve. Use privacy-safe aggregate events for navigation/task transitions; inspect the current event allowlist before adding instrumentation and never send raw questions or political-interest profiles.

## Decision for the next design iteration

Recommend A, the evidence guide, with **Money and navigation first**, then **Home + Ask/Search**, then **topic/source continuity**. Confirm the intended audience and direction using the concept review; implementation should follow that concrete design choice.
