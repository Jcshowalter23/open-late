# deal-day parser shared by all state enrich.py files (v97): unions EVERY day range and single day named in the text,
# e.g. "Monday 11am-6pm, Tuesday-Friday 3-6pm" -> "Mon-Fri" (old parser kept only the first range: "Tue-Fri").
import re
DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
DAYNAME={'Mon':'Monday','Tue':'Tuesday','Wed':'Wednesday','Thu':'Thursday','Fri':'Friday','Sat':'Saturday','Sun':'Sunday'}
D=r'(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|rsday|urday)?s?\.?'
RNG=re.compile(r'(?i)\b'+D+r'\s*(?:-|–|—|thru|through|to|till|until)\s*'+D+r'(?![a-z])')
ONE=re.compile(r'(?i)\b'+D+r'(?![a-z])')
def _i(x): return DAYS.index(x[:3].title())
def fmt(S):
    if len(S)==7: return 'Daily'
    L=sorted(S); runs=[]
    for d in L:
        if runs and d==runs[-1][-1]+1: runs[-1].append(d)
        else: runs.append([d])
    if len(runs)>1 and runs[0][0]==0 and runs[-1][-1]==6: runs[0]=runs.pop()+runs[0]   # wrap: Sun-Thu, Sat-Mon
    out=[]
    for r in runs: out.append(f"{DAYS[r[0]]}-{DAYS[r[-1]]}" if len(r)>=3 else ','.join(DAYS[x] for x in r))
    return ','.join(out)
def days_of(s,postday=None):
    if re.search(r'(?i)\btgif\b',s): return 'Fri',None
    S=set(); t=s
    m=re.search(r'(?i)happy\s*hours?',t)
    if m:
        pre,post=t[:m.start()],t[m.end():]
        SCH=r'(?i)\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*(?:(?:-|–|to|through)\s*[a-z]+\.?\s*)?:?\s*\d{1,2}(?::\d\d)?\s*(?:am|pm|a|p)?\s*(?:-|–)'
        if (len(re.findall(SCH,pre))>=2 or re.search(r'(?i)\bsun\w*\s*(?:-|–|to|through)\s*sat\w*\.?\s*:\s*\d',pre)) and (RNG.search(post) or ONE.search(post) or re.search(r'(?i)weekday',post)):
            pre=''   # an opening-hours schedule before "Happy Hour:" is not the deal's days
        c=re.search(r'(?i)\b(dj|live music|brunch|karaoke|trivia|bingo|kids eat|lunch)\b',post)
        if c:
            k=max([post.rfind(x,0,c.start()) for x in (',','·',';',' and ','—',' - ','|')]+[-1])
            post=post[:k if k>0 else c.start()]
        t=pre+' '+post
    if re.search(r'(?i)\bweekdays?\b',t): S|={0,1,2,3,4}
    for m in RNG.finditer(t):
        a,b=_i(m[1]),_i(m[2]); k=a
        while True:
            S.add(k)
            if k==b: break
            k=(k+1)%7
    t=RNG.sub(' ',t)
    for m in ONE.finditer(t):
        w=m.group(0).lower()
        if w in ('sat','sun','wed','mon') and m.group(0)[0].islower(): continue   # lowercase "sun"/"sat" words, not days
        S.add(_i(m[1]))
    if S: return fmt(S),None
    if re.search(r'(?i)\b(every ?day|7 days a week|seven days|nightly|every night)\b|\bdaily\b(?!\s+(food\s+|lunch\s+|dinner\s+|drink\s+)?specials?)',s): return 'Daily',None
    if postday and re.search(r'(?i)\b(today|tonight|this afternoon)\b',s): return postday,f"Mentioned in a {DAYNAME[postday]} post; other days not stated"
    return 'See venue','Days not stated'
