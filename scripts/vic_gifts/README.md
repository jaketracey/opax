# Victorian ministerial gifts staging

This lane reads public DPC HTML using the repository's identifying OPAX agent.
It writes only staged snapshots, receipts, inventory and per-period registers.
There is no KB, D1 or production publication client. Source collection stops for
the entire run on 403, authentication refusal, throttling or a challenge. The
persisted stop receipt prevents a later resume from requesting an alternate page.
Redirects are retained without following them. Repeated robots groups are combined;
disallowed document downloads are never fetched.

Start each new source audit in a fresh dated directory. Resume only the same
unfinished acquisition; cached pages retain their original dates.

```sh
python3 -m scripts.vic_gifts.acquire --out data/staged/vic-gifts-YYYY-MM-DD
python3 -m scripts.vic_gifts.stage --stage data/staged/vic-gifts-YYYY-MM-DD
python3 -m scripts.vic_gifts.stage --stage data/staged/vic-gifts --dry-run
python3 -m unittest tests.test_vic_gifts
```

The offline stage validates hashes and the source's linked website licence before
parsing tables. A narrowly scoped DGS grant, absent grant or marked exception holds
the entire period, with no row projection. Unknown table layouts likewise hold the
period. No date or amount is inferred from description text. Addresses are retained
only in the original snapshot, not in staged rows or the web projection.

Officials link only to one Victorian roster record after whitespace/case
normalisation and removal of the literal `Hon`/`The Hon` prefix. Return annotations,
duplicates, aliases, initials and nicknames never qualify. Givers are plain strings:
they are never joined to any roster or donor graph, even if their spelling matches.

The Worker expects a separately reviewed `/vic-gifts/data.json` asset. It returns
503 until that asset is loaded, and rechecks licence and row provenance at serving.
Local QA substitutes `data/staged/vic-gifts/hub.json` through an in-memory asset
binding; it does not copy candidate JSON into `portal/public`.

```sh
node scripts/vic_gifts/preview.mjs
node portal/test/vic-gifts-browser.mjs
```

The browser test blocks external requests and checks 390/1440, period totals,
official-field search, excluded giver/description search, paging, CSV receipts,
JavaScript-disabled rendering and the person section. Set
`OPAX_VIC_GIFTS_BROWSER_TOOLS` to a local Playwright installation and
`OPAX_VIC_GIFTS_PORT` to select an IPv6 preview port. Native app work is a plan only.

Future production loading belongs to the reviewed nightly path. Before promotion,
reconcile the three register counts, reject held rows, verify source/hash/licence
receipts and exact official links, and confirm `votes.json` remains byte-identical.
