import sys
from scripts.ssh_config import connect
sys.stdout.reconfigure(encoding='utf-8')
client = connect()

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
