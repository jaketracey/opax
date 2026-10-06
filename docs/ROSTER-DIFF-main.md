# Roster diff against main — round 3

Baseline: `origin/main (66e75d748402287359095bd10d70949a557aead3)`. Every field of every record is compared; metadata is excluded.

| Category | Changed records | Sample |
|---|---:|---|
| mix-up corrected | 17 | Mark Latham, McKenzie, J.M.A. Lensink, David Kemp, Collins |
| witness-dominated | 131 | Cook, Brown, Hall, Smith, Anderson |
| spans parliaments | 109 | Shoebridge, McDonald, Paterson, Roberts, Watt |
| alias normalisation | 11 | Staley, Scanlon, Fentiman, Butcher, Enoch |
| clean record changed | 0 | — |

**268 changed; 1432 exactly unchanged; zero clean record changed is required.**

Categories are exclusive: majority-witness first, then weak multi-parliament prints, malformed aliases, and evidenced seat/party/name contradictions.

| Party rows / facet | Main | Round 3 | Change |
|---|---:|---:|---:|
| Total rows with party | 1177 | 1057 | -120 |
| SA rows with party | 83 | 74 | -9 |
| SA Labor | 38 | 33 | -5 |
| SA Liberal | 36 | 35 | -1 |
| QLD rows with party | 120 | 81 | -39 |
| QLD Labor | 57 | 37 | -20 |
| QLD LNP | 56 | 38 | -18 |

Party facets include both `party` and `parties`, matching the website. These are transcript-directory rows, not unique people or current seats.

## Every changed record

| Print | Category | Changed fields | Evidence permitting change |
|---|---|---|---|
| Shoebridge | spans parliaments | party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Mark Latham | mix-up corrected | affiliations, current, parties, party, party_now, representation | Seat contradicts dated service in the recorded chamber |
| McKenzie | mix-up corrected | parties, party, recorded_parties | Different dated parliamentarians match the same print |
| McDonald | spans parliaments | party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Paterson | spans parliaments | party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Roberts | spans parliaments | party, recorded_parties | Weak printed name aggregates multiple parliaments |
| J.M.A. Lensink | mix-up corrected | full, identity_evidence, party, representation | Assembly seat or portfolio attached to a Council record |
| David Kemp | mix-up corrected | representation | Seat contradicts dated service in the recorded chamber |
| Watt | spans parliaments | party, recorded_parties, representation | Weak printed name aggregates multiple parliaments |
| Steel | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Cook | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Thorpe | spans parliaments | full, identity_evidence | Weak printed name aggregates multiple parliaments |
| Berry | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Ryan | spans parliaments | party, recorded_parties, representation | Weak printed name aggregates multiple parliaments |
| Collins | mix-up corrected | party, recorded_parties | Different dated parliamentarians match the same print |
| Michael Lee | mix-up corrected | representation | Seat contradicts dated service in the recorded chamber |
| Green | spans parliaments | full, party, recorded_parties, representation | Weak printed name aggregates multiple parliaments |
| Brown | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Lynda Voltz | mix-up corrected | affiliations, current, party, party_now, representation | Seat contradicts dated service in the recorded chamber |
| Walsh | spans parliaments | party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Andrews | spans parliaments | full, party, recorded_parties, representation | Weak printed name aggregates multiple parliaments |
| Hall | witness-dominated | full, party, recorded_parties, representation | More than 50% witness rows |
| Barr | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Smith | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Thomas | spans parliaments | full, representation | Weak printed name aggregates multiple parliaments |
| Cox | mix-up corrected | party, recorded_parties, representation | Different dated parliamentarians match the same print |
| Emerson | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Anderson | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Bedford | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Nicholls | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Taylor | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Orr | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Clay | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Campbell | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Stewart | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Williams | witness-dominated | full, representation | More than 50% witness rows |
| James | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Lawrence | spans parliaments | party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Morris | spans parliaments | full, party, recorded_parties, representation | Weak printed name aggregates multiple parliaments |
| Johnson | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Bronnie Taylor | mix-up corrected | representation | Noncanonical Council constituency from the member-stub join |
| Castley | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Pugh | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Foley | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Pearson | spans parliaments | full, representation | Weak printed name aggregates multiple parliaments |
| O'Neill | spans parliaments | party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Ingrid Stitt | mix-up corrected | representation | Portfolio joined into an electorate label |
| Kennedy | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| McGuire | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Wilkinson | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Close | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Bell | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Cain | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Staley | alias normalisation | full, identity_evidence | Byline, compact initials or non-display casing in full-name alias |
| Angus | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Connolly | spans parliaments | identity_evidence, party | Weak printed name aggregates multiple parliaments |
| Power | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Edwards | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Bob Horne | mix-up corrected | representation | Seat contradicts dated service in the recorded chamber |
| Lee | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Richardson | spans parliaments | identity_evidence, party | Weak printed name aggregates multiple parliaments |
| McLeish | spans parliaments | identity_evidence, party | Weak printed name aggregates multiple parliaments |
| Walker | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Scanlon | alias normalisation | full, identity_evidence, representation | Byline, compact initials or non-display casing in full-name alias |
| Pettersson | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| D O’Brien | mix-up corrected | full, identity_evidence, party | Reviewed party mismatch against dated election evidence |
| Spence | spans parliaments | identity_evidence, party | Weak printed name aggregates multiple parliaments |
| Ward | spans parliaments | full, representation | Weak printed name aggregates multiple parliaments |
| Hanson | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Read | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Richards | spans parliaments | full, party, recorded_parties, representation | Weak printed name aggregates multiple parliaments |
| Addison | spans parliaments | identity_evidence, party | Weak printed name aggregates multiple parliaments |
| Fentiman | alias normalisation | full, identity_evidence | Byline, compact initials or non-display casing in full-name alias |
| Boyer | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Grant | witness-dominated | full | More than 50% witness rows |
| Burgess | spans parliaments | full, identity_evidence | Weak printed name aggregates multiple parliaments |
| Hennessy | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Howard | witness-dominated | full, parties, party, recorded_parties | More than 50% witness rows |
| Guy | spans parliaments | full, representation | Weak printed name aggregates multiple parliaments |
| Wilson | witness-dominated | full | More than 50% witness rows |
| Hughes | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| McBride | spans parliaments | full | Weak printed name aggregates multiple parliaments |
| Dick | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Wells | spans parliaments | full, representation | Weak printed name aggregates multiple parliaments |
| Martin | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Barry | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Riordan | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Theophanous | spans parliaments | full, party, recorded_parties, representation | Weak printed name aggregates multiple parliaments |
| King | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Telfer | spans parliaments | identity_evidence, party | Weak printed name aggregates multiple parliaments |
| Graham | witness-dominated | full | More than 50% witness rows |
| McGhie | spans parliaments | identity_basis, party | Weak printed name aggregates multiple parliaments |
| Murray | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Bennett | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Ng | spans parliaments | party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Saunders | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Northe | spans parliaments | full, identity_evidence | Weak printed name aggregates multiple parliaments |
| Ellis | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Patterson | spans parliaments | full, representation | Weak printed name aggregates multiple parliaments |
| Kelly | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Bailey | spans parliaments | full, identity_evidence, representation | Weak printed name aggregates multiple parliaments |
| Melissa Horne | mix-up corrected | party | Reviewed member-stub party omission; official roster supplies party |
| Halfpenny | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Boyd | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Grace | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Harvey | spans parliaments | full, identity_evidence | Weak printed name aggregates multiple parliaments |
| Stevens | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Carroll | spans parliaments | identity_evidence, party | Weak printed name aggregates multiple parliaments |
| Powell | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Head | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Simpson | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Davis | witness-dominated | full | More than 50% witness rows |
| Horne | spans parliaments | full, party, recorded_parties, representation | Weak printed name aggregates multiple parliaments |
| Neville | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Pearce | witness-dominated | full | More than 50% witness rows |
| Fang | witness-dominated | full | More than 50% witness rows |
| Lane | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Pratt | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Blackwood | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Kirkland | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Bourne | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Parker | witness-dominated | full | More than 50% witness rows |
| Wallace | spans parliaments | party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Sullivan | witness-dominated | party, recorded_parties, representation | More than 50% witness rows |
| Lister | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Moriarty | witness-dominated | full | More than 50% witness rows |
| Field | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Barrett | witness-dominated | full | More than 50% witness rows |
| Leahy | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Harris | witness-dominated | full | More than 50% witness rows |
| Morton | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Chapman | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Katter | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Thompson | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Pakula | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Hunt | spans parliaments | full, parties, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Farmer | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| McMillan | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Scott | witness-dominated | full | More than 50% witness rows |
| Tilley | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Young | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Reid | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Watson | witness-dominated | full | More than 50% witness rows |
| Bates | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Clancy | spans parliaments | full | Weak printed name aggregates multiple parliaments |
| Watts | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Brereton | witness-dominated | party, recorded_parties, representation | More than 50% witness rows |
| Bush | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Hutton | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Mitchell | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Robinson | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Harper | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Dillon | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Clark | witness-dominated | full | More than 50% witness rows |
| Krause | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Whiting | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Hood | spans parliaments | full, representation | Weak printed name aggregates multiple parliaments |
| Adams | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Price | mix-up corrected | party, recorded_parties | Different dated parliamentarians match the same print |
| Butler | witness-dominated | full | More than 50% witness rows |
| Murphy | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Treloar | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Evans | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Bolton | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Munro | witness-dominated | full | More than 50% witness rows |
| Gee | spans parliaments | party, recorded_parties | Weak printed name aggregates multiple parliaments |
| McMahon | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Davies | witness-dominated | full | More than 50% witness rows |
| Mullen | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Poole | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| MacDonald | witness-dominated | full | More than 50% witness rows |
| Clarke | witness-dominated | full | More than 50% witness rows |
| Lynch | witness-dominated | full | More than 50% witness rows |
| Doyle | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Phillips | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Butcher | alias normalisation | full, identity_evidence, representation | Byline, compact initials or non-display casing in full-name alias |
| Hart | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Lloyd | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Williamson | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Brooks | witness-dominated | full, representation | More than 50% witness rows |
| Wooldridge | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Jackson | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Le | spans parliaments | party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Thomson | witness-dominated | full | More than 50% witness rows |
| Baird | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Burke | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Coleman | witness-dominated | party, recorded_parties | More than 50% witness rows |
| O'Connor | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Garrett | witness-dominated | party, recorded_parties, representation | More than 50% witness rows |
| Perrett | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Nightingale | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Costello | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Andrew | spans parliaments | identity_evidence, party | Weak printed name aggregates multiple parliaments |
| Carter | witness-dominated | full | More than 50% witness rows |
| Porter | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Bartlett | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Gardner | witness-dominated | full, representation | More than 50% witness rows |
| Abbott | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Charles | witness-dominated | party, recorded_parties, representation | More than 50% witness rows |
| Enoch | alias normalisation | full, identity_evidence | Byline, compact initials or non-display casing in full-name alias |
| Tanner | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Dalton | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Jenkins | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Kerr | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Piper | witness-dominated | full | More than 50% witness rows |
| Harrison | witness-dominated | full | More than 50% witness rows |
| Latham | spans parliaments | affiliations, full, identity_evidence, parties, party, representation | Weak printed name aggregates multiple parliaments |
| Doolan | alias normalisation | full, identity_evidence, representation | Byline, compact initials or non-display casing in full-name alias |
| Linard | alias normalisation | full, identity_evidence, representation | Byline, compact initials or non-display casing in full-name alias |
| Park | witness-dominated | full | More than 50% witness rows |
| Bilyk | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Gilbert | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Marshall | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Noonan | witness-dominated | full | More than 50% witness rows |
| Bishop | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Holland | witness-dominated | full | More than 50% witness rows |
| Basham | alias normalisation | full, identity_evidence, party | Byline, compact initials or non-display casing in full-name alias |
| Crawford | witness-dominated | full, party, recorded_parties, representation | More than 50% witness rows |
| McClelland | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Ray | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Lui | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Nelson | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Cooke | witness-dominated | full | More than 50% witness rows |
| Millar | spans parliaments | identity_evidence | Weak printed name aggregates multiple parliaments |
| Singh | witness-dominated | full | More than 50% witness rows |
| Baldwin | mix-up corrected | party, recorded_parties | Different dated parliamentarians match the same print |
| Blair | witness-dominated | full | More than 50% witness rows |
| Stuart | witness-dominated | full | More than 50% witness rows |
| Cusack | witness-dominated | full | More than 50% witness rows |
| Furner | alias normalisation | full, identity_evidence | Byline, compact initials or non-display casing in full-name alias |
| Stoker | alias normalisation | full, identity_evidence, representation | Byline, compact initials or non-display casing in full-name alias |
| Billson | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Franklin | witness-dominated | full | More than 50% witness rows |
| McMullan | witness-dominated | party, recorded_parties | More than 50% witness rows |
| St Clair | witness-dominated | party, recorded_parties, representation | More than 50% witness rows |
| Hurst | witness-dominated | full | More than 50% witness rows |
| Hoare | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Weir | alias normalisation | full, identity_evidence | Byline, compact initials or non-display casing in full-name alias |
| Chandler-Mather | witness-dominated | party, recorded_parties | More than 50% witness rows |
| D O'Brien | mix-up corrected | full, identity_basis, party | Reviewed party mismatch against dated election evidence |
| Knight | witness-dominated | full | More than 50% witness rows |
| Warren | witness-dominated | full | More than 50% witness rows |
| Bowen | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Donnelly | witness-dominated | full | More than 50% witness rows |
| Kemp | witness-dominated | full, party, recorded_parties | More than 50% witness rows |
| Tudehope | mix-up corrected | full, party, recorded_parties | Different dated parliamentarians match the same print |
| Ryall | witness-dominated | full | More than 50% witness rows |
| Worth | witness-dominated | party, recorded_parties, representation | More than 50% witness rows |
| O'Keefe | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Cross | witness-dominated | full | More than 50% witness rows |
| Lim | spans parliaments | party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Rae | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Crouch | witness-dominated | full | More than 50% witness rows |
| Irwin | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Lindsay | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Preston | witness-dominated | full | More than 50% witness rows |
| Anthony | witness-dominated | party, recorded_parties, representation | More than 50% witness rows |
| Sharpe | spans parliaments | identity_evidence, party | Weak printed name aggregates multiple parliaments |
| Ware | witness-dominated | party, recorded_parties | More than 50% witness rows |
| O'Byrne | witness-dominated | party, recorded_parties, representation | More than 50% witness rows |
| Aitchison | witness-dominated | full | More than 50% witness rows |
| George | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Griffin | witness-dominated | full | More than 50% witness rows |
| Sidoti | witness-dominated | full | More than 50% witness rows |
| McLeay | witness-dominated | party, recorded_parties | More than 50% witness rows |
| Moylan | spans parliaments | full, party, recorded_parties | Weak printed name aggregates multiple parliaments |
| Sciacca | witness-dominated | party, recorded_parties, representation | More than 50% witness rows |
| Washington | witness-dominated | full | More than 50% witness rows |

Witness splitting is a P2 follow-up: retain the MP identity only for their parliamentary-speaker rows and keep witness testimony separate. It is deliberately not implemented here.
