# State electorate members: baseline and delivery report

Baseline recorded before code changes from the local read-only OPAX database and published electorate release `9e281b4ef4edbd38` (generated 2026-11-12). Raw snapshots and acquisition evidence are outside the repository in `~/opax-work/evidence/im-state-members/`. No database writes or production requests were made.

## Baseline

| Jurisdiction | House | Current electorates | Member places | Filled on pages | Held dated open people | Held matched electorates | Held matched people |
|---|---|---:|---:|---:|---:|---:|---:|
| act | act_la | 5 | 25 | 0 | 0 | 0 | 0 |
| federal | representatives | 150 | 150 | 150 | 0 | 0 | 0 |
| federal | senate | 8 | 76 | 8 | 0 | 0 | 0 |
| nsw | nsw_la | 93 | 93 | 0 | 90 | 89 | 90 |
| nsw | nsw_lc | 1 | 42 | 0 | 29 | 0 | 0 |
| nt | nt_la | 25 | 25 | 0 | 0 | 0 | 0 |
| qld | qld_la | 93 | 93 | 0 | 96 | 77 | 79 |
| sa | sa_ha | 47 | 47 | 0 | 47 | 41 | 44 |
| sa | sa_lc | 1 | 22 | 0 | 19 | 0 | 0 |
| tas | tas_ha | 5 | 35 | 0 | 0 | 0 | 0 |
| tas | tas_lc | 15 | 15 | 0 | 0 | 0 | 0 |
| vic | vic_la | 88 | 88 | 88 | 74 | 73 | 73 |
| vic | vic_lc | 8 | 40 | 8 | 36 | 0 | 0 |
| wa | wa_la | 59 | 59 | 0 | 0 | 0 | 0 |
| wa | wa_lc | 1 | 37 | 0 | 0 | 0 | 0 |

The audit headline includes statewide Council constituencies in NSW, SA and WA, and Tasmania's Council divisions. Lower-house electorates and member places are reported separately above.

The snapshot script reads `members` and `electorate_demographics` only. `Builder.legacy()` constructs federal observations; `Builder.victoria()` constructs Victorian observations. Neither imports `ext_state_roster`. The exporter correctly reads only the bundle's dated roster observations, so none of the held state roster rows can reach these pages.

Held Wikidata rows are term and party bindings, not one row per current person. Duplicate bindings must be collapsed by person and seat. An undated term cannot establish current membership. Even dated open terms can be stale, including people at more than one seat or more people than a seat allows. They need explicit conflict review, and must retain their original observation date.

Exact normalised district matching below ignores case, apostrophe forms and hyphens, and expands the whole token Mt to Mount. It does not guess renamed or missing electorates.

- `act_la`: no eligible held match for Brindabella, Ginninderra, Yerrabi, Kurrajong, Murrumbidgee; unmatched held districts: none; over-capacity matches: {}.
- `nsw_la`: no eligible held match for Castle Hill, Holsworthy, Dubbo, Kellyville; unmatched held districts: none; over-capacity matches: {"epping": 2}.
- `nsw_lc`: no eligible held match for New South Wales; unmatched held districts: (missing), Legislative Council district of New South Wales; over-capacity matches: {}.
- `nt_la`: no eligible held match for Port Darwin, Sanderson, Braitling, Araluen, Wanguri, Karama, Spillett, Namatjira, Casuarina, Arafura, Drysdale, Nelson, Katherine, Arnhem, Mulka, Goyder, Daly, Gwoja, Fong Lim, Brennan, Barkly, Johnston, Fannie Bay, Blain, Nightcliff; unmatched held districts: none; over-capacity matches: {}.
- `qld_la`: no eligible held match for Capalaba, Stafford, Sandgate, Townsville, Gregory, Bundaberg, Mackay, Burleigh, Hervey Bay, Keppel, South Brisbane, Mirani, Thuringowa, Redcliffe, Barron River, Maryborough; unmatched held districts: (missing); over-capacity matches: {"ipswich west": 2, "mulgrave": 2}.
- `sa_ha`: no eligible held match for Mount Gambier, Stuart, Light, Schubert, Torrens, Florey; unmatched held districts: (missing), Frome; over-capacity matches: {"colton": 2, "mackillop": 2, "playford": 2}.
- `sa_lc`: no eligible held match for South Australia; unmatched held districts: (missing); over-capacity matches: {}.
- `tas_ha`: no eligible held match for Braddon, Clark, Lyons, Franklin, Bass; unmatched held districts: none; over-capacity matches: {}.
- `tas_lc`: no eligible held match for Huon, Pembroke, Derwent, Nelson, Prosser, Murchison, Rumney, Launceston, Windermere, Elwick, Hobart, Montgomery, Rosevears, Mersey, McIntyre; unmatched held districts: none; over-capacity matches: {}.
- `wa_la`: no eligible held match for Balcatta, Armadale, Forrestfield, Darling Range, Maylands, Belmont, Mount Lawley, Scarborough, Southern River, Fremantle, Kimberley, Collie-Preston, Bicton, Riverton, Girrawheen, Bibra Lake, Baldivis, Bunbury, Rockingham, Thornlie, Bateman, Joondalup, Pilbara, Swan Hills, Albany, West Swan, Mid-West, Kalamunda, Roe, Cannington, Mandurah, Oakford, Dawesville, Bassendean, Midland, Cottesloe, Cockburn, Carine, Kwinana, Butler, Warren-Blackwood, Central Wheatbelt, Nedlands, Mindarie, Landsdale, Perth, Vasse, Kingsley, Morley, Kalgoorlie, Geraldton, Victoria Park, Jandakot, South Perth, Murray-Wellington, Wanneroo, Hillarys, Churchlands, Secret Harbour; unmatched held districts: none; over-capacity matches: {}.
- `wa_lc`: no eligible held match for Western Australia; unmatched held districts: none; over-capacity matches: {}.

Person links require a unique full-name or reviewed-alias match within the same jurisdiction. Surname-only and ambiguous names cannot justify an identity join. The held roster QIDs can supply stable identities when the person catalog has no matching profile.

State contest timelines remain outside this change. Empty state contest arrays describe missing coverage. State division party labels are also outside this change.
