# Ask stand-in sweep

Ask's "Try asking" shows one starter. When a seat is saved but its member is
not yet known, the row's box is held at the height of its tallest candidate,
so nothing moves when the member's question arrives. Two of those candidates
are questions about stand-in names (`SIZING_MEMBERS` in
`src/features/ask/AskIdle.tsx`), which are never seen. This sweep checks that
they hold the box for every real member.

Run it again whenever a stand-in name, the question's wording or the row's
type changes, and after an election or a by-election changes the roster.

## What it does

For every verified current member of the House it lays out "What has
{member} said in parliament this year?" in the system font, at each body text
size from Large to AX5 (17 to 53 pt) and each row width from 200 to 330 pt,
the way the row does: a word breaks at spaces and hyphens, and the type steps
down until its widest part fits the line. It does the same for the stand-in
names.

**Worst margin** is the smallest value, over every size and width, of the
tallest stand-in question's height less the tallest real question's height.
Zero means the box exactly fits the tallest real question somewhere; a
negative margin means some member's question is taller than the box, so the
box would grow after it is first drawn. The sweep exits 1 on a negative
margin.

It is a model, not the app: it has not been checked against a device, and it
ignores the general starter, which can only make the box taller.

## Run it (a Mac with Xcode's command line tools)

From `mobile/`:

```sh
out=$(mktemp -d)
xcrun swiftc -O scripts/ask-standin-sweep/wrap.swift -o "$out/wrap"
python3 scripts/ask-standin-sweep/sweep.py --wrap "$out/wrap"
```

It takes about a minute and prints one summary:

```
150 verified House names; stand-ins ['Alexandrina Wetherington', 'Annabelle Margaret Lee-Ray']
594 size and width combinations
worst margin 0.0 pt: at 17 pt text, 200 pt wide, the box is 66.0 pt and the question about Zoe McKenzie is 66.0 pt
```

To try other names before changing the app, pass
`--standins 'First Name|Second Name'`.

## What it reads

The roster only, and it writes nothing:

- `electorates/manifest.json`, and the release's index and people files it
  names, under a `portal/public` folder. By default that is this
  repository's `portal/public`.
- The stand-in names, from `src/features/ask/AskIdle.tsx`.

To sweep the live site's roster, download those three files from
opax.com.au into a scratch folder with the same paths and pass it with
`--public <folder>`. Do not commit a copy of the data, or the built `wrap`
binary.
