#!/usr/bin/env python3
"""Publish the App-only Taro H5 preview outside the normal Expo dist tree."""

import hashlib
import json
from pathlib import Path
import time

from ssh_config import connect

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'miniprogram' / 'dist'
STATIC_ROOT = '/var/www/jiayicare-static'


def run(client, command):
    _, out, err = client.exec_command(command, timeout=120)
    output = out.read().decode('utf-8', 'replace')
    failure = err.read().decode('utf-8', 'replace')
    if out.channel.recv_exit_status():
        raise RuntimeError(failure or output or 'Remote command failed')
    return output.strip()


def main():
    html = (SOURCE / 'index.html').read_text(encoding='utf-8')
    if '/mobile-preview/js/' not in html or '/_expo/' in html:
        raise RuntimeError('Expected a Taro H5 build for /mobile-preview/')
    files = [path for path in SOURCE.rglob('*') if path.is_file()]
    if len(files) < 20 or any(path.is_symlink() for path in files):
        raise RuntimeError('Preview build is incomplete or contains symlinks')
    stage = f'{STATIC_ROOT}/mobile-preview.stage.{int(time.time())}'
    manifest = {str(path.relative_to(SOURCE)).replace('\\', '/'): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    client = connect()
    try:
        run(client, f'mkdir -m 755 {stage}')
        sftp = client.open_sftp()
        created = {stage}
        for path in files:
            relative = path.relative_to(SOURCE).as_posix()
            parent = stage
            for component in relative.split('/')[:-1]:
                parent += '/' + component
                if parent not in created:
                    sftp.mkdir(parent, mode=0o755)
                    created.add(parent)
            sftp.put(str(path), stage + '/' + relative)
        with sftp.open(stage + '/manifest.json', 'w') as output:
            output.write(json.dumps(manifest, sort_keys=True))
        remote_script = r'''
import hashlib,json,os,pathlib,shutil,subprocess,sys,tempfile,time
stage=pathlib.Path(sys.argv[1])
target=pathlib.Path('/var/www/jiayicare-static/mobile-preview')
config=pathlib.Path('/etc/nginx/sites-enabled/jiayicare')
manifest=json.loads((stage/'manifest.json').read_text())
for relative,want in manifest.items():
    path=stage/relative
    if '..' in pathlib.PurePosixPath(relative).parts or hashlib.sha256(path.read_bytes()).hexdigest()!=want:
        raise RuntimeError('Preview upload verification failed: '+relative)
(stage/'manifest.json').unlink()
(stage/'apply.py').unlink()
old=config.read_text()
if 'root /var/www/jiayicare/app/dist;' not in old:raise RuntimeError('Unexpected App web root')
marker='    # index.html 不缓存，确保每次部署后用户都能拿到最新 bundle hash'
snippet="""\
    # mobile-preview-static-v1: independent of normal Expo dist deployments
    location = /mobile-preview { return 301 /mobile-preview/; }
    location = /mobile-preview/ {
        alias /var/www/jiayicare-static/mobile-preview/;
        index index.html;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }
    location /mobile-preview/ {
        alias /var/www/jiayicare-static/mobile-preview/;
    }

"""
if 'mobile-preview-static-v1' in old:new=old
elif old.count(marker)==1:new=old.replace(marker,snippet+marker,1)
else:raise RuntimeError('Nginx insertion point changed')
backup=pathlib.Path(tempfile.mkdtemp(prefix='jiayicare-mobile-preview-',dir='/var/backups'))
shutil.copy2(config,backup/'nginx.conf')
had_target=target.exists()
try:
    if had_target:target.rename(backup/'previous-content')
    stage.rename(target)
    config.write_text(new)
    subprocess.run(['nginx','-t'],check=True,capture_output=True)
    subprocess.run(['systemctl','reload','nginx'],check=True,capture_output=True)
    for attempt in range(10):
        response=subprocess.run(['curl','-fsS','--noproxy','*','--resolve','jiaycare.com:443:127.0.0.1','https://jiaycare.com/mobile-preview/'],check=True,capture_output=True).stdout
        if b'/mobile-preview/js/' in response and b'/_expo/' not in response:break
        time.sleep(1)
    else:raise RuntimeError('Preview URL is not serving Taro H5')
    subprocess.run(['curl','-fsS','--noproxy','*','--resolve','jiaycare.com:443:127.0.0.1','https://jiaycare.com/api/health'],check=True,capture_output=True)
except Exception:
    shutil.copy2(backup/'nginx.conf',config)
    if target.exists():target.rename(backup/'failed-content')
    if had_target:(backup/'previous-content').rename(target)
    subprocess.run(['nginx','-t'],check=True,capture_output=True)
    subprocess.run(['systemctl','reload','nginx'],check=True,capture_output=True)
    raise
print(json.dumps({'published':len(manifest),'backup':str(backup)}))
'''
        with sftp.open(stage + '/apply.py', 'w') as output:
            output.write(remote_script)
        sftp.close()
        print(run(client, f'python3 {stage}/apply.py {stage}'))
    finally:
        client.close()


if __name__ == '__main__':
    main()
