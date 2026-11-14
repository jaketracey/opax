# Surname prints folded into their person (16 October 2026)

Jake, 16 Oct: "can we fix shoebridge to be david shoebridge". Hansard prints many members by surname alone, so the
speech export carried a row "Shoebridge" (4,769 speeches, no portrait) beside "David Shoebridge" (1,649), and the
stub outranked him on `/subject/person`. `scripts/roster_fold.py` folds a surname-only print into the one full-name
person it certainly is. Its docstring carries the rule; in short, every test must hold, else the print keeps its row:

- one word, a party, no committee-witness rows, not a reviewed witness split, no recorded seat of its own;
- exactly one full-name person of that surname with overlapping jurisdictions and years (twin spellings are one person);
- the person has the print's party; the print's jurisdictions, own-house chambers and years sit inside the person's
  (one year either way); committee speeches need a federal member with a verified id (the apps' identity guard);
- the print's own id and members-register name, where it has them, are the person's;
- no other member of the surname served there in those years (the electorate release's people; on the box, the members
  table too).

The person keeps their name, slug, id, seats, portrait and status, sums the print's speeches, and lists the print in
`prints`. The Worker widens that person's speech searches, Ask scope, brief and topic counts to the print, and
`/subject/person/<surname>` 301s to the person. `scripts/vm/export_people.sh` runs the fold after enrichment, so the
nightly keeps it; the safety net counts a folded print as a row and finds a sitting print under its person.
`scripts/audit_roster_changes.py` accepts a fold only when the rule makes it on the baseline too, and the person's
row must be the exact merge.

Applied to the committed roster: **100 prints folded**, 455 left as they are.

## Folded

| Print | Person | Print speeches |
|---|---|---:|
| Shoebridge | David Shoebridge | 4,769 |
| Ruston | Anne Ruston | 2,688 |
| Canavan | Matthew Canavan | 1,820 |
| Kovacic | Maria Kovacic | 1,717 |
| Hume | Jane Hume | 1,327 |
| Ananda-Rajah | Michelle Ananda-Rajah | 1,204 |
| Cash | Michaelia Cash | 1,148 |
| Steele-John | Jordon Steele-John | 1,014 |
| Colbeck | Richard Colbeck | 953 |
| Whish-Wilson | Peter Whish-Wilson | 903 |
| Cadell | Ross Cadell | 854 |
| Hodgins-May | Steph Hodgins-May | 746 |
| Sharma | Dave Sharma | 710 |
| Faruqi | Mehreen Faruqi | 635 |
| Dolega | Josh Dolega | 610 |
| Allman-Payne | Penny Allman-Payne | 587 |
| Hanson-Young | Sarah Hanson-Young | 584 |
| Bragg | Andrew Bragg | 582 |
| Blyth | Leah Blyth | 423 |
| Askew | Wendy Askew | 396 |
| Penfold | Alison Penfold | 383 |
| Lambie | Jacqui Lambie | 362 |
| Darmanin | Lisa Darmanin | 361 |
| Grogan | Karen Grogan | 345 |
| Ghosh | Varun Ghosh | 333 |
| Jarrett | Madonna Jarrett | 316 |
| Rebello | Leon Rebello | 312 |
| Neumann | Shayne Neumann | 296 |
| Burnell | Matt Burnell | 262 |
| Clutterham | Claire Clutterham | 257 |
| Whitten | Tyron Whitten | 207 |
| Cregan | D.R. Cregan | 189 |
| Venning | Tom Venning | 182 |
| Cheeseman | Darren Cheeseman | 181 |
| McLachlan | Andrew McLachlan | 173 |
| Tarzia | V.A. Tarzia | 146 |
| Buchholz | Scott Buchholz | 143 |
| Polley | Helen Polley | 138 |
| Steggall | Zali Steggall | 133 |
| Briskey | Jo Briskey | 126 |
| Jordan-Baird | Alice Jordan-Baird | 123 |
| Laxale | Jerome Laxale | 109 |
| Pike | Henry Pike | 107 |
| Ciccone | Raff Ciccone | 105 |
| France | Ali France | 92 |
| Caldwell | Cameron Caldwell | 90 |
| Antic | Alex Antic | 86 |
| Violi | Aaron Violi | 86 |
| Chaney | Kate Chaney | 71 |
| Scamps | Sophie Scamps | 67 |
| Miller-Frost | Louise Miller-Frost | 66 |
| Knoll | S.K. Knoll | 65 |
| Moncrieff | David Moncrieff | 65 |
| Sitou | Sally Sitou | 62 |
| Brockman | Slade Brockman | 60 |
| Chaffey | Jamie Chaffey | 60 |
| Stanley | Anne Stanley | 56 |
| Comer | Emma Comer | 51 |
| Willcox | Andrew Willcox | 50 |
| Repacholi | Dan Repacholi | 45 |
| Zappia | Tony Zappia | 45 |
| Aldred | Mary Aldred | 43 |
| Templeman | Susan Templeman | 41 |
| Ambihaipahar | Ash Ambihaipahar | 40 |
| Witty | Sarah Witty | 40 |
| Coffey | Renee Coffey | 38 |
| Soon | Zhi Soon | 38 |
| Belyea | Jodie Belyea | 36 |
| Claydon | Sharon Claydon | 33 |
| Speirs | D.J. Speirs | 33 |
| Georganas | Steve Georganas | 32 |
| Tyrrell | Tammy Tyrrell | 30 |
| Fitzgibbon | Joel Fitzgibbon | 28 |
| Garland | Carina Garland | 26 |
| Byrnes | Alison Byrnes | 25 |
| Mascarenhas | Zaneta Mascarenhas | 25 |
| Crean | Simon Crean | 24 |
| Farley | David Farley | 24 |
| Fernando | Cassandra Fernando | 24 |
| Coker | Libby Coker | 23 |
| Teesdale | Jess Teesdale | 23 |
| Landry | Michelle Landry | 22 |
| Abdo | Basem Abdo | 18 |
| Beazley | Kim Beazley | 18 |
| French | Tom French | 16 |
| Conaghan | Pat Conaghan | 13 |
| Albanese | Anthony Albanese | 12 |
| Hastie | Andrew Hastie | 12 |
| Pisoni | D.G. Pisoni | 12 |
| Gillard | Julia Gillard | 11 |
| Ruddock | Philip Ruddock | 10 |
| Husic | Ed Husic | 9 |
| Sharkie | Rebekha Sharkie | 9 |
| Hawker | David Hawker | 7 |
| Slipper | Peter Slipper | 7 |
| Snowdon | Warren Snowdon | 7 |
| Danby | Michael Danby | 6 |
| Plibersek | Tanya Plibersek | 6 |
| Wilkie | Andrew Wilkie | 6 |
| Truss | Warren Truss | 5 |

## Left as they are

Grouped by the first test each print fails. Names are parliamentary prints.

### Holds committee-witness rows under the surname (the print may include a private witness) (270)

Henderson, McKenzie, McDonald, Paterson, Roberts, Scarr, Ayres, Gallagher, Wong, Liddle, Steel, Duniam, Chandler, Cook, Thorpe, Berry, Ryan, McAllister, Collins, Green, McGrath, Brown, O'Sullivan, Walsh, Andrews, Hall, Smith, Chisholm, Thomas, Mulholland, Cox, Emerson, Anderson, Bedford, Nicholls, Waters, Taylor, Orr, Clay, McKim, Campbell, Williams, James, Lawrence, Morris, Johnson, Castley, Foley, Pearson, O'Neill, Kennedy, McGuire, Wilkinson, Close, Bell, Cain, Angus, Connolly, Whiteaker, Power, Edwards, Farrell, Gregg, Lee, Richardson, McLeish, Pettersson, Spence, Dowling, Reynolds, Ward, Hanson, Read, Richards, Haines, Addison, Boyer, Grant, Burgess, Hennessy, McCarthy, Howard, Guy, Wilson, Davey, Hughes, McBride, Dick, Wells, Martin, Barry, Riordan, King, Telfer, Graham, McGhie, Murray, Ng, Saunders, Northe, Ellis, Patterson, Kelly, Bailey, Halfpenny, Boyd, Sheldon, Hawke, Grace, Harvey, Carroll, Powell, Head, Simpson, Davis, Birrell, Neville, Pearce, Fang, Lane, Pratt, Blackwood, Parker, Wallace, Lister, Moriarty, Barrett, Leahy, Harris, Morton, Chapman, Thompson, Batt, Pakula, Hunt, Farmer, McMillan, Scott, Tilley, Reid, Watson, Bates, Clancy, Watts, Brereton, Bush, McCormack, Mitchell, Clark, Krause, Whiting, Hood, Gosling, Adams, Price, Small, Butler, Murphy, Treloar, Evans, Bolton, Munro, Dwyer, McMahon, Davies, Mullen, Poole, MacDonald, Clarke, Lynch, Doyle, Phillips, Lloyd, Williamson, Brooks, Wooldridge, Jackson, Le, Urquhart, Thomson, Baird, Burke, Coleman, O'Connor, Constable, Garrett, Perrett, Nightingale, Fawcett, Costello, Andrew, Carter, Porter, Bartlett, Gardner, Abbott, Charles, Tanner, Jenkins, Kerr, Piper, Hope, Harrison, Latham, Boele, Park, Bilyk, Gilbert, Marshall, Noonan, Bishop, Holland, McClelland, Ray, Lui, Nelson, Cooke, Millar, Singh, Baldwin, Blair, Mr, Stuart, Ross, Cusack, Billson, Franklin, McMullan, David, Hurst, Hoare, Chandler-Mather, Knight, Peterson, Swan, Warren, Bowen, Donnelly, Kemp, Buckingham, Ryall, Worth, O'Keefe, Cross, Rae, Rudd, Crouch, Irwin, Lindsay, Preston, Anthony, Finn, McNamara, Sharpe, Mott, Qi, Ware, Loane, O'Byrne, Warburton, Aitchison, George, Griffin, Ridge, Sidoti, Zahra, McLeay, Sciacca, Hannan, Washington.

### No party recorded on the print (72)

Watt, Barr, Allan, Staley, Newbury, Payman, Rattenbury, Kilkenny, Sheed, Carbines, McCurdy, Hurn, Hamer, D’Ambrosio, Pallas, Edbrooke, Fowles, Wakeling, Maas, Dimopoulos, Theophanous, Fregon, Hibbins, Blandthorn, Suleyman, Vallence, Battin, Couzens, Rowswell, Settle, Sandell, Eren, Hutchins, Horne, Cupper, Staikos, Katter, Donnellan, Gee, Rennick, Sterle, Dalton, Kairouz, Fulbrook, Senator, Crisp, Tudehope, Graley, Victoria, Asher, D'Ambrosio, Lim, Paynter, Katos, On, Nardella, Pesutto, Buttigieg, McDermott, Scruby, Greenwich, Dixon, Er, Hodges, Hon, Moylan, Perera, Crakanthorp, Fyffe, Higginson, McGirr, Ruska.

### No full-name row with this surname (66)

Stephen-Smith, Cheyne, Bleijie, Frecklington, Cocks, Carrick, Odenwalder, Braddock, Parton, Nuttall, Janetzki, Crisafulli, Gerber, Mickelberg, Pederick, Cowdrey, Rowan, Stinson, Tough, Camm, Duluk, Merlino, Luethen, Werner-Gibbings, Berkman, Halse, Mander, Wynne, Brayne, Milligan, Mellish, Purdie, Pease, Knuth, McCallum, Russo, Last, Dametto, Langbroek, Vorster, Hutchesson, Asif, Vassarotti, Dooley, Minnikin, Baillie, Marr, Healy, Batty, Boothman, Barounis, Crandon, Doolan, Savvas, Molhoek, Gatenby, Kempton, MacMahon, Tantari, Lauga, Chiesa, Skelton, Weir, Richmond, Hatcher, Zanow.

### A reviewed witness-split record (16)

Stewart, Pugh, Walker, Bennett, Stevens, Kirkland, Bourne, Sullivan, Field, Young, Hutton, Robinson, Harper, Dillon, Hart, Crawford.

### No full-name row in the same jurisdiction and years (10)

Picton, Malinauskas, Miles, Hildyard, Kealy, Britnell, Tak, Szakacs, Hodgett, Michaels.

### The print's members-register name is not the candidate's (8)

- Scanlon: members-register name Meaghan Scanlon is not Maj Scanlon
- Fentiman: members-register name Shannon Fentiman is not SM Fentiman
- Butcher: members-register name Glenn Butcher is not GJ Butcher
- Enoch: members-register name Leeanne Enoch is not LM Enoch
- Linard: members-register name Leanne Linard is not LM Linard
- Furner: members-register name Mark Furner is not ML Furner
- Stoker: members-register name Amanda Stoker is not Aj Stoker
- Tollner: members-register name Dave Tollner is not David Tollner

### The members register holds another member of the surname in those years (5)

- Spender: the members register also holds Duncan Spender in those years
- Boyce: the members register also holds Sue Boyce in those years
- Macklin: the members register also holds Jennifer Louise Macklin in those years
- Hockey: the members register also holds Joseph Benedict Hockey in those years
- Ripoll: the members register also holds Bernard Fernando Ripoll in those years

### Party differs from the only full-name candidate (4)

- Southwick: party differs from David Southwick (Liberal vs none recorded)
- Crugnale: party differs from Jordan Crugnale (Labor vs none recorded)
- Van: party differs from David Van (Independent vs Liberal)
- Basham: party differs from D.K.B. Basham (Liberal vs none recorded)

### Certain, but the print has its own recorded seat (a published roster-profile record) (1)

- Kernot: would fold into Cheryl Kernot, but has its own recorded seat (a roster-profile record)

### Outside the candidate's houses or years (3)

- Teague: years outside J.B. Teague's
- Whetstone: years outside T.J. Whetstone's
- Wortley: chambers outside R.P. Wortley's

## Follow-ups

- The 270 prints with committee-witness rows include sitting senators ("Wong", 15 witness rows). Folding them needs
  the witness rows kept off the person (the export already partitions them for majority-witness prints); not done here.
- Prints with no party (Victorian Assembly stubs such as "Allan") need reviewed evidence, for example entries in
  `scripts/person_identity.json`. The same-person name variants the registry check could not prove here (Joe/Joseph
  Hockey, Bernie/Bernard Ripoll, Jenny/Jennifer Macklin, Dave/David Tollner) carry their person's verified id and fold
  by it since 13 November 2026 (below).
- Kernot folds by every test but has its own published roster-profile record; folding it retires that KB record.

# One verified id, one person (13 November 2026)

Portal audit F2 (backlog A2): 118 roster rows shared 58 verified person ids, and every one of those people had more
than one profile. Id 10086 printed as "Mark Butler" (828 speeches) and "Mark Christopher Butler" (25); Bob Katter had
a second profile under the Hansard print "Katter Bob Jnr". The exporter (`scripts/export_parliamentarians.py`) keys a
row by its printed name and the slug index (`portal/src/person-slug.ts`) gives every row an address, so one person
printed two ways shipped as two people.

`fold_ids` in `scripts/roster_fold.py` now folds the rows that share a verified id (`scripts/roster_identity.py`
verify) into one person, after the surname folds. Every test must hold, else the group is left for review:

- every row carries the same id, and none is a reviewed record of its own (a witness split, committee-witness rows,
  a pending speech count, a source-only row; `ID_HOLD_FIELDS`), and each has a speech count;
- each other row's name agrees with the person's name, full name, aliases or members-register names for that id
  (`roster_identity.same_name`: surname plus a first name, nickname or initials), or `scripts/person_identity.json`
  lists it as that person;
- the rows share a parliament;
- a row printed only in the federal House falls inside the dated House service of that id (one year either way);
- no two rows hold different seats in one house in the same years.

The person's row is the one printed under the electorate release's primary name for the id, where a row carries
it: Bob Baldwin, Tony Windsor and Katie Allen keep their public names and slugs although the formal "Robert",
"Antony" and "Katrina" rows have more speeches (review of 13 November 2026). Where no row carries the release's
name, and among spelling twins of it, the row with the most speeches holds (on a tie, the sitting member's); never a
surname or tail print. Two holders differ from the release's name: David Tollner, whose release name "Dave Tollner"
no row prints (main's row is David Tollner; the fold gives it `full` "Dave Tollner" from the surname print), and
Yvette D’Ath, whose straight-apostrophe twin is the release's spelling (one slug, `yvette-dath`, either way). The
holder keeps its name, slug, id, party and status; speeches sum; houses, years and seats join; the other names go into
`prints` and, where they are full names, `aliases`; a print's members-register name fills an empty `full`. The
Worker reads `prints` as it does for surname folds (speech searches, Ask scope, brief and topic counts), and
`formerSlugs` in `portal/src/person-slug.ts` keeps every folded row's old address, its own slug or the suffixed slug
a spelling twin held, as a 301 to the person (`docs/SEO.md`). Sitemaps, `person-paths.js` and the slug map hold the
person's slug only.

`scripts/vm/export_people.sh` runs the fold every night (it is part of `fold()`), so the next export stays merged.
`scripts/audit_roster_changes.py` accepts an id fold only when the rule makes it on the baseline too and the row is
the exact merge ("id folded"). `roster_fold.py --ids-only --rebase-accept scripts/roster_accept.json` applied it to the
committed roster and re-based the reviewed accept records of each person onto the merged row, so the overlay keeps
them. `scripts/roster_source_profiles.py` matches a folded person's source aliases through their prints.

Applied to the committed roster: **60 rows folded into 58 people**, none held. Every group is the same person; no row
carried another member's id (the ids came from speech ids and the members register, and dates of service, seat and
house agree in each group). The two prints whose names alone do not agree are reviewed entries in
`scripts/person_identity.json`: "Katter Bob Jnr" (1998-1999) is Bob Katter, who has held Kennedy since 1993 (his
father left the House in 1990), and "Kevin Drum" (2016-2021) is Damian Drum, Member for Murray then Nicholls from
2016 to 2022.

At the next manual knowledge-base publish of roster profiles (`scripts/publish_grants_research.py`), the 6 folded
spelling twins that held a seat retire their roster-profile records; no record is added or rewritten. Nothing was
published by this change.

| ID | Rows before (speeches, houses, years) | Retired slugs (301) | Class | Canonical (combined) | Moved |
|---|---|---|---|---|---|
| 10306 | Joe Hockey (3,557, House, 1998-2015); Hockey (5, House, 2002-2007) | `hockey` | same person (surname print) | Joe Hockey `joe-hockey` (3,562) | 5 speeches |
| 10524 | Christopher Pyne (2,528, House, 2011-2019); Chris Pyne (1,206, House, 1998-2011) | `chris-pyne` | same person (another given name or nickname) | Christopher Pyne `christopher-pyne` (3,734) | 1,206 speeches + aliases |
| 10188 | Peter Dutton (2,333, House, 2002-2025); Peter Craig Dutton (62, House, 2021-2022) | `peter-craig-dutton` | same person (middle names printed) | Peter Dutton `peter-dutton` (2,395) | 62 speeches |
| 10513 | Tanya Plibersek (1,969, House, 1998-2026); Tanya Joan Plibersek (19, House, 2021-2022) | `tanya-joan-plibersek` | same person (middle names printed) | Tanya Plibersek `tanya-plibersek` (1,988) | 19 speeches |
| 10409 | Jenny Macklin (1,907, House, 1998-2019); Macklin (13, House, 2000-2004) | `macklin` | same person (surname print) | Jenny Macklin `jenny-macklin` (1,920) | 13 speeches |
| 10512 | Graham Perrett (1,813, House, 2008-2025); Graham Douglas Perrett (47, House, 2021-2022) | `graham-douglas-perrett` | same person (middle names printed) | Graham Perrett `graham-perrett` (1,860) | 47 speeches |
| 10485 | Shayne Neumann (1,707, House, Joint cttee, House cttee, 2008-2026); Shayne Kenneth Neumann (30, House, 2021-2022) | `shayne-kenneth-neumann` | same person (middle names printed) | Shayne Neumann `shayne-neumann` (1,737) | 30 speeches |
| 10352 | Bob Katter (1,539, House, 2000-2026); Katter Bob Jnr (42, House, 1998-1999) | `katter-bob-jnr` | same person (Hansard print, surname first) | Bob Katter `bob-katter` (1,581) | 42 speeches + aliases |
| 10387 | Sussan Ley (1,505, House, 2002-2026); Sussan Penelope Ley (32, House, 2021-2022) | `sussan-penelope-ley` | same person (middle names printed) | Sussan Ley `sussan-ley` (1,537) | 32 speeches |
| 10599 | Warren Snowdon (1,487, House, 1998-2022); Warren Edward Snowdon (17, House, 2021-2022) | `warren-edward-snowdon` | same person (middle names printed) | Warren Snowdon `warren-snowdon` (1,504) | 17 speeches |
| 10319 | Greg Hunt (1,436, House, 2011-2022); Gregory Hunt (675, House, 2002-2011) | `gregory-hunt` | same person (another given name or nickname) | Greg Hunt `greg-hunt` (2,111) | 675 speeches + aliases |
| 10734 | Adam Bandt (1,366, House, 2010-2025); Adam Paul Bandt (56, House, 2021-2022) | `adam-paul-bandt` | same person (middle names printed) | Adam Bandt `adam-bandt` (1,422) | 56 speeches + aliases |
| 10746 | Andrew Leigh (1,293, House, 2010-2026); Andrew Keith Leigh (42, House, 2021-2022) | `andrew-keith-leigh` | same person (middle names printed) | Andrew Leigh `andrew-leigh` (1,335) | 42 speeches + aliases |
| 10368 | Catherine King (1,268, House, 2002-2026); Catherine Fiona King (24, House, 2022-2022) | `catherine-fiona-king` | same person (middle names printed) | Catherine King `catherine-king` (1,292) | 24 speeches |
| 10545 | Stuart Robert (1,196, House, 2008-2023); Stuart Rowland Robert (22, House, 2021-2022) | `stuart-rowland-robert` | same person (middle names printed) | Stuart Robert `stuart-robert` (1,218) | 22 speeches |
| 10542 | Bernie Ripoll (1,168, House, 1998-2016); Ripoll (5, House, 2000-2002) | `ripoll` | same person (surname print) | Bernie Ripoll `bernie-ripoll` (1,173) | 5 speeches |
| 10503 | Julie Owens (1,018, House, 2004-2022); Julie Ann Owens (9, House, 2021-2022) | `julie-ann-owens` | same person (middle names printed) | Julie Owens `julie-owens` (1,027) | 9 speeches |
| 10416 | Nola Marino (960, House, 2008-2025); Nola Bethwyn Marino (13, House, 2021-2022) | `nola-bethwyn-marino` | same person (middle names printed) | Nola Marino `nola-marino` (973) | 13 speeches |
| 10496 | Brendan O'Connor (954, House, 2002-2024); Brendan O’Connor (598, House, 2005-2011); Brendan Patrick John O'Connor (31, House, 2021-2022) | `brendan-oconnor-4272656e64616e204f2019436f6e6e6f72`, `brendan-patrick-john-oconnor` | same person (middle names printed, spelling twin) | Brendan O'Connor `brendan-oconnor` (1,583) | 629 speeches + aliases |
| 10543 | Amanda Rishworth (938, House, 2008-2026); Amanda Louise Rishworth (29, House, 2021-2022) | `amanda-louise-rishworth` | same person (middle names printed) | Amanda Rishworth `amanda-rishworth` (967) | 29 speeches |
| 10122 | Steven Ciobo (907, House, 2002-2019); Steve Ciobo (114, House, 2011-2019) | `steve-ciobo` | same person (another given name or nickname) | Steven Ciobo `steven-ciobo` (1,021) | 114 speeches + aliases |
| 10529 | Rowan Ramsey (877, House, 2008-2025); Rowan Eric Ramsey (49, House, 2021-2022) | `rowan-eric-ramsey` | same person (middle names printed) | Rowan Ramsey `rowan-ramsey` (926) | 49 speeches |
| 10086 | Mark Butler (828, House, 2008-2026); Mark Christopher Butler (25, House, 2021-2022) | `mark-christopher-butler` | same person (middle names printed) | Mark Butler `mark-butler` (853) | 25 speeches |
| 10123 | Jason Clare (802, House, 2008-2026); Jason Dean Clare (10, House, 2021-2022) | `jason-dean-clare` | same person (middle names printed) | Jason Clare `jason-clare` (812) | 10 speeches |
| 10377 | Andrew Laming (795, House, 2004-2022); Andrew Charles Laming (26, House, 2021-2022) | `andrew-charles-laming` | same person (middle names printed) | Andrew Laming `andrew-laming` (821) | 26 speeches |
| 10418 | Richard Marles (793, House, 2008-2026); Richard Donald Marles (23, House, 2021-2022) | `richard-donald-marles` | same person (middle names printed) | Richard Marles `richard-marles` (816) | 23 speeches |
| 10583 | Sid Sidebottom (730, House, 2000-2013); Peter Sidebottom (54, House, 1998-1999) | `peter-sidebottom` | same person (another given name or nickname) | Sid Sidebottom `sid-sidebottom` (784) | 54 speeches + aliases |
| 10136 | Julie Collins (723, House, 2008-2026); Julie Maree Collins (15, House, 2021-2022) | `julie-maree-collins` | same person (middle names printed) | Julie Collins `julie-collins` (738) | 15 speeches |
| 10724 | Kelly O'Dwyer (691, House, 2011-2019); Kelly O’Dwyer (54, House, 2010-2011) | `kelly-odwyer-4b656c6c79204f20194477796572` | same person (spelling twin) | Kelly O'Dwyer `kelly-odwyer` (745) | 54 speeches |
| 10747 | Deborah O'Neill (690, Senate, 2013-2026); Deb O'Neill (229, House, 2011-2013); Deborah O’Neill (45, House, 2010-2011) | `deb-oneill`, `deborah-oneill-4465626f726168204f20194e65696c6c` | same person (another given name or nickname, spelling twin) | Deborah O'Neill `deborah-oneill` (964) | 274 speeches + chamber, aliases |
| 10729 | Bert Van Manen (641, House, 2010-2025); Bert van Manen (327, House, 2011-2022) | `bert-van-manen-426572742076616e204d616e656e` | same person (spelling twin) | Bert Van Manen `bert-van-manen` (968) | 327 speeches |
| 10026 | Robert Baldwin (622, House, 2002-2011); Bob Baldwin (401, House, 1998-2016) | `robert-baldwin` | same person (another given name or nickname) | Bob Baldwin `bob-baldwin` (1,023), the release's name | 622 speeches + aliases |
| 10152 | Mark Coulton (616, House, 2008-2025); Mark Maclean Coulton (31, House, 2021-2022) | `mark-maclean-coulton` | same person (middle names printed) | Mark Coulton `mark-coulton` (647) | 31 speeches |
| 10676 | Antony Windsor (609, House, 2002-2011); Tony Windsor (120, House, 2011-2013) | `antony-windsor` | same person (another given name or nickname) | Tony Windsor `tony-windsor` (729), the release's name | 609 speeches + years, aliases |
| 10818 | Melissa Price (602, House, 2013-2026); Melissa Lee Price (13, House, 2021-2022) | `melissa-lee-price` | same person (middle names printed) | Melissa Price `melissa-price` (615) | 13 speeches + aliases |
| 10728 | Ken O'Dowd (558, House, 2011-2022); Ken O’Dowd (13, House, 2010-2011) | `ken-odowd-4b656e204f2019446f7764` | same person (spelling twin) | Ken O'Dowd `ken-odowd` (571) | 13 speeches |
| 10811 | Lucy Wicks (547, House, 2013-2021); Lucy Elizabeth Wicks (43, House, 2021-2022) | `lucy-elizabeth-wicks` | same person (middle names printed) | Lucy Wicks `lucy-wicks` (590) | 43 speeches + aliases |
| 10814 | Clare O'Neil (526, House, 2013-2026); Clare Ellen O'Neil (21, House, 2021-2022) | `clare-ellen-oneil` | same person (middle names printed) | Clare O'Neil `clare-oneil` (547) | 21 speeches + aliases |
| 10497 | Gavan O'Connor (524, House, 1998-2005); Gavan O’Connor (203, House, 2005-2007) | `gavan-oconnor-476176616e204f2019436f6e6e6f72` | same person (spelling twin) | Gavan O'Connor `gavan-oconnor` (727) | 203 speeches |
| 10935 | Anne Webster (464, House, 2019-2026); Elizabeth Webster (21, House, 2019-2019) | `elizabeth-webster` | same person (another given name or nickname) | Anne Webster `anne-webster` (485) | 21 speeches + aliases |
| 10876 | Meryl Swanson (453, House, 2016-2026); Meryl Jane Swanson (32, House, 2021-2022) | `meryl-jane-swanson` | same person (middle names printed) | Meryl Swanson `meryl-swanson` (485) | 32 speeches + aliases |
| 10952 | Gerard Rennick (428, Senate, 2019-2025); Rennick (73, Senate cttee, 2025-2025) | `rennick` | same person (surname print) | Gerard Rennick `gerard-rennick` (501) | 73 speeches + chamber |
| 10858 | Linda Burney (420, House, nsw_la, 2015-2025); Linda Jean Burney (21, House, 2021-2022) | `linda-jean-burney` | same person (middle names printed) | Linda Burney `linda-burney` (441) | 21 speeches + aliases |
| 10882 | Nicolle Flint (418, House, 2016-2021); Nicolle Jane Flint (15, House, 2021-2022) | `nicolle-jane-flint` | same person (middle names printed) | Nicolle Flint `nicolle-flint` (433) | 15 speeches + aliases |
| 10875 | Damian Drum (357, House, 2016-2022); Kevin Drum (35, House, 2016-2021) | `kevin-drum` | same person (another given name or nickname) | Damian Drum `damian-drum` (392) | 35 speeches + aliases |
| 11007 | Fatima Payman (356, Senate, 2022-2026); Payman (287, Senate cttee, 2025-2026) | `payman` | same person (surname print) | Fatima Payman `fatima-payman` (643) | 287 speeches + chamber |
| 10720 | Robert Oakeshott (344, House, 2011-2013); Rob Oakeshott (249, House, 2008-2011) | `rob-oakeshott` | same person (another given name or nickname) | Robert Oakeshott `robert-oakeshott` (593) | 249 speeches + aliases |
| 11001 | Allegra Spender (340, House, 2022-2026); Spender (44, House cttee, Joint cttee, 2025-2026) | `spender` | same person (surname print) | Allegra Spender `allegra-spender` (384) | 44 speeches + chamber |
| 11006 | Nampijinpa Price (336, Senate cttee, Joint cttee, 2025-2026); Jacinta Nampijinpa Price (208, Senate, 2022-2026) | `nampijinpa-price` | same person (surname print) | Jacinta Nampijinpa Price `jacinta-nampijinpa-price` (544) | 336 speeches + chamber |
| 10028 | Phillip Barresi (320, House, 2000-2007); Phil Barresi (70, House, 1998-1999) | `phil-barresi` | same person (another given name or nickname) | Phillip Barresi `phillip-barresi` (390) | 70 speeches + aliases |
| 10928 | Katrina Allen (318, House, 2019-2021); Katie Allen (75, House, 2019-2022) | `katrina-allen` | same person (another given name or nickname) | Katie Allen `katie-allen` (393), the release's name | 318 speeches + aliases |
| 10921 | Libby Coker (280, House, House cttee, 2020-2026); Elizabeth Coker (121, House, 2019-2021) | `elizabeth-coker` | same person (another given name or nickname) | Libby Coker `libby-coker` (401) | 121 speeches + aliases |
| 10922 | Pat Conaghan (268, House, House cttee, Joint cttee, 2019-2026); Patrick Conaghan (167, House, 2019-2021) | `patrick-conaghan` | same person (another given name or nickname) | Pat Conaghan `pat-conaghan` (435) | 167 speeches + aliases |
| 10600 | Alex Somlyay (205, House, 1998-2011); Alexander Somlyay (11, House, 2011-2013) | `alexander-somlyay` | same person (another given name or nickname) | Alex Somlyay `alex-somlyay` (216) | 11 speeches + aliases |
| 10636 | David Tollner (194, House, 2002-2007); Tollner (6, House, 2002-2004) | `tollner` | same person (surname print) | David Tollner `david-tollner` (200) | 6 speeches |
| 10977 | Colin Boyce (168, House, 2022-2026); Boyce (15, Joint cttee, House cttee, House, 2022-2026) | `boyce` | same person (surname print) | Colin Boyce `colin-boyce` (183) | 15 speeches + chamber |
| 10164 | Yvette D’Ath (146, House, 2008-2011); Yvette D'Ath (134, House, 2011-2013) | `yvette-dath-597665747465204427417468` | same person (spelling twin) | Yvette D’Ath `yvette-dath` (280) | 134 speeches |
| 10957 | Van (34, Senate cttee, 2025-2025); David Van (10, Senate, 2023-2025) | `van` | same person (surname print) | David Van `david-van` (44) | 34 speeches + chamber |

# One source owner for a state spelling twin (14 November 2026)

The profile-party-service joins (docs/reports/2026-11-14-profile-party-gaps.md) gave "Jodi McKay" (415 speeches)
and her spelling twin "Jodi Mckay" (13 speeches, NSW Assembly, Strathfield, 2015-2016) the same Wikidata person,
Q6207887, so two roster rows owned one single-person record and `scripts/test_roster_evidence.py` failed. The twin is
folded into Jodi McKay by `roster_fold.twin_target` and `merge` (the rule the nightly fold already applies): she keeps
her name, slug, seat and dated Labor service, takes the 13 speeches (428), and lists "Jodi Mckay" in `prints`, whose
suffixed slug 301s to her. Her accept group is the only owner of Q6207887; the twin's group is gone.

A fold whose prints are only the person's own full name in another case or apostrophe (`roster_party_gaps.twin_prints`)
adds no identity, so the party-service rule still verifies the person's row against the full-name dated source; any
other print still holds the join. `scripts/audit_roster_changes.py` proves such a fold with `twin_target` on the
baseline. At the next roster-profile publish the twin's duplicate record retires. The other five reviewed state twins
(`scripts/test_roster_fold.py`) carry no shared source and are unchanged.
