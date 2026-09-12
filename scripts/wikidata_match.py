"""Match OPAX people without a portrait to Wikidata people holding the matching seat who have a Commons
portrait (P18). Two populations: (a) people without a numeric person_id (state parliamentarians, pre-2004
federal members), matched by chamber; (b) since 2026-09-12, federal people WITH a numeric person_id whose
OpenAustralia portrait could not be fetched (the 2025 intake; OpenAustralia went behind a Cloudflare
challenge), matched against House and Senate holders. Strict: surname exact; a real first name must agree
(either a prefix of the other, so Greg/Gregory pass, Anthony/Albert fail); initials-only names (SA Hansard
"K.J. Maher") need the initials to agree; surname-only names accept a single candidate only, and never when
the roster entry spans more than one parliament (wikidata_drop.json is the audited list from the first pass).
Every candidate must have a term overlapping our first..last speech years when Wikidata dates the term, and
must be born 1920 or later when Wikidata knows the birth year; a candidate with neither a dated term nor a
birth year is rejected (that is how a 19th-century namesake slipped through the first pass).
A QID that recrop_commons_portraits.py already dropped as a group shot is offered again only if Wikidata's
P18 file has changed since. Output: scripts/_photos_work/wikidata_matches.json (all matches, old and new)
and wikidata_matches_new.json (this run's additions)."""
import json, requests, re, collections, time, os, sys
W=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); SCR=os.path.join(W, "scripts", "_photos_work")
os.makedirs(SCR, exist_ok=True)
people=json.load(open(f"{W}/portal/public/parliamentarians.json"))["people"]
files={f[:-5] for f in os.listdir(f"{W}/portal/public/photos") if f.endswith(".webp")}
pm=json.load(open(f"{W}/portal/public/photos/people.json"))
old=json.load(open(f"{SCR}/wikidata_matches.json")) if os.path.exists(f"{SCR}/wikidata_matches.json") else {}
drop=set(json.load(open(f"{SCR}/wikidata_drop.json"))) if os.path.exists(f"{SCR}/wikidata_drop.json") else set()
rlog=json.load(open(f"{SCR}/recrop_log.json")) if os.path.exists(f"{SCR}/recrop_log.json") else {}
group_img={m["img"] for n,m in old.items() if rlog.get(f"wd-{m['qid']}")=="group"}   # dropped group shots, by file
todo=[p for p in people if pm.get(p["name"].lower()) not in files and p["name"] not in drop]
STATE={"nsw_la","nsw_lc","vic_la","vic_lc","qld_la","sa_ha","sa_lc"}
def chambers(p):
    ch=set(p.get("chambers") or [])
    if "senate_committee" in ch: ch|={"representatives","senate"}
    return ch-{"senate_committee"}
POS={"nsw_la":"Q19202748","nsw_lc":"Q18810377","vic_la":"Q18534408","vic_lc":"Q19185341","qld_la":"Q18526194","sa_ha":"Q18220900","sa_lc":"Q18662245","representatives":"Q18912794","senate":"Q6814428"}
UA={"User-Agent":"OPAX research (opax.com.au; jake.tracey@noice.work)"}
def sparql(q):
    for i in range(3):
        r=requests.get("https://query.wikidata.org/sparql", params={"query":q,"format":"json"}, headers=UA, timeout=180)
        if r.status_code==200: return r.json()["results"]["bindings"]
        time.sleep(5)
    r.raise_for_status()
def norm(s): return re.sub(r"[^a-z' -]","",s.lower().replace("’","'"))
TITLES={"hon","the","dr","mr","mrs","ms","sir","jr","am","ao","mp","mlc","mla","kc","qc"}
def split(name):
    parts=[p for p in name.replace("."," ").replace(","," ").split() if p and norm(p) not in TITLES]
    if not parts: return "", [], ""
    last=norm(parts[-1]); given=[norm(p) for p in parts[:-1]]
    return last, given, "".join(g[:1] for g in given)
def yr(b,k):
    v=b.get(k,{}).get("value"); return int(v[:4]) if v else None
matched={}; rejected=collections.Counter()
for ch,q in POS.items():
    rows=sparql(f"""SELECT ?person ?personLabel ?img ?start ?end ?born WHERE {{ ?person p:P39 ?st . ?st ps:P39 wd:{q} .
      OPTIONAL {{ ?st pq:P580 ?start }} OPTIONAL {{ ?st pq:P582 ?end }} OPTIONAL {{ ?person wdt:P569 ?born }}
      ?person wdt:P18 ?img . SERVICE wikibase:label {{ bd:serviceParam wikibase:language 'en'. }} }}""")
    by=collections.defaultdict(dict)
    for b in rows:
        qid=b["person"]["value"].split("/")[-1]; lab=b["personLabel"]["value"]; last,given,ini=split(lab)
        d=by[last].setdefault(qid, {"label":lab,"given":given,"ini":ini,"img":b["img"]["value"],"terms":[],"born":yr(b,"born")})
        d["terms"].append((yr(b,"start"),yr(b,"end")))
    ours=[p for p in todo if ch in chambers(p) and p["name"] not in matched]
    hit=surn=0; amb=[]
    for p in ours:
        last,given,ini=split(p["name"]); f,l=p.get("first"),p.get("last")
        def era_ok(d):
            dated=[(s,e) for s,e in d["terms"] if s or e]
            if d["born"] is not None and d["born"]<1920: return False
            if d["img"] in group_img: return False
            if dated and f: return any((s is None or s<=l+1) and (e is None or e>=f-1) for s,e in dated)
            return d["born"] is not None   # undated term: only if a modern birth year vouches for them
        cands={k:v for k,v in by.get(last,{}).items() if era_ok(v)}
        real=[g for g in given if len(g)>1]
        multi=len({"federal" if c in ("representatives","senate") else c[:3] for c in chambers(p)})>1
        if real:
            g0=real[0]
            ok={k:v for k,v in cands.items() if any(x.startswith(g0) or g0.startswith(x) for x in v["given"][:2])}
        elif ini and not multi:   # "T Smith" spanning VIC and a federal committee matched the wrong Smith once
            ok={k:v for k,v in cands.items() if v["ini"] and (v["ini"].startswith(ini) or ini.startswith(v["ini"]))}
        else:
            # surname-only: one candidate, and the roster entry must sit in one parliament
            ok=cands if len(cands)==1 and not multi else {}
            if ok: surn+=1
        if len(ok)==1:
            k,v=next(iter(ok.items())); hit+=1
            matched[p["name"]]={"qid":k,"label":v["label"],"img":v["img"],"chamber":ch,"kind":"surname-only" if not given else "name","born":v["born"],"ours":(f,l),"pid":p.get("pid")}
        elif len(ok)>1: amb.append((p["name"],[v["label"] for v in ok.values()]))
        else: rejected[ch]+=1
    print(f"  {ch:16s} ours={len(ours):4d} matched={hit:4d} (surname-only {surn:3d}) ambiguous={len(amb):3d}", flush=True)
    if amb[:3]: print("     ambiguous e.g.", amb[:3])
    time.sleep(1)
new={n:m for n,m in matched.items() if n not in old or old[n]["img"]!=m["img"]}
print("total matched:", len(matched), "of", len(todo), "| new this run:", len(new))
merged=dict(old); merged.update(matched)
json.dump(merged, open(f"{SCR}/wikidata_matches.json","w"), indent=1, ensure_ascii=False)
json.dump(new, open(f"{SCR}/wikidata_matches_new.json","w"), indent=1, ensure_ascii=False)
print("no birth year known:", sum(1 for v in new.values() if v["born"] is None), "| born<1940:", [(k,v["label"],v["born"]) for k,v in new.items() if v["born"] and v["born"]<1940][:8])
print("surname-only new:", [(k,v["label"]) for k,v in new.items() if v["kind"]=="surname-only"])
