"""Backfill federal portraits from OpenAustralia (same official APH portraits, keyed by our person_id).
Writes portal/public/photos/<pid>.webp (200x200 centre-square, like the existing set) and updates
photos/people.json (lowercased display name -> pid). Idempotent; honest UA; 1 request/second."""
import json, sys, time, io
from pathlib import Path
import requests
from PIL import Image
W = Path(__file__).resolve().parents[1]; PH = W/"portal/public/photos"
S = requests.Session(); S.headers["User-Agent"] = "OPAX research (opax.com.au; jake.tracey@noice.work)"
people = json.load(open(W/"portal/public/parliamentarians.json"))["people"]
pm = json.load(open(PH/"people.json"))
have = {f.stem for f in PH.glob("*.webp")}
todo = [p for p in people if str(p.get("pid","")).isdigit() and p["pid"] not in have]
print(f"[oa] {len(todo)} federal people without a portrait", flush=True)
ok = miss = 0; log = {}
for i, p in enumerate(todo, 1):
    pid = p["pid"]; got = None
    for path in (f"/images/mpsL/{pid}.jpg", f"/images/mps/{pid}.jpg"):
        try:
            r = S.get("https://www.openaustralia.org.au"+path, timeout=20)
            if r.status_code == 200 and r.headers.get("content-type","").startswith("image") and len(r.content) > 500:
                got = r.content; break
        except Exception as e:
            print(f"  err {pid} {e}", flush=True)
        time.sleep(0.5)
    if not got:
        miss += 1; log[pid] = "none"; print(f"  none {pid} {p['name']}", flush=True); time.sleep(0.5); continue
    im = Image.open(io.BytesIO(got)).convert("RGB"); w, h = im.size; s = min(w, h)
    im = im.crop(((w-s)//2, max(0,(h-s)//2 - s//10), (w-s)//2 + s, max(0,(h-s)//2 - s//10) + s)).resize((200, 200), Image.LANCZOS)
    im.save(PH/f"{pid}.webp", "WEBP", quality=82)
    pm[p["name"].strip().lower()] = pid; ok += 1; log[pid] = "oa"
    if i % 25 == 0:
        json.dump(pm, open(PH/"people.json","w"), ensure_ascii=False, indent=0, sort_keys=True)
        print(f"  ... {i}/{len(todo)} ok={ok} none={miss}", flush=True)
    time.sleep(1.0)
json.dump(pm, open(PH/"people.json","w"), ensure_ascii=False, indent=0, sort_keys=True)
(W/"scripts"/"_photos_work").mkdir(exist_ok=True); json.dump(log, open(W/"scripts"/"_photos_work"/"backfill_photos_oa.log.json","w"), indent=0)
print(f"[oa] done ok={ok} none={miss} -> {PH} people.json={len(pm)}")
