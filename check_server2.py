import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('121.40.156.39', username='root', password='Jiayi2026!', timeout=15)

# Check server index.html
stdin, stdout, stderr = client.exec_command('cat /var/www/jiayicare/app/dist/index.html')
out = stdout.read().decode('utf-8', errors='replace')
print("=== SERVER INDEX.HTML ===")
print(out)

# Check if there are any service worker files
stdin, stdout, stderr = client.exec_command('find /var/www/jiayicare/app/dist -name "*.js" | head -20')
out = stdout.read().decode('utf-8', errors='replace')
print("=== ALL JS FILES ===")
print(out)

# Check nginx cache headers
stdin, stdout, stderr = client.exec_command('grep -r "cache" /etc/nginx/sites-enabled/ 2>/dev/null | head -10')
out = stdout.read().decode('utf-8', errors='replace')
print("=== NGINX CACHE HEADERS ===")
print(out)

client.close()
