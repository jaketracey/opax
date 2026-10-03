Recorded on 3 October 2026 from the opax-refresh VM using the approved access route.
No credentials or response headers are retained.

- `house-index.html`: the six `members-interests__table` elements from the House
  register fetched with Firecrawl (`proxy: basic`, `waitFor: 3000`). Contains all
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

These records contain declared facts and retain their original source links.
HTTP envelopes and transport failures in the tests are synthetic; the source
layouts and PDF bytes are recorded. Tests make no network requests.
