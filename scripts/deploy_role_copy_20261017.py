"""Publish only the committed role-copy artifacts, with hash guards and rollback."""
import pathlib,subprocess,json,hashlib,time
from ssh_config import connect
ROOT=pathlib.Path(__file__).resolve().parents[1]
PACK=ROOT/'release/role-copy-20261017'
sha=lambda b:hashlib.sha256(b).hexdigest()
files=json.loads((PACK/'manifest.json').read_text(encoding='utf-8'))
commit=subprocess.check_output(['git','-c','safe.directory='+ROOT.as_posix(),'rev-parse','HEAD'],cwd=ROOT,text=True).strip()
for f in files:
 rel='release/role-copy-20261017/candidate/'+f['name']
 assert sha(subprocess.check_output(['git','-c','safe.directory='+ROOT.as_posix(),'show',commit+':'+rel],cwd=ROOT))==f['sha']
 assert sha((ROOT/rel).read_bytes())==f['sha']
with connect() as c,c.open_sftp() as s:
 for f in files:
  with s.open(f['oldPath'],'rb') as stream:assert sha(stream.read())==f['oldSha'],'Live baseline changed: '+f['oldPath']
 stage='/var/backups/jiayicare-role-copy-'+str(int(time.time()));s.mkdir(stage,mode=0o700)
 for i,f in enumerate(files):
  f['stage']=str(i)+pathlib.Path(f['name']).suffix
  s.put(str(PACK/'candidate'/f['name']),stage+'/'+f['stage'])
 code='FILES='+repr(files)+'\nSTAGE='+repr(stage)+'\nCOMMIT='+repr(commit)+'\n'+r'''
import pathlib,hashlib,shutil,os,json,subprocess
stage=pathlib.Path(STAGE);changed=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for f in FILES:
 assert sha(pathlib.Path(f['oldPath']))==f['oldSha']
 assert sha(stage/f['stage'])==f['sha']
 if f['name'].endswith('.js'):subprocess.run(['node','--check',str(stage/f['stage'])],check=True,capture_output=True)
try:
 for f in sorted(FILES,key=lambda f:f['kind']!='asset'):
  target=pathlib.Path(f['path']);backup=stage/(f['stage']+'.old')
  if target.exists():
   if f['kind']=='asset':assert sha(target)==f['sha'];continue
   shutil.copy2(target,backup)
  temp=target.with_name(target.name+'.role-copy-new');shutil.copy2(stage/f['stage'],temp);temp.chmod(0o644);os.replace(temp,target)
  changed.append((target,backup if backup.exists() else None))
 for f in FILES:assert sha(pathlib.Path(f['path']))==f['sha']
 for host in ['jiaycare.com','app.joinwehealth.com']:
  subprocess.run(['curl','-fsS','--noproxy','*','--resolve',host+':443:127.0.0.1','https://'+host+'/api/health'],check=True,capture_output=True)
 print(json.dumps({'published':True,'commit':COMMIT,'backup':STAGE,'files':FILES,'healthPassed':True,'backendChanged':False}))
except:
 for target,backup in reversed(changed):
  if backup:shutil.copy2(backup,target)
 # Newly introduced immutable assets are harmless and retained for audit.
 raise
'''
 i,o,e=c.exec_command('python3 -',timeout=60);i.write(code);i.channel.shutdown_write()
 out=o.read().decode();err=e.read().decode()
 if o.channel.recv_exit_status():raise RuntimeError(err or out)
 (ROOT/'role-copy-deployment-result.json').write_text(out,encoding='utf-8')
 result=json.loads(out);print(json.dumps({k:result[k] for k in ['published','commit','backup','healthPassed','backendChanged']}))
