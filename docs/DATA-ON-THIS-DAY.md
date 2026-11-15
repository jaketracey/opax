# On this day: divisions and speeches by calendar date

`portal/public/parliament/on-this-day/MM-DD.json` lets the app show a division and a speech from the same
calendar date in an earlier year. There is one file for each of the 366 calendar dates. Each lists every
division and every speech the bill files record on that month and day, in any year, oldest first.

Nothing is chosen here. The files do not rank, score or leave out a record, and they carry no party and no
machine-written text. The app picks by date alone: when a date has several records they take turns year by
year, in the order listed.

## Source

The bill files already in this repo, `portal/public/bills/*.json` (written by `scripts/export_bills.py`):

* divisions are each bill's `divisions`, published by They Vote For You (the row's `url` is its page there);
* speeches are each bill's `speeches`, Hansard speeches on that bill, by `slug`.

No network request and no database. A division or speech recorded under several bills (a cognate debate) is
listed once, under the first of those bills in register order. A speech with no date or no speaker is left
out. A division with no key or date stops the build.

## The file

```json
{
 "schema_version": 1,
 "day": "11-15",
 "generated_at": "2026-10-04T16:27:54+00:00",
 "note": "...",
 "sources": {"divisions": {"publisher": "They Vote For You", "url": "https://theyvoteforyou.org.au/"},
             "speeches": {"publisher": "Hansard", "via": "OPAX bill records"}},
 "bills": {"au-federal-r7099": "Social Security and Other Legislation Amendment (...) Bill 2023"},
 "divisions": [{"key": "federal-representatives-8462", "date": "2023-11-15", "house": "representatives",
                "stage": "Second reading", "bill": "au-federal-r7099", "url": "https://theyvoteforyou.org.au/..."}],
 "speeches": [{"slug": "speech-269590", "date": "2013-02-13", "speaker": "...", "bill": "au-federal-r5000"}]
}
```

* `generated_at` is the bills index's own `generated_at`, so a rebuild from the same bill files is
  byte-identical.
* `bills` names each bill once (its short title when it has one).
* `stage` is the recorded stage as the bill file has it, or `null`.
* A date with no record has a file with empty lists, so a reader gets a definite answer, not a missing file.
* 29 February has its own file and matches nothing else.

Size on 15 November 2026: 366 files, 2.4 MB in total; the median file is 5 KB and the largest 31 KB before
compression. The app reads one file a day.

## Building

```sh
python scripts/build_on_this_day.py           # rebuild from portal/public/bills
python scripts/build_on_this_day.py --check   # exit 1 if the published files are stale
```

Files are replaced one at a time, atomically, and only when their text changes. `scripts/refresh_bills.sh`
rebuilds the index after the bills export. The nightly bills refresh (`scripts/vm/bills_refresh.sh`,
`scripts/vm/nightly.sh`) does not yet: until it does, the index lags the bill files by whatever the last
manual rebuild missed, which only ever means a recent record is not listed yet.

## Tests

`tests/test_on_this_day.py`, offline, with invented bills: every date has an entry, rows are oldest first,
a shared record is listed once, no party or machine text is carried, undated speeches are left out, the
check and rebuild modes, and the committed files' shape and size.

## App

The native client reads static JSON only through the allow-list in `mobile/src/api/policy.ts` (on the app
branch). The `/parliament/on-this-day/` files are added there with the app change. They are deliberately
not in the Worker manifest's `ROOTS`.
