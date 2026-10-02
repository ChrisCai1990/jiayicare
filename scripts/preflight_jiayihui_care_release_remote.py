"""Read-only, redacted process and disk preflight for the tenant release."""
from ssh_config import connect
import sys
import json

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
        _, proc_out, proc_err = client.exec_command('pm2 jlist', timeout=20)
        processes = json.loads(proc_out.read().decode('utf-8'))
        if proc_out.channel.recv_exit_status():
            raise RuntimeError(proc_err.read().decode('utf-8')[-500:])
        production = next(row for row in processes if row['name'] == 'jiayicare-backend')
        production_uri = production['pm2_env'].get('MONGODB_URI') or production['pm2_env'].get('env', {}).get('MONGODB_URI')
        for row in processes:
            if row['name'].startswith('jiayicare-staging'):
                uri = row['pm2_env'].get('MONGODB_URI') or row['pm2_env'].get('env', {}).get('MONGODB_URI')
                print(f"{row['name']}: shares_production_database={bool(uri and uri == production_uri)}")
    finally:
        client.close()
