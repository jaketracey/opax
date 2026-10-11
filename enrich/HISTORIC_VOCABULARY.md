# Historic brief vocabulary

These assets provide **whole-term** exceptions to the historic novelty guard. They do
not apply to live sources. Input hashes, counts and selections are recorded in
`historic-vocabulary-provenance.json`.

- `src/historic-words.json`: 66,298 lowercase lexical words. The public-domain
  [12dicts 6.0.2](https://wordlist.aspell.net/12dicts-readme/) `3of6game` list supplies
  ordinary words and inflections from British and American dictionaries; annotations
  are removed. Lowercase hyphenated/contraction words from its `2of12` list supplement
  it. Proper-name, abbreviation and multiword lists are excluded. These selected
  lists are public domain; AGID-derived lists are not used.
- `src/historic-geography.json`: 626 country/territory forms and 243 demonym/nationality
  forms. Sources are the [FCDO country index](https://www.gov.uk/csv-preview/6a5e0ceb9e2827ee5f6d08ca/FCDO_Geographical_Names_Index_July2026.csv),
  [GOV.UK nationality list](https://www.gov.uk/government/publications/nationalities/list-of-nationalities)
  and the desktop `iso_3166-1.json` from iso-codes. Conventional/historic aliases include
  United States, Britain, Burma, East Timor, Soviet Union and Yugoslavia. Crown copyright
  data is reused under [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
- `src/historic-offices.json`: 765 whole office/portfolio forms from the Handbook
  roster's **portfolio** field. Selection uses the portfolio itself, `Minister for`,
  `Shadow Minister for` and trailing `Minister` variants when it is not already an
  office. Appointment people and ministry names are never used. Fields containing
  personal honorifics are excluded. Explicit parliamentary titles also appear in
  `OFFICE_TERMS` in `src/validate.ts`.

Every exception checks the full candidate. Dictionary words qualify only as one lexical
word, including a dictionary-listed contraction or hyphenation. A multiword term cannot
inherit an exemption from any of its component words. Office and country phrases retain
`for`/`the`; `and` joins only where declared office/country wording calls for it. Joined
terms still require a complete match, including any attached capitalised word.

There are no generic street, river, electorate, institution-suffix or program exemptions.
The acronym exception accepts a whole token of two to six ASCII capitals. Such a short
uppercase token is ambiguous; the rule treats it as an acronym. A dictionary word used
as a surname alone can also pass: this is the explicitly accepted residual. Unknown
full names and unknown tokens attached to dictionary words or offices still fail.
