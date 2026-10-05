"""backfill_photos_oa.plan(): a roster name goes on a pid's portrait only when it is that pid's person."""
import unittest

from scripts import backfill_photos_oa as oa

OWNER = {"10098": "George Campbell", "10903": "Rex Patrick", "10922": "Pat Conaghan", "10875": "Damian Drum",
         "10080": "Anna Burke", "10081": "Tony Burke", "11036": "Kara Cook", "11055": "Jessica Collins"}
IDENTITY = {"same_person": {"kevin drum": {"key": "10875"}}, "wrong_face": {"10080": "Tony Burke's portrait"}}


def person(name, pid, states=("federal",)):
    return {"name": name, "pid": pid, "states": list(states)}


class PlanTests(unittest.TestCase):
    def plan(self, people, pm=None, have=()):
        return oa.plan(people, pm or {}, set(have), OWNER, IDENTITY)

    def test_a_name_on_another_persons_pid_is_skipped(self):
        to_map, to_fetch, skipped = self.plan(
            [person("George Campbell", "10098"), person("Graeme Campbell", "10098"),
             person("Patrick Conaghan", "10903"), person("Patrick Farmer", "10903")])
        self.assertEqual(to_fetch, [("george campbell", "10098")])
        self.assertEqual(skipped, {"graeme campbell": "10098 is George Campbell",
                                   "patrick conaghan": "10903 is Rex Patrick",
                                   "patrick farmer": "10903 is Rex Patrick"})

    def test_a_renamed_full_name_maps_to_the_file_on_disk(self):
        to_map, to_fetch, _ = self.plan([person("Pat Conaghan", "10922"), person("Kevin Drum", "10875")],
                                        have={"10922", "10875"})
        self.assertEqual(to_map, {"pat conaghan": "10922", "kevin drum": "10875"})
        self.assertEqual(to_fetch, [])

    def test_a_wrong_face_file_is_never_mapped(self):
        to_map, _, skipped = self.plan([person("Anna Burke", "10080")], have={"10080"})
        self.assertEqual(to_map, {})
        self.assertEqual(skipped, {"anna burke": "10080 is wrong_face"})

    def test_surname_prints_only_come_with_a_federal_fetch(self):
        to_map, to_fetch, skipped = self.plan(
            [person("Burke", "10081"), person("Cook", "11036"), person("Collins", "11055", ("federal", "qld"))],
            have={"10081"})
        self.assertEqual(to_map, {})
        self.assertEqual(to_fetch, [("cook", "11036")])
        self.assertEqual(skipped, {"collins": "surname-only print outside federal parliament"})

    def test_mapped_names_and_unknown_owners_are_left_alone(self):
        to_map, to_fetch, skipped = self.plan([person("Tony Burke", "10081"), person("Jo Bloggs", "99999")],
                                              pm={"tony burke": "10081"})
        self.assertEqual((to_map, to_fetch), ({}, []))
        self.assertEqual(skipped, {"jo bloggs": "99999 has no known owner"})


class AgreesTests(unittest.TestCase):
    def test_nicknames_initials_and_long_surnames(self):
        for name, owner in [("Phil Barresi", "Phillip Barresi"), ("K.J. Maher", "Kyam Maher"),
                            ("D O’Brien", "Danny O'Brien"), ("D.C. van Holst Pellekaan", "Dan van Holst Pellekaan")]:
            self.assertTrue(oa.agrees(name, owner), name)
        for name, owner in [("Ricky Johnston", "David Johnston"), ("Robert Baldwin", "Stuart Robert"),
                            ("Stephen Martin", "Steve Martin")]:
            self.assertFalse(oa.agrees(name, owner), name)


if __name__ == "__main__":
    unittest.main()
