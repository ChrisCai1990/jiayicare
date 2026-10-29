"""Open/close a short review-only deletion acceptance window; never executes requests."""
import pathlib,sys
from ssh_config import connect
REMOTE=r'''
import pathlib,subprocess,json,os,time,urllib.request
base=pathlib.Path('/var/www/jiayicare-review/backend');filename=pathlib.Path('/var/www/jiayicare-secrets/review-backend.env')
def run(args,**kw):return subprocess.check_output(args,stderr=subprocess.PIPE,text=True,**kw).strip()
env=json.loads(run(['node','-e',"console.log(JSON.stringify(require('dotenv').parse(require('fs').readFileSync(process.argv[1]))))",str(filename)],cwd=base))
assert env.get('REVIEW_ENVIRONMENT')=='isolated'
assert env.get('ACCOUNT_DELETION_GUARD_ENABLED')=='true'
assert not pathlib.Path(env['ACCOUNT_DELETION_MAINTENANCE_FILE']).exists()
old=filename.read_bytes()
updates={'ACCOUNT_DELETION_ENABLED':'true' if ACTION=='open' else 'false'}
if ACTION=='open':
 updates.update(ACCOUNT_DELETION_COMPLETION_DAYS='7',ACCOUNT_DELETION_NOTICE='注销申请提交后由后台处理，预计7日内完成；申请受理不表示已删除。完成后将删除当前账号及系统中的活动个人资料，包括本人健康管理记录和检查报告副本，并使原登录凭证失效。必要的会计交易原件受限留存，仅用于会计、税务或法定审计。备份、日志及外部服务副本的后续处理单独跟踪，不代表提交时已立即清零。请保存注销回执以查询实际处理结果；如有未完成订单、退款或涉及他人的共享资料，将先核实处理，避免损害现有权益。')
backup=pathlib.Path('/var/backups/jiayicare-review-deletion-window-'+str(int(time.time())));backup.mkdir(mode=0o700)
(backup/'review.env').write_bytes(old);(backup/'review.env').chmod(0o600)
lines=[line for line in old.decode().splitlines() if line.split('=',1)[0] not in updates]
lines += [k+'='+v for k,v in updates.items()]
def write(data):
 tmp=filename.with_suffix('.env.validation-new');tmp.write_bytes(data);tmp.chmod(0o600);os.replace(tmp,filename)
def healthy():
 for _ in range(25):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3108/api/health',timeout=2) as r:
    if r.status==200:return True
  except Exception:pass
  time.sleep(1)
 return False
try:
 write(('\n'.join(lines)+'\n').encode())
 runtime={**os.environ,**env,**updates}
 if ACTION=='open':
  check="const fs=require('fs'),p=require('path'),m=require('mongoose');for(const f of fs.readdirSync('src/models').filter(f=>f.endsWith('.js')))require(p.resolve('src/models',f));require('./src/utils/accountDeletionPersonalData').buildOperations(m.models,{userId:new m.Types.ObjectId(),tenantId:new m.Types.ObjectId()});"
  run(['node','-e',check],cwd=base,env=runtime)
  readiness=json.loads(run(['node','scripts/account-deletion-worker.js','poll'],cwd=base,env=runtime))
  assert readiness['ready'] is True
 else:readiness=None
 run(['systemctl','restart','jiayicare-review-api']);assert healthy()
 print(json.dumps({'environment':'review','action':ACTION,'health':True,'readiness':readiness,'newIntakeCheckExpiresAfterMinutes':15 if ACTION=='open' else 0,'backup':str(backup),'productionChanged':False,'requestsExecuted':False}))
except Exception:
 write(old);run(['systemctl','restart','jiayicare-review-api']);healthy();raise
'''
action=sys.argv[1];assert action in ['open','close']
with connect() as c:
 i,o,e=c.exec_command('python3 -',timeout=180);i.write('ACTION='+repr(action)+'\n'+REMOTE);i.channel.shutdown_write()
 output=o.read().decode();error=e.read().decode()
 if o.channel.recv_exit_status():raise RuntimeError(error[-1000:])
 print(output)
 pathlib.Path('release/apple-deletion-enable-20261029/review-window-'+action+'.json').write_text(output,encoding='utf-8')
