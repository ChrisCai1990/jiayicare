"""Publish a fingerprinted additive demo entry; leave production API and JS bundles alone."""
import json,pathlib,time
from ssh_config import connect
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/review-demo-release-20261015'
REMOTE=r'''
import pathlib,json,hashlib,subprocess,os,shutil,time,urllib.request,urllib.error
stage=pathlib.Path(STAGE);m=json.loads((stage/'manifest.json').read_text())
base=pathlib.Path('/var/www/jiayicare-review/backend')
demo=pathlib.Path('/var/www/jiayicare-static/mobile-preview-joinwehealth/demo')
envpath=pathlib.Path('/var/www/jiayicare-secrets/review-backend.env')
changed=[]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
def run(args):return subprocess.run(args,check=True,capture_output=True).stdout.decode().strip()
def health():
 for _ in range(25):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3108/api/health',timeout=2) as r:
    if r.status==200:return
  except Exception:pass
  time.sleep(1)
 raise RuntimeError('Review health failed')
pid=run(['systemctl','show','jiayicare-review-api','--property=MainPID','--value'])
env=dict(x.split('=',1) for x in pathlib.Path('/proc/'+pid+'/environ').read_text().split('\0') if '=' in x)
assert env.get('REVIEW_ENVIRONMENT')=='isolated'
assert env.get('REVIEW_DEMO_ENABLED')!='true'
assert not demo.exists(),'Demo directory already exists'
for item in m['backend']:
 p=base/item['path'];q=stage/item['path']
 assert digest(p)==item['old'] and digest(q)==item['new']
 run(['node','--check',str(q)])
for item in m['indexes']:
 assert digest(pathlib.Path(item['path']))==item['old']
 assert digest(stage/item['local'])==item['new']
for name,want in m['assets'].items():
 assert digest(stage/name)==want
 if name.endswith('.js'):run(['node','--check',str(stage/name)])
backups=stage/'backups';backups.mkdir(mode=0o700)
shutil.copy2(envpath,backups/'review.env');(backups/'review.env').chmod(0o600)
try:
 for i,item in enumerate(m['backend']):
  p=base/item['path'];backup=backups/str(i)
  if p.exists():shutil.copy2(p,backup)
  temp=p.with_suffix('.demo-new');shutil.copy2(stage/item['path'],temp);temp.chmod(0o644);os.replace(temp,p)
  changed.append((p,backup))
 # This opt-in belongs only to the already isolated service; never production.
 text=envpath.read_text();assert 'REVIEW_DEMO_ENABLED=' not in text
 envpath.write_text(text.rstrip()+'\nREVIEW_DEMO_ENABLED=true\n');envpath.chmod(0o600)
 run(['systemctl','restart','jiayicare-review-api']);health()
 req=urllib.request.Request('http://127.0.0.1:3108/api/auth/review-account/demo',data=b'{}',headers={'Content-Type':'application/json'})
 try:urllib.request.urlopen(req,timeout=5);raise RuntimeError('Consent validation missing')
 except urllib.error.HTTPError as e:assert e.code==400
 demo.mkdir(mode=0o755)
 for name in m['assets']:shutil.copy2(stage/name,demo/name);(demo/name).chmod(0o644)
 for i,item in enumerate(m['indexes']):
  p=pathlib.Path(item['path']);assert digest(p)==item['old']
  backup=backups/('index-'+str(i));shutil.copy2(p,backup)
  temp=p.with_suffix('.demo-new');shutil.copy2(stage/item['local'],temp);temp.chmod(0o644);os.replace(temp,p);changed.append((p,backup))
 for item in m['indexes']:assert digest(pathlib.Path(item['path']))==item['new']
 print(json.dumps({'published':True,'backup':str(backups),'reviewBackendOnly':True,'businessBundlesChanged':False,'productionAPIChanged':False}))
except:
 for p,backup in reversed(changed):
  if backup.exists():shutil.copy2(backup,p)
  else:p.unlink(missing_ok=True)
 shutil.copy2(backups/'review.env',envpath)
 if demo.exists():
  assert demo.resolve()==pathlib.Path('/var/www/jiayicare-static/mobile-preview-joinwehealth/demo')
  shutil.rmtree(demo)
 run(['systemctl','restart','jiayicare-review-api']);health();raise
'''
with connect() as c, c.open_sftp() as s:
    stage='/var/backups/jiayicare-demo-'+str(int(time.time()));s.mkdir(stage,mode=0o700)
    for p in sorted(OUT.rglob('*'),key=lambda p:(len(p.parts),str(p))):
        target=stage+'/'+p.relative_to(OUT).as_posix()
        if p.is_dir():s.mkdir(target,mode=0o700)
        else:s.put(str(p),target)
    i,o,e=c.exec_command('python3 -',timeout=120)
    i.write(REMOTE.replace('STAGE',repr(stage)));i.channel.shutdown_write()
    out=o.read().decode();err=e.read().decode()
    if o.channel.recv_exit_status():raise RuntimeError(err or 'Deployment failed')
    (ROOT/'artifacts/review-demo-deploy-20261015.json').write_text(out,encoding='utf-8');print(out)
