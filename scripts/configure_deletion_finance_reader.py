"""Grant the operator-confirmed existing superadmin archive-read access."""
import pathlib
from ssh_config import connect
REMOTE=r'''
import pathlib,subprocess,json,os,time,urllib.request
base=pathlib.Path('/var/www/jiayicare/backend');filename=base/'.env'
admin='6a16c57e95a69ecc5beb57f2';tenant='6abf07fb7e2d2db558e55acb'
def run(args,**kw):return subprocess.check_output(args,stderr=subprocess.PIPE,text=True,**kw).strip()
code=r"""
require('dotenv').config();const m=require('mongoose');
(async()=>{await m.connect(process.env.MONGODB_URI,{autoIndex:false,autoCreate:false});
const a=await m.connection.db.collection('admins').findOne({_id:new m.Types.ObjectId(process.argv[1]),tenantId:new m.Types.ObjectId(process.argv[2]),username:'superadmin',role:'superadmin',staffStatus:{$ne:'inactive'}},{projection:{_id:1,tenantId:1,username:1,role:1,staffStatus:1}});
if(!a)throw Error('Confirmed administrator identity no longer matches');
require('./src/utils/accountDeletionArchiveAccess').authorize(a,{ACCOUNT_DELETION_FINANCE_ADMIN_IDS:String(a._id)});
console.log(JSON.stringify({id:String(a._id),username:a.username,role:a.role,tenantId:String(a.tenantId)}));await m.disconnect();
})().catch(()=>{console.error('ADMIN_IDENTITY_VERIFICATION_FAILED');process.exitCode=1});
"""
identity=json.loads(run(['node','-e',code,admin,tenant],cwd=base))
old=filename.read_bytes();key='ACCOUNT_DELETION_FINANCE_ADMIN_IDS'
env=json.loads(run(['node','-e',"console.log(JSON.stringify(require('dotenv').parse(require('fs').readFileSync('.env'))))"],cwd=base))
assert env.get(key,'') in ['',admin],'Existing archive reader list changed'
backup=pathlib.Path('/var/backups/jiayicare-finance-reader-'+str(int(time.time())));backup.mkdir(mode=0o700)
(backup/'backend.env').write_bytes(old);(backup/'backend.env').chmod(0o600)
lines=[line for line in old.decode().splitlines() if line.split('=',1)[0]!=key];lines.append(key+'='+admin)
def write(data):
 tmp=filename.with_suffix('.env.reader-new');tmp.write_bytes(data);tmp.chmod(0o600);os.replace(tmp,filename)
def healthy():
 for _ in range(25):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3000/api/health',timeout=2) as r:
    if r.status==200:return True
  except Exception:pass
  time.sleep(1)
 return False
try:
 write(('\n'.join(lines)+'\n').encode());run(['pm2','restart','jiayicare-backend']);assert healthy()
 verify=r"""
require('dotenv').config();const f=require('./src/utils/accountDeletionArchiveAccess').authorize;
const a={_id:process.argv[1],tenantId:process.argv[2],role:'superadmin',staffStatus:'active'};
f(a,process.env);let denied=false;try{f({...a,_id:'6a0f210d3b56add47bbd0997'},process.env)}catch(e){denied=e.status===403}
if(!denied)process.exit(2);console.log(JSON.stringify({confirmedAdminAllowed:true,testAdminDenied:true,intakeEnabled:process.env.ACCOUNT_DELETION_ENABLED==='true'}));
"""
 result=json.loads(run(['node','-e',verify,admin,tenant],cwd=base))
 print(json.dumps({'identity':identity,'verification':result,'backup':str(backup),'health':True}))
except Exception:
 write(old);run(['pm2','restart','jiayicare-backend']);healthy();raise
'''
with connect() as c:
 i,o,e=c.exec_command('python3 -',timeout=150);i.write(REMOTE);i.channel.shutdown_write()
 output=o.read().decode();error=e.read().decode()
 if o.channel.recv_exit_status():raise RuntimeError(error[-1000:])
 print(output)
 pathlib.Path('release/apple-deletion-enable-20261029/finance-reader.json').write_text(output,encoding='utf-8')
