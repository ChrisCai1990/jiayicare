"""Expose the committed Google Search Console verification file safely. Use --apply to change Nginx."""
import shlex
import sys

from ssh_config import connect


remote = r'''
from pathlib import Path
import datetime
import subprocess

p = Path('/etc/nginx/sites-enabled/jiayicare').resolve()
if not str(p).startswith('/etc/nginx/'):
    raise SystemExit('Unexpected nginx path')
old = p.read_text()
marker = '# google-search-console-verification-v1'
block = """    # google-search-console-verification-v1
    location = /google7ba2a313c5c3a555.html {
        alias /var/www/jiayicare-static/knowledge/google7ba2a313c5c3a555.html;
        default_type text/html;
        add_header Cache-Control "no-store";
    }
"""
if marker in old:
    print('already configured')
else:
    anchor = '    # App, mini-program and website share this confirmed public policy URL.'
    if anchor not in old:
        raise SystemExit('Expected Nginx insertion point was not found')
    new = old.replace(anchor, block + anchor, 1)
    if not APPLY:
        print('dry run: add Google Search Console verification route')
    else:
        backup_dir = Path('/etc/nginx/google-search-console-backups')
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
        print('configured; backup:', backup)
'''


if __name__ == '__main__':
    client = connect()
    try:
        command = 'python3 -c ' + shlex.quote('APPLY = ' + repr('--apply' in sys.argv) + '\n' + remote)
        _, out, err = client.exec_command(command)
        print(out.read().decode())
        print(err.read().decode())
        raise SystemExit(out.channel.recv_exit_status())
    finally:
        client.close()
