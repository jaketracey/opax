# App election contract fixtures

`hub-input.json` and `places-input.json` freeze the existing public hub inputs
from 12 November 2026, before candidates were loaded. Response pins are generated
through the real `appVicElection` handler from these inputs, with the clock frozen at 10 am AEDT on 12 November 2026. The response adds the election state, resolved date copy, voting and finder wording, and optional current results. These are additive fields in schema version 1; historical result fields retain their previous meaning. The candidates
variant injects invented names into the frozen hub and preserves ballot order.
`northern-metropolitan-candidates-input.json` supplies frozen invented Council
candidates for the `northern-metropolitan-candidates.json` response pin, covering
named groups, blank unnamed groups and ungrouped candidates. Region candidates
include nullable `group` and `group_name`; district candidates omit those fields.

The tests also read the current built hub and places assets for shape and page
parity checks. Those checks compare against the current inputs and do not pin
dates, speech or vote totals, candidate availability, or other nightly values.

To regenerate response pins from the committed frozen inputs, from `portal/`:

```sh
UPDATE_APP_VIC_ELECTION_FIXTURES=1 nice -n 10 /Users/jake/Projects/opax-ios/.ops/tools/jest-slot.sh node --test --test-concurrency=4 test/app-vic-election.test.mjs
```

Updating the frozen inputs is a separate, deliberate contract-fixture change.
Never copy nightly build output over them as part of a release build.
