"""Deploy the reviewed Admin category UI from the production-aligned commit."""
import base64
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

from ssh_config import connect

sys.stdout.reconfigure(encoding='utf-8')
repo = Path(__file__).resolve().parents[1]
git_prefix = ['git', '-c', 'safe.directory=' + str(repo).replace('\\', '/')]
def git(*args):
    return subprocess.check_output([*git_prefix, *args], cwd=repo, text=True).strip()

if git('status', '--porcelain'):
    raise SystemExit('Local worktree must be clean')
revision, base = git('rev-parse', 'HEAD'), git('rev-parse', 'HEAD^')
if not all(re.fullmatch(r'[a-f0-9]{40}', x) for x in (revision, base)):
    raise SystemExit('Invalid Git revision')

known_hosts = Path('C:/Users/huawei/.ssh/known_hosts')
entry = next(line for line in known_hosts.read_text(encoding='utf-8').splitlines()
             if line.startswith('121.40.156.39 ssh-ed25519 '))
os.environ['JIAYICARE_SSH_HOST_FINGERPRINT'] = 'SHA256:' + base64.b64encode(
    hashlib.sha256(base64.b64decode(entry.split()[2])).digest()).decode().rstrip('=')

with tempfile.NamedTemporaryFile(suffix='.bundle', delete=False) as tmp:
    bundle = Path(tmp.name)
remote_bundle = '/tmp/mall-category-admin-' + revision[:12] + '.bundle'
try:
    subprocess.run([*git_prefix, 'bundle', 'create', str(bundle), 'HEAD', '^' + base], cwd=repo, check=True)
    with connect() as ssh:
        def run(command, timeout=120):
            _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
            output = stdout.read().decode('utf-8', 'replace').strip()
            error = stderr.read().decode('utf-8', 'replace').strip()
            if stdout.channel.recv_exit_status():
                raise RuntimeError(error or output or 'Remote command failed')
            if output:
                print(output)
            return output
        current = run('cd /var/www/jiayicare && git rev-parse HEAD && git status --porcelain --untracked-files=no')
        if current != base:
            raise RuntimeError(f'Production head or status changed: {current}')
        sftp = ssh.open_sftp()
        try:
            sftp.put(str(bundle), remote_bundle)
        finally:
            sftp.close()
        try:
            run('cd /var/www/jiayicare && mkdir -p backups && '
                'tar -czf backups/admin-dist-before-mall-category-' + revision[:12] + '.tar.gz -C admin dist')
            run('cd /var/www/jiayicare && git fetch ' + remote_bundle + ' HEAD && git merge --ff-only ' + revision)
            run('cd /var/www/jiayicare/admin && npm run build', timeout=600)
            run('cd /var/www/jiayicare/admin/dist && '
                'sed -i -E \'s#(src|href)="(/assets/[^"?]+)(\\?[^\"]*)?"#\\1="\\2?v=' + revision + '"#g\' index.html')
            final = run('cd /var/www/jiayicare && git rev-parse HEAD')
            if final != revision:
                raise RuntimeError('Production revision mismatch after build')
            print('deployed_admin_revision=' + final)
        finally:
            ssh.exec_command('rm -f ' + remote_bundle, timeout=15)
finally:
    bundle.unlink(missing_ok=True)
