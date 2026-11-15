"""scripts/roster_sitting_party.py: the one accept-list rule that may write party_now on a folded sitting member.

    python3 -m unittest scripts.test_roster_sitting_party
"""
import copy
import datetime
import unittest

from scripts import roster_accept
from scripts.roster_sitting_party import group_problem, site, source_problem

SOURCES = [{"url": "https://www.example.org/news/new-party", "date": "2026-06-25", "says": "Sam Fixture formed the Test Party"},
           {"url": "https://register.example.net/parties", "date": "2026-10-02", "says": "Test Party registered, founded by Sam Fixture"}]


def row(**extra):
    return {"name": "Sam Fixture", "speeches": 15, "party": "Independent", "states": ["federal"], "chambers": ["representatives"],
            "first": 2019, "last": 2026, "pid": "90001", "current": True, "party_now": "Independent", "prints": ["Fixture"],
            "representation": [], **extra}


def accept(**person):
    people = {"Sam Fixture": {"pid": "90001", "from": "Independent", "to": "Test Party", "sources": copy.deepcopy(SOURCES), **person}}
    return {"evidence": {"moved": {"kind": "identity", "rule": "sitting-party", "checked": "2026-11-16",
                                   "url": "docs/roster-reverify-2026-11-16.md", "reason": "fixture", "people": people},
                         "plain": {"kind": "identity", "checked": "2026-11-16", "url": "https://example.org", "reason": "fixture"}},
            "records": {"Sam Fixture": [{"evidence": "moved", "fields": {"party_now": ["Independent", "Test Party"]}}]},
            "new": {}, "drop": {}}


def held(acc, people, curated=None):
    return roster_accept.validate(acc, people, curated={} if curated is None else curated)


class SittingParty(unittest.TestCase):
    def test_a_sourced_change_of_party_passes_the_gate_on_a_folded_person_and_installs(self):
        acc, shipped = accept(), [row()]
        self.assertEqual(held(acc, shipped), [])
        # an ordinary identity group is still held by the fold
        plain = copy.deepcopy(acc)
        plain["records"]["Sam Fixture"][0]["evidence"] = "plain"
        self.assertIn("a folded person: party_now stay as shipped", held(plain, shipped)[0])
        fresh = [row(party_now="Test Party")]
        people, report = roster_accept.apply(shipped, fresh, acc)
        self.assertEqual((report["applied"], report["held"]), (1, []))
        self.assertEqual(people[0], row(party_now="Test Party"))
        # installed, it stays valid, survives an export that still says the old party, and reverts exactly
        self.assertEqual(held(acc, people), [])
        again, report = roster_accept.apply(people, [row()], acc)
        self.assertEqual((again, report["unchanged"], report["held"]), (people, 1, []))
        self.assertEqual(roster_accept.revert(people, acc), shipped)

    def test_it_writes_party_now_and_nothing_else(self):
        for fields in ({"party_now": ["Independent", "Test Party"], "party": ["Independent", "Test Party"]},
                       {"party": ["Independent", "Test Party"]},
                       {"party_now": ["Independent", "Test Party"], "current": [True, False]},
                       {"party_now": ["Independent", "Test Party"], "prints": [["Fixture"], []]}):
            acc = accept()
            acc["records"]["Sam Fixture"][0]["fields"] = fields
            self.assertTrue(held(acc, [row()]), fields)

    def test_the_row_must_be_the_sitting_federal_person_the_evidence_names(self):
        for bad in (row(current=False), row(states=["nsw"]), row(pid="90002"), {k: v for k, v in row().items() if k != "pid"}):
            self.assertTrue(held(accept(), [bad]), bad)
        acc = accept()
        acc["records"]["Alex Example"] = acc["records"].pop("Sam Fixture")
        self.assertIn("the evidence does not name this person", held(acc, [row(name="Alex Example")])[0])
        self.assertIn("not the evidence's", held(accept(to="Other Party"), [row()])[0])
        self.assertTrue(held(accept(**{"from": "Liberal"}), [row()]))

    def test_a_label_the_person_keeps_is_added_to_parties_and_nothing_is_removed(self):
        def kept(had, has, **person):
            acc = accept(**{"from": "Nationals", "to": "LNP", "keeps": "Nationals", **person})
            acc["records"]["Sam Fixture"][0]["fields"] = {"party_now": ["Nationals", "LNP"], "parties": [had, has]}
            return acc
        lnp = row(party="LNP", party_now="Nationals")
        self.assertEqual(held(kept(None, ["LNP", "Nationals"]), [lnp]), [])
        people, report = roster_accept.apply([lnp], [row(party="LNP", party_now="LNP", parties=["LNP", "Nationals"])],
                                             kept(None, ["LNP", "Nationals"]))
        self.assertEqual((report["applied"], people[0]["party_now"], people[0]["parties"]), (1, "LNP", ["LNP", "Nationals"]))
        self.assertEqual(roster_accept.revert(people, kept(None, ["LNP", "Nationals"])), [lnp])
        listed = row(party="Liberal", party_now="Nationals", parties=["Liberal", "LNP"])
        self.assertEqual(held(kept(["Liberal", "LNP"], ["Liberal", "LNP", "Nationals"]), [listed]), [])
        for had, has, shipped in ((None, ["Nationals", "LNP"], lnp), (None, ["LNP", "Nationals", "Greens"], lnp),
                                  (None, ["LNP"], lnp), (["Liberal", "LNP"], ["LNP", "Nationals"], listed),
                                  (["Liberal", "Nationals"], ["Liberal", "Nationals", "Nationals"], row(party="Liberal", party_now="Nationals", parties=["Liberal", "Nationals"])),
                                  (None, ["LNP", "Nationals"], row(party="Liberal", party_now="Nationals"))):
            self.assertTrue(held(kept(had, has), [shipped]), (had, has))
        self.assertTrue(held(kept(None, ["LNP", "Greens"], keeps="Greens"), [lnp]))
        # without `keeps` in the evidence, parties may not be written at all
        acc = kept(None, ["LNP", "Nationals"])
        del acc["evidence"]["moved"]["people"]["Sam Fixture"]["keeps"]
        self.assertTrue(held(acc, [lnp]))
        # and with it, party_now alone is not enough
        acc = accept(**{"from": "Nationals", "to": "LNP", "keeps": "Nationals"})
        acc["records"]["Sam Fixture"][0]["fields"] = {"party_now": ["Nationals", "LNP"]}
        self.assertTrue(held(acc, [lnp]))

    def test_other_protections_still_hold_the_change(self):
        fields = roster_accept.PARTY_FIELDS
        self.assertIn("pinned in the reviewed roster evidence", held(accept(), [row()], {"Sam Fixture": fields})[0])
        dated = row(affiliations=[{"jurisdiction": "federal", "party": "Independent", "start": "2019-05-18", "end": None}])
        self.assertIn("a dated party", held(accept(), [dated])[0])
        split = row(speech_scope={"state": "federal"}, speech_count_basis="pending")
        self.assertIn("a pinned witness split", held(accept(), [split])[0])

    def test_two_dated_sources_on_two_sites_and_never_parliaments_own_site(self):
        ok = lambda sources, name="Sam Fixture", checked="2026-11-16": source_problem(sources, name, checked)
        self.assertIsNone(ok(SOURCES))
        one_site = [SOURCES[0], {**SOURCES[1], "url": "https://example.org/other"}]
        barred = [SOURCES[0], {**SOURCES[1], "url": "https://www.aph.gov.au/Senators_and_Members"}]
        parlinfo = [SOURCES[0], {**SOURCES[1], "url": "https://parlinfo.aph.gov.au/x"}]
        undated = [SOURCES[0], {**SOURCES[1], "date": "October 2026"}]
        unsaid = [SOURCES[0], {k: v for k, v in SOURCES[1].items() if k != "says"}]
        for bad in (None, [], SOURCES[:1], one_site, barred, parlinfo, undated, unsaid, [SOURCES[0], "https://x.example"],
                    [SOURCES[0], {**SOURCES[1], "url": "ftp://register.example.net/parties"}],
                    [SOURCES[0], {**SOURCES[1], "url": "https://localhost/parties"}]):
            self.assertTrue(ok(bad), bad)
            self.assertTrue(held(accept(sources=bad), [row()]), bad)

    def test_a_source_date_is_a_real_day_no_later_than_the_check(self):
        dated = lambda day: [SOURCES[0], {**SOURCES[1], "date": day}]
        for day in ("2099-99-99", "2026-02-30", "2026-13-01", "0000-00-00", "2026-11-17", "2099-01-01", "26-10-02", "2026-10-2"):
            self.assertTrue(source_problem(dated(day), "Sam Fixture", "2026-11-16"), day)
            self.assertTrue(held(accept(sources=dated(day)), [row()]), day)
        self.assertIsNone(source_problem(dated("2026-11-16"), "Sam Fixture", "2026-11-16"))
        # the check date itself is a real day, and not ahead of today
        today = datetime.date(2026, 11, 16)
        for checked in ("2099-99-99", "2026-11-17", None, "yesterday"):
            self.assertTrue(source_problem(SOURCES, "Sam Fixture", checked, today), checked)
        future = accept()
        future["evidence"]["moved"]["checked"] = "2099-01-01"
        self.assertTrue(held(future, [row()]))

    def test_two_hosts_of_one_site_are_one_source(self):
        self.assertEqual(site("https://www.abc.net.au/news/x"), "abc.net.au")
        self.assertEqual(site("https://live.abc.net.au/x"), "abc.net.au")
        self.assertEqual(site("https://data.openaustralia.org.au/members/senators.xml"), "openaustralia.org.au")
        self.assertEqual(site("https://news.example.com/a"), "example.com")
        self.assertEqual(site("https://theconversation.com/a"), "theconversation.com")
        self.assertEqual(site("https://www.bbc.co.uk/a"), "bbc.co.uk")
        subdomains = [{**SOURCES[0], "url": "https://news.example.org/a"}, {**SOURCES[1], "url": "https://blog.example.org/b"}]
        au = [{**SOURCES[0], "url": "https://www.abc.net.au/news/a"}, {**SOURCES[1], "url": "https://live.abc.net.au/b"}]
        for bad in (subdomains, au):
            self.assertEqual(source_problem(bad, "Sam Fixture", "2026-11-16"), "fewer than two sites have a source that names the person")
            self.assertTrue(held(accept(sources=bad), [row()]), bad)
        apart = [{**SOURCES[0], "url": "https://www.abc.net.au/news/a"}, {**SOURCES[1], "url": "https://www.sbs.com.au/b"}]
        self.assertIsNone(source_problem(apart, "Sam Fixture", "2026-11-16"))

    def test_the_sources_must_name_the_person_so_one_members_sources_cannot_stand_for_anothers(self):
        self.assertIsNone(source_problem(SOURCES, "Sam Fixture", "2026-11-16"))
        self.assertTrue(source_problem(SOURCES, "Alex Example", "2026-11-16"))
        # Sam Fixture's evidence, copied whole to another sitting member, is held
        acc = accept()
        acc["evidence"]["moved"]["people"]["Alex Example"] = {**acc["evidence"]["moved"]["people"]["Sam Fixture"], "pid": "90002"}
        acc["records"]["Alex Example"] = copy.deepcopy(acc["records"]["Sam Fixture"])
        other = row(name="Alex Example", pid="90002", prints=["Example"])
        problems = held(acc, [row(), other])
        self.assertEqual(len(problems), 1)
        self.assertIn("Alex Example: fewer than two sites have a source that names the person", problems[0])
        # a source that does not name the person supports the change but is not one of the two
        register = {"url": "https://register.example.net/parties", "date": "2026-10-02", "says": "Test Party registered"}
        named = {"url": "https://news.example.com/a", "date": "2026-06-26", "says": "Fixture joins the Test Party"}
        self.assertTrue(source_problem([SOURCES[0], register], "Sam Fixture", "2026-11-16"))
        self.assertIsNone(source_problem([SOURCES[0], register, named], "Sam Fixture", "2026-11-16"))
        # a surname inside another word is not the person
        self.assertTrue(source_problem([SOURCES[0], {**named, "says": "Fixtures and fittings join the Test Party"}], "Sam Fixture", "2026-11-16"))

    def test_an_office_or_an_unchanged_party_is_not_a_change_of_party(self):
        group = {"fields": {"party_now": ["Independent", "SPK"]}}
        evidence = accept(to="SPK")["evidence"]["moved"]
        self.assertEqual(group_problem("Sam Fixture", group, row(), evidence), "the new party is not a party name")
        same = accept(to="Independent")
        same["records"]["Sam Fixture"][0]["fields"] = {"party_now": ["Independent", "Independent"]}
        self.assertTrue(held(same, [row()]))


if __name__ == "__main__":
    unittest.main()
