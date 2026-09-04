"""Second pass over the Commons portraits: face-aware crops and the drop list.

* scripts/_photos_work/src/wd-<QID>.jpg are the 640px sources (fetch_commons_portraits.py keeps only the
  200px crop, so re-download with Special:FilePath?width=640 first).
* YuNet (scripts/_photos_work/face_detection_yunet_2023mar.onnx, opencv_zoo) finds faces. The crop is a
  square around the largest face, 2.6x the face height, kept inside the image. A photo whose second face is
  at least 60% the size of the largest is a group shot and is dropped: the wrong face on a person page is
  worse than no portrait. No face found -> the old top-weighted crop, flagged "noface" in the log.
* scripts/_photos_work/wikidata_drop.json lists OPAX names whose match failed the seat-holder audit
  (a surname-only page that spans more than one parliament, or a rival holder with the same surname);
  their files, credits and name-map entries are removed.
Writes contact sheets to scripts/_photos_work/recrop_sheet_<n>.png for a visual check."""
import json, os, sys, collections
from pathlib import Path
import cv2, numpy as np
from PIL import Image, ImageDraw
W=Path(__file__).resolve().parents[1]; PH=W/"portal/public/photos"; WK=W/"scripts/_photos_work"; SRC=WK/"src"
pm=json.load(open(PH/"people.json")); credits=json.load(open(PH/"credits.json")); matches=json.load(open(WK/"wikidata_matches.json"))
drop_names=set(json.load(open(WK/"wikidata_drop.json")))
det=cv2.FaceDetectorYN.create(str(WK/"face_detection_yunet_2023mar.onnx"), "", (320,320), 0.7, 0.3, 5000)
def faces(im):
    h,w=im.shape[:2]; scale=min(1.0, 800/max(h,w)); s=cv2.resize(im,(int(w*scale),int(h*scale))) if scale<1 else im
    det.setInputSize((s.shape[1],s.shape[0])); _,f=det.detect(s)
    if f is None: return []
    return sorted([(x/scale,y/scale,fw/scale,fh/scale) for x,y,fw,fh,*_ in f], key=lambda b:-b[3])
log={}; dropped_keys=set()
# 1. drop list -> remove every name pointing at a key that only those names use
for name in drop_names:
    m=matches.get(name); key=f"wd-{m['qid']}" if m else None
    pm.pop(name.strip().lower(), None)
    if key and not any(v==key for v in pm.values()): dropped_keys.add(key)
# 2. re-crop
sheet=[]
for key in sorted(k for k in credits if k.startswith("wd-")):
    if key in dropped_keys: continue
    src=SRC/f"{key}.jpg"
    if not src.exists(): log[key]="nosrc"; continue
    im=cv2.imread(str(src))
    if im is None: log[key]="unreadable"; continue
    h,w=im.shape[:2]; fs=faces(im)
    if len(fs)>=2 and fs[1][3]>=0.6*fs[0][3]:
        log[key]="group"; dropped_keys.add(key); continue
    if fs:
        x,y,fw,fh=fs[0]; side=int(min(max(fw,fh)*2.6, min(w,h))); cx=x+fw/2; cy=y+fh*0.45
        left=int(min(max(0,cx-side/2), w-side)); top=int(min(max(0,cy-side/2), h-side)); log[key]="face"
    else:
        side=min(w,h); left=(w-side)//2; top=min(max(0,int((h-side)*0.12)), h-side) if h>w else 0; log[key]="noface"
    crop=cv2.cvtColor(im[top:top+side, left:left+side], cv2.COLOR_BGR2RGB)
    Image.fromarray(crop).resize((200,200), Image.LANCZOS).save(PH/f"{key}.webp","WEBP",quality=82)
    sheet.append(key)
# 3. apply drops to files, credits, name map
for key in dropped_keys:
    (PH/f"{key}.webp").unlink(missing_ok=True); credits.pop(key, None)
    for n in [n for n,v in pm.items() if v==key]: pm.pop(n)
json.dump(pm, open(PH/"people.json","w"), ensure_ascii=False, indent=0, sort_keys=True)
json.dump(credits, open(PH/"credits.json","w"), ensure_ascii=False, indent=0, sort_keys=True)
json.dump(log, open(WK/"recrop_log.json","w"), indent=0)
print("recrop:", collections.Counter(log.values()).most_common(), "| dropped keys:", len(dropped_keys), "| credits:", len(credits), "| people.json:", len(pm))
# 4. sheets
label={}
for n,m in matches.items(): label.setdefault(f"wd-{m['qid']}", (n, m["label"]))
cols=10; tile=120; pad=34
for part in range(0,len(sheet),100):
    chunk=sheet[part:part+100]; rows=(len(chunk)+cols-1)//cols
    img=Image.new("RGB",(cols*tile, rows*(tile+pad)),"white"); d=ImageDraw.Draw(img)
    for i,key in enumerate(chunk):
        x=(i%cols)*tile; y=(i//cols)*(tile+pad); n,l=label.get(key,(key,""))
        img.paste(Image.open(PH/f"{key}.webp").resize((tile,tile)),(x,y)); d.text((x+2,y+tile+2), n[:20], fill="black"); d.text((x+2,y+tile+16), f"{l[:14]} {log[key]}", fill="gray")
    img.save(WK/f"recrop_sheet_{part//100+1}.png")
print("sheets:", (len(sheet)+99)//100)
