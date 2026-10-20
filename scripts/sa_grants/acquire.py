"""SA grants uses the budget lane's locked, hold-safe acquisition engine."""
import fcntl
import json
import sys
import re
from urllib.parse import urlsplit
from scripts.sa_budget.acquire import ROOT, BASE, UA, host_stopped, _acquire
STAGE = ROOT / 'data/staged/sa-grants'
CACHE = ROOT / 'portal/private/sa-grants/acquisition'
DATASETS = ('grants-sa-funded-projects-2016-2017', 'grants-sa-funded-projects-2017-2018', 'premier-s-community-initiatives-fund')

SELECTED = {
 '0760d21e-8344-4462-b305-2f7f92f22f72', '36f0af29-ef87-4793-a290-7061144e078f',
 'baec199e-2218-4f8d-b8fb-059e2c428a38', '3e3c5bf1-038f-4cf8-a712-9476cb5b595d',
 'bd96c82f-fa18-433a-8608-68c57d1eb05f', 'f58e0329-b0af-4666-8a5f-11380fb3db8a',
 '776a1e61-a44e-4239-a6af-c5c305c3adb7',
}

def acquire(url, kind):
    path = urlsplit(url).path
    resource = re.search(r'/resource/([^/]+)', path)
    if resource and resource[1] not in SELECTED or re.search(r'unsucc|applicant', path, re.I):
        raise ValueError('Outside successful-award scope')
    STAGE.mkdir(parents=True, exist_ok=True)
    with (STAGE / '.acquire.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return _acquire(url, kind, stage=STAGE, cache=CACHE, datasets=DATASETS, download_cap=7, allow_storage=True)

if __name__ == '__main__':
    r = acquire(sys.argv[1], sys.argv[2])
    print(json.dumps({k:r[k] for k in ('kind','status','sha256','bytes','snapshot')}))
