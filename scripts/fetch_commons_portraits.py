"""Download the Wikidata-matched Commons portraits (wikidata_matches.json), record each file's licence and
author from the Commons API, write portal/public/photos/wd-<QID>.webp (200x200), map every OPAX name
variant to that key in photos/people.json, and write photos/credits.json for the attribution line.
Also builds a contact sheet PNG for a visual check of the crops. Honest UA, ~1 request/second."""
import json, os, io, time, urllib.parse, re
from pathlib import Path
import requests
from PIL import Image, ImageDraw
W=Path(__file__).resolve().parents[1]; PH=W/"portal/public/photos"; SCR=W/"scripts"/"_photos_work"; SCR.mkdir(exist_ok=True)
UA={"User-Agent":"OPAX research (opax.com.au; jake.tracey@noice.work)"}; S=requests.Session(); S.headers.update(UA)
matches=json.load(open(SCR/"wikidata_matches.json"))
# one Commons file per QID; several OPAX names may point at it
by_qid={}
for name,m in matches.items():
    by_qid.setdefault(m["qid"], {"label":m["label"],"img":m["img"],"names":[]})["names"].append(name)
def filename(url):  # http://commons.wikimedia.org/wiki/Special:FilePath/Brad%20Hazzard.jpg -> File:Brad Hazzard.jpg
    return "File:"+urllib.parse.unquote(url.rsplit("/",1)[-1])
titles={qid:filename(v["img"]) for qid,v in by_qid.items()}
# 1. licence metadata, 50 titles a call
meta={}
tl=list(titles.items())
for i in range(0,len(tl),50):
    chunk=tl[i:i+50]
    r=S.get("https://commons.wikimedia.org/w/api.php", params={"action":"query","prop":"imageinfo","iiprop":"extmetadata|url","iiurlwidth":"480","titles":"|".join(t for _,t in chunk),"format":"json","formatversion":"2"}, timeout=120).json()
    norm={p.get("title"):p for p in r["query"]["pages"]}
    for n in r["query"].get("normalized",[]): norm[n["from"]]=norm.get(n["to"])
    for qid,t in chunk:
        p=norm.get(t) or {}
        ii=(p.get("imageinfo") or [{}])[0]; ext=ii.get("extmetadata",{})
        g=lambda k: re.sub(r"<[^>]+>","",ext.get(k,{}).get("value","")).strip()
        meta[qid]={"file":t,"thumb":ii.get("thumburl"),"page":ii.get("descriptionurl"),"licence":g("LicenseShortName"),"licence_url":g("LicenseUrl"),"artist":g("Artist"),"credit":g("Credit"),"attribution":g("Attribution"),"attribution_required":g("AttributionRequired")}
    print(f"[meta] {min(i+50,len(tl))}/{len(tl)}", flush=True); time.sleep(1)
lic=collections=__import__("collections").Counter(m["licence"] for m in meta.values()); print("[meta] licences:", lic.most_common(12), flush=True)
OK_LICENCE=re.compile(r"^(CC0|CC BY(-SA)?( \d\.\d)?( [a-z]{2})?|Public domain|GFDL|OGL.*|No restrictions|Copyrighted free use.*|CC BY( \d\.\d)?|CC BY-SA( \d\.\d)?( [A-Za-z]+)?)", re.I)
# 2. download + crop
pm=json.load(open(PH/"people.json")); credits=json.load(open(PH/"credits.json")) if (PH/"credits.json").exists() else {}
ok=skip=bad=0; sheet=[]
for qid,v in by_qid.items():
    m=meta.get(qid) or {}
    if not m.get("thumb") or not m.get("licence"): bad+=1; print(f"  no-meta {qid} {v['label']} {m.get('file')}", flush=True); continue
    if not OK_LICENCE.match(m["licence"]) and "cc" not in m["licence"].lower() and "public" not in m["licence"].lower():
        skip+=1; print(f"  licence-skip {qid} {v['label']} [{m['licence']}]", flush=True); continue
    out=PH/f"wd-{qid}.webp"
    if not out.exists():
        try:
            r=S.get(m["thumb"], timeout=60); r.raise_for_status(); im=Image.open(io.BytesIO(r.content)).convert("RGB")
        except Exception as e:
            bad+=1; print(f"  dl-fail {qid} {v['label']} {e}", flush=True); time.sleep(1); continue
        w,h=im.size; s=min(w,h)
        if h>w:   top=min(max(0,int((h-s)*0.12)), h-s)   # portrait: faces sit high
        else:     top=0
        left=(w-s)//2
        im=im.crop((left,top,left+s,top+s)).resize((200,200),Image.LANCZOS); im.save(out,"WEBP",quality=82)
        time.sleep(1.0)
    for n in v["names"]: pm[n.strip().lower()]=f"wd-{qid}"
    credits[f"wd-{qid}"]={"file":m["file"],"page":m["page"],"licence":m["licence"],"licence_url":m["licence_url"],"artist":m["artist"][:120],"credit":m["credit"][:160],"attribution":m["attribution"][:200],"wikidata":qid,"label":v["label"]}
    ok+=1; sheet.append((qid,v["label"],v["names"][0]))
json.dump(pm, open(PH/"people.json","w"), ensure_ascii=False, indent=0, sort_keys=True)
json.dump(credits, open(PH/"credits.json","w"), ensure_ascii=False, indent=0, sort_keys=True)
print(f"[done] ok={ok} licence-skip={skip} bad={bad} people.json={len(pm)} credits={len(credits)}", flush=True)
# 3. contact sheet(s): 10 per row, 120px tiles with the OPAX name and Wikidata label
cols=10; tile=120; pad=34
for part in range(0,len(sheet),100):
    chunk=sheet[part:part+100]; rows=(len(chunk)+cols-1)//cols
    img=Image.new("RGB",(cols*tile, rows*(tile+pad)),"white"); d=ImageDraw.Draw(img)
    for i,(qid,label,name) in enumerate(chunk):
        x=(i%cols)*tile; y=(i//cols)*(tile+pad)
        img.paste(Image.open(PH/f"wd-{qid}.webp").resize((tile,tile)),(x,y))
        d.text((x+2,y+tile+2), name[:20], fill="black"); d.text((x+2,y+tile+16), label[:20], fill="gray")
    img.save(SCR/f"contact_sheet_{part//100+1}.png")
print("[sheet] written", (len(sheet)+99)//100, "sheets")
