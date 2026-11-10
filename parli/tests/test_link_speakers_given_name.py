"""Federal speaker linking for prints that carry a given name (speeches-press-001).

The cases are the verifier's replay against the members table (scratch replay_linker.py):
"Surname, Given, MP" zenodo prints that the old surname-only steps filed under the wrong
person. The member rows below are copied from that table, service dates included.
"""
import sqlite3

import pytest

from parli.ingest import link_speakers as L
from parli.schema import get_db, init_db

MEMBERS = [
    # person_id, first, last, full, chamber, entered_house, left_house
    ("10026", "Bob", "Baldwin", "Bob Baldwin", "representatives", "1984-04-03", "2016-05-04"),
    ("wragge_baldwin", "", "Baldwin", "Baldwin", "representatives", None, "unknown"),
    ("10922", "Pat", "Conaghan", "Pat Conaghan", "representatives", "2019-07-24", None),
    ("10212", "Pat", "Farmer", "Pat Farmer", "representatives", "2002-02-18", "2010-06-23"),
    ("wragge_farmer", "", "Farmer", "Farmer", "representatives", None, "unknown"),
    ("10903", "Rex", "Patrick", "Rex Patrick", "senate", "2002-02-18", "2021-09-02"),
    ("10996", "Gordon", "Reid", "Gordon Reid", "representatives", "1901-05-21", None),
    ("wragge_reid", "", "Reid", "Reid", "representatives", None, "unknown"),
    ("wragge_bruce", "Bruce", "Bruce", "Bruce", "representatives", "1918-05-24", None),
    ("10463", "Claire", "Moore", "Claire Moore", "senate", "2006-02-27", "2025-12-03"),
    ("wragge_moore", "", "Moore", "Moore", "representatives", "1976-04-27", None),
    ("10319", "Greg", "Hunt", "Greg Hunt", "representatives", "1969-08-19", "2022-03-31"),
    ("wragge_hunt", "", "Hunt", "Hunt", "representatives", None, "unknown"),
    ("wragge_gregory", "Gregory", "Gregory", "Gregory", "representatives", "1913-08-21", None),
    ("10545", "Stuart", "Robert", "Stuart Robert", "representatives", "1998-03-30", "2023-03-30"),
    ("wragge_o'keefe", "", "O'Keefe", "O'Keefe", "senate", "1901-05-30", "2001-09-27"),
    ("wragge_andrew", "Andrew", "Andrew", "Andrew", "senate", "1926-01-14", "2006-12-07"),
    ("wragge_neil", "Neil", "Neil", "Neil", "representatives", "1976-02-19", "2001-09-27"),
    ("10600", "Alex", "Somlyay", "Alex Somlyay", "representatives", "1990-09-18", "2013-06-24"),
    ("10725", "John", "Alexander", "John Alexander", "representatives", "1998-04-08", "2022-03-31"),
    ("wragge_fahey", "", "Fahey", "Fahey", "representatives", "1998-03-12", "2001-09-27"),
    ("10696", "Bob", "Brown", "Bob Brown", "senate", "1998-03-02", "2012-05-09"),
    ("10071", "Carol", "Brown", "Carol Brown", "senate", "2006-02-07", None),
]


def lookup():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("CREATE TABLE members (person_id, first_name, last_name, full_name, chamber, entered_house, left_house)")
    db.executemany("INSERT INTO members VALUES (?,?,?,?,?,?,?)", MEMBERS)
    return L.build_member_lookup(db)


def test_a_comma_print_has_its_surname_before_the_comma():
    assert L.extract_surname("Hunt, Gregory, MP") == "Hunt"
    assert L.extract_surname("Theophanous, Dr Andrew, MP") == "Theophanous"
    assert L.extract_surname("Van Manen, Bert, MP") == "Van Manen"
    assert L.extract_surname("Smith, John (Wills)") == "Smith"
    # Surname-only and full-name prints keep the last word, as before.
    assert L.extract_surname("Mr HUGHES") == "Hughes"
    assert L.extract_surname("Sir WILLIAM LYNE") == "Lyne"


def test_given_name_compatibility():
    ok = L.given_names_compatible
    assert ok("Patrick", "Pat") and ok("Alexander", "Alex") and ok("Gregory", "Greg")
    assert ok("Robert", "Bob") and ok("Bob", "Robert")
    assert ok("J", "John") and ok("John", "J.")
    assert not ok("Peter", "Bob") and not ok("Bruce", "Gordon") and not ok("John", "Claire")
    assert not ok("Robert", "Stuart") and not ok("Neil", "Andrew") and not ok("Patrick", "Rex")
    assert not ok("Ja", "James"), "two letters is too short for a prefix"
    assert not ok("John", ""), "a member with no given name on record cannot confirm one"


def test_print_chamber():
    assert L.print_chamber("Wong, Penny, Senator") == "senate"
    assert L.print_chamber("Hunt, Gregory, MP") == "representatives"
    assert L.print_chamber("Mr HUGHES") == "representatives"
    assert L.print_chamber("Dr EARLE PAGE") is None


def test_service_dates_with_a_one_year_margin():
    farmer = {"entered": "2002-02-18", "left": "2010-06-23"}
    assert L.served_during(farmer, ("2002-02-19", "2010-06-01"))
    assert L.served_during(farmer, ("2001-06-01", "2011-05-01"))
    assert not L.served_during(farmer, ("2019-07-24", "2022-03-31"))
    assert L.served_during({"entered": None, "left": None}, ("1901-01-01", "1901-01-02"))
    assert L.served_during(farmer, (None, None))


@pytest.mark.parametrize("raw, span, expected", [
    # The verifier's replay cases: before -> after.
    ("Baldwin, Robert, MP", ("1998-03-02", "2016-05-04"), "10026"),      # Bob Baldwin (was 10545 Stuart Robert in the DB)
    ("Farmer, Patrick, MP", ("2002-02-19", "2010-06-17"), "10212"),      # Pat Farmer (was 10903 Rex Patrick)
    ("Conaghan, Patrick, MP", ("2019-07-24", "2022-03-30"), "10922"),    # Pat Conaghan (was 10903 Rex Patrick)
    ("Halverson, Robert, MP", ("1998-03-02", "1998-07-02"), None),       # no Halverson on the roll (was 10545)
    ("Reid, Bruce, MP", ("1998-03-02", "1998-08-31"), None),             # Bruce is not Gordon (was 10996 / wragge_bruce)
    ("Moore, John, MP", ("1998-03-02", "2001-09-27"), None),             # John is not Claire Moore (was 10463)
    ("Baldwin, Peter, MP", ("1998-03-02", "1998-08-31"), None),          # Peter is not Bob Baldwin (was 10026)
    ("Andrew, Neil, MP", ("1998-03-02", "2004-08-31"), None),            # a senate "Andrew" stub (was wragge_andrew / wragge_neil)
    ("O'Keefe, Neil, MP", ("1998-03-02", "2001-09-27"), None),           # an MP is not a senate stub (was wragge_o'keefe)
    ("Hunt, Gregory, MP", ("2001-11-20", "2022-02-10"), "10319"),        # Greg Hunt (was wragge_gregory)
    ("Somlyay, Alexander, MP", ("1998-03-02", "2013-06-24"), "10600"),   # Alex Somlyay (was 10725 John Alexander)
    ("Fahey, John, MP", ("1998-03-02", "2001-09-27"), None),             # a stub with no given name cannot confirm "John"
    ("Brown, Bob, Senator", ("1998-03-02", "2012-05-01"), "10696"),
])
def test_surname_given_name_chamber_and_dates_decide_together(raw, span, expected):
    _, surnames = lookup()
    assert L.match_print_with_given_name(raw, surnames, span) == expected


def test_service_dates_separate_two_members_with_the_same_names():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("CREATE TABLE members (person_id, first_name, last_name, full_name, chamber, entered_house, left_house)")
    db.executemany("INSERT INTO members VALUES (?,?,?,?,?,?,?)", [
        ("1", "John", "Smith", "John Smith", "representatives", "1950-01-01", "1960-01-01"),
        ("2", "John", "Smith", "John Smith", "representatives", "2000-01-01", "2010-01-01"),
    ])
    _, surnames = L.build_member_lookup(db)
    assert L.match_print_with_given_name("Smith, John, MP", surnames, ("2004-01-01", "2005-01-01")) == "2"
    assert L.match_print_with_given_name("Smith, John, MP", surnames, None) is None


def test_the_date_pass_respects_the_given_name():
    _, surnames = lookup()
    ranges = {"10026": ("1998-03-02", "2016-05-04")}
    # "Baldwin" has two candidates, so the date pass sees it; Peter is not Bob.
    assert L.match_surname_with_date("Baldwin, Peter, MP", "Baldwin", surnames, "1998-05-01", ranges) is None
    assert L.match_surname_with_date("Baldwin, Robert, MP", "Baldwin", surnames, "2001-05-01", ranges) == "10026"
    # A surname-only print is unchanged.
    assert L.match_surname_with_date("Mr BALDWIN", "Baldwin", surnames, "2001-05-01", ranges) == "10026"


@pytest.fixture
def linked(tmp_path, monkeypatch):
    """link_speakers() end to end on the replay members and one zenodo row set per print."""
    path = tmp_path / "l.db"
    conn = get_db(path)
    init_db(conn)
    conn.executemany("INSERT INTO members (person_id, first_name, last_name, full_name, chamber, entered_house, "
                     "left_house, state) VALUES (?,?,?,?,?,?,?, 'federal')", MEMBERS)
    prints = {
        "Hunt, Gregory, MP": ("2001-11-20", 6), "Baldwin, Robert, MP": ("2003-05-14", 6),
        "Farmer, Patrick, MP": ("2004-03-02", 6), "Conaghan, Patrick, MP": ("2020-02-04", 6),
        "Moore, John, MP": ("1999-03-10", 6), "Reid, Bruce, MP": ("1998-03-03", 6),
        "Halverson, Robert, MP": ("1998-03-04", 4), "Baldwin, Peter, MP": ("1998-03-05", 6),
        "Andrew, Neil, MP": ("1999-05-11", 6), "O'Keefe, Neil, MP": ("1999-06-01", 6),
        "Somlyay, Alexander, MP": ("2005-08-16", 6), "Fahey, John, MP": ("1999-02-15", 6),
    }
    for raw, (day, n) in prints.items():
        for i in range(n):
            conn.execute("INSERT INTO speeches (speaker_name, chamber, date, text, source, state) VALUES "
                         "(?, 'representatives', ?, ?, 'zenodo', 'federal')",
                         (raw, f"{day[:8]}{int(day[8:]) + i:02d}", f"Speech {i} by {raw}. " * 20))
    conn.commit()
    conn.close()
    monkeypatch.setattr(L, "get_db", lambda: get_db(path))
    L.link_speakers()
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    yield db
    db.close()


def pids(db, raw):
    return {r[0] for r in db.execute("SELECT DISTINCT person_id FROM speeches WHERE speaker_name = ?", (raw,))}


def test_link_speakers_end_to_end(linked):
    assert pids(linked, "Hunt, Gregory, MP") == {"10319"}
    assert pids(linked, "Baldwin, Robert, MP") == {"10026"}
    assert pids(linked, "Farmer, Patrick, MP") == {"10212"}
    assert pids(linked, "Conaghan, Patrick, MP") == {"10922"}
    assert pids(linked, "Somlyay, Alexander, MP") == {"10600"}
    # No real member fits: the source's own print becomes a stub, or with under five rows stays unlinked.
    assert pids(linked, "Moore, John, MP") == {"wragge_moore"}        # the reps "Moore" stub, service from 1976
    assert pids(linked, "Fahey, John, MP") == {"wragge_fahey"}        # the reps "Fahey" stub, service 1998-2001
    assert pids(linked, "Reid, Bruce, MP") == {"zenodo_bruce_reid"}   # the "Reid" stub has no recorded service
    assert pids(linked, "Baldwin, Peter, MP") == {"zenodo_peter_baldwin"}
    assert pids(linked, "Andrew, Neil, MP") == {"zenodo_neil_andrew"}
    assert pids(linked, "O'Keefe, Neil, MP") == {"zenodo_neil_okeefe"}
    assert pids(linked, "Halverson, Robert, MP") == {None}
    # Real members gained no stub and kept their names; stubs were filled only where service overlaps.
    names = dict(linked.execute("SELECT person_id, full_name FROM members").fetchall())
    assert names["wragge_farmer"] == "Farmer" and names["wragge_hunt"] == "Hunt" and names["wragge_reid"] == "Reid"
    assert names["wragge_moore"] == "John Moore" and names["wragge_fahey"] == "John Fahey"
    assert not [p for p in names if p.startswith("zenodo_") and p.split("_")[-1] in {"hunt", "farmer", "conaghan", "baldwin"}
                and p != "zenodo_peter_baldwin"]
