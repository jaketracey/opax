# App election contract fixtures

`hub-input.json` and `places-input.json` freeze the existing public hub inputs
from 12 November 2026, before candidates were loaded. Response pins are generated
through the real `appVicElection` handler from these inputs. The candidates
variant injects invented names into the frozen hub and preserves ballot order.

The tests also read the current built hub and places assets for shape and page
parity checks. Those checks compare against the current inputs and do not pin
dates, speech or vote totals, candidate availability, or other nightly values.

To regenerate response pins from the committed frozen inputs, from `portal/`:

```sh
UPDATE_APP_VIC_ELECTION_FIXTURES=1 node --test test/app-vic-election.test.mjs
```

Updating the frozen inputs is a separate, deliberate contract-fixture change.
Never copy nightly build output over them as part of a release build.
