"""Exercise deployed review-service stop/restore guard without deleting data."""
import pathlib
from ssh_config import connect
REMOTE=r'''
import pathlib,subprocess,json,os,time,urllib.request
base='/var/www/jiayicare-review/backend'
envfile='/var/www/jiayicare-secrets/review-backend.env'
p=subprocess.run(['node','-e',"console.log(JSON.stringify(require('dotenv').parse(require('fs').readFileSync(process.argv[1]))))",envfile],cwd=base,capture_output=True,text=True,check=True)
env={**os.environ,**json.loads(p.stdout)}
assert env['REVIEW_ENVIRONMENT']=='isolated'
assert env['ACCOUNT_DELETION_ENABLED']=='false'
lock=pathlib.Path(env['ACCOUNT_DELETION_MAINTENANCE_FILE']);assert not lock.exists()
def run(action):
 p=subprocess.run(['node','scripts/account-deletion-maintenance.js',action],cwd=base,env=env,capture_output=True,text=True,timeout=90)
 if p.returncode:raise RuntimeError(action+': '+p.stderr[-400:])
 return json.loads(p.stdout)
result={'environment':'review','deletesPerformed':False}
try:
 result['acquire']=run('acquire');result['status']=run('status')
finally:
 if lock.exists():
  if json.loads(lock.read_text())['state']=='stopping':run('resume')
  result['release']=run('release')
healthy=False
for _ in range(25):
 try:
  with urllib.request.urlopen('http://127.0.0.1:3108/api/health',timeout=2) as r:healthy=r.status==200
  if healthy:break
 except Exception:pass
 time.sleep(1)
assert healthy and not lock.exists()
result['health']=healthy;print(json.dumps(result))
'''
with connect() as c:
 i,o,e=c.exec_command('python3 -',timeout=240);i.write(REMOTE);i.channel.shutdown_write()
 output=o.read().decode();error=e.read().decode()
 if o.channel.recv_exit_status():raise RuntimeError(error[-1200:])
 print(output)
 pathlib.Path('release/apple-deletion-enable-20261029/review-maintenance.json').write_text(output,encoding='utf-8')
