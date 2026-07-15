import sys
from scripts.ssh_config import connect
sys.stdout.reconfigure(encoding='utf-8')
c = connect()
i, o, e = c.exec_command('cat /var/www/jiayicare/app/dist/index.html | grep script')
print(o.read().decode('utf-8', errors='replace'))
c.close()
