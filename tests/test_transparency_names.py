"""Footnote markers on key management personnel names (Transparency Portal loaders)."""
import pytest

from parli.ingest.transparency_portal import footnote_free_name
from scripts.export_annual_reports import kmp_kind, kmp_name


@pytest.mark.parametrize("published, name, marker", [
    ("Christine Holgate1", "Christine Holgate", "1"),
    ("Darren Box10", "Darren Box", "10"),
    ("Jane Cutler 1", "Jane Cutler", "1"),
    ("Ms Michele O’Neil 1", "Ms Michele O’Neil", "1"),
    ("Nell Greenwood*", "Nell Greenwood", "*"),
    ("Wayne Evans *", "Wayne Evans", "*"),
    ("Professor Selina Stead ^", "Professor Selina Stead", "^"),
    ("Adrian Collette AM¹", "Adrian Collette AM", "¹"),
    ("Brian Hickey[1]", "Brian Hickey", "[1]"),
    ("Jenet Connell(d)", "Jenet Connell", "(d)"),
    ("John P Mullen (1)", "John P Mullen", "(1)"),
    ("Justice Iain Ross (AO)1", "Justice Iain Ross (AO)", "1"),
    ("Russell Reichelt﻿1", "Russell Reichelt", "1"),
    ("Melinda Smith(e)﻿", "Melinda Smith", "(e)"),
    ("Name withheld⁴", "Name withheld", "⁴"),
    ("Ms Sarah Howard﻿", "Ms Sarah Howard", ""),
])
def test_footnote_markers_are_removed(published, name, marker):
    assert footnote_free_name(published) == (name, marker)


@pytest.mark.parametrize("published", [
    "Michael Wallace", "Name Withheld 5", "Namewithheld5", "Executive 2", "Total1", "Grand Total", "17",
    "$0 - $220000", "Managing Director - Redundant Sept 2020", "Justice Iain Ross (AO)", None,
])
def test_names_that_genuinely_end_in_digits_are_unchanged(published):
    assert footnote_free_name(published) == (published, None)


def test_export_keeps_the_cell_as_published_and_classifies_lines_that_name_no_one():
    assert kmp_name("Christine Holgate1") == {"name": "Christine Holgate", "name_as_published": "Christine Holgate1"}
    assert kmp_name("Christine Holgate", "Christine Holgate1") == {"name": "Christine Holgate", "name_as_published": "Christine Holgate1"}
    assert kmp_name("Michael Wallace") == {"name": "Michael Wallace"}
    assert [kmp_kind(n) for n in ("Total", "Total3", "Grand Total", "TOTAL Consolidated KMP", "Sub-total")] == ["kmp_total"] * 5
    assert [kmp_kind(n) for n in ("17", "0", "$0 - $220000")] == ["kmp_other"] * 3
    assert [kmp_kind(n) for n in ("Totaro Smith", "Christine Holgate1", "Managing Director - Redundant Sept 2020")] == ["kmp"] * 3
