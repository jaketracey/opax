"""VIC Hansard: a division takes the bill heading it sits under, and only that.

The layouts below are copied from the -layout text of Legislative Assembly,
27 Aug 2026 (HANSARD-2145855009-36991) and Legislative Council, 14 Aug 2026
(HANSARD-974425065-36357): a heading indented by one or two spaces, a wrapped
heading whose second line is centred, and a third reading about 1750 lines
below its bill heading after a long committee stage."""
from parli.ingest import votes_state

DAY = {"house": "vic_la", "date": "2026-08-27", "label": "Assembly", "pdf": "https://example.test/la.pdf"}
LIST = ["Ayes (52): Juliana Addison, Colin Brooks", "Noes (27): Brad Battin, Jade Benham", "Question agreed to."]


def parse(lines):
    divisions, _ = votes_state.vic_parse_text("\n".join(lines), DAY)
    return divisions


def test_one_space_heading_and_wrapped_heading():
    divisions = parse([
        " Workplace Legislation Amendment (Accident Compensation and Other Matters) Bill 2026",
        "                                                 Second reading",
        "Debate resumed on motion of Steve Dimopoulos:",
        "    That this bill be now read a second time.",
        "  The SPEAKER: The question is:",
        "    That this bill be now read a second time and a third time.",
        "Assembly divided on question:", *LIST,
        "  Education and Training Reform Amendment (Apprenticeships, Traineeships, Schools and",
        "                                Other Matters) Bill 2026",
        "                                                 Second reading",
        "  The SPEAKER: The question is:",
        "    That this bill be now read a second time and a third time.",
        "Assembly divided on question:", *LIST,
    ])
    assert [d.bill_ref for d in divisions] == [
        "Workplace Legislation Amendment (Accident Compensation and Other Matters) Bill 2026",
        "Education and Training Reform Amendment (Apprenticeships, Traineeships, Schools and Other Matters) Bill 2026",
    ]
    assert divisions[1].name == divisions[1].bill_ref


def test_a_bill_stage_question_finds_a_far_heading_within_the_bills_section():
    lines = ["       Racing Legislation Amendment (Entity Governance and Other Matters) Bill 2026",
             "                                                 Second reading",
             "                                                 Committee"]
    lines += ["Speech text about the clauses of the bill, line %d." % n for n in range(1750)]
    lines += ["                                                       BILLS"]  # a running head for this section
    lines += ["                                                   Third reading",
              "  The DEPUTY PRESIDENT: The question is:",
              "    That the bill be now read a third time and do pass.",
              "Council divided on motion:", "Ayes (26): A Member", "Noes (6): B Member", "Motion agreed to."]
    assert parse(lines)[0].bill_ref == "Racing Legislation Amendment (Entity Governance and Other Matters) Bill 2026"


def test_procedural_motions_and_other_sections_get_no_far_bill():
    filler = ["Speech text, line %d." % n for n in range(300)]
    procedural = ["       Example Amendment Bill 2026", *filler,
                  "    That the sitting be extended.",
                  "Council divided on motion:", "Ayes (8): A Member", "Noes (25): B Member", "Motion negatived."]
    assert parse(procedural)[0].bill_ref is None
    tail = ["Council divided on motion:", "Ayes (8): A Member", "Noes (25): B Member", "Motion negatived."]
    # An earlier page whose running head names another section.
    other_page = ["       Example Amendment Bill 2026", "Speech text.",
                  "                                                    MOTIONS", "Friday 14 August 2026   Legislative Council   3367",
                  "Speech text.", "                                                    BILLS",
                  "    That the bill be now read a third time.", *tail]
    assert parse(other_page)[0].bill_ref is None
    # The heading of another business item.
    other_item = ["       Example Amendment Bill 2026", "Speech text.", "                                                    Motions",
                  "Speech text.", *tail]
    assert parse(other_item)[0].bill_ref is None
    # The running head of the division's own page can name a section that starts below it.
    own_page = ["       Example Amendment Bill 2026", "Speech text.",
                "                  QUESTIONS WITHOUT NOTICE AND MINISTERS STATEMENTS",
                "Friday 14 August 2026   Legislative Council   3367", "Speech text.", *tail]
    assert parse(own_page)[0].bill_ref == "Example Amendment Bill 2026"
    # Speech lines that mention a bill are not headings.
    speech = ["  Debate on the Example Amendment Bill 2026 resumed today.",
              "    That the bill be now read a third time.",
              "Council divided on motion:", "Ayes (8): A Member", "Noes (25): B Member", "Motion negatived."]
    assert parse(speech)[0].bill_ref is None
