import sys
from scripts.ssh_config import connect
sys.stdout.reconfigure(encoding='utf-8')
client = connect()
stdin, stdout, stderr = client.exec_command('curl -v --max-time 5 http://localhost/index.html 2>&1 | head -30')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
client.close()
