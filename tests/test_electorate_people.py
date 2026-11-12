"""Electorate release person linking: service records join OPAX people by OpenAustralia id.

Fixture rows are copied from the pinned sources: OpenAustralia data/people.csv at commit 061ec16
(scripts/export_profile_links.py) and data/representatives.csv (sha256 3c9a623c..., the digest the
published release b56417062ccc33cf recorded)."""
import hashlib
import json
from pathlib import Path

import pytest

from parli.electorates import stable_id
from parli.ingest.electorates import Builder, check_people, oa_person_count, oa_person_index
from scripts.oa_people_ids import rows as oa_people_rows

PEOPLE_CSV = """person count,aph id,name,birthday,alt name,,,,,
60,DZS,Chris Eyles Bowen,,Christopher Eyles Bowen,,,,,
74,,Robert James Brown,1933-12-2,,,,,,
696,QD4,Bob James Brown,1944-12-27,Robert James Brown,,,,,
81,DYW,Mr Tony Stephen Burke,,Mr Anthony Stephen Burke,the Hon. Tony Stephen Burke,the Hon. Anthony Stephen Burke, Hon Anthony Stephen Burke,Hon Tony Burke,Tony Burke
268,0H4,Alan Gordon Griffiths,,,,,,,
290,HWO,Alex George Hawke,,Alexander George Hawke,,,,,
352,HX4,Bob Carl Katter,,Robert Carl Katter,,,,,
571,QK6,Bob Charles Grant Sercombe,,Robert Charles Grant Sercombe,,,,,
580,00ATG,Bill Richard Shorten,,William Richard Shorten,William Shorten,,,,
591,SK6,Anthony Charles Smith,,,,,,,
592,00APG,Tony David Hawthorn Smith,,Anthony David Hawthorn Smith,,,,,
679,E0F,Jason Peter Wood,,,,,,,
695,HWB,Tony Zappia,,Antonio Zappia,,,,,
"""

REPRESENTATIVES_CSV = """member count,person count,name,Division,State/Territory,Date of election,Type of election,Date ceased to be a Member,reason,Most recent party

226,,Alan Gordon Griffiths,Maribyrnong,Vic.,5.3.1983,,29.1.1996,retired,ALP
467,,Robert Charles Grant Sercombe,Maribyrnong,Vic.,2.3.1996,,17.10.2007,retired,ALP
476,,William Richard Shorten,Maribyrnong,Vic,24.11.2007,,20.1.2025,resigned,ALP
485,,Anthony Charles Smith,Dickson,Qld,2.3.1996,,3.10.1998,defeated,IND
486,,Anthony David Hawthorn Smith,Casey,Vic.,10.11.2001,,10.08.2015,changed_party,LIB
552,,Jason Peter Wood,La Trobe,Vic.,9.10.2004,,21.8.2010,defeated,LIB
657,,Jason Wood,La Trobe,Vic,7.9.2013,,,still_in_office,LIB
"""

OA_URL = "https://raw.githubusercontent.com/openaustralia/openaustralia-parser/master/data/representatives.csv"


def index():
    return oa_person_index(oa_people_rows(PEOPLE_CSV, entries=[]))


@pytest.mark.parametrize("name, count", [
    ("William Richard Shorten", 580), ("Robert Charles Grant Sercombe", 571), ("Alan Gordon Griffiths", 268),
    # The five names the builder used to hold as a hand-written alias table, now from the source.
    ("Anthony Stephen Burke", 81), ("Alexander George Hawke", 290), ("Antonio Zappia", 695),
    ("Christopher Eyles Bowen", 60), ("Robert Carl Katter", 352),
    # No exact row: a unique first and last name decides.
    ("Jason Wood", 679),
    # Two rows print this name; nothing decides.
    ("Robert James Brown", None),
    # Two people share the first and last name; only exact names decide.
    ("Anthony Smith", None), ("Anthony David Hawthorn Smith", 592),
])
def test_people_csv_gives_the_openaustralia_person(name, count):
    assert oa_person_count(index(), name) == count


def builder(tmp_path, members):
    """A Builder with the fixture sources cached and members-table people loaded as Builder.legacy does."""
    b = Builder(tmp_path, "2026-09-09")
    from scripts.export_profile_links import SOURCE_URL
    (tmp_path / stable_id("source", OA_URL)).write_text(REPRESENTATIVES_CSV)
    (tmp_path / stable_id("source", SOURCE_URL)).write_text(PEOPLE_CSV)
    b.oa_people_digest = hashlib.sha256(PEOPLE_CSV.encode()).hexdigest()
    for sid in ("source_identity", "source_aec"):
        b.put("sources", {"source_id": sid, "label": sid, "url": "https://example.org/" + sid, "fetched_at": "2026-09-09", "sha256": "0" * 64})
    for pid, name in members:
        b.put("people", {"person_id": stable_id("person", f"opax:{pid}"), "name": name, "legacy_person_id": pid,
                         "jurisdiction": "federal", "aliases": [], "sources": ["source_identity"]})
    return b


MEMBERS = [("10580", "Bill Shorten"), ("10571", "Bob Sercombe"), ("10592", "Tony Smith"),
           ("wragge_anthony_smith", "ANTHONY SMITH"), ("10679", "Jason Wood")]


def test_service_records_join_the_members_table_by_openaustralia_id(tmp_path):
    b = builder(tmp_path, MEMBERS)
    # Two candidacies in Maribyrnong: the member, under the name the AEC prints, and a namesake who never held it.
    eid = b.electorate("aec_division", "234", "Maribyrnong", "federal", "representatives", "vic", "source_aec")
    b.put("elections", {"election_id": "election_1", "jurisdiction": "federal", "poll_date": "2022-05-21"})
    b.put("contests", {"contest_id": "contest_1", "electorate_id": eid, "election_id": "election_1", "status": "final", "candidates": [
        {"candidate_id": "aec-1-1", "name": "Bill Shorten", "elected": True, "person_id": None},
        {"candidate_id": "aec-1-2", "name": "Alan Example", "elected": False, "person_id": None}]})
    b.history()
    terms = {t["representation_id"]: t for t in b.rows["terms"].values()}
    shorten = b.rows["people"][terms[stable_id("term", "oa:476")]["person_id"]]
    assert shorten["legacy_person_id"] == "10580" and shorten["name"] == "Bill Shorten"
    assert {"William Richard Shorten", "Bill Richard Shorten", "William Shorten"} <= set(shorten["aliases"])
    assert stable_id("source", OA_URL) in shorten["sources"]
    sercombe = b.rows["people"][terms[stable_id("term", "oa:467")]["person_id"]]
    assert sercombe["legacy_person_id"] == "10571" and "Robert Charles Grant Sercombe" in sercombe["aliases"]
    # The candidacy links through the reviewed name, and nobody else's.
    contest = b.rows["contests"]["contest_1"]["candidates"]
    assert contest[0]["person_id"] == shorten["person_id"] and contest[1]["person_id"] is None
    # No members-table row for Griffiths: the reviewed service supplement supplies
    # his own OpenAustralia 10268, never the contaminated wragge surname id.
    griffiths = b.rows["people"][terms[stable_id("term", "oa:226")]["person_id"]]
    assert griffiths["name"] == "Alan Gordon Griffiths" and griffiths["legacy_person_id"] == "10268"
    assert "Alan Griffiths" in griffiths["aliases"]
    # Two people named Anthony Smith: the Casey member joins 10592 by id; the Dickson member joins
    # neither 10592 nor the surname stub a first-and-last-name match would have given him.
    assert b.rows["people"][terms[stable_id("term", "oa:486")]["person_id"]]["legacy_person_id"] == "10592"
    dickson = b.rows["people"][terms[stable_id("term", "oa:485")]["person_id"]]
    assert dickson["name"] == "Anthony Charles Smith" and "legacy_person_id" not in dickson
    assert b.rows["people"][stable_id("person", "opax:wragge_anthony_smith")]["aliases"] == []
    # One person, two printed names, one id.
    assert {terms[stable_id("term", f"oa:{n}")]["person_id"] for n in (552, 657)} == {stable_id("person", "opax:10679")}
    assert check_people(b.bundle())["elected_candidacies_unlinked"] == 0


def test_a_member_whose_openaustralia_id_is_another_persons_is_never_joined_by_name(tmp_path):
    # The members table holds 'Jason Wood' under an id people.csv gives someone else: no name join.
    b = builder(tmp_path, [("10999", "Jason Wood")])
    b.history()
    for n in (552, 657):
        p = b.rows["people"][b.rows["terms"][stable_id("term", f"oa:{n}")]["person_id"]]
        assert p.get("legacy_person_id") != "10999"


def test_an_unpinned_people_register_stops_the_build(tmp_path):
    b = builder(tmp_path, MEMBERS)
    b.oa_people_digest = "0" * 64
    with pytest.raises(ValueError, match="pinned digest"):
        b.history()


def test_one_opax_id_on_two_people_stops_the_build():
    bundle = {"people": [{"person_id": "person_a", "legacy_person_id": "10580"},
                         {"person_id": "person_b", "legacy_person_id": "10580"}], "terms": [], "contests": []}
    with pytest.raises(ValueError, match="more than one person"):
        check_people(bundle)


def test_published_release_carries_the_service_record_identities():
    public = Path(__file__).resolve().parents[1] / "portal/public"
    manifest = json.loads((public / "electorates/manifest.json").read_text())
    people = json.loads((public / manifest["people_url"].lstrip("/")).read_text())["people"]
    reference = json.loads((public / manifest["reference_url"].lstrip("/")).read_text())
    by_legacy = {p.get("legacy_person_id"): p for p in people}
    assert by_legacy["10580"]["name"] == "Bill Shorten" and "William Richard Shorten" in by_legacy["10580"]["aliases"]
    assert by_legacy["10571"]["name"] == "Bob Sercombe" and "Robert Charles Grant Sercombe" in by_legacy["10571"]["aliases"]
    # No service-record twin of a members-table person survives under its legal name.
    assert not [p for p in people if p["name"] in ("William Richard Shorten", "Robert Charles Grant Sercombe")]
    shorten = {c["candidate_id"]: c["person_id"] for contest in reference["contests"] for c in contest["candidates"]
               if c["candidate_id"] in ("aec-24310-32388", "aec-27966-36441")}
    assert set(shorten.values()) == {by_legacy["10580"]["person_id"]}
    counts = check_people(reference)
    assert counts["elected_candidacies_unlinked"] == 0
    assert counts["service_people_without_legacy_person_id"] <= 124


def test_relinking_a_bundle_repeats_history_exactly(tmp_path):
    """scripts/relink_electorate_people.py undoes Builder.history() and runs it again: same rows."""
    from scripts.relink_electorate_people import relink
    b = builder(tmp_path, MEMBERS)
    eid = b.electorate("aec_division", "234", "Maribyrnong", "federal", "representatives", "vic", "source_aec")
    b.put("elections", {"election_id": "election_1", "jurisdiction": "federal", "poll_date": "2022-05-21"})
    b.put("contests", {"contest_id": "contest_1", "electorate_id": eid, "election_id": "election_1", "status": "final", "candidates": [
        {"candidate_id": "aec-1-1", "name": "Bill Shorten", "elected": True, "person_id": None}]})
    b.history()
    first = b.bundle()
    first["coverage"]["notes"] = ["fixture"]
    again = relink(json.loads(json.dumps(first)), tmp_path, as_of="2026-09-09", people_digest=b.oa_people_digest)
    key = lambda rows, k: sorted(rows, key=lambda r: r[k])
    for table, k in [("people", "person_id"), ("terms", "representation_id"), ("contests", "contest_id"), ("sources", "source_id")]:
        assert key(again[table], k) == key(first[table], k)


def _validator(root):
    import importlib.util
    spec = importlib.util.spec_from_file_location("validate_data", Path(__file__).resolve().parents[1] / "scripts/vm/validate_data.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ROOT = root
    return module.check_electorates


def _release(root, people, contests):
    release = root / "portal/public/electorates/releases/r1"
    release.mkdir(parents=True)
    files = {}
    for name, body in {"people.json": {"people": people}, "reference.json": {"people": people, "contests": contests},
                       "index.json": {}, "crosswalk.json": {}}.items():
        raw = json.dumps(body)
        (release / name).write_text(raw)
        files[name] = hashlib.sha256(raw.encode()).hexdigest()
    base = "/electorates/releases/r1/"
    (root / "portal/public/electorates/manifest.json").write_text(json.dumps({
        "release_id": "r1", "files": files, **{k: base + f for k, f in [("index_url", "index.json"), ("people_url", "people.json"),
                                                                       ("reference_url", "reference.json"), ("crosswalk_url", "crosswalk.json")]}}))


def test_validate_data_electorates_catches_an_unlinked_member_and_a_shared_id(tmp_path):
    people = [{"person_id": "person_a", "name": "Bill Shorten", "legacy_person_id": "10580"},
              {"person_id": "person_b", "name": "William Richard Shorten"}]
    _release(tmp_path, people, [{"candidates": [{"candidate_id": "aec-27966-36441", "name": "Bill Shorten", "elected": True, "person_id": None}]}])
    assert _validator(tmp_path)() == ["elected candidacy aec-27966-36441 (Bill Shorten) names no person"]
    people[1]["legacy_person_id"] = "10580"
    (tmp_path / "portal").rename(tmp_path / "old")
    _release(tmp_path, people, [{"candidates": [{"candidate_id": "c1", "name": "Bill Shorten", "elected": True, "person_id": "person_a"}]}])
    assert _validator(tmp_path)() == ["OPAX person id 10580 is held by person_a and person_b"]


def test_validate_data_electorates_passes_the_published_release():
    assert _validator(Path(__file__).resolve().parents[1])() == []
