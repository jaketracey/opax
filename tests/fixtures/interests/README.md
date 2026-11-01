Recorded on 3 October 2026 from the opax-refresh VM using the approved access route.
No credentials or response headers are retained.

- `house-index.html`: the six `members-interests__table` elements from the House
  register fetched with Firecrawl (`basic proxy setting`, `waitFor: 3000`). Contains all
  151 members, the new APH statement API links and four remaining static PDFs.
  Source: https://www.aph.gov.au/Senators_and_Members/Members/Register
- `senate-index.html`: the register table (76 entries), fetched by the same route.
  Source: https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Senators_Interests/Senators_Interests_Register
- `senate-269375.html`: Alex Antic's title, details and interests blocks, with
  unrelated page chrome removed. Text, dates and table structure are unmodified.
  Source: https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Senators_Interests/Senators_Interests_Register/269375
- `house-abdo.pdf`: the original 532,952-byte API PDF, obtained directly with
  `OPAX research (opax.com.au)`. Used to verify that unread scans stay flagged.
  Source: https://interests-register-api-public.aph.gov.au/api/members/316915/statement/48
- `house-legacy-byrnes.json`: the read-only legacy metadata recorded from the
  September House baseline on 3 October. The index misspelled Alison Byrnes as
  Brynes; its original source PDF filename and document ID are Byrnes. Used to
  limit that metadata correction to the verified legacy identity. The original
  source URL is retained in the fixture; no current source request is required.

These records contain declared facts and retain their original source links.
HTTP envelopes and transport failures in the tests are synthetic; the source
layouts and PDF bytes are recorded. Tests make no network requests.

- `house-king-48.pdf`: the original 575,161-byte statement retained from the
  authorized direct read on 31 October 2026. No request was made while adding
  this regression. SHA256:
  `60e72cec465b9b7f955f6d4e1fd8f1f3e14dcb9aa611ca8149e6b537b3813e92`.
  Source: https://interests-register-api-public.aph.gov.au/api/members/102376/statement/48
- `house-king-page33-blocks.json`: the parser's unmodified table-cell geometry
  extracted from page 33 of that exact PDF. The three entries are a gift,
  Seven West Media tickets/hospitality dated 14 August, and a Woodside date
  correction stating 4 July instead of 14 July. The notification was submitted
  on 15 September; tests retain that record date and the original correction
  text, without inferring a new structured event date or correction kind.

Deployment of the parser/export correction does not regenerate the published
register files. Repairing historical rows remains a separate gated reparse and
data review: retain source hashes, additions/deletions, holders, notification
dates, corrected and prior event-date wording, and original page citations.
Source access holds and the nightly publication gate must remain in force.
