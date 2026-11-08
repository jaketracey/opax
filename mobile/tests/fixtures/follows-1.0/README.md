Frozen `store.ts` (decoder and complete save path) and `two-slot.ts` from
`62d6bf44f`. Only the three relative imports in `store.ts` were relocated:
two-slot points to this frozen copy; identifier and party validation point to
the existing app modules. Do not modernise this fixture with the new store.
