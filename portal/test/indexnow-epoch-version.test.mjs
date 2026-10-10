import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('cache epoch bumps publish one monotonic IndexNow revision and keep unchanged epochs idempotent',()=>{
  const result=spawnSync('python3',['-c',`
import json
from scripts.bump_cache_epoch import bump
text = '{"CACHE_EPOCH":"old","INDEXNOW_EPOCH_VERSION":"10","staging":{"CACHE_EPOCH":"old","INDEXNOW_EPOCH_VERSION":"12"}}'
changed, old = bump(text, 'new', now_ms=1)
again, _ = bump(changed, 'new', now_ms=999999)
next_text, _ = bump(changed, 'next', now_ms=1)
errors = 0
for malformed in [text.replace('INDEXNOW_EPOCH_VERSION', 'missing', 1), text.replace('"12"', '"invalid"')]:
    try: bump(malformed, 'new', now_ms=1)
    except SystemExit: errors += 1
print(json.dumps({'changed':json.loads(changed),'old':old,'unchanged':again == changed,'next':json.loads(next_text),'errors':errors}))
`],{cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8'});
  assert.equal(result.status,0,'offline epoch helper must succeed');
  const data=JSON.parse(result.stdout);
  assert.deepEqual(data.old,['old','old']);assert.equal(data.unchanged,true);assert.equal(data.errors,2);
  assert.equal(data.changed.CACHE_EPOCH,'new');assert.equal(data.changed.staging.CACHE_EPOCH,'new');
  assert.equal(data.changed.INDEXNOW_EPOCH_VERSION,'13');assert.equal(data.changed.staging.INDEXNOW_EPOCH_VERSION,'13');
  assert.equal(data.next.INDEXNOW_EPOCH_VERSION,'14');assert.equal(data.next.staging.INDEXNOW_EPOCH_VERSION,'14');
});
