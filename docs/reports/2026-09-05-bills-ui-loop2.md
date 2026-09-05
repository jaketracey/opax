# Bills UI — loop 2 critique

Same eleven scenes, same four widths, captured after the loop 1 fixes. Nothing overflows, nothing throws, and no control on any bill page is under 44px at any width. The loop 1 changes hold: the list rows have their own meta line, the filter labels are readable at 360, the divisions are a fifth shorter and the sponsors read as people.

What loop 2 found is worse than layout. Two of the three are the page repeating the source's own defects back at a reader as if they were facts about parliament.

## The Medibank bill has eight divisions and the page showed twenty-eight

TheyVoteForYou records the same division several times. On the Medibank Private Sale Bill the third reading of 2 November 2006 appears **ten times** — once with the motion, and nine times with a question field that says, in so many words, "This division is a duplicate of a division available here." The second reading appears five times, the allotment of time six.

The page copied all twenty-eight rows out of the projection and set each one as a division. A reader scrolling that page counts ten third readings and concludes the House divided ten times on the same question in one day. It did not. Every duplicate carries the same day, the same stage and the same counts as the row it duplicates, so the grouping is exact and needs no guessing: rows identical in those four fields are one division. The one carrying the motion is kept, and the section note says how many rows were folded, because a reader comparing this page against TheyVoteForYou should be able to see why the counts differ.

Twenty-eight rows became eight. The same collapse applies on the party page, where a duplicate would otherwise count the party's vote twice.

## Nine members introduced a bill and the page named a department

Loop 1 taught the row to read `(s) WILKIE, Andrew, MP` as a sponsor. Ten bills pack co-sponsors into that same field with no separator at all:

```
(s) PHELPS, Kerryn, MPWILKIE, Andrew, MPBANDT, Adam, MPBANKS, Julia, MPSHARKIE, Rebekha, MP
```

Read by a parser expecting one name, that became "Warren Entsch MPGAMBARO, Teresa, MPBUTLER, Terri, MPFERGUSON, Laurie, MPBANDT, Adam, MPMCGOWAN, Cathy, MPWILKIE, Andrew, MP" on the face of the list — a single unreadable string where five or nine people should be. Each member is now found separately, title-cased properly (McGowan, not Mcgowan), and the bill page links each one to their own entry while the list row says "Adam Bandt MP and 2 others".

## A description is not a motion, and a stage is not nothing

Loop 1 moved editorial prose out of the heading and into a note, which left those divisions with a heading reading "Question not recorded". That is true and useless: the record does say what the division was — its stage. The stage now stands as the division's name where no motion was recorded, set in the quieter ink so it is never mistaken for the motion itself, and the prose follows as the note.

`PRES` was being drawn as a party, dot and all. It is the register's code for the presiding officer, and now says so.

## Bars that say nothing when a party casts no ayes

A party that voted 0–22 drew an aye bar of zero width. With a minimum width it read as one or two votes; without one it read as nothing at all, so the row showed a single bar and no scale. Both are wrong. Each bar now sits in its own track: an empty track is a party that cast none, and the track is what makes that visible.

## Smaller

- On the party page the question repeated the bill's title, which is already the row's link, so the useful end of it was clipped away: "…Bill 2020 - Second Reading -Agree with bill's mai…". The leading title comes off first, then the clamp, and the row reads "Second Reading - Agree with bill's main idea".
- The clamp cut mid-word. It cuts on a space.
