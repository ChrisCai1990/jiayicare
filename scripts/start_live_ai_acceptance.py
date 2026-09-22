"""Explicitly authorized local acceptance only; remote credential stays in memory."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
from ssh_config import connect

if os.environ.get('ALLOW_SHARED_QWEN_ACCEPTANCE') != 'true':
    raise SystemExit('Explicit shared-Qwen approval required')
root = Path(__file__).resolve().parent.parent
remote = "const fs=require('fs');const e=require('dotenv').parse(fs.readFileSync('/var/www/jiayicare/backend/.env'));process.stdout.write(JSON.stringify({key:e.QWEN_API_KEY||''}));"
ssh = connect()
try:
    _, output, _ = ssh.exec_command('cd /var/www/jiayicare/backend && node -e ' + shlex.quote(remote), timeout=20)
    if output.channel.recv_exit_status() != 0:
        raise SystemExit('Credential acquisition failed; output suppressed')
    key = json.loads(output.read().decode())['key']
finally:
    ssh.close()
if not key:
    raise SystemExit('Configured Qwen credential missing')
env = {k: v for k, v in os.environ.items() if k.upper() in {'PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'NODE_PATH'}}
env['RUN_ISOLATED_ACCEPTANCE'] = 'true'
if len(sys.argv) > 1:
    env['ISOLATED_ACCEPTANCE_SESSION'] = sys.argv[1]
process = subprocess.Popen(['node', 'backend/test/integration/startLiveAiAcceptance.js'], cwd=root, env=env, stdin=subprocess.PIPE)
process.stdin.write((key + '\n').encode())
process.stdin.close()
del key
try:
    sys.exit(process.wait())
except KeyboardInterrupt:
    process.terminate()
    process.wait()
