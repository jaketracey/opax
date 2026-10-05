"""Backfill federal portraits from OpenAustralia (same official APH portraits, keyed by our person_id).
Writes portal/public/photos/<pid>.webp (200x200 centre-square, like the existing set) and updates
photos/people.json (lowercased display name -> pid). Idempotent; honest UA; 1 request/second.

Identity (2026-10-06). The roster's pid is the dominant person_id on a name's speeches, and a Hansard print
can carry somebody else's: "Patrick Conaghan" -> 10903 (Rex Patrick), "Graeme Campbell" -> 10098 (George
Campbell). This script once mapped every roster name to its roster pid, which put 13 people on another
person's face (docs/PHOTOS.md). Now a name is mapped only when it agrees with the name the pid belongs to
(TheyVoteForYou's, in votes.json, else pay.json) or scripts/photo_identity.json lists it as the same person;
a surname-only or initials print only alongside a fetch of its pid and only when every chamber it spoke in
is federal; never onto a pid listed there as wrong_face; and a download whose bytes match another portrait
is discarded. A full name whose pid already has a file (the roster renamed someone) is mapped to it without
a fetch. The run ends with scripts/photo_identity.mjs over the whole map and exits with its status."""
import hashlib, io, json, re, subprocess, sys, time, unicodedata
from pathlib import Path
W = Path(__file__).resolve().parents[1]; PH = W/"portal/public/photos"
TITLES = {"hon", "the", "dr", "mr", "mrs", "ms", "sir", "jr", "am", "ao", "mp", "mlc", "mla", "kc", "qc"}

def parts(name):
    s = "".join(c for c in unicodedata.normalize("NFKD", str(name or "")) if not unicodedata.combining(c))
    s = s.lower().replace("’", "'").replace("‘", "'").replace("`", "'").replace(".", " ")
    return [t for t in re.split(r"[\s,]+", s) if t and t not in TITLES]

def weak(name):
    """A print with no real first name: "Burke", "T Smith", "K.J. Maher"."""
    return all(len(t) == 1 for t in parts(name)[:-1])

def agrees(name, owner):
    """The name agrees with the pid owner's name: same surname (however many words), and a first name that
    is a prefix of one of the owner's either way (Phil/Phillip), or initials that agree. The JavaScript twin
    is nameAgrees() in scripts/photo_identity.mjs, which has the final say."""
    n, o = parts(name), parts(owner)
    if not n or not o or n[-1] != o[-1]: return False
    tail = 1
    while tail < len(n) and tail < len(o) and n[-1 - tail] == o[-1 - tail]: tail += 1
    given, owner_given = n[:-tail], o[:-tail]
    if not given: return True
    if not owner_given: return False
    if all(len(t) == 1 for t in given):
        a, b = "".join(given), "".join(t[0] for t in owner_given)
        return a.startswith(b) or b.startswith(a)
    first = given[0]
    return any(t == first or (min(len(t), len(first)) >= 3 and (t.startswith(first) or first.startswith(t))) for t in owner_given)

def owners(votes, pay):
    """pid -> the name TheyVoteForYou (else the pay registry) gives it."""
    out = {k: v["name"] for k, v in votes.items() if k.isdigit() and isinstance(v, dict) and v.get("name")}
    for v in (pay.get("people") or {}).values():
        pid = str(v.get("pid") or "")
        if pid.isdigit() and v.get("name"): out.setdefault(pid, v["name"])
    return out

def plan(people, pm, have, owner, identity):
    """Split the roster into (map, fetch, skipped): names to map to an existing file, (name, pid) pairs to
    fetch, and the names left alone with the reason."""
    same = {n: v["key"] for n, v in (identity.get("same_person") or {}).items()}
    wrong = set(identity.get("wrong_face") or {})
    to_map, to_fetch, skipped = {}, [], {}
    for p in people:
        pid = str(p.get("pid") or ""); name = p["name"].strip().lower()
        if not pid.isdigit() or name in pm: continue
        if pid in wrong: skipped[name] = f"{pid} is wrong_face"; continue
        if same.get(name) != pid:
            if pid not in owner: skipped[name] = f"{pid} has no known owner"; continue
            if not agrees(name, owner[pid]): skipped[name] = f"{pid} is {owner[pid]}"; continue
        if weak(name):
            if pid in have: continue  # left as it is: a print can hold several people
            if set(p.get("states") or []) != {"federal"}:
                skipped[name] = "surname-only print outside federal parliament"; continue
        if pid in have: to_map[name] = pid
        else: to_fetch.append((name, pid))
    return to_map, to_fetch, skipped

def main():
    import requests
    from PIL import Image
    S = requests.Session(); S.headers["User-Agent"] = "OPAX research (opax.com.au; jake.tracey@noice.work)"
    people = json.load(open(W/"portal/public/parliamentarians.json"))["people"]
    pm = json.load(open(PH/"people.json"))
    identity = json.load(open(W/"scripts/photo_identity.json"))
    owner = owners(json.load(open(W/"portal/public/votes.json")), json.load(open(W/"portal/public/pay.json")))
    have = {f.stem for f in PH.glob("*.webp")}
    seen = {hashlib.sha256(f.read_bytes()).hexdigest(): f.stem for f in PH.glob("*.webp")}
    to_map, todo, skipped = plan(people, pm, have, owner, identity)
    for name, why in sorted(skipped.items()): print(f"  skip {name!r}: {why}", flush=True)
    pm.update(to_map)
    print(f"[oa] mapped {len(to_map)} names to files already on disk; {len(todo)} to fetch; {len(skipped)} skipped", flush=True)
    ok = miss = dup = 0; log = {}; fetched = {}
    for i, (name, pid) in enumerate(todo, 1):
        if pid in fetched:
            if fetched[pid]: pm[name] = pid
            continue
        got = None
        for path in (f"/images/mpsL/{pid}.jpg", f"/images/mps/{pid}.jpg"):
            try:
                r = S.get("https://www.openaustralia.org.au"+path, timeout=20)
                if r.status_code == 200 and r.headers.get("content-type","").startswith("image") and len(r.content) > 500:
                    got = r.content; break
            except Exception as e:
                print(f"  err {pid} {e}", flush=True)
            time.sleep(0.5)
        if not got:
            miss += 1; log[pid] = "none"; fetched[pid] = False; print(f"  none {pid} {name}", flush=True); time.sleep(0.5); continue
        im = Image.open(io.BytesIO(got)).convert("RGB"); w, h = im.size; s = min(w, h)
        im = im.crop(((w-s)//2, max(0,(h-s)//2 - s//10), (w-s)//2 + s, max(0,(h-s)//2 - s//10) + s)).resize((200, 200), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, "WEBP", quality=82); data = buf.getvalue()
        twin = seen.get(hashlib.sha256(data).hexdigest())
        if twin:
            dup += 1; log[pid] = f"same bytes as {twin}"; fetched[pid] = False
            print(f"  dup  {pid} {name}: OpenAustralia served the same image as {twin}; not written", flush=True); continue
        (PH/f"{pid}.webp").write_bytes(data); seen[hashlib.sha256(data).hexdigest()] = pid
        pm[name] = pid; ok += 1; log[pid] = "oa"; fetched[pid] = True
        if i % 25 == 0:
            json.dump(pm, open(PH/"people.json","w"), ensure_ascii=False, indent=0, sort_keys=True)
            print(f"  ... {i}/{len(todo)} ok={ok} none={miss} dup={dup}", flush=True)
        time.sleep(1.0)
    json.dump(pm, open(PH/"people.json","w"), ensure_ascii=False, indent=0, sort_keys=True)
    (W/"scripts"/"_photos_work").mkdir(exist_ok=True); json.dump(log, open(W/"scripts"/"_photos_work"/"backfill_photos_oa.log.json","w"), indent=0)
    print(f"[oa] done ok={ok} none={miss} dup={dup} -> {PH} people.json={len(pm)}")
    sys.exit(subprocess.run(["node", str(W/"scripts/photo_identity.mjs")]).returncode)

if __name__ == "__main__":
    main()
