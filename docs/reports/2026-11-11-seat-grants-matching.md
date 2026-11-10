# Federal grants: audit of fourteen unmatched seats

11 November 2026. Local review evidence, not a new source refresh or a deployment.

The fourteen zero entries added in the first D5 commit were not supported funding totals. They came from filling the grants index with the current House roster after the postcode join had produced no matched awards. This review removes those entries and their empty slice files. The remaining 139 seat records and all 7,906 matched awards are unchanged.

The missing allocations cannot be recovered reliably from the held grant locations and mapping table. No postcode normalisation, seat spelling or state-code correction resolves these fourteen gaps. A different tie-break would redistribute awards arbitrarily. The exporter therefore retains the matched-seat list from `origin/main` and the validator rejects any seat with `c: 0`.

**Held inputs and the exact join**

- A read-only snapshot of `parli.db`, using `file:.../parli.db?mode=ro`. The audit reads public `ext_grants`, `ext_grant_details` and `postcode_electorates` records. It does not scrape GrantConnect, alter the source database or contact D1.
- The mapping has 2,358 rows, 1,782 distinct postcodes and 147 distinct seat names. Its only columns are `postcode`, `electorate_name`, `state`, `ratio`. It has no boundary vintage, effective dates or provenance column. Historical names such as Stirling coexist with current names; Bullwinkel and Hawke are absent.
- There are 9,425 held detail records with `http_status = 200`, fetched from `2026-09-05T01:35:24Z` to `2026-09-13T06:11:44Z`. All are represented in the public-source snapshot used for local D5 generation. These are a partial detail harvest, not all Commonwealth grant locations.
- Neither `ext_grants` nor `ext_grant_details` holds a federal electorate id or name. The detail table holds recipient suburb/town/postcode/state and delivery postcode/state, with no delivery coordinates or street address. The separately held electorate boundaries do not supply the missing grant delivery points.

```python
pc_el = {}
for r in q("SELECT postcode, electorate_name, state, ratio "
           "FROM postcode_electorates ORDER BY ratio"):
    pc_el[r["postcode"]] = (r["electorate_name"], (r["state"] or "").lower())

pc = d["delivery_postcode"] or d["recipient_postcode"]
if pc and pc in pc_el:
    el, elst = pc_el[pc]
```

The postcode string is the lookup key. State is taken from the chosen mapping row, not compared with the location state. The seat name is an output, not a name join. Highest ratio wins; when the highest ratio is tied, the last database row wins. `ORDER BY ratio` defines no tie-break, so the observed choices below are specific to the audited snapshot. Every candidate mapping for the seven seats that do appear in the table has the same state code as its other postcode candidates. Changing state-code case would not resolve those ties. Missing names were also checked after case and punctuation normalisation.

**Coverage by seat**

"Candidate detail rows" counts held detail records whose selected postcode appears anywhere among that seat's mapping candidates. These counts overlap across seats and are not grant counts or seat funding totals. A dash means the seat has no mapping candidates from which to count.

| Seat | Mapping rows | Postcodes chosen for seat | Candidate detail rows | Detail rows actually assigned | Cause |
|---|---:|---:|---:|---:|---|
| Bullwinkel | 0 | 0 | - | 0 | No mapping rows, including normalised name search |
| Cowan | 21 | 0 | 64 | 0 | All candidate postcodes lost at equal highest ratios |
| Farrer | 0 | 0 | - | 0 | No mapping rows, including normalised name search |
| Hawke | 0 | 0 | - | 0 | No mapping rows, including normalised name search |
| Lalor | 0 | 0 | - | 0 | No mapping rows, including normalised name search |
| Macquarie | 0 | 0 | - | 0 | No mapping rows, including normalised name search |
| Moreton | 6 | 0 | 18 | 0 | All candidate postcodes lost at equal highest ratios |
| Parkes | 0 | 0 | - | 0 | No mapping rows, including normalised name search |
| Riverina | 0 | 0 | - | 0 | No mapping rows, including normalised name search |
| Robertson | 9 | 0 | 57 | 0 | All candidate postcodes lost at equal highest ratios |
| Swan | 14 | 0 | 52 | 0 | All candidate postcodes lost at equal highest ratios |
| Tangney | 22 | 0 | 135 | 0 | All candidate postcodes lost at equal highest ratios |
| Watson | 10 | 0 | 24 | 0 | All candidate postcodes lost at equal highest ratios |
| Werriwa | 9 | 4 | 8 | 0 | No fetched location at the four chosen postcodes; shared postcodes lost ties |

For Cowan, Moreton, Robertson, Swan, Tangney and Watson, respectively, all 21, 6, 9, 14, 22 and 10 mapping rows lose to an equal-ratio candidate. None loses to a strictly higher ratio. Werriwa wins `2174`, `2175`, `2177` and `2178`, but no fetched detail uses any of those postcodes in either its recipient or delivery field. Its eight candidate detail rows use shared postcodes selected for other seats.

**Source rows and observed results**

Three public award examples are shown for each requested seat. For seats present in the map, they use a postcode listed as a candidate for that seat. For the seven seats absent from the map, the examples are locality probes, not asserted seat assignments: a suburb, council name or regional recipient is insufficient to establish a grant delivery electorate, particularly for national or multi-site awards. The table deliberately records the actual join result instead of reallocating them by inference.

`NULL` is a missing source field. Delivery postcode takes priority whenever present. A recipient suburb identifies the recipient address, not necessarily the project site. Mapping candidates below are the complete held candidate list for the selected postcode; the arrow identifies the snapshot's chosen row. Values are the published award values, not payments or proposed new seat totals.

**Bullwinkel**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA351102](https://www.grants.gov.au/Ga/Show/f6d03fea-01eb-4794-bfa3-80362cb55fc9), Kalamunda City Council | $5,400,000.00 | Forrestfield, 6926, WA | 6058, WA | 6058: Swan (wa, 0.25); Cowan (wa, 0.25); Pearce (wa, 0.25); Hasluck (wa, 0.25) -> **Hasluck** |
| [GA132403](https://www.grants.gov.au/Ga/Show/6fc91578-219a-4153-bb4e-dc8fdd9dc203), Mundaring Community Men's Shed (Inc) | $990,000.00 | Mundaring, 6073, WA | 6073, WA | 6073: Pearce (wa, 1) -> **Pearce** |
| [GA215659](https://www.grants.gov.au/Ga/Show/7432c911-eceb-47ff-b31f-4b66619d987a), SHIRE OF KALAMUNDA | $240,500.00 | KALAMUNDA, 6076, WA | 6076, WA | 6076: Pearce (wa, 1) -> **Pearce** |

**Cowan**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA507033](https://www.grants.gov.au/Ga/Show/42b0dbfc-ccab-4329-ada4-dd8538d55fd6), BIZLINK INC | $58,113,722.08 | JOONDALUP, 6027, WA | NULL, National | 6027: Curtin (wa, 0.3333); Cowan (wa, 0.3333); Moore (wa, 0.3333) -> **Moore** |
| [GA68115](https://www.grants.gov.au/Ga/Show/e459014f-eca2-c6de-ad83-137e6edec7e9), Joondalup Hospital Pty Limited | $56,634,269.27 | JOONDALUP, 6027, WA | NULL, WA | 6027: Curtin (wa, 0.3333); Cowan (wa, 0.3333); Moore (wa, 0.3333) -> **Moore** |
| [GA158](https://www.grants.gov.au/Ga/Show/e2c4be4a-9208-8db3-109d-9029577204c0), CYBER SECURITY RESEARCH CENTRE LTD | $55,000,000.00 | BARTON, 2600, ACT | 6027, WA | 6027: Curtin (wa, 0.3333); Cowan (wa, 0.3333); Moore (wa, 0.3333) -> **Moore** |

**Farrer**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA73534](https://www.grants.gov.au/Ga/Show/0ae3eac9-ff26-6bfb-e710-0aded565086a), Remote Vocational Training Scheme Ltd Original: Remote Vocational Training Scheme ltd | $60,079,548.21 | ALBURY, 2640, NSW | NULL, NSW | 2640: no mapping rows -> **unmatched** |
| [GA314703](https://www.grants.gov.au/Ga/Show/a0156601-15c2-4629-bb04-7cdc66d0d516), MURRAY IRRIGATION LIMITED | $36,897,300.00 | DENILIQUIN, 2710, NSW | 2710, NSW | 2710: no mapping rows -> **unmatched** |
| [GA386119](https://www.grants.gov.au/Ga/Show/37be2595-fe0a-4f47-bf78-6fffdedd8785), Albury Wodonga Aboriginal Health Service Ltd | $26,524,467.95 | GLENROY, 2640, NSW | NULL, NSW | 2640: no mapping rows -> **unmatched** |

**Hawke**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA190636](https://www.grants.gov.au/Ga/Show/75b16150-6e2e-44c1-aeaa-432301e9140e), Western Health | $10,774,392.29 | BACCHUS MARSH, 3340, VIC | NULL, VIC | 3340: Fraser (vic, 1) -> **Fraser** |
| [GA53945](https://www.grants.gov.au/Ga/Show/4909322c-b648-e624-1d62-a300ee37e9e6), Melton City Council | $6,870,543.23 | MELTON, 3337, VIC | NULL, VIC | 3337: Gorton (vic, 0.5); Fraser (vic, 0.5) -> **Fraser** |
| [GA53248](https://www.grants.gov.au/Ga/Show/45a1ebb2-f1ed-9f41-af56-3eb626a18270), Djerriwarrh Health Services | $6,031,217.52 | BACCHUS MARSH, 3340, VIC | NULL, VIC | 3340: Fraser (vic, 1) -> **Fraser** |

**Lalor**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA153663](https://www.grants.gov.au/Ga/Show/77eb2944-f97f-41e9-8e24-368dd142fa50), Wyndham City Council | $8,111,448.00 | WERRIBEE, 3030, VIC | 3030, VIC | 3030: Gellibrand (vic, 0.3333); Gorton (vic, 0.3333); Fraser (vic, 0.3333) -> **Fraser** |
| [GA53980](https://www.grants.gov.au/Ga/Show/490ef9b3-a15d-ad84-f07a-7a2cdca342d1), Wyndham City Council | $6,330,097.09 | WERRIBEE, 3030, VIC | NULL, VIC | 3030: Gellibrand (vic, 0.3333); Gorton (vic, 0.3333); Fraser (vic, 0.3333) -> **Fraser** |
| [GA386589](https://www.grants.gov.au/Ga/Show/0efc5a1d-1a24-4e02-9809-baf9348b2ef9), Wyndham Community and Education Centre Inc. | $3,508,258.56 | WERRIBEE, 3030, VIC | NULL, VIC | 3030: Gellibrand (vic, 0.3333); Gorton (vic, 0.3333); Fraser (vic, 0.3333) -> **Fraser** |

**Macquarie**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA381729](https://www.grants.gov.au/Ga/Show/f7145a80-b074-4432-83c5-c18b6ec15905), NORTHROP GRUMMAN AUSTRALIA PTY LIMITED | $13,364,918.60 | RICHMOND, 2753, NSW | 2755, NSW | 2755: no mapping rows -> **unmatched** |
| [GA224088](https://www.grants.gov.au/Ga/Show/701d6051-0ff0-4590-86dd-530d7e1a2796), KATOOMBA CHAMBER OF COMMERCE AND COMMUNITY INC | $4,004,275.00 | KATOOMBA, 2780, NSW | 2780, NSW | 2780: no mapping rows -> **unmatched** |
| [GA237702](https://www.grants.gov.au/Ga/Show/ec053119-778e-4a35-9830-944e4d5f662f), BLUE MOUNTAINS CITY COUNCIL | $3,991,883.00 | KATOOMBA, 2780, NSW | 2782, NSW | 2782: no mapping rows -> **unmatched** |

**Moreton**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA254390](https://www.grants.gov.au/Ga/Show/d6c7c515-32c5-4977-a6f6-9c41400c8a3f), Triple P International Pty Ltd | $80,689,929.16 | INDOOROOPILLY, 4068, QLD | NULL, QLD | 4068: Moreton (qld, 0.5); Ryan (qld, 0.5) -> **Ryan** |
| [GA269615](https://www.grants.gov.au/Ga/Show/60eab76c-9680-4b91-b643-008264f3dc81), Heart of Australia Pty Ltd | $23,636,800.00 | CHELMER, 4068, QLD | NULL, QLD | 4068: Moreton (qld, 0.5); Ryan (qld, 0.5) -> **Ryan** |
| [GA278939](https://www.grants.gov.au/Ga/Show/ecb57bfd-9269-424c-ab37-0f797c8b1679), Autism Queensland Limited | $13,617,478.74 | SUNNYBANK HILLS, 4109, QLD | NULL, QLD | 4109: Moreton (qld, 0.5); Rankin (qld, 0.5) -> **Rankin** |

**Parkes**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA405912](https://www.grants.gov.au/Ga/Show/f44ab6b3-6b25-448a-8650-aa2a0a793e22), Western Health Alliance Limited | $141,628,427.60 | DUBBO, 2830, NSW | NULL, NSW | 2830: Calare (nsw, 1) -> **Calare** |
| [GA386044](https://www.grants.gov.au/Ga/Show/b1c62d02-a7f5-416c-afc3-f1023fcd9ef4), Maari Ma Health Aboriginal Corporation | $57,428,417.85 | BROKEN HILL, 2880, NSW | NULL, NSW | 2880: no mapping rows -> **unmatched** |
| [GA57114](https://www.grants.gov.au/Ga/Show/5de98c8b-0d93-bf30-8f06-b1d1d6553185), REGIONAL ENTERPRISE DEVELOPMENT INSTITUTE LTD Original: Regional Enterprise Development Institute Ltd | $37,282,737.56 | DUBBO, 2830, NSW | NULL, NSW | 2830: Calare (nsw, 1) -> **Calare** |

**Riverina**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA506932](https://www.grants.gov.au/Ga/Show/1e98e51f-4ae0-4472-9752-4dc3474de15c), Sureway Employment and Training Pty Ltd | $141,648,409.58 | WAGGA WAGGA, 2650, NSW | NULL, National | 2650: no mapping rows -> **unmatched** |
| [GA400189](https://www.grants.gov.au/Ga/Show/c66fa977-97e2-4fdd-9895-99dcc1260490), FirstHealth Limited | $74,928,490.27 | WAGGA WAGGA, 2650, NSW | NULL, NSW | 2650: no mapping rows -> **unmatched** |
| [GA31996](https://www.grants.gov.au/Ga/Show/eb784dc9-fad9-9e04-c52c-4d5a0f2e6285), Charles Sturt University | $22,000,000.00 | WAGGA WAGGA, 2678, NSW | NULL, NSW | 2678: no mapping rows -> **unmatched** |

**Robertson**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA506957](https://www.grants.gov.au/Ga/Show/e2e86ddf-f424-4274-b27b-b3052b2c0989), Omnia Inclusive Employment Solutions Ltd | $66,907,182.21 | GOSFORD, 2250, NSW | NULL, National | 2250: Robertson (nsw, 0.5); Dobell (nsw, 0.5) -> **Dobell** |
| [GA328133](https://www.grants.gov.au/Ga/Show/0e3c58e1-cb5d-42f5-a412-c0b9c9f37dfe), NAISDA LIMITED | $34,509,200.00 | Kariong, 2250, NSW | NULL, NSW | 2250: Robertson (nsw, 0.5); Dobell (nsw, 0.5) -> **Dobell** |
| [GA177734](https://www.grants.gov.au/Ga/Show/72b60cd2-64d1-4f23-a339-d731c85a6224), University of Newcastle | $32,500,000.00 | Gosford, 2250, NSW | 2250, NSW | 2250: Robertson (nsw, 0.5); Dobell (nsw, 0.5) -> **Dobell** |

**Swan**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA400410](https://www.grants.gov.au/Ga/Show/20922b7a-309d-4e50-8a4f-27424218de93), Department of Planning, Lands and Heritage WA Government | $30,000,000.00 | Perth, 6000, WA | 6057, WA | 6057: Swan (wa, 0.25); Cowan (wa, 0.25); Pearce (wa, 0.25); Hasluck (wa, 0.25) -> **Hasluck** |
| [GA215900](https://www.grants.gov.au/Ga/Show/a61172e7-03e5-4a03-a9ff-888a5ec589c2), HOFMANN ENGINEERING PTY LTD | $17,856,147.10 | BASSENDEAN, 6054, WA | 6054, WA | 6054: Swan (wa, 0.3333); Hasluck (wa, 0.3333); Stirling (wa, 0.3333) -> **Stirling** |
| [GA507036](https://www.grants.gov.au/Ga/Show/45d3ac52-f012-4eee-9a08-ec827f416eee), Avon Community Employment Support Centre Inc | $14,785,958.86 | MIDLAND, 6056, WA | NULL, National | 6056: Swan (wa, 0.2); Cowan (wa, 0.2); Pearce (wa, 0.2); Hasluck (wa, 0.2); Stirling (wa, 0.2) -> **Stirling** |

**Tangney**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA298132](https://www.grants.gov.au/Ga/Show/03d8cef7-f08b-4429-ad52-a1db6e0c0aa7), Clontarf Foundation | $144,546,600.00 | Bentley, 6102, WA | 6102, WA | 6102: Tangney (wa, 0.5); Burt (wa, 0.5) -> **Burt** |
| [GA319466](https://www.grants.gov.au/Ga/Show/c22839d6-9736-4e81-afbb-7d0dc99df29b), Commonwealth Scientific and Industrial Research Organisation | $101,159,328.00 | Kensington, 6151, WA | 6151, WA | 6151: Tangney (wa, 0.5); Fremantle (wa, 0.5) -> **Fremantle** |
| [GA23138](https://www.grants.gov.au/Ga/Show/f443bdb6-071b-685d-21b2-1d52b60e01b8), Clontarf Foundation | $84,021,608.97 | BENTLEY, 6102, WA | NULL, WA | 6102: Tangney (wa, 0.5); Burt (wa, 0.5) -> **Burt** |

**Watson**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA391138](https://www.grants.gov.au/Ga/Show/68cc6842-aa4a-48c8-921b-d8d5528e2551), NSW Service for the Treatment and Rehabilitation of Torture and Trauma Survivors (Startts) Original: NSW Service for the Treatment and Rehabilitation of Torture and Trauma Survivors | $68,855,413.33 | CARRAMAR, 2163, NSW | NULL, NSW | 2163: Watson (nsw, 0.5); Blaxland (nsw, 0.5) -> **Blaxland** |
| [GA173093](https://www.grants.gov.au/Ga/Show/6f88df3a-bb36-4bfc-96bb-04e8f795112c), Karitane | $14,470,454.72 | CARRAMAR, 2163, NSW | NULL, NSW | 2163: Watson (nsw, 0.5); Blaxland (nsw, 0.5) -> **Blaxland** |
| [GA499329](https://www.grants.gov.au/Ga/Show/8bc08931-f199-4d5a-bcae-0247c7573724), Karitane | $11,137,500.00 | CARRAMAR, 2163, NSW | NULL, NSW | 2163: Watson (nsw, 0.5); Blaxland (nsw, 0.5) -> **Blaxland** |

**Werriwa**

| Award and recipient | Award value (AUD) | Recipient suburb, postcode, state | Delivery postcode, state | Selected postcode: candidates and actual result |
|---|---:|---|---|---|
| [GA576235](https://www.grants.gov.au/Ga/Show/77891ca9-65ff-4e94-84d6-083d7d0cad0e), Fairfield City Council | $9,500,000.00 | Wakeley, 2176, NSW | NULL, NSW | 2176: Werriwa (nsw, 0.3333); Fowler (nsw, 0.3333); Chifley (nsw, 0.3333) -> **Chifley** |
| [GA493765](https://www.grants.gov.au/Ga/Show/bfeb1ced-3000-427c-b32c-871798f2d7b3), South Western Sydney Local Health District | $6,819,597.52 | LIVERPOOL, 2170, NSW | NULL, NSW | 2170: Blaxland (nsw, 0.3333); Werriwa (nsw, 0.3333); Fowler (nsw, 0.3333) -> **Fowler** |
| [GA562313](https://www.grants.gov.au/Ga/Show/b25de9fa-9c3d-427e-8ddc-377c5f127073), Holy Apostolic Catholic Assyrian Church of the East Property Trust | $5,500,000.00 | GREENFIELD PARK, 2176, NSW | NULL, NSW | 2176: Werriwa (nsw, 0.3333); Fowler (nsw, 0.3333); Chifley (nsw, 0.3333) -> **Chifley** |

**Why the correction is omission**

The observed overwrite explains six seats' zero matches, but choosing the first tied row, choosing alphabetically, splitting awards, or choosing a seat from its recipient name would not recover a verified allocation. Seven seats lack mapping rows altogether. Werriwa lacks fetched source locations at its chosen postcodes. The held data cannot establish replacement counts or totals for these fourteen seats. Recovering them needs a reviewed postcode/boundary crosswalk with an appropriate vintage and sufficiently precise delivery locations. This patch does not acquire or invent those inputs.

Before this review, each of the fourteen seats above was newly listed as `c: 0`, `t: 0`, with an empty slice. After this review, each is absent from the grants index and has no slice file. Its funding amount is unavailable from this projection, not reported as zero. No allocation or monetary figure for any other seat changes.

Local regeneration retains the index's exact 139-seat name list and order from `origin/main`, adding only the D5 file keys. Every existing seat total, count and metadata field is preserved. All 141 retained seat pages are byte-for-byte identical to the first D5 commit. Fourteen empty files were removed; the slice is now 3,208,858 bytes in total. Melbourne remains the largest seat at 201,567 bytes across two pages, with its first page 176,043 bytes.

The exporter no longer pads from the current roster. Both index preparation and slice construction reject a zero-grant seat. `validate_data.py grants` independently fails any indexed seat with `c: 0`, even if a matching empty file exists. A non-empty set of genuinely zero-dollar source awards remains valid.

**Read-only reproduction queries**

```sql
PRAGMA table_info(ext_grants);
PRAGMA table_info(ext_grant_details);
PRAGMA table_info(postcode_electorates);
SELECT rowid, postcode, electorate_name, state, ratio
FROM postcode_electorates ORDER BY ratio;
SELECT ga_id, recipient_name, recipient_suburb, recipient_town,
       recipient_postcode, recipient_state, delivery_postcode,
       delivery_state, fetched_at
FROM ext_grant_details WHERE http_status = 200;
```

Replay the Python lookup above over those rows, then group by the selected electorate. For each requested seat, also count every mapping row naming it before the dictionary overwrite; inspect its candidate postcodes even when a different seat was selected. This distinguishes absent mapping coverage, tied mappings and missing detail coverage without treating any of them as a zero funding record.
