import sys
from scripts.ssh_config import connect
sys.stdout.reconfigure(encoding='utf-8')
client = connect()
stdin, stdout, stderr = client.exec_command('cat /etc/nginx/sites-enabled/jiayicare')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
client.close()
