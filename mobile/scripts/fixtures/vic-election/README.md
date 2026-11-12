These are the API spec's 12 November 2026 examples. `overview.json` deliberately
contains the four example districts and one region, rather than fabricated rows.
`find-st-kilda.json` expands the spec's two abbreviated hits into complete rows.

The integration fix round must replace the overview with the API lane's full pin
and add its seat and finder JSON responses, including postcode 3350, Wendouree,
Werribee and Southern Metropolitan. The fixture server discovers seat and finder
files by payload shape. It does not manufacture missing seat records.

Use `OPAX_FIXTURE_VIC_ELECTION=on` for flow 70. The default is `on`; `off` answers
404 `not_published`. For the withdrawal branch of the iOS flow, restart the server
with `off` and run flow 70 with `VIC_ELECTION_OFF=true`.

The iOS clock uses `OPAXVicElection=ahead|today|closed` launch arguments. Android
uses `opax:///vic-election?fixture=ahead|today|closed` in the e2e variant. Production
replaces the clock control module with an inert stub. Normal app dates use the
same Melbourne clock on both platforms.
