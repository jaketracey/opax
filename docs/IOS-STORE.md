# OPAX iOS: App Store submission readiness

Written 5 October 2026. This document prepares the first App Store submission of the OPAX iPhone app: listing copy, App Review notes, the age rating, export compliance and content rights answers, a draft App Privacy label, a screenshot plan and a gap list against the App Store Review Guidelines. It does not submit anything. Nothing here has been entered in App Store Connect.

**What was checked.**

- The app at commit `a8bec98f` (`mobile/`), rechecked at the current integration pin `7b70d11f` (`origin/ios/app`, with party-status), which was merged into this branch on 5 October 2026; no cited line moved. Build 2 (version 0.1.0, build 2) is the build in TestFlight Internal: Today, Your MP, member profiles, electorates, Bills, Search, and About and sources.
- Apple's [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), "Last Updated: June 8, 2026", and the App Store Connect help pages linked in each section, read on 5 October 2026.
- The App Store Connect record, read with GET requests only on 5 October 2026. The record exists as "OPAX" with primary language English (Australia). Version 1.0 is in Prepare for Submission. Subtitle, description, keywords, promotional text, support URL, marketing URL, privacy policy URL, copyright, categories, content rights, the age rating questionnaire and the App Review information are all empty. Builds 1 and 2 are valid and report `usesNonExemptEncryption: false`. The App Privacy answers are not readable through the API and were not checked.
- The live website, read on 5 October 2026: `/about` and `/methods` load; `/privacy`, `/support` and `/contact` return 404.
- Round 2, the same day: the account lane (`ios/account-ui` at `cf720317`), the portraits lane (`ios/portraits` at `9bfa6825`), the voice lane's uncommitted worktree (`ios/talk-sheet`), [PHOTOS.md](PHOTOS.md) and the portrait scripts.

Related documents: [IOS-APP.md](IOS-APP.md) (decisions, sections 6 and 11), [IOS-UX.md](IOS-UX.md) (sections 6 and 8), [IOS-RELEASE.md](IOS-RELEASE.md) (build and TestFlight tooling).

**Status in one line.** The listing copy, review notes and questionnaire answers below describe the read-only v1 and are ready to enter. Submission is blocked by eight gaps in section 6: a published contact and support page, a deployed privacy policy, placeholder sheets in the production build, the privacy label inputs, confirmation of the content rights answer, unentered metadata, the version number, and the licensing of the official parliamentary portraits (B8). Under Jake's interim decision, those portraits are planned for build 3, after the portraits merge and gate; the licensing is open, not resolved.

**Scope.** v1 is Today, Your MP, member profiles, electorates, Bills, Search, and About and sources. Talk to OPAX (voice) and Account (sign-in by code, sign-out, deletion) are being built on `ios/talk-sheet` and `ios/account-ui` for development and e2e builds only; production builds keep them out until Jake approves the consent step, the microphone purpose string and decision 5. Nothing in sections 1 to 8 presents them as v1 features. Section 9 is a separate, conditional variant for the release that adds voice.

## 1. Listing copy

Every count below is in characters as App Store Connect counts them, checked with a script. Keywords are counted in bytes, which is Apple's unit for that field. No field uses an em dash.

| Field | Proposed | Count and limit | Evidence and notes |
| --- | --- | --- | --- |
| Name | OPAX | 4 of 30 | Already the record's name. `mobile/app.config.ts:47` (`name: 'OPAX'`) |
| Subtitle | Your MP, votes, bills and pay | 29 of 30 | Names four shipped features: Your MP tab, voting record, Bills tab, pay block (`mobile/src/app/(tabs)/_layout.tsx:21-28`, `mobile/src/features/Person.tsx:273,482`) |
| Subtitle, alternative | Parliament’s public record | 26 of 30 | Plainer, fewer search terms |
| Promotional text | Find your MP and senators and see their votes, declared interests, pay and expenses. Follow federal bills through parliament, with links to the records behind them. | 164 of 170 | Your MP shows member and senators (`mobile/src/features/YourMP.tsx:457`); profile blocks (`Person.tsx:273,370,482,578`); federal bill keys only (`mobile/src/api/policy.ts:25-26`) |
| Description | Section 1.1 | 2,440 of 4,000; 2,564 with the PENDING notice | Each claim is mapped to code in section 1.1 |
| Keywords | australia,parliament,senator,electorate,politician,legislation,interests,expenses,salary,civics | 95 of 100 bytes | No spaces. No word repeats the name or subtitle (OPAX, MP, votes, bills, pay). No app, company or trademark names, as App Store Connect requires ("Names of other apps or companies aren't allowed") |
| Primary category | Reference | | Apple's Reference definition lists "general research" and "politics" ([categories](https://developer.apple.com/app-store/categories/)) |
| Secondary category | News | | News covers "information about current events or developments in areas of interest such as politics". Today is a dated digest of new bills and declarations. Education is the fallback if News is not wanted |
| Support URL | `https://opax.com.au/support` | | 404 today. Contents in section 1.2. Required field |
| Marketing URL | Leave empty for now; later `https://opax.com.au/app` | | Optional field. Contents in section 1.2 |
| Privacy policy URL | `https://opax.com.au/privacy` | | 404 today. The page is drafted on branch `web/privacy-app` (approved at `89781797`) with 16 placeholders; see section 4.5 |
| Copyright | 2026 [the responsible entity] | | Needs Jake (section 7) |
| Primary language | English (Australia) | | Already set |

The full name "Open Parliamentary Accountability Exchange" (42 characters) does not fit the subtitle, so it opens the description.

### 1.1 Description

```text
The Open Parliamentary Accountability Exchange (OPAX) is a reader for the public record of Australian politics. It brings together the recorded votes, declared interests, pay entitlements and reported expenses of members of parliament, with links to the records behind them. You can read it without an account.

Your MP
Search by electorate or member name to find your federal member and your senators. Where OPAX holds a verified roster of state members, you can add your state electorate too. Your choice is saved on this iPhone.

Member profiles
A profile shows the member’s recorded divisions, with ayes, noes and their votes on bills; interests declared on parliamentary registers; federal pay entitlements for the posts they hold; expenses reported by the Independent Parliamentary Expenses Authority; and a link to their party’s disclosed receipts. Blocks say where their figures came from and how current they are.

Electorates
An electorate shows its representatives, past election results and Census context, with sources.

Bills
Browse federal bills by status, chamber and year, or search them by title, sponsor or portfolio. A bill shows its key dates, the divisions on it with party splits, speeches made on it and the Act it became, where one is matched. Summaries written by a model from the explanatory memorandum are labelled as machine-written and are not the record.

Today
Recently introduced bills, recent declarations of interests and the latest daily edition published on opax.com.au.

Search
Search people, declared interests, pay and expenses. Suggestions for people, electorates and bills appear as you type.

Offline and sharing
Records you have opened recently stay readable offline, marked with when they were saved. Share a link to the matching page on opax.com.au.

Independent and non-partisan
OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party. Patterns in the public record are leads, not findings: check the linked sources.

Sources
The data comes from public sources, including the Parliament of Australia, They Vote For You, the Australian Electoral Commission, the Independent Parliamentary Expenses Authority and the Remuneration Tribunal. Each source keeps its own copyright and licence, and the About and sources screen lists them.

The app needs no account and has no advertising, in-app purchases or analytics.
```

**PENDING (IOS-APP.md decision 15).** If Jake adopts the notice about people who have died, append it as the last paragraph (122 characters; the description is then 2,564): "Aboriginal and Torres Strait Islander readers are advised that this app contains names and images of people who have died." The same notice belongs on the About screen.

**Evidence for each claim.**

| Claim | Evidence |
| --- | --- |
| Read without an account; no sign-in in this build | No sign-in screen in production: `mobile/src/features/ComingSoon.tsx:33` at `a8bec98f`, and on `ios/account-ui` the production twin `mobile/src/features/account/entry.production.tsx` with the sign-in files on `mobile/scripts/production-block-list.json`; no credential on public requests (`mobile/src/api/client.ts:126`, `credentials: 'omit'`) |
| Search by electorate or member name; federal member and senators | `mobile/src/features/YourMP.tsx:200` (field "Electorate or member’s name"), `:457` ("Your senators") |
| State members only where a verified roster exists | `mobile/src/features/YourMP.tsx:479-528`; `mobile/src/api/selectors.ts:1085-1087` |
| Choice saved on the iPhone | `mobile/src/features/your-mp/choice-store.ts:3` (document file `opax-seat-v1.json`); on-screen text `YourMP.tsx:210` |
| Recorded divisions, ayes, noes, bill votes | `mobile/src/features/Person.tsx:273-339` |
| Declared interests from parliamentary registers | `Person.tsx:370`; House, Senate and Queensland registers named on About (`mobile/src/features/About.tsx:214-217`) |
| Federal pay entitlements | `Person.tsx:482-486` ("Pay for the posts held"; state pay is outside the series) |
| Expenses reported by IPEA | `Person.tsx:578-581` (coverage from April 2017); About `:238-243` |
| Link to the party's disclosed receipts | `Person.tsx:694-708` (opens on opax.com.au) |
| Blocks name their source and date | `AsAtLine` and `EvidenceFooter` on profile blocks, for example `Person.tsx:201-204,229`; IOS-APP.md section 4 ("Every block shows an 'As at' line") |
| Electorate representatives, elections, Census context, sources | `mobile/src/features/Electorate.tsx:157,181,244,319` |
| Bills: status, chamber and year filters; search by title, sponsor or portfolio | `mobile/src/features/bills/BillsList.tsx:77,92-99`; `mobile/src/api/selectors.ts:776-790` (searched fields); `mobile/src/features/bills/BillFilters.tsx:33,54,75` |
| Bill: key dates, divisions with party splits, speeches, Act | `mobile/src/features/bills/BillDetail.tsx:455,509,620,686`; party splits `mobile/src/features/bills/parts.tsx:260` |
| Machine summaries labelled, not the record | `BillDetail.tsx:408-417` ("Machine summary" and the stored attribution); About `:287-293` |
| Today: new bills, recent declarations, daily edition | `mobile/src/features/Today.tsx:59-111`; edition route `policy.ts:22` (live on 5 October 2026) |
| Search kinds and suggestions | `mobile/src/features/search/model.ts:5-28`; `mobile/src/features/Search.tsx:182,278,295,317` |
| Offline reading, marked with save time | Disk cache `mobile/src/api/disk-store.ts:15`; saved-time notices on profile blocks (`mobile/src/features/your-mp/Evidence.tsx:43-50`, `mobile/src/design/states.tsx:19,190-202`) and the offline journey `mobile/.maestro/04-offline.yaml`. Search results are not saved (`mobile/src/api/cache.ts:134`), which "Records you have opened" respects |
| Share a link to opax.com.au | `mobile/src/navigation/share.ts:17-38`; Share buttons on profile, electorate and bill (`Person.tsx:135`, `Electorate.tsx:116`, `BillDetail.tsx:143`) |
| Independence statement | `ComingSoon.tsx:5-6`, `About.tsx:93-95`, `Today.tsx:57` |
| "Leads, not findings" | `Today.tsx:112-114` |
| Sources named | About `:203-253`; Census and electoral sources carry their own licence in the electorates release (`selectors.ts:1088-1095`) |
| No advertising, in-app purchases or analytics | `mobile/package.json` has no ad, purchase or analytics package; `mobile/scripts/verify-ios-release.py:29-36,487-492` rejects analytics SDKs and hosts; build 2 passed those checks |

The description makes no promise about voice or sign-in, which are not in this build (guideline 2.3.1(a)). The [IOS-UX.md drafts](IOS-UX.md#app-store-drafts-for-jake) mention talking to OPAX and must not be used for v1.

### 1.2 Support and marketing pages

App Store Connect says the support URL "must lead to actual contact information (legal address, email address, telephone number), as may be required by local law" ([platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)). Guideline 1.5 asks that the app and its support URL "include an easy way to contact you".

**`https://opax.com.au/support` must contain:**

- A monitored contact email address for support, corrections and privacy requests (one address can serve all three), plus whatever postal address or phone number legal advice says is needed.
- How to report a data error: what to include (the page or record link, what is wrong, the source that shows it) and what happens next. The same route serves corrections and, once voice ships, "Report this answer" (IOS-APP.md decision 11).
- The independence statement, word for word as in the app.
- Short answers: no account needed to read; where the data comes from, with links to Methods and source terms; how current it is (each block's as-at line); why a portrait can be a blank circle (no portrait the app can show for that member); why state members appear for some states only (verified rosters).
- Supported devices: iPhone, iOS 18.4 or later (`mobile/app.config.ts:62-63`).
- Links to the privacy policy (`/privacy`), Methods (`/methods`) and the source code repository.

The site is a single-page app, so `/support` needs a panel, a route, a sitemap entry and footer links, as `/privacy` has on its branch. That is a web deployment and needs Jake's OK.

**Marketing URL (optional).** Leave it empty for the first submission. If a page is wanted later, `https://opax.com.au/app` would carry the description's opening paragraph, two or three of the store screenshots, the App Store link once live, the independence statement and links to support and privacy.

## 2. App Review notes

### 2.1 Notes to paste

These notes describe the read-only v1 build with the portraits lane in it, and assume gap B3 is fixed, so the production build shows no Talk button and no sign-in text. If a build still shows the placeholder sheets, add to the second paragraph: "The Talk button and the Account sheet only say that these features are not in this version." The text is 3,088 bytes of the 4,000 the Notes field allows.

```text
OPAX is a free, read-only reader for the public record of Australian politics. No account, sign-in or demo account is needed. The app has no in-app purchases, advertising, analytics or tracking.

This version contains Today, Your MP, member profiles, electorates, Bills and Search, plus About and sources. It has no sign-in and no account features.

Content. The app shows public records published by Australian parliaments and public agencies: recorded divisions, registers of members' interests, pay entitlements set by the Remuneration Tribunal, expenses reported by the Independent Parliamentary Expenses Authority, federal bills, and electorate and election results. Blocks name their source and how current they are. Native profiles exist only for members of parliament on OPAX's verified roster, as public office holders, and cover their official records. Other people named in public records do not get a profile in the app.

Portraits. Official portraits from the Parliament of Australia carry an "Official portrait" credit and a link to their CC BY-NC-ND 4.0 licence; Wikimedia Commons photos carry the author, the licence and a file link. Otherwise a blank circle.

Machine-written text. Bill summaries and speech briefs were written in advance by a language model and stored. The app labels them "Machine summary" or "Machine brief" with an attribution line, and it makes no AI or model requests.

Sources and licences are listed in the app: tap the person icon at the top right of a tab's first screen, then "About and sources".

OPAX is independent and non-partisan. It is not a government app and is not affiliated with any parliament, government or political party.

Walkthrough (about three minutes, no account):
1. The app opens on Today: the independence line, the latest daily edition, recently introduced bills and recent declarations.
2. Your MP tab: type an electorate such as Grayndler and tap it. The screen shows the seat, its member and senators. Tap the member's name for the profile: portrait and its credit, voting record, declared interests, pay, expenses and party receipts. The Share button is at the top right.
3. On Your MP, tap "Electorate record": representatives, elections (tap "Candidates and recorded votes"), Census context and sources.
4. Bills tab: search by title or tap Filters (status, chamber, year). Open a bill: a labelled machine summary, key dates, divisions with party splits, speeches and the Act it became.
5. Search tab: type a surname. Suggestions appear for people, electorates and bills. Submit to search; the "Kind" menu switches between People, Declared interests, Pay and Expenses.
6. Source links open the original record in an in-app Safari view. Links marked "Opens on opax.com.au" open Safari.
7. Offline: open a profile, turn on Airplane Mode, then reopen it. The saved copy shows, marked with when it was saved.

The app needs a network connection on first launch to load public data from opax.com.au.

Contact for this review: [review contact name, email and phone]. Support and corrections: https://opax.com.au/support
```

The bracketed contact is the App Review contact, which App Store Connect also asks for separately (name, email, phone in international format).

**Portraits paragraph.** It describes the planned build 3, after the portraits merge and gate, which is to show the website's portrait files under Jake's interim decision (section 3.4). Today's TestFlight build 2 and the integration pin show no official portraits. Recheck the wording once B8 is fixed: resized-only official portraits or a permission from the Parliament may change the credit or how the portrait is drawn. Voice additions are in section 9 and apply only if voice ships.

### 2.2 Sources and licences, as the app states them

From the About and sources screen (`mobile/src/features/About.tsx:203-285`). The app states each licence as a fact and does not grant a new one (`About.tsx:271-272`).

| Source | Used for | Licence as the app states it |
| --- | --- | --- |
| Parliament of Australia | Registers of interests, bills, the Hansard record behind divisions | Parliamentary copyright; Hansard reproduced under CC BY-NC-ND terms; House and Senate registers CC BY-NC-ND, shown as extracted facts with links |
| Queensland register of interests | Declared interests for Queensland members | No verified licence in the source review |
| They Vote For You | Compiled division data | Open Data Commons Open Database Licence; the underlying Hansard keeps parliamentary copyright |
| AEC Transparency Register | Party receipts (linked on opax.com.au) | Creative Commons Attribution; versions vary by source |
| Independent Parliamentary Expenses Authority | Claimed expenses | CC BY 3.0 AU (data.gov.au) |
| Remuneration Tribunal | Pay entitlements | Entitlements set by instrument, not payslips; refer to each record's terms |
| Electorates release (boundaries, elections, Census) | Electorate records | Per source, shown with each record (`mobile/src/api/selectors.ts:1088-1095`) |
| Wikimedia Commons portraits | Member portraits (profile credit block, not About) | Each file's own licence, shown with the author and links to the licence and file page. At `a8bec98f` and the current integration pin `7b70d11f`, only CC BY and CC BY-SA 2.x to 4.x, CC0 and public domain files are shown (`selectors.ts:223-238`, `Person.tsx:231-263`); the incoming portraits lane shows every Commons file, GFDL and "copyrighted free use" included (`ios/portraits`, `selectors.ts:239-255`). Rights and open compliance items: section 3.4 |
| Parliament of Australia official portraits (via OpenAustralia) | Member portraits (profile credit block) | CC BY-NC-ND 4.0, with an "Official portrait" credit and licence link. Not displayed at `a8bec98f` or the integration pin `7b70d11f` (`selectors.ts:210-220`, `Person.tsx:165-176`); planned for build 3, after the portraits merge and gate (`ios/portraits`, `selectors.ts:226-235`), under Jake's interim decision. The licensing is open: gap B8 |
| Merriweather, Public Sans | Fonts | SIL Open Font License 1.1; notices in the app (`About.tsx:318-348`) |
| OPAX code | The app | AGPL-3.0, with a link to the repository (`About.tsx:279-285`) |

### 2.3 Reviewer walkthrough, with evidence

| Feature | How to reach it | What the reviewer sees | Evidence |
| --- | --- | --- | --- |
| Today | Opens first | Independence line, Daily edition, Recently introduced bills, Recent declarations | `mobile/src/app/(tabs)/_layout.tsx:17`; `Today.tsx:51-115` |
| Your MP | Tab 2; type an electorate; tap it | Seat, member, senators, state members where verified, Change seat, AEC electorate finder link | `YourMP.tsx:194-260,457-545`; Maestro `07-your-mp.yaml` uses Grayndler |
| Member profile | Tap the member on Your MP | Portrait or blank circle, party, seat, as-at line, voting record, declared interests, declared ties, pay, expenses, party receipts, Share | `Person.tsx:160-727` |
| Electorate | "Electorate record" on Your MP, or a seat button on a profile | Latest verified representation, elections with candidates and votes, Census, related constituencies, sources | `Electorate.tsx:139-330`; `YourMP.tsx:284-290` |
| Bills | Tab 3 | Search field, Filters sheet (Status, Chamber introduced in, Year) | `BillsList.tsx:74-104`; `BillFilters.tsx` |
| Bill detail | Tap a bill | In short (machine summary label first), Key dates, Divisions, Party splits, Speeches with machine briefs, What became law, Sources | `BillDetail.tsx:206-703` |
| Search | Tab 4 | Field "Search people, places and bills", suggestions, Kind menu | `Search.tsx:182-470`; `KindPicker.tsx` |
| About and sources | Person icon (top right on a tab's root screen), then "About and sources" | Coverage, sources and licences, machine-written text, corrections and contact, privacy policy link, font notices | `mobile/src/navigation/chrome.ts:57-63`; `mobile/src/features/ComingSoon.tsx:47-51`; `About.tsx` |
| External links | Any source link | In-app Safari view, visibly presented (5.1.1(vii)); "Opens on opax.com.au" links leave for Safari | `mobile/src/navigation/external.ts:266-293,317-329` |

## 3. Questionnaires

### 3.1 Age rating

The App Store Connect record has no answers yet; every field below was empty on 5 October 2026. Field names are the App Store Connect API's. Definitions and the rating table are from [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions). Guideline 2.3.6 asks for honest answers.

Two kinds of count are used, both from the repository copies, which production refreshes nightly. Title counts match words in `portal/public/bills/index.json` (2,989 bills). Rendered-text counts scan the fields the bill screen shows (summaries, division notes and speech briefs) in the 2,989 `portal/public/bills/au-federal-*.json` files. Both were run on 5 October 2026. Division notes are They Vote For You's division text, debate excerpts included, split from the division's `question` field (`mobile/src/api/bill-transforms.ts:155-172`) and shown under each division (`mobile/src/features/bills/parts.tsx:376-424`, `BillDetail.tsx:607-611`).

| Question (API field) | Answer | Reason | Evidence |
| --- | --- | --- | --- |
| Parental controls (`parentalControls`) | No | The app has none | No such feature in `mobile/src` |
| Age assurance (`ageAssurance`) | No | No age checks | As above |
| Unrestricted web access (`unrestrictedWebAccess`) | No | No browser or address bar. A source link opens one checked HTTPS page in an in-app Safari view; opax.com.au pages open in Safari outside the app. See risk R3 | `external.ts:238-264` (link checks), `:266-293`, `:317-329` |
| User-generated content (`userGeneratedContent`) | No | No community features in v1 | IOS-APP.md section 3; no community routes in `mobile/src/app` |
| Social media (`socialMedia`, `socialMediaAgeRestricted`) | No | None | As above |
| Messaging and chat (`messagingAndChat`) | No | None. Voice, a future feature, is not in this build | `mobile/plugins/withVoiceAutolinking.js:17` |
| Advertising (`advertising`) | No | None | `verify-ios-release.py:29-36` |
| Profanity or crude humour (`profanityOrCrudeHumor`) | Infrequent | The bill screen shows debate excerpts in division notes. The rendered-text scan found one instance of crude language: "an act of political bastardry!" in a division note (au-federal-r7493). The other hits were names or ordinary words ("Bloody Long Walk", "Hell's Gate Dam", "damning"). Rare, but the notes quote debate and change nightly, so None cannot be defended | `portal/public/bills/au-federal-r7493.json:640`; `parts.tsx:376-424` |
| Horror or fear themes (`horrorOrFearThemes`) | None | None | |
| Alcohol, tobacco or drug use or references (`alcoholTobaccoOrDrugUseOrReferences`) | Infrequent | Apple's descriptor covers "references to or depictions of the consumption of alcohol, tobacco products, or other licit or illicit substances". Summaries, division notes and speech briefs refer to smoking, vaping, drinking and drug use, not only as subjects of regulation: one summary lists "adults who use e-cigarettes" among those affected (au-federal-s1071). 129 of the 2,989 bill files have such a reference in rendered text (51 in summaries, 29 in division notes, 93 in speech briefs), and 37 titles name these substances; registers can list gifts such as wine. Not the app's focus, so Infrequent rather than Frequent | `portal/public/bills/au-federal-s1071.json:58-67`; `BillDetail.tsx:419-436`; `portal/public/bills/index.json` |
| Medical or treatment information (`medicalOrTreatmentInformation`) | None | Health bills appear as legislation; the app gives no diagnosis or treatment guidance | |
| Health or wellness topics (`healthOrWellnessTopics`) | None | No self-care or lifestyle advice | |
| Mature or suggestive themes (`matureOrSuggestiveThemes`) | Infrequent | Apple's definition includes "real-world crimes, psychological trauma or abuse ... or war or political strife". 149 bill titles use words such as crime, violence, abuse or terrorism, and summaries describe them. They are the subject of legislation, not the app's focus | `portal/public/bills/index.json` |
| Sexual content or nudity (`sexualContentOrNudity`, `sexualContentGraphicAndNudity`) | None | None | |
| Cartoon or fantasy violence (`violenceCartoonOrFantasy`) | None | None | |
| Realistic violence (`violenceRealistic`, `violenceRealisticProlongedGraphicOrSadistic`) | None | Legislation about violence is not a depiction of physical conflict | |
| Guns or other weapons (`gunsOrOtherWeapons`) | Infrequent | The descriptor covers "references to" guns; six bill titles name firearms or weapons | `portal/public/bills/index.json` |
| Gambling, simulated gambling (`gambling`, `gamblingSimulated`) | None | No betting. 29 titles name gambling legislation, which is not gambling | |
| Contests, loot boxes (`contests`, `lootBox`) | None | None | |
| Made for Kids (`kidsAgeBand`) | Not applicable | Not a Kids category app | |
| Override (`ageRatingOverride`) | None | | |
| Age suitability URL (`developerAgeRatingInfoUrl`) | Empty | | |

**Result: 13+, changed from 9+ in earlier drafts.** Apple's table puts "Infrequent alcohol, tobacco, or drug use or references" at 13+, the highest rating any answer here reaches; infrequent profanity, mature or suggestive themes and guns or other weapons sit at 9+. Australia's regional values differ only for social media, loot boxes and simulated gambling, so the Australian rating is also 13+. Jake confirms (section 7). Answering None for alcohol, tobacco or drug references would return the rating to 9+, but the rendered summaries do not support None. Re-answer when voice ships: if guideline 4.7 applies, 4.7.5 adds an age restriction, and the privacy page's minimum age (placeholder P14) feeds that answer.

### 3.2 Export compliance

**Answer: the app uses only encryption that is exempt from export documentation (HTTPS through iOS).**

- **The key.** `ITSAppUsesNonExemptEncryption` is `false` in the app's Info.plist, set in `mobile/app.config.ts:65`. Apple: set it to NO when the app "either uses no encryption, or only uses encryption that's exempt from export compliance requirements"; with the key present, App Store Connect skips the encryption questions ([ITSAppUsesNonExemptEncryption](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)). Apple's export documentation says HTTPS through the operating system is typically exempt ([Complying with encryption export regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)).
- **How it is enforced.** The release verifier requires the key to be false (`mobile/scripts/verify-ios-release.py:419`, check "standard HTTPS encryption compliance", passed for build 2). The TestFlight script refuses a build that reports non-exempt encryption and sets `usesNonExemptEncryption: false` only when App Store Connect has no value (`mobile/scripts/asc-testflight.py:143-147`). On 5 October 2026 builds 1 and 2 both reported `false`.
- **What the app encrypts.** HTTPS to `https://opax.com.au`, the only production origin (`app.config.ts:19-24`), under App Transport Security defaults: production builds carry no ATS exception (`app.config.ts:67-80`; verifier check "no ATS exception"). `mobile/package.json` has no cryptography package.
- **Later.** The voice core, excluded from production builds, uses `URLSessionWebSocketTask` over TLS, which is also the operating system's encryption (IOS-APP.md section 4). Recheck when it ships.
- Apple notes that exempt use "might" still call for a year-end self-classification report to the U.S. government. That is a legal question, not answered here.

### 3.3 Content rights

App Store Connect asks whether the app "contain[s], show[s], or access[es] third-party content" and, if so, whether it has "all the necessary rights to that content" ([app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)). The field is empty today.

- **First answer: yes**, the app contains third-party content: the sources in section 2.2.
- **Second answer: PENDING confirmation.** Jake decided IOS-APP.md decision 13 on 5 October 2026 ("portraits OK"; section 3.4). Decision 13 also listed the data licences for app distribution and the AGPL question for code reused from the web. The decision as relayed does not mention those, so confirm that it covers them before asserting the rights (gap B5). Answering yes does not settle the official portrait crops, which stay open under gap B8 until fixed.

### 3.4 Rights under guideline 5.2, by source

Guideline 5.2: "Make sure your app only includes content that you created or that you have a license to use"; 5.2.1: apps "should be submitted by the person or legal entity that owns or has licensed the intellectual property". 2.3.9 applies the same to screenshots.

**Decision 13, portraits (Jake, 5 October 2026: "portraits OK").** The app shows official parliamentary portraits unaltered, with an "Official portrait" credit and a licence link (CC BY-NC-ND 4.0 for the Parliament of Australia), cached unaltered and only scaled for display.

**Interim decision (Jake, 5 October 2026, relayed by the OPAX orchestrator):** "Just use the website portraits for now - I will fix the licensing stuff later". The app ships the website's portrait files as they are: the 551 official portraits and the 298 Commons files, each with its credit and licence link. The incoming portraits lane shows official portraits, so they are planned for build 3, after the portraits merge and gate. This is interim.

| Build | Official portraits | Commons portraits | Evidence |
| --- | --- | --- | --- |
| TestFlight build 2 (0.1.0, build 2; commit `5ac728d2`) | Not shown | CC BY and CC BY-SA 2.x to 4.x, CC0 and public domain only | `selectors.ts:129,138,147` at `5ac728d2` |
| Integration pin `7b70d11f`, merged into this branch | Not shown (review-required) | The same subset | `selectors.ts:210-238`; `Person.tsx:165-176` |
| Planned build 3, after the portraits merge and gate | The website's files, with the "Official portrait" credit | Every Commons file, GFDL and free-use included | `ios/portraits` at `9bfa6825`: `selectors.ts:226-255`, `Person.tsx:224-267` |

Both the current app and the portraits lane draw portraits in a circle (`Person.tsx:166-169`; `people.tsx:45-59` on `ios/portraits`). **The licensing risk below stays open and must be fixed before App Store submission** (gap B8), with resized-only files made from uncropped originals or with permission from the Parliament of Australia.

**What "unaltered" means here.** The app shows the website's own files, byte for byte, only scaled: the portraits lane accepts nothing but the website's 200x200 WebP (`mobile/src/api/portrait-policy.ts:1,16-40` on `ios/portraits`). The website's files are themselves crops of the originals, so the question is what the website did to each source. Creative Commons 4.0, section 2(a)(4), lets a licensee use the work in any medium or format and make "technical modifications necessary to do so", and says "simply making modifications authorized by this Section 2(a)(4) never produces Adapted Material": resizing is one. A crop changes the work, which arguably makes it an adaptation. CC BY and CC BY-SA allow adaptations with attribution (and share-alike for BY-SA). CC BY-NC-ND allows sharing only unadapted copies.

| Source | Files on the website | Licence | What the website did to the file | What that means | App plan for the submission build | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Parliament of Australia official portraits, fetched from OpenAustralia by person_id | 551 numeric keys in `portal/public/photos/` | CC BY-NC-ND 4.0, site-wide on aph.gov.au (PHOTOS.md:13,106-107) | Centre-square crop nudged up 10 %, then resized to 200x200 (`scripts/backfill_photos_oa.py:29`; PHOTOS.md:76-77). The script's docstring says the earlier set from the APH image API has the same 200x200 centre-square form (`backfill_photos_oa.py:2`) | The crop arguably makes the file an adaptation of no-derivatives material. Resizing alone would not | Shown: the website's files as they are, with the "Official portrait" credit and licence link (interim decision) | **OPEN RISK, blocker B8**, on the website today as well. Fix before submission: resized-only files from uncropped originals, or permission from the Parliament. Not resolved by decision 13 or the interim decision |
| Wikimedia Commons, the file named by Wikidata for the member | 298 `wd-` keys | Per file, from `credits.json`: CC BY-SA (2.0 to 4.0, including 2.5 and 3.0 AU) 167, CC BY (1.0 to 4.0, including 3.0 AU) 98, CC0 19, public domain 10, GFDL 1.2 2, "copyrighted free use" 2. None is no-derivatives | Face-aware square crop (2.6 times the largest face), resized to 200x200 (`scripts/recrop_commons_portraits.py:54-59`; PHOTOS.md:95-100) | An adaptation, which these licences allow only on their conditions: attribution, an indication that the work was changed, share-alike for BY-SA, and the licence text for GFDL. BY-SA crops are offered under the same licence, with the `credits.json` entry as the notice (PHOTOS.md:108-113) | Planned for build 3, after the portraits merge and gate: every Commons file, including the two GFDL and two free-use files the integration pin leaves out, as the website shows them. The profile credit gives author, licence and links to the licence and file page, with no crop notice and no GFDL text (`ios/portraits`: `selectors.ts:239-255`, `Person.tsx:224-267`) | Display: Jake's interim decision. **Licence compliance OPEN**, inside blocker B5 (below) |

Points to carry with the APH options:

- **The resized-only fix needs app changes too.** The portraits lane accepts only 200x200 files (`portrait-policy.ts:39-40` on `ios/portraits`), and it draws every portrait inside a circle that clips the square's corners (`mobile/src/design/people.tsx:45-59` there: `borderRadius` with `overflow: 'hidden'`). A resized-only official portrait is not square, so the size check and the circle both have to change for it to be shown whole. Whether a circular mask on a no-derivatives image counts as an alteration is a question for whoever advises on the rights; showing official portraits uncropped avoids it.
- **The portraits lane already shows official portraits.** At `9bfa6825` the lane marks both sources `website-file` and shows official portraits with the "Official portrait" credit (`selectors.ts:226-235` there). That matches the interim decision, so no by-source switch is needed; the integration pin does not show them until the lane merges and passes the gate.
- **The permission route.** Written permission from the Parliament of Australia to show the cropped files would cover the website as well as the app; record its terms in PHOTOS.md and the credit if it is granted.
- **The originals.** Regenerating under (b) needs the uncropped originals, which are probably on the desktop PC (not reachable on 5 October); OpenAustralia has been behind a Cloudflare challenge since at least 12 September 2026 (PHOTOS.md:23-24).

**Commons compliance is open, not a follow-up.** The Commons licences allow the crops only on conditions the app and the website do not yet meet, so these items sit in the submission rights gate (blocker B5):

1. **GFDL 1.2 (2 files).** Sections 2 and 4 require copies and modified versions to carry a copy of the licence. The profile credit shows a licence link, not the licence text.
2. **"Copyrighted free use" (2 files).** The terms of each file have not been checked.
3. **Crop notices on adapted CC BY and BY-SA files (265 files).** CC BY 4.0 section 3(a)(1)(B) requires indicating that the material was modified, and the earlier versions require a credit for adaptations. Neither the app's credit nor the website's says the photo is cropped.

The incoming portraits lane turns on the GFDL and free-use files that the integration pin leaves out, as the website already shows them, under Jake's interim decision. That decision is recorded as it stands; compliance stays OPEN until each item is fixed, for example by showing the GFDL text or leaving those two files out, checking or dropping the two free-use files, and adding "cropped" to the Commons credit.

**Data and code.** The data licences are in section 2.2. Hansard and the House and Senate registers carry non-commercial, no-derivatives terms; Queensland's register has no verified licence; machine summaries of explanatory memoranda and briefs of speeches may count as adaptations; the code is AGPL-3.0. The app is free, with no advertising or purchases. These stay with gap B5 until Jake confirms decision 13 covers them. The app bundles no parliament logo, crest or party logo (`mobile/assets` holds only the icon and fonts), and the icon is a gold map of Australia on navy (`mobile/assets/icon/icon.png`).

## 4. Privacy nutrition label draft

### 4.1 The answer is PENDING on P5 and P6

**"Data Not Collected" cannot be asserted yet.** The app's own code adds no SDK or identifier and stores only on the device, and tracking is "No". Whether the label can say "Data Not Collected" depends on what OPAX's servers keep, which only Jake can confirm: placeholder P5 (Workers Logs in the live account: whether they are on, how long entries are kept, and whether entries hold the IP address or another request identifier) and P6 (how long Cloudflare's security and traffic analytics keep IP addresses). The repository shows transport and configuration only: the app puts catalog search words in the URL (`mobile/src/api/client.ts:124-131`, `mobile/src/api/policy.ts:45-77`) and the Worker's configuration turns Workers Logs on (`portal/wrangler.jsonc:32-35`). Neither proves what the live account retains.

Apple defines collection as "transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time", and lists "an authentication token or IP address ... sent on a server call and not retained" as not collected ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/)).

| Jake's answer | What it means for the label |
| --- | --- |
| P5: Worker log entries for `/api/search-all` are kept beyond the request with their URL | Declare **Search History**, App Functionality, not used for tracking. Linked to the user if the entries also hold the IP address or another identifier |
| P5: no Worker logs are kept for these requests, or the query string is not kept | No Search History from this path. The IP question below still stands |
| P5 or P6: IP addresses are kept beyond the request | Apple has no IP data type and says to "declare the relevant data types based on how you use IP address". Jake decides, with advice if needed, which use applies (security only, or diagnostics, location or another type) and declares accordingly |
| P5 and P6 both clear: nothing kept beyond the request, or kept only in a way Jake confirms needs no declaration | "Data Not Collected" |

Stopping query-string logging on `/api/search-all` would remove the Search History question, but not the IP questions, so on its own it does not establish "Data Not Collected".

### 4.2 What leaves the phone, checked against the code

| Path | What is sent | Kept by OPAX or a partner? | Label consequence | Evidence |
| --- | --- | --- | --- | --- |
| Public catalogs and portraits | GET of allow-listed static files and `/photos/<id>.webp` from `https://opax.com.au`, with the IP address and the User-Agent `OPAX-iOS/<version> (<build>)` | Expected, from the asset routing configuration, to be served as static assets without reaching the Worker or its logs; not checked against the live account. Cloudflare's security and traffic analytics see the IP (P6) | PENDING P6 (section 4.1) | `mobile/src/api/policy.ts:4-17`; `mobile/src/api/portrait-policy.ts:3-6`; `mobile/src/api/client.ts:126-131`; `portal/wrangler.jsonc:15` (`run_worker_first` lists `/api/*`, not catalog files) |
| Catalog search | `GET /api/search-all?q=<words>&kind=<person, interest, pay or expense>` | Handled by the Worker. Its configuration turns Workers Logs on at a 100 % sampling rate, and the privacy page draft says entries record the URL, which carries the search words. Whether that holds in the live account, how long entries are kept (Cloudflare documents 3 days on Workers Free and 7 on Workers Paid) and whether they hold the IP are Jake's facts (P5) | **PENDING P5** (section 4.1): Search History if the URL is kept beyond the request | `mobile/src/api/policy.ts:2,44-77`; `portal/wrangler.jsonc:32-35` (`head_sampling_rate: 1`); the privacy page draft: "Each log entry records the address requested, which for a search includes the search words" |
| Search words to other services | None. Catalog kinds stay on OPAX's server and never reach Progress or a model | No | None | Never-call rule, IOS-APP.md section 2; the privacy page draft's "Questions and searches"; `policy.ts:49-77` refuses `all` and `bill` |
| `/api/person-slugs`, `/api/app/v1/edition/latest` | GET with no user input | The URL carries nothing about the reader; any log entry may still hold the IP or other request details (P5) | PENDING P5 and P6, for the IP only | `policy.ts:22,80-88` |
| IP address on each request | Read by Cloudflare's per-address rate limiters over 60-second windows; may appear in Workers Logs (P5) and security analytics (P6) | Rate limiter counts cover 60-second windows; what logs and analytics keep is unconfirmed | **PENDING P5, P6** (section 4.1) | Privacy page draft, "Reading the record"; IOS-APP.md section 6 |
| Seat choice | Nothing; a file in the app's documents | On device only | None | `mobile/src/features/your-mp/choice-store.ts:3-17` |
| Offline cache | Nothing; responses saved in the app's cache directory, at most 12 MB. The portraits lane also keeps the website's portrait files, unaltered, in a cache of its own | On device only | None | `mobile/src/api/disk-store.ts:15`; `mobile/src/api/cache.ts:43`; `mobile/src/api/portrait-disk-store.ts` on `ios/portraits` |
| Search results | Nothing further; kept in memory for the session | Not saved | None | `cache.ts:134` (`memoryOnly`); About `:305-308` |
| Share | The system share sheet gets a canonical URL and a title built on the phone; no page or image fetch | No | None | `mobile/src/navigation/share.ts:17-38` |
| opax.com.au pages | Opened in Safari, outside the app | The website's own analytics apply to Safari, as for any visit | None for the app. Apple's web-view rule covers web traffic inside the app | `external.ts:317-329` (`Linking.openURL`) |
| Source records | Opened in an in-app Safari view on the source's own site | Third-party sites the reader navigates to | None: Apple exempts "enabling the user to navigate the open web" | `external.ts:266-293`; see risk R6 |
| Crash reports, analytics, SDKs | None from OPAX. Eight shipped frameworks and no analytics or crash-reporting SDK. Apple's own diagnostics are Apple's to disclose | No | None | `verify-ios-release.py:29-36,266-270,487-492`. In the build 2 archive, the app's privacy manifest and the seven SDK manifests each declare no collected data types and `NSPrivacyTracking` false |
| Credentials | None. Public requests omit credentials and refuse redirects | No | None | `client.ts:126-127` |
| Permissions | None. The build has no purpose strings, so it cannot ask for the microphone, location, contacts or photos | No | None | `verify-ios-release.py:423` |

### 4.3 Answers in App Store Connect

| Question | Draft answer | Status |
| --- | --- | --- |
| Do you or your third-party partners collect data from this app? | Only "No" ("Data Not Collected") if P5 and P6 both come back clear; otherwise the types section 4.1 gives | PENDING P5 and P6 |
| If P5 shows URLs with search words are kept: Search History | Collected; App Functionality; linked if log entries hold the IP or another identifier; not used for tracking | PENDING P5 |
| If P5 or P6 shows IP addresses are kept | The type that matches how OPAX uses them, as Jake decides | PENDING P5 and P6 |
| Tracking | No; no App Tracking Transparency prompt | Ready |
| Privacy policy URL | `https://opax.com.au/privacy` | PENDING deployment of the privacy page (section 4.5) |
| Privacy choices URL | Empty; optional | Ready |

If Search History is declared, add the same type to the app's privacy manifest through `ios.privacyManifests` in `mobile/app.config.ts`, so the manifest and the label agree (gap N2).

### 4.4 The privacy placeholders this label depends on

The privacy page draft carries 16 placeholders, P1 to P16, listed in `docs/PRIVACY.md` on branch `web/privacy-app` at `89781797`. That branch is not on the public remote yet.

| Placeholder | What it decides for v1 | Status |
| --- | --- | --- |
| P5, Workers Logs retention and whether entries hold IP addresses | Search History, and whether it is linked | PENDING |
| P6, how long Cloudflare security and traffic analytics keep IP addresses | Whether retained IPs need declaring | PENDING |
| P1, P2, P3 (publication date, responsible person or organisation, private contact) | The privacy policy's validity under 5.1.1(i), and its match with the App Store seller | PENDING |
| P4, P7 to P13, P15, P16 | Website, account and voice facts. They do not change the v1 label, but the deploy guard refuses to publish the page while any remains, so they block the privacy policy URL | PENDING |
| P14, minimum age for accounts and voice | Not used by v1; feeds the age rating when voice ships | PENDING |

### 4.5 Privacy policy link: in App Store Connect and in the app

- **App Store Connect**: `https://opax.com.au/privacy`. Live today: 404. The page is drafted and approved on `web/privacy-app` at `89781797`, and a guard (`scripts/check_privacy_placeholders.mjs`) blocks `npm run deploy` while any placeholder remains.
- **In the app**: About and sources has a "Privacy policy" link (`About.tsx:312-316`) to `/community?view=privacy`. Live today, that is the community page's "Account privacy" view, which predates the app. On `web/privacy-app` that address hands over to `/privacy`, so the link works once the page deploys, but it should point at `/privacy` directly.
- **In-app privacy text** (`About.tsx:302-310`) says "IP log retention is not yet confirmed" and "Voice uses an email address, member ID, audio and words". The first is pending text and the second describes a feature this build lacks; both go when P5 is answered and voice ships (gap B3).

### 4.6 After voice ships

Sign-in and voice add Email Address, User ID, Audio Data, Other User Content and usage data (voice minutes and times), all linked, App Functionality only, no tracking, as set out in [IOS-UX.md, section 8](IOS-UX.md#8-app-store-and-policy-notes) and [IOS-VOICE.md, section 6](IOS-VOICE.md#6-store-and-privacy-notes). The label and the privacy manifest change in the same release as the feature.

## 5. Screenshot plan

No captures in this pass. Captures happen on simulators the OPAX orchestrator assigns, after the QA gate passes a build that contains the portraits lane (build 3 or 4). Frames show portraits, and screenshots must match the app (guideline 2.3), so captures from a build without portraits would have to be redone, as would any frame showing an official portrait once B8 changes those files.

### 5.1 Required sizes

From [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications), read on 5 October 2026:

- **6.9" display**, portrait, one of 1320 x 2868, 1290 x 2796 or 1260 x 2736 pixels. Capture at **1320 x 2868** on the iPhone 17 Pro Max simulator, the project's large reference device (IOS-APP.md section 8).
- **6.5" display** (1284 x 2778 or 1242 x 2688) is "Required if app runs on iPhone and screenshots for 6.9" display aren't provided". With 6.9" provided, it is not needed; smaller iPhone sizes are scaled from the larger set.
- **No iPad set**: the app is iPhone only (`supportsTablet: false`, `app.config.ts:63`).
- One to ten screenshots, JPEG or PNG, no alpha channel.

### 5.2 Capture rules

- **Build.** A production-variant build, so no Development section or fixture origin can appear. An e2e build with a pinned snapshot is acceptable for frames that never open the Account sheet, which shows a "Development" section outside production (`ComingSoon.tsx:53-63`).
- **Device state.** Light appearance (the app is light only, `app.config.ts:52`), default text size, language and region English (Australia), status bar overridden to 9:41 with full signal and battery.
- **Neutrality.** Frames 2 to 4 use two sitting members from different parties, neither a party leader nor a minister, and no frame shows a block that reads as a verdict on a person. Choose frames whose senator lists and party splits include Labor, the Coalition and the crossbench, following the balance rule in IOS-UX.md section 6.
- **Portraits.** Frames may show portraits, as the planned build 3 will after the portraits merge and gate. **Submission-time question for Jake:** whether official (APH) portraits appear in the store screenshots themselves. Guideline 2.3.9 makes the developer responsible for the rights in screenshots, the files are CC BY-NC-ND crops (B8), and a product page is promotion, not the record. If B8 is fixed with resized-only files, any frame showing an official portrait has to be recaptured anyway, because the portrait will change.
  - **Primary plan:** portraits as the build shows them, official ones included, with a credit line outside the device image for each portrait in view: "Official portrait, Parliament of Australia, CC BY-NC-ND 4.0" or "Photo: [author], [licence], via Wikimedia Commons".
  - **Commons alternative:** no frame depends on an official portrait. Frames 1, 2 and 8 use members whose portrait is a Wikimedia Commons file under CC BY, CC BY-SA, CC0 or public domain (not GFDL or "copyrighted free use"), with the same credit line; frame 4 is scrolled past the portrait; any other official portrait in view (a senator in frame 1, a search result in frame 8) is avoided by choosing the seat or query. Federal members with a `wd-` key in `photos/people.json`, mostly members first elected in 2025, have Commons portraits (PHOTOS.md:14); most sitting federal members have official ones.
- **Rights and audience.** No member who has died. No coat of arms, crest or party logo (the app bundles none: `mobile/assets` holds only the icon and fonts). Guideline 2.3.8 asks for 4+ suitable screenshots, so no bill about crime, firearms or gambling appears in a frame.
- **Captions** sit above the device image in Public Sans, plain sentence case, no claims beyond what the frame shows (guideline 2.3.3 allows text overlays).

### 5.3 Frames

| # | Screen | Data state | Caption (words) | Journey or fixture |
| --- | --- | --- | --- | --- |
| 1 | Your MP, seat chosen | A federal House seat with its member and that state's senators from several parties, portraits as the build shows them (Commons alternative: a member with a Commons portrait and no official portrait in view); the Change seat button visible | Find your MP and senators (5) | `.maestro/07-your-mp.yaml`, with the seat chosen under the neutrality and portrait rules |
| 2 | Member profile, top | Member A, with a portrait and its credit line under the frame (Commons alternative: a Commons portrait): name, party label, seat, as-at line, voting record with recorded divisions, ayes and noes | A member’s recorded votes (4) | `.maestro/08-profile.yaml` |
| 3 | Member profile, declared interests | Member A: declared interests counts and Declared ties with source footer | Declared interests from the registers (5) | `.maestro/08-profile.yaml`, scrolled to `person-interests` |
| 4 | Member profile, pay and expenses | Member B (another party), scrolled so no portrait is in view: Pay for the posts held and Claimed expenses by year, as-at lines visible | Pay and expenses, as reported (5) | `.maestro/08-profile.yaml` with member B |
| 5 | Bills list | Latest activity first, one filter chip applied, count line visible | Follow federal bills (3) | `.maestro/10-bills.yaml` |
| 6 | Bill detail, divisions | A passed bill on an uncontroversial subject, with a division and party splits expanded; machine summary label visible above or in a second take | Divisions and party splits (4) | `.maestro/11-bill-detail.yaml`, with a bill chosen under the rights and audience rule (its current fixture is a gambling bill) |
| 7 | Electorate | Representatives, an election with candidates expanded, Census context heading | Electorates, elections and Census (4) | `.maestro/09-electorate.yaml` |
| 8 | Search results (optional) | People kind, a common surname with results from several parties; portraits or blank circles as the build shows them, with credit lines for any Commons portrait in view | Search people, interests, pay (4) | `.maestro/12-search.yaml` |

Today is left out because its daily edition changes every day and some editions compare parties. Frames 5 to 7 have no portrait in view unless the build draws one in a row; if it does, the portrait rules apply.

## 6. Gap list

Ranked: **blocker** (submission should not go ahead), **risk** (could draw a rejection or a later problem), **nice-to-have**. Each row says what the app does today.

### Blockers

| ID | Guideline | Gap and what the app does today | Evidence | Fix |
| --- | --- | --- | --- | --- |
| B1 | 1.5, 2.1(a); decision 12 | No contact or support page. The app's About screen says "A corrections and contact address will be added here when it is confirmed." The live About page says "OPAX has no dedicated inbox" and points to GitHub issues. `/support` and `/contact` return 404 | `About.tsx:295-300`; live `/about` | Publish a monitored contact address and `/support` (section 1.2); put the address in About's "Corrections and contact"; use the page as the support URL |
| B2 | 5.1.1(i) | No privacy policy at the URL the listing needs. `/privacy` returns 404; the draft cannot deploy until its 16 placeholders are filled. The app links to `/community?view=privacy`, the older account privacy view | `About.tsx:312-316`; section 4.5 | Fill P1 to P16, deploy the page, enter `https://opax.com.au/privacy` in App Store Connect, change the app link to `/privacy` |
| B3 | 2.1(a) ("placeholder text ... should be scrubbed"), 2.3.1(a), 2.3 | Production builds show a Talk button on every tab's root screen that opens "Talk to OPAX is not in this version of the app yet", and an Account sheet that says "Signing in is not in this version of the app yet". About's privacy text describes voice data the build does not collect and says IP retention "is not yet confirmed" | `mobile/src/navigation/chrome.ts:47-65` (not gated by build variant), applied to the four root screens in `mobile/src/app/(tabs)/(today,your-mp,bills,search)/_layout.tsx:18-35`; `ComingSoon.tsx:14,33`; `About.tsx:295-310` | In production builds, hide Talk until voice ships and present the Account button as About; remove the pending sentences. The voice module itself is already excluded from production (`withVoiceAutolinking.js:17`). The voice and account lanes keep these same placeholders as their production twins (`mobile/src/features/account/entry.production.tsx` on `ios/account-ui`; `TalkScreen.production.tsx` in the uncommitted `ios/talk-sheet` worktree), so the fix has to land separately |
| B4 | 5.1.1, 2.3 (privacy information is metadata); decision 14 | The App Privacy answers cannot be final. The app puts catalog search words in the URL and the Worker's configuration turns Workers Logs on, but what the live account keeps (search words, IP addresses) and for how long is unconfirmed. The repository proves configuration, not retention | Section 4.1; `mobile/src/api/policy.ts:45-77`; `portal/wrangler.jsonc:32-35` | Jake answers P5 and P6; the label follows the table in section 4.1. "Data Not Collected" only if both come back clear. Stopping query-string logging alone removes the Search History question but not the IP questions |
| B5 | 5.2, 5.2.1, 5.2.2; content rights; decision 13 | The submission rights gate. Content rights cannot be asserted yet. (1) Decision 13 was decided for portraits on 5 October 2026 (section 3.4), but it also covered the data licences for app distribution and the AGPL question, which the decision as relayed does not mention: Hansard and the House and Senate registers carry non-commercial, no-derivatives terms; Queensland's register has no verified licence; machine summaries of explanatory memoranda and briefs of speeches may count as adaptations; the code is AGPL-3.0. (2) Commons portrait compliance is OPEN: the GFDL licence copy, the unchecked "copyrighted free use" terms and the missing crop notices (section 3.4). The app is free, with no ads or purchases, and bundles no parliament logo or crest | Section 3.4; `About.tsx:203-285`; `mobile/assets` (icon and fonts only); on `ios/portraits`: `selectors.ts:239-255`, `Person.tsx:224-267` | Jake confirms that decision 13 covers the data licences and the AGPL question, or settles them; the Commons items are fixed; then answer content rights (section 3.3). The official portrait crops are a separate blocker (B8) |
| B6 | 2.1(a) ("all necessary metadata"), 2.3 | App Store Connect metadata is empty: subtitle, description, keywords, support URL, privacy policy URL, copyright, categories, age rating, content rights, App Review contact and notes, screenshots | App Store Connect read, 5 October 2026 | Enter sections 1 to 3 once B1, B2 and B5 settle; capture section 5 after the build 3 gate |
| B7 | Build selection | The App Store version in App Store Connect is 1.0; the app's version is 0.1.0. App Store Connect files builds under their version number and asks you to choose from the builds uploaded for the version, so a 0.1.0 build is not expected to be offered for version 1.0 (section 8) | `mobile/app.config.ts:49`; IOS-RELEASE.md; App Store Connect read | Choose the release version. Recommended: build the submission as 1.0.0 (app config and release tooling). Guideline 2.2 does not forbid a 0.1.0 version, but it keeps betas off the App Store, and a 1.0 release avoids reading as one. The alternative is to rename the App Store version to 0.1.0 |
| B8 | 5.2, 5.2.1; 2.3.9; decision 13 | Official portrait licensing. Official parliamentary portraits are CC BY-NC-ND 4.0, and all 551 website files are centre-square crops resized to 200x200: a crop is arguably an adaptation, which no-derivatives terms do not allow. This applies to the website today too. Jake's interim decision is to ship the website's files for now and fix the licensing later; they are planned for build 3, after the portraits merge and gate, and the app also clips each portrait to a circle. **Open, not resolved** | Section 3.4; `scripts/backfill_photos_oa.py:29`; PHOTOS.md:13,76-77; on `ios/portraits`: `selectors.ts:226-235`, `portrait-policy.ts:39-40`, `people.tsx:45-59` | Before App Store submission: regenerate resized-only files from uncropped originals (and change the app's 200x200 check and circular clip so they show whole), or obtain the Parliament's permission for the cropped files. Fixing it on the website fixes the source for both |

### Risks

| ID | Guideline | Gap and what the app does today | Evidence | Fix |
| --- | --- | --- | --- | --- |
| R1 | 5.1.1(viii) ("compile personal information ... even public databases") | The largest review risk; the guideline states no exception for office holders. Native profiles exist only for roster parliamentarians; other names open on opax.com.au. Person search is served from compiled catalog shards: `/api/search-all` calls `searchCatalog`, which reads the shards, and the build script makes one person row for each entry in `parliamentarians.json`, 1,557 rows in the current manifest. Those entries are speech-derived from parliamentary chambers and Senate committees. 414 are surname-only, and 63 appear only in Senate committee Hansard, so whether every row is a parliamentarian is unverified. The app shows the rows it gets back without filtering them to the verified roster. Electorate pages list the candidates in each election record with their votes, as the electoral commission publishes them. Register entries can name family members, shown under the member | `Person.tsx:150-151`; `Search.tsx:396-410`; `mobile/src/features/search/navigation.ts:9-14`; `portal/src/index.ts:475-501` (`searchCatalog` at :495); `portal/src/catalog-search.ts:45-50`; `scripts/build_search_catalog.mjs:45-46`; `portal/public/search-catalog/manifest.json` (person: 1,557); `Electorate.tsx:195-235` | Explain scope in the review notes (done in section 2.1). Check the surname-only and committee-only rows, or filter person results to verified roster identities in the app. Keep candidates as published results with no profile or link |
| R2 | 4.2, 4.2.2 | Low to medium. The app is native: saved seat, offline reading, native profiles, bills, electorates, search, share, Dynamic Type. Some blocks hand off to the website: speeches, party receipts, non-roster people, the daily edition's page. Each hand-off is labelled "Opens on opax.com.au" | `mobile/src/design/record.tsx:120-136`; `external.ts:317-329` | Keep hand-offs labelled; the review notes list the native features. P1 work (record reader, speeches) reduces hand-offs |
| R3 | 2.3.6; age rating | "Unrestricted web access" answered No. A reviewer could read the in-app Safari view, which lets the reader follow links onward from a source page, as web access; that answer alone would make the rating 16+ | `external.ts:266-293` | Keep the No answer with this reasoning. If App Review disagrees, open source links in Safari, as opax.com.au links already are |
| R4 | 1.1.1, 1.1.6 (political content) | Low. The app states facts with sources and dates, labels machine text, calls patterns "leads, not findings" and has no score. The daily edition is text OPAX publishes, shown frozen as posted; some editions compare parties (the 5 October 2026 edition shares grant dollars by party holding the seat), in the balanced Labor, Coalition, crossbench order. Bill titles are official names, including politically worded ones | `Today.tsx:112-114`; `mobile/src/features/EditionCard.tsx:30-35`; IOS-UX.md section 6 | Keep the caveats visible; the corrections route from B1 serves complaints |
| R5 | 2.4.1 | The app is iPhone only. App Review can run iPhone apps on iPad in compatibility mode, and App Store Connect has availability settings for offering iPhone apps on Apple silicon Macs and Apple Vision Pro | `app.config.ts:63` | Run the release build once on an iPad simulator before submission; turn off Mac and Vision Pro availability unless tested |
| R6 | 5.1.1, App Privacy (web traffic) | The source-link checker accepts opax.com.au addresses, so a catalog source link on the site itself would open in the in-app Safari view and load the website's analytics inside the app. Whether any catalog row carries such a link is unverified | `external.ts:238-264` | Route opax.com.au hosts through the Safari hand-off (`openOnWeb`) in `openSource` |
| R7 | Availability; App Store Connect Digital Services Act field | Distribution in the European Union needs a Digital Services Act trader declaration, and a trader's contact details are shown on EU product pages. The content is Australian | App Store Connect help, [app information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information) | Recommended: make v1 available in Australia only. Otherwise answer the trader question |

### Not applicable to this build, and when they start to apply

| Guideline | Today | When it applies |
| --- | --- | --- |
| 1.2 User-generated content | No community features in the app | If community content is shown in the app (P2 in IOS-APP.md section 3) |
| 4.7 Chatbots; decision 11 | No voice in the build | When voice ships. Ask App Review first; if 4.7 applies, filtering, reporting, blocking, consent in each instance, an index with universal links (W17 moves into v1) and an age restriction follow |
| 5.1.1(v) Account deletion | No sign-in in the build, so no accounts are created | When sign-in ships. Deletion must be in the app; the Worker's deletion route is in IOS-APP.md section 6 and W5 |
| 5.1.2 Data use and sharing | The app passes no personal data to third parties, and catalog searches reach OPAX's servers only. Requests run through Cloudflare, OPAX's host; what its logs and analytics keep is PENDING P5 and P6 (section 4.1) | When voice ships: the third-party AI consent step before the first call (IOS-APP.md section 6) |

### Nice-to-have

| ID | Item | Today | Fix |
| --- | --- | --- | --- |
| N1 | Notice about people who have died (decision 15) | Not in the app or the listing. The app shows names of former members and Commons portraits | Add the notice to About and the description's last paragraph (section 1.1) |
| N2 | Privacy manifest matches the label | Build 2's manifest declares no collected data | If Search History is declared (B4), declare it in `ios.privacyManifests` too |
| N3 | Accessibility Nutrition Labels | Optional in App Store Connect | Fill after the AX5 release gate passes, from its evidence |
| N4 | Marketing page | None | `/app` page as in section 1.2 |
| N5 | Promotional text | Not set | Can change without a new build; use it for coverage news, such as a new state roster |

### Decisions 11 to 15 at a glance

| Decision (IOS-APP.md section 11) | Where it lands here |
| --- | --- |
| 11, guideline 4.7 | Not applicable until voice ships (table above) |
| 12, support URL and contact | Blocker B1 |
| 13, rights review | Decided for portraits on 5 October 2026, with an interim decision to ship the website's portraits (section 3.4). Blocker B8 until the official portrait licensing is fixed; blocker B5 until Jake confirms decision 13 covers the data licences and the AGPL question |
| 14, privacy label inputs | Blocker B4; section 4 |
| 15, notice about people who have died | Nice-to-have N1; description (section 1.1) |

## 7. Needs Jake

Only Jake can give these. Specifics are kept outside the repository.

1. The contact details to publish for support, corrections and privacy requests, and who answers them (B1, B2).
2. The responsible entity: the seller and copyright name, the privacy policy's owner, and the App Review contact person (sections 1, 2.1, 4.4).
3. The facts behind the privacy page placeholders, first the log and analytics retention ones (P5, P6) that decide the label, then the rest so the page can deploy (B2, B4).
4. Approval to deploy the privacy page and a support page on opax.com.au, and the production-build change that hides the voice and sign-in placeholders (B1 to B3).
5. Confirmation that decision 13 also covers the data licences and the AGPL question, or a decision on them (B5).
6. Official parliamentary portraits: the interim decision is recorded (ship the website's files for now). Before submission, the fix: resized-only files from uncropped originals, which needs the originals and the app changes in section 3.4, or permission from the Parliament. Also whether official portraits appear in the store screenshots (section 5.2), (B8). Commons compliance: how to meet the GFDL licence-copy condition (show the text or leave the two files out), whether the two "copyrighted free use" files can stay, and approval to add "cropped" to the Commons credit (B5).
7. The release version number for the App Store (B7).
8. The age rating: confirm 13+, changed from 9+ because the rendered bill summaries and notes refer to smoking, vaping, drinking and drug use (section 3.1).
9. Availability: Australia only, or wider with the trader declaration (R7).
10. Whether to add the notice about people who have died, and its wording (N1).
11. Final choices: subtitle, secondary category.
12. Only if voice ships (section 9): approval of the consent step, the microphone purpose string and decision 5; how App Review gets a sign-in code for a demo account; decision 11.

## 8. Claims not verified in this pass

- **Build selection rule (B7).** Apple's help files builds "by version number" and says to choose a build "from those you've uploaded for the version"; it does not state the matching rule in so many words. The 1.0 and 0.1.0 values are as read.
- **Person search results (R1).** Whether any of the 1,557 person rows, in particular the 414 surname-only and 63 committee-only rows, is someone other than a parliamentarian. Counts are from the repository's `parliamentarians.json` and search manifest; no production search was run.
- **opax.com.au source links (R6).** Whether any catalog row's source link points at opax.com.au.
- **Workers Logs and analytics retention (P5, P6).** From the privacy page draft and Cloudflare's documented plan limits, not OPAX's account settings.
- **Unrestricted web access (R3).** How App Review reads the in-app Safari view.
- **Age rating.** The 13+ result is read from Apple's published table; App Store Connect computes the real one. Title and rendered-text counts come from the repository copies, not the live files, and word matching can miss or overcount references.
- **Support page contact requirements.** Which of address, email and phone Australian law requires is a legal question.
- **Screens on a device.** No simulator or device run was made in this pass; walkthrough steps come from the code and the Maestro journeys.
- **Interim decision wording.** Jake's interim decision is quoted as relayed by the OPAX orchestrator; I did not see it first-hand. The relay describes the official files as face-cropped; the script shows a centre-square crop nudged up 10 %, not a face-detected one, which is the wording used here.
- **The first 201 official portraits.** That they were cropped like the rest rests on the backfill script's docstring and the orchestrator's check of the 551 files; the script that made them was not read.
- **Circular display.** Whether clipping a no-derivatives image to a circle counts as an alteration is a legal question.
- **Voice and account labels (section 9).** Account labels are from `ios/account-ui` at `cf720317`; Talk labels are from uncommitted work on `ios/talk-sheet` and from IOS-UX.md 4.10 to 4.12, and may change.
- **App Privacy answers already in App Store Connect.** Not readable through the API.

## 9. If voice ships: conditional variant (not v1)

**Everything in this section is conditional.** It applies only to a later release that adds Talk to OPAX and Account, and only after Jake approves the consent step, the microphone purpose string and decision 5 (account deletion policy), with decision 8 (provider settings), decision 11 (guideline 4.7) and the privacy placeholders P10 to P14 settled. Until then none of it goes into App Store Connect, and sections 1 to 8 stand as written.

The lanes are `ios/talk-sheet` (voice sheet; uncommitted on 5 October 2026) and `ios/account-ui` (`cf720317`: sign-in by emailed code, sign-out, deletion). Both build for development and e2e only, and production resolves the existing placeholders instead (`mobile/src/features/account/entry.production.tsx` and `mobile/scripts/production-block-list.json` on `ios/account-ui`).

### 9.1 Listing deltas

| Field | Change | Count |
| --- | --- | --- |
| Subtitle, keywords | No change | 29 of 30; 95 of 100 bytes |
| Promotional text | Replace with: "Find your MP and senators and see their votes, declared interests, pay and expenses. Follow federal bills, or ask OPAX about the public record by voice." | 152 of 170 |
| Description | Add the paragraph below after "Search", and replace the last line with "Reading needs no account. The app has no advertising, in-app purchases or analytics." | 2,879 of 4,000; 3,003 with the decision 15 notice |

```text
Talk to OPAX
Ask about the public record by voice and hear answers with links to the records they draw on. Voice needs a free OPAX account, which you can delete in the app. A free account includes 10 minutes of voice time in total. Before your first call, OPAX asks your permission to send your voice and the words of the conversation to ElevenLabs, its third-party voice provider. Answers may be mistaken: check the linked records.
```

Evidence: the assistant answers from the public record and cites sources (IOS-APP.md section 1); 600 seconds per ordinary account (IOS-APP.md section 5); consent before the first call, ElevenLabs as the receiver, and the disclosure line "Answers may be mistaken; check the linked records" (IOS-UX.md 4.10); deletion in the app (`mobile/src/features/account/copy.ts` on `ios/account-ui`, "Delete account").

### 9.2 Review note additions

For the voice release, edit the v1 notes in section 2.1 as follows, then add the block below after the walkthrough:

1. Replace the first paragraph with: "OPAX is a free reader for the public record of Australian politics. Reading needs no account; only Talk to OPAX, a voice assistant, needs sign-in (demo account below). No in-app purchases, advertising, analytics or tracking."
2. In the second paragraph, replace "It has no sign-in and no account features." with "Only Talk to OPAX needs an account."
3. In "Machine-written text", replace ", and it makes no AI or model requests." with ". Reading makes no AI or model requests; Talk to OPAX is the one AI feature."
4. Replace "Walkthrough (about three minutes, no account):" with "Reading walkthrough (no account):"
5. Drop walkthrough steps 6 (source links) and 7 (offline).

The notes then come to 3,820 bytes of the 4,000 allowed, leaving 180 bytes for the four bracketed items, which need Jake. If the filled text runs over, shorten the "Content" paragraph's last sentence first.

```text
Talk to OPAX (voice): tap Talk (waveform icon) at the top right of a tab's first screen.
1. "Sign in to talk for free": enter the demo email, tap "Send code", enter the 8-digit code [delivery route], tap "Sign in".
2. One-time consent: voice and the conversation's words go to ElevenLabs, a third-party AI provider. Tap "Agree and start" ("Not now" uses no time).
3. Allow the microphone.
4. Tap "Start talking" and ask, for example, "Who represents Grayndler?" Captions and Sources appear; "Type instead" sends text. Tap "End call".
5. Deletion: person icon, "Delete account", then the deletion code emailed to the account. The app signs out.
Demo account: [email], [n] minutes; deleting it ends the demo: [reset arrangement].
The app connects through OPAX's relay to an ElevenLabs conversation, which runs the voice agent; OPAX's servers supply the record lookups and keep call time. [4.7 statement, per decision 11.]
```

Labels come from `copy.ts` on `ios/account-ui` ("Sign in for voice", "Send code", "Sign in", "Delete account", "8-digit deletion code") and from IOS-UX.md 4.10 to 4.12 and the uncommitted `ios/talk-sheet` work ("Sign in to talk for free", "Agree and start", "Not now", "Start talking", "End call", "Type instead"). Recheck them against the build being submitted.

**Microphone purpose string** (`NSMicrophoneUsageDescription`, draft in the privacy page notes at `89781797`; adopt only once P10 is confirmed): "OPAX uses the microphone only during a voice call you start. Your speech is sent to ElevenLabs, OPAX's voice provider, to understand and answer you. OPAX keeps no recordings."

**Account deletion, guideline 5.1.1(v).** "If your app supports account creation, you must also offer account deletion within the app." The account lane's flow: "Delete account", a screen listing what is deleted and what is kept, an emailed eight-digit deletion code, then "Account deleted" and signed out (`copy.ts` on `ios/account-ui`). What is kept (voice time records without a member link, other members' replies) follows decision 5, which is still Jake's.

### 9.3 Privacy label changes

From [IOS-VOICE.md, section 6](IOS-VOICE.md#6-store-and-privacy-notes) and the privacy page draft. "Data Not Collected" no longer applies.

**Who does what in a call.** ElevenLabs runs the conversation: speech recognition, the language model and the spoken replies. OPAX runs the relay the app connects through, the tools that look up records, and the time accounting. The Worker fetches a signed ElevenLabs URL and opens the upstream conversation itself, so the app never talks to ElevenLabs directly (IOS-VOICE.md:59-68; `portal/src/voice.ts:178-203`).

| Apple data type | Collected | Linked | Tracking | Purpose | Why |
| --- | --- | --- | --- | --- | --- |
| Contact Info: Email Address | Yes | Yes | No | App Functionality | Sign-in by emailed code; stored with the account |
| Identifiers: User ID | Yes | Yes | No | App Functionality | Member ID on sessions and voice rows |
| User Content: Audio Data | Yes, provisionally | Yes | No | App Functionality | The voice leaves the phone during a call and passes through OPAX's relay to ElevenLabs, which processes it. Recording is documented as off (P10, unverified live); declaring it is the safe reading for a third-party AI |
| User Content: Other User Content | Yes | Yes | No | App Functionality | The words of the conversation, spoken or typed with "Type instead", go through the relay to ElevenLabs and the language model it runs for the agent (P11), and ElevenLabs is documented as keeping transcripts for one day (P10). The record lookups the agent asks for go to OPAX's servers. The app shows captions and does not store them |
| Usage Data: Product Interaction | Yes | Yes | No | App Functionality | Voice seconds and times, kept for the lifetime allowance |

The privacy manifest gains the matching `NSPrivacyCollectedDataType` entries. The agent's record lookups run on OPAX's servers and can reach Progress, as the privacy page draft says. The session token stays in the Keychain on the device (IOS-APP.md section 5). The logging and IP questions in section 4.1 (P5, P6) still apply.

### 9.4 Age rating and export compliance

- **Age rating: no change expected.** The questionnaire has no AI or chatbot question (IOS-VOICE.md section 6). The reader talks to an assistant, not to another user, so messaging and chat and user-generated content stay No; the agent's answers draw on the same record through OPAX's lookups, so the content answers in section 3.1 still fit. If App Review applies guideline 4.7 (decision 11), 4.7.5 requires an age restriction mechanism: revisit age assurance and the minimum age (P14) then.
- **Export compliance: no change.** The voice module uses the operating system's TLS (`URLSessionWebSocketTask`, `mobile/modules/opax-voice/ios/OpaxVoiceCore/Sources/OpaxVoiceCore/Relay.swift:54`) and the Keychain (`Credentials.swift:35-52` there), with no cryptography library. `ITSAppUsesNonExemptEncryption` stays false.

### 9.5 Voice gaps to close before that release

| ID | Gap | Fix |
| --- | --- | --- |
| V1 | Demo account (2.1(a)): sign-in codes go by email, which a reviewer cannot read | Jake picks a route: a mailbox the reviewer can open, a review account with a fixed code (a Worker change needing review and his OK), or a demo mode, which needs Apple's prior approval under 2.1(a) |
| V2 | Guideline 4.7 (decision 11) | Ask App Review first; if it applies, filtering, reporting, blocking, consent in each instance, a universal-link index (W17) and an age restriction follow |
| V3 | The purpose string is stripped and refused today | `mobile/plugins/withNetworkPolicy.js:6` deletes it and `mobile/scripts/verify-ios-release.py:423` refuses any purpose string; both change with the voice release, after Jake approves the text |
| V4 | Consent and privacy copy rest on P10 to P13 and the privacy page | Confirm the provider settings (decision 8), fill the placeholders, deploy the page |
| V5 | Deletion policy (decision 5) and the Worker's deletion and sign-in routes | Jake's decision; confirm the routes are live in production before review |
| V6 | Review traffic spends real voice time: 600 seconds per account, within a shared 40,000-second monthly budget and two concurrent calls (IOS-APP.md section 5) | Give the demo account enough time, or an operator-approved unlimited allowance |
| V7 | Screenshots and B3 | Undo the B3 placeholder fix (Talk and Account return as real features) and recapture any frame whose navigation bar changes; consider a Talk frame |
