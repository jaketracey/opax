from scripts.build_mixed_speaker_participants import participants


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
