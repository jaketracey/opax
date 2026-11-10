# Local Ask industry money regression, fix round 2

Branch: `fix/ask-lobby-money`. Round-one baseline: `610e91e44`.

This report supersedes the round-one after answers. The published industry flows cannot establish donation totals, so the five financial questions now return `evidence_gap`, lead with the mixed receipt measure and link to the selected map and named sources without amounts or recipient rankings. The speech-count guard remains in place and the speech question retains its seeded speech answer.

All evaluation Asks are hermetic local runs through the actual research-loop routing with the local published graph (generated 18 October 2026). No production Asks or model-provider calls were made. Before below means the captured round-one local payload, regraded against the new requirements; it is not a new production observation. The topic counts are seeded fixture evidence, not measured corpus counts. The serial gate rejects all five round-one financial answers and passes the speech answer (1 pass, 5 failures); the corrected answers pass 6/6 in both the serial gate and research eval.

## Receipt type and return-side audit

- `portal/public/graph/money.json`: 400 donor nodes and 1,159 edges (including grants and contracts). Donor-to-party edges publish only source, target, total, count, first/last year, byYear and optional undated cells. There is no receipt type or return side on a flow. Node return references say AEC annual/election return, rather than party-return receipt versus donor-return donation made. The graph's historic metadata calls these donations, but that is not type evidence.
- `portal/public/graph/donor-disclosures.json` and `donor-index.json`: donor identity, mixed aggregates and return references; no typed donor-to-party donation series. `campaigners.json` has entity-wide returns rather than donor-to-party transactions.
- `portal/public/graph/aec-extras.json`: `meta.year_columns.parties.returns` identifies separate itemised donations, other receipts and public funding in each party-year row. These are totals across all sources, with no donor or industry attribution. The creditor records are debt balances, not donation or new-loan amounts. Neither can be used to derive donations from banks or an industry. The published graph also cannot isolate subscription/affiliation fees. `scripts/export_aec_extras.py` explicitly excludes donor and MP returns from both the extras and campaigners exports, so its ingested `total_donations_made` is not published here.
- `parli/ingest/donations.py`, `load_annual_detailed_receipts` and `load_annual_donations_made`: both write `aec_annual` rows via the same insert, which omits Receipt Type and return side. Donations Made rows are donations by definition in the AEC source, but the published graph cannot recover which amounts came from those rows.
- `scripts/export_money_graph.py`: aggregates the donations table into donor-party-year cells without type or side. The map builder (`portal/graph/index.ts`, bundled by `portal/graph/build.mjs`) and public money modules consume those aggregate cells; they cannot restore lost receipt types. `portal/src/tools/money-totals.ts` explicitly returns mixed disclosed receipts and has no donation-only switch. This industry route never calls that tool or exposes its totals.
- Read `/Users/jake/Projects/opax-ios-wt/_data-cleanup-20261110-findings/FIX-BRIEF.md` and the money-donations discovery and verification findings. Verified finding 003 reports Westpac at $105.8m on the map against $1.86m of party-return donations and $79.8m of Other Receipt. Finding 002 also confirms overlap between party and donor returns. A mixed total cannot become a donation amount through relabelling or a trailing caveat.

The fallback follows rule 3 of this fix request. No published money dataset was edited or regenerated. Local search, crawl and table test assets were rebuilt for the full portal gates; generated catalogue manifest churn is excluded from the commit. No donor-only, party-only or affiliation amounts are invented. Named sources are alphabetical, not ordered by mixed receipt amounts. Bank-name matches remain explicitly within the broader finance grouping, which includes organisations beyond banks.

## Verification

The regression covers all six requested prompts, named Westpac donation questions, a synthetic loan-sized mixed aggregate carrying an AEC donor return reference, union affiliation wording, retained party/year filters, unknown scope, the final claim-measure guard, and actual Worker JSON/SSE endpoints for all five financial prompts with outbound networking disabled. Eval constraints forbid monetary figures from these untyped records and enforce the measure in the first sentence, including for declines. Mutation tests restore bank amounts (also present in the receipt evidence) or move the measure caveat later and require a failed grade.

Run `node --test portal/test/ask-claim-measures.test.mjs portal/test/ask-lobby-money.test.mjs`. Focused result: 20 passed, zero failures. With the existing party-routing and voice-money regression files, 115 passed, zero failures. Serial gate: 6/6. Research eval: 6/6. Raw local before/after payloads and grades: `portal/private/ask-lobby-money-local/round2/`; final after-answers and research grades: `round2/final/`.

Full portal gates passed on the final code:

- `npm run build:search`: built local search, crawl, hub and table test assets.
- `WRANGLER_SEND_METRICS=false npm run check`: passed, including Worker types, TypeScript, tokens, stamps, donor index and statute-title freshness.
- `npm test`: 4,425 passed, zero failures, zero skips. Final log: `/tmp/ask-lobby-money-round2-portal-test-final.log`.
- `WRANGLER_SEND_METRICS=false ./node_modules/.bin/wrangler deploy --dry-run --outdir /tmp/ask-lobby-money-round2-worker-final`: passed; no upload. Log: `/tmp/ask-lobby-money-round2-dry-run-final.log`.

The generated search manifest is restored before commit. The published money graph, AEC extras, donor disclosures and campaigners datasets remain unchanged. No push, deployment or production Ask was performed.

## Who takes the most money from the gambling lobby?

Before, round-one local (fail under the corrected eval):

Labor received the most disclosed receipts from donors OPAX groups under gambling in this published selection: $10,763,834, across financial years 1998–99 to 2025–26.

Liberal received $9,024,407 in disclosed receipts from the same selected donors over those financial years.

Nationals received $1,558,802 in disclosed receipts from the same selected donors over those financial years.

LNP received $530,324 in disclosed receipts from the same selected donors over those financial years.

One Nation received $3,000 in disclosed receipts from the same selected donors over those financial years.

These federal totals mix donations with other receipts such as loans, so this is not a donation ranking. AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. These mixed disclosed receipts cannot establish a donations-only total. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded, so this is not a complete party-and-associated-entity total. These are not personal payments to MPs. Amounts are in Australian dollars and are not adjusted for inflation.

After (pass, local; status `evidence_gap`):

OPAX's industry figures currently combine donations with loans and other receipts, so it cannot yet say who received the most gambling donations. The published graph does not identify receipt types or distinguish party returns from donor-side donations made, so no donation amounts or rankings are shown. Matching mixed receipts span financial years 1998–99 to 2025–26; that is not a donation period total.

Explore the [money map filtered to gambling](https://opax.com.au/money?jur=federal&type=receipts&industry=gambling). Named sources OPAX groups under gambling to inspect, listed alphabetically without amounts:

[Clubs NSW](https://opax.com.au/money?jur=federal&type=receipts&industry=gambling&focus=donor%3Aclubs+nsw)

[Crown Castle Australia](https://opax.com.au/money?jur=federal&type=receipts&industry=gambling&focus=donor%3Acrown+castle+australia)

[Crown Resorts Limited](https://opax.com.au/money?jur=federal&type=receipts&industry=gambling&focus=donor%3Acrown+resorts)

[Registered Clubs Association of NSW (t/as ClubsNSW)](https://opax.com.au/money?jur=federal&type=receipts&industry=gambling&focus=donor%3Aregistered+clubs+association+of+nsw)

[Responsible Wagering Australia](https://opax.com.au/money?jur=federal&type=receipts&industry=gambling&focus=donor%3Aresponsible+wagering+australia)

AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded. The map cannot establish personal payments to MPs.

## Which party gets the most money from mining companies?

Before, round-one local (fail under the corrected eval):

United Australia Party received the most disclosed receipts from donors OPAX groups under mining in this published selection: $155,465,435, across financial years 1998–99 to 2025–26.

Liberal received $17,280,120 in disclosed receipts from the same selected donors over those financial years.

Labor received $7,611,596 in disclosed receipts from the same selected donors over those financial years.

Nationals received $4,589,204 in disclosed receipts from the same selected donors over those financial years.

LNP received $4,091,841 in disclosed receipts from the same selected donors over those financial years.

These federal totals mix donations with other receipts such as loans, so this is not a donation ranking. AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. These mixed disclosed receipts cannot establish a donations-only total. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded, so this is not a complete party-and-associated-entity total. These are not personal payments to MPs. Amounts are in Australian dollars and are not adjusted for inflation.

After (pass, local; status `evidence_gap`):

OPAX's industry figures currently combine donations with loans and other receipts, so it cannot yet say who received the most mining donations. The published graph does not identify receipt types or distinguish party returns from donor-side donations made, so no donation amounts or rankings are shown. Matching mixed receipts span financial years 1998–99 to 2025–26; that is not a donation period total.

Explore the [money map filtered to mining](https://opax.com.au/money?jur=federal&type=receipts&industry=mining). Named sources OPAX groups under mining to inspect, listed alphabetically without amounts:

[Adani Mining Pty Ltd](https://opax.com.au/money?jur=federal&type=receipts&industry=mining&focus=donor%3Aadani+mining)

[Aus Gold Mining Group Pty Ltd](https://opax.com.au/money?jur=federal&type=receipts&industry=mining&focus=donor%3Aaus+gold+mining+group)

[Australian Gypsum Industries](https://opax.com.au/money?jur=federal&type=receipts&industry=mining&focus=donor%3Aaustralian+gypsum+industries)

[BlueScope Steel Ltd](https://opax.com.au/money?jur=federal&type=receipts&industry=mining&focus=donor%3Abluescope+steel)

[Boral Limited](https://opax.com.au/money?jur=federal&type=receipts&industry=mining&focus=donor%3Aboral)

AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded. The map cannot establish personal payments to MPs.

## How much have the banks donated to the Liberals?

Before, round-one local (fail under the corrected eval):

OPAX cannot establish a banks-only donation total from its published industry labels. Its finance grouping includes organisations beyond banks. The closest available records are disclosed receipts from these named sources in that broader grouping.

Westpac Banking Corporation to Liberal: $40,608,922 in disclosed receipts, financial years 1998–99 to 2024–25.

National Australia Bank to Liberal: $20,896,422 in disclosed receipts, financial years 1998–99 to 2024–25.

Commonwealth Bank of Australia to Liberal: $1,425,897 in disclosed receipts, financial years 1998–99 to 2024–25.

ANZ Banking Group Limited to Liberal: $4,214,751 in disclosed receipts, financial years 1998–99 to 2024–25.

Deutsche Bank AG to Liberal: $1,100,475 in disclosed receipts, financial years 1998–99 to 2018–19.

AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. These mixed disclosed receipts cannot establish a donations-only total. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded, so this is not a complete party-and-associated-entity total. These are not personal payments to MPs.

After (pass, local; status `evidence_gap`):

OPAX's bank figures currently combine donations with loans and other receipts, so it cannot yet establish a banks-only donation total to Liberal. The published graph does not identify receipt types or distinguish party returns from donor-side donations made, so no donation amounts or rankings are shown. Its finance grouping includes organisations beyond banks. Matching mixed receipts span financial years 1998–99 to 2024–25; that is not a donation period total.

Explore the [money map filtered to finance](https://opax.com.au/money?jur=federal&type=receipts&industry=finance&party=party%3ALiberal). Named sources to inspect, listed alphabetically without amounts:

[Adelaide Bank](https://opax.com.au/money?jur=federal&type=receipts&industry=finance&party=party%3ALiberal&focus=donor%3Aadelaide+bank)

[ANZ Banking Group Limited](https://opax.com.au/money?jur=federal&type=receipts&industry=finance&party=party%3ALiberal&focus=donor%3Aaustralia+and+new+zealand+banking+group)

[Australian Banking Association Limited](https://opax.com.au/money?jur=federal&type=receipts&industry=finance&party=party%3ALiberal&focus=donor%3Aaustralian+banking+association)

[Bendigo & Adelaide Bank Limited](https://opax.com.au/money?jur=federal&type=receipts&industry=finance&party=party%3ALiberal&focus=donor%3Abendigo+and+adelaide+bank)

[Commonwealth Bank of Australia](https://opax.com.au/money?jur=federal&type=receipts&industry=finance&party=party%3ALiberal&focus=donor%3Acommonwealth+bank+of+australia)

[Deutsche Bank AG](https://opax.com.au/money?jur=federal&type=receipts&industry=finance&party=party%3ALiberal&focus=donor%3Adeutsche+bank+ag)

[National Australia Bank](https://opax.com.au/money?jur=federal&type=receipts&industry=finance&party=party%3ALiberal&focus=donor%3Anational+australia+bank)

[Westpac Banking Corporation](https://opax.com.au/money?jur=federal&type=receipts&industry=finance&party=party%3ALiberal&focus=donor%3Awestpac+banking+corporation)

AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded. The map cannot establish personal payments to MPs.

## Who receives the most union money?

Before, round-one local (fail under the corrected eval):

Labor received the most disclosed receipts from donors OPAX groups under unions in this published selection: $247,398,401, across financial years 1998–99 to 2025–26.

Greens received $5,859,446 in disclosed receipts from the same selected donors over those financial years.

Katter's Australian Party received $960,000 in disclosed receipts from the same selected donors over those financial years.

LNP received $6,600 in disclosed receipts from the same selected donors over those financial years.

Nationals received $3,210 in disclosed receipts from the same selected donors over those financial years.

These federal totals mix donations with other receipts such as loans, so this is not a donation ranking. AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. These mixed disclosed receipts cannot establish a donations-only total. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded, so this is not a complete party-and-associated-entity total. These are not personal payments to MPs. Amounts are in Australian dollars and are not adjusted for inflation.

After (pass, local; status `evidence_gap`):

OPAX's industry figures currently combine donations with loans and other receipts, so it cannot yet say who received the most union donations. The published graph does not identify receipt types or distinguish party returns from donor-side donations made, so no donation amounts or rankings are shown. This graph also cannot separate union affiliation fees from donations. Matching mixed receipts span financial years 1998–99 to 2025–26; that is not a donation period total.

Explore the [money map filtered to unions](https://opax.com.au/money?jur=federal&type=receipts&industry=unions). Named sources OPAX groups under unions to inspect, listed alphabetically without amounts:

[ALH&MW Union](https://opax.com.au/money?jur=federal&type=receipts&industry=unions&focus=donor%3Aalh+mw+union)

[ASU Vic & Tas Auth and Services Vic  Branch](https://opax.com.au/money?jur=federal&type=receipts&industry=unions&focus=donor%3Aasu+vic+tas+auth+and+services+vic+branch)

[Asuria People Services Pty Ltd](https://opax.com.au/money?jur=federal&type=receipts&industry=unions&focus=donor%3Aasuria+people+services)

[Australasian Meat Industry Employees' Union Queensland Branch](https://opax.com.au/money?jur=federal&type=receipts&industry=unions&focus=donor%3Aaustralasian+meat+industry+employees+union)

[Australian Manufacturing Workers Union](https://opax.com.au/money?jur=federal&type=receipts&industry=unions&focus=donor%3Aaustralian+manufacturing+workers+union)

AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded. The map cannot establish personal payments to MPs.

## Who takes money from the tobacco lobby?

Before, round-one local (fail under the corrected eval):

Liberal received the most disclosed receipts from donors OPAX groups under tobacco in this published selection: $4,342,665, across financial years 1998–99 to 2024–25.

Nationals received $1,474,277 in disclosed receipts from the same selected donors over those financial years.

Labor received $1,132,205 in disclosed receipts from the same selected donors over those financial years.

LNP received $20,725 in disclosed receipts from the same selected donors over those financial years.

These federal totals mix donations with other receipts such as loans, so this is not a donation ranking. AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. These mixed disclosed receipts cannot establish a donations-only total. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded, so this is not a complete party-and-associated-entity total. These are not personal payments to MPs. Amounts are in Australian dollars and are not adjusted for inflation.

After (pass, local; status `evidence_gap`):

OPAX's industry figures currently combine donations with loans and other receipts, so it cannot yet say who received the most tobacco donations. The published graph does not identify receipt types or distinguish party returns from donor-side donations made, so no donation amounts or rankings are shown. Matching mixed receipts span financial years 1998–99 to 2024–25; that is not a donation period total.

Explore the [money map filtered to tobacco](https://opax.com.au/money?jur=federal&type=receipts&industry=tobacco). Named sources OPAX groups under tobacco to inspect, listed alphabetically without amounts:

[British American Tobacco Australia Limited](https://opax.com.au/money?jur=federal&type=receipts&industry=tobacco&focus=donor%3Abritish+american+tobacco+australia)

[Philip Morris Limited](https://opax.com.au/money?jur=federal&type=receipts&industry=tobacco&focus=donor%3Aphilip+morris)

AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded. The map cannot establish personal payments to MPs.

## Who talks about gambling the most?

Before, round-one local (pass under the corrected eval):

Labor MPs gave the most speeches labelled gambling, with 682 chamber speeches, ahead of Liberal MPs with 617 and Justin Field with 87.

After (pass, local; status `answer`):

Labor MPs gave the most speeches labelled gambling, with 682 chamber speeches, ahead of Liberal MPs with 617 and Justin Field with 87.
