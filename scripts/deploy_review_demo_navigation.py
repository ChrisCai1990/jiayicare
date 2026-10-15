"""Publish only the tested tab-root marker fix, guarded by deployed file hashes."""
import hashlib
import json
import pathlib
import time
from ssh_config import connect

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = ROOT / 'artifacts/review-demo-release-20261015'
OUT = ROOT / 'artifacts/review-demo-navigation-release-20261015'
OUT.mkdir(exist_ok=True)
STATIC = '/var/www/jiayicare-static/mobile-preview-joinwehealth'
files = []
for name, source, target in [
    ('entry.js', ROOT / 'miniprogram/review-demo/entry.js', STATIC + '/demo/entry.js'),
    ('normal-index.html', BASE / 'normal-index.html', STATIC + '/index.html'),
    ('review-index.html', BASE / 'review-index.html', STATIC + '/review/index.html'),
]:
    old = (BASE / name).read_bytes()
    new = source.read_bytes()
    if name.endswith('.html'):
        needle = b'src="/mobile-preview/demo/entry.js"'
        assert new.count(needle) == 1
        new = new.replace(needle, b'src="/mobile-preview/demo/entry.js?v=20261015c"')
    (OUT / name).write_bytes(new)
    files.append({'name': name, 'path': target, 'old': hashlib.sha256(old).hexdigest(),
                  'new': hashlib.sha256(new).hexdigest()})

for engine in ['webkit', 'chromium']:
    result = json.loads((ROOT / f'artifacts/demo-nav-candidate-{engine}-20261015.json').read_text(encoding='utf-8'))
    assert result['passed'] and len(result['steps']) >= 16, engine + ' regression must pass'

with connect() as client, client.open_sftp() as sftp:
    # Check every live baseline before changing any public file.
    for item in files:
        with sftp.open(item['path'], 'rb') as stream:
            assert hashlib.sha256(stream.read()).hexdigest() == item['old'], 'Live baseline changed: ' + item['name']
    stage = '/var/backups/jiayicare-demo-navigation-' + str(int(time.time()))
    sftp.mkdir(stage, mode=0o700)
    for item in files:
        sftp.put(str(OUT / item['name']), stage + '/' + item['name'])
    script = r'''
import pathlib, hashlib, shutil, os, subprocess, json
stage=pathlib.Path(STAGE); items=ITEMS; changed=[]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for item in items:
 assert digest(pathlib.Path(item['path']))==item['old']
 assert digest(stage/item['name'])==item['new']
subprocess.run(['node','--check',str(stage/'entry.js')],check=True,capture_output=True)
try:
 for item in items:
  p=pathlib.Path(item['path']);assert digest(p)==item['old']
  backup=stage/(item['name']+'.old');shutil.copy2(p,backup)
  temp=p.with_name(p.name+'.navigation-new');shutil.copy2(stage/item['name'],temp)
  temp.chmod(0o644);os.replace(temp,p);changed.append((p,backup))
 for item in items:assert digest(pathlib.Path(item['path']))==item['new']
 print(json.dumps({'published':True,'backup':str(stage),'files':items,'backendChanged':False}))
except:
 for p,backup in reversed(changed):shutil.copy2(backup,p)
 raise
'''.replace('STAGE', repr(stage)).replace('ITEMS', repr(files))
    stdin, stdout, stderr = client.exec_command('python3 -', timeout=30)
    stdin.write(script)
    stdin.channel.shutdown_write()
    output, error = stdout.read().decode(), stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error)
    (ROOT / 'artifacts/review-demo-navigation-deploy-20261015.json').write_text(output, encoding='utf-8')
    print(output)
