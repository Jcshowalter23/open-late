#!/usr/bin/env python3
"""v244 source-on-card guard. app.js splitSrc() moves source refs out of display text
(hoursNote, kitchenNote, deal text, deal .src, priceText "(Facebook page)") into the Sources list at render.
This scan flags source-looking text in OTHER display fields (new data shapes) so the weekly refresh can extend splitSrc."""
import json,glob,re,collections,os,sys
root=sys.argv[1] if len(sys.argv)>1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAT=re.compile(r'(\(\s*(?:via|per|source[sd]?:?)\s|\bsource[sd]?\s*:|checked \d{4}-\d\d-\d\d|https?://|\bvenue (?:site|website) [\w-]+\.)',re.I)
HANDLED={'hoursNote','kitchenNote','priceText','happyHours[].text','specials[].text','happyHours[].src','specials[].src'}
SKIP={'source','phoneSource','websiteSource','website','menu','u','url','src','s','sources','quote','startSource','name'}
c=collections.Counter();ex={}
def walk(o,p):
    if isinstance(o,str):
        if PAT.search(o) and p not in HANDLED: c[p]+=1; ex.setdefault(p,o[:140])
    elif isinstance(o,dict):
        for k,v in o.items():
            if k not in SKIP: walk(v,f'{p}.{k}' if p else k)
    elif isinstance(o,list):
        for v in o: walk(v,p+'[]')
for f in glob.glob(f'{root}/data/county/*.json'):
    for r in json.load(open(f)).get('restaurants',[]): walk(r,'')
for k,v in c.most_common(): print(f'UNHANDLED {v:6} {k}: {ex[k]}')
print(f'src_scan: {sum(c.values())} unhandled source-looking display strings')
