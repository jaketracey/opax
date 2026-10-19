# Government advertising: app plan only

No native code, simulator, build or release work in this lane.

After source access, report-level rights and a real campaign reconciliation pass,
add a read-only Government advertising entry to the app's registers. Read the
same reviewed, promoted snapshot as the web route. Do not fetch Finance from a
device and do not create a new production API or knowledge-box write path.

The list needs financial year and entity filters, campaign search, AUD amounts,
the source's GST basis and expenditure scope. Keep categories absent when the
report did not publish them. Group totals by year, entity, expenditure scope and
GST basis; do not combine media-only totals with complete campaign costs.

Detail should show the original report URL, page/table/row reference, source
snapshot, document and transcription SHA-256s, licence URL, attribution, and the
report-total reconciliation including any published rounding allowance. Open
the original document at its publisher. Link agencies only by a unique exact
name in the existing agency directory. No private-person entities, profiles,
name-search entries or cross-record identity joins.

Until an approved snapshot exists, explain that source verification is pending;
show unknown totals rather than zero expenditure. Preserve the last approved
snapshot during a failed refresh, label its date, and distinguish an access
receipt from a report snapshot. Test Dynamic Type, VoiceOver, keyboard use,
narrow layouts, missing categories and offline viewing using synthetic agencies.

An orchestrator-reviewed contract and native navigation change are still needed.
This is not an assertion that the current iOS API allowlist or app supports the
new register.

## Victorian extension — 19 October 2026, plan only

Reuse the same `/gov-advertising/data.json` register after reviewed promotion;
there is no second state advertising register or device-side source collector.
The staged schema-2 Victorian projection retains jurisdiction, report year,
financial year, source table heading, campaign/category, advertiser, media
channel when published, raw amount, AUD/AUD million unit and exact GST wording.

Filter the report vintage separately from the observed financial year. The
historical series is not one annual report. Keep campaign cost categories,
advertiser totals, media channels and published totals as separate table grains.
No selected-row sum or cross-vintage total. Advertiser examples share the
advertiser's amount; they do not acquire individual campaign costs. Preserve
published campaign periods, including calendar-year and spanning-year coverage.
Under Jake's 19 Oct 2026 decision, names in authorised report descriptions,
campaign titles and notes remain source-record text. Do not turn them into
person entities, person links, name facets, name-search nodes or cross-record
identity joins. Organisation fields alone support facets and agency links.
Missing and included-cost codes stay literal with null amounts where published.
Keep original table hashes and full provenance timestamps; display plain dates.

Display original source, report/financial year, snapshot, coordinates, document
and table hashes, CC BY 4.0 and “© Copyright State Government of Victoria” on
each block and detail. Do not bundle images, branding or campaign creative.
Attachment rights/robots holds never enter the app asset. There is no name-only hold on authorised source text. Any individual,
sole-trader or uncertain supplier is “individual supplier (withheld)” in every
projection, export and search; no supplier/person identity joins.

Use the last reviewed promoted snapshot offline. With no approved asset, keep
navigation closed. Native API allowlist, reader, accessibility and navigation
work require their own reviewed change; none was implemented or built here.
