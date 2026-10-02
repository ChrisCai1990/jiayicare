"""Read-only, redacted process and disk preflight for the tenant release."""
from ssh_config import connect
import sys

COMMAND = "cd /var/www/jiayicare && git rev-parse HEAD && git status --porcelain --untracked-files=no && pm2 list --no-color && df -Pk /var/backups/jiayicare"

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    client = connect()
    try:
        _, stdout, stderr = client.exec_command(COMMAND, timeout=20)
        output = stdout.read().decode('utf-8', errors='replace')
        error = stderr.read().decode('utf-8', errors='replace')
        if stdout.channel.recv_exit_status():
            raise RuntimeError(error[-500:])
        print(output)
    finally:
        client.close()
