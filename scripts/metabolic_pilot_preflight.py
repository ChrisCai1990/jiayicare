"""Read-only production checks for the metabolic pilot release. Prints no credentials or patient data."""
import json
from ssh_config import connect

COMMANDS = [
    ('production_revision', 'cd /var/www/jiayicare && git rev-parse HEAD && git status --porcelain --untracked-files=no'),
    ('health', 'curl --fail --silent http://127.0.0.1:3000/api/health'),
    ('pilot_auth', 'curl --silent -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/metabolic-pilot/admin'),
]
client = connect()
try:
    for label, command in COMMANDS:
        _, stdout, stderr = client.exec_command(command, timeout=20)
        output = stdout.read().decode('utf-8', 'replace').strip()
        code = stdout.channel.recv_exit_status()
        print(json.dumps({'check': label, 'exit': code, 'result': output}, ensure_ascii=False))
finally:
    client.close()
