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
reviewed structured campaign periods, including calendar-year and spanning-year
coverage. Every report-derived free-text field uses the shared default-deny
privacy policy: unreviewed descriptions, titles, notes and amount annotations
remain withheld in app data, exports and search. Only reviewed organisation
names/category labels and structured amounts/dates survive. Reviewed missing
codes remain literal with a null amount; never infer an amount from a hold.
Keep original table hashes and full provenance timestamps; display plain dates.

Display original source, report/financial year, snapshot, coordinates, document
and table hashes, CC BY 4.0 and “© Copyright State Government of Victoria” on
each block and detail. Do not bundle images, branding or campaign creative.
Attachment and private-title holds never enter the app asset. Any individual,
sole-trader or uncertain supplier is “individual supplier (withheld)” in every
projection, export and search; no supplier/person identity joins.

Use the last reviewed promoted snapshot offline. With no approved asset, keep
navigation closed. Native API allowlist, reader, accessibility and navigation
work require their own reviewed change; none was implemented or built here.
