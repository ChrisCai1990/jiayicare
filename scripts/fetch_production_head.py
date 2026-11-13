"""Fetch the pinned production Git HEAD as an incremental bundle.

This only reads the production repository and writes a temporary bundle under
/tmp. It requires the current local branch's parent revision to be on the
production history; never resets or merges local work automatically.
"""
import base64
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import uuid

from ssh_config import connect

repo = Path(__file__).resolve().parent.parent
base = subprocess.check_output(['git', 'rev-parse', 'HEAD^'], cwd=repo, text=True).strip()
if not re.fullmatch(r'[0-9a-f]{40}', base):
    raise SystemExit('无法确认本地基线')
known_hosts = Path('C:/Users/huawei/.ssh/known_hosts')
entry = next(line for line in known_hosts.read_text(encoding='utf-8').splitlines()
             if line.startswith('121.40.156.39 ssh-ed25519 '))
os.environ['JIAYICARE_SSH_HOST_FINGERPRINT'] = 'SHA256:' + base64.b64encode(
    hashlib.sha256(base64.b64decode(entry.split()[2])).digest()).decode().rstrip('=')

remote_bundle = f'/tmp/jiayicare-production-{uuid.uuid4().hex}.bundle'
with tempfile.NamedTemporaryFile(suffix='.bundle', delete=False) as output:
    local_bundle = Path(output.name)
try:
    with connect() as ssh:
        try:
            command = (f'cd /var/www/jiayicare && git merge-base --is-ancestor {base} HEAD '
                       f'&& git bundle create {remote_bundle} HEAD ^{base} && git rev-parse HEAD')
            _, stdout, stderr = ssh.exec_command(command, timeout=120)
            remote_head = stdout.read().decode().strip()
            if stdout.channel.recv_exit_status() or not re.fullmatch(r'[0-9a-f]{40}', remote_head):
                raise RuntimeError('生产提交不包含本地基线，或创建增量 bundle 失败')
            sftp = ssh.open_sftp()
            try:
                sftp.get(remote_bundle, str(local_bundle))
            finally:
                sftp.close()
        finally:
            ssh.exec_command(f'rm -f {remote_bundle}', timeout=15)
    subprocess.run(['git', 'fetch', str(local_bundle), 'HEAD:refs/remotes/production/master'],
                   cwd=repo, check=True)
    actual = subprocess.check_output(['git', 'rev-parse', 'production/master'], cwd=repo, text=True).strip()
    if actual != remote_head:
        raise RuntimeError('本地获取的生产提交与远端不一致')
    print(f'production/master {actual}')
finally:
    local_bundle.unlink(missing_ok=True)
