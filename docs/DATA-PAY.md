# What parliamentarians are paid

"Between Labor and Liberal, who is the highest paid politician?" used to come back as "the
record does not establish…", because it is true: no speech says it. A salary is set by
instrument. `portal/public/pay.json` joins the instruments to the record of who held which
post, and three things read it:

* **Ask and chat** (`portal/src/ask-pay.ts`): a calculated answer with no model call, the way
  `ask-money.ts` answers from receipt edges. Rankings (all, by party, by chamber, "top 10",
  lowest), a named person, two people compared, the price of a post, the base salary.
* **The model, for everything looser** (`payEvidence()` in the same file, called from
  `retrieveAskRecords`): a misspelt name, a vague or compound question. The catalogue's word
  search cannot reach "alabesen" from "albanese", so the closest people are found by typo
  distance over the names in `pay.json` and their pay records lead the structured evidence,
  followed by the scheme's own rows (base salary steps, what each post pays, the ranking) when
  the question is about pay in general. `RECORD_GROUNDING` tells the model what a pay record
  is and to say which name it read a misspelling as. The same record text
  (`portal/src/pay-records.mjs`) goes into the public search catalogue as kind `pay`, 703
  rows, so "Find records" and the MCP see it too.
* **Person pages** (`renderPersonPay` in `portal/public/app.js`): "Pay for the posts held",
  with the rate now, an estimate per financial year and every spell.
* Anything else that wants it: the file is static and self-describing.

Federal parliament only, from **7 December 1999**.

## Two sources, joined

| What | Source | Licence |
|---|---|---|
| Who held which post, and when | Parliamentary Handbook API, `handbookapi.aph.gov.au/api/` (`ministryrecords`, `shadowministryrecords`, `individuals`, `recordsofservice` types 7, 8, 9) | CC BY-NC-ND 4.0 (APH site-wide). Facts of office and dates, attributed, served on our pages and **never loaded into the knowledge box** (same rule as the interests registers) |
| The base salary at each date | 1999–2011: Parliamentary Library, *The base salary for senators and members* (17 Aug 2012), Table 1. 2012 on: each determination on the Federal Register of Legislation | FRL CC BY 4.0; Tribunal CC BY 3.0 AU |
| What each post adds, as a percentage of base | Ministers: the Tribunal's annual *Report on Ministerial Salaries*. Everyone else: the *Members of Parliament* determination, section 11 | as above |

The registry is `scripts/pay_registry/base_salary.json` and `loadings.json`: every step and every
office carries its instrument and, where it has a history, its dates. The findings behind it
(which instrument says what, read where) were checked against the instruments themselves on
2026-09-17; the FRL ids are in the registry.

Things worth knowing before changing it:

* **Nothing has changed since 7 Dec 1999 except which offices exist.** That is the day salaries of
  office became percentages of base (Tribunal Report 99/01, Determination 1999/16); before it
  they were fixed dollar amounts, which is why the series starts there.
* Offices that arrived later: Parliamentary Secretaries paid from 10 Mar 2000; the Senate
  business-manager ministerial rows (first sighted 2004 and 2005); government deputy whip in the
  House and the more-than-ten-members party leader rate, 1 Nov 2008; **shadow ministers, 15 Mar
  2012** (25% shadow cabinet, 20% others, unpaid before); Manager of Opposition Business in the
  House, 15 Mar 2012, and in the Senate, 17 Sep 2018.
* **The Nationals leader** is "Leader of the third largest party in the House", 45%, nil for a
  Minister. The office fell out of the 2018 framework by accident and was restored in July 2026,
  read back to 21 May 2022; in between the Nationals leader was Deputy Prime Minister anyway.
* The base did not move on 1 July 2026 (0%); MPs got the 2023 rise on 1 September, not 1 July.
* One conflict between sources: the Library's 2000 research paper, written before the date,
  gives $90,000 from 1 Jul 2000; its 2012 note gives $92,000. The later one is used.

## The rules (`scripts/build_pay.py`)

For each day a person sat: the base salary in force, plus the loading of the post held.

1. **A Minister** is paid the one ministerial rate that applies, the highest, as an exact
   percentage. "Cabinet Minister" is a rank row in the Handbook; the portfolio row beside it
   supplies the title. Leader of the House, Leader of the Government in the Senate and Manager
   of Government Business in the Senate are ministerial rates only in a minister's hands.
2. **Other office holders** are paid the *sum* of their offices, rounded up to the next $10
   (the determination's own example adds a deputy whip to a committee chair).
3. **A shadow minister** is paid a flat rate *instead of* that sum, unless another office is worth
   more (the Leader of the Opposition is not paid as a shadow minister). Payment depends on the
   Opposition Leader's notice to the Clerks, which is capped and not published, so every listed
   shadow minister is assumed named and the row is marked `assumed`; answers and pages say "if
   named in the notice".
4. **Minority party leaders** turn on party size: five members makes a minority party (42.5%),
   more than ten pays 45%. Size is counted from the Handbook's dated party membership, so a
   leader's spell is cut where the party room grew or shrank (One Nation's leader starts being
   paid the day its fifth member joined). Changeovers shorter than three days are ignored.
5. Yearly figures add the days across a financial year. Nothing is adjusted for inflation.

Handbook quirks handled: open-ended roles in a ministry that has ended stop with it; "Assistant
Minister" before 21 Sep 2015 is an outer minister (Abbott's), after it a Parliamentary Secretary;
"Deputy Leader of the Opposition in the House of Representatives" is a courtesy title with no
loading; one Cabinet rank is missing (Kevin Rudd as Foreign Minister, 2010–12) and is supplied by
`cabinet_rank_missing_in_handbook`, found by checking every senior portfolio since 1999.

## What it does not cover

* **Committee chairs and deputy chairs** (3% to 16%): the Handbook API gives dates for committee
  membership but not for the chair. Every answer and page says so.
* Electorate allowance ($39,700 to $57,100), expenses (IPEA, on the page already),
  superannuation, outside income. These are salaries, and entitlements at that: not payslips.
* State parliaments; anything before 7 Dec 1999.
* People the OPAX roster lacks still get an entry (keyed by the Handbook's PHID); `pid` and the
  page link are filled where OpenAustralia's `people.csv` or an exact name ties them to us.

## Rerun

    python3 scripts/build_pay.py --refresh      # ~200 Handbook requests, a minute or two
    python3 -m unittest scripts/test_build_pay.py
    cd portal && node --test test/ask-pay.test.mjs

`npm run deploy` rebuilds the search catalogue, so the pay rows follow a rebuilt `pay.json`.
Answers to questions that mention pay carry `:pay-v1` in their cache key; bump it if the
evidence or grounding changes so cached answers written without it retire.

Rerun after a reshuffle, a leadership change, an election, a by-election or a defection, and
every July and September for the Tribunal's decisions (add the step to `base_salary.json`; add or
close a period in `loadings.json` if an office changed). The Handbook refuses clients that
identify as scripts and caps pages at 100 rows; the snapshot is cached under
`~/.cache/autoresearch/pay/`. `pay.json` is a static asset, so a rebuild ships with the next
`npm run deploy`; calculated answers are never cached, so a new file is live at once.
