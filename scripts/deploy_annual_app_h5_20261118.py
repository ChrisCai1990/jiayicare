"""Publish one verified H5 build to the installed Apple and Huawei App entries."""
import argparse
import hashlib
import io
import json
import pathlib
import sys
import zipfile

from ssh_config import connect

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILD = ROOT / 'miniprogram' / 'dist'
SITES = {
    'apple': ('/var/www/jiayicare-static/mobile-preview-joinwehealth', 'app.joinwehealth.com', '4a7c64a9a62bb0bac2e47e143fa8dd857ab9736c45aa0c64dc5227e4f9d9db7f'),
    'huawei': ('/var/www/jiayicare-static/mobile-preview', 'jiaycare.com', '44bf6c3b6e8066a3bebdfa1a63de94b9e972b310b98bf40e0dee191e657a0df0'),
}
ASSET_DIR = 'releases/annual-20261118'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def remote(client, code):
    stdin, stdout, stderr = client.exec_command('python3 -', timeout=120)
    stdin.channel.sendall(code.encode('utf-8'))
    stdin.channel.shutdown_write()
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    if stdout.channel.recv_exit_status():
        raise RuntimeError(err or out)
    return out.strip()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    files = {p.relative_to(BUILD).as_posix(): p.read_bytes() for p in BUILD.rglob('*') if p.is_file()}
    assert 'index.html' in files and len(files) > 20
    assert b'/mobile-preview/releases/annual-20261118/js/' in files['index.html'] and b'/mobile-preview/demo/entry.js' in files['index.html']
    bundle = b''.join(value for name, value in files.items() if name.endswith('.js'))
    for marker in ('需要您完成', '本次安排', 'jiayicare:push-open', '年度体检'):
        assert marker.encode() in bundle, f'Missing app feature: {marker}'
    digests = {name: sha(data) for name, data in files.items()}
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zipped:
        for name, data in files.items():
            assert not name.startswith('/') and '..' not in pathlib.PurePosixPath(name).parts
            zipped.writestr(name, data)
    stage = '/var/backups/jiayicare-app-annual-h5-20261118-' + digests['index.html'][:12]
    with connect() as client:
        check = json.loads(remote(client, f'''import hashlib,json,pathlib
sites={SITES!r};expected={digests!r};asset_dir={ASSET_DIR!r}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
result={{}}
for name,(path,domain,old) in sites.items():
 site=pathlib.Path(path)
 current=sha(site/'index.html')
 if current!=old: raise RuntimeError(name+' App entry changed; review latest release first')
 collisions=[rel for rel,digest in expected.items() if rel!='index.html' and (site/asset_dir/rel).exists() and sha(site/asset_dir/rel)!=digest]
 if collisions: raise RuntimeError(name+' immutable asset collision: '+repr(collisions[:5]))
 result[name]={{'oldIndex':current,'newAssets':sum(1 for rel in expected if not (site/asset_dir/rel).exists())}}
print(json.dumps(result))
'''))
        print(json.dumps({'publish': args.publish, 'files': len(files), 'newIndex': digests['index.html'], 'sites': check}))
        if not args.publish:
            return
        remote(client, f'import pathlib;pathlib.Path({stage!r}).mkdir(mode=0o700)')
        with client.open_sftp() as sftp:
            with sftp.open(stage + '/build.zip', 'wb') as dest:
                dest.write(archive.getvalue())
        receipt = remote(client, f'''import hashlib,json,os,pathlib,shutil,subprocess,zipfile
sites={SITES!r};expected={digests!r};stage=pathlib.Path({stage!r});asset_dir={ASSET_DIR!r}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
with zipfile.ZipFile(stage/'build.zip') as zipped:
 assert set(zipped.namelist())==set(expected)
 for rel,digest in expected.items(): assert hashlib.sha256(zipped.read(rel)).hexdigest()==digest
 for name,(path,domain,old) in sites.items():
  site=pathlib.Path(path)
  assert sha(site/'index.html')==old, name+' App entry changed during upload'
  for rel,digest in expected.items():
   if rel=='index.html': continue
   target=site/asset_dir/rel
   if target.exists(): assert sha(target)==digest, name+' asset collision: '+rel
 for name,(path,domain,old) in sites.items():
  site=pathlib.Path(path)
  backup=stage/(name+'-previous-index.html')
  shutil.copy2(site/'index.html',backup)
  for rel,digest in expected.items():
   if rel=='index.html': continue
   target=site/asset_dir/rel
   if not target.exists():
    target.parent.mkdir(parents=True,exist_ok=True)
    tmp=target.with_name(target.name+'.annual-new')
    tmp.write_bytes(zipped.read(rel));tmp.chmod(0o644);os.replace(tmp,target)
 try:
  for name,(path,domain,old) in sites.items():
   site=pathlib.Path(path)
   tmp=site/'index.html.annual-new'
   tmp.write_bytes(zipped.read('index.html'));tmp.chmod(0o644)
   os.replace(tmp,site/'index.html')
  for name,(path,domain,old) in sites.items():
   site=pathlib.Path(path)
   assert sha(site/'index.html')==expected['index.html']
   body=subprocess.check_output(['curl','-fsS','--max-time','20','--noproxy','*','--resolve',domain+':443:127.0.0.1','https://'+domain+'/mobile-preview/'])
   assert hashlib.sha256(body).hexdigest()==expected['index.html'], name+' public entry mismatch'
 except:
  for name,(path,domain,old) in sites.items():
   site=pathlib.Path(path);backup=stage/(name+'-previous-index.html')
   if backup.exists():
    tmp=site/'index.html.annual-rollback';shutil.copy2(backup,tmp);os.replace(tmp,site/'index.html')
  raise
print(json.dumps({{'published':True,'indexSha':expected['index.html'],'backup':str(stage),'filesVerified':len(expected),'sites':list(sites)}}))
''')
        print(receipt)

if __name__ == '__main__':
    main()
