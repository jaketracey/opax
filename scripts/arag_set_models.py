#!/usr/bin/env python3
"""Compatibility entry point for configuring Opax generation through OpenRouter.

Use scripts/arag_byok_openrouter.py to select an OpenRouter model or preset.
This legacy platform-model setter refuses native provider selections.
"""
import runpy
import sys
from pathlib import Path

if len(sys.argv) > 1 and sys.argv[1] != "openai-compatible":
    raise SystemExit("Native provider selection is disabled. Use arag_byok_openrouter.py with an OpenRouter model or preset.")
sys.argv = [str(Path(__file__).with_name("arag_byok_openrouter.py"))]
runpy.run_path(sys.argv[0], run_name="__main__")
