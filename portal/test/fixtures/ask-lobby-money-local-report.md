# Local Ask industry money regression

Baseline commit: `37815b310b322d4709a31c338b269a479f5e3101`.

All Asks ran in the local, hermetic research-loop harness. No production requests or model-provider calls were made. The before arm uses the original compiled engine and deliberately replays the reported money claim supported by speech counts. Speech counts are seeded test evidence, not fresh corpus measurements. Only the exact gambling question has a user-supplied observed production answer. The other before answers are adversarial fixture outputs. The after arm uses actual routing and the local published AEC money graph, generated 18 October 2026. The topic answer remains a seeded speech fixture.

The existing serial Ask gate and research eval harness each ran all six questions. The gate went from 1 pass and 5 failures to 6 passes, with no errors. The research harness also passed all six answers. Tests additionally exercise the actual Worker JSON and streaming endpoints with the network disabled.

Run the regression with `node --test portal/test/ask-claim-measures.test.mjs portal/test/ask-lobby-money.test.mjs`. The local adapter and adversarial model output are in `portal/test/ask-lobby-money-harness.mjs`. Raw gate and research reports are under `portal/private/ask-lobby-money-local/`.

The requested donations-only and complete associated-entity totals cannot be calculated from this graph. It contains mixed receipts and excludes associated entities without a canonical party recipient. Answers explicitly retain these limits. Banks have no separate industry label; their records are offered individually within the broader finance grouping.

## Who takes the most money from the gambling lobby?

Before (fail, replay):

Labor takes the most money from the gambling lobby, with 682 chamber speeches labelled gambling, ahead of the Liberal Party's 617 and Justin Field's 87.

After (pass, local):

Labor received the most disclosed receipts from donors OPAX groups under gambling in this published selection: $10,763,834, across financial years 1998–99 to 2025–26.

Liberal received $9,024,407 in disclosed receipts from the same selected donors over those financial years.

Nationals received $1,558,802 in disclosed receipts from the same selected donors over those financial years.

LNP received $530,324 in disclosed receipts from the same selected donors over those financial years.

One Nation received $3,000 in disclosed receipts from the same selected donors over those financial years.

These federal totals mix donations with other receipts such as loans, so this is not a donation ranking. AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. These mixed disclosed receipts cannot establish a donations-only total. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded, so this is not a complete party-and-associated-entity total. These are not personal payments to MPs. Amounts are in Australian dollars and are not adjusted for inflation.

Cited local money-map records:

- [Labor: $10,763,834 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=gambling&party=party%3ALabor)
- [Liberal: $9,024,407 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=gambling&party=party%3ALiberal)
- [Nationals: $1,558,802 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=gambling&party=party%3ANationals)
- [LNP: $530,324 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=gambling&party=party%3ALNP)
- [One Nation: $3,000 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=gambling&party=party%3AOne+Nation)

## Which party gets the most money from mining companies?

Before (fail, replay):

Labor takes the most money from the mining lobby, with 682 chamber speeches labelled mining, ahead of the Liberal Party's 617 and Justin Field's 87.

After (pass, local):

United Australia Party received the most disclosed receipts from donors OPAX groups under mining in this published selection: $155,465,435, across financial years 1998–99 to 2025–26.

Liberal received $17,280,120 in disclosed receipts from the same selected donors over those financial years.

Labor received $7,611,596 in disclosed receipts from the same selected donors over those financial years.

Nationals received $4,589,204 in disclosed receipts from the same selected donors over those financial years.

LNP received $4,091,841 in disclosed receipts from the same selected donors over those financial years.

These federal totals mix donations with other receipts such as loans, so this is not a donation ranking. AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. These mixed disclosed receipts cannot establish a donations-only total. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded, so this is not a complete party-and-associated-entity total. These are not personal payments to MPs. Amounts are in Australian dollars and are not adjusted for inflation.

Cited local money-map records:

- [United Australia Party: $155,465,435 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=mining&party=party%3AUnited+Australia+Party)
- [Liberal: $17,280,120 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=mining&party=party%3ALiberal)
- [Labor: $7,611,596 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=mining&party=party%3ALabor)
- [Nationals: $4,589,204 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=mining&party=party%3ANationals)
- [LNP: $4,091,841 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=mining&party=party%3ALNP)

## How much have the banks donated to the Liberals?

Before (fail, replay):

Labor takes the most money from the finance lobby, with 682 chamber speeches labelled finance, ahead of the Liberal Party's 617 and Justin Field's 87.

After (pass, local):

OPAX cannot establish a banks-only donation total from its published industry labels. Its finance grouping includes organisations beyond banks. The closest available records are disclosed receipts from these named sources in that broader grouping.

Westpac Banking Corporation to Liberal: $40,608,922 in disclosed receipts, financial years 1998–99 to 2024–25.

National Australia Bank to Liberal: $20,896,422 in disclosed receipts, financial years 1998–99 to 2024–25.

Commonwealth Bank of Australia to Liberal: $1,425,897 in disclosed receipts, financial years 1998–99 to 2024–25.

ANZ Banking Group Limited to Liberal: $4,214,751 in disclosed receipts, financial years 1998–99 to 2024–25.

Deutsche Bank AG to Liberal: $1,100,475 in disclosed receipts, financial years 1998–99 to 2018–19.

AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. These mixed disclosed receipts cannot establish a donations-only total. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded, so this is not a complete party-and-associated-entity total. These are not personal payments to MPs.

Cited local money-map records:

- [Westpac Banking Corporation: selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&party=party%3ALiberal&focus=donor%3Awestpac+banking+corporation)
- [National Australia Bank: selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&party=party%3ALiberal&focus=donor%3Anational+australia+bank)
- [Commonwealth Bank of Australia: selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&party=party%3ALiberal&focus=donor%3Acommonwealth+bank+of+australia)
- [ANZ Banking Group Limited: selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&party=party%3ALiberal&focus=donor%3Aaustralia+and+new+zealand+banking+group)
- [Deutsche Bank AG: selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&party=party%3ALiberal&focus=donor%3Adeutsche+bank+ag)

## Who receives the most union money?

Before (fail, replay):

Labor takes the most money from the unions lobby, with 682 chamber speeches labelled unions, ahead of the Liberal Party's 617 and Justin Field's 87.

After (pass, local):

Labor received the most disclosed receipts from donors OPAX groups under unions in this published selection: $247,398,401, across financial years 1998–99 to 2025–26.

Greens received $5,859,446 in disclosed receipts from the same selected donors over those financial years.

Katter's Australian Party received $960,000 in disclosed receipts from the same selected donors over those financial years.

LNP received $6,600 in disclosed receipts from the same selected donors over those financial years.

Nationals received $3,210 in disclosed receipts from the same selected donors over those financial years.

These federal totals mix donations with other receipts such as loans, so this is not a donation ranking. AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. These mixed disclosed receipts cannot establish a donations-only total. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded, so this is not a complete party-and-associated-entity total. These are not personal payments to MPs. Amounts are in Australian dollars and are not adjusted for inflation.

Cited local money-map records:

- [Labor: $247,398,401 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=unions&party=party%3ALabor)
- [Greens: $5,859,446 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=unions&party=party%3AGreens)
- [Katter's Australian Party: $960,000 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=unions&party=party%3AKatter%27s+Australian+Party)
- [LNP: $6,600 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=unions&party=party%3ALNP)
- [Nationals: $3,210 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=unions&party=party%3ANationals)

## Who takes money from the tobacco lobby?

Before (fail, replay):

Labor takes the most money from the tobacco lobby, with 682 chamber speeches labelled tobacco, ahead of the Liberal Party's 617 and Justin Field's 87.

After (pass, local):

Liberal received the most disclosed receipts from donors OPAX groups under tobacco in this published selection: $4,342,665, across financial years 1998–99 to 2024–25.

Nationals received $1,474,277 in disclosed receipts from the same selected donors over those financial years.

Labor received $1,132,205 in disclosed receipts from the same selected donors over those financial years.

LNP received $20,725 in disclosed receipts from the same selected donors over those financial years.

These federal totals mix donations with other receipts such as loans, so this is not a donation ranking. AEC disclosure thresholds apply and vary by financial year; amounts below the applicable threshold may not be individually disclosed. OPAX applies industry labels to named donors; a label does not establish coordinated lobbying or influence. AEC "Other receipts" are not donations. These mixed disclosed receipts cannot establish a donations-only total. Coverage is limited to the published map selection. Receipts of associated entities without a canonical party recipient are excluded, so this is not a complete party-and-associated-entity total. These are not personal payments to MPs. Amounts are in Australian dollars and are not adjusted for inflation.

Cited local money-map records:

- [Liberal: $4,342,665 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=tobacco&party=party%3ALiberal)
- [Nationals: $1,474,277 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=tobacco&party=party%3ANationals)
- [Labor: $1,132,205 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=tobacco&party=party%3ALabor)
- [LNP: $20,725 in selected disclosed receipts](https://opax.com.au/money?jur=federal&type=receipts&industry=tobacco&party=party%3ALNP)

## Who talks about gambling the most?

Before (pass, replay):

Labor MPs gave the most speeches labelled gambling, with 682 chamber speeches, ahead of Liberal MPs with 617 and Justin Field with 87.

After (pass, local):

Labor MPs gave the most speeches labelled gambling, with 682 chamber speeches, ahead of Liberal MPs with 617 and Justin Field with 87.

Cited speech evidence: seeded local counts.
