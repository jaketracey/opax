`candidates.xls` is a small BIFF8 workbook with the VEC report's five columns,
report headings, timestamp, totals, constituency headings and vacancy counts.
It was created with xlwt 1.3.0. All candidate and contact names are invented;
contact fields are deliberately populated to check that they are discarded.

It contains three district candidates and five region candidates. The region
rows model two groups followed by an ungrouped candidate. The VEC spreadsheet
flattens group headings, so order must be retained without sorting on party or
candidate name. Blank party cells represent independents, unnamed groups and
ungrouped candidates. One candidate has no comma in their name, and one party
label has trailing whitespace, as the real report can contain both.

`election.html` saves the relevant VEC landing page structure with an invented
download URL and no candidate names. The dated notice supplies the publication
date, separately from the report's earlier snapshot timestamp.
