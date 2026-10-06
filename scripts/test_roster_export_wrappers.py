"""The roster safety net through the real weekly path: scripts/vm/export_step.sh json ... bash
scripts/vm/export_people.sh, which runs export_parliamentarians.py (production SQL, unpatched) against a
database whose members table knows no federal member, so every person id and seat would vanish. Whatever the
baseline, the shipped parliamentarians.json must survive unless OPAX_ROSTER_ACCEPT=1 (docs/PHOTOS.md,
"Nightly safety net").

    python3 -m unittest scripts.test_roster_export_wrappers     # needs git and the sqlite3 CLI
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COPIED = ["scripts/vm/export_step.sh", "scripts/vm/export_people.sh", "scripts/vm/keep_if_unchanged.py",
          "scripts/export_parliamentarians.py", "scripts/roster_identity.py", "scripts/enrich_profile_jurisdictions.py",
          "scripts/roster_service.json", "scripts/roster_witness_service.json", "scripts/roster_state_evidence.json", "portal/public/electorates/manifest.json",
          "portal/public/electorates/releases/b56417062ccc33cf/reference.json",
          "scripts/person_identity.json", "portal/public/research/mlci.json", "portal/public/votes.json",
          "portal/public/pay.json", "portal/public/electorates/releases/b56417062ccc33cf/people.json"]
ROSTER = "portal/public/parliamentarians.json"
SITTING = [("Anthony Albanese", "10007"), ("Pat Conaghan", "10922")]


def shipped_roster():
    rows = [{"name": n, "speeches": 6, "party": "Labor", "states": ["federal"], "chambers": ["representatives"],
             "first": 2025, "last": 2025, "pid": pid, "current": True, "party_now": "Labor", "representation": []}
            for n, pid in SITTING]
    return json.dumps({"meta": {"generated": "2026-10-05", "people": len(rows)}, "people": rows},
                      separators=(",", ":")).encode() + b"\n"


@unittest.skipUnless(shutil.which("git") and shutil.which("sqlite3"), "needs git and the sqlite3 CLI")
class RealWrapperTests(unittest.TestCase):
    def sandbox(self, baseline):
        """A git checkout holding the export scripts and `baseline` as the committed roster (None: no file)."""
        box = Path(tempfile.mkdtemp(prefix="roster-wrappers-"))
        self.addCleanup(shutil.rmtree, box, True)
        for rel in COPIED:
            (box / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / rel, box / rel)
        (box / "parli").symlink_to(ROOT / "parli")
        if baseline is not None:
            (box / ROSTER).write_bytes(baseline)
        git = lambda *a: subprocess.run(["git", *a], cwd=box, check=True, capture_output=True)  # noqa: E731
        git("init", "-q")
        git("add", "-A")
        git("-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline")
        # The production schema, its later columns, and no federal member in the members table.
        sys.path.insert(0, str(ROOT))
        from parli.schema import SCHEMA_SQL
        db = sqlite3.connect(box / "parli.db")
        db.executescript(SCHEMA_SQL)
        db.execute("PRAGMA foreign_keys=OFF")  # the point: speeches whose person ids the members table lost
        db.executescript("ALTER TABLE speeches ADD COLUMN witness_name TEXT;"
                         "ALTER TABLE members ADD COLUMN state TEXT; ALTER TABLE members ADD COLUMN party_canonical TEXT;")
        db.execute("INSERT INTO members (person_id, full_name, first_name, last_name, state, chamber) "
                   "VALUES ('qld_fixture', 'Fixture Member', 'Fixture', 'Member', 'qld', 'qld_la')")
        for name, pid in SITTING:
            for i in range(6):
                db.execute("INSERT INTO speeches (person_id, speaker_name, party, party_canonical, state, chamber, date, "
                           "text, source) VALUES (?,?,?,?,?,?,?,?,?)",
                           (pid, name, "ALP", "ALP", "federal", "representatives", "2025-03-0%d" % (i + 1),
                            f"Fixture speech {name} {i}. " + "The member spoke on the bill before the House. " * 8,
                            "test_fixture"))
        db.commit()
        db.close()
        return box

    def export(self, box, accept=False):
        env = {**os.environ, "PY": sys.executable, "OPAX_DB": str(box / "parli.db"), "PYTHONDONTWRITEBYTECODE": "1"}
        env.pop("OPAX_ROSTER_PREVIOUS", None)
        env["OPAX_ROSTER_ACCEPT"] = "1" if accept else ""
        r = subprocess.run(["bash", "scripts/vm/export_step.sh", "json", ROSTER, "bash", "scripts/vm/export_people.sh"],
                           cwd=box, env=env, capture_output=True, text=True, timeout=120)
        path = box / ROSTER
        return r.returncode, r.stderr, path.read_bytes() if path.exists() else None

    def test_a_good_baseline_holds_a_roster_that_lost_every_sitting_id(self):
        box = self.sandbox(shipped_roster())
        code, err, shipped = self.export(box)
        self.assertEqual(code, 3, err)
        self.assertIn("ROSTER HELD: 2 sitting member row(s) lose their id or seat", err)
        self.assertEqual(shipped, shipped_roster(), "the shipped roster is kept byte for byte")

    def test_no_usable_baseline_holds_too(self):
        for case, baseline, why in [("missing", None, "no shipped roster at"),
                                    ("malformed JSON", b"{", "cannot be read (JSONDecodeError"),
                                    ("people null", b'{"people":null}\n', "has no people to compare with")]:
            with self.subTest(case):
                box = self.sandbox(baseline)
                code, err, shipped = self.export(box)
                self.assertEqual(code, 3, err)
                self.assertIn("ROSTER HELD:", err)
                self.assertIn(why, err)
                self.assertEqual(shipped, baseline, "nothing is installed")

    def test_the_reviewed_override_installs_the_export(self):
        box = self.sandbox(b"{")
        code, err, shipped = self.export(box, accept=True)
        self.assertEqual(code, 0, err)
        rows = json.loads(shipped)["people"]
        self.assertEqual({r["name"] for r in rows}, {n for n, _ in SITTING})
        self.assertFalse(any(r.get("pid") for r in rows), "the override ships exactly what the export said")


class ShippedIdentityReplayTests(unittest.TestCase):
    sandbox = RealWrapperTests.sandbox
    export = RealWrapperTests.export
    def populate_replay(self, box, scenario):
        """Reviewer A/B shapes: witnesses only in committees; B also has MP committee turns.

        Counts are compressed, while house lists and years retain the frozen
        public aggregate. Deliberately invalid service years must be excluded.
        """
        from scripts.roster_identity import pinned_members
        shipped=json.loads((ROOT/ROSTER).read_text())
        # Fixed public export fixture: works without a remote ref or mutable
        # origin/main, and retains the original bad joins for regression coverage.
        old=json.loads((ROOT/'tests/fixtures/roster-export/prints-23cad95a.json').read_text())
        rows=old['people'];db=sqlite3.connect(box/'parli.db')
        db.execute('PRAGMA foreign_keys=OFF');db.execute('DELETE FROM speeches');db.execute('DELETE FROM members')
        people=pinned_members();member_ids={}
        for pid,m in people.items():
            name=m['names'][0]
            db.execute('INSERT INTO members (person_id,full_name,first_name,last_name,state,chamber,party,party_canonical,entered_house,left_house) VALUES (?,?,?,?,?,?,?,?,?,?)',
                       (pid,name,name.split()[0],name.split()[-1],'federal',m['chamber'],'Labor','Labor',
                        str(m['start'])+'-01-01' if m['start'] else None,str(m['end'])+'-12-31' if m['end'] else None))
        for p in rows:
            state=next((s for s in p['states'] if s!='federal'),None)
            house=next((c for c in p['chambers'] if c.startswith(str(state)+'_')),None)
            if not state or not house:continue
            name=p.get('full') or p['name'];pid=state+'-fixture-'+name
            member_ids[p['name']]=pid
            if db.execute('SELECT 1 FROM members WHERE person_id=?',(pid,)).fetchone():continue
            seat=next((r['electorate'] for r in p.get('representation',[]) if r['jurisdiction']==state),'')
            db.execute('INSERT INTO members (person_id,full_name,first_name,last_name,state,chamber,party,party_canonical,electorate,entered_house,left_house) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                       (pid,name,name.split()[0],name.split()[-1],state,house,p.get('party'),p.get('party'),seat,
                        str(p['first'])+'-01-01' if state=='qld' else None,None))
        # Current federal party follows the shipped federal id, not an assumed ALP.
        for p in shipped['people']:
            if p.get('pid') and p.get('current'):
                db.execute('UPDATE members SET left_house=NULL,party=?,party_canonical=? WHERE person_id=?',
                           (p.get('party_now'),p.get('party_now'),p['pid']))
        from scripts.roster_identity import COMMITTEES
        for p in rows:
            chambers = p.get('chambers') or ['representatives']
            comm = [c for c in chambers if c in COMMITTEES]; houses = [c for c in chambers if c not in COMMITTEES]
            n = p['speeches']; w = p.get('witness_rows', 0)
            size = min(n, 40)
            wit = round(w*size/n) if w else 0
            if w and wit == 0: wit = 1
            own = size - wit
            if n - w >= 5 and own < 5: own = 5
            if n - w >= 1 and own < 1: own = 1
            if wit + own < 5: wit = max(wit, 5 - own) if w else wit
            if w and w*2 > n and own*2 >= own+wit: wit = own+1   # keep witness-majority side
            plan = []
            for i in range(wit): plan.append(((comm or chambers)[i % len(comm or chambers)], True))
            own_chambers = houses or chambers
            for i in range(own):
                c = own_chambers[i % len(own_chambers)]
                if scenario == 'B' and comm and i == 0 and houses: c = comm[0]
                plan.append((c, False))
            for i, (chamber, witness) in enumerate(plan):
                st = chamber.split('_')[0] if '_' in chamber and 'committee' not in chamber else 'federal'
                if st not in p['states']: st = p['states'][0]
                year = p['first'] if i % 2 == 0 else p['last']
                pid = None if witness else (p.get('pid') or member_ids.get(p['name']))
                db.execute('INSERT INTO speeches (person_id,speaker_name,party,party_canonical,state,chamber,date,text,source,witness_name) VALUES (?,?,?,?,?,?,?,?,?,?)',
                    (pid,p['name'],None if witness else p.get('party'),None if witness else p.get('party'),st,chamber,f'{year}-03-{(i%28)+1:02}',
                     f"Replay {p['name']} speech {i}. "+'Parliamentary fixture text. '*12,'test_fixture','Witness' if witness else None))
        db.commit(); db.close()

    def test_box_shaped_export_ships_without_a_hold_after_witness_partition(self):
        from scripts.export_parliamentarians import IDENTITY_FIELDS, refusals
        shipped = json.loads((ROOT/ROSTER).read_text())['people']
        old = json.loads((ROOT/'tests/fixtures/roster-export/prints-23cad95a.json').read_text())['people']
        expected = {p['name']:p for p in shipped if p.get('speech_scope')}
        for scenario in ('A', 'B'):
            with self.subTest(scenario=scenario):
                box = self.sandbox((ROOT/ROSTER).read_bytes())
                self.populate_replay(box, scenario)
                code, err, output = self.export(box)
                self.assertEqual(code, 0, err)
                self.assertNotIn('ROSTER HELD', err)
                actual = json.loads(output)['people']
                by = {p['name']:p for p in actual}
                self.assertEqual(refusals(shipped,actual), [])
                # Robinson/Crawford have only 2/3 in-service house rows in this
                # compressed replay; committee and post-service rows cannot
                # rescue them to the five-row floor. The detailed fixture
                # supplies their observed own-service shape and restores all16.
                scoped = {p['name'] for p in actual if p.get('speech_scope')}
                self.assertEqual(scoped, expected.keys()-{'Robinson','Crawford'})
                for name in scoped:
                    self.assertEqual(by[name]['full'],expected[name]['full'])
                    self.assertEqual(by[name]['party'],expected[name]['party'])
                    self.assertGreaterEqual(by[name]['speeches'],5)
                for p in actual:
                    if p.get('separated_witnesses') and not p.get('speech_scope'):
                        for field in ('full','pid','party','parties','party_now','current','representation'):
                            self.assertFalse(p.get(field),(scenario,p['name'],field))
                for p in old:
                    if p.get('witness_rows',0)*2 > p['speeches'] and p['name'] not in scoped:
                        self.assertFalse(any(by[p['name']].get(k) for k in ('full','pid','party','representation')),p['name'])
                changes=[p['name'] for p in shipped if any(p.get(k)!=by[p['name']].get(k) for k in IDENTITY_FIELDS)]
                self.assertEqual(set(changes),{'Blandthorn',"D'Ambrosio",'McDermott','Robinson','Crawford'})
                print(f'Reviewer replay {scenario}: SHIPPED {len(actual)} records, {len(scoped)}/16 scoped; 5 identity differences / cap25; zero unscoped split identities; Robinson/Crawford below own-service floor',file=sys.stderr)


if __name__ == "__main__":
    unittest.main()
