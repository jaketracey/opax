"""Bounded, missing-day-only federal XML backfill; default remote calls are source GETs.

The default backs up the source through a read-only connection and loads only the
separate staging file. KB sync is opt-in and uses arag_sync's mapper, exclusions,
worker pool and checkpoint. Occupied days never enter the modern load directory.
"""
from collections import Counter, defaultdict
from contextlib import redirect_stdout, contextmanager, ExitStack
import fcntl
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import time
import uuid
import xml.etree.ElementTree as ET

from . import arag_sync as sync
from . import openaustralia_xml as xml
from .honest_http import HonestHTTP, Unavailable
from .speech_reconciliation import SpeechReconciler
from .speeches import load_modern_jsonl

ATTRIBUTION = 'Commonwealth of Australia parliamentary Hansard; XML supplied by OpenAustralia.org.au.'


def lock_directory():
    return Path.home() / '.cache/autoresearch/pipeline'


@contextmanager
def owner_locks():
    """Same inodes/order as the shell owners; nonblocking, held until all work ends."""
    directory = lock_directory()
    directory.mkdir(parents=True, exist_ok=True)
    with ExitStack() as stack:
        for name in ('nightly.lock', 'daily_refresh.lock'):
            lock = stack.enter_context((directory / name).open('a'))
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ValueError(f'owner lock held: {name}; backfill refused') from None
        yield


def ownership_schema(db):
    db.executescript('''CREATE TABLE IF NOT EXISTS oa_backfill_runs (
        run_id TEXT PRIMARY KEY, start TEXT NOT NULL, end TEXT NOT NULL, cap_usd REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS oa_backfill_owned (
        run_id TEXT NOT NULL REFERENCES oa_backfill_runs(run_id),
        speech_id INTEGER PRIMARY KEY REFERENCES speeches(speech_id), gid TEXT,
        chamber TEXT NOT NULL, date TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS oa_backfill_days (run_id TEXT NOT NULL, chamber TEXT NOT NULL,
        date TEXT NOT NULL, parsed TEXT NOT NULL, issues TEXT NOT NULL, receipt TEXT,
        PRIMARY KEY(run_id,chamber,date));
        CREATE INDEX IF NOT EXISTS idx_oa_backfill_owned_run ON oa_backfill_owned(run_id);''')


def owned_ids(db, run):
    """Only INSERT ownership, committed in the same transaction as the speech."""
    rows = db.execute('SELECT o.speech_id FROM oa_backfill_owned o JOIN speeches s '
        'ON s.speech_id=o.speech_id WHERE o.run_id=? AND o.chamber=s.chamber AND o.date=s.date '
        'AND o.gid IS s.gid AND s.enrichment_run_id=? ORDER BY o.speech_id', (run, run)).fetchall()
    return [r[0] for r in rows]


def discover_days(db, available, start, end, max_days):
    """Only ZERO stored rows qualify, across all sources (including Zenodo)."""
    occupied = {(house, day): count for house, day, count in db.execute(
        'SELECT chamber,date,COUNT(*) FROM speeches WHERE date BETWEEN ? AND ? '
        "AND chamber IN ('representatives','senate') GROUP BY chamber,date", (start, end))}
    missing, held = [], []
    for house in xml.FOLDERS:
        for day in sorted(set(available[house])):
            date.fromisoformat(day)
            if not start <= day <= end:
                continue
            item = {'chamber': house, 'date': day, 'existing_rows': occupied.get((house, day), 0)}
            (held if item['existing_rows'] else missing).append(item)
    return missing[:max_days], held, len(missing)


class Archive:
    """Immutable cached XML; serial polite source fetches for cache misses."""
    def __init__(self, stage, cache=None, offline=False):
        self.stage = Path(stage).expanduser().resolve()
        self.cache = Path(cache).expanduser().resolve() if cache else None
        self.offline = offline
        self.http = HonestHTTP()
        self.hits = self.gets = 0

    def get(self, relative, fresh=False):
        target = self.stage / relative
        candidates = [target] + ([self.cache / relative] if self.cache else [])
        if not fresh or self.offline:
            for path in candidates:
                if path.is_file():
                    self.hits += 1
                    return path.read_bytes()
        if self.offline:
            raise Unavailable(f'offline XML cache missing: {relative}')
        url = f'{xml.BASE}/' + (relative[4:] if relative.startswith('raw/') else relative)
        if relative.startswith('raw/'):
            url = f'{xml.BASE}/scrapedxml/{relative[4:]}'
        raw = self.http.get(url)
        if raw is None:
            raise Unavailable(f'listed source unavailable: {url}')
        self.gets += 1
        target.parent.mkdir(parents=True, exist_ok=True)
        temp = target.with_suffix(target.suffix + '.tmp')
        temp.write_bytes(raw)
        temp.replace(target)
        return raw

    def dates(self):
        available = {}
        for house, folder in xml.FOLDERS.items():
            if self.offline:
                roots = [self.stage] + ([self.cache] if self.cache else [])
                available[house] = sorted({p.stem for root in roots
                    for p in (root / 'raw' / folder).glob('*.xml')})
            else:
                raw = self.http.get(f'{xml.BASE}/scrapedxml/{folder}/')
                self.gets += 1
                if not raw or b'Index of' not in raw:
                    raise Unavailable('XML directory index unavailable')
                xml.atomic(self.stage / f'{folder}.html', raw.decode())
                available[house] = sorted(set(re.findall(r'href="(\d{4}-\d{2}-\d{2})\.xml"', raw.decode())))
        return available

    def people(self, db):
        # Existing cache layouts store member metadata at their root.
        raw = []
        for name in ('people.xml', 'representatives.xml', 'senators.xml'):
            if self.offline:
                raw.append(self.get(name))
            else:
                body = self.http.get(f'{xml.BASE}/members/{name}')
                self.gets += 1
                if not body:
                    raise Unavailable('member mapping unavailable')
                ET.fromstring(body)
                self.stage.mkdir(parents=True, exist_ok=True)
                (self.stage / name).write_bytes(body)
                raw.append(body)
        return xml.People(raw[0], raw[1:], db)


def backup(source, destination):
    source = Path(source).expanduser().resolve()
    destination = Path(destination).expanduser().resolve()
    if destination == source or destination.exists():
        raise ValueError('staging-db must be a NEW file, separate from the source DB')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with xml.read_only(source) as original, sqlite3.connect(destination) as staged:
        original.backup(staged, pages=8192)
    return destination


def partial_inventory(db, people, archive, held):
    """List unmatched occupied days; API/Zenodo boundaries can differ from XML."""
    reconciler = SpeechReconciler(db)
    result = []
    for item in held:
        house, day = item['chamber'], item['date']
        raw = archive.get(f'raw/{xml.FOLDERS[house]}/{day}.xml')
        records, _, _, issues = xml.parse_day(raw, house, day, people, {})
        _, bodies, gids, identities = reconciler.day(house, day)
        unmatched, conflicts = [], Counter()
        for p in reconciler.prepare(records, house, day):
            r = p['record']
            if len(r['text']) < sync.MIN_SPEECH_CHARS:
                continue
            if p['reason']:
                conflicts[p['reason']] += 1
                continue
            if r.get('speaker_type') == 'chair' or r.get('topic') in (
                    'Visitors', 'Distinguished Visitors', 'Postponement of Business', 'Notices'):
                continue
            sid = gids.get(r.get('gid'))
            if sid is not None and identities[sid] == p['identity']:
                continue
            if len(bodies.get((p['identity'], p['body']), [])) == 1:
                continue
            unmatched.append(r.get('gid'))
        speech_issues = [i for i in issues if i['kind'] == 'speech-identity']
        if unmatched or conflicts or speech_issues:
            result.append(item | {'eligible_xml_unmatched': len(unmatched),
                'identity_failures': sum(conflicts.values()) + len(speech_issues),
                'identity_reasons': dict(conflicts), 'unmatched_gids': unmatched})
    db.commit()
    return result


def summarize(db, baseline, start, end, parsed, loader, issues, stage, rate, inserted_ids):
    """Measure exactly the rows selected by the production sync specification."""
    db.row_factory = sqlite3.Row
    db.execute('CREATE TEMP TABLE backfill_inserted_ids (speech_id INTEGER PRIMARY KEY)')
    db.executemany('INSERT INTO backfill_inserted_ids VALUES (?)', ((sid,) for sid in inserted_ids))
    sync.prepare_dedupe(db, start, baseline)
    counters = defaultdict(Counter)
    for item in parsed:
        c = counters[(item['date'][:4], item['chamber'])]
        c['missing_days'] += 1
        c['xml_turns'] += item['xml_turns']
    for issue in issues:
        if issue['kind'] == 'speech-identity':
            counters[(issue['date'][:4], issue['chamber'])]['identity_failures_parser'] += 1
    for item in loader:
        c = counters[(item['date'][:4], item['chamber'])]
        c['loaded_rows'] += item['added']
        c['excluded_loader_short'] += item.get('short_speeches', 0)
        c['excluded_loader_duplicate'] += item.get('duplicate_bodies', 0)
        c['identity_failures_loader'] += len(item.get('unmatched', []))
    groups = defaultdict(list)
    text_bytes = payload_bytes = docs = 0
    payload_file = stage / 'kb-payloads.jsonl'
    scope = []
    with payload_file.open('w', encoding='utf-8') as out:
        for row in db.execute('SELECT s.* FROM speeches s JOIN temp.backfill_inserted_ids i '
                              'ON i.speech_id=s.speech_id ORDER BY s.speech_id'):
            c = counters[(row['date'][:4], row['chamber'])]
            if len(row['text']) < sync.MIN_SPEECH_CHARS:
                c['excluded_kb_short'] += 1
                continue
            if not db.execute('SELECT 1 FROM speeches WHERE speech_id=? ' + sync.JUNK_PREDICATES,
                              (row['speech_id'],)).fetchone():
                c['excluded_kb_procedural'] += 1
                continue
            if not db.execute('SELECT 1 FROM speeches WHERE speech_id=? ' + sync.DEDUPE_PREDICATES,
                              (row['speech_id'],)).fetchone():
                c['excluded_kb_duplicate'] += 1
                continue
            body = sync.map_speech(row)
            encoded = json.dumps(body, ensure_ascii=False)
            # requests' json= serialization escapes non-ASCII by default.
            size = len(json.dumps(body, allow_nan=False).encode())
            text_bytes += sum(len(t['body'].encode()) for t in body['texts'].values())
            payload_bytes += size
            docs += 1
            scope.append(row['speech_id'])
            c['new_documents'] += 1
            c['unattributed_documents'] += int(row['person_id'] is None)
            groups[(row['date'][:4], row['chamber'])].append(body)
            out.write(encoded + '\n')
    # One from each populated year/chamber, then another from each until 20.
    samples = []
    for fraction in (0.5, 0.25, 0.75, 0.0):
        for key in sorted(groups):
            if len(samples) >= 20:
                break
            group = groups[key]
            sample = group[min(int(len(group) * fraction), len(group) - 1)]
            if sample not in samples:
                samples.append(sample)
    xml.atomic(stage / 'samples.json', json.dumps(samples, indent=2, ensure_ascii=False))
    keys = ['missing_days', 'xml_turns', 'loaded_rows', 'new_documents',
            'excluded_loader_short', 'excluded_loader_duplicate', 'identity_failures_parser',
            'identity_failures_loader', 'excluded_kb_short', 'excluded_kb_procedural', 'excluded_kb_duplicate',
            'unattributed_documents']
    table = [dict(year=str(year), chamber=house, **{k:counters[(str(year),house)][k] for k in keys})
             for year in range(int(start[:4]), int(end[:4]) + 1) for house in xml.FOLDERS]
    return {'counts': table, 'new_documents': docs, 'source_text_bytes': text_bytes,
            'kb_write_payload_bytes': payload_bytes, 'payload_jsonl_bytes': payload_file.stat().st_size,
            'ingest_estimate': {'assumed_documents_per_second': rate, 'seconds': docs / rate,
                'range_hours_at_2_to_10_per_second': [docs / 10 / 3600, docs / 2 / 3600],
                'method': 'Planning assumption; no KB writes or live throughput benchmark. Index readiness can lag.'},
            'needs_summaries': docs, 'needs_topic_labels': docs}, scope


def checkpoint_scope(db_path, state_path, start, end, run_id=None, max_usd=40):
    """The JSON checkpoint identifies a run; SQLite insertion ownership defines scope."""
    path = Path(state_path).expanduser().resolve()
    if path == sync.STATE_PATH.resolve():
        raise ValueError('backfill must use a separate sync-state, not the nightly checkpoint')
    state = json.loads(path.read_text()) if path.exists() else {'tables': {}}
    previous = state.get('backfill', {})
    if not previous and state.get('tables'):
        raise ValueError('existing sync-state has no backfill scope; use a new dedicated file')
    if previous and previous.get('version') != 2:
        raise ValueError('legacy GID checkpoint has no accepted ownership; use a new dedicated file')
    db_path = str(Path(db_path).expanduser().resolve())
    if previous and (previous['db'], previous['start'], previous['end']) != (db_path, start, end):
        raise ValueError('sync-state belongs to a different database or date range')
    if previous and previous['max_usd'] != max_usd:
        raise ValueError('enrichment cap cannot change when a run is resumed')
    state['backfill'] = previous | {'db':db_path, 'start':start, 'end':end,
        'version':2, 'run_id':previous.get('run_id') or run_id or uuid.uuid4().hex,
        'max_usd':max_usd}
    xml.atomic(path, json.dumps(state, indent=1))
    return state


def assert_kb_owner():
    if (Path.home() / '.cache/autoresearch/MIGRATED_TO_VM').exists():
        raise ValueError('desktop cutover marker present: run the KB push on the nightly KB owner')


def assert_enrichment_cap_ready():
    """Read-only capability probe; refuse loads until discovery enforces the cap."""
    from parli.arag import load_dotenv, _request
    load_dotenv(Path.home() / 'opax' / '.env')
    url, token = os.environ.get('OPAX_ENRICH_URL',''), os.environ.get('ENRICH_ADMIN_TOKEN','')
    if not url.startswith('https://') or len(token) < 16:
        raise ValueError('OPAX_ENRICH_URL and ENRICH_ADMIN_TOKEN are required for cap readiness')
    result = _request('GET', url.rstrip('/') + '/status', {'Authorization':'Bearer '+token})
    if 'enrichment-run-cap-v1' not in (result or {}).get('capabilities',[]):
        raise ValueError('enrichment Worker/migration does not enforce run caps; load refused')


def push(db_path, ids, state_path, start, end):
    """Use existing checkpointed sync, with a durable bounded row scope."""
    from parli.arag import load_dotenv, AragConfig, KbClient
    assert_kb_owner()
    assert_enrichment_cap_ready()
    path = Path(state_path).expanduser().resolve()
    saved = json.loads(path.read_text())
    state = checkpoint_scope(db_path, state_path, start, end, max_usd=saved['backfill']['max_usd'])
    previous = state.get('backfill', {})
    db_path = str(Path(db_path).expanduser().resolve())
    # Global GID provenance and JSON IDs are NEVER load ownership.
    with xml.read_only(db_path) as db:
        registry = db.execute('SELECT start,end,cap_usd FROM oa_backfill_runs WHERE run_id=?',
                              (previous['run_id'],)).fetchone()
        if not registry or tuple(registry) != (start,end,previous['max_usd']):
            raise ValueError('checkpoint does not match durable accepted load ownership')
        owned = set(owned_ids(db, previous['run_id']))
        if (set(ids) | set(previous.get('speech_ids', []))) - owned:
            raise ValueError('saved IDs are outside accepted backfill insertion ownership')
        db.row_factory = sqlite3.Row
        db.execute('CREATE TEMP TABLE backfill_ids (speech_id INTEGER PRIMARY KEY)')
        db.executemany('INSERT INTO backfill_ids VALUES (?)', ((sid,) for sid in owned))
        sync.prepare_dedupe(db, start, min(owned) - 1 if owned else 0)
        select = sync.TABLES['speeches']['select'].format(since=start).replace('WHERE speech_id > ?',
            'WHERE speech_id IN (SELECT speech_id FROM temp.backfill_ids) AND speech_id > ?')
        ids = [r['speech_id'] for r in db.execute(select, (0,len(owned)))]
    eligible = {f'speech-{sid}' for sid in ids}
    if set(state['tables']) - {'speeches'} or set(state['tables'].get('speeches',{}).get('failed',{})) - eligible:
        raise ValueError('failed retries are outside eligible accepted insertion ownership')
    tstate = state['tables'].get('speeches',{})
    planned = len({sid for sid in ids if sid > tstate.get('after',0)} |
                  {int(slug.rsplit('-',1)[1]) for slug in tstate.get('failed',{})})
    state['backfill'] = previous | {'db': db_path, 'start': start, 'end': end, 'speech_ids': ids}
    old = sync.STATE_PATH
    sync.STATE_PATH = path
    try:
        sync.save_state(state)  # Durable scope survives a failed or interrupted KB request.
        load_dotenv(Path.home() / 'opax' / '.env')
        config = AragConfig.from_env()
        if not config.kb_configured:
            raise ValueError('KB credentials unavailable')
        with xml.read_only(db_path) as db:
            db.row_factory = sqlite3.Row
            db.execute('CREATE TEMP TABLE backfill_ids (speech_id INTEGER PRIMARY KEY)')
            db.executemany('INSERT INTO backfill_ids VALUES (?)', ((sid,) for sid in ids))
            db.execute('CREATE TEMP TABLE backfill_retried (speech_id INTEGER PRIMARY KEY)')
            db.executemany('INSERT INTO backfill_retried VALUES (?)',
                ((int(slug.rsplit('-',1)[1]),) for slug in state['tables'].get('speeches',{}).get('failed',{})))
            sync.prepare_dedupe(db, start, min(ids) - 1 if ids else 0)
            spec = dict(sync.TABLES['speeches'])
            spec['select'] = spec['select'].replace('WHERE speech_id > ?',
                'WHERE speech_id IN (SELECT speech_id FROM temp.backfill_ids) '
                'AND speech_id NOT IN (SELECT speech_id FROM temp.backfill_retried) AND speech_id > ?')
            kb = KbClient(config)
            # Retry failures from this scope first; do not lose them behind the cursor.
            sync.retry_failed(kb, db, state)
            sync.sync_table(kb, db, 'speeches', spec, state, len(ids), False, start)
        if state['tables'].get('speeches', {}).get('failed'):
            raise ValueError('backfill KB failures retained in checkpoint; rerun to retry')
        return {'checkpoint':str(path), 'resources_confirmed':state['tables']['speeches']['pushed'],
                'remaining_failures':0, 'planned_creates_this_run':planned}
    finally:
        sync.STATE_PATH = old


def run(args):
    with owner_locks():
        return _run(args)


def _run(args):
    start, end = args.start, args.end
    if not '2019-01-01' <= start <= end <= '2025-12-31':
        raise ValueError('backfill dates must be within 2019-01-01..2025-12-31')
    date.fromisoformat(start); date.fromisoformat(end)
    if not 1 <= args.max_days <= 1000 or args.ingest_docs_per_second <= 0:
        raise ValueError('max-days must be 1..1000 and ingest rate positive')
    cap = getattr(args, 'enrichment_max_usd', 40)
    if not 0 < cap <= 40:
        raise ValueError('enrichment-max-usd must be positive and at most US$40')
    if args.modern_dir or args.load_divisions:
        raise ValueError('speech backfill cannot publish the nightly cache or load divisions')
    if args.apply and not args.sync_state:
        raise ValueError('--apply requires a dedicated --sync-state to retain interrupted load scope')
    if args.sync_kb and (not args.apply or not args.sync_state):
        raise ValueError('--sync-kb requires --apply and a dedicated --sync-state')
    if args.sync_kb:
        assert_kb_owner()
    if args.apply:
        assert_enrichment_cap_ready()
    source = Path(args.db).expanduser().resolve()
    stage = Path(args.stage).expanduser().resolve()
    if stage == xml.DEFAULT_STAGE.resolve():
        raise ValueError('backfill requires its own --stage directory')
    stage.mkdir(parents=True, exist_ok=True)
    staging_db = Path(args.staging_db).expanduser().resolve() if args.staging_db else stage / 'staging.sqlite'
    if args.apply and args.staging_db:
        raise ValueError('--staging-db is dry-run only')
    if not args.apply and (staging_db == source or staging_db.exists()):
        raise ValueError('staging-db must be a NEW file separate from source DB')
    if args.apply:
        # Reject a wrong checkpoint BEFORE modifying the target database.
        state = checkpoint_scope(source, args.sync_state, start, end, max_usd=cap)
        run_id = state['backfill']['run_id']
    else:
        run_id = uuid.uuid4().hex
    archive = Archive(stage, args.cache_dir, args.offline)
    began = time.monotonic()
    with xml.read_only(source) as original:
        available = archive.dates()
        missing, held, total_missing = discover_days(original, available, start, end, args.max_days)
        people = archive.people(original)
    plan = {'start': start, 'end': end, 'source_db': str(source),
            'missing_days': missing, 'occupied_days': held, 'total_missing_days': total_missing,
            'selected_missing_days': len(missing), 'remaining_missing_days': total_missing - len(missing)}
    xml.atomic(stage / 'discovery.json', json.dumps(plan, indent=2))
    target = source if args.apply else backup(source, staging_db)
    modern = stage / 'modern'
    # A new run directory prevents stale JSONL entering a changed selection.
    modern = modern / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    modern.mkdir(parents=True)
    parsed, issues = [], []
    for item in missing:
        house, day = item['chamber'], item['date']
        raw = archive.get(f'raw/{xml.FOLDERS[house]}/{day}.xml')
        records, _, _, bad = xml.parse_day(raw, house, day, people, {})
        for r in records:
            r['source_attribution'] = ATTRIBUTION
            r['enrichment_run_id'], r['enrichment_max_usd'] = run_id, cap
        issues.extend(i | {'date':day, 'chamber':house} for i in bad)
        parsed.append(item | {'xml_turns':len(records) + sum(i['kind'] == 'speech-identity' for i in bad),
            'sha256':hashlib.sha256(raw).hexdigest(), 'bytes':len(raw)})
        xml.atomic(modern / f'{day}_{house}.jsonl',
                   ''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in records))
    with sqlite3.connect(target) as db, (stage / 'loader.log').open('w') as log, redirect_stdout(log):
        ownership_schema(db)
        db.execute('INSERT OR IGNORE INTO oa_backfill_runs VALUES (?,?,?,?)', (run_id,start,end,cap))
        if tuple(db.execute('SELECT start,end,cap_usd FROM oa_backfill_runs WHERE run_id=?',
                            (run_id,)).fetchone()) != (start,end,cap):
            raise ValueError('SQLite load ownership belongs to another run configuration')
        for item in parsed:
            day_issues = [i for i in issues if (i['chamber'],i['date']) == (item['chamber'],item['date'])]
            db.execute('INSERT OR IGNORE INTO oa_backfill_days (run_id,chamber,date,parsed,issues) '
                       'VALUES (?,?,?,?,?)', (run_id,item['chamber'],item['date'],json.dumps(item),json.dumps(day_issues)))
        db.commit()
        baseline = db.execute('SELECT COALESCE(MAX(speech_id),0) FROM speeches').fetchone()[0]
        loader = []
        load_modern_jsonl(db, set(), since=start, until=end, report=loader,
                          modern_dir=modern, missing_days_only=True, backfill_run=run_id)
        inserted = [sid for entry in loader for sid in entry.get('inserted_ids', [])]
        accepted = owned_ids(db, run_id)
        if set(inserted) - set(accepted):
            raise ValueError('loader receipt disagrees with durable inserted ownership')
        history = db.execute('SELECT parsed,issues,receipt FROM oa_backfill_days WHERE run_id=? '
                             'ORDER BY date,chamber', (run_id,)).fetchall()
        parsed = [json.loads(p) for p,_,_ in history]
        issues = [i for _,bad,_ in history for i in json.loads(bad)]
        loader = [json.loads(receipt) for _,_,receipt in history if receipt]
        receipt, ids = summarize(db, baseline, start, end, parsed, loader, issues, stage,
                                 args.ingest_docs_per_second, accepted)
        # Partial-day inspection uses only the separate staging DB, never --apply.
        partials = partial_inventory(db, people, archive, held) if not args.apply else None
    for filename, data in [('parsed-days.json',parsed), ('identity-issues.json',issues),
                           ('loader-days.json',loader), ('partial-days.json',partials)]:
        if data is not None:
            xml.atomic(stage / filename, json.dumps(data, indent=2, ensure_ascii=False))
    receipt.update({'dry_run':not args.apply, 'source_db':str(source), 'loaded_db':str(target),
        'baseline_max_speech_id':baseline, 'selected_missing_days':len(missing),
        'total_missing_days':total_missing, 'remaining_missing_days':total_missing - len(missing),
        'occupied_days_held':len(held), 'partial_day_candidates':len(partials) if partials is not None else None,
        'partial_day_note':'Unmatched XML on occupied days may reflect different API/Zenodo speech boundaries. All are held; no reconciliation or citation changes.',
        'source_cache_hits':archive.hits, 'source_gets':archive.gets,
        'elapsed_seconds':time.monotonic() - began, 'kb_writes':None if args.sync_kb else 0,
        'kb_sync_requested':args.sync_kb, 'enrichment_queued':0})
    receipt['enrichment_budget'] = {'run_id':run_id, 'max_usd':cap, 'enforcement':'opax-enrich durable run reservations plus daily neuron guard'}
    xml.atomic(stage / 'report.json', json.dumps(receipt, indent=2))
    if args.sync_kb:
        receipt['kb_sync'] = push(source, ids, args.sync_state, start, end)
        receipt['eligible_documents_in_run'] = receipt['new_documents']
        receipt['kb_planned_creates_this_run'] = receipt['kb_sync']['planned_creates_this_run']
        xml.atomic(stage / 'report.json', json.dumps(receipt, indent=2))
    return {k:v for k,v in receipt.items() if k != 'counts'}
