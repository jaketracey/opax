from scripts.build_mixed_speaker_participants import participants, publish_bundle


def test_participants_use_resolved_turns_in_numeric_gid_order_and_label_chairs():
    turns = {
        'debate/2026-09-17.10.1': {'name': 'Example MP', 'person_id': '123', 'speaker_type': 'member'},
        'debate/2026-09-17.2.1': {'name': 'Example Chair', 'person_id': '124', 'speaker_type': 'chair', 'chair_role': 'Speaker'},
        'debate/2026-09-17.11.1': {'name': 'Unresolved', 'person_id': None, 'speaker_type': 'unknown'},
    }
    source = [{'person_id': t['person_id'], 'speaker_type': t['speaker_type'], 'turn_gids': [gid]} for gid, t in turns.items()]
    result, excluded = participants(source, turns)
    assert result == [{'name': 'Example Chair', 'person_id': '124', 'role': 'Speaker'}, {'name': 'Example MP', 'person_id': '123'}]
    assert excluded == 1


def test_conflicting_person_id_fails_closed():
    import pytest
    with pytest.raises(ValueError, match='identity disagreement'):
        participants([{'person_id': '123', 'speaker_type': 'member', 'turn_gids': ['gid']}],
                     {'gid': {'person_id': '124', 'speaker_type': 'member'}})


def test_publication_excludes_held_and_unrostered_identities_without_adding_credit(tmp_path):
    import json
    held, active, extra = 'a' * 32, 'b' * 32, 'c' * 32
    entry = {'debate': 'Example debate', 'participants': [
        {'name': 'Example MP', 'person_id': '123'},
        {'name': 'Example Chair', 'person_id': '124', 'role': 'Speaker'},
        {'name': 'Unrostered MP', 'person_id': '125'}]}
    artifact = {'resources': {held: entry, active: entry}, 'supplementary': {extra: entry},
                'report': {'withheld_resource_ids': [held]}}
    roster = {'people': [{'pid': '123'}, {'pid': '124'}]}
    counts = publish_bundle(artifact, roster, tmp_path)
    assert counts['resources'] == 2
    assert counts['participants'] == 4
    assert counts['excluded_roster_memberships'] == 2
    assert counts['excluded_roster_people'] == 1
    assert json.loads((tmp_path / 'a.json').read_text())['resources'] == {}
    result = json.loads((tmp_path / 'b.json').read_text())['resources'][active]
    assert result['participants'] == entry['participants'][:2]
    assert 'person_id' not in result and 'collaborators' not in result
    before = {f.name: f.read_bytes() for f in tmp_path.iterdir()}
    publish_bundle(artifact, roster, tmp_path)
    assert before == {f.name: f.read_bytes() for f in tmp_path.iterdir()}


def test_publication_rejects_private_witness_fields_before_writing(tmp_path):
    import pytest
    entry = {'debate': 'Example debate', 'participants': [
        {'name': 'Fictional Witness', 'person_id': '123', 'speaker_type': 'witness'}]}
    with pytest.raises(ValueError, match='Invalid participant fields'):
        publish_bundle({'resources': {'a' * 32: entry}, 'supplementary': {},
                        'report': {'withheld_resource_ids': []}}, {'people': [{'pid': '123'}]}, tmp_path)
    assert not list(tmp_path.iterdir())
