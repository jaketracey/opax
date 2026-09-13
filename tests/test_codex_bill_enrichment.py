import hashlib
import importlib.util
from pathlib import Path
import sys

import pytest


SCRIPT = Path(__file__).parents[1] / "scripts" / "publish_codex_bill_enrichment.py"
sys.path.insert(0, str(SCRIPT.parent))
spec = importlib.util.spec_from_file_location("publish_codex_bill_enrichment", SCRIPT)
publisher = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(publisher)


TEXT = "The Minister must publish the register within 30 days of receiving the application."
SOURCE_HASH = hashlib.sha256(TEXT.encode()).hexdigest()


def source():
    return {
        "complete": True,
        "bill_key": "au-federal-test",
        "version": {"id": "r1-aspassed", "sha256": SOURCE_HASH},
        "sections": [{"id": "section-0001", "text": TEXT}],
    }


def entry(**overrides):
    value = {
        "bill_key": "au-federal-test",
        "version_id": "r1-aspassed",
        "source_sha256": SOURCE_HASH,
        "topics": ["justice-law"],
        "brief": "The bill would require the Minister to publish the register within 30 days after receiving an application, establishing a clear statutory publication deadline for applicants and affected members of the public.",
        "evidence": [{"topic": "justice-law", "quote": TEXT, "section_id": "section-0001"}],
        "review_scope": "selected-provisions",
        "model": "gpt-5.6-luna",
        "confidence": "high",
    }
    value.update(overrides)
    return value


def resource(body=TEXT):
    body_hash = hashlib.sha256(body.encode()).hexdigest()
    return {
        "slug": "bill-text-au-federal-test-aspassed",
        "usermetadata": {
            "classifications": [
                {"labelset": "kind", "label": "bill_text"},
                {"labelset": "status", "label": "cancelled-topic", "cancelled_by_user": True},
                {"labelset": "audience", "label": "public"},
            ],
            "owner": "editorial-team",
        },
        "extra": {
            "metadata": {
                "bill_key": "au-federal-test",
                "version_id": "r1-aspassed",
                "source_text_sha256": body_hash,
                "complete": True,
                "other_metadata": {"keep": True},
            },
            "other_extra": {"keep": True},
        },
        "data": {"texts": {"body": {"value": {"body": body}}}},
    }


def test_validate_entry_rejects_identity_checksum_and_evidence_mismatches():
    for change in (
        {"source_sha256": "0" * 64},
        {"version_id": "r1-first-reps"},
        {"evidence": [{"topic": "justice-law", "quote": "wrong passage that is long enough to test validation", "section_id": "section-0001"}]},
    ):
        with pytest.raises(ValueError):
            publisher.validate_entry(entry(**change), source())


def test_validate_entry_returns_only_reviewed_fields():
    validated = publisher.validate_entry(entry(unexpected="discard"), source())
    assert set(validated) == {
        "bill_key", "version_id", "source_sha256", "topics", "brief",
        "evidence", "review_scope", "model", "confidence",
    }


def test_metadata_patch_is_metadata_only_and_preserves_non_topic_metadata():
    patch = publisher.metadata_patch(resource(), entry())
    assert set(patch) == {"usermetadata", "extra"}
    assert "data" not in patch
    assert "texts" not in patch
    assert patch["usermetadata"]["owner"] == "editorial-team"
    labels = patch["usermetadata"]["classifications"]
    assert {x["label"] for x in labels if x["labelset"] != "topic"} == {"bill_text", "cancelled-topic", "public"}
    assert any(x["label"] == "cancelled-topic" and x["cancelled_by_user"] for x in labels)
    assert any(x["labelset"] == "topic" and x["label"] == "justice-law" for x in labels)
    assert patch["extra"]["other_extra"] == {"keep": True}
    assert patch["extra"]["metadata"]["other_metadata"] == {"keep": True}
    assert set(patch["extra"]["metadata"]["codex_enrichment"]) == set(entry())


def test_metadata_patch_rejects_wrong_live_body_even_when_metadata_hash_matches():
    wrong = "A different source body is live despite the matching metadata checksum value."
    live = resource(body=wrong)
    live["extra"]["metadata"]["source_text_sha256"] = SOURCE_HASH
    with pytest.raises(ValueError, match="original text checksum"):
        publisher.metadata_patch(live, entry())
