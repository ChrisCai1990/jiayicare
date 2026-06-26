import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('121.40.156.39', username='root', password='Jiayi2026!', timeout=10)

# Check uploads dir
i,o,e = c.exec_command('ls -la /var/www/jiayicare/uploads/ 2>/dev/null && ls -la /var/www/jiayicare/uploads/reports/ 2>/dev/null || echo "UPLOADS DIR MISSING"')
print("=== UPLOADS DIR ===")
print(o.read().decode('utf-8', errors='replace'))

# Check recent backend errors
i,o,e = c.exec_command('pm2 logs jiayicare-backend --lines 20 --nostream 2>&1 | grep -i "upload\|report\|error\|multer" | tail -10')
print("=== UPLOAD ERRORS ===")
print(o.read().decode('utf-8', errors='replace'))

c.close()
