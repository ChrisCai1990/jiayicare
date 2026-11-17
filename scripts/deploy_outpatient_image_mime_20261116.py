"""Deploy the reviewed outpatient image MIME fix without unrelated data migrations."""
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

ROOT = Path(__file__).resolve().parent.parent
EXPECTED_BASE = '253729afe934198d4fa9c5397c027955f2cf0897'
REMOTE = '/var/www/jiayicare'


def git(*args):
    return subprocess.check_output(['git', '-c', f'safe.directory={ROOT.as_posix()}', *args], cwd=ROOT, text=True).strip()


def run(ssh, command, timeout=600):
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode('utf-8', 'replace').strip()
    error = stderr.read().decode('utf-8', 'replace').strip()
    code = stdout.channel.recv_exit_status()
    if output:
        print(output[-4000:])
    if code:
        raise RuntimeError(f'命令失败 ({code}): {command}\n{error[-2000:]}')
    return output


def main():
    if git('status', '--porcelain'):
        raise RuntimeError('本地提交不干净')
    revision = git('rev-parse', 'HEAD')
    if not re.fullmatch(r'[0-9a-f]{40}', revision) or git('merge-base', EXPECTED_BASE, revision) != EXPECTED_BASE:
        raise RuntimeError('发布提交未包含已核验生产版本')
    known_hosts = Path('C:/Users/huawei/.ssh/known_hosts')
    entry = next(line for line in known_hosts.read_text(encoding='utf-8').splitlines()
                 if line.startswith('121.40.156.39 ssh-ed25519 '))
    os.environ['JIAYICARE_SSH_HOST_FINGERPRINT'] = 'SHA256:' + base64.b64encode(
        hashlib.sha256(base64.b64decode(entry.split()[2])).digest()).decode().rstrip('=')
    local_bundle = Path(tempfile.gettempdir()) / f'jiayicare-followup-{uuid.uuid4().hex}.bundle'
    remote_bundle = f'/tmp/jiayicare-followup-{uuid.uuid4().hex}.bundle'
    try:
        subprocess.run(['git', '-c', f'safe.directory={ROOT.as_posix()}', 'bundle', 'create', str(local_bundle), 'HEAD'], cwd=ROOT, check=True)
        with connect() as ssh:
            before = run(ssh, f'cd {REMOTE} && test ! -e .git/index.lock && test -z "$(git status --porcelain --untracked-files=no)" && git rev-parse HEAD', 30)
            if before != EXPECTED_BASE:
                raise RuntimeError(f'生产版本已变化：{before}；停止部署')
            ssh.open_sftp().put(str(local_bundle), remote_bundle)
            try:
                run(ssh, f'cd {REMOTE} && git fetch {remote_bundle} HEAD && git merge --ff-only {revision}', 90)
                if run(ssh, f'cd {REMOTE} && git rev-parse HEAD', 20) != revision:
                    raise RuntimeError('代码同步后的线上版本不一致')
                run(ssh, f'cd {REMOTE}/staff && npm run build', 600)
                if run(ssh, f'cd {REMOTE} && git rev-parse HEAD', 20) != revision:
                    raise RuntimeError('构建期间线上版本已变化')
                run(ssh, 'pm2 restart jiayicare-backend', 45)
                run(ssh, 'curl -fsS --max-time 15 http://127.0.0.1:3000/api/health', 25)
                if run(ssh, f'cd {REMOTE} && git rev-parse HEAD', 20) != revision:
                    raise RuntimeError('健康检查时线上版本已变化')
                print(f'DEPLOYED {revision}')
            finally:
                ssh.exec_command(f'rm -f {remote_bundle}', timeout=15)
    finally:
        local_bundle.unlink(missing_ok=True)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    main()


