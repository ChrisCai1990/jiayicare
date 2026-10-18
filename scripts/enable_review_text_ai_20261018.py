"""Enable only bounded isolated review text AI after real HTTP verification."""
import json,time
from pathlib import Path
from ssh_config import connect
ROOT=Path(__file__).resolve().parents[1]
AUDIT=ROOT/'release/apple-review-20261018'
proof=json.loads((AUDIT/'review-http-after-recharge.json').read_text(encoding='utf-8'))
assert proof['passed'] and proof['revocationStopsNextMessage'] and proof['budgetAfterFen']<=1000
REMOTE=r'''
import pathlib,subprocess,json,shutil,os,time,urllib.request
stage=pathlib.Path(STAGE);stage.mkdir(mode=0o700)
envfile=pathlib.Path('/var/www/jiayicare-secrets/review-backend.env')
def run(args,**kw):return subprocess.check_output(args,text=True,stderr=subprocess.PIPE,**kw).strip()
def environment():
 pid=run(['systemctl','show','jiayicare-review-api','--property=MainPID','--value'])
 return dict(x.split('=',1) for x in pathlib.Path('/proc/'+pid+'/environ').read_text().split('\0') if '=' in x)
e=environment();assert e['REVIEW_ENVIRONMENT']=='isolated'
for k in ['REVIEW_EXTERNAL_SERVICES_ENABLED','REVIEW_AI_ENABLED','REVIEW_ASR_ENABLED']:assert e[k]=='false'
assert e['REVIEW_TOTAL_BUDGET_FEN']=='1000' and e['REVIEW_DAILY_CALL_LIMIT']=='25'
assert e['REVIEW_SERVICES_EXPIRES_AT']=='2026-10-26T00:00:00+08:00'
production=run(['git','-C','/var/www/jiayicare','rev-parse','HEAD'])
original=envfile.read_bytes();shutil.copy2(envfile,stage/'environment.original');(stage/'environment.original').chmod(0o600)
old='当前 AI 回复、语音转文字和真人服务不可用。'
new='文本 AI 需在进入后单独授权，是否可用以页面状态为准；语音转文字和真人服务不可用。'
pages=[pathlib.Path('/var/www/jiayicare-static/mobile-preview-joinwehealth/demo/index.html')]
for i,p in enumerate(pages):
 assert p.read_text().count(old)==1
 shutil.copy2(p,stage/('demo-'+str(i)+'.html'))
try:
 lines=original.decode().splitlines()
 for k in ['REVIEW_EXTERNAL_SERVICES_ENABLED','REVIEW_AI_ENABLED']:
  assert sum(x.startswith(k+'=') for x in lines)==1
  lines=[k+'=true' if x.startswith(k+'=') else x for x in lines]
 assert envfile.read_bytes()==original
 temp=envfile.with_suffix('.enable-new');temp.write_text('\n'.join(lines)+'\n');temp.chmod(0o600);os.replace(temp,envfile)
 run(['systemctl','restart','jiayicare-review-api'])
 for n in range(25):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3108/api/health',timeout=2) as r:
    if r.status==200:break
  except Exception:time.sleep(1)
 else:raise RuntimeError('Review service unhealthy')
 e=environment()
 node="require('./src/utils/reviewEnvironment').assertReviewEnvironment();const s=require('./src/utils/reviewRuntime').services();if(!s.ai.enabled()||s.asr.asrEnabled())throw Error('Unexpected capability');console.log(JSON.stringify({textAI:true,asr:false}));"
 caps=json.loads(run(['node','-e',node],cwd='/var/www/jiayicare-review/backend',env=e))
 for p in pages:
  t=p.with_suffix('.enable-new');t.write_text(p.read_text().replace(old,new));t.chmod(0o644);os.replace(t,p)
 assert run(['git','-C','/var/www/jiayicare','rev-parse','HEAD'])==production
 print(json.dumps({'enabled':True,'scope':'isolated-review-text-only','capabilities':caps,'totalBudgetFen':1000,'dailyLimit':25,'expiresAt':e['REVIEW_SERVICES_EXPIRES_AT'],'backup':str(stage),'productionCommitUnchanged':production}))
except Exception:
 envfile.write_bytes(original);envfile.chmod(0o600)
 for i,p in enumerate(pages):shutil.copy2(stage/('demo-'+str(i)+'.html'),p)
 run(['systemctl','restart','jiayicare-review-api'])
 raise
'''
with connect() as c:
    stdin,stdout,stderr=c.exec_command('python3 -',timeout=100)
    stdin.write(REMOTE.replace('STAGE',repr('/var/backups/jiayicare-review-ai-enabled-'+str(int(time.time())))));stdin.channel.shutdown_write()
    out=stdout.read().decode();err=stderr.read().decode()
    if stdout.channel.recv_exit_status():raise RuntimeError(err[-1500:] or 'Activation failed')
    result=json.loads(out);(AUDIT/'review-text-ai-enabled.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
