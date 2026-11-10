"""Publish the built customer H5 to the existing Apple App URL with an index rollback."""
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
SITE = '/var/www/jiayicare-static/mobile-preview-joinwehealth'
EXPECTED_INDEX_SHA = '40dbb374d7bf942ce7c7e85521a72ec3d3312038dcf39403870d8df0020e22ea'
EXPECTED_SERVER_COMMIT = 'a9474091add'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def remote(client, code):
    stdin, stdout, stderr = client.exec_command('python3 -', timeout=120)
    stdin.write(code)
    stdin.channel.shutdown_write()
    out = stdout.read().decode()
    err = stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(err or out)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    files = {p.relative_to(BUILD).as_posix(): p.read_bytes() for p in BUILD.rglob('*') if p.is_file()}
    assert 'index.html' in files and len(files) > 20
    assert b'/mobile-preview/js/' in files['index.html']
    for marker in [b'name="viewport"', b'viewport-fit=cover', b'/mobile-preview/demo/entry.js', b'weui-tabbar__label']:
        assert marker in files['index.html'], f'Missing mobile H5 safeguard: {marker!r}'
    bundle = b''.join(value for name, value in files.items() if name.endswith('.js'))
    for marker in ['jy_language', '请选择左臂或右臂', 'Systolic pressure']:
        assert marker.encode() in bundle, f'Missing release feature: {marker}'
    digests = {name: sha(data) for name, data in files.items()}
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            assert not name.startswith('/') and '..' not in pathlib.PurePosixPath(name).parts
            z.writestr(name, data)
    payload = archive.getvalue()

    with connect() as client, client.open_sftp() as sftp:
        check = remote(client, f'''import hashlib,json,pathlib,subprocess
site=pathlib.Path({SITE!r})
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rev=subprocess.check_output(['git','-C','/var/www/jiayicare','rev-parse','--short=11','HEAD'],text=True).strip()
print(json.dumps({{'revision':rev,'indexSha':sha(site/'index.html'),'existing':{{name:sha(site/name) for name in {list(files)!r} if (site/name).exists()}}}}))
''')
        current = json.loads(check)
        assert current['revision'] == EXPECTED_SERVER_COMMIT, 'Server source changed'
        assert current['indexSha'] == EXPECTED_INDEX_SHA, 'Live H5 entry changed'
        changed = [name for name, digest in current['existing'].items()
                   if name != 'index.html' and digest != digests[name]]
        assert not changed, f'Immutable asset collision: {changed[:5]}'
        print(json.dumps({'candidateFiles': len(files), 'newAssets': len(files) - len(current['existing']),
                          'sameAssets': len(current['existing']) - 1, 'oldIndex': EXPECTED_INDEX_SHA,
                          'newIndex': digests['index.html'], 'publish': args.publish}))
        if not args.publish:
            return
        stage = '/var/backups/jiayicare-app-h5-parity-20261110-' + digests['index.html'][:12]
        remote(client, f'import pathlib;pathlib.Path({stage!r}).mkdir(mode=0o700)')
        with sftp.open(stage + '/build.zip', 'wb') as dest:
            dest.write(payload)
        result = remote(client, f'''import hashlib,json,os,pathlib,shutil,subprocess,zipfile
site=pathlib.Path({SITE!r});stage=pathlib.Path({stage!r})
expected={digests!r};old={EXPECTED_INDEX_SHA!r};commit={EXPECTED_SERVER_COMMIT!r}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert subprocess.check_output(['git','-C','/var/www/jiayicare','rev-parse','--short=11','HEAD'],text=True).strip()==commit
assert sha(site/'index.html')==old
with zipfile.ZipFile(stage/'build.zip') as z:
 assert set(z.namelist())==set(expected)
 for name,digest in expected.items():assert hashlib.sha256(z.read(name)).hexdigest()==digest
 for name,digest in expected.items():
  if name=='index.html':continue
  target=site/name
  if target.exists():assert sha(target)==digest,'Immutable asset collision: '+name
  else:
   target.parent.mkdir(parents=True,exist_ok=True)
   tmp=target.with_name(target.name+'.parity-new')
   tmp.write_bytes(z.read(name));tmp.chmod(0o644);os.replace(tmp,target)
 backup=stage/'previous-index.html';shutil.copy2(site/'index.html',backup)
 tmp=site/'index.html.parity-new';tmp.write_bytes(z.read('index.html'));tmp.chmod(0o644)
 try:
  assert sha(site/'index.html')==old
  os.replace(tmp,site/'index.html')
  assert sha(site/'index.html')==expected['index.html']
  body=subprocess.check_output(['curl','-fsS','--max-time','20','--noproxy','*','--resolve','app.joinwehealth.com:443:127.0.0.1','https://app.joinwehealth.com/mobile-preview/'])
  assert hashlib.sha256(body).hexdigest()==expected['index.html']
 except:
  rollback=site/'index.html.parity-rollback';shutil.copy2(backup,rollback);os.replace(rollback,site/'index.html')
  raise
print(json.dumps({{'published':True,'backup':str(backup),'filesVerified':len(expected),'indexSha':expected['index.html']}}))
''')
        print(result)


if __name__ == '__main__':
    main()
