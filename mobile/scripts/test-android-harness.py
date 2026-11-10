#!/usr/bin/env python3
"""Linux Android harness tests with isolated fake tools; never access adb/devices."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
import unittest
import zipfile

SCRIPTS = Path(__file__).resolve().parent


class AndroidHarnessTests(unittest.TestCase):
    def run_device(self, avd='OPAX_API34', fail=False, existing=1, variant='e2e', origin='http://10.0.2.2:8920', twice=False):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); mobile = root/'mobile'; scripts = mobile/'scripts'; scripts.mkdir(parents=True)
            for name in ('e2e-android-device.sh','qa-env.sh','qa-maestro.sh','qa-flows.sh','maestro-watch.py','android-parity-results.py'):
                shutil.copyfile(SCRIPTS/name, scripts/name)
            tools = root/'bin'; tools.mkdir(); out = root/'out'; out.mkdir()
            (out/'android-flows').mkdir()
            (out/'android-flows/01-launch.yaml').write_text('appId: au.com.opax.app\n---\n- launchApp\n')
            (out/'android-flows/02-search.yaml').write_text('appId: au.com.opax.app\n---\n- launchApp\n')
            (out/'android-flows/suite.json').write_text(json.dumps([{'path':'01-launch.yaml','run':True},{'path':'02-search.yaml','run':True}]))
            (scripts/'prepare-android-flows.py').write_text('print("")\n')
            (mobile/'node_modules/.bin').mkdir(parents=True)
            with zipfile.ZipFile(mobile/'fixture.apk','w') as archive:
                archive.writestr('assets/app.config',json.dumps({'version':'1.1.0','extra':{'variant':variant,'apiOrigin':origin}}))
            mock = '''#!/usr/bin/env python3
import json, os, pathlib, signal, sys, time
root=pathlib.Path(os.environ['MOCK_ROOT']); name=pathlib.Path(sys.argv[0]).name; args=sys.argv[1:]
with (root/'commands.jsonl').open('a') as log: log.write(json.dumps([name,*args])+'\\n')
if name=='adb':
    if args==['devices']:
        print('List of devices attached'); print('\\n'.join('emulator-'+str(5500+i*2)+'\\tdevice' for i in range(int(os.environ['MOCK_EXISTING']))))
    else:
        if args[:2]!=['-s',os.environ['MOCK_SERIAL']] and args[2:]!=['emu','avd','name']: raise SystemExit('Unscoped or foreign adb action')
        command=args[2:]
        if command==['emu','avd','name']: print('OPAX_Pixel_API36\\nOK')
        elif command==['shell','getprop','sys.boot_completed']: print('1')
        elif command==['shell','getprop','ro.build.version.sdk']: print('34' if '5602' in args[1] else '36')
        elif command==['emu','kill']: os.kill(int((root/'emulator.pid').read_text()),signal.SIGTERM)
elif name=='emulator':
    (root/'emulator.pid').write_text(str(os.getpid())); time.sleep(600)
elif name=='tsx':
    if args[0]=='scripts/fixture-server.ts': time.sleep(600)
elif name=='maestro':
    if os.environ['MOCK_FAIL']=='1':
        out=pathlib.Path(args[args.index('--test-output-dir')+1])
        hierarchy=out/'run/flow/screen-hierarchy/failed-step.json'
        hierarchy.parent.mkdir(parents=True,exist_ok=True)
        hierarchy.write_text(json.dumps({'attributes':{'text':'current failure'}}))
    raise SystemExit(int(os.environ['MOCK_FAIL']))
elif name=='xcrun': raise SystemExit('Linux must not invoke xcrun')
elif name=='git': print('a'*40)
'''
            for name in ('adb','emulator','maestro','xcrun','curl','lsof','git'):
                tool=tools/name; tool.write_text(mock if name not in ('curl','lsof') else '#!/bin/sh\nexit '+('0' if name=='curl' else '1')+'\n'); tool.chmod(0o755)
            tsx=mobile/'node_modules/.bin/tsx'; tsx.write_text(mock); tsx.chmod(0o755)
            port='5602' if avd=='OPAX_API34' else '5604'
            env={**os.environ,'PATH':str(tools)+':'+os.environ['PATH'], 'ANDROID_HOME':str(root/'sdk'),
                 'OPAX_FIXTURE_PORT':'8920','OPAX_ANDROID_METRO_PORT':'8183','OPAX_ANDROID_EMULATOR_PORT':port,
                 'OPAX_ANDROID_SKIP_DEBUG_PROOF':'1','OPAX_ANDROID_E2E_APK':str(mobile/'fixture.apk'),
                 'OPAX_ANDROID_SUITE_ONLY':'1','OPAX_ANDROID_CONTINUE_ON_FAILURE':'1','OPAX_EMULATOR_WAIT_SECONDS':'0',
                 'MOCK_ROOT':str(root),'MOCK_SERIAL':'emulator-'+port,'MOCK_FAIL':str(int(fail)), 'MOCK_EXISTING':str(existing)}
            for key in ('OPAX_PASTE_LOCK','OPAX_BUILD_GATE'): env.pop(key,None)
            child=subprocess.Popen(['bash','scripts/e2e-android-device.sh',avd,str(out),'--all-android' if twice else '01'],cwd=mobile,env=env,
                                   stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
            try:
                stdout, stderr=child.communicate(timeout=30)
            finally:
                try: os.killpg(child.pid,signal.SIGTERM)
                except ProcessLookupError: pass
            commands=[json.loads(line) for line in (root/'commands.jsonl').read_text().splitlines()]
            if fail and any(c[0]=='maestro' for c in commands):
                hierarchy=out/'maestro/01-launch/failure-ui.json'
                self.assertEqual(json.loads(hierarchy.read_text())['attributes']['text'],'current failure')
                self.assertFalse(any('uiautomator' in c for c in commands),'Reuse Maestro hierarchy rather than stale on-device XML')
            return child.returncode, stdout+stderr, commands, (out/'flow-results.tsv').read_text() if (out/'flow-results.tsv').exists() else ''

    @unittest.skipUnless(os.uname().sysname == 'Linux', 'Desktop harness branch')
    def test_scoped_serial_read_only_api36_and_cleanup_after_pass_or_failure(self):
        for avd, fail in [('OPAX_API34',False),('OPAX_Pixel_API36',True)]:
            with self.subTest(avd=avd):
                rc, log, commands, results=self.run_device(avd,fail)
                self.assertEqual(rc,int(fail),log)
                emulator=next(c for c in commands if c[0]=='emulator')
                self.assertEqual('-read-only' in emulator,avd=='OPAX_Pixel_API36')
                self.assertIn('-no-window',emulator); self.assertIn('-no-audio',emulator)
                adb=[c for c in commands if c[0]=='adb']
                self.assertTrue(any(c[-2:]==['emu','kill'] for c in adb),log)
                self.assertTrue(any(c[-5:]==['settings','put','system','font_scale','1.0'] for c in adb),log)
                self.assertTrue(results.strip().endswith(str(int(fail))),results)
                self.assertFalse(any(c[0]=='xcrun' for c in commands))

    @unittest.skipUnless(os.uname().sysname == 'Linux', 'Desktop harness branch')
    def test_three_emulator_cap_refuses_to_boot_or_stop_another_emulator(self):
        rc, log, commands, _ = self.run_device(existing=3)
        self.assertNotEqual(rc,0)
        self.assertIn('Three-emulator capacity',log)
        self.assertFalse(any(c[0]=='emulator' or c[-2:]==['emu','kill'] for c in commands))


    @unittest.skipUnless(os.uname().sysname == 'Linux', 'Desktop harness branch')
    def test_wrong_variant_or_fixture_origin_is_refused_before_boot(self):
        for variant, origin in [('production','https://opax.com.au'),('e2e','http://10.0.2.2:8910')]:
            with self.subTest(variant=variant,origin=origin):
                rc, log, commands, _=self.run_device(variant=variant,origin=origin)
                self.assertNotEqual(rc,0,log)
                self.assertFalse(any(c[0]=='emulator' or c[-2:]==['emu','kill'] for c in commands))


    @unittest.skipUnless(os.uname().sysname == 'Linux', 'Desktop harness branch')
    def test_parent_resets_font_before_interrupt_fallback(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); mobile=root/'mobile'; scripts=mobile/'scripts'; scripts.mkdir(parents=True)
            shutil.copyfile(SCRIPTS/'e2e-android.sh',scripts/'e2e-android.sh')
            for name in ('qa-env.sh','qa-lock.sh'): (scripts/name).write_text('')
            (scripts/'qa-java.sh').write_text('configure_java() { :; }\n')
            (scripts/'prepare-android-flows.py').write_text('')
            (scripts/'e2e-android-device.sh').write_text('''#!/bin/bash
set -e
out=$2
{ echo $$; ps -o lstart= -p $$; } > "$out/device-runner"
touch "$out/device-started"
trap 'sleep 3; exit 143' TERM
while :; do sleep 1; done
''')
            adb=root/'sdk/platform-tools/adb'; adb.parent.mkdir(parents=True)
            adb.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$MOCK_ADB_LOG"\ncase "$*" in *"settings get"*) echo 1 ;; esac\n')
            adb.chmod(0o755)
            out=mobile/'private/qa/parent'
            env={**os.environ,'ANDROID_HOME':str(root/'sdk'),'OPAX_QA_RUN':'parent',
                 'OPAX_ANDROID_DEVICE_STOP_SECONDS':'1','MOCK_ADB_LOG':str(root/'adb.log')}
            child=subprocess.Popen(['bash','scripts/e2e-android.sh','OPAX_API34','01'],cwd=mobile,env=env,
                                   stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
            try:
                deadline=time.monotonic()+10
                while not (out/'device-started').exists():
                    self.assertLess(time.monotonic(),deadline)
                    time.sleep(.05)
                child.terminate()
                stdout,stderr=child.communicate(timeout=12)
                self.assertEqual(child.returncode,1,stdout+stderr)  # forced drain deadline expired
                commands=(root/'adb.log').read_text().splitlines()
                font=next(i for i,c in enumerate(commands) if 'font_scale 1.0' in c)
                stop=next(i for i,c in enumerate(commands) if 'emu kill' in c)
                self.assertLess(font,stop)
                self.assertTrue(all(c.startswith('-s emulator-5602 ') for c in commands))
                self.assertEqual((out/'parent-restore.log').read_text().strip(),'1')
            finally:
                if child.poll() is None:
                    os.killpg(child.pid,signal.SIGKILL); child.wait()


    @unittest.skipUnless(os.uname().sysname == 'Linux', 'Desktop harness branch')
    def test_second_journey_reuses_the_pinned_driver_after_a_successful_first(self):
        rc,log,commands,results=self.run_device(twice=True)
        self.assertEqual(rc,0,log)
        maestro=[c for c in commands if c[0]=='maestro']
        self.assertEqual(len(maestro),2,commands)
        self.assertNotIn('--no-reinstall-driver',maestro[0])
        self.assertIn('--no-reinstall-driver',maestro[1])
        self.assertEqual(len(results.splitlines()),2)


if __name__=='__main__': unittest.main()
