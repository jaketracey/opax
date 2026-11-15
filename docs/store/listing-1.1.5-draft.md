# OPAX 1.1.5: App Store listing draft

Drafted 16 November 2026. **Drafts only.** Nothing here has been entered in App Store Connect, and 1.1.5 has not been submitted. 1.1.4 is the version on the App Store; 1.1.5 is in TestFlight.

The 1.0 listing and its rules are in [IOS-STORE.md](../IOS-STORE.md) (sections 1 and 5). This draft keeps what that listing settled (the name, the subtitle as option A, the independence line, the capture rules) and changes what 1.1.5 gives reason to change.

Counts are characters, checked with a script; the keywords field is also 100 bytes. No field uses an em dash. Every claim is of the app as built on `ad/b78-int`; the changes are from its commits since `ade1bb3fb` (build 73).

## 1. What's New in 1.1.5

577 of 4,000 characters (the brief's limit: under 600).

```text
This release is about steadiness. OPAX should feel settled from the moment a page opens.

• Pages open where they settle. Profiles, lists and Bills no longer shift after they appear.
• Clearer bars. Titles and buttons sit over the page with a soft fade, with no band across the top.
• Search keeps your place when you cancel or come back from another tab.
• Ask and its composer show whole lines of text.
• Larger text sizes fit. Search fields, titles and rows no longer clip.
• Member names and seats read as the record has them.

Thank you for the reports behind these fixes.
```

What each line rests on:

| Line | Commits since build 73 (subjects) |
| --- | --- |
| Pages open where they settle | "a page beside the Duo's rail opens where it settles"; "Bills opens on the scope control it settles on"; "people rows draw at once from the roster, then sharpen in place"; "a grid in Today's spread is its final size in its first frame"; "the past members placeholder is the height of the row that loads" |
| Clearer bars | "no bar panel on any tab root; the page fades into its ground under the bar"; "pushed pages take the clear bar and fade, as Today does"; "no pushed page keeps the hairline; a search field's page fades under a clear bar" |
| Search keeps your place | "Cancel at the end of Search results returns to where the page was"; "the Search tab opens where it was left when pressed from another tab" |
| Ask and its composer | "the composer never ends part way through a line"; "the iOS composer shows whole lines wherever the caret puts them"; "in an Ask thread the bar fade ends at the bar on screen" |
| Larger text sizes fit | "the chooser's search field has a short placeholder at accessibility text sizes"; "bar title shift reserves the larger bar items at any size above Large"; "an election row's date line is word-safe at large text sizes"; "large titles show at rest with Reduce Transparency or Increase Contrast on" |
| Names and seats | "Profile: a surname recorded in capitals is drawn as people write it"; "a person's row says 'Member for' only of someone the record says sits now"; "a state seat's current flag claims no federal seat" |

Left out on purpose: anything a reader cannot see (shared reads, test and build work), and the bar hairline on pushed pages by name, since "clearer bars" covers it.

## 2. Subtitle and promotional text

**Subtitle** (30 characters).

| Option | Text | Count | Reasoning |
| --- | --- | --- | --- |
| A (keep) | Your MP, votes, bills and pay | 29 | The live subtitle. It names four things the app shows and puts "MP", "votes" and "bills" in an indexed field. Recommended: it is accurate and already indexed, and there is no evidence yet that it is the thing holding installs back |
| B | How your MP voted, and bills | 28 | Follows the phrase people type ("how did my MP vote"). It gives up "pay", which is one of the less common things an app in this category shows |

**Promotional text** (170 characters; can change at any time without a new build).

| Option | Text | Count | Reasoning |
| --- | --- | --- | --- |
| A | Find your MP and senators and see how they voted, what they declared and what they are paid. Follow federal bills, or ask a question and get an answer with records cited. | 170 | For someone who has never seen the app: what it is for, in the order people ask. Recommended as the standing text |
| B | Version 1.1.5 makes OPAX steadier: pages open where they settle and large text fits. Find your MP, see votes, declared interests and pay, and follow federal bills. | 163 | For the weeks after release: says what changed, then what the app is. Swap back to A after |

A dated line for the Victorian election (voting is Saturday 28 November 2026) could replace either until then, for example "Victorian election: find your district and its candidates." It must come out once voting has closed.

## 3. Keywords

```text
parliament,federal,hansard,senator,electorate,donations,victorian,election,politics,australia,grants
```

100 of 100 characters and bytes. No spaces after commas. No word repeats the name (OPAX) or either subtitle option ("your", "MP", "votes", "voted", "bills", "pay", "how", "and"). No app, company or trademark names. Apple's guidance is that words across the name, subtitle and keywords are matched together, so single words are used rather than phrases.

| Word | Why |
| --- | --- |
| parliament | The base word of the category: "parliament", "Australian parliament", "federal parliament" |
| federal | Completes "federal parliament" and "federal MP" with the subtitle's "MP" |
| hansard | People who know the record search for it by name; the app reads speeches from it in the record reader |
| senator | "my senator", "senators": Your MP lists the state's senators |
| electorate | "my electorate", "electorate map": the electorate page and its outline |
| donations | The word people use for party funding; the app shows parties' disclosed receipts and the money map |
| victorian | With "election": the Victorian election pages, live for the 28 November vote |
| election | "Victorian election", "election results": the election pages and each electorate's past results |
| politics | The broad browse term; pairs with "australia" |
| australia | "Australian politics", "Australia parliament" |
| grants | Commonwealth grants and Community funding are in the app, and "grants" is a distinct search |

Dropped from the 1.0 set: "politician", "legislation", "interests", "expenses", "salary" and "civics". They describe the app accurately but are not what people type; "bills" and "pay" in the subtitle already cover two of them. After the Victorian election, "victorian" can give its 9 characters back to "interests" (9).

Not used: any party's or person's name (non-partisan, and against the store's rules for keywords), and "vote" or "voting", which the subtitle's "votes" already matches.

## 4. Screenshot plan

Six frames, in this order, for iPhone 6.9-inch (1320 x 2868, portrait) and iPad 13-inch (2064 x 2752, portrait). Captions are under 40 characters, in Public Sans, plain sentence case, above the device image.

The first two frames are the ones shown in search results, so they carry the two things people come for: who represents me, and how did they vote. The 1.0 plan opened on the welcome tour; that frame shows words about the app and none of the app, so it goes, and the 1.0 plan's frames 2 and 3 move up.

| # | Caption | Count | Screen and state | iPad 13-inch | Why here |
| --- | --- | --- | --- | --- | --- |
| 1 | Find your MP and senators | 25 | Your MP with a federal seat chosen: the member's row, the state's senators from several parties, the electorate card with its outline | The same page; the wide layout shows the member, senators and electorate card side by side | Answers "my MP" at a glance, with real names and a map. It is the most personal page in the app and needs no explanation |
| 2 | See how they voted | 18 | A member's profile scrolled so the name is in the bar and Voting record fills the frame: three or four divisions with "Voted for" and "Voted against" pills, bill titles and dates | The same, in the readable column | Answers "how did my MP vote", the second search. Shows that the record is specific and dated |
| 3 | Follow bills and divisions | 26 | A passed bill on an uncontroversial subject: "In short", key dates, and a division with party splits (Labor, the Coalition, the crossbench in that order). The machine summary label in view | The Bills split: the list on the left, the same bill on the right | What the Bills tab is for, with parties side by side rather than one party's page |
| 4 | Ask, with the records cited | 27 | An Ask answer to a factual question ("Who represents Grayndler?"), the "Machine-written" label visible and "Records cited" with one or two records under it | Ask with the sources pane docked beside the answer | The newest way in. The label and the cited records are the point of the frame: answers come with their sources |
| 5 | Declared interests and pay | 26 | A second member, from another party: Declared interests with its source line, and the pay block below it | The same, in the readable column | What the registers and the Remuneration Tribunal say, which few people know they can read |
| 6 | Victorian election: find your district | 38 | The Victorian election page: the day line, "Find your district" and the district search field, before any search | The same | Timely until 28 November. After voting closes, replace with the electorate page: outline, representatives and past results, "Electorates, outlines and results" (33) |

Capture rules, kept from IOS-STORE.md section 5.2:

- Production build, light appearance, default text size, English (Australia), 9:41 with full signal and battery, no permission alert.
- No official parliamentary portrait in any frame (decision 13): choose members whose portraits are Wikimedia Commons files under an open licence, or blank circles, and credit each outside the device image.
- Neutral: two sitting members from different parties across frames 2 and 5, neither a party leader nor a minister. No single-party page, no lead about one company, no daily edition.
- No member who has died, no crest or party logo, no bill about crime, firearms or gambling.
- A caption claims nothing its frame does not show.

Added for 1.1.5:

- Capture on build 85 or later, so the clear bars and their fade are in every scrolled frame (frame 2 is the one that shows them).
- Frame 4 uses a real answer, checked against the record it cites.
- The iPad set is new: the app supports iPad now (`supportsTablet: true`), and the 1.0 plan had no iPad frames.

## 5. The description's first three lines

Only these show before "more". They say what it is, what you can do, and what it costs you.

```text
See what Australia’s parliamentarians do on the public record: how your MP voted, what they declared and what they are paid.
Find your federal member and senators by electorate or name, follow bills through parliament, and ask questions answered with links to the records.
Free to read, with no account. Independent and non-partisan. No advertising and no tracking; diagnostics are anonymous and not linked to you.
```

124, 147 and 141 characters. The rest of the description stays as in IOS-STORE.md section 1.1, which opens with the full name; that sentence moves to follow these three.

The third line states the privacy position as the App Privacy label has it: anonymous diagnostics, not linked to the reader, no tracking.

## 6. Before any of this is used

- The owner decides which options go in, and enters them. Nothing in this file changes App Store Connect.
- Check the What's New lines against the build that is submitted: if a fix is held back from it, its line comes out.
- The Victorian election items (promotional line, keyword, frame 6) are dated. Each names what replaces it after 28 November.
