"""Prepare a narrow, hash-guarded patch from the deployed H5, not the dirty checkout.
No deployment or paid calls. Existing lazy chunk names are preserved in backups;
new content-addressed names and entry bundles prevent stale client caches.
"""
import pathlib, hashlib, json, re
ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE=ROOT/'artifacts/ai-label-baseline-20261016'
OUT=ROOT/'artifacts/ai-label-candidate-20261016'
OUT.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
old='children:e.isAI?"".concat(it," · AI生成"):I(e.sender)||ot.label'
new='children:e.isAI===true?"".concat(it," · AI生成"):(I(e.sender)||ot.label)+(e.aiGenerated===true?" · AI辅助生成":"")'
report_old='color:"#9A5B00",fontSize:"12px",fontWeight:700},children:"本页面健康信息整理与趋势分析由人工智能（AI）生成"}),(0,u.jsx)(s.xv,{style:{display:"block",color:c.O9.textMuted,fontSize:"10px",marginTop:"2px"}'
report_new='color:"#9A5B00",fontSize:"14px",lineHeight:"21px",fontWeight:700},children:"本页面健康信息整理与趋势分析由人工智能（AI）生成"}),(0,u.jsx)(s.xv,{style:{display:"block",color:c.O9.textSecondary,fontSize:"14px",lineHeight:"21px",marginTop:"4px"}'
files=[]
for label,main in [('normal','app.3d70bc63.js'),('review','app.ebdbfd46.js')]:
 dest=OUT/label;dest.mkdir(exist_ok=True)
 raw=(BASE/(label+'-'+main)).read_bytes(); updated=raw.decode('utf-8')
 for chunk in ['63','596','200']:
  hashes=re.findall(r'\b'+chunk+r':"([a-f0-9]{8})"',updated); assert len(hashes)==1
  name=chunk+'.'+hashes[0]+'.js';data=(BASE/label/name).read_bytes();s=data.decode('utf-8')
  a,b=(report_old,report_new) if chunk=='200' else (old,new)
  assert s.count(a)==1,(label,name,'unexpected label baseline')
  revised=s.replace(a,b).encode('utf-8'); h=sha(revised)[:8];target=chunk+'.'+h+'.js'
  (dest/target).write_bytes(revised)
  updated=updated.replace(chunk+':"'+hashes[0]+'"',chunk+':"'+h+'"')
  files.append({'scope':label,'oldName':name,'name':target,'oldSha':sha(data),'sha':sha(revised),'kind':'chunk'})
 revised=updated.encode('utf-8');name='app.'+sha(revised)[:8]+'.js';(dest/name).write_bytes(revised)
 files.append({'scope':label,'oldName':main,'name':name,'oldSha':sha(raw),'sha':sha(revised),'kind':'entry'})
 html=(BASE/(label+'-index.html')).read_bytes();assert html.count(main.encode())==1
 revised=html.replace(main.encode(),name.encode());(dest/'index.html').write_bytes(revised)
 files.append({'scope':label,'oldName':'index.html','name':'index.html','oldSha':sha(html),'sha':sha(revised),'kind':'html'})
(OUT/'manifest.json').write_text(json.dumps({'files':files,'published':False,'realAiEvidence':False},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'prepared':True,'files':len(files),'published':False}))
