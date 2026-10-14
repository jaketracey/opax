# Tasmania and ACT bill registries

Snapshot: **14 October 2026 Sydney / UTC**. Branch `coverage/bills-tas-act` was
created from `origin/main` (`738392374d15a3a611796862b105973725427716`). No production
DB/KB writes, push or deploy. Local public assets are generated only by the
reviewed offline promoter; nightly validates and tracks each jurisdiction
independently after the existing exports.

| Parliament | Registry entries staged | Published Parliament/Assembly | Dated events | Document-link rows |
| --- | ---: | --- | ---: | ---: |
| Tasmania | 157 | 52: 77; 51: 80 | 1,323 | 703 |
| ACT | 262 | 11: 79; 10: 183 | 933 | 1,804 |

These are bill registry entries, event rows and link rows at different grains.
Document links can repeat across bills; they are not counts of unique document
files or fetched bodies. Tasmania's annual indexes are 2024–2026. ACT joins the
current and previous Assembly status lists, summaries and version indexes.
The Tasmanian Parliament numbers come from the individual bill pages, rather
than an inference from introduction years. No complete historical-series claim.

Sources, retained exact snapshots, hashes and policy receipts:
[Tasmania inventory](../../../data/staged/bills-tas/inventory.json),
[Tasmania receipts](../../../data/staged/bills-tas/receipts.json),
[ACT inventory](../../../data/staged/bills-act/inventory.json),
[ACT receipts](../../../data/staged/bills-act/receipts.json).
Reproduce acquisition with `python3 -m scripts.state_bills.acquire tas` or `act`;
resume reuses retained receipts. A refusal permanently stops that staging run.
Run the offline parser with `python3 -m scripts.state_bills.stage tas` or `act`.
Fresh acquisition requires a separately reviewed staging snapshot, not silently
overwriting a reviewed run. Publisher-specific robots rules and the identifying
OPAXBot/1.0 user agent are recorded on every receipt. No PDF or Word bill body,
explanatory body or third-party submission was fetched. The two Word downloads
are the Assembly's **status registers**, retained for factual table extraction.

Tasmania's [site](https://www.parliament.tas.gov.au/) carries the Parliament's
copyright notice. No open grant was found in the site's published footer or
bill pages. ACT's [Assembly reuse policy](https://www.parliament.act.gov.au/functions/footer/reuse-policy)
is CC BY-NC-ND 4.0, with separate symbols/portraits and third-party exceptions.
Neither establishes a clear, applicable open grant for the linked bill and
explanatory bodies. **All 2,507 document-link rows remain link-only**, with held
body metadata. Source summaries, bill text, explanatory statements, clause notes,
fact sheets, amendments and related bodies are not reproduced. Public assets
contain factual registry fields and original links, with the publisher's rights
finding on each bill. No government-wide licence was substituted.

All sponsors remain unlinked. The source prints abbreviations such as `Mr Steel
(Treasurer)`, `Dr Woodruff`, or offices such as `The Treasurer`; these do not
exactly match a unique existing roster name in that jurisdiction. Three ACT
entries lack a sponsor in the exactly matched summary. No expansion, office
mapping, fuzzy person match or new person record was created.

The web surface is `/register/state-bills`, with native GET filters, pagination
and bill detail selected by stable key. It follows the reviewed state-register
pattern used by Victorian gifts. The federal bill pages also depend on federal
speech/division joins and the federal export; this factual state register can
retain differing publisher clocks and version gaps without those dependencies.
Bill fields follow the existing model: jurisdiction, source ID, Parliament,
sponsor, introduction, status, stage events and document/version links. Each bill
shows source, snapshot, licence and hashes. Document dates stay null when absent.
The [app surface is a plan only](app-plan.md).

ACT status-list dates are **1 October 2026** and **18 October 2024**, taken from
the Word register headers; the previous list's download page/file name dates to
January 2025. Acquisition is 14 October 2026. Source components disagree on three
introduction dates; the status-list date is displayed with both values in a note.
Two current appropriation bills carry notification dates later than their list
header date; these are retained with a visible note. One bill heading is repeated
in the current version index and its distinct links are combined. A reused source
ID on two prior-Assembly titles is retained with separate stable title/Assembly
keys and a warning. Reviewed spelling discrepancies are explicitly mapped by
the parser; original source labels are retained in notes. Twelve status-list
entries have no matching version-index section, and are retained with honest
missing-version notices. One entry in each jurisdiction has unknown status.
Nothing here establishes that a law has commenced.

**Acquisition pacing exception:** two early ACT discovery commands overlapped for
the unused Tenth Assembly overview and its bills-list page, starting after the
same 20-second wait. The racing overview receipt did not retain its request
timestamp; its exact unused bytes and hash remain in
[acquisition notes](../../../data/staged/bills-act/acquisition-notes.json).
The overlapping run was stopped, and a host-level file lock was added before
subsequent acquisition. All retained projection receipts record their outgoing
identity, robots policy and measured spacing. This run cannot be described as
fully compliant with the 20-second delay. No 403, challenge or reset occurred;
no bypass or alternate acquisition route was used.

The promoter reparses the retained source bytes offline, checks all receipt
hashes, reconciles counts, verifies rights findings and recomputes the exact
sponsor links. Staged input digests must match `review.json`. Extra fields,
including held text added to a reviewed bill/link, fail projection equality and
leave the existing asset untouched. Each asset includes its promotion manifest.
Votes are checked before and after promotion and against `origin/main`.

Validation and browser evidence will be recorded alongside this report after
the final gates and local promotion.
