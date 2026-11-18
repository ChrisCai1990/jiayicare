"""Publish the service-group file picker fix to the Huawei App H5 entry."""
import argparse
import hashlib
import io
import json
import pathlib
import zipfile

from ssh_config import connect

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILD = ROOT / 'miniprogram' / 'dist'
SITE = '/var/www/jiayicare-static/mobile-preview'
DOMAIN = 'jiaycare.com'
OLD_INDEX = '17a7ec3232aa5b54b78ce7685adbc9c00b256634d5b7064556d5eec0557f90cd'
ASSET_DIR = 'releases/group-material-upload-20261118'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def remote(client, code):
    stdin, stdout, stderr = client.exec_command('python3 -', timeout=120)
    stdin.channel.sendall(code.encode())
    stdin.channel.shutdown_write()
    output, error = stdout.read().decode(), stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error or output)
    return output.strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    files = {p.relative_to(BUILD).as_posix(): p.read_bytes() for p in BUILD.rglob('*') if p.is_file()}
    assert 'index.html' in files and len(files) > 20
    assert f'/mobile-preview/{ASSET_DIR}/js/'.encode() in files['index.html']
    assert b'/mobile-preview/demo/entry.js' in files['index.html']
    bundle = b''.join(data for name, data in files.items() if name.endswith('.js'))
    for marker in ('一次最多选择9张图片', '重试提交医疗资料', '本次安排'):
        assert marker.encode() in bundle, marker
    digests = {name: sha(data) for name, data in files.items()}
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zipped:
        for name, data in files.items():
            assert not name.startswith('/') and '..' not in pathlib.PurePosixPath(name).parts
            zipped.writestr(name, data)
    stage = '/var/backups/jiayicare-huawei-group-upload-20261118-' + digests['index.html'][:12]
    with connect() as client:
        check = json.loads(remote(client, f'''import hashlib,json,pathlib
site=pathlib.Path({SITE!r});expected={digests!r};asset_dir={ASSET_DIR!r}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
current=sha(site/'index.html')
if current!={OLD_INDEX!r}: raise RuntimeError('Huawei entry changed; review latest release first: '+current)
collisions=[rel for rel,digest in expected.items() if rel!='index.html' and (site/asset_dir/rel).exists() and sha(site/asset_dir/rel)!=digest]
if collisions: raise RuntimeError('Immutable asset collision: '+repr(collisions[:5]))
print(json.dumps({{'oldIndex':current,'newAssets':sum(1 for rel in expected if rel!='index.html' and not (site/asset_dir/rel).exists())}}))
'''))
        print(json.dumps({'publish': args.publish, 'files': len(files), 'newIndex': digests['index.html'], 'site': check}))
        if not args.publish:
            return
        remote(client, f'import pathlib;pathlib.Path({stage!r}).mkdir(mode=0o700)')
        with client.open_sftp() as sftp:
            with sftp.open(stage + '/build.zip', 'wb') as dest:
                dest.write(archive.getvalue())
        print(remote(client, f'''import hashlib,json,os,pathlib,shutil,subprocess,zipfile
site=pathlib.Path({SITE!r});expected={digests!r};stage=pathlib.Path({stage!r});asset_dir={ASSET_DIR!r}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(site/'index.html')=={OLD_INDEX!r},'Huawei entry changed during upload'
with zipfile.ZipFile(stage/'build.zip') as zipped:
 assert set(zipped.namelist())==set(expected)
 for rel,digest in expected.items(): assert hashlib.sha256(zipped.read(rel)).hexdigest()==digest
 for rel,digest in expected.items():
  if rel=='index.html': continue
  target=site/asset_dir/rel
  if target.exists(): assert sha(target)==digest,'Immutable asset collision: '+rel
 backup=stage/'previous-index.html'
 shutil.copy2(site/'index.html',backup)
 for rel,digest in expected.items():
  if rel=='index.html': continue
  target=site/asset_dir/rel
  if not target.exists():
   target.parent.mkdir(parents=True,exist_ok=True)
   tmp=target.with_name(target.name+'.upload-new')
   tmp.write_bytes(zipped.read(rel));tmp.chmod(0o644);os.replace(tmp,target)
 try:
  tmp=site/'index.html.upload-new'
  tmp.write_bytes(zipped.read('index.html'));tmp.chmod(0o644);os.replace(tmp,site/'index.html')
  assert sha(site/'index.html')==expected['index.html']
  html=subprocess.check_output(['curl','-fsS','--max-time','20','--noproxy','*','--resolve',{DOMAIN!r}+':443:127.0.0.1','https://'+{DOMAIN!r}+'/mobile-preview/'])
  assert hashlib.sha256(html).hexdigest()==expected['index.html']
  for rel,digest in expected.items():
   if rel=='index.html': continue
   assert sha(site/asset_dir/rel)==digest,rel+' asset mismatch'
 except:
  tmp=site/'index.html.upload-rollback';shutil.copy2(backup,tmp);os.replace(tmp,site/'index.html')
  raise
print(json.dumps({{'published':True,'indexSha':expected['index.html'],'backup':str(stage),'assetsVerified':len(expected)-1}}))
'''))


if __name__ == '__main__':
    main()
