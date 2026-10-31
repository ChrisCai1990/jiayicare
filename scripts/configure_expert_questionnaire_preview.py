"""Route public questionnaire URLs to their share-metadata HTML. Use --apply to write."""
import shlex
import sys

from ssh_config import connect


REMOTE = r'''
from pathlib import Path
import datetime
import subprocess

p = Path('/etc/nginx/sites-enabled/jiayicare').resolve()
if not str(p).startswith('/etc/nginx/'):
    raise SystemExit('Unexpected Nginx path')
old = p.read_text()
marker = '# expert-questionnaire-preview-v1'
start = old.index('server_name admin.jiaycare.com;')
end = old.index('\n}', start)
admin = old[start:end]
if 'root /var/www/jiayicare/admin/dist;' not in admin:
    raise SystemExit('Unexpected Admin document root')
if marker in admin:
    print('already configured')
else:
    anchor = old.index('    location = /index.html {', start, end)
    block = """    # expert-questionnaire-preview-v1
    location ^~ /expert-questionnaire/ {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        try_files /expert-questionnaire.html =404;
    }

"""
    new = old[:anchor] + block + old[anchor:]
    if APPLY:
        if not Path('/var/www/jiayicare/admin/dist/expert-questionnaire.html').is_file():
            raise SystemExit('Questionnaire HTML is not deployed')
        backups = Path('/etc/nginx/expert-questionnaire-preview-backups')
        backups.mkdir(exist_ok=True)
        backup = backups / ('jiayicare.' + datetime.datetime.now().strftime('%Y%m%d%H%M%S') + '.bak')
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
    else:
        print('dry run: questionnaire preview route ready')
'''


if __name__ == '__main__':
    client = connect()
    try:
        command = 'python3 -c ' + shlex.quote('APPLY = ' + repr('--apply' in sys.argv) + '\n' + REMOTE)
        _, out, err = client.exec_command(command, timeout=30)
        print(out.read().decode())
        print(err.read().decode())
        raise SystemExit(out.channel.recv_exit_status())
    finally:
        client.close()
