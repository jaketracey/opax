"""Offline Git fixture runs the actual QAO weekly held/bootstrap control flow."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (ROOT/'scripts/weekly_refresh.sh').read_text()
BLOCK = '  # QAO phase 1.' + SOURCE.split('  # QAO phase 1.',1)[1].split('  # Metadata-only FRL group.',1)[0]
ENV = {k:v for k,v in os.environ.items() if not k.startswith('GIT_')}
ENV.update(GIT_CONFIG_GLOBAL=os.devnull,GIT_CONFIG_NOSYSTEM='1')


class Tests(unittest.TestCase):
    def setUp(self):
        state=ROOT/'scripts/state/qao';state.mkdir(parents=True,exist_ok=True)
        temp=tempfile.TemporaryDirectory(dir=state);self.addCleanup(temp.cleanup);self.repo=Path(temp.name)
        self.git('init','-q');(self.repo/'seed').write_text('seed');self.git('add','seed');self.git('commit','-qm','fixture')

    def git(self,*args):
        result=subprocess.run(['git','-c','user.name=fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false',*args],cwd=self.repo,env=ENV,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr);return result.stdout

    def run_block(self,held=False):
        stub='''set -eu
PY=unused
EXPORT=unused
log() { echo "$1"; }
run_step() { echo "STEP $1"; if [ "$1" = qao_reports ] && [ "$HELD" = 1 ]; then return 3; fi; }
'''
        # Stub reports successful acquisition/export unless the source is held.
        stub=stub.replace('then return 3; fi; }','then return 3; fi; return 0; }')
        result=subprocess.run(['/bin/bash'],input=stub+f'HELD={int(held)}\n'+BLOCK,cwd=self.repo,env=ENV,text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr);return result.stdout

    def publish(self):
        folder=self.repo/'portal/public/audit';folder.mkdir(parents=True);(folder/'manifest.json').write_text('{}')
        self.git('add','portal/public/audit');self.git('commit','-qm','catalogue fixture')

    def test_bootstrap_held_and_tracked(self):
        self.assertNotIn('STEP ',self.run_block())
        folder=self.repo/'portal/public/audit';folder.mkdir(parents=True);(folder/'manifest.json').write_text('{}')
        self.assertNotIn('STEP ',self.run_block())
        self.git('add','portal/public/audit');self.git('commit','-qm','catalogue fixture')
        self.assertEqual(self.run_block().splitlines(),['STEP qao_reports','STEP x_audit'])
        trace=self.run_block(held=True);self.assertIn('last good export kept',trace);self.assertNotIn('STEP x_audit',trace)

    def test_quiet_and_keep_if_unchanged_are_wired(self):
        self.assertIn('--quiet-hours',BLOCK)
        self.assertIn('"$EXPORT" dir portal/public/audit',BLOCK)
        groups=(ROOT/'scripts/vm/data_groups.sh').read_text();self.assertIn('[audit]="portal/public/audit"',groups)


if __name__=='__main__':unittest.main()
