#!/usr/bin/env python3
"""Design programme pass 2B: the mechanical rename codemod.

Renames the deprecated type roles to the eleven current ones in JSX
(`variant="caption"` to `variant="fine"`, and so on), adds `tabular` where an
old role carried it and `tone="bronzeInk"` where `tag` carried the colour. It
changes props only, never layout, and is idempotent. Usage:

    python3 scripts/codemod-design-p2b.py src            # rewrite
    python3 scripts/codemod-design-p2b.py --check src    # list, change nothing
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# old role: (new role, add tabular, default tone when the element has none)
ROLES = {
    "lede": ("body", False, None),
    "padLede": ("body", False, None),
    "caption": ("fine", False, None),
    "figure": ("display", False, None),
    "figureInline": ("strong", True, None),
    "tag": ("label", False, "bronzeInk"),
    "kicker": ("label", False, None),
    "chip": ("label", False, None),
    "countdown": ("control", True, None),
}
ATTR = re.compile(r'variant="(' + "|".join(ROLES) + r')"')


def element_span(text: str, at: int) -> tuple[int, int]:
    """The JSX opening tag around offset `at`: from its `<` to its `>`."""
    start = text.rfind("<", 0, at)
    depth = 0
    i = at
    while i < len(text):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch == ">" and depth == 0:
            return start, i
        i += 1
    raise ValueError(f"unterminated element at {at}")


def rewrite(text: str) -> tuple[str, int]:
    count = 0
    while True:
        match = ATTR.search(text)
        if not match:
            return text, count
        new, tabular, tone = ROLES[match.group(1)]
        start, end = element_span(text, match.start())
        tag = text[start:end]
        extra = ""
        if tabular and not re.search(r"\btabular\b", tag):
            extra += " tabular"
        if tone and "tone=" not in tag:
            extra += f' tone="{tone}"'
        text = text[: match.start()] + f'variant="{new}"{extra}' + text[match.end() :]
        count += 1


def main(argv: list[str]) -> int:
    check = "--check" in argv
    roots = [Path(a) for a in argv if not a.startswith("--")]
    total = 0
    for root in roots:
        for path in sorted(root.rglob("*.tsx")):
            text = path.read_text()
            out, count = rewrite(text)
            if count:
                total += count
                print(f"{path}: {count}")
                if not check:
                    path.write_text(out)
    print(f"{'would rename' if check else 'renamed'} {total} variant props")
    return 1 if check and total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
