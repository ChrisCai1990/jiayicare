"""Install private deletion configuration; intake stays disabled until activation."""
import json,pathlib,sys
from ssh_config import connect
ROOT=pathlib.Path(__file__).resolve().parents[1]
REMOTE=r'''
import pathlib,subprocess,json,os,secrets,base64,time,urllib.request,pwd
prod=pathlib.Path('/var/www/jiayicare/backend');review=pathlib.Path('/var/www/jiayicare-review/backend')
def run(args,**kw):return subprocess.check_output(args,stderr=subprocess.PIPE,text=True,**kw).strip()
assert run(['git','-C',str(prod.parent),'rev-parse','HEAD'])==REV
rows=json.loads(run(['pm2','jlist']))
def fileenv(base,filename):
 return json.loads(run(['node','-e',"console.log(JSON.stringify(require('dotenv').parse(require('fs').readFileSync(process.argv[1]))))",str(filename)],cwd=str(base)))
def dbname(base,env):
 childenv={k:v for k,v in env.items() if k not in ['NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE']}
 return run(['node','-e',"const c=new(require('mongoose').mongo.MongoClient)(process.env.MONGODB_URI);console.log(c.db().databaseName)"],cwd=str(base),env=childenv)
def processenv(pid):return dict(x.split('=',1) for x in pathlib.Path('/proc/'+str(pid)+'/environ').read_text().split('\0') if '=' in x)
def health(port):
 for _ in range(25):
  try:
   with urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/api/health',timeout=2) as r:
    if r.status==200:return
  except Exception:pass
  time.sleep(1)
 raise RuntimeError('API health failed')
def writeprivate(p,data):
 tmp=p.with_suffix(p.suffix+'.deletion-new');tmp.write_bytes(data);tmp.chmod(0o600);os.replace(tmp,p)
specs=[('production',prod,prod/'.env',3000),('review',review,pathlib.Path('/var/www/jiayicare-secrets/review-backend.env'),3108)]
backup=pathlib.Path('/var/backups/jiayicare-deletion-config-'+str(int(time.time())));backup.mkdir(mode=0o700)
changes=[];results=[]
try:
 for name,base,filename,port in specs:
  old=filename.read_bytes();env=fileenv(base,filename)
  if name=='production':
   row=next(r for r in rows if r['name']=='jiayicare-backend');env.update(processenv(row['pid']))
   writers=[{'manager':'pm2','name':'jiayicare-backend','script':str(prod/'src/index.js')},{'manager':'pm2','name':'jiayicare-wecom-archive','script':str(prod/'scripts/wecom-archive-worker.js')}]
  else:
   pid=int(run(['systemctl','show','jiayicare-review-api','--property=MainPID','--value']));env.update(processenv(pid))
   assert env.get('REVIEW_ENVIRONMENT')=='isolated'
   writers=[{'manager':'systemd','name':'jiayicare-review-api','script':str(review/'src/index.js')}]
  assert env.get('ACCOUNT_DELETION_ENABLED')!='true'
  assert not any(k.startswith('ACCOUNT_DELETION_') for k in env),'Existing deletion configuration must be reviewed, never replaced'
  root=pathlib.Path('/var/lib/jiayicare-account-deletion')/name;root.mkdir(parents=True,mode=0o700,exist_ok=True);root.chmod(0o700)
  ledger=root/'ledger.json'
  db=dbname(base,env)
  if ledger.exists():assert json.loads(ledger.read_text())=={'version':1,'databaseName':db,'entries':[]},'Existing completion ledger cannot be reset'
  else:writeprivate(ledger,json.dumps({'version':1,'databaseName':db,'entries':[]}).encode())
  if name=='review':
   service=pwd.getpwnam('jiayicare-review')
   os.chown(root,0,service.pw_gid);root.chmod(0o750)
   os.chown(ledger,0,service.pw_gid);ledger.chmod(0o640)
  localroot=pathlib.Path(env.get('UPLOADS_DIR') or str(base.parent/'uploads')).resolve();assert localroot.is_dir()
  origins=['https://jiaycare.com','https://app.joinwehealth.com','https://admin.jiaycare.com','https://staff.jiaycare.com']
  storage={'localRoot':str(localroot),'uploadOrigins':origins,'ossOrigins':[]}
  if name=='review':
   storage.update(objectKeyStorage='local',localReferencePrefixes=['/api/review-files/','/review-api/review-files/'])
  else:
   assert env.get('OSS_BUCKET') and env.get('OSS_REGION')
   endpoint=env.get('OSS_ENDPOINT') or 'https://'+env['OSS_REGION']+'.aliyuncs.com'
   from urllib.parse import urlparse
   host=urlparse(endpoint if '://' in endpoint else 'https://'+endpoint).hostname
   storage['ossOrigins']=['https://'+env['OSS_BUCKET']+'.'+host,'http://'+env['OSS_BUCKET']+'.'+host]
  updates={'ACCOUNT_DELETION_ENABLED':'false','ACCOUNT_DELETION_POLICY_VERSION':'20261029-v1',
   'ACCOUNT_DELETION_GUARD_ENABLED':'true','ACCOUNT_DELETION_MAINTENANCE_FILE':str(root/'maintenance.lock'),
   'ACCOUNT_DELETION_LEDGER_FILE':str(ledger),'ACCOUNT_DELETION_RECEIPT_SECRET':secrets.token_hex(48),
   'ACCOUNT_DELETION_ARCHIVE_KEY_ID':'20261029-v1',
   'ACCOUNT_DELETION_ARCHIVE_KEYS':json.dumps({'20261029-v1':base64.b64encode(secrets.token_bytes(32)).decode()},separators=(',',':')),
   'ACCOUNT_DELETION_FINANCE_ADMIN_IDS':'',
   'ACCOUNT_DELETION_WRITERS':json.dumps(writers,separators=(',',':')),
   'ACCOUNT_DELETION_STORAGE':json.dumps(storage,separators=(',',':'))}
  (backup/(name+'.env')).write_bytes(old);(backup/(name+'.env')).chmod(0o600)
  lines=[line for line in old.decode().splitlines() if line.split('=',1)[0] not in updates]
  lines += [k+'='+v for k,v in updates.items()]
  writeprivate(filename,('\n'.join(lines)+'\n').encode());changes.append((filename,old))
  results.append({'environment':name,'guardConfigured':True,'keysConfigured':True,'enabled':False,'localRoot':str(localroot),'ledger':str(ledger),'database':db})
 run(['pm2','restart','jiayicare-backend']);health(3000)
 run(['pm2','restart','jiayicare-wecom-archive'])
 run(['systemctl','restart','jiayicare-review-api']);health(3108)
 for name,base,filename,port in specs:
  env={**os.environ,**fileenv(base,filename)}
  result=json.loads(run(['node','scripts/account-deletion-maintenance.js','inspect'],cwd=str(base),env=env))
  assert not result['undeclared'],'Undeclared database writers'
  assert all(r['guardEnabled'] for r in result['states'])
  results[next(i for i,r in enumerate(results) if r['environment']==name)]['writersVerified']=[r['name'] for r in result['states']]
 print(json.dumps({'configured':True,'backup':str(backup),'environments':results}))
except Exception:
 for filename,old in reversed(changes):writeprivate(filename,old)
 if changes:
  run(['pm2','restart','jiayicare-backend']);health(3000)
  run(['pm2','restart','jiayicare-wecom-archive'])
  run(['systemctl','restart','jiayicare-review-api']);health(3108)
 raise
'''
def main():
    rev=sys.argv[1]
    assert len(rev)==40 and all(c in '0123456789abcdef' for c in rev)
    with connect() as c:
        i,o,e=c.exec_command('python3 -',timeout=180);i.write('REV='+repr(rev)+'\n'+REMOTE);i.channel.shutdown_write()
        out=o.read().decode();err=e.read().decode();status=o.channel.recv_exit_status()
        if status:raise RuntimeError(err[-1800:])
        folder=ROOT/'release/apple-deletion-enable-20261029'
        (folder/'configured.json').write_text(out,encoding='utf-8');print(out)
if __name__=='__main__':main()
