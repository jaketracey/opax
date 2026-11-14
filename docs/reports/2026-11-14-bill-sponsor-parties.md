# Bill sponsor parties at introduction, 14 November 2026

Base: `3bde3a0ebc7ce4831ce206cbfaa4e58ad93f2d6f` (`origin/main` when this lane started).
Branch: `im/sponsor-dated`. The published bill files were read, never edited or regenerated.

The sections below record the initial pre-row-172 snapshot. For the merge-forward comparison against reviewed main, see [row 183 merge-forward](2026-11-14-bill-sponsor-merge-forward.md).

## Measurement and classification

The published index contains 2,989 bills. Of these, 687 have a sponsor, party and introduction date. Each primary sponsor was matched in the bill's own chamber and checked on that date using `vote_parties.load_evidence` and `Resolver`: the current electorate release's party periods, the held Parliamentary Handbook Senate periods, and the same reviewed replacements and holds used by dated division labels. Intervals include their start and exclude their end; open periods stop at `through`. No current party or speech observation establishes a correction. The audit requires no database or network access.

The scan reproduces the original **52 review cases**, using the existing `same_party` aliases before the two narrower naming conventions below. Another **20 textual disagreements** are naming variants: 19 ordinary aliases are retained, while s1127 takes the reviewed Centre Alliance name from 10 April 2018. A further **357** labels agree exactly with the record. **258** bills have no covering dated evidence and remain unchecked.

| Class | In the original 52 | In all 687 | Action |
| --- | ---: | ---: | --- |
| a: recorded affiliation change | 47 | 47 | Use the dated party |
| b: naming convention | 5 | 25 including 19 ordinary aliases and one reviewed rename | Use the registered party or reviewed name; retain ordinary aliases |
| c: no covering dated record | 0 | 258 | Keep the source token; listed below and in CSV |
| Exact agreement | 0 | 357 | Keep the source token |

These are comparisons against the held OPAX records, not a fresh acquisition of historical sources. The 52 is a review count, not 52 errors.

The naming rule is uniform: a person's own registered party beats Independent, whichever side holds it. The exporter holds an ownership table for the five personal parties in this audit and applies that one rule after resolving identity. Ownership is distinct from membership: Anning's former membership of KAP does not make it his own party, so his boundary correction remains Independent. No foundation date is inferred or invented for the Rex Patrick Team. Xenophon, Lambie, Bernardi and Katter take their own registered parties from the dated record; Patrick's four 2021 bills keep Rex Patrick Team from the source.

McMahon's s1309 takes **Country Liberal Party**, the registered label in her accepted roster row (`scripts/roster_accept.json`, `Sam McMahon`). Both the source's Liberal and the held period's Nationals are its party-room variants. The bridge uses her resolved identity and the applicable dated period, without supplying new dates. Liberal and Nationals remain distinct for other people.

The selected label then passes through `vote_parties.dated_name`: s1127 takes Centre Alliance from the reviewed 10 April 2018 rename. A pid may correct an existing label only when the printed surname agrees with its evidence. Blank labels may still be filled from a pid.

## All 52 review cases

Every class-a case is listed individually. The dated label is normalised through the existing sponsor party-token map; class b follows the registered-party and dated-name rules above.

| Bill key | Sponsor | Introduced | Source party | Dated party | Class | Result |
| --- | --- | --- | --- | --- | --- | --- |
| au-federal-r5418 | KATTER, Bob, Jnr, MP | 2015-03-02 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5471 | KATTER, Bob, Jnr, MP | 2015-06-01 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5521 | KATTER, Bob, Jnr, MP | 2015-09-14 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5569 | KATTER, Bob, Jnr, MP | 2015-11-23 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5570 | KATTER, Bob, Jnr, MP | 2015-11-23 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5576 | KATTER, Bob, Jnr, MP | 2015-11-30 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5600 | KATTER, Bob, Jnr, MP | 2016-02-08 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5622 | KATTER, Bob, Jnr, MP | 2016-02-22 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5709 | KATTER, Bob, Jnr, MP | 2016-10-10 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5710 | KATTER, Bob, Jnr, MP | 2016-10-10 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5810 | KATTER, Bob, Jnr, MP | 2017-02-13 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5834 | KATTER, Bob, Jnr, MP | 2017-03-27 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5928 | KATTER, Bob, Jnr, MP | 2017-09-04 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5937 | KATTER, Bob, Jnr, MP | 2017-08-14 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5966 | KATTER, Bob, Jnr, MP | 2017-09-11 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r5967 | KATTER, Bob, Jnr, MP | 2017-09-11 | Independent | Katter's Australian Party | a | Katter's Australian Party |
| au-federal-r6744 | KELLY, Craig, MP | 2021-10-18 | Independent | United Australia Party | a | United Australia Party |
| au-federal-r6770 | KELLY, Craig, MP | 2021-08-30 | Independent | United Australia Party | a | United Australia Party |
| au-federal-r7147 | GEE, Andrew, MP | 2024-02-12 | Nationals | Independent | a | Independent |
| au-federal-r7202 | GEE, Andrew, MP | 2024-06-03 | Nationals | Independent | a | Independent |
| au-federal-s1004 | XENOPHON, Sen Nick | 2015-03-26 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s1010 | XENOPHON, Sen Nick | 2015-06-24 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s1014 | XENOPHON, Sen Nick | 2015-08-13 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s1024 | LAMBIE, Sen Jacqui | 2015-11-11 | Independent | Jacqui Lambie Network | a | Jacqui Lambie Network |
| au-federal-s1025 | XENOPHON, Sen Nick | 2015-11-24 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s1054 | LAMBIE, Sen Jacqui | 2017-02-08 | Independent | Jacqui Lambie Network | a | Jacqui Lambie Network |
| au-federal-s1055 | XENOPHON, Sen Nick | 2017-02-13 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s1070 | XENOPHON, Sen Nick | 2017-06-15 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s1074 | XENOPHON, Sen Nick | 2017-06-21 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s1081 | LAMBIE, Sen Jacqui | 2017-08-16 | Independent | Jacqui Lambie Network | a | Jacqui Lambie Network |
| au-federal-s1087 | XENOPHON, Sen Nick | 2017-09-11 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s1098 | BERNARDI, Sen Cory | 2017-11-14 | Independent | Australian Conservatives | a | Australian Conservatives |
| au-federal-s1122 | BERNARDI, Sen Cory | 2018-02-06 | Independent | Australian Conservatives | a | Australian Conservatives |
| au-federal-s1124 | BERNARDI, Sen Cory | 2018-02-15 | Independent | Australian Conservatives | a | Australian Conservatives |
| au-federal-s1145 | BERNARDI, Sen Cory | 2018-09-11 | Independent | Australian Conservatives | a | Australian Conservatives |
| au-federal-s1151 | BURSTON, Sen Brian | 2018-11-14 | Independent | United Australia Party | a | United Australia Party |
| au-federal-s1153 | ANNING, Sen Fraser | 2018-11-26 | Katter's Australian Party | Independent | a | Independent |
| au-federal-s1159 | BERNARDI, Sen Cory | 2018-11-28 | Independent | Australian Conservatives | a | Australian Conservatives |
| au-federal-s1297 | PATRICK, Sen Rex | 2021-05-12 | Rex Patrick Team | Independent | b | Rex Patrick Team |
| au-federal-s1307 | PATRICK, Sen Rex | 2021-06-24 | Rex Patrick Team | Independent | b | Rex Patrick Team |
| au-federal-s1309 | MCMAHON, Sen Sam | 2021-08-04 | Liberal | Nationals | b | Country Liberal Party |
| au-federal-s1316 | PATRICK, Sen Rex | 2021-09-01 | Rex Patrick Team | Independent | b | Rex Patrick Team |
| au-federal-s1321 | PATRICK, Sen Rex | 2021-10-20 | Rex Patrick Team | Independent | b | Rex Patrick Team |
| au-federal-s1415 | VAN, Sen David | 2024-05-15 | Liberal | Independent | a | Independent |
| au-federal-s934 | XENOPHON, Sen Nick | 2013-11-13 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s937 | XENOPHON, Sen Nick | 2013-11-13 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s939 | XENOPHON, Sen Nick | 2013-12-05 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s942 | XENOPHON, Sen Nick | 2013-12-11 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s944 | XENOPHON, Sen Nick | 2013-12-12 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s954 | XENOPHON, Sen Nick | 2014-03-06 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s984 | XENOPHON, Sen Nick | 2014-11-27 | Independent | Nick Xenophon Team | a | Nick Xenophon Team |
| au-federal-s989 | LAMBIE, Sen Jacqui | 2014-12-02 | Palmer United Party | Independent | a | Independent |

## Naming variants outside the 52

| Bill key | Source token | Record label | Result |
| --- | --- | --- | --- |
| au-federal-r5512 | LNP | Liberal | LNP |
| au-federal-r5558 | LNP | Nationals | LNP |
| au-federal-r5628 | LNP | Nationals | LNP |
| au-federal-r5902 | LNP | Nationals | LNP |
| au-federal-r6731 | LNP | Nationals | LNP |
| au-federal-r6822 | LNP | Nationals | LNP |
| au-federal-r6848 | LNP | Nationals | LNP |
| au-federal-r6910 | LNP | Liberal | LNP |
| au-federal-r7000 | Liberal | LNP | Liberal |
| au-federal-r7001 | Liberal | LNP | Liberal |
| au-federal-r7261 | LNP | Liberal | LNP |
| au-federal-r7262 | LNP | Nationals | LNP |
| au-federal-r7362 | Liberal | LNP | Liberal |
| au-federal-r7511 | LNP | Nationals | LNP |
| au-federal-r7535 | LNP | Nationals | LNP |
| au-federal-s1127 | Nick Xenophon Team | Centre Alliance | Centre Alliance |
| au-federal-s901 | DLP | Democratic Labor Party | DLP |
| au-federal-s909 | DLP | Democratic Labor Party | DLP |
| au-federal-s920 | DLP | Democratic Labor Party | DLP |
| au-federal-s953 | DLP | Democratic Labor Party | DLP |

## Gaps kept as published

The [complete CSV](2026-11-14-bill-sponsor-parties.csv) lists all 687 checked bills, their resulting token, dated source URL when present, and every one of these 258 gaps (`class=c`). An absent/ambiguous identity, undated record, expired observation or conflicting evidence cannot establish a correction. The current scan has no conflicting-evidence rows.

| Gap reason | Bills |
| --- | ---: |
| evidence-ends-before-date | 8 |
| no-dated-party | 157 |
| no-match | 93 |

The bill keys are also grouped below so the gaps can be reviewed without running the audit.

| Sponsor | Reason | Bill keys |
| --- | --- | --- |
| ALLMAN-PAYNE, Sen Penny | no-dated-party | au-federal-s1352, au-federal-s1393, au-federal-s1466 |
| ANNING, Sen Fraser | evidence-ends-before-date | au-federal-s1149 |
| ANTIC, Sen Alex | no-dated-party | au-federal-s1366, au-federal-s1397, au-federal-s1419, au-federal-s1463, au-federal-s1482, au-federal-s1509 |
| BABET, Sen Ralph | no-dated-party | au-federal-s1387, au-federal-s1447, au-federal-s1480 |
| BACK, Sen Chris | no-match | au-federal-s994 |
| BOELE, Nicolette, MP | evidence-ends-before-date | au-federal-r7543 |
| BRAGG, Sen Andrew | evidence-ends-before-date | au-federal-s1516 |
| BRAGG, Sen Andrew | no-dated-party | au-federal-s1376, au-federal-s1427, au-federal-s1468, au-federal-s1513 |
| CADELL, Sen Ross | evidence-ends-before-date | au-federal-s1515 |
| CADELL, Sen Ross | no-dated-party | au-federal-s1492 |
| CAMERON, Sen Doug | no-match | au-federal-s1009, au-federal-s1032, au-federal-s1060, au-federal-s1152 |
| CANAVAN, Sen Matthew | no-dated-party | au-federal-s1354, au-federal-s1359, au-federal-s1367, au-federal-s1382, au-federal-s1409, au-federal-s1418, au-federal-s1469, au-federal-s1486, au-federal-s1490, au-federal-s1504 |
| CARR, Sen Kim | no-match | au-federal-s1008, au-federal-s1146 |
| CASH, Sen Michaelia | no-dated-party | au-federal-s1373, au-federal-s1395, au-federal-s1425, au-federal-s1426, au-federal-s1464, au-federal-s1500 |
| CHANDLER, Sen Claire | no-dated-party | au-federal-s1336 |
| COLBECK, Sen Richard | no-dated-party | au-federal-s1431, au-federal-s1462 |
| DI NATALE, Sen Richard | no-match | au-federal-s1034, au-federal-s1065, au-federal-s1090, au-federal-s1094, au-federal-s1143, au-federal-s1147, au-federal-s1156, au-federal-s877, au-federal-s961, au-federal-s962, au-federal-s987 |
| DUNIAM, Sen Jonathon | no-dated-party | au-federal-s1372, au-federal-s1428, au-federal-s1488 |
| FARRELL, Sen Don | no-dated-party | au-federal-s1050, au-federal-s1082, au-federal-s1238, au-federal-s1239, au-federal-s943 |
| FAWCETT, Sen David | no-match | au-federal-s1377 |
| GALLAGHER, Sen Katy | no-dated-party | au-federal-s1058, au-federal-s1080, au-federal-s1242, au-federal-s1311 |
| GEORGIOU, Sen Peter | no-match | au-federal-s1139 |
| HANSON-YOUNG, Sen Sarah | no-dated-party | au-federal-s1021, au-federal-s1045, au-federal-s1170, au-federal-s1187, au-federal-s1215, au-federal-s1255, au-federal-s1288, au-federal-s1314, au-federal-s1317, au-federal-s1344, au-federal-s1375, au-federal-s1396, au-federal-s1432, au-federal-s1445, au-federal-s1491, au-federal-s1505, au-federal-s938, au-federal-s941, au-federal-s963, au-federal-s964, au-federal-s968, au-federal-s977 |
| HENDERSON, Sen Sarah | no-dated-party | au-federal-s1381, au-federal-s1417 |
| HINCH, Sen Derryn | no-match | au-federal-s1086, au-federal-s1183 |
| HODGINS-MAY, Sen Steph | no-dated-party | au-federal-s1485 |
| HUME, Sen Jane | no-dated-party | au-federal-s1470, au-federal-s1473, au-federal-s1481, au-federal-s1497, au-federal-s1510 |
| KAKOSCHKE-MOORE, Sen Skye | no-match | au-federal-s1049 |
| KENEALLY, Sen Kristina | no-match | au-federal-s1247, au-federal-s1277, au-federal-s1312, au-federal-s1313 |
| KITCHING, Sen Kimberley | no-match | au-federal-s1228 |
| LEYONHJELM, Sen David | no-match | au-federal-s1013, au-federal-s1030, au-federal-s1041, au-federal-s1044, au-federal-s1071, au-federal-s1085, au-federal-s1101, au-federal-s1126, au-federal-s1135, au-federal-s1136, au-federal-s1137, au-federal-s1161, au-federal-s983, au-federal-s986 |
| LUDLAM, Sen Scott | no-match | au-federal-s970, au-federal-s997 |
| LUDWIG, Sen Joe | no-match | au-federal-s1005, au-federal-s957 |
| MCALLISTER, Sen Jenny | no-dated-party | au-federal-s1066, au-federal-s1256, au-federal-s1278, au-federal-s1285 |
| MCCARTHY, Sen Malarndirri | no-dated-party | au-federal-s1262 |
| MCGRATH, Sen James | no-dated-party | au-federal-s1171, au-federal-s1329, au-federal-s1335 |
| MCKENZIE, Sen Bridget | no-dated-party | au-federal-s1028, au-federal-s1286, au-federal-s1410, au-federal-s1434, au-federal-s1506 |
| MCKIM, Sen Nick | no-dated-party | au-federal-s1299, au-federal-s1324, au-federal-s1330, au-federal-s1362, au-federal-s1413, au-federal-s1430, au-federal-s1442, au-federal-s1499 |
| MILNE, Sen Christine | no-match | au-federal-s1000, au-federal-s936, au-federal-s967, au-federal-s971, au-federal-s981, au-federal-s993, au-federal-s995 |
| MUIR, Sen Ricky | no-match | au-federal-s1037 |
| NAMPIJINPA PRICE, Sen Jacinta | no-dated-party | au-federal-s1364 |
| O'NEILL, Sen Deborah | no-dated-party | au-federal-s1271 |
| POCOCK, Sen Barbara | no-dated-party | au-federal-s1371, au-federal-s1467, au-federal-s1475, au-federal-s1502 |
| POCOCK, Sen David | evidence-ends-before-date | au-federal-s1517 |
| POCOCK, Sen David | no-dated-party | au-federal-s1385, au-federal-s1386, au-federal-s1414, au-federal-s1416, au-federal-s1435, au-federal-s1436, au-federal-s1446, au-federal-s1461, au-federal-s1471, au-federal-s1472, au-federal-s1501 |
| PRATT, Sen Louise | no-match | au-federal-s1188 |
| RHIANNON, Sen Lee | no-match | au-federal-s1006, au-federal-s1016, au-federal-s1036, au-federal-s1061, au-federal-s1073, au-federal-s1129, au-federal-s1133, au-federal-s946, au-federal-s947, au-federal-s956, au-federal-s992, au-federal-s998 |
| RICE, Sen Janet | no-match | au-federal-s1001, au-federal-s1015, au-federal-s1083, au-federal-s1125, au-federal-s1128, au-federal-s1261, au-federal-s1287, au-federal-s1302, au-federal-s1308, au-federal-s1370, au-federal-s1374, au-federal-s1394 |
| ROBERTS, Sen Malcolm | no-dated-party | au-federal-s1077, au-federal-s1257, au-federal-s1319, au-federal-s1337, au-federal-s1403 |
| SCAMPS, Sophie, MP | evidence-ends-before-date | au-federal-r7545 |
| SHOEBRIDGE, Sen David | no-dated-party | au-federal-s1353, au-federal-s1369, au-federal-s1448, au-federal-s1449 |
| SIEWERT, Sen Rachel | no-match | au-federal-s1079, au-federal-s1144, au-federal-s1240, au-federal-s1275, au-federal-s950, au-federal-s955, au-federal-s960, au-federal-s966, au-federal-s979 |
| SINGH, Sen Lisa | no-match | au-federal-s958 |
| SMITH, Sen Dean | evidence-ends-before-date | au-federal-s1512 |
| SMITH, Sen Dean | no-dated-party | au-federal-s1099, au-federal-s1347, au-federal-s1384, au-federal-s1392, au-federal-s1421, au-federal-s1511 |
| STEELE-JOHN, Sen Jordon | no-dated-party | au-federal-s1130, au-federal-s1174, au-federal-s1272, au-federal-s1281, au-federal-s1356, au-federal-s1361 |
| STERLE, Sen Glenn | no-dated-party | au-federal-s1248 |
| TEHAN, Dan, MP | evidence-ends-before-date | au-federal-r7546 |
| TYRRELL, Sen Tammy | no-dated-party | au-federal-s1474 |
| URQUHART, Sen Anne | no-match | au-federal-s952 |
| WANG, Sen Zhenya | no-match | au-federal-s1019 |
| WATERS, Sen Larissa | no-dated-party | au-federal-s1017, au-federal-s1067, au-federal-s1154, au-federal-s1167, au-federal-s1227, au-federal-s1258, au-federal-s1263, au-federal-s1298, au-federal-s1300, au-federal-s1357, au-federal-s1389, au-federal-s1453, au-federal-s940, au-federal-s949, au-federal-s975, au-federal-s996 |
| WONG, Sen Penny | no-dated-party | au-federal-s1011, au-federal-s1162 |
| WRIGHT, Sen Penny | no-match | au-federal-s948, au-federal-s988 |

## Export and nightly path

`fill_sponsor_parties` now checks both `sponsor_party` and each co-sponsor's `party` against bounded roster periods at introduction. It uses the existing party aliases, the uniform ownership rule, the accepted regional registered label and reviewed dated renames. Missing, conflicting or held periods retain a recognised source party. An unreadable electorate release or Senate Handbook aborts the export before files are written, so an outage cannot revert corrected published labels. Empty source labels retain the existing speech/member timeline fallback after trying bounded service. `Australian Conservatives` is added to the allowed sponsor tokens because five corrected bills use that recorded party.

The nightly already runs this exporter:

1. `scripts/vm/nightly.sh` sources `scripts/vm/bills_refresh.sh` and calls `bills_refresh`.
2. `bills_refresh` invokes `bash scripts/refresh_bills.sh` on its sitting-day, weekly, catch-up or division-link cadence.
3. `scripts/refresh_bills.sh` runs `scripts/export_bills.py --out portal/public/bills` after acquisition and TVFY linking.
4. The nightly's brief phase also runs this exporter with `--fill-briefs`.

No nightly was triggered. There is no `parli.db` on this Mac, so the changed exporter will first update published JSON during a subsequent authorised full refresh after integration. No production change or live-page correction is claimed.

Reproduce the read-only measurement:

```sh
python3 scripts/audit_bill_sponsor_parties.py > /tmp/bill-sponsor-parties.json
```

## Verification and review round 1

Initial implementation: `b6f050932ea486cb22a05105fa9a68db96605fee`, on the base SHA above. The independent review checked 13 class-a cases against held records and found their corrections correct. Review implementation: `bbf02f527fd480029fafee87206863293769c1d0`. This round addresses all seven requested changes without modifying published bill JSON.

The original Gee r7202 and Van s1415 tests failed against the original exporter. Their test inputs now hard-code Nationals and Liberal, even when metadata is read from an already refreshed published file.

The next export is projected in memory with `scripts/audit_bill_sponsor_parties.py --project`. Both portal fixture suites consume that real resolver output. The 585-row portal facts fixture has 47 updated expectations: 44 class-a corrections, McMahon's registered label and two previously empty fields (r7006 and r7200) that bounded records fill as Liberal. Each changed row retains its original `source_canonical` for raw-label decoding. Python verifies both the current publication and the projected refreshed state. No expected affiliation was guessed.

The derived party-page counts are NXT **21**, PUP **3** and Rex Patrick Team **4**. NXT is 7 + 15 class-a corrections - s1127's reviewed rename, rather than 22 once that separate review item is applied. Its newest bill is Banking Amendment (Rural Finance Reform) Bill 2018. The 687 existing eligible bills have 49 changed labels: 47 class-a corrections, McMahon's registered label and s1127's rename. The full projection additionally fills the two previously empty labels, for 51 primary-field changes.

| Review item | Result and regression test |
| --- | --- |
| 1. Future publication fixtures | Resolver-derived canonical fields and party-page counts. `PublishedBillFacts.test_real_audit_labels_use_the_exporters_own_decode_and_map`, portal `audited party labels survive the next dated export`, and `the next dated export: the three sponsor-only parties and their newest bills`. Reverting the facts fixture produces 47 failing Python subtests. |
| 2. Fixed Gee/Van source labels | `test_source_fixtures_survive_an_already_refreshed_publication`; reverting to publication-supplied source labels makes it fail. |
| 3. One registered-party rule | `test_own_registered_party_beats_independent_on_either_side`, `test_patrick_keeps_own_registered_team_without_an_invented_start`, and the Anning/other-owner negative tests. Restoring the previous checker causes five uniform-rule subtest failures. |
| 4. McMahon registered label | `test_mcmahon_uses_registered_country_liberal_party`; the previous checker fails. |
| 5. Reviewed rename | `test_s1127_uses_reviewed_centre_alliance_rename` and `test_reviewed_rename_boundary_is_inclusive`; the previous checker fails. |
| 6. Outage flap | `test_missing_records_abort_instead_of_reverting_publications` and `test_loader_outages_abort_build_before_publication`; real loader failures abort the build with a clear error. Restoring the previous checker fails the outage regression. |
| 7. Pid surname guard | `test_pid_cannot_correct_a_different_printed_surname`; a mismatch keeps an existing label but may fill a blank. The previous checker fails. |

Final gates on the review implementation, with system `python3` and Node 24:

| Gate | Result |
| --- | --- |
| Python regression command below | Pass: 184 tests |
| From `portal/`, `npx tsc --noEmit` | Pass |
| Targeted portal run through the required `jest-slot.sh`, with `OX_PORTAL_TEST_CONCURRENCY=4`, selecting the two refreshed-fixture tests | Pass: 403 tests, 0 failures; both named refreshed-fixture tests passed |
| Full `jest-slot.sh npm test`, with `OX_PORTAL_TEST_CONCURRENCY=4` | Pass: 4,908 tests, 0 failures, 0 skipped; wrapper reported concurrency 4 |
| Revert checks for all seven review items | Each rejects the previous behaviour, as listed above |
| Read-only full sponsor projection | Pass: exactly 49 changed existing labels and 2 bounded fills; 51 primary-field changes |
| `git diff --check` | Pass |
| Published bill JSON against the initial submission | Unchanged |

The shared Mac slots were reserved before both portal runs. The reservations cleared normally; neither the reservations nor the shared wrapper were changed or bypassed.

The Python regression command is:

```sh
PYTHONPATH=tests python3 -m unittest \
  scripts.test_export_bills_sponsors scripts.test_export_bills_cleanup \
  scripts.test_export_drafts scripts.test_export_briefs \
  test_export_bill_divisions test_export_bills_facts \
  test_bill_lifecycle_export test_bill_refresh_briefs \
  scripts.vm.test_bills_refresh scripts.vm.test_fixture_imports test_vote_parties
```

No simulator, xcodebuild, Android or SSH command was run. Dependencies and ignored generated prerequisites were reused from the initial submission. No database, production writes, deployment or nightly trigger was used. Integration and a subsequent full refresh remain for the orchestrator. The 258 dated-record gaps remain unchanged and listed for review.
