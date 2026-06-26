import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('121.40.156.39', username='root', password='Jiayi2026!', timeout=15)
# Check if app dist files exist and nginx config for jiaycare.com
stdin, stdout, stderr = client.exec_command('ls /var/www/jiayicare/app/dist/ | head -5; echo "---"; cat /etc/nginx/sites-enabled/jiayicare 2>/dev/null || cat /etc/nginx/conf.d/jiayicare.conf 2>/dev/null | head -60')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
client.close()
