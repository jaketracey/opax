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
