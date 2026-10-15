"""Guarded follow-up for tenant host index and early consent-click race."""
import pathlib,hashlib,json,time
from ssh_config import connect
ROOT=pathlib.Path(__file__).resolve().parents[1]
OLD=ROOT/'artifacts/review-demo-release-20261015'
files=[('backend/src/utils/reviewDemo.js','src/utils/reviewDemo.js','/var/www/jiayicare-review/backend/src/utils/reviewDemo.js'),
       ('miniprogram/review-demo/gateway.js','gateway.js','/var/www/jiayicare-static/mobile-preview-joinwehealth/demo/gateway.js'),
       ('miniprogram/review-demo/index.html','index.html','/var/www/jiayicare-static/mobile-preview-joinwehealth/demo/index.html')]
with connect() as c,c.open_sftp() as s:
 stage='/var/backups/jiayicare-demo-fix-'+str(int(time.time()));s.mkdir(stage,mode=0o700)
 manifest=[]
 for i,(local,old,dest) in enumerate(files):
  raw=(ROOT/local).read_bytes();baseline=(OLD/old).read_bytes()
  with s.open(dest) as f:assert hashlib.sha256(f.read()).digest()==hashlib.sha256(baseline).digest(),'Live changed'
  s.put(str(ROOT/local),stage+'/'+str(i)+'.new')
  manifest.append({'path':dest,'old':hashlib.sha256(baseline).hexdigest(),'new':hashlib.sha256(raw).hexdigest()})
 script=r'''
import pathlib,hashlib,shutil,os,json,subprocess,time,urllib.request
s=pathlib.Path(STAGE);files=FILES;changed=[]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def restart():
 subprocess.run(['systemctl','restart','jiayicare-review-api'],check=True,capture_output=True)
 for _ in range(25):
  try:
   if urllib.request.urlopen('http://127.0.0.1:3108/api/health',timeout=2).status==200:return
  except Exception:pass
  time.sleep(1)
 raise RuntimeError('Health failed')
for i,item in enumerate(files):
 assert digest(pathlib.Path(item['path']))==item['old'] and digest(s/(str(i)+'.new'))==item['new']
 if item['path'].endswith('.js'):
  q=s/(str(i)+'.js');shutil.copy2(s/(str(i)+'.new'),q);subprocess.run(['node','--check',str(q)],check=True,capture_output=True)
try:
 for i,item in enumerate(files):
  p=pathlib.Path(item['path']);assert digest(p)==item['old'];shutil.copy2(p,s/(str(i)+'.old'))
  tmp=p.with_suffix('.demo-fix');shutil.copy2(s/(str(i)+'.new'),tmp);tmp.chmod(0o644);os.replace(tmp,p);changed.append((i,p))
 restart();print(json.dumps({'fixed':True,'backup':str(s)}))
except:
 for i,p in reversed(changed):shutil.copy2(s/(str(i)+'.old'),p)
 restart();raise
'''.replace('STAGE',repr(stage)).replace('FILES',repr(manifest))
 i,o,e=c.exec_command('python3 -',timeout=90);i.write(script);i.channel.shutdown_write();out=o.read().decode();err=e.read().decode()
 if o.channel.recv_exit_status():raise RuntimeError(err)
 (ROOT/'artifacts/review-demo-fix-20261015.json').write_text(out,encoding='utf-8');print(out)
