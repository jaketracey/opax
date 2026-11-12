# Released interest decoder fixture

This freezes the actual iOS 1.1.3 rules from `eb6fd2dce` so portal CI does not
need the app branch or a network request to test compatibility.

`interest-decoders.ts` contains the unchanged declarations from `const tie`
through `InterestTies` in `mobile/src/api/catalog-decoders.ts`. Its imports point
to local copies of the released validation, identifier, error and donor privacy
helpers. Those four files are copied verbatim, apart from their provenance
comment. No runtime decoder is stubbed or made nullable.

The compatibility test checks every public member register, the index, recent
declarations and donor ties. It also refuses silent row quarantine and injects
null into all four holder fields to prove the frozen decoder detects the
reviewed regression. Fixtures contain decoder source; records are read from
the retained public exports.
