#!/usr/bin/env python3
"""
Provision (and administer) the OPAX knowledge box on Progress Agentic RAG.

Account-plane operations using the NUA key in .env. Deliberately does NOT
register or start any Data-Augmentation (enrichment) task: enrichment runs
over the whole corpus and costs platform tokens, so it stays off until the
cost is approved with concrete numbers (see MIGRATION-ARAG.md §Costs).

Usage (from repo root, .env populated):
  uv run python scripts/arag_provision.py list-kbs
  uv run python scripts/arag_provision.py create            # create 'opax' KB + mint token
  uv run python scripts/arag_provision.py delete-kb <slug>  # typed confirmation required
  uv run python scripts/arag_provision.py tasks             # show DA task configs on the OPAX KB
  uv run python scripts/arag_provision.py stop-task <task-id>   # remove a task config

Needs: ARAG_ZONE, ARAG_ACCOUNT (account UUID), ARAG_NUA_KEY.
`create` writes ARAG_KB_ID / ARAG_KB_TOKEN back into .env.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parli.arag import AccountClient, AragConfig, KbClient, load_dotenv  # noqa: E402

KB_SLUG = "opax"
KB_TITLE = "OPAX — Open Parliamentary Accountability eXchange"
KB_DESCRIPTION = (
    "Australian parliamentary corpus: 1.19M speeches (federal + VIC/NSW/QLD/SA, "
    "1901–2026), 232K legal documents, news articles. Structured data "
    "(votes, donations, contracts) stays in Postgres — this box is the text corpus."
)


def _env_write(updates: dict) -> None:
    """Append/replace KEY=VALUE lines in .env without touching other lines."""
    path = Path(".env")
    lines = path.read_text().splitlines() if path.exists() else []
    for key, value in updates.items():
        line = f"{key}={value}"
        for i, existing in enumerate(lines):
            if existing.startswith(f"{key}="):
                lines[i] = line
                break
        else:
            lines.append(line)
    path.write_text("\n".join(lines) + "\n")


def cmd_list_kbs(cfg: AragConfig) -> None:
    for kb in AccountClient(cfg).list_kbs():
        print(f"{kb['id']}  {kb.get('slug', ''):24s}  {kb.get('title', '')!r}")


def cmd_create(cfg: AragConfig) -> None:
    account = AccountClient(cfg)
    kb_id = account.create_kb(KB_SLUG, KB_TITLE, KB_DESCRIPTION)
    print(f"KB '{KB_SLUG}': {kb_id}")
    token = account.mint_kb_token(kb_id)
    _env_write({"ARAG_KB_ID": kb_id, "ARAG_KB_TOKEN": token})
    print("Wrote ARAG_KB_ID and ARAG_KB_TOKEN to .env")
    print("NOTE: no enrichment (DA) tasks were registered — by design. "
          "Enable them only after the cost sign-off (MIGRATION-ARAG.md §Costs).")


def cmd_delete_kb(cfg: AragConfig, slug: str) -> None:
    account = AccountClient(cfg)
    kb = next((k for k in account.list_kbs() if k.get("slug") == slug), None)
    if not kb:
        sys.exit(f"No KB with slug {slug!r} on account {cfg.account}")
    print(f"About to PERMANENTLY DELETE: {kb['id']}  {kb.get('slug')}  {kb.get('title')!r}")
    typed = input(f"Type the slug ({slug}) to confirm: ").strip()
    if typed != slug:
        sys.exit("Aborted — slug mismatch.")
    account.delete_kb(kb["id"])
    print(f"Deleted knowledge box {slug} ({kb['id']}).")


def cmd_tasks(cfg: AragConfig) -> None:
    print(KbClient(cfg).list_tasks())


def cmd_stop_task(cfg: AragConfig, task_id: str) -> None:
    KbClient(cfg).delete_task(task_id)
    print(f"Removed task config {task_id}.")


def main() -> None:
    load_dotenv()
    cfg = AragConfig.from_env()
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    cmd, rest = args[0], args[1:]
    if cmd == "list-kbs":
        cmd_list_kbs(cfg)
    elif cmd == "create":
        cmd_create(cfg)
    elif cmd == "delete-kb" and rest:
        cmd_delete_kb(cfg, rest[0])
    elif cmd == "tasks":
        cmd_tasks(cfg)
    elif cmd == "stop-task" and rest:
        cmd_stop_task(cfg, rest[0])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
