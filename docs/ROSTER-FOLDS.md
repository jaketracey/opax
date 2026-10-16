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
- Prints with no party (Victorian Assembly stubs such as "Allan") and same-person name variants the registry check
  cannot prove (Joe/Joseph Hockey, Bernie/Bernard Ripoll, Jenny/Jennifer Macklin, Dave/David Tollner) need reviewed
  evidence, for example entries in `scripts/person_identity.json`.
- Kernot folds by every test but has its own published roster-profile record; folding it retires that KB record.
