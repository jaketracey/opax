import argparse,importlib.util,json,pathlib,sqlite3,sys,tempfile,unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
import label_workers,summary_workers
class PriorityTests(unittest.TestCase):
    def test_new_batches_take_priority_without_resetting_completed_or_claimed_work(self):
        for module in [label_workers,summary_workers]:
            with self.subTest(module=module.__name__),tempfile.TemporaryDirectory() as tmp:
                path=pathlib.Path(tmp)/'queue.sqlite';con=module.db(path)
                con.executemany('insert into queue(rid,status) values(?,?)',[('old','pending'),('done','done'),('active','claimed')]);con.commit();con.close()
                rids=pathlib.Path(tmp)/'rids.json';rids.write_text(json.dumps(['new','done','active']))
                original=module.db
                with patch.object(module,'db',lambda:original(path)):
                    module.cmd_init(argparse.Namespace(rids=str(rids),skip=0,priority=10))
                con=original(path)
                self.assertEqual(con.execute("select rid from queue where status='pending' order by priority desc,rowid").fetchall(),[('new',),('old',)])
                self.assertEqual(con.execute("select status,priority from queue where rid='done'").fetchone(),('done',0))
                self.assertEqual(con.execute("select status,priority from queue where rid='active'").fetchone(),('claimed',0))
                con.close()
if __name__=='__main__':unittest.main()
