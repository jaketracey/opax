# Ask political-cohort retrieval fix

The question “How have independant MPs described negative gearing over the years?”
was sent to unrestricted document retrieval. Major-party results dominated the
retrieved window; the answer incorrectly treated that selection as evidence
that the requested group had no statements. A live Independent-filtered search
confirmed relevant records were already indexed.

Ask now recognises unambiguous party/cohort requests, including independent and
independant MPs. Speech questions narrow to speeches before document retrieval,
financial-record retrieval and cache lookup. Explicit filters or a named speaker
win. Comparisons, exclusions and nonpolitical uses of “independent” are not
narrowed. Clearly referential follow-ups can inherit the preceding user question's
cohort, never a model answer's attribution. The answer stamp shows inferred scope.

Party labels select indexed records; some debates contain several speakers. The
prompt does not treat a record's party or speaker label as proof of the identity
of every speaker inside it, and does not infer corpus-wide absence from a ranked
retrieval window. This change does not repair or relabel historical source data.

The Ask pipeline cache version was bumped so previously cached broad results do
not survive this retrieval change. Coverage includes spelling variants, other
political cohorts, explicit controls, comparisons, exclusions, incidental
mentions, follow-up scope and financial versus speech questions.
