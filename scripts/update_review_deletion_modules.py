"""Apply the reviewed deletion adapter fixes using the exact production commit."""
import json,pathlib,sys
from ssh_config import connect
REMOTE=r'''
import pathlib,hashlib,json,subprocess,shutil,os,time,urllib.request
base=pathlib.Path('/var/www/jiayicare-review/backend');prod=pathlib.Path('/var/www/jiayicare')
def run(a):return subprocess.check_output(a,stderr=subprocess.PIPE,text=True).strip()
def sha(b):return hashlib.sha256(b).hexdigest()
assert run(['git','-C',str(prod),'rev-parse','HEAD'])==REV
files={};old={}
for name in ['accountDeletionInventory','accountDeletionRuntime','accountDeletionPersonalData','accountDeletionLedger']:
 rel='src/utils/'+name+'.js';data=(base/rel).read_bytes()
 expected=subprocess.check_output(['git','-C',str(prod),'show','dd5ca900b:backend/'+rel])
 assert sha(data)==sha(expected),'Review source changed: '+rel
 files[rel]=(prod/'backend'/rel).read_bytes();old[rel]=data
rel='src/utils/reviewDemo.js';old[rel]=(base/rel).read_bytes()
baseline=json.loads((prod/'release/apple-deletion-enable-20261029/reviewDemo.baseline.json').read_text())
assert sha(old[rel])==baseline['sha256']
files[rel]=(prod/'release/apple-deletion-enable-20261029/reviewDemo.js').read_bytes()
backup=pathlib.Path('/var/backups/jiayicare-deletion-adapters-'+REV[:12]);backup.mkdir(mode=0o700)
for rel,data in files.items():
 p=backup/pathlib.Path(rel).name;p.write_bytes(old[rel]);p.chmod(0o600)
 tmp=backup/(p.name+'.js');tmp.write_bytes(data);run(['node','--check',str(tmp)])
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
  p=base/rel;assert p.read_bytes()==old[rel]
  tmp=p.with_suffix('.deletion-new');tmp.write_bytes(data);tmp.chmod(0o644);os.replace(tmp,p)
 run(['systemctl','restart','jiayicare-review-api']);health()
 assert all((base/r).read_bytes()==data for r,data in files.items())
 print(json.dumps({'deployed':True,'files':list(files),'backup':str(backup),'health':True}))
except Exception:
 for rel,data in old.items():(base/rel).write_bytes(data)
 run(['systemctl','restart','jiayicare-review-api']);health();raise
'''
def main():
    rev=sys.argv[1];assert len(rev)==40 and all(c in '0123456789abcdef' for c in rev)
    with connect() as c:
        i,o,e=c.exec_command('python3 -',timeout=120);i.write('REV='+repr(rev)+'\n'+REMOTE);i.channel.shutdown_write()
        out=o.read().decode();err=e.read().decode()
        if o.channel.recv_exit_status():raise RuntimeError(err[-1500:])
        p=pathlib.Path(__file__).resolve().parents[1]/'release/apple-deletion-enable-20261029/adapters-deployed.json'
        p.write_text(out,encoding='utf-8');print(out)
if __name__=='__main__':main()
