# Full-corpus report refresh — 9 September 2026

Regenerated Climate & Energy, Gambling, Housing, Immigration, First Nations and Media Ownership. Each has eight current questions, three historical periods, a new introduction, current figures and refreshed parliamentary counts.

Narratives and figure retrieval now search original records across the knowledge box without requiring a speech kind or a Hansard topic label. A dedicated question in every report retrieves non-speech evidence. Every report now cites government releases or division records alongside speeches.

Generated summary fields and bill registry cards (whose body includes model-written summaries) are excluded. Original bill text, explanatory memoranda and Bills Digests remain eligible. Affected sections were rerun after discovering the registry-card issue; obsolete v1 prose was removed from the downloadable reports. Prompts distinguish announcements from delivery, awards from payments, and recorded connections from political influence.

Parliamentary counts, timelines and voice charts use the topic-labelled speech catalog. Financial charts preserve the separately audited `scripts/report_stats.json` snapshot; this refresh does not claim a new financial-data acquisition. Weak or off-topic figure candidates were removed during review.

Source rows identify their record type and use “Read the record” for non-speeches. Mobile source URLs and long figure values wrap within their columns, and citation touch targets no longer extend past the right edge.

## Validation

- All six reports pass the report validator, including 1,094 live knowledge-box source lookups.
- Six focused generator tests pass; JavaScript syntax, portal TypeScript and asset stamps pass.
- All six pages tested at 390, 768 and 1440 pixels: no horizontal overflow or browser errors; non-speech source panels render correctly.
- The older `tests/test_generate_reports.py` suite cannot import on the baseline because it references absent helpers including `cap_paragraph_words`. This pre-existing test mismatch is unchanged.

Narratives use the knowledge box’s configured writer. Structured figures, party positions and introductions used the installed Codex CLI (`gpt-5.6-luna`, medium reasoning), without adding an external model credential.
