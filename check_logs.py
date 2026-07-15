import sys
from scripts.ssh_config import connect
sys.stdout.reconfigure(encoding='utf-8')
client = connect()
stdin, stdout, stderr = client.exec_command('pm2 logs jiayicare-backend --lines 50 --nostream 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
print(out[-3000:])
client.close()
