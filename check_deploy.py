import sys
from scripts.ssh_config import connect
sys.stdout.reconfigure(encoding='utf-8')
client = connect()

# Check deploy log
stdin, stdout, stderr = client.exec_command('tail -30 /var/log/jiayicare-deploy.log 2>/dev/null || echo "no log"')
out = stdout.read().decode('utf-8', errors='replace')
print("=== DEPLOY LOG ===")
print(out)

# Check which JS bundle exists on server
stdin, stdout, stderr = client.exec_command('ls /var/www/jiayicare/app/dist/_expo/static/js/web/ 2>/dev/null')
out = stdout.read().decode('utf-8', errors='replace')
print("=== SERVER BUNDLES ===")
print(out)

# Check if the bundle contains the fix (useEffect before conditional returns)
stdin, stdout, stderr = client.exec_command('grep -c "showSummary" /var/www/jiayicare/app/dist/_expo/static/js/web/*.js 2>/dev/null | head -3')
out = stdout.read().decode('utf-8', errors='replace')
print("=== BUNDLE CONTENT CHECK ===")
print(out)

client.close()
