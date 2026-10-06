# Native records

`doc/[slug]` is the shared reader for public resource slugs accepted by the
Worker. Bill and Talk source links and `fromWebPath` converge here. Search can
use `RecordActions` to open Cite or copy a record permalink without fetching
anything per result row.

The document source is preserved in contiguous, selectable text slices in a
FlatList. Speaker/profile links require one unambiguous roster and slug-directory
match. Witnesses and non-roster names remain plain text. Linked bills use exact
normalised register titles or aliases, never a partial title match.

All paid data stays in memory for the session, including in-flight requests.
Failed reads are removed so a user can retry. There are no automatic retries,
focus refreshes or background reads.

| GET | Explicit action | Requests on a cache miss |
| --- | --- | --- |
| `/api/resource/<slug>` | Open the reader, or open Cite directly from a search result | 1 |
| `/api/search?q=…&kind=speech&per=6[&topic=…]` | Tap Similar speeches | 1 |
| `/bill-texts/<key>/index.json` | Open Bill text | 1 |
| `/bill-texts/<key>/<version>.json` | Tap Read full bill text or choose a version | 1 |
| `/api/recent` | Open Just added to the record | 1 |

Repeating an action for a successfully loaded path makes zero additional
requests. Opening Cite from an already loaded document costs zero resource
requests. Similar results use source passages rather than a second brief request.
Opening Bill text first shows the collected versions; Read full bill text is a
separate action, as on the web. Downloads contain the displayed version's exact
full source text.

Canonical paths are `/doc/<slug>`, `/bill/<key>#bill-full-text` and
`/#hp-indexed-title`. The resolver also accepts legacy `#/doc/<slug>` links and
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
owns the pasteboard lock; journey 33 covers version selection, text navigation,
download, recent records, a division and a release.

The web's generic summary caption says “this speech” even for releases and
research documents. Those native records instead use its truthful label,
“Machine summary · not part of the record”. Speech and bill-text summary captions
retain the web's exact wording.
