# Federal sitting days

`portal/public/parliament/sitting-days.json` tells the app whether the House, the Senate or both sit on a given
day, for the line under the date on Today: "Parliament is sitting today", "The Senate is sitting today",
"Next sitting day: Monday 16 November". It is the Parliament's own published calendar, converted to dated flags.
Nothing is inferred from Hansard, divisions or past years.

## Source

The Parliament of Australia publishes one iCalendar file per year on its static host:

`https://static.aph.gov.au/-/media/05_About_Parliament/58_Sitting_Calendars/<year>/Parliamentary_Sittings_<year>.ics`

linked from the sitting calendar page (`https://www.aph.gov.au/About_Parliament/Sitting_Calendar`). The page
host refuses the OPAX agent (see [SOURCES-ACCESS.md](SOURCES-ACCESS.md)), so the builder never requests it.
`static.aph.gov.au` served the agent on 13 November 2026 (HTTP 200, the same bytes as the 10 October check
recorded in `scripts/hubs/sitting-2026.json`). On that day the 2027 file was not at the 2027 path: the host
answered with a redirect to `/Help/404`. If APH publishes it under another name, pass that URL with
`--url 2027=<url>`; it must be on `static.aph.gov.au`.

Each event's `DESCRIPTION` says which chamber sits:

| Description | House | Senate |
| --- | --- | --- |
| House of Representatives and Senate sitting days (optionally " - Federal Budget") | yes | yes |
| House of Representatives sitting days | yes | no |
| Senate sitting days | no | yes |

The `SUMMARY` must agree ("Both Houses", "House Sitting Only", "Senate Sitting Only"). Public holidays, Senate
cut-off dates and estimates hearings are not sittings and are skipped. Any other event that mentions sitting,
a timed event, a date outside the file's year or a timezone other than Australia/Sydney stops the build.
All-day events end the day before `DTEND`, as the iCalendar format defines.

## The file

```json
{
 "schema_version": 1,
 "published": "2026-11-13",
 "timezone": "Australia/Sydney",
 "coverage": {"first": "2026-01-01", "last": "2026-12-31"},
 "expires": "2026-12-31",
 "note": "...",
 "years": [
  {"year": 2026, "status": "published",
   "sitting_days": {"house": 68, "senate": 57, "either": 72},
   "source": {"publisher": "Parliament of Australia", "title": "Parliamentary Sittings 2026",
              "url": "https://static.aph.gov.au/...", "page": "https://www.aph.gov.au/About_Parliament/Sitting_Calendar",
              "published": "2026-09-14", "retrieved": "2026-11-13", "sha256": "..."}},
  {"year": 2027, "status": "not_published", "checked": "2026-11-13", "url": "https://static.aph.gov.au/..."}
 ],
 "days": [{"date": "2026-01-19", "house": true, "senate": true}, ...]
}
```

* `days` lists sitting days only, in date order. A date inside `coverage` that is not listed is a day neither
  house sits. Outside coverage, or after `expires`, sitting is unknown and the app should show no line rather
  than a guess. "Next sitting day" is the first listed date after today; if there is none before
  `coverage.last`, the next sitting is unknown.
* Coverage runs from 1 January of the current year to 31 December of the last year whose calendar is
  published, so `expires` is that 31 December. A year that is not yet published is listed with its status and
  the date it was checked, never filled in.
* `source.published` is the date (in Sydney) of the server's `Last-Modified` header for the calendar file, the
  only publication date APH exposes for it; `null` when the file was built from a saved copy.
* Dates are calendar days in Australia/Sydney.

## Building

```sh
python scripts/build_sitting_days.py                       # fetch the current and next year
python scripts/build_sitting_days.py --ics 2026=saved.ics  # use a saved copy for a year
```

Requests use the OPAX agent from `parli/ingest/user-agent.json` through `parli.ingest.http.Session`, at most one
a second, and follow no redirect. HTTP 401/403 or a challenge page pauses the source and exits 4 (the shared
refusal policy); any other unexpected status exits without writing. The builder also refuses to write when the
current year's calendar is missing, when a year parses to fewer than 20 sitting days, or when a year the
previous file published is no longer available (`--allow-shrink` overrides that last check). The file is
replaced atomically, so a failed run leaves the published one in place.

It is not scheduled. Rebuild when APH revises a calendar and once the next year's calendar
appears (usually late in the year), otherwise the Today line goes quiet from 1 January. The rebuilt file
should be checked against `scripts/hubs/sitting-2026.json` (or its successor), which drives the bills and
divisions refresh cadence; `tests/test_sitting_days.py` fails if the two disagree.

## Tests

`tests/test_sitting_days.py`, offline, with an excerpt of the 2026 calendar text in
`tests/fixtures/sitting_days/sittings_2026_excerpt.ics`: chamber flags per event type, exclusive end dates,
folded and CRLF lines, refusal of unrecognised or malformed events, coverage and expiry with one or two
published years, the shrink guard, fetch outcomes (published, not published, unexpected status), and the
committed portal file's shape and agreement with the hub calendar.

## App

The native client reads static JSON only through the allow-list in `mobile/src/api/policy.ts` (on the app
branch, not on `main`). `/parliament/sitting-days.json` must be added to `staticPaths` there before Today can
read it. It is deliberately not in the Worker manifest's `ROOTS` (`portal/src/app-manifest.ts`), which lists
the essential catalogs and fails the whole manifest if one is missing.
