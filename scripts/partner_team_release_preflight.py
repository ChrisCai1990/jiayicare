"""Read-only production revision and feature-flag preflight for partner accounting."""
import base64
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys

from ssh_config import connect

parser = argparse.ArgumentParser()
parser.add_argument('--deploy', action='store_true')
args = parser.parse_args()

known_hosts = Path('C:/Users/huawei/.ssh/known_hosts')
entry = next(line for line in known_hosts.read_text(encoding='utf-8').splitlines()
             if line.startswith('121.40.156.39 ssh-ed25519 '))
os.environ['JIAYICARE_SSH_HOST_FINGERPRINT'] = 'SHA256:' + base64.b64encode(
    hashlib.sha256(base64.b64decode(entry.split()[2])).digest()).decode().rstrip('=')

command = '''cd /var/www/jiayicare && git rev-parse HEAD && git status --porcelain --untracked-files=no &&
if grep -q '^STARTUP_SCHEMA_WRITES_ENABLED=false' backend/.env; then echo SCHEMA_WRITES_DISABLED; else echo SCHEMA_WRITES_NOT_DISABLED; fi &&
if grep -q '^MARKET_PARTNER_ENABLED=true' backend/.env; then echo PARTNER_ENV_FILE_ENABLED; else echo PARTNER_ENV_FILE_NOT_ENABLED; fi &&
pm2 jlist | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const p=JSON.parse(s).find(x=>x.name==='jiayicare-backend');if(!p)process.exit(2);console.log('PARTNER_PM2_'+String(p.pm2_env.MARKET_PARTNER_ENABLED||p.pm2_env.env?.MARKET_PARTNER_ENABLED||'unset'));console.log('SCHEMA_PM2_'+String(p.pm2_env.STARTUP_SCHEMA_WRITES_ENABLED||p.pm2_env.env?.STARTUP_SCHEMA_WRITES_ENABLED||'unset'))})" &&
cd /var/www/jiayicare/backend && node src/scripts/preparePartnerTeamIndexes.js'''
with connect() as ssh:
    _, stdout, stderr = ssh.exec_command(command, timeout=15)
    print(stdout.read().decode())
    if stderr.read():
        print('Remote stderr present')
    if stdout.channel.recv_exit_status():
        raise SystemExit('生产预检失败，停止部署')

if args.deploy:
    raise SystemExit(subprocess.call([sys.executable, str(Path(__file__).with_name('deploy.py')),
        '--partner-team-indexes', '--skip-data-migrations'], env=os.environ))
