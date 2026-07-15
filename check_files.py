import sys
from scripts.ssh_config import connect
sys.stdout.reconfigure(encoding='utf-8')
client = connect()
# Check if app dist files exist and nginx config for jiaycare.com
stdin, stdout, stderr = client.exec_command('ls /var/www/jiayicare/app/dist/ | head -5; echo "---"; cat /etc/nginx/sites-enabled/jiayicare 2>/dev/null || cat /etc/nginx/conf.d/jiayicare.conf 2>/dev/null | head -60')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
client.close()
