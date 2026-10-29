"""Deploy deletion modules to the existing isolated review API, without enabling it."""
import hashlib, json, pathlib, sys
from ssh_config import connect
ROOT = pathlib.Path(__file__).resolve().parents[1]
REV = 'dd5ca900b84ce31b42822ed7b97038b36f05d607'

REMOTE = r'''
import pathlib,json,hashlib,os,shutil,subprocess,time,datetime,urllib.request,urllib.error
base=pathlib.Path('/var/www/jiayicare-review/backend');prod=pathlib.Path('/var/www/jiayicare/backend')
stage=pathlib.Path('/var/backups/jiayicare-deletion-review-20261029');changes=[]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
def run(args):return subprocess.check_output(args,stderr=subprocess.PIPE,text=True).strip()
assert run(['git','-C',str(prod.parent),'rev-parse','HEAD'])==REV
pid=int(run(['systemctl','show','jiayicare-review-api','--property=MainPID','--value']))
env=dict(x.split('=',1) for x in pathlib.Path('/proc/'+str(pid)+'/environ').read_text().split('\0') if '=' in x)
assert env.get('REVIEW_ENVIRONMENT')=='isolated'
assert env.get('ACCOUNT_DELETION_ENABLED')!='true'
# Do not renew the expired trial. Close its old flags; expiry, budget and keys stay unchanged.
assert datetime.datetime.fromisoformat(env['REVIEW_SERVICES_EXPIRES_AT']).timestamp()<time.time()
subprocess.run(['node','-e',"require('./src/utils/reviewEnvironment').assertReviewEnvironment()"],cwd=str(base),env=env,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
for rel,expected in BASELINE.items():assert digest(base/'src'/rel)==expected,'Review source changed: '+rel
files={}
for folder,pattern in [('src/utils','accountDeletion*.js'),('src/models','AccountDeletion*.js'),('src/routes','accountDeletion.js'),('scripts','account-deletion-worker.js'),('scripts','account-deletion-maintenance.js')]:
 for p in (prod/folder).glob(pattern):files[p.relative_to(prod).as_posix()]=p.read_bytes()
files['src/config/db.js']=(prod/'src/config/db.js').read_bytes()
files['src/index.js']=INDEX.encode()
stage.mkdir(mode=0o700)
envpath=pathlib.Path('/var/www/jiayicare-secrets/review-backend.env');originalenv=envpath.read_bytes()
(stage/'environment.original').write_bytes(originalenv);(stage/'environment.original').chmod(0o600)
for rel,data in files.items():
 target=base/rel
 if target.exists():
  backup=stage/'previous'/rel;backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,backup)
 staged=stage/'new'/rel;staged.parent.mkdir(parents=True,exist_ok=True);staged.write_bytes(data)
 run(['node','--check',str(staged)])
def health():
 for _ in range(25):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3108/api/health',timeout=2) as r:
    if r.status==200:return
  except Exception:pass
  time.sleep(1)
 raise RuntimeError('Review API health failed')
try:
 for rel,data in files.items():
  target=base/rel;target.parent.mkdir(parents=True,exist_ok=True)
  tmp=target.with_suffix('.deletion-new');tmp.write_bytes(data);tmp.chmod(0o644);os.replace(tmp,target);changes.append(rel)
 assert envpath.read_bytes()==originalenv
 updates={k:'false' for k in ['REVIEW_EXTERNAL_SERVICES_ENABLED','REVIEW_AI_ENABLED','REVIEW_ASR_ENABLED']}
 lines=[line for line in originalenv.decode().splitlines() if line.split('=',1)[0] not in updates]
 lines += [k+'='+v for k,v in updates.items()]
 tmp=envpath.with_suffix('.deletion-new');tmp.write_text('\n'.join(lines)+'\n');tmp.chmod(0o600);os.replace(tmp,envpath)
 run(['systemctl','restart','jiayicare-review-api']);health()
 try:urllib.request.urlopen('http://127.0.0.1:3108/api/account-deletion',timeout=5);raise RuntimeError('Expected authentication')
 except urllib.error.HTTPError as e:assert e.code==401
 for rel,data in files.items():assert digest(base/rel)==hashlib.sha256(data).hexdigest()
 assert digest(base/'src/middleware/reviewBoundary.js')==BASELINE['middleware/reviewBoundary.js']
 print(json.dumps({'deployed':True,'files':len(files),'health':True,'unauthenticatedStatus':401,'enabled':False,'backup':str(stage),'productionCommit':REV}))
except Exception:
 for rel in reversed(changes):
  backup=stage/'previous'/rel;target=base/rel
  if backup.exists():shutil.copy2(backup,target)
  else:target.unlink()
 envpath.write_bytes(originalenv);envpath.chmod(0o600)
 run(['systemctl','restart','jiayicare-review-api']);health();raise
'''

def main():
    folder=ROOT/'release/apple-deletion-review-20261029'
    baseline=json.loads((folder/'baseline.json').read_text())
    code='REV='+repr(REV)+'\nBASELINE='+repr(baseline)+'\nINDEX='+repr((folder/'index.js').read_text(encoding='utf-8'))+'\n'+REMOTE
    with connect() as c:
        i,o,e=c.exec_command('python3 -',timeout=120);i.write(code);i.channel.shutdown_write()
        out=o.read().decode();err=e.read().decode();status=o.channel.recv_exit_status()
        if status:raise RuntimeError(err[-3000:])
        (folder/'deployed.json').write_text(out,encoding='utf-8');print(out)
if __name__=='__main__':main()
