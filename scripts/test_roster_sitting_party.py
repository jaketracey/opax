"""scripts/roster_sitting_party.py: the one accept-list rule that may write party_now on a folded sitting member.

    python3 -m unittest scripts.test_roster_sitting_party
"""
import copy
import unittest

from scripts import roster_accept
from scripts.roster_sitting_party import group_problem, source_problem

SOURCES = [{"url": "https://www.example.org/news/new-party", "date": "2026-06-25", "says": "Sam Fixture formed the Test Party"},
           {"url": "https://register.example.net/parties", "date": "2026-10-02", "says": "Test Party registered"}]


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
        self.assertIsNone(source_problem(SOURCES))
        one_site = [SOURCES[0], {**SOURCES[1], "url": "https://example.org/other"}]
        barred = [SOURCES[0], {**SOURCES[1], "url": "https://www.aph.gov.au/Senators_and_Members"}]
        parlinfo = [SOURCES[0], {**SOURCES[1], "url": "https://parlinfo.aph.gov.au/x"}]
        undated = [SOURCES[0], {**SOURCES[1], "date": "October 2026"}]
        unsaid = [SOURCES[0], {k: v for k, v in SOURCES[1].items() if k != "says"}]
        for bad in (None, [], SOURCES[:1], one_site, barred, parlinfo, undated, unsaid, [SOURCES[0], "https://x.example"],
                    [SOURCES[0], {**SOURCES[1], "url": "ftp://register.example.net/parties"}]):
            self.assertTrue(source_problem(bad), bad)
            self.assertTrue(held(accept(sources=bad), [row()]), bad)

    def test_an_office_or_an_unchanged_party_is_not_a_change_of_party(self):
        group = {"fields": {"party_now": ["Independent", "SPK"]}}
        evidence = accept(to="SPK")["evidence"]["moved"]
        self.assertEqual(group_problem("Sam Fixture", group, row(), evidence), "the new party is not a party name")
        same = accept(to="Independent")
        same["records"]["Sam Fixture"][0]["fields"] = {"party_now": ["Independent", "Independent"]}
        self.assertTrue(held(same, [row()]))


if __name__ == "__main__":
    unittest.main()
