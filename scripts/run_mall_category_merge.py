"""Run the guarded mall category merger against the pinned production host."""
import base64
import hashlib
import os
from pathlib import Path
import shlex
import sys
import uuid

from ssh_config import connect

sys.stdout.reconfigure(encoding='utf-8')
known_hosts = Path('C:/Users/huawei/.ssh/known_hosts')
entry = next(line for line in known_hosts.read_text(encoding='utf-8').splitlines()
             if line.startswith('121.40.156.39 ssh-ed25519 '))
os.environ['JIAYICARE_SSH_HOST_FINGERPRINT'] = 'SHA256:' + base64.b64encode(
    hashlib.sha256(base64.b64decode(entry.split()[2])).digest()).decode().rstrip('=')

source = Path(__file__).resolve().parents[1] / 'backend/scripts/mergeMallCategories20261116.js'
remote = '/tmp/mergeMallCategories20261116-' + uuid.uuid4().hex + '.js'
apply = '--apply' in sys.argv
with connect() as ssh:
    sftp = ssh.open_sftp()
    try:
        sftp.put(str(source), remote)
        command = ('cd /var/www/jiayicare/backend && '
                   'NODE_PATH=/var/www/jiayicare/node_modules node ' + shlex.quote(remote))
        if apply:
            command += ' --apply'
        _, stdout, stderr = ssh.exec_command(command, timeout=90)
        output = stdout.read().decode('utf-8', 'replace')
        error = stderr.read().decode('utf-8', 'replace')
        print(output)
        if stdout.channel.recv_exit_status():
            raise SystemExit(error or 'Remote command failed')
    finally:
        sftp.remove(remote)
        sftp.close()
