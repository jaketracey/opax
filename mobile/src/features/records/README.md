# Native records

`doc/[slug]` is the shared reader for public resource slugs accepted by the
Worker. Bill and Talk source links and `fromWebPath` converge here. A record's
⋯ is one menu, `recordActions` in `RecordActions.tsx`: Cite (an inline
section of one Copy per style, then Citation formats…), Copy link and Open on
opax.com.au. It is the reader's only bar item (`recordBarItems`), the iPad
pane bar's ⋯ (`split/RecordDetail.tsx`) and part of a record row's menu. None
of them fetches anything until Cite opens the record. `opax://doc-cite/<slug>`
opens the record, then Citation formats over it.

The reader's header is one meta line ("Speech · House of Representatives"),
the title in the record face (`recordHeadline` in `model.ts`), the speaker as
a person row, and one source line (`source.ts`) whose sheet holds the
original, the record's date, the text's notes and the licence. In short is
an always-visible section heading with the Machine-written pill.
Ask about this is a primary button after its text, on iPhone, Android and
in an iPad pane. Share is in the navigation bar. Organisation search links carry
the donor graph's recorded aliases through search results to tolerant find.
Find handles ampersands, punctuation and every state and territory abbreviation.
If no whole-word variant matches anywhere, it uses the original literal substring.
An unmatched arrival keeps the normal record actions. Find status occupies
space in the iOS scrolling header, above the metadata, never over the content.
Android keeps one status beside Previous, Next and Done outside the list.
Embedded iPad panes hide the status. Each find jump announces its match position.
An explicit find with no hits says No matches.

The document source is preserved in contiguous, selectable text slices in a
FlatList. Speaker/profile links require one unambiguous roster and slug-directory
match. Witnesses and non-roster names remain plain text. Linked bills use exact
normalised register titles or aliases, never a partial title match.

All paid data stays in memory for the session, including in-flight requests.
Failed reads are removed so a user can retry. There are no automatic retries,
focus refreshes or background reads.

| GET                                                    | Explicit action                                             | Requests on a cache miss |
| ------------------------------------------------------ | ----------------------------------------------------------- | ------------------------ |
| `/api/resource/<slug>`                                 | Open the reader, or open Cite directly from a search result | 1                        |
| `/api/search?q=…&kind=speech&per=6&top_k=20[&topic=…]` | Tap Similar speeches                                        | 1                        |
| `/bill-texts/<key>/index.json`                         | Open Bill text (with the default version)                   | 1                        |
| `/bill-texts/<key>/<version>.json`                     | Open Bill text (default version), or choose a version       | 1                        |
| `/api/recent`                                          | Open Just added, or pull to refresh it                      | 1                        |

Repeating an action for a successfully loaded path makes zero additional
requests. Opening Cite from an already loaded document costs zero resource
requests. Similar results use source passages rather than a second brief request.
Opening Bill text costs 2 static requests, the index and the default version,
and shows the text at once. The version is a bar menu and Contents a sheet
that hands its choice back through `contentsChannel.ts`, reading the version
from the session copy. Share as text file contains the displayed version's
exact full source text. Pull to refresh on Just added is the one read that
bypasses the session copy; a failed refresh keeps the list.

Canonical paths are `/doc/<slug>` and `/bill/<key>#bill-full-text`. The resolver also accepts legacy `#/doc/<slug>` links and
`text-version` bill links. Citation strings receive the configured canonical web
origin; e2e's reserved origin never escapes to production.

The citation tests execute the web's formatting functions from
`portal/public/app.js` and compare AGLC-style, APA 7, BibTeX, RIS and original-bill
source citations. Bill-text citations intentionally use the web's single Source
citation form. Citations and downloads use the native share bridge to present
UTF-8 `.txt`, `.bib` or `.ris` files and remove temporary files after dismissal.

`mobile/scripts/fixtures/records/contracts.json` pins the actual Worker projection
of upstream seeds. Its provenance describes which bodies are synthetic; synthetic
text never invents quotations or legal provisions about real people. The division
text comes from the pinned public bill export. The generator has no networking.
Tests execute the actual resource and bill-text handlers against these seeds.
Journey 32 verifies the exact native clipboard bytes while the device harness
owns the pasteboard lock; journey 33 covers version selection, Contents,
Share as text file, recent records, a division and a release.

Machine-written text (In short, a bill version's overview) carries the
Machine-written pill; how it was written is in the pill's sheet, worded for
the record's kind. Divisions and other Markdown texts are read with their
headings as part titles (`markdownParts` in `api/passage-text.ts`).

The reader uses the shared rhythm, section headings for In short, primary
Ask buttons, and a disclosure
for related speeches. Similar speeches uses bounded hybrid retrieval with
a 15-second deadline, matching Search. Failures retain the explicit retry state;
successful empty results say No similar speeches found. Coverage, transcription
and citation
notes are in the source line's sheet; source terms live on Sources and
licences. Full source text remains selectable and virtualised at every size.

Ask about this goes through `useOpenAsk`. It carries the web's document
question into a draft; arrival never submits.
