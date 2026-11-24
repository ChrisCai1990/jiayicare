"""Build the current commit in an isolated production-host scratch clone."""
import base64
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid
import argparse

from ssh_config import connect

sys.stdout.reconfigure(encoding='utf-8')
parser = argparse.ArgumentParser()
parser.add_argument('--download-dist', action='store_true')
args = parser.parse_args()

ROOT = Path(__file__).resolve().parent.parent
BASE = subprocess.check_output(['git', 'rev-parse', 'production/master'], cwd=ROOT, text=True).strip()
HEAD = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
known_hosts = Path('C:/Users/huawei/.ssh/known_hosts')
entry = next(line for line in known_hosts.read_text(encoding='utf-8').splitlines()
             if line.startswith('121.40.156.39 ssh-ed25519 '))
os.environ['JIAYICARE_SSH_HOST_FINGERPRINT'] = 'SHA256:' + base64.b64encode(
    hashlib.sha256(base64.b64decode(entry.split()[2])).digest()).decode().rstrip('=')
suffix = uuid.uuid4().hex[:12]
remote_bundle = f'/tmp/combined-push-{suffix}.bundle'
remote_dir = f'/tmp/combined-push-{suffix}'
with tempfile.NamedTemporaryFile(suffix='.bundle', delete=False) as output:
    local_bundle = Path(output.name)
try:
    subprocess.run(['git', 'bundle', 'create', str(local_bundle), 'HEAD', f'^{BASE}'], cwd=ROOT, check=True)
    with connect() as ssh:
        sftp = ssh.open_sftp()
        try:
            sftp.put(str(local_bundle), remote_bundle)
        finally:
            sftp.close()
        script = f'''set -eu
test "$(git -C /var/www/jiayicare rev-parse HEAD)" = "{BASE}"
git clone --shared --no-checkout /var/www/jiayicare {remote_dir} >/dev/null 2>&1
git -C {remote_dir} fetch {remote_bundle} HEAD >/dev/null 2>&1
git -C {remote_dir} checkout --detach {HEAD} >/dev/null 2>&1
ln -s /var/www/jiayicare/node_modules {remote_dir}/node_modules
if test -d /var/www/jiayicare/miniprogram/node_modules; then
  ln -s /var/www/jiayicare/miniprogram/node_modules {remote_dir}/miniprogram/node_modules
fi
cd {remote_dir}
node --test backend/test/combinedPushCheckout.test.js backend/test/combinableProductPushes.test.js backend/test/groupCheckout.test.js backend/test/singleProductPushPayment.test.js
cd staff && npm run build
cd ../miniprogram && npm run build:weapp
node scripts/release-preflight.js
tar -czf /tmp/combined-push-{suffix}-dist.tgz -C {remote_dir}/miniprogram dist project.config.json
'''
        try:
            _, stdout, stderr = ssh.exec_command(script, timeout=600, get_pty=True)
            for line in iter(stdout.readline, ''):
                print(line.rstrip())
            exit_code = stdout.channel.recv_exit_status()
            if exit_code:
                print(stderr.read().decode('utf-8', 'replace'))
                raise SystemExit(exit_code)
            if args.download_dist:
                target = ROOT / '.tmp' / f'combined-push-{HEAD[:12]}-dist.tgz'
                target.parent.mkdir(exist_ok=True)
                sftp = ssh.open_sftp()
                try:
                    sftp.get(f'/tmp/combined-push-{suffix}-dist.tgz', str(target))
                finally:
                    sftp.close()
                print(f'candidate_dist={target}')
        finally:
            ssh.exec_command(f'rm -rf -- {remote_dir} {remote_bundle} /tmp/combined-push-{suffix}-dist.tgz', timeout=60)
finally:
    local_bundle.unlink(missing_ok=True)
