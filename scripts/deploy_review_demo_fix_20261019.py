"""Replace only the isolated demo factory; preserve all enabled-service limits."""
import hashlib,json,time
from pathlib import Path
from ssh_config import connect
ROOT=Path(__file__).resolve().parents[1];AUDIT=ROOT/'release/apple-review-20261018'
source=ROOT/'deployment/review-apple-20261018/src/utils/reviewDemo.js'
old=hashlib.sha256((AUDIT/'live-review/utils/reviewDemo.js').read_bytes()).hexdigest()
new=hashlib.sha256(source.read_bytes()).hexdigest()
REMOTE=r'''
import pathlib,subprocess,hashlib,shutil,os,json,time,urllib.request,urllib.error
stage=pathlib.Path(STAGE);target=pathlib.Path('/var/www/jiayicare-review/backend/src/utils/reviewDemo.js')
def run(args,**kw):return subprocess.check_output(args,stderr=subprocess.PIPE,text=True,**kw).strip()
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def env():
 pid=run(['systemctl','show','jiayicare-review-api','--property=MainPID','--value'])
 return dict(x.split('=',1) for x in pathlib.Path('/proc/'+pid+'/environ').read_text().split('\0') if '=' in x)
before=env();assert before['REVIEW_ENVIRONMENT']=='isolated'
assert before['REVIEW_AI_ENABLED']=='true' and before['REVIEW_ASR_ENABLED']=='false'
assert before['REVIEW_TOTAL_BUDGET_FEN']=='1000' and before['REVIEW_DAILY_CALL_LIMIT']=='25'
envpath=pathlib.Path('/var/www/jiayicare-secrets/review-backend.env');envhash=digest(envpath)
production=run(['git','-C','/var/www/jiayicare','rev-parse','HEAD'])
assert digest(target)==OLD and digest(stage/'candidate.js')==NEW
run(['node','--check',str(stage/'candidate.js')]);shutil.copy2(target,stage/'original.js')
def healthy():
 for i in range(25):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3108/api/health',timeout=2) as r:
    if r.status==200:return
  except Exception:time.sleep(1)
 raise RuntimeError('Unhealthy review service')
try:
 tmp=target.with_suffix('.demo-new');shutil.copy2(stage/'candidate.js',tmp);tmp.chmod(0o644);os.replace(tmp,target)
 run(['systemctl','restart','jiayicare-review-api']);healthy()
 after=env();assert digest(envpath)==envhash
 for key,value in before.items():
  if key.startswith('REVIEW_') or key in ['MONGODB_URI','JWT_SECRET','STARTUP_BACKGROUND_JOBS_ENABLED','NATIVE_PUSH_ENABLED','UPLOADS_DIR']:assert after.get(key)==value
 assert run(['git','-C','/var/www/jiayicare','rev-parse','HEAD'])==production
 assert digest(target)==NEW
 try:urllib.request.urlopen('http://127.0.0.1:3108/api/ai-data-consent',timeout=3);raise RuntimeError('Unauthenticated access')
 except urllib.error.HTTPError as e:assert e.code==401
 print(json.dumps({'deployed':True,'scope':'isolated-demo-factory-only','sha256':NEW,'backup':STAGE,'environmentUnchanged':True,'productionUnchanged':production,'health':True}))
except Exception:
 shutil.copy2(stage/'original.js',target);run(['systemctl','restart','jiayicare-review-api']);healthy();raise
'''
with connect() as c:
 stage='/var/backups/jiayicare-review-demo-'+str(int(time.time()))
 with c.open_sftp() as s:s.mkdir(stage,mode=0o700);s.put(str(source),stage+'/candidate.js')
 stdin,stdout,stderr=c.exec_command('python3 -',timeout=90)
 stdin.write(REMOTE.replace('STAGE',repr(stage)).replace('OLD',repr(old)).replace('NEW',repr(new)));stdin.channel.shutdown_write()
 out=stdout.read().decode();err=stderr.read().decode()
 if stdout.channel.recv_exit_status():raise RuntimeError(err[-1500:] or 'Demo patch failed')
 result=json.loads(out);(AUDIT/'review-demo-fix-deployed.json').write_text(json.dumps(result,indent=2),encoding='utf8')
 print(json.dumps(result))
