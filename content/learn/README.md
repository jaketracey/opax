# Learn: how Parliament works (draft)

First drafts of OPAX's plain-English guide and glossary. Name-neutral: the product name for this is
still being chosen. This is a draft for fact-checking; nothing here is wired into the site or app yet.

## Files

| File | What it holds |
| --- | --- |
| `chapters/NN-slug.md` | One chapter. Frontmatter (`slug`, `title`, `order`, `summary`), then screens. |
| `glossary.json` | 40 terms: `term`, `slug`, `short` (20 words or fewer), `more` (2 to 4 sentences), `chapter`, `example` (OPAX URL and label, where one exists), `facts`, `sources`, `see_also` (slugs). |
| `facts.json` | One entry per fact marker: `claim`, `status`, `quotes` (source id and a verbatim quote of 25 words or fewer), and `as_at`, `derived` or `note` where they apply. |
| `sources.json` | One entry per source: `publisher`, `title`, `url`, `retrieved`, `sha256` of the saved page, and every quote used from it with its fact id. |
| `examples.json` | The real OPAX pages used in "See it in OPAX", each with its last read-only GET status. |

## Chapter format

- Screens are separated by a line that is exactly `---screen---`. Each screen starts with a `## Heading`
  and holds one idea in about 40 to 90 words.
- `[[f:fact-id]]` after a sentence ties it to `facts.json`. Strip these markers before display.
- `{{term}}` links a glossary term by its `term` or `slug`. `{{shown words|term}}` shows different words
  (for a plural, say) and links the same term. Display the shown words; link to the term.
- A screen above the reading target carries `<!-- grade: reason -->`.
- The last screen of every chapter is `## See it in OPAX`, a list of links to real OPAX pages.

## Sources

Facts come from the Parliamentary Education Office (peo.gov.au), the Constitution on the Federal
Register of Legislation, and the AEC. Nothing was fetched from www.aph.gov.au or ParlInfo; a fact that
needs one of those has `status: "needs_aph_source"`. Facts about what OPAX's own screens show cite the
code that draws them (publisher `OPAX`), and example facts cite the OPAX record.

Saved copies of every fetched page (URL, retrieval time, sha256) are kept outside git in
`~/opax-work/learn-sources/`.

## Checking

```
node scripts/learn/check.mjs                                      # structure, links, em dashes, grades
node scripts/learn/check.mjs --snapshots ~/opax-work/learn-sources  # also match every quote to its saved page
```

The reading grade is Flesch-Kincaid per screen, with a simple syllable count, so treat it as a guide.
The aim is 8 or under.
