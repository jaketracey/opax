# A note to political reporters and researchers (draft, r2)

Status: a draft for the promotion lane to fold into its own pitches. It
does not go out on its own. Nothing here has been sent and nobody has
been contacted.

It follows the angle of the pitches sent on 10 and 11 November: OPAX is a
free, open-source site over the Australian parliamentary record, built in
Melbourne. Records only: no polls, predictions or rankings. Every item
links to the official record. The offer is a same-day CSV in whatever
shape the reporter asks for.

Every URL below returned 200 without an account on 16 November 2026.
Counts are from https://opax.com.au/api/stats, read once on that day:
964,517 speeches (740,302 federal, 50,744 Victorian), 14,244 recorded
divisions and 2,994 bills. Read it again before sending and replace the
figures and the date.

## Sign-off (all variants)

Jake Tracey
OPAX (opax.com.au), Noice Pty Ltd, Melbourne
support@opax.com.au

## Authorisation line

The seat finder is electoral matter. Any message that mentions or links
to it carries this line, as the page itself does:

> Authorised by Jake Tracey, Noice Pty Ltd, Level 6, 608/343 Little
> Collins Street, Melbourne VIC 3000.

The first note and the follow-up below both carry it. The researcher
variant does not mention the election, so it does not.

## Subject lines

1. A free, searchable record of Australian parliaments, with a CSV on request
2. Hansard, divisions and bills in one place, each linked to the official record

## The note (desks not yet contacted)

Hello,

I make OPAX, a free, open-source site over the Australian parliamentary
record, built in Melbourne. It holds records only: no polls, predictions
or rankings. On 16 November it held 964,517 speeches, 14,244 recorded
divisions and 2,994 bills, and every item links to the official record.

Three things you can check in a minute:

- Search Hansard by keyword, speaker, party, state and year:
  https://opax.com.au/ask?view=search
- Federal bills, with their stages and divisions:
  https://opax.com.au/bills
- For the Victorian election on 28 November, find a seat by suburb or
  postcode: https://opax.com.au/vic-election-2026

If a table would help a story, tell me the shape and I will send a CSV
the same day. The press kit is at https://opax.com.au/press.

[Sign-off]

Authorised by Jake Tracey, Noice Pty Ltd, Level 6, 608/343 Little
Collins Street, Melbourne VIC 3000.

## The three examples, and what each page shows

Facts are as each page stated them on 16 November 2026. No donor or
donations record is used in any of them.

1. **Hansard search.** https://opax.com.au/ask?view=search
   The page is headed "Search Hansard: every parliamentary speech" and
   says speeches can be searched "by keyword, speaker, party, state,
   topic and year. Every result links to the official record." (Its own
   line still says "half a million" speeches; the stats endpoint gave
   964,517 on the day, which is the figure the note uses.)

2. **Federal bills and their divisions.** https://opax.com.au/bills
   The page reads "Australian parliamentary bills: recorded stages,
   sponsors, divisions and machine-written summaries where available.
   2,989 entries. Page 1 of 60." and lists each bill with its status, for
   example "before parliament".

3. **The Victorian seat finder.** https://opax.com.au/vic-election-2026
   The page reads "Victorians vote on Saturday 28 November", has a
   "Which seat am I in?" field for a suburb, postcode or district, lists
   the key dates, and under "Lower house: 88 districts" says "Each row
   shows the member and the winning margin at the 2022 election, in
   percentage points, unless a later by-election is named." It carries
   the authorisation line above and holds no donor records.

## Variant for researchers

Hello,

OPAX is a free, open-source site over the Australian parliamentary
record, built in Melbourne. Records only: no polls, predictions or
rankings. On 16 November it held 964,517 speeches across the federal
parliament and five states and territories, 14,244 recorded divisions
and 2,994 bills, each linked to the official record.

For research clients there are read-only MCP tools, with no account
needed. The reference is at https://opax.com.au/methods#mcp, beside the
methods and how to cite.

On reuse, the site says its code is AGPL-3.0 and that source material
keeps its publisher's terms: there is no single licence covering the
record. If a dataset would help, name its shape and I will send a CSV
the same day.

[Sign-off]

## Follow-up (state politics and data desks contacted on 10 and 11 November, no reply)

Subject: Re: [the original subject line]

Hello,

Following up my note of [10 or 11] November about OPAX, in case it is
useful before Victoria votes on 28 November. The offer stands: name a
table and I will send it as a CSV the same day, from the record only,
with each row linked to its official source.

The seat finder is at https://opax.com.au/vic-election-2026 and the
press kit at https://opax.com.au/press. No need to reply if it is not
for you.

[Sign-off]

Authorised by Jake Tracey, Noice Pty Ltd, Level 6, 608/343 Little
Collins Street, Melbourne VIC 3000.

## Where the new note goes

Desks not yet contacted. Kinds of desk and outlets only; choose the
people yourself.

- The federal press gallery bureaus
- SBS News
- Crikey
- The Conversation
- The Saturday Paper
- Regional dailies, written to directly
- Academic researchers in politics, public policy and journalism at
  universities other than ANU

The follow-up goes only to the state politics and data desks already
written to on 10 and 11 November that have not replied.

## What was left out, and why

- The donor example from the first draft is dropped. Nothing tied to
  the Victorian election uses donor or donations records.
- No claim about an app on any platform, and no mention of assistant
  directories.
- No client of the publisher is named.

## What was checked on 16 November 2026

One request each, a second apart, as `opax-improve-audit`:

- `https://opax.com.au/vic-election-2026` 200
- `https://opax.com.au/press` 200
- `https://opax.com.au/ask?view=search` 200
- `https://opax.com.au/bills` 200
- `https://opax.com.au/methods` 200, and the page has the `mcp` anchor
- `https://opax.com.au/api/stats` 200: `speech` 964,517; `division`
  14,244; `bill` 2,994; speeches by state: federal 740,302, NSW 115,308,
  Victoria 50,744, SA 37,971, Queensland 10,228, ACT 9,964
