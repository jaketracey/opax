"""Exercise the actual nightly federal module against both chamber fixtures."""
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys

root, stage = map(Path, sys.argv[1:])
fixtures = root / 'tests/fixtures/openaustralia'
stage.mkdir(parents=True)
people = (fixtures/'people.xml').read_text()
house_people = people.replace('person/101','person/201').replace('person/102','person/202').replace('/lord/','/member/')
(stage/'people.xml').write_text(people.replace('</people>',house_people.replace('<people>','')))
senators = (fixtures/'senators.xml').read_text()
(stage/'senators.xml').write_text(senators)
(stage/'representatives.xml').write_text(senators.replace('/lord/','/member/').replace('house="senate"','house="representatives"'))
for house, folder in [('senate','senate_debates'),('representatives','representatives_debates')]:
    dest=stage/'raw'/folder;dest.mkdir(parents=True)
    sitting=(fixtures/'sitting.xml').read_text()
    if house=='representatives':sitting=sitting.replace('/lords/','/debate/').replace('/lord/','/member/')
    (dest/'2026-10-13.xml').write_text(sitting)
    shutil.copyfile(fixtures/'no-sitting.xml',dest/'2026-10-14.xml')
db_path=stage/'fixture.db'
with sqlite3.connect(db_path) as db:
    db.executescript('''
    CREATE TABLE members(person_id TEXT,full_name TEXT,first_name TEXT,last_name TEXT,chamber TEXT,entered_house TEXT,left_house TEXT);
    INSERT INTO members VALUES('101','Alex Example','Alex','Example','senate','2000',NULL),('102','Sam Fixture','Sam','Fixture','senate','2000',NULL),
      ('201','Alex Example','Alex','Example','representatives','2000',NULL),('202','Sam Fixture','Sam','Fixture','representatives','2000',NULL);
    CREATE TABLE divisions(division_id INT,house TEXT,date TEXT,number INT,state TEXT);
    CREATE TABLE speeches(speech_id INTEGER PRIMARY KEY,person_id TEXT,speaker_name TEXT,party TEXT,
      electorate TEXT,chamber TEXT,date TEXT,topic TEXT,text TEXT,word_count INT,source TEXT);
    ''')
    from parli.ingest.openaustralia_xml import EXT_DDL
    db.executescript(EXT_DDL)
command=[sys.executable,'-m','parli.ingest.federal_feed','--offline','--db',str(db_path),'--stage',str(stage),
         '--start','2026-10-13','--end','2026-10-14','--modern-dir',str(stage/'modern'),'--load-divisions']
subprocess.run(command,check=True,capture_output=True)
report=json.loads((stage/'dry-run.json').read_text())
assert not report['issues']
assert [d['status'] for d in report['days']].count('sitting')==2
assert [d['status'] for d in report['days']].count('no_sitting')==2
for house in ['representatives','senate']:
    assert (stage/'modern'/f'2026-10-13_{house}.jsonl').stat().st_size>0
    assert not (stage/'modern'/f'2026-10-14_{house}.jsonl').exists()
from parli.ingest import speeches as S
S.MODERN_DIR=stage/'modern'
with sqlite3.connect(db_path) as db:
    assert S.load_modern_jsonl(db,set(),since='2026-10-13',until='2026-10-14')==2
subprocess.run(command,check=True,capture_output=True)
with sqlite3.connect(db_path) as db:
    assert db.execute('SELECT COUNT(*) FROM ext_divisions').fetchone()[0]==2
    assert db.execute('SELECT COUNT(*) FROM ext_votes').fetchone()[0]==4
    assert S.load_modern_jsonl(db,set(),since='2026-10-13',until='2026-10-14')==0
    assert db.execute('SELECT COUNT(*) FROM speeches').fetchone()[0]==2
