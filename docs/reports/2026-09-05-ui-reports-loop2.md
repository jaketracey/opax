# Loop 2 — report data audit

## Method

I checked every position against the cited KB resource, including its live party label, body and machine brief where present. A position was retained only when the named speaker's own contribution supported it; fewer honest rows are preferable to a complete-looking party grid built from misattributed evidence. I also reviewed the stats SQL and every regenerated section opening.

The section pass used `python3 scripts/generate_reports.py --only sections`. It made **16 `/ask` calls**: climate 3, gambling 3, housing 3, immigration 2, indigenous 3 and media 2. All sixteen completed, and none now opens with “Based on the provided context”, “Based on the context” or equivalent source-disclaimer language.

## Positions

| Report | Finding | Fix |
| --- | --- | --- |
| Climate & Energy | The Australian Democrats row cited Lyn Allison's question but stated the minister's answer as the party's position. The other five rows are on-topic and carry the stated party or a directly supported Greens/independent position. | Removed the misattributed Australian Democrats row. |
| Gambling | Andrew Wilkie's row mixed his call for mandatory cashless precommitment with the Prime Minister's answer. The Greens prose also inverted Mehreen Faruqi's speech, and the Scott Buchholz resource was a multi-speaker debate whose opening contribution was not his. | Limited Wilkie's row to his own question, rewrote the Greens row from Faruqi's words, and removed the unsafe Liberal attribution. Four supported rows remain. |
| Housing | The Greens evidence was a question-on-notice answer rather than Christine Milne's stance. The LNP item was a broad budget speech with a weak housing classification. | Removed both. The two remaining Labor and Liberal rows are clear, opposed positions with substantive cited speeches. |
| Immigration | The supposed Labor row cited Malcolm Turnbull and the KB labels it Liberal. | Removed it. The Liberal, Greens and LNP rows remain supported by the cited speeches. |
| First Nations | Rob Oakeshott's fragment merely referred back to a previous speaker. Peter Whish-Wilson's resource was a valedictory speech with one passing First Nations paragraph. The Australian Democrats row overstated the apology speech as native-title reform. | Removed the two weak rows and rewrote Andrew Bartlett's position to the apology, practical action and reparations actually present in his speech. |
| Media | The Labor source was 311 characters, the Nationals source was answer boilerplate, and the Greens source was an unrelated migration-review debate. | Removed all three. The Australian Democrats, Liberal and independent rows remain directly supported. |

## Top speakers

The legacy `speech_topics` classifier uses raw substring counts; this allowed matches such as `media` inside `immediately` and made the old top-speaker lists look like general speaking-volume rankings. `report_stats.py` now requires at least three whole-word or phrase hits in the speech body using report-specific patterns before counting a speech toward a top speaker. It retrieves enough raw names to normalize and aggregate variants before ranking, including the corpus's `Snowdon` / `Warren Snowdon` split.

The audited top fives are now:

- Climate: Julia Gillard, Greg Combet, Tony Abbott, Anthony Albanese, Kevin Rudd.
- Gambling: Justin Field, Andrew Wilkie, Cate Faehrmann, C. Bonaros, Christopher Gulaptis.
- Housing: Jenny Leong, J.M.A. Lensink, Harriet Shing, Tanya Plibersek, Peter Costello.
- Immigration: Philip Ruddock, Scott Morrison, Peter Dutton, Laurie Ferguson, Gary Hardgrave.
- First Nations: Warren Snowdon, Philip Ruddock, K.J. Maher, Jenny Macklin, Shayne Neumann.
- Media: John Murphy, Peter McGauran, Anthony Albanese, Chris Bowen, Paul Fletcher.

The broad topic totals are intentionally unchanged; this loop hardens the user-facing ranking rather than silently redefining the corpus classification.

## Timeline

The timeline query already uses `substr(s.date, 1, 4)`, where `s.date` is the speech date carried into the corpus. It does not use the Nuclia catalog `created` value, so no timeline correction was required. The regenerated reports retain those speech-date series.

## Sections

The earlier data contained five explicit stale openings across Climate, Housing and First Nations, plus softer variants such as “The context says”. All report sections were regenerated together with a prompt that requires the strongest finding first, direct attribution, precise figures and no mention of context or source limitations. The other report blocks were preserved by the targeted `--only sections` path.
