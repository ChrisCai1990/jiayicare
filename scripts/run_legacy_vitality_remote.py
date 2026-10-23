"""Stream the local migration script to production; default is read-only preview."""

import json
import os
from pathlib import Path

from ssh_config import connect


SCRIPT = Path(__file__).resolve().parents[1] / 'backend' / 'scripts' / 'reclassify-legacy-vitality.js'
APPLY = os.environ.get('APPLY') == '1'


def main():
    client = connect()
    try:
        command = 'cd /var/www/jiayicare/backend && ' + ('APPLY=1 ' if APPLY else '') + 'node -'
        stdin, stdout, stderr = client.exec_command(command, timeout=120)
        stdin.write(SCRIPT.read_text(encoding='utf-8'))
        stdin.channel.shutdown_write()
        output = stdout.read().decode('utf-8')
        error = stderr.read().decode('utf-8')
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError('Historical vitality migration failed: ' + error[:1200])
        print(json.dumps(json.loads(output), ensure_ascii=False, indent=2))
    finally:
        client.close()


if __name__ == '__main__':
    main()
