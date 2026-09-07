#!/usr/bin/env python3
"""Run resumable OPAX enrichment batches through a Codex subscription model.

This runner never invokes the OpenRouter or Anthropic enrichment paths. Codex
reads a claimed batch, returns schema-checked JSON, and the existing queue
harness writes the result directly to the knowledge box.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
RUN_ROOT = Path(os.environ.get("CODEX_ENRICH_RUN_DIR") or Path.home() / ".cache" / "opax" / "codex-runs")


def codex_binary() -> str:
    configured = os.environ.get("CODEX_BIN") or shutil.which("codex")
    if configured:
        return configured
    candidates = sorted((Path.home() / ".nvm" / "versions" / "node").glob("*/bin/codex"), reverse=True)
    if candidates:
        return str(candidates[0])
    raise RuntimeError("Codex CLI was not found; set CODEX_BIN")

sys.path.insert(0, str(HERE))
from arag_enrich import TOPICS  # noqa: E402


def run(command: list[str], *, stdin: str | None = None, timeout: int = 1800) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=ROOT,
        input=stdin,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
        env=os.environ.copy(),
    )


def claim(kind: str, worker: str, size: int, batch: Path) -> tuple[list[dict], str]:
    harness = HERE / ("label_workers.py" if kind == "labels" else "summary_workers.py")
    result = run([sys.executable, str(harness), "next", "--worker", worker, "--n", str(size), "--out", str(batch)])
    output = (result.stdout + result.stderr).strip()
    if result.returncode or output.startswith(("NONE", "STOP")):
        return [], output
    if not batch.exists():
        raise RuntimeError(f"claim produced no batch: {output}")
    return json.loads(batch.read_text()), output


def label_prompt(items: list[dict]) -> str:
    taxonomy = "\n".join(f"- {slug}: {description}" for slug, description, _ in TOPICS)
    return f"""Classify every Australian parliamentary speech below for OPAX.
Choose zero to three topic slugs for every rid from the taxonomy, based on the actual speech text rather than its title. A topic must be a substantive subject of the speech: do not label incidental mentions, quoted remarks, passing examples, parliamentary insults or personal attacks. Be conservative and use [] for procedural, tribute, condolence, thin text, or any uncertain match. Return only the required JSON object. Do not call tools or external APIs.

TAXONOMY
{taxonomy}

SPEECHES
{json.dumps(items, ensure_ascii=False, separators=(',', ':'))}
"""


def summary_prompt(items: list[dict]) -> str:
    return f"""Write a brief for every Australian parliamentary speech below for OPAX.
Each value must be one compact sentence of 25 to 75 words, neutrally stating what was argued, announced, asked, answered, or moved. Use only that rid's supplied text and never carry a speaker, claim, or figure across records. Do not name or infer the speaker from the title: start directly with an action such as 'Asked', 'Argued', 'Moved', 'Reported', or 'Paid tribute'. When several speakers appear, describe the proceeding neutrally; for questions and answers use 'Asked whether ...; the minister said ...'. Preserve the source's tense and status exactly, especially 'will announce' versus 'announced'. Preserve at most three useful concrete positions, figures, bill names, people, or places. Use neutral verbs and include only directly supported claims. Never start with 'In this speech', 'This speech', or 'The speaker says'. Summarise rather than quote, use plain ASCII punctuation, stay below 600 characters, and return only the required JSON object. Do not call tools or external APIs.

SPEECHES
{json.dumps(items, ensure_ascii=False, separators=(',', ':'))}
"""


def schema(kind: str, items: list[dict]) -> dict:
    if kind == "labels":
        value = {"type": "array", "items": {"type": "string", "enum": [t[0] for t in TOPICS]}, "maxItems": 3}
    else:
        value = {"type": "string", "minLength": 40, "maxLength": 600}
    rids = [item["rid"] for item in items]
    return {
        "type": "object",
        "properties": {rid: value for rid in rids},
        "required": rids,
        "additionalProperties": False,
    }


def ask_codex(model: str, effort: str, prompt: str, schema_path: Path, result_path: Path) -> subprocess.CompletedProcess[str]:
    return run([
        codex_binary(), "-a", "never", "exec",
        "-m", model,
        "-c", f'model_reasoning_effort="{effort}"',
        "-C", str(ROOT),
        "-s", "read-only",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--output-schema", str(schema_path),
        "-o", str(result_path),
        "-",
    ], stdin=prompt)


def validate_payload(kind: str, payload: object, items: list[dict]) -> list[str]:
    expected = {item["rid"] for item in items}
    if not isinstance(payload, dict) or set(payload) != expected:
        return ["The JSON keys did not exactly match the requested rids."]
    if kind == "labels":
        return []
    problems: list[str] = []
    by_rid = {item["rid"]: item for item in items}
    for rid, value in payload.items():
        if not isinstance(value, str):
            problems.append(f"{rid}: brief is not a string")
            continue
        words = value.split()
        if not 15 <= len(words) <= 80:
            problems.append(f"{rid}: use 15-80 words (procedural records may be short)")
        if len(value) > 600 or len(value) < 40:
            problems.append(f"{rid}: use 40-600 characters")
        if any(mark in value for mark in ("—", "–", "‘", "’", "“", "”")):
            problems.append(f"{rid}: use plain ASCII punctuation")
        item = by_rid[rid]
        speaker = (item.get("title") or "").split(" — ", 1)[0].strip().lower()
        if speaker and len(speaker.split()) >= 2 and speaker in value.lower():
            problems.append(f"{rid}: do not name or infer the record speaker")
        source_text = (item.get("text") or "").replace("½", ".5").replace("¼", ".25").replace("¾", ".75")
        source_numbers = {n.replace(",", "") for n in re.findall(r"\b\d[\d,]*(?:\.\d+)?%?\b", source_text)}
        for number in re.findall(r"\b\d[\d,]*(?:\.\d+)?%?\b", value):
            if number.replace(",", "") not in source_numbers:
                problems.append(f"{rid}: figure {number} is not present in the supplied text")
    return problems


def submit(kind: str, worker: str, result_path: Path) -> subprocess.CompletedProcess[str]:
    harness = HERE / ("label_workers.py" if kind == "labels" else "summary_workers.py")
    flag = "--labels" if kind == "labels" else "--summaries"
    return run([sys.executable, str(harness), "submit", "--worker", worker, flag, str(result_path)])


def release(kind: str, worker: str) -> None:
    harness = HERE / ("label_workers.py" if kind == "labels" else "summary_workers.py")
    run([sys.executable, str(harness), "release", "--worker", worker])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=("labels", "summaries"))
    parser.add_argument("--worker", required=True)
    parser.add_argument("--model", default="gpt-5.3-codex-spark")
    parser.add_argument("--effort", choices=("low", "medium", "high", "xhigh"), default="low")
    parser.add_argument("--batch-size", type=int)
    parser.add_argument("--max-batches", type=int, default=0, help="0 runs until the queue is empty")
    parser.add_argument("--pause", type=float, default=2.0)
    args = parser.parse_args()

    size = args.batch_size or (60 if args.kind == "labels" else 12)
    work = RUN_ROOT / f"{args.kind}-{args.worker}"
    work.mkdir(parents=True, exist_ok=True)
    completed = 0
    while not args.max_batches or completed < args.max_batches:
        batch_path = work / "batch.json"
        result_path = work / "result.json"
        schema_path = work / "schema.json"
        items, claim_output = claim(args.kind, args.worker, size, batch_path)
        print(f"[{args.worker}] {claim_output}", flush=True)
        if not items:
            return
        schema_path.write_text(json.dumps(schema(args.kind, items)))
        prompt = label_prompt(items) if args.kind == "labels" else summary_prompt(items)
        for attempt in range(1, 4):
            result_path.unlink(missing_ok=True)
            response = ask_codex(args.model, args.effort, prompt, schema_path, result_path)
            if response.returncode == 0 and result_path.exists():
                try:
                    payload = json.loads(result_path.read_text())
                    problems = validate_payload(args.kind, payload, items)
                    if not problems:
                        break
                    prompt += "\n\nThe previous attempt failed these checks. Rewrite every value and return the complete object:\n- " + "\n- ".join(problems[:20])
                except (json.JSONDecodeError, TypeError):
                    pass
            print(f"[{args.worker}] Codex attempt {attempt} failed: {(response.stderr or response.stdout)[-500:]}", flush=True)
            time.sleep(10 * attempt)
        else:
            release(args.kind, args.worker)
            raise SystemExit(f"[{args.worker}] Codex failed three times; claims released")
        loaded = submit(args.kind, args.worker, result_path)
        message = (loaded.stdout + loaded.stderr).strip()
        print(f"[{args.worker}] {message}", flush=True)
        submitted = re.search(r"submitted (\d+)", message)
        if (loaded.returncode or "failed 0" not in message or "rejected" in message.lower()
                or not submitted or int(submitted.group(1)) != len(items)):
            release(args.kind, args.worker)
            raise SystemExit(f"[{args.worker}] submit did not complete cleanly; claims released")
        completed += 1
        time.sleep(args.pause)


if __name__ == "__main__":
    main()
