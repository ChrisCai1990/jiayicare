"""Targeted production gateway fix; preserves all existing proxy headers. --apply to write."""
import sys
import shlex
from ssh_config import connect

remote = r'''
from pathlib import Path
import subprocess, datetime
p = Path('/etc/nginx/sites-enabled/jiayicare').resolve()
if not str(p).startswith('/etc/nginx/'):
    raise SystemExit('Unexpected nginx path')
old = p.read_text()
marker = '# annual-ai-timeout-v1'
if marker in old:
    print('already configured')
else:
    start = old.index('    location /api/ {')
    end = old.index('\n    }', start) + len('\n    }')
    block = old[start:end]
    if 'proxy_pass http://127.0.0.1:3000;' not in block or block.count('{') != 1:
        raise SystemExit('Unexpected API proxy configuration')
    targeted = block.replace('location /api/', 'location ~ ^/api/staff/patients/[a-fA-F0-9]{24}/ai-annual-plan$')
    # Quote regex: braces in a regex otherwise conflict with nginx block parsing.
    targeted = targeted.replace('location ~ ^/api/staff/patients/[a-fA-F0-9]{24}/ai-annual-plan$', 'location ~ "^/api/staff/patients/[a-fA-F0-9]{24}/ai-annual-plan$"')
    targeted = targeted.replace('\n    }', '\n        proxy_read_timeout 180s;\n    }')
    new = old[:start] + '    ' + marker + '\n' + targeted + '\n' + old[start:]
    if APPLY:
        backup_dir = Path('/etc/nginx/annual-ai-backups')
        backup_dir.mkdir(exist_ok=True)
        backup = backup_dir / (p.name + '.' + datetime.datetime.now().strftime('%Y%m%d%H%M%S') + '.bak')
        backup.write_text(old)
        p.write_text(new)
        try:
            subprocess.run(['nginx', '-t'], check=True)
            subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        except BaseException:
            p.write_text(old)
            subprocess.run(['nginx', '-t'], check=True)
            subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
            raise
        print('configured 180s; backup:', backup)
    else:
        print('dry run: targeted annual AI proxy 180s')
'''
if __name__ == '__main__':
    client = connect()
    try:
        command = 'python3 -c ' + shlex.quote('APPLY = ' + repr('--apply' in sys.argv) + '\n' + remote)
        _, out, err = client.exec_command(command)
        print(out.read().decode()); print(err.read().decode())
        raise SystemExit(out.channel.recv_exit_status())
    finally:
        client.close()
