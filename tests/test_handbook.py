"""Parliamentary Handbook people -> members.person_id (the id in a transcript's member link)."""
import sqlite3

from parli.ingest import handbook as hb


def member(pid, first, last, chamber="representatives", seat="", full=None):
    return {"person_id": pid, "first_name": first, "last_name": last, "full_name": full or f"{first} {last}",
            "chamber": chamber, "electorate": seat}


def person(phid, given, family, chamber="Member", electorate="", state="NSW", preferred="", parliaments=(48,), current="True"):
    return {"PHID": phid, "GivenName": given, "FamilyName": family, "PreferredName": preferred, "DisplayName": f"{family}, {given}",
            "Electorate": electorate, "SenateState": state if chamber == "Senator" else "", "StateAbbrev": state,
            "State": {"NSW": "New South Wales", "WA": "Western Australia", "ACT": "Australian Capital Territory"}.get(state, state),
            "Party": "Labor", "InCurrentParliament": current, "MPorSenator": [chamber], "RepresentedParliaments": list(parliaments),
            "ServiceHistory_Start": "2022-05-21", "ServiceHistory_End": "2026-09-29"}


MEMBERS = [
    member("10749", "Ed", "Husic", seat="Chifley"),
    member("11019", "Simon", "Kennedy", seat="Cook"),
    member("wragge_kennedy", "", "Kennedy"),                                   # a historical stub with the same surname
    member("11008", "Barbara", "Pocock", "senate", "SA"),
    member("11009", "David", "Pocock", "senate", "ACT"),
    member("20001", "Jane", "Smith", seat="Bass"),
    member("20002", "Jane", "Smith", seat="Braddon"),
    member("11059", "Ellie", "Whiteaker", "senate", "WA"),
    member("30001", "Ali", "De Brenni", "representatives", "Bass"),
]


def test_the_handbook_id_of_ed_husic_maps_to_his_members_row_by_preferred_name():
    pid, basis = hb.match_person(person("91219", "Edham ", "HUSIC", electorate="Chifley", preferred="(Ed)"), MEMBERS)
    assert (pid, basis) == ("10749", "surname + first name")


def test_a_stub_member_with_the_same_surname_never_matches():
    pid, _ = hb.match_person(person("267506", "Simon Peter", "KENNEDY", electorate="Cook"), MEMBERS)
    assert pid == "11019"
    pid2, why = hb.match_person(person("1", "Nobody", "KENNEDY", electorate="Nowhere"), MEMBERS)
    assert pid2 is None and "first name and seat do not agree" in why


def test_two_senators_with_one_surname_are_told_apart_by_first_name():
    assert hb.match_person(person("256136", "David Willmer", "POCOCK", "Senator", state="ACT"), MEMBERS)[0] == "11009"
    assert hb.match_person(person("2", "Barbara", "POCOCK", "Senator", state="SA"), MEMBERS)[0] == "11008"


def test_two_members_with_the_same_name_are_told_apart_by_seat_and_an_unresolvable_pair_is_left_unmatched():
    assert hb.match_person(person("3", "Jane", "SMITH", electorate="Braddon"), MEMBERS) == ("20002", "surname + first name + seat")
    pid, why = hb.match_person(person("4", "Jane", "SMITH", electorate="Elsewhere"), MEMBERS)
    assert pid is None and "2 members share that name" in why


def test_a_surname_particle_is_tolerated_and_chamber_must_agree():
    assert hb.match_person(person("5", "Ali", "DE BRENNI", electorate="Bass"), MEMBERS)[0] == "30001"
    # a Senator record does not match a House member of the same name
    assert hb.match_person(person("6", "Ed", "HUSIC", "Senator", state="NSW"), MEMBERS)[0] is None


def test_senate_state_matches_by_name_or_abbreviation():
    m = [member("11059", "Elle", "Whiteaker", "senate", "WA")]           # first name differs: only the state agrees
    assert hb.match_person(person("316555", "Ellie", "WHITEAKER", "Senator", state="WA"), m) == ("11059", "surname + seat")


def test_only_people_who_sat_recently_are_kept():
    assert hb.keep(person("a", "A", "B", current="True", parliaments=(48,)))
    assert hb.keep(person("b", "A", "B", current="False", parliaments=(45, 46)))
    assert not hb.keep(person("c", "A", "B", current="False", parliaments=(30, 31)))


def test_match_people_returns_the_table_rows():
    rows = hb.match_people([person("91219", "Edham", "HUSIC", electorate="Chifley", preferred="(Ed)"),
                            person("c", "A", "B", current="False", parliaments=(30,))], MEMBERS)
    assert len(rows) == 1
    assert rows[0]["phid"] == "91219" and rows[0]["person_id"] == "10749" and rows[0]["chamber"] == "representatives"
    assert rows[0]["in_current"] == 1 and rows[0]["seat"] == "Chifley"


class FakeSession:
    def __init__(self, individuals=None, fail=False):
        self.individuals, self.fail, self.calls = individuals or [], fail, 0
        self.headers = {}

    def get(self, url, params=None, timeout=None):
        self.calls += 1
        if self.fail:
            raise OSError("offline")
        return type("R", (), {"raise_for_status": lambda s: None, "json": lambda s: {"value": self.individuals}})()


def make_db():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("CREATE TABLE members (person_id TEXT, first_name TEXT, last_name TEXT, full_name TEXT, chamber TEXT, electorate TEXT)")
    for m in MEMBERS:
        db.execute("INSERT INTO members VALUES (?,?,?,?,?,?)", (m["person_id"], m["first_name"], m["last_name"], m["full_name"],
                                                              m["chamber"], m["electorate"]))
    return db


def test_ensure_people_fetches_maps_stores_and_then_leaves_a_fresh_table_alone():
    db = make_db()
    sess = FakeSession([person("91219", "Edham", "HUSIC", electorate="Chifley", preferred="(Ed)")])
    assert hb.ensure_people(db, session=sess, say=lambda *a: None) == 1
    assert hb.load_people(db)["91219"]["person_id"] == "10749"
    assert hb.ensure_people(db, session=sess, say=lambda *a: None) == 1 and sess.calls == 1          # fresh: no second request
    assert hb.ensure_people(db, force=True, session=sess, say=lambda *a: None) == 1 and sess.calls == 2


def test_a_failed_fetch_keeps_the_old_table():
    db = make_db()
    hb.ensure_people(db, session=FakeSession([person("91219", "Edham", "HUSIC", electorate="Chifley", preferred="(Ed)")]), say=lambda *a: None)
    assert hb.ensure_people(db, force=True, session=FakeSession(fail=True), say=lambda *a: None) == 1
    assert "91219" in hb.load_people(db)


def test_load_people_without_the_table_is_empty():
    assert hb.load_people(sqlite3.connect(":memory:")) == {}
