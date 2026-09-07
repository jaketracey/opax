# Discovery leads

`/discover` highlights donor/supplier overlaps, party receipt concentration and supplier
concentration in the available records. It is linked from Explore and uses the
same static-data architecture as the money map. The Worker supplies route metadata
and a sitemap entry; the browser reads `/discovery.json`.

These are descriptive investigation leads, not conclusions about influence or
misconduct. Each lead includes numerical comparisons, example source records and
limitations. Pattern and name filters operate on the published lead set, not the
entire archive. Source references are examples, not all rows contributing to a sum.

## Export and release

`scripts/export_discovery.py` reads the corpus without modifying it. It applies the
current curated donation rules before comparing the sources, so known erroneous
records and non-political receipts do not become headline findings. Donation and
contract totals are aggregated independently to avoid multiplication from joins.

```bash
python3 scripts/export_discovery.py --ssh desktop --output portal/public/discovery.json
python3 -m unittest discover -s tests -p test_discovery.py -v
```

The initial production export contains 60 leads from 92,646 eligible annual AEC
party-receipt rows and 18,042 contract rows. Receipt years run from 1998–99 to
2024–25. Annual receipts are not a verified gifts-only dataset. The export includes
full coverage/exclusion counts and a timestamp; totals cover different source
periods and do not establish the order of a receipt and a contract award.

Regenerate `portal/public/discovery.json` after relevant corpus updates, inspect its
coverage and methodology, then deploy from `portal/` with `npm run deploy`. This
builds analytics and stamps the browser assets before deploying the Worker. Do not
use the obsolete Next.js/EC2 deployment configuration from earlier checkouts.

The old disconnect engine is not part of the current live portal; its historical
score table is not used by these leads and does not need recomputation for release.

## Visual comparison view

Discover opens on government suppliers. Select an agency to compare its top five
suppliers and the remainder on a common percentage scale. Sort by total value or
largest share, or search for an agency or its leading supplier. The selected
comparison and filters are preserved in the URL. On phones, the chooser scrolls
horizontally and selecting a comparison brings its chart into view.

Party funding and cross-source name overlaps are secondary views. Funding charts
use the same top-five-plus-remainder calculation; overlap amounts remain separate
money flows. An optional money-map embed matches an exact donor name from the
map's own selected set, explains its different coverage, and destroys its render
resources when closed or when the selection changes.

The chart-enabled export contains 31 concentration charts. It excludes the observed
misspelling `Electoral Comission` and the misclassified `High Court of Australia`
receipt, bringing eligible receipt rows to 92,642. This export does not change the
source database or existing money-map data. Chart periods refer to contract start
dates or full financial years; their totals include any undated records.

Frontend behavior tests: `node --test portal/test/discovery.test.mjs`.
