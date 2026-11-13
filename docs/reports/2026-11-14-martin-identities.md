# Martin identities: measurement before implementation

Measured offline on 14 November 2026 from the read-only `/home/jake/.cache/autoresearch/parli.db`, branch base `c4185f03b` (portal row 179). The [original metadata fixture](../../tests/fixtures/speech-identities/martin.json) lists all 663 candidate speech ids. The [measurement receipt](2026-11-14-martin-measurement.json) pins every proposed move, both holds, source checksum and service records. This measurement is committed before resolver changes.

All rows below are federal House (`representatives`) rows. A blank seat is shown as `(empty)`.

| Source | Seat | Dates | Current id | Rows | Decision |
| --- | --- | --- | --- | ---: | --- |
| zenodo | Cunningham | 1998-03-02 to 2002-06-27 | 10905 | 344 | Stephen Paul Martin |
| zenodo | (empty) | 2001-08-06 to 2002-05-14 | 10905 | 2 | Stephen Paul Martin: explicit Stephen print |
| wragge_xml | Banks | 1970-03-18 to 1980-05-15 | 10937 | 131 | Vincent Joseph Martin |
| wragge_xml | BANKS, NEW SOUTH WALES | 1971-03-09 | 10937 | 1 | Vincent Joseph Martin |
| wragge_xml | (empty) | 1972-03-23 to 1973-11-29 | 10937 | 2 | Hold |
| wragge_xml | MACARTHUR | 1988-03-23 to 1990-09-13 | 10937 | 8 | Stephen Paul Martin |
| wragge_xml | Cunningham | 1998-03-02 to 2002-06-27 | 10937 | 131 | Stephen Paul Martin |
| wragge_xml | Dickson | 1998-03-02 to 1998-07-03 | 10592 | 44 | Anthony Charles Smith |

Exactly **661 additional rows** are proposed to move: **485** to Stephen Martin's existing `person_9c02d321caef54b2ba21a1f8`, **132** to Vincent Joseph Martin (`person_e88df9ffb591568ea3b6ea51`), and **44** to Anthony Charles Smith's existing `person_efb744ffb3a25d578e592281`. Vincent has no existing full-person catalogue entry; his id is `parli.electorates.stable_id('person', 'handbook:KN9')`, based on the held Handbook PHID, rather than reusing a surname stub. Wragge exports and KB eligibility stay excluded.

The held Handbook cache (SHA-256 `3754df31cdb3df2e7f08eb06a08e501f0cb26ca5d2f211bdb819f957eb3ed3b8`) establishes:

| Identity | PHID | Dated service |
| --- | --- | --- |
| Stephen Paul Martin | 8I4 | House, 1984-12-01 to 2002-08-16 |
| Steven Leigh Martin, senator Steve Martin, id 10905 | 275266 | Senate, Tasmania, 2018-02-09 to 2019-06-30 |
| Fiona Barbouttis Martin, id 10937 | 282982 | House, Reid, 2019-05-18 to 2022-05-21 |
| Vincent Joseph Martin | KN9 | House, Banks, 1969-10-25 to 1980-09-19 |
| Anthony Charles Smith | SK6 | House, Dickson, 1996-03-02 to 1998-10-03 |
| Anthony David Hawthorn Smith, Tony Smith, id 10592 | 00APG | House, Casey, 2001-11-10 to 2022-04-11 |

The manifest-pinned electorate catalogue independently supplies Stephen's Macarthur term (`term_59774310ac7f5781829d8fe1`, 1984-12-01 to 1993-03-13), Cunningham terms from 1993-03-13, and the Dickson term already reviewed in row 179. Every proposed row lies inside the target's recorded House and seat service. The 346 Stephen prints cannot belong to a senator who began service in 2018. Reid and Casey service both begin after their incorrectly attributed historical rows. Raw prints, seats and parties remain evidence and will not be rewritten.

Two candidates stay exactly as stored: **615266**, `Mr MARTIN`, 1972-03-23, no seat (surname alone lacks reviewed seat evidence); **622652**, `The DEPUTY SPEAKER (Mr Martin`, 1973-11-29, no seat (malformed presiding-officer attribution). These are explicitly held rather than assigned by surname. The original 89 corrections from row 179 remain a separate baseline; the combined unrepaired-snapshot delta should be **750**, followed by zero on a second pass.
