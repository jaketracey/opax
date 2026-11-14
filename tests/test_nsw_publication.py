"""The spend hold applies at every sync entry, independently of row cursors."""
import json
import sqlite3
from unittest.mock import Mock

import pytest

from parli.arag import AragError
from parli.ingest import arag_sync as sync, nsw_backfill as backfill, nsw_publication as pub
from parli.schema import init_db


@pytest.fixture
def staged(tmp_path, monkeypatch):
    monkeypatch.delenv('OPAX_BACKFILL_NSW_PUBLISH', raising=False)
    monkeypatch.setattr(sync, 'STATE_PATH', tmp_path / 'sync.json')
    path = tmp_path / 'stage.sqlite'
    monkeypatch.setenv('OPAX_DB', str(path))
    db = sqlite3.connect(path)
    init_db(db)
    backfill.initialise(db)
    db.execute("INSERT INTO members(person_id,full_name,chamber,state) VALUES ('nsw_hansard_1','John Graham','nsw_lc','nsw')")
    db.execute("INSERT INTO nsw_backfill_days(toc_id,date,chamber,status,uids,parser_version) "
               "VALUES ('toc','2023-05-09','nsw_lc','loaded','[]',?)", (pub.PARSER_VERSION,))
    for sid in (1, 2):
        db.execute("INSERT INTO speeches(speech_id,person_id,speaker_name,chamber,date,text,word_count,source,state,text_clean,text_clean_rules) "
                   "VALUES (?, 'nsw_hansard_1','John Graham','nsw_lc','2023-05-09',?,100,'nsw_hansard','nsw','corrected text','test')",
                   (sid, (f'Distinct contribution {sid}. ' * 30)))
    db.execute("INSERT INTO nsw_backfill_turns VALUES ('toc','fragment',0,'1','John Graham',1,'inserted',NULL,'hash')")
    db.commit()
    db.close()
    # Exactly the connection mode normal sync uses; TEMP remains writable.
    db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    sync.prepare_dedupe(db, sync.DEFAULT_SINCE, after=999)
    yield db
    db.close()


def state(after=0):
    return {'tables': {'speeches': {'after': after, 'pushed': 0, 'failed': {}}}}


def test_default_off_normal_sync_continues_without_publishing_owned_rows(staged):
    kb = Mock()
    receipt = state()
    sync.sync_table(kb, staged, 'speeches', sync.TABLES['speeches'], receipt, 100, False, sync.DEFAULT_SINCE)
    assert [c.args[0]['slug'] for c in kb.create_resource.call_args_list] == ['speech-2']
    assert receipt['tables']['speeches']['after'] == 2
    assert pub.progress(staged)[('nsw_lc', '2023-05-09')]['publication_pending'] == 1
    # A later approval cannot lose the controlled row below this checkpoint.
    assert sync.sync_nsw_backfill(kb, staged, receipt, 100, False, sync.DEFAULT_SINCE) == 0


def test_default_off_retries_and_text_repairs_cannot_publish_owned_rows(staged, tmp_path):
    kb = Mock()
    receipt = state(after=999)
    receipt['tables']['speeches']['failed'] = {'speech-1': 'old failure'}
    sync.retry_failed(kb, staged, receipt)
    kb.create_resource.assert_not_called()
    repair = tmp_path / 'repair.json'
    repair.write_text(json.dumps({'version': 1, 'priority': 0, 'after': 0, 'patched': 0,
                                 'missing': 0, 'failed': {'speech-1': 'old failure'},
                                 'samples': [], 'complete': False}))
    # The independent normal speech can be selected; no owned repair is PATCHed.
    monkey = Mock(side_effect=lambda kb, row, **kw: {'status': 'patched', 'slug': f"speech-{row['speech_id']}"})
    from unittest.mock import patch
    with patch.object(sync, '_patch_speech_text', monkey):
        sync.repair_speech_texts(kb, staged, state_path=repair, limit=100, batch_size=200,
                                since=sync.DEFAULT_SINCE, dry_run=False)
    assert all(call.args[1]['speech_id'] != 1 for call in monkey.call_args_list)
    kb.patch_resource_by_slug.assert_not_called()
    body = {'slug': 'speech-1', 'extra': {'metadata': {'nsw_backfill': True}}}
    assert 'approval' in sync._push_one(kb, body)[1]
    kb.create_resource.assert_not_called()


def test_approved_queue_retries_failure_below_checkpoint_and_acknowledges_once(staged, monkeypatch):
    monkeypatch.setenv('OPAX_BACKFILL_NSW_PUBLISH', '1')
    receipt = state(after=999)
    kb = Mock()
    kb.create_resource.side_effect = AragError(503, 'mock', 'temporary failure')
    assert sync.sync_nsw_backfill(kb, staged, receipt, 1, False, sync.DEFAULT_SINCE) == 1
    assert pub.progress(staged, receipt)[('nsw_lc', '2023-05-09')]['publication_failed'] == 1
    assert receipt['tables']['speeches']['after'] == 999
    kb.create_resource.side_effect = None
    sync.sync_table(kb, staged, 'speeches', sync.TABLES['speeches'], receipt, 1, False, sync.DEFAULT_SINCE)
    assert receipt['nsw_backfill']['published'] == [1]
    assert receipt['nsw_backfill']['failed'] == {}
    assert pub.progress(staged, receipt)[('nsw_lc', '2023-05-09')]['publication_pending'] == 0
    calendar = [{'chamber_code': 'nsw_lc', 'date': '2023-05-09'}]
    assert backfill.known_gaps(calendar, {('nsw_lc', '2023-05-09'): 1}, pub.progress(staged, receipt)) == []
    assert sync.sync_nsw_backfill(kb, staged, receipt, 100, False, sync.DEFAULT_SINCE) == 0
    assert kb.create_resource.call_count == 2
    assert pub.read_state(sync.STATE_PATH)['nsw_backfill']['published'] == [1]
    with pytest.raises(sqlite3.OperationalError, match='readonly'):
        staged.execute('DELETE FROM speeches')


def test_approved_dry_run_does_not_acknowledge_or_call_kb(staged, monkeypatch):
    monkeypatch.setenv('OPAX_BACKFILL_NSW_PUBLISH', '1')
    receipt = state(after=999)
    kb = Mock()
    assert sync.sync_nsw_backfill(kb, staged, receipt, 1, True, sync.DEFAULT_SINCE) == 1
    kb.create_resource.assert_not_called()
    assert receipt['nsw_backfill']['published'] == []
    assert not sync.STATE_PATH.exists()


def test_normal_filter_exclusion_is_distinct_from_publication_ack(staged, monkeypatch):
    path = staged.execute('PRAGMA database_list').fetchone()[2]
    with sqlite3.connect(path) as writer:
        writer.execute("UPDATE speeches SET topic='Start of Day' WHERE speech_id=1")
    monkeypatch.setenv('OPAX_BACKFILL_NSW_PUBLISH', '1')
    kb = Mock()
    receipt = state(after=999)
    assert sync.sync_nsw_backfill(kb, staged, receipt, 100, False, sync.DEFAULT_SINCE) == 0
    kb.create_resource.assert_not_called()
    assert receipt['nsw_backfill']['excluded'] == [1]
    assert receipt['nsw_backfill']['published'] == []
    assert pub.progress(staged, receipt)[('nsw_lc', '2023-05-09')]['publication_pending'] == 0


def test_legacy_parser_output_is_quarantined_even_after_approval(staged, monkeypatch):
    # Mutations are possible only on a separate writable stage connection.
    path = staged.execute('PRAGMA database_list').fetchone()[2]
    with sqlite3.connect(path) as writer:
        writer.execute('UPDATE nsw_backfill_days SET parser_version=0')
        with pytest.raises(ValueError, match='quarantined'):
            backfill.stage_day(writer, {'date':'2023-05-09','chamber_code':'nsw_lc','toc_doc_id':'toc'})
    monkeypatch.setenv('OPAX_BACKFILL_NSW_PUBLISH', '1')
    kb = Mock()
    assert sync.sync_nsw_backfill(kb, staged, state(), 100, False, sync.DEFAULT_SINCE) == 0
    kb.create_resource.assert_not_called()
    assert pub.progress(staged)[('nsw_lc', '2023-05-09')]['stage_errors'] == 1


def test_unreadable_publication_receipt_keeps_day_incomplete(staged, tmp_path):
    path = tmp_path / 'bad.json'
    for broken in ('{', '{"nsw_backfill":{"published":"1"}}'):
        path.write_text(broken)
        progress = pub.progress(staged, pub.read_state(path))
        assert progress[('nsw_lc', '2023-05-09')]['publication_failed'] == 1
