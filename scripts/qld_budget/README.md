# Queensland 2026–27 budget source hold

The five original CSV requests all returned 302. Four captured redirect targets
are robots-disallowed; the first Location was not captured. None was followed
or re-requested. Dataset/resource CC BY 4.0 is verified; dictionary/notes and
file-specific exceptions remain unverified. No numerical parser, public asset,
approved projection or nightly loader exists for this held source.

From the repository root, the offline audit is:

```sh
python3 -m unittest discover -s tests -p test_qld_budget.py
python3 -m scripts.qld_budget.check --dry-run
```

`acquire.py` is the retained acquisition transport for this completed run. It
uses the shared OPAXBot identity, a ten-second completion delay, robots first,
exact original links, no proxy, no automatic redirects and persistent refusal
stops. Receipts are committed; successful HTML evidence is private under
`portal/private/qld-budget/acquisition/`. Redirect/error bodies are discarded
after hashing. Do not use it to retry this run or request excluded redirects.

`check.py` is a read-only audit of the held state, not an ingest/promoter or a
green publication gate. It requires five held files, an empty series and no
public consumer. Future cleared data will require a different reviewed gate,
using the federal budget projection shapes and `scripts/promote_hub_data.py`'s
explicit annual opt-in. See `docs/coverage/qld-budget/report.md`.
