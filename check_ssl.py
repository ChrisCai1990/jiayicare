import sys
from scripts.ssh_config import connect
sys.stdout.reconfigure(encoding='utf-8')
client = connect()
# Check SSL cert expiry
stdin, stdout, stderr = client.exec_command('echo | openssl s_client -connect jiaycare.com:443 -servername jiaycare.com 2>/dev/null | openssl x509 -noout -dates 2>/dev/null; ls -la /etc/nginx/ssl/')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
client.close()
