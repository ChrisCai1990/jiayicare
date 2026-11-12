"""Publish only the reviewed record-summary formatter, preserving other production edits."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess

from ssh_config import connect

ROOT = Path(__file__).resolve().parents[1]
REL = 'backend/src/utils/healthRecordSummary.js'
SITE = '/var/www/jiayicare'
REVISION = 'd44e29d5163b479eb846f9db975edd4623263f62'
STAGE = '/var/backups/jiayicare-monthly-report-20261112'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def remote(client, code):
    stdin, stdout, stderr = client.exec_command('python3 -', timeout=90)
    stdin.write(code)
    stdin.channel.shutdown_write()
    output, error = stdout.read().decode(), stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error or output)
    return output

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    candidate = (ROOT / REL).read_bytes()
    baseline = subprocess.check_output(['git', '-c', f'safe.directory={ROOT.as_posix()}', 'show', f'{REVISION}:{REL}'], cwd=ROOT)
    assert b'changeText' in candidate and sha(candidate) != sha(baseline)
    with open('C:/Users/huawei/.ssh/known_hosts', encoding='utf-8') as known_hosts:
        entry = next(line for line in known_hosts if line.startswith('121.40.156.39 ssh-ed25519 '))
    os.environ['JIAYICARE_SSH_HOST_FINGERPRINT'] = 'SHA256:' + base64.b64encode(
        hashlib.sha256(base64.b64decode(entry.split()[2])).digest()
    ).decode().rstrip('=')
    with connect() as client, client.open_sftp() as sftp:
        check = remote(client, f'''import hashlib,json,pathlib,subprocess
root=pathlib.Path({SITE!r});rel={REL!r}
revision=subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()
status=subprocess.check_output(['git','-C',str(root),'status','--porcelain','--',rel],text=True).strip()
digest=hashlib.sha256((root/rel).read_bytes()).hexdigest()
print(json.dumps({{'revision':revision,'status':status,'sha':digest}}))
''')
        live = json.loads(check)
        assert live == {'revision': REVISION, 'status': '', 'sha': sha(baseline)}, live
        print(json.dumps({'baseline': sha(baseline), 'candidate': sha(candidate), 'publish': args.publish}))
        if not args.publish:
            return
        remote(client, f'''import pathlib
pathlib.Path({STAGE!r}).mkdir(mode=0o700,exist_ok=False)
''')
        with sftp.open(STAGE + '/candidate.js', 'wb') as dest:
            dest.write(candidate)
        result = remote(client, f'''import hashlib,json,os,pathlib,shutil,subprocess,time
root=pathlib.Path({SITE!r});target=root/{REL!r};stage=pathlib.Path({STAGE!r})
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip()=={REVISION!r}
assert sha(target)=={sha(baseline)!r}
assert sha(stage/'candidate.js')=={sha(candidate)!r}
backup=stage/'previous.js';shutil.copy2(target,backup)
tmp=target.with_name(target.stem+'.monthly-new.js')
shutil.copy2(stage/'candidate.js',tmp);tmp.chmod(target.stat().st_mode)
try:
 subprocess.run(['node','--check',str(tmp)],check=True,capture_output=True)
 os.replace(tmp,target)
 subprocess.run(['pm2','restart','jiayicare-backend'],check=True,capture_output=True)
 healthy=False
 for attempt in range(10):
  result=subprocess.run(['curl','-fsS','--max-time','5','http://127.0.0.1:3000/api/health'],capture_output=True)
  if result.returncode==0:healthy=True;break
  time.sleep(2)
 assert healthy,'Backend health check failed'
 assert sha(target)=={sha(candidate)!r}
 print(json.dumps({{'published':True,'fileSha':sha(target),'backup':str(backup),'health':200}}))
except:
 rollback=target.with_name(target.name+'.monthly-rollback');shutil.copy2(backup,rollback);os.replace(rollback,target)
 subprocess.run(['pm2','restart','jiayicare-backend'],check=True,capture_output=True)
 raise
''')
        print(result)

if __name__ == '__main__':
    main()
