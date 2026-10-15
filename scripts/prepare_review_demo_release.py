"""Read-only server baseline capture; prepare a guarded, review-only release."""
import hashlib,json,pathlib
from ssh_config import connect
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/review-demo-release-20261015'
OUT.mkdir(exist_ok=True)
def sha(b):return hashlib.sha256(b).hexdigest()
def once(s,old,new):
    assert s.count(old)==1,'Unexpected baseline anchor'
    return s.replace(old,new,1)
with connect() as c, c.open_sftp() as s:
    files=[]
    for rel in ['src/routes/reviewAccount.js','src/middleware/reviewBoundary.js','src/models/LoginSession.js']:
        with s.open('/var/www/jiayicare-review/backend/'+rel) as f: raw=f.read()
        text=raw.decode()
        if rel.endswith('reviewAccount.js'):
            text=once(text,"module.exports = router;","router.use('/demo', require('./reviewDemo'));\nmodule.exports = router;")
        elif rel.endswith('reviewBoundary.js'):
            text=once(text,"  const normalLogin = path.startsWith('/api/auth/')", "  const normalLogin = path.startsWith('/api/auth/')\n    && !(req.method === 'POST' && path === '/api/auth/review-account/demo')")
        else:
            text=once(text,"'review_password']", "'review_password', 'review_demo']")
        p=OUT/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8',newline='\n')
        files.append({'path':rel,'old':sha(raw),'new':sha(p.read_bytes())})
    for rel in ['src/utils/reviewDemo.js','src/routes/reviewDemo.js']:
        try:s.stat('/var/www/jiayicare-review/backend/'+rel)
        except FileNotFoundError:pass
        else:raise RuntimeError('Demo already exists; inspect first')
        p=OUT/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/'backend'/rel).read_bytes())
        files.append({'path':rel,'old':None,'new':sha(p.read_bytes())})
    indexes=[]
    for suffix in ['', '/review']:
        path='/var/www/jiayicare-static/mobile-preview-joinwehealth'+suffix+'/index.html'
        with s.open(path) as f:raw=f.read()
        text=once(raw.decode(),'</head>','<script defer src="/mobile-preview/demo/entry.js"></script></head>')
        name='review-index.html' if suffix else 'normal-index.html'
        (OUT/name).write_text(text,encoding='utf-8',newline='\n')
        indexes.append({'path':path,'local':name,'old':sha(raw),'new':sha((OUT/name).read_bytes())})
    for p in (ROOT/'miniprogram/review-demo').iterdir():
        if p.is_file(): (OUT/p.name).write_bytes(p.read_bytes())
    manifest={'backend':files,'indexes':indexes,'assets':{p.name:sha(p.read_bytes()) for p in (ROOT/'miniprogram/review-demo').iterdir() if p.is_file()}}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps({'prepared':True,'backendFiles':len(files),'htmlEntries':len(indexes),'businessBundlesChanged':False}))
