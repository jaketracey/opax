from argparse import Namespace
from copy import deepcopy
from datetime import datetime,timezone
import json
from pathlib import Path
from types import SimpleNamespace
import pytest
from scripts import speaker_relabel_apply as R


def resource():
    return {'id':'a'*32,'slug':'speech-1','title':'Casey Invented — Order', 'summary':'Existing brief',
        'origin':{'collaborators':['Casey Invented'],'source_id':'opax-parli'},
        'extra':{'metadata':{'person_id':'101','speaker_raw':'Casey Invented','other':'keep'}},
        'usermetadata':{'classifications':[{'labelset':'kind','label':'speech'},
            {'labelset':'party','label':'Fictional Party'}, {'labelset':'topic','label':'health'}]},
        'computedmetadata':{'field_classifications':[]},'fieldmetadata':[]}


def chair_plan():
    r=resource(); wanted=R.writable(r);wanted['origin']['collaborators']=[]
    wanted['extra']['metadata'].update(person_id=None,chair_person_id='101')
    wanted['usermetadata']['classifications']=[{'labelset':'speaker_type','label':'chair'},
        {'labelset':'chair_role','label':'Speaker'}]
    return {'resource_id':r['id'],'slug':r['slug'],'action':'chair-label-only',
        'owned_labelsets':['party','speaker_type','chair_role'],'payload':wanted}


class Fake:
    def __init__(self):self.r=resource();self.writes=[]
    def get(self,rid):assert rid==self.r['id'];return deepcopy(self.r)
    def patch(self,rid,payload):
        assert set(payload)==R.KEYS
        self.writes.append(deepcopy(payload));self.r.update(deepcopy(payload))


def prepare(tmp_path):
    out=tmp_path/'out';out.mkdir();plan=out/'plan';plan.mkdir()
    (plan/'relabel-plan.jsonl').write_text(json.dumps(chair_plan())+'\n')
    (plan/'artifact-checksums.json').write_text(json.dumps({'relabel-plan.jsonl':
        R.hashlib.sha256((plan/'relabel-plan.jsonl').read_bytes()).hexdigest()}))
    (out/'current-openaustralia-catalog.json').write_text(json.dumps({'at':'fixture','resources':[resource()]}))
    args=Namespace(output=out,plan=plan,env=Path('/not-read'))
    R.snapshot(args);return args


def test_write_restore_diff_on_one_invented_document(tmp_path):
    args=prepare(tmp_path);client=Fake();before=deepcopy(client.r)
    result=R.canary(args,client=client,gate_fn=lambda *a:None)
    assert len(client.writes)==2 and client.r==before
    assert result['metadata_diff']==[] and result['unchanged_fields_diff']==[]
    assert result['restored_sha256']==result['expected_sha256']
    assert client.writes[0]['origin']['collaborators']==[]
    assert {'labelset':'topic','label':'health'} in client.writes[0]['usermetadata']['classifications']
    assert client.r['summary']=='Existing brief' and client.r['title']==before['title']


@pytest.mark.parametrize('utc,forbidden',[
 ('2026-10-12T15:59:59+00:00',False),('2026-10-12T16:00:00+00:00',True),
 ('2026-10-12T19:29:59+00:00',True),('2026-10-12T19:30:00+00:00',False)])
def test_aedt_boundaries(utc,forbidden):
    assert R.forbidden_time(datetime.fromisoformat(utc)) is forbidden


def test_gate_auth_error_and_running_never_allow_write(tmp_path):
    now=datetime(2026,10,12,13,0,tzinfo=timezone.utc)
    with pytest.raises(R.Paused,match='authentication'):
        R.gate(tmp_path,1,now=now,aws_run=lambda *a,**k:SimpleNamespace(returncode=254,stdout='',stderr='secret not logged'))
    assert 'secret' not in (tmp_path/'batches.log').read_text()
    with pytest.raises(R.Paused,match='running'):
        R.gate(tmp_path,1,now=now,aws_run=lambda *a,**k:SimpleNamespace(returncode=0,stdout='running\n'))


def test_gate_uses_required_default_profile_command(tmp_path):
    seen=[]
    def run(command,**kwargs):seen.append(command);return SimpleNamespace(returncode=0,stdout='stopped\n')
    R.gate(tmp_path,1,now=datetime(2026,10,12,13,0,tzinfo=timezone.utc),aws_run=run)
    assert seen==[['aws','ec2','describe-instances','--instance-ids',R.INSTANCE,
        '--query','Reservations[0].Instances[0].State.Name','--output','text']]


def test_metadata_client_refuses_text_and_configuration_payloads():
    c=R.MetadataClient.__new__(R.MetadataClient)
    with pytest.raises(ValueError,match='Only origin'):
        c.patch('a'*32,{'texts':{'body':{'body':'never send'}}})


def test_apply_requires_live_canary_before_client_construction(tmp_path):
    args=prepare(tmp_path)
    with pytest.raises(R.Paused,match='Live rollback canary'):
        R.apply(args)


def test_batch_schedule():
    assert R.batch_sizes(16900)==[200,1000,5000,5000,5000,700]


def test_source_anomaly_blocks_canary_and_apply_before_clients(tmp_path):
    args=prepare(tmp_path);table=[{'facet_nonexclusive_or_wrong':1,'unchanged_nonexclusive_slugs':['speech-999']}]
    (args.plan/'facet-against-source.json').write_text(json.dumps(table))
    with pytest.raises(R.Paused,match='source/facet anomalies'):
        R.canary(args)
    with pytest.raises(R.Paused,match='source/facet anomalies'):
        R.apply(args)


def test_audit_recognizes_multi_speaker_chair_labels():
    from scripts.audit.speaker_attribution_check import relabel_status
    r=resource();r['origin']['collaborators']=[];r['extra']['metadata']['person_id']=None
    r['usermetadata']['classifications'] += [{'labelset':'speaker_type','label':'multi_speaker'},
        {'labelset':'chair_role','label':'Speaker'}]
    result=relabel_status([r],{'documents':[{'resource_id':r['id']}]},
        {'documents':[{'resource_id':r['id'],'party':'Speaker'}]})
    assert result['flagged_mixed_documents']==1 and result['unflagged_mixed_documents']==0
    assert result['missing_chair_role_documents']==0
