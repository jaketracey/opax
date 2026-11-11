#!/usr/bin/env python3
"""Second OCR reader: a local vision model behind an OpenAI-compatible server on 127.0.0.1.

  python scripts/ocr/vlm_read.py --base http://127.0.0.1:12345/v1 --out <dir> <page image>...

Asks the model to transcribe every table row and every figure on the page with its label,
exactly as printed, and saves the reply per page (<dir>/<image stem>.vlm.json). Nothing is
sent off the machine: the base URL must be a loopback address.
"""
import argparse, base64, json, sys, time, urllib.request
from pathlib import Path

PROMPT = ("Transcribe this scanned report page. Output JSON only: {\"tables\": [{\"title\": str, \"header\": [str], "
          "\"rows\": [[str]]}], \"figures\": [{\"label\": str, \"value\": str}]}. Copy every table row cell by cell, "
          "exactly as printed (same digits, commas, % signs, brackets and words). Under figures, list every number in "
          "charts and running text with the words that label it, copied exactly. Do not calculate, correct, round or "
          "infer anything; if a value is unreadable, write \"?\".")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:12345/v1")
    ap.add_argument("--model", default="local")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("images", nargs="+", type=Path)
    a = ap.parse_args()
    if not a.base.startswith(("http://127.0.0.1", "http://localhost")):
        sys.exit("refusing a non-loopback model server")
    a.out.mkdir(parents=True, exist_ok=True)
    for img in a.images:
        data = base64.b64encode(img.read_bytes()).decode()
        body = {"model": a.model, "temperature": 0, "max_tokens": 6000,
                "messages": [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{data}"}},
                                                          {"type": "text", "text": PROMPT}]}]}
        t = time.time()
        req = urllib.request.Request(a.base + "/chat/completions", json.dumps(body).encode(), {"Content-Type": "application/json"})
        reply = json.load(urllib.request.urlopen(req, timeout=1800))
        text = reply["choices"][0]["message"]["content"]
        (a.out / f"{img.stem}.vlm.json").write_text(json.dumps({"image": img.name, "model": reply.get("model"), "seconds": round(time.time() - t, 1), "reply": text}, ensure_ascii=False, indent=1))
        print(f"{img.name}: {round(time.time() - t, 1)} s, {len(text)} chars", file=sys.stderr)


if __name__ == "__main__":
    main()
