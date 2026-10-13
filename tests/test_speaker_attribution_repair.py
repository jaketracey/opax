from pathlib import Path
import sqlite3
import xml.etree.ElementTree as ET

import pytest
from parli.ingest.hansard_html import parse_debate_html
from parli.ingest.openaustralia_xml import parse_day
from parli.ingest.arag_sync import map_speech, JUNK_PREDICATES
from parli.ingest.speaker_roles import chair_role

FIXTURE = Path(__file__).parent/'fixtures/speaker-attribution/legacy.html'


class People:
    def resolve(self, office, printed, house, day):
        return {'person_id': office, 'speaker': printed, 'party': 'SPK' if office == '3' else 'Fictional Party',
                'electorate': 'Example Bay', 'oa_office_id': office}


def test_legacy_unclosed_paragraph_has_one_speaker_per_unit_and_chair():
    rows = parse_debate_html(FIXTURE.read_text())
    assert [r['speaker'] for r in rows] == ['Alex Invented', 'Morgan Imaginary', 'Casey Placeholder']
    assert [r['text'] for r in rows] == ['I propose transparent oversight of public housing construction.',
        'I favour a different plan for regional public transport.', 'Order! The member will return to the question.']
    assert rows[-1]['speaker_type'] == 'chair' and rows[-1]['chair_role'] == 'Speaker'
    assert rows[0]['citation_anchor'] == '2026-10-13.1.1'


def test_xml_retains_interjections_nested_turns_and_original_anchors():
    raw = '''<debates><speech id="one" speakerid="1" speakername="Alex Invented"><p id="p1">My own words.</p>
    <speech id="two" speakerid="2" speakername="Morgan Imaginary" talktype="interjection"><p id="p2">My different words.</p></speech>
    <p id="p3">My closing words.</p></speech><speech id="three" speakerid="3" speakername="Casey Placeholder"><p>Order!</p></speech></debates>'''
    rows, _, _, issues = parse_day(raw, 'representatives', '2026-10-13', People(), {})
    assert not issues
    assert [r['gid'] for r in rows] == ['one', 'two', 'three']
    assert rows[0]['text'] == 'My own words.\n\nMy closing words.'
    assert rows[1]['text'] == 'My different words.' and rows[1]['talktype'] == 'interjection'
    assert rows[0]['paragraphs'][0]['id'] == 'p1'
    assert rows[2]['chair_role'] == 'Speaker'


@pytest.mark.parametrize('party,role', [('SPK','Speaker'),('Deputy Speaker','Deputy Speaker'),
    ('PRES','President'),('DPRES','Deputy President'),("Speaker's panel",'Panel'),('CWM','Chair')])
def test_office_affiliation_becomes_a_label_not_a_personal_speech(party, role):
    row = dict(speech_id=1, person_id='3', speaker_name='Casey Placeholder', party=party,
        electorate='Example Bay', chamber='representatives', date='2026-10-13', topic='Order',
        text='Order! Please return to the question.', word_count=7, source='openaustralia', state='federal')
    doc = map_speech(row)
    assert doc['origin']['collaborators'] == []
    assert doc['extra']['metadata']['person_id'] is None
    assert doc['extra']['metadata']['chair_person_id'] == '3'
    assert {'labelset':'chair_role','label':role} in doc['usermetadata']['classifications']
    assert chair_role(party) == role


def test_exclusion_uses_oa_party_and_does_not_match_a_persons_name():
    db = sqlite3.connect(':memory:')
    db.execute('CREATE TABLE speeches (source, speaker_name, party, text, topic)')
    db.executemany('INSERT INTO speeches VALUES (?,?,?,?,?)', [
        ('openaustralia', 'Alex Speakerstone', 'Fictional Party', 'Words', 'Housing'),
        ('openaustralia', 'Casey Placeholder', 'Speaker', 'Order', 'Housing')])
    assert db.execute('SELECT speaker_name FROM speeches WHERE 1=1 '+JUNK_PREDICATES).fetchall() == [('Alex Speakerstone',)]


def test_build_deduplicates_gid_preserves_unchanged_slug_and_is_read_only(tmp_path, monkeypatch):
    import json
    from argparse import Namespace
    from scripts import repair_speaker_attribution as R
    db_path = tmp_path/'parli.db'
    db = sqlite3.connect(db_path)
    db.execute('CREATE TABLE speeches (speech_id INTEGER PRIMARY KEY, person_id, speaker_name, party, electorate, chamber, date, topic, text, text_clean, word_count, source, state)')
    first='I propose transparent oversight of public housing construction.'
    second='I favour a different plan for regional public transport.'
    third='Order! The member will return to the question.'
    mixed=first+'\n\n'+second+'\n\n'+third
    for sid,pid,name,party,body in [(1,'1','Alex Invented','Fictional Party',mixed),
            (2,'2','Morgan Imaginary','Example Party',second),(3,'3','Casey Placeholder','Speaker',third)]:
        db.execute('INSERT INTO speeches VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (sid,pid,name,party,'Example Bay','representatives','2026-10-13','Housing',body,body,len(body.split()),'openaustralia','federal'))
    db.commit();db.close(); original=db_path.read_bytes()
    def resource(rid,sid,name,pid):
        return {'id':rid,'slug':f'speech-{sid}','origin':{'collaborators':[name]},
            'extra':{'metadata':{'person_id':pid}},'usermetadata':{'classifications':[
                {'labelset':'kind','label':'speech'},{'labelset':'source','label':'openaustralia'},
                {'labelset':'topic','label':'housing'}]}}
    a=resource('a'*32,1,'Alex Invented','1');b=resource('b'*32,2,'Morgan Imaginary','2')
    c=resource('c'*32,3,'Casey Placeholder','3');duplicate=resource('d'*32,1,'Alex Invented','1')
    audit=tmp_path/'audit';audit.mkdir();cache=tmp_path/'cache';cache.mkdir()
    for f in ['people.xml','representatives.xml','senators.xml']:(cache/f).write_text('<members/>')
    raw=cache/'raw/representatives_debates';raw.mkdir(parents=True)
    (raw/'2026-10-13.xml').write_text(f'<debates><major-heading>Housing</major-heading>'
        f'<speech id="day.1.1" speakerid="1" speakername="Alex Invented"><p>{first}</p></speech>'
        f'<speech id="day.1.2" speakerid="2" speakername="Morgan Imaginary"><p>{second}</p></speech>'
        f'<speech id="day.1.3" speakerid="3" speakername="Casey Placeholder"><p>{third}</p></speech></debates>')
    evidence=[{'speech_id':1,'source_turns':[{'gid':f'day.1.{i}'} for i in [1,2,3]]},
              {'speech_id':2,'source_turns':[{'gid':'day.1.2'}]}, {'speech_id':3,'source_turns':[{'gid':'day.1.3'}]}]
    for f,data in [('openaustralia-catalog.json',{'at':'fixture','resources':[a,b,c,duplicate]}),
        ('blast-radius.json',{'documents':[{'resource_id':a['id']},{'resource_id':duplicate['id']}],
            'source_evidence':[evidence[0]],'source_unavailable_slugs':[]}),
        ('role-audit.json',{'documents':[{'resource_id':c['id']}]}),('oa-source-audit.json',{'rows':evidence})]:
        (audit/f).write_text(json.dumps(data))
    monkeypatch.setattr(R,'People',lambda *args:People())
    output=tmp_path/'output'
    R.build(Namespace(output=output,audit=audit,cache=cache,db=db_path))
    report=json.loads((output/'dry-run.json').read_text())
    assert report['manifest_counts']=={'split':2,'chair-label-only':1}
    assert report['reused_unchanged_turns']==2
    assert report['new_summaries_required']==1
    assert report['kb_operation_counts']=={'POST':1,'DELETE':2,'PATCH':1}
    manifest=list(R.read_lines(output/'repair-manifest.jsonl'))
    assert next(p for p in manifest if p['resource_id']==a['id'])['destinations'][1:] == ['speech-2','speech-3']
    assert json.loads((output/'redirects.json').read_text())['speech-1'].startswith('speech-oa-')
    assert db_path.read_bytes()==original
    assert R.verify(output)
    R.sync(Namespace(output=output,apply=False))
    (output/'redirects.json').write_text('{}')
    with pytest.raises(ValueError,match='Artifact changed'):R.verify(output)


def test_question_opening_is_recovered_across_different_xml_headings():
    from scripts.repair_speaker_attribution import select_span, norm
    first='My question is about preparing communities for regional floods.'
    answer='The government will invest in flood protection and recovery.'
    turns=[{'gid':'day.103.2','person_id':'1','text':first,'_norm':norm(first)},
           {'gid':'day.104.1','person_id':'2','text':answer,'_norm':norm(answer)}]
    selected,primary=select_span({'speech_id':1,'person_id':'1','text':first+'\n\n'+answer},
        {'source_turns':[{'gid':'day.104.1'}]},turns)
    assert selected==turns and primary['person_id']=='1'


def test_bad_legacy_person_id_cannot_claim_another_speakers_opening():
    from scripts.repair_speaker_attribution import select_span, norm
    first='My question is about preparing communities for regional floods.'
    answer='The government will invest in flood protection and recovery.'
    turns=[{'gid':'day.103.2','person_id':'1','text':first,'_norm':norm(first)},
           {'gid':'day.104.1','person_id':'2','text':answer,'_norm':norm(answer)}]
    selected,primary=select_span({'speech_id':1,'person_id':'outdated-state-id','text':first+'\n\n'+answer},
        {'source_turns':[{'gid':'day.104.1'}]},turns)
    assert selected==turns and primary['person_id']=='1'
