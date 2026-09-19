# Homepage prototype: UX reassessment

Superseded historical review, 19 September 2026. The stacked research opening proposed here was subsequently rejected for its complexity. The current decisions and comparator review are recorded in [HOME_PROTOTYPE.md](HOME_PROTOTYPE.md). The user subsequently clarified that OPAX must have no editorial selection. The discussion of editorial lead slots below is superseded. See HOME_PROTOTYPE.md for the current research-platform prototype and ordering rules.

## Basis and limits

Reviewed the existing homepage, the prototype's rendered desktop and zoomed layouts, its HTML/CSS/interaction code, and the user's feedback. This is a heuristic assessment, not a usability study. Task priorities derive from the user's explicit description of OPAX: searching and parliamentary material are central; the money map is a high-impact research tool; recently indexed records have lower introductory value.

The prototype has reorganised sections without establishing a coherent model for starting research, browsing, or discovering worthwhile material. Functional checks and successful map rendering do not establish usability.

## Research tasks the homepage must support

| Reader's starting point | Necessary support |
| --- | --- |
| I have a question about what politicians said | A prominent Ask entry, examples and the existing question builder; explain that the result is a sourced answer. |
| I need a particular speech, bill, person or phrase | An explicit record-search entry; explain that it returns records, with relevant refinements downstream. |
| I know a person, electorate or topic but do not have a query | Visible browsing and lookup routes with understandable scope. A search box alone assumes too much prior knowledge. |
| I want to investigate political funding | A prominent map with understandable relationships, working local controls and a clear route to detailed records. |
| I want something worth reading or investigating | Reports or findings with a clear subject, value, provenance and reason for their placement. |
| I want to know what has changed | Dated parliamentary activity, declarations and collection updates, with distinct meanings of “new”. |

## Findings, in priority order

### 1. The main research entry weakens the core task

The prototype replaces the existing Ask/builder experience with a general search field. Two small links, “Ask a question” and “Build a question”, both lead to `/ask`. Readers are offered a distinction with no different result, while the site's central question-answering capability becomes secondary.

Design consequence: provide one identifiable research area with explicit “Ask a question” and “Search records” modes, each showing its own input, explanation, examples and submit action. Retain the existing builder within Ask and its special sentence treatment. Preserve entered text when switching. The initial mode should follow the established product behaviour until evidence supports changing it.

### 2. Browsing has no coherent role

The six-link strip resembles another site menu or a set of page tabs. It has no heading, selection state, scope explanation or useful preview. “Topics” and “Reports” do not explain the difference between a subject collection and a prepared investigation. The header's “People & electorates” scrolls to a section, whereas its peers navigate to other pages.

Repeated navigation is not inherently wrong, and mixing entity and task labels is not automatically a usability failure. My earlier categorical diagnosis was unjustified. The question is whether each navigation instance helps a recognisable task and whether its destinations are predictable.

Design consequence: retain a prominent, explicitly labelled browse area near the research entry. Group destinations by understandable purpose, such as people and representation, parliamentary records, and funding. Explain the useful contents: parliamentarian speeches/votes/interests; electorate representation/election history; bill changes/status/divisions. Use existing real destinations. Keep global navigation stable and consistent with the wider application. Do not solve this by distributing essential browse routes far down the page.

### 3. The gambling feature claims importance without earning it

Gambling was selected as an illustrative example. Its dominant presentation implies an editorial recommendation, but neither a current development, a new substantive report, nor a supported finding explains why readers should see it here. Two Victorian speeches from different dates and a national funding total are related by topic; their juxtaposition does not establish a coherent narrative. Two selected contributions also do not constitute a comparison of parties.

Design consequence: keep the report material, but establish an editorial rule before assigning a lead slot. A lead preview must answer: what is the finding or question, why is this being shown, what is its scope, and what will opening it provide? Suitable reasons include a newly published investigation, a substantive update, or relevance to an identified development. An automatic generation timestamp is not evidence of newsworthiness. Until a justified lead exists, present the existing collection as reports with their actual questions and scope. Adding “Featured” would not provide the missing rationale.

### 4. Map controls break the visual language already agreed

Industry chips styled as filters are anchors to `/money?industry=...`; they do not update the visible embedded map. The same treatment elsewhere denotes an in-place selection. Their numerical badges also do not visibly name the unit being counted.

Design consequence: retain the map prominently. Its filters must update that map, communicate the selection and allow reset. The full-map action should preserve the current selection. State what the nodes, relationships and counts represent. Guided questions should open an appropriately configured exploration and clearly signal that transition. Provide a useful nonvisual route to the same records.

### 5. Content grouping follows component boundaries

The topic feature and the seven reports are separated by parliamentary activity. The people section places two manually chosen profiles and isolated votes beside a jurisdiction directory without a shared selection rule. Most modules have similar heading size, spacing and section treatment, despite different purposes and significance.

Design consequence: group the topic/report feature and report collection into one editorial area with a lead/supporting hierarchy only where warranted. Group bills and declarations as distinct streams of parliamentary activity. Make profiles support person/representation lookup or a clearly relevant investigation; do not choose faces and individual votes merely to populate a layout. Retain access to all content families.

### 6. The evidence needs context at the point of reading

The prominent $35.86m total is qualified only as covering the report's disclosure series. A source-name ranking contains potentially overlapping organisational aliases. Essential caveats use the 11px note style on desktop. This asks readers to interpret a strong visual claim before seeing the information needed to understand it.

Design consequence: show the time period, jurisdiction and measure beside an amount. Resolve entity identity before calling a list a donor ranking, or explicitly present source entries as such. Clearly identify model-written summaries and provide readable source links. Use secondary styling for metadata while keeping it legible. Do not turn corpus counts into an argument for significance.

### 7. Mobile needs a deliberate task order

The responsive layout stacks the collection statistics, browsing links, map, journeys and industry links before the next substantive content. It inherits desktop order rather than assessing what people need together on a narrow screen. High zoom checks demonstrated reflow, not mobile task usability.

Design consequence: keep the research action and browse access together; put map controls next to the map; keep every preview's scope and destination with its content. Use compact lists for secondary material. Retain content availability without requiring traversal through every desktop column to find a core task.

## Proposed composition to test

1. **Research entry:** brief purpose, Ask/Search modes, examples, builder and visible grouped browsing. Collection coverage is supporting context within this area.
2. **Money map:** a substantial working research tool with local filters and guided starting points; above recently indexed records.
3. **Reports and investigations:** the existing collection, with a justified lead only when the content supports one. Money & words belongs here as a report treatment, not an unexplained standalone topic takeover.
4. **Parliamentary activity:** bills and declarations in clearly labelled parallel lists; status, substantive summaries, dates and sources remain visible. Distinguish event dates from publication and indexing dates.
5. **Browse the collection:** a comprehensive subject directory, people/representation/jurisdiction routes and discovery tools. These complement the early browse entry with greater depth. Preserve all 21 topics and existing report destinations.
6. **Collection updates and provenance:** newly indexed material, coverage, datasets and methods. Keep relevant provenance beside claims throughout the page as well.

This is a proposed arrangement, not a demonstrated optimum. It supports multiple research entry points; it does not presume that every visitor should progress from search into the map. Global navigation, the research interface, editorial previews and recent-record lists need distinct component roles and consistent behaviour.

## Comparator lessons

[Our World in Data](https://ourworldindata.org/) provides specific explanatory headlines, evidence-led previews, named content types, authors/dates and grouped subject navigation. Its density has several levels: a reader can scan a headline, read its explanation, inspect evidence, or continue into a topic. OPAX should apply that relationship between preview and evidence while preserving its own research tools and parliamentary purpose.

OpenSecrets could not be directly retrieved during this reassessment, so no current detailed comparison is claimed here.

The assessment applies [NN/g's information-scent guidance](https://www.nngroup.com/articles/information-scent/) to the predictability of labels and previews, [usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) to interaction consistency and visible choices, and [visual-hierarchy guidance](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) to grouping and relative emphasis. These principles diagnose risks; they do not substitute for testing this audience.

## Validation before calling a revision successful

- Ask readers where they would start to find a specific speech, compare positions on a topic, inspect an electorate's representation, and investigate funding from an industry. Record first choices and wrong turns; do not coach them.
- Before clicking, ask what a control will do. Pay particular attention to Ask/Search, browse links, map filters and the full-map action.
- Show a report preview and ask why it is present, what it says, its relevant period, and what supports it. An inability to answer indicates missing context or unjustified emphasis.
- Repeat core tasks on a narrow viewport and with keyboard navigation, including filter selection/reset and returning from a destination.
- Review the whole page with representative long titles, incomplete data, loading/failure states and genuinely current content. Do not fabricate urgency, significance or capabilities to make the layout work.
