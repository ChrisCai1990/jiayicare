"""Publish only tested AI label static assets with guarded entry switch and rollback."""
import pathlib,hashlib,json,time,subprocess
from ssh_config import connect
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/ai-label-candidate-20261016'
files=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))['files']
test=json.loads((OUT/'test-result.json').read_text(encoding='utf-8'))
assert test['passed'] and test['assertions']==30
sha=lambda b:hashlib.sha256(b).hexdigest()
for rel in ['scripts/prepare_ai_label_fix_20261016.py','scripts/test_ai_label_fix_20261016.cjs','scripts/deploy_ai_label_fix_20261016.py']:
 assert subprocess.check_output(['git','show','HEAD:'+rel],cwd=ROOT)==(ROOT/rel).read_bytes(),'Commit exact release scripts first'
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
base='/var/www/jiayicare-static/mobile-preview-joinwehealth'
for f in files:
 folder=base+('/review' if f['scope']=='review' else '')+('/js' if f['kind']!='html' else '')
 f['oldPath']=folder+'/'+f['oldName'];f['path']=folder+'/'+f['name']
 f['stageName']=f['scope']+'-'+f['name']
 assert sha((OUT/f['scope']/f['name']).read_bytes())==f['sha']
with connect() as c,c.open_sftp() as s:
 for f in files:
  with s.open(f['oldPath'],'rb') as stream: assert sha(stream.read())==f['oldSha'],'Deployed baseline changed'
 stage='/var/backups/jiayicare-ai-label-'+str(int(time.time()));s.mkdir(stage,mode=0o700)
 for f in files:s.put(str(OUT/f['scope']/f['name']),stage+'/'+f['stageName'])
 script='''
import pathlib,json,hashlib,os,shutil,subprocess
files=FILES;stage=pathlib.Path(STAGE);changed=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for f in files:
 assert sha(pathlib.Path(f['oldPath']))==f['oldSha']
 assert sha(stage/f['stageName'])==f['sha']
 if f['kind']!='html':subprocess.run(['node','--check',str(stage/f['stageName'])],check=True,capture_output=True)
try:
 # Add immutable assets first, then switch both HTML entry points.
 for f in sorted(files,key=lambda f:f['kind']=='html'):
  target=pathlib.Path(f['path']);backup=stage/(f['stageName']+'.old')
  if target.exists():
   if f['kind']!='html':assert sha(target)==f['sha'];continue
   assert sha(target)==f['oldSha'];shutil.copy2(target,backup)
  temp=target.with_name(target.name+'.label-new');shutil.copy2(stage/f['stageName'],temp);temp.chmod(0o644);os.replace(temp,target)
  if f['kind']=='html':changed.append((target,backup))
 for f in files:assert sha(pathlib.Path(f['path']))==f['sha']
 print(json.dumps({'published':True,'backup':str(stage),'commit':COMMIT,'files':files,'backendChanged':False,'realAiEvidence':False}))
except:
 for target,backup in reversed(changed):shutil.copy2(backup,target)
 raise
'''.replace('FILES',repr(files)).replace('STAGE',repr(stage)).replace('COMMIT',repr(commit))
 stdin,stdout,stderr=c.exec_command('python3 -',timeout=60);stdin.write(script);stdin.channel.shutdown_write()
 output,error=stdout.read().decode(),stderr.read().decode()
 if stdout.channel.recv_exit_status():raise RuntimeError(error)
 (ROOT/'artifacts/ai-label-deploy-20261016.json').write_text(output,encoding='utf-8')
 print(json.dumps({'published':True,'commit':commit,'files':len(files),'backendChanged':False}))
