#!/usr/bin/env python3
"""Generate private Android flow copies without changing shared iOS flows."""
import argparse
from pathlib import Path
import re
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
parser.add_argument("--overrides", type=Path, help="Private continuation flows, copied after preparation")
args = parser.parse_args()
source = Path(__file__).resolve().parent.parent / ".maestro"

for original in source.rglob("*"):
    relative = original.relative_to(source)
    if not original.is_file() or original.suffix not in {".yaml", ".js", ".json"}:
        continue
    if any(part in {"results", "screenshots", "recordings"} for part in relative.parts):
        continue
    target = args.output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if original.suffix != ".yaml":
        shutil.copyfile(original, target)
        continue
    body = original.read_text()
    # Android may expose tab nodes before they respond during a cold launch.
    body = re.sub(
        r"(?m)(^- launchApp(?::\n(?:[ \t]+[^\n]*\n)+|\n))",
        r"\1- waitForAnimationToEnd:\n    timeout: 5000\n",
        body,
    )
    # Maestro returns from launch before React has mounted its URL listener.
    # Wait for the root before an immediately following Android VIEW intent.
    body = re.sub(
        r"(?m)(^- launchApp:\n(?:[ \t]+[^\n]*\n)+- waitForAnimationToEnd:\n    timeout: 5000\n)(?=- openLink:)",
        r"\1- extendedWaitUntil:\n    visible:\n      id: today-screen\n    timeout: 30000\n",
        body,
    )
    if str(relative) == "13-today.yaml":
        # Android's explicit Back action returns from each pushed bill.
        body = body.replace("- tapOn: Today", "- pressKey: Back")
        # Wait for the cold edition load before scrolling; otherwise Android
        # can pass its later-inserted header while searching only downwards.
        body = body.replace(
            "- scrollUntilVisible:\n",
            "- extendedWaitUntil:\n    visible:\n      id: today-edition-head\n    timeout: 30000\n- scrollUntilVisible:\n",
            1,
        )
    if str(relative) == "support/search-query.yaml":
        # Android cannot centre the first input beyond the scroll view's top.
        # Require its visibility while keeping the real typing assertions.
        body = body.replace("    centerElement: true\n", "")
    # Cold-launch tab nodes can be present before their tap handler is ready.
    # Retry this one interaction only if the UI hierarchy did not change.
    body = re.sub(
        r"(?m)(^- tapOn:\n    id: tab-[^\n]+\n)(?!    retryTapIfNoChange:)",
        r"\1    retryTapIfNoChange: true\n",
        body,
    )
    # Android's stable navigator exposes the same tab test IDs as shared flows.
    target.write_text(body)
if args.overrides:
    for original in args.overrides.rglob("*"):
        if original.is_file() and original.suffix in {".yaml", ".js", ".json"}:
            target = args.output / original.relative_to(args.overrides)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original, target)
print(f"Prepared Android flow copies in {args.output}")
