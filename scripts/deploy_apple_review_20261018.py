"""Deploy tracked review-only sources with exact baseline hashes and rollback.
Never publishes production sources, changes domains, or submits store review.
"""
import hashlib, json, pathlib, time, sys
from ssh_config import connect
ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'deployment/review-apple-20261018/src'
AUDIT = ROOT / 'release/apple-review-20261018'

REMOTE = r'''
import pathlib,json,hashlib,subprocess,os,shutil,time,urllib.request,urllib.error
stage=pathlib.Path(STAGE);base=pathlib.Path('/var/www/jiayicare-review/backend');items=json.loads((stage/'files.json').read_text());changed=[]
envpath=pathlib.Path('/var/www/jiayicare-secrets/review-backend.env')
def run(a,**kw):return subprocess.run(a,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kw).stdout.decode().strip()
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
def environ():
 pid=run(['systemctl','show','jiayicare-review-api','--property=MainPID','--value']);assert int(pid)>0
 return dict(x.split('=',1) for x in pathlib.Path('/proc/'+pid+'/environ').read_text().split('\0') if '=' in x)
def closed():
 e=environ();assert e.get('REVIEW_ENVIRONMENT')=='isolated'
 for k in ['REVIEW_EXTERNAL_SERVICES_ENABLED','REVIEW_AI_ENABLED','REVIEW_ASR_ENABLED']:assert e.get(k)!='true'
 return e
def health():
 for i in range(25):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3108/api/health',timeout=2) as r:
    if r.status==200:return
  except Exception:pass
  time.sleep(1)
 raise RuntimeError('Review health check failed')
closed();production=run(['git','-C','/var/www/jiayicare','rev-parse','HEAD'])
original_env=envpath.read_bytes();shutil.copy2(envpath,stage/'environment.original');(stage/'environment.original').chmod(0o600)
for i,item in enumerate(items):
 rel=pathlib.PurePosixPath(item['name']);assert not rel.is_absolute() and '..' not in rel.parts and str(rel).endswith('.js')
 p=base/'src'/item['name'];assert digest(p)==item['old'], 'Source changed: '+item['name']
 q=stage/(str(i)+'.js');q.write_text(item['content']);run(['node','--check',str(q)])
 if p.exists():shutil.copy2(p,stage/(str(i)+'.original'))
try:
 for i,item in enumerate(items):
  p=base/'src'/item['name'];assert digest(p)==item['old'];p.parent.mkdir(parents=True,exist_ok=True)
  tmp=p.with_suffix('.apple-new');shutil.copy2(stage/(str(i)+'.js'),tmp);tmp.chmod(0o644);os.replace(tmp,p);changed.append((i,p))
 assert envpath.read_bytes()==original_env,'Environment changed concurrently'
 updates={'REVIEW_TOTAL_BUDGET_FEN':'1000','REVIEW_DAILY_CALL_LIMIT':'25','REVIEW_SERVICES_EXPIRES_AT':'2026-10-26T00:00:00+08:00','REVIEW_EXTERNAL_SERVICES_ENABLED':'false','REVIEW_AI_ENABLED':'false','REVIEW_ASR_ENABLED':'false'}
 lines=[line for line in original_env.decode().splitlines() if line.split('=',1)[0] not in updates]
 lines += [k+'='+v for k,v in updates.items()]
 tmp=envpath.with_suffix('.apple-new');tmp.write_text('\n'.join(lines)+'\n');tmp.chmod(0o600);os.replace(tmp,envpath)
 run(['systemctl','restart','jiayicare-review-api']);health();e=closed()
 run(['node','-e',"require('./src/utils/reviewEnvironment').assertReviewEnvironment();const s=require('./src/utils/reviewRuntime').services();if(s.ai.enabled()||s.asr.asrEnabled())throw Error('switch');require('./src/routes/aiDataConsent');require('./src/utils/messageTranscription');require('./src/utils/aiMessageFallback');"],cwd=str(base),env=e)
 try:urllib.request.urlopen('http://127.0.0.1:3108/api/ai-data-consent',timeout=3);raise RuntimeError('Consent must require authentication')
 except urllib.error.HTTPError as err:assert err.code==401
 for item in items:assert digest(base/'src'/item['name'])==hashlib.sha256(item['content'].encode()).hexdigest()
 assert run(['git','-C','/var/www/jiayicare','rev-parse','HEAD'])==production
 print(json.dumps({'deployed':True,'scope':'isolated-review-backend','backup':str(stage),'health':True,'consentUnauthenticatedStatus':401,'totalBudgetFen':1000,'dailyLimit':25,'externalServicesEnabled':False,'asrEnabled':False,'productionCommitUnchanged':production,'files':{x['name']:digest(base/'src'/x['name']) for x in items}}))
except Exception:
 for i,p in reversed(changed):
  orig=stage/(str(i)+'.original')
  if orig.exists():shutil.copy2(orig,p)
  else:p.unlink(missing_ok=True)
 shutil.copy2(stage/'environment.original',envpath);envpath.chmod(0o600)
 run(['systemctl','restart','jiayicare-review-api']);health();raise
'''

def main():
    baseline=json.loads((AUDIT/'live-review/manifest.json').read_text())
    if '--upgrade' in sys.argv:
        baseline=json.loads((AUDIT/'review-backend-deployed.json').read_text())['files']
    items=[{'name':p.relative_to(SOURCE).as_posix(),'content':p.read_text(encoding='utf-8'),'old':baseline.get(p.relative_to(SOURCE).as_posix())} for p in sorted(SOURCE.rglob('*.js'))]
    with connect() as client:
        with client.open_sftp() as s:
            stage='/var/backups/jiayicare-apple-review-'+str(int(time.time()));s.mkdir(stage,mode=0o700)
            with s.open(stage+'/files.json','w') as f:f.write(json.dumps(items))
        stdin,stdout,stderr=client.exec_command('python3 -',timeout=150)
        stdin.write(REMOTE.replace('STAGE',repr(stage)));stdin.channel.shutdown_write()
        out=stdout.read().decode();err=stderr.read().decode()
        if stdout.channel.recv_exit_status():raise RuntimeError(err[-3500:] or 'Deployment failed')
        result=json.loads(out);(AUDIT/'review-backend-deployed.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps(result))
if __name__=='__main__':main()
