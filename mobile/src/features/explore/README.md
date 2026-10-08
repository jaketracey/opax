# Explore

Today opens the hub. Only the selected tool mounts; the hub does no data reads.

- Quiz: 48 bundled eight-question rounds, 16 for each web deck. The checked-in
  web question engine generates them from the public static exports; prompts,
  answers and grading follow that engine. Best streaks use the device's two-slot
  store. Private donor profile links are suppressed using the existing
  organisation gate.
- Ballot: the verified 3 May 2025 federal House contest, with candidate IDs and
  original ballot positions retained. The saved seat is the default. Export
  preserves original candidate order and adds the user's preference numbers.
- Time machine: static `/years/{year}.json`, bills and 189 unchanged bundled
  photographs. It includes all years from 1998 to 2026. Photo credits and
  licences are in Sources and licences. Live headline probes and their
  per-speech generated briefs are not part of this static view.
- Tide: exactly `/api/tide?scope=federal` or `/api/tide?scope=all` on open or
  scope selection. Sorting is local.
- Debate matrix and Words per dollar: the existing `/api/matrix` action read,
  shared across both tools. Money uses the static graph export. Cells and rows
  delegate to the existing native topic screen and its action reads.

Paid reads use `getForAction`: one attempt per uncached path, session memory,
no automatic retries. A failed request can be tried again explicitly. Fixtures
are pinned to checked-in exports and never proxy the production Worker.

From `mobile/`, regenerate quiz rounds and bundled photographs with:

```sh
node scripts/generate-explore.mjs
npx prettier --write src/features/explore/Picture.tsx src/features/explore/quiz-rounds.json
```

The quiz snapshot records input SHA-256 hashes, including the web engine. Two
old web caveats predate the money export's public-money additions. Its current
methodology says top 250 donors by lifetime total plus donors below that cut
with at least $50 million in Commonwealth contracts and grants. The app uses
that methodology rather than the old top-250-only or top-400-only wording.

Then vs now stays on the web.
