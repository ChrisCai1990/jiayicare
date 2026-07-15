import sys
from scripts.ssh_config import connect
sys.stdout.reconfigure(encoding='utf-8')
client = connect()
stdin, stdout, stderr = client.exec_command('nginx -t 2>&1; systemctl status nginx --no-pager -l | head -15')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
print(err)
client.close()
