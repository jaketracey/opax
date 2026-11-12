These 12 JSON files are copied unchanged from the portal lane's pinned responses
in `portal/test/fixtures/app-vic-election/` (API implementation `44e05438c`). The
portal captures use the real handler and frozen 12 November 2026 hub inputs.
The overview has all 88 districts and eight regions. The finder pins cover 3350,
9999, allan, Bass and St Kilda. Seat pins cover Albert Park, Bendigo West, Eureka,
Werribee and Southern Metropolitan.

`albert-park-candidates.json` is the portal's published-list test variant. Its
candidate names are invented and are not a claim that the VEC has published
candidates. Rendering tests use it to check ballot order, an independent and a
candidate without a party. The normal `albert-park.json` has `candidates: null`.
Both files are decoded, but only `<slug>.json` is served as that seat, so the
variant cannot overwrite the normal response according to directory order.

Flow 70 searches 3350 and checks Wendouree's 55% resident share, then opens
Eureka from the same results. Eureka has a pinned detail response; Wendouree
does not. Unknown seat details return 404 rather than manufacturing a record.
Tests and the offline fixture server use this same directory. The server checks
every pin with the app decoders at startup and serves the original JSON payload.
Council group metadata is covered by synthetic render and decoder tests until
the portal supplies a grouped candidate response.

Use `OPAX_FIXTURE_VIC_ELECTION=on` for flow 70. The default is `on`; `off` answers
404 `not_published`. For the withdrawal branch of the iOS flow, restart the server
with `off` and run flow 70 with `VIC_ELECTION_OFF=true`.

The iOS clock uses `OPAXVicElection=ahead|today|closed` launch arguments. Android
uses `opax:///vic-election?fixture=ahead|today|closed` in the e2e variant. Production
replaces the clock control module with an inert stub. Normal app dates use the
same Melbourne clock on both platforms.
