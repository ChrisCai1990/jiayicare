"""Restore the verified pre-release Apple H5 entry after user-reported blank screen."""
import pathlib

from ssh_config import connect

site = '/var/www/jiayicare-static/mobile-preview-joinwehealth'
backup = '/var/backups/jiayicare-app-h5-parity-20261110-7b47285ec9bd/previous-index.html'
code = f'''import hashlib, os, pathlib, shutil, subprocess
site=pathlib.Path({site!r})
backup=pathlib.Path({backup!r})
digest=lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
assert digest(site/'index.html') == '7b47285ec9bddd727572f3c6a87a99523fb04660a116e79c1b477ecb863103d7'
assert digest(backup) == '11f40a8f3d049968f8513b08647d5bebbe0d65e4bdf161438149cf5844cdc2cb'
temporary=site/'index.html.white-screen-rollback'
shutil.copy2(backup, temporary)
os.replace(temporary, site/'index.html')
assert digest(site/'index.html') == digest(backup)
body=subprocess.check_output(['curl','-fsS','--max-time','20','--noproxy','*','--resolve','app.joinwehealth.com:443:127.0.0.1','https://app.joinwehealth.com/mobile-preview/'])
assert hashlib.sha256(body).hexdigest() == digest(backup)
print('rollback verified:', digest(backup))
'''
with connect() as client:
    stdin, stdout, stderr = client.exec_command('python3 -', timeout=60)
    stdin.write(code)
    stdin.channel.shutdown_write()
    print(stdout.read().decode(), end='')
    error = stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error)
