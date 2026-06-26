import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('121.40.156.39', username='root', password='Jiayi2026!', timeout=15)

new_config = r"""# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name jiaycare.com www.jiaycare.com admin.jiaycare.com staff.jiaycare.com;

    location /.well-known/acme-challenge/ {
        root /var/www/acme-challenge;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# App
server {
    listen 443 ssl;
    http2 on;
    server_name jiaycare.com www.jiaycare.com;

    ssl_certificate     /etc/nginx/ssl/jiaycare.com.fullchain.cer;
    ssl_certificate_key /etc/nginx/ssl/jiaycare.com.key;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/nginx/ssl/jiaycare.com.fullchain.cer;
    resolver 223.5.5.5 223.6.6.6 valid=300s;
    resolver_timeout 5s;

    root /var/www/jiayicare/app/dist;
    index index.html;

    location /api/messages/stream/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400;
        proxy_http_version 1.1;
        add_header X-Accel-Buffering no;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;
    }

    # index.html 不缓存，确保每次部署后用户都能拿到最新 bundle hash
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        expires 0;
        try_files $uri /index.html;
    }

    # 哈希命名的静态资产永久缓存（文件名变了就是新版本）
    location /_expo/static/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Admin
server {
    listen 443 ssl;
    http2 on;
    server_name admin.jiaycare.com;

    ssl_certificate     /etc/nginx/ssl/jiaycare.com.fullchain.cer;
    ssl_certificate_key /etc/nginx/ssl/jiaycare.com.key;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/nginx/ssl/jiaycare.com.fullchain.cer;
    resolver 223.5.5.5 223.6.6.6 valid=300s;
    resolver_timeout 5s;

    root /var/www/jiayicare/admin/dist;
    index index.html;

    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        expires 0;
        try_files $uri /index.html;
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Staff
server {
    listen 443 ssl;
    http2 on;
    server_name staff.jiaycare.com;

    ssl_certificate     /etc/nginx/ssl/jiaycare.com.fullchain.cer;
    ssl_certificate_key /etc/nginx/ssl/jiaycare.com.key;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/nginx/ssl/jiaycare.com.fullchain.cer;
    resolver 223.5.5.5 223.6.6.6 valid=300s;
    resolver_timeout 5s;

    root /var/www/jiayicare/staff/dist;
    index index.html;

    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        expires 0;
        try_files $uri /index.html;
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
"""

# Write config to server
stdin, stdout, stderr = client.exec_command(f'cat > /etc/nginx/sites-enabled/jiayicare << \'NGINXEOF\'\n{new_config}\nNGINXEOF')
stdout.read()
err = stderr.read().decode('utf-8', errors='replace')
if err: print("write error:", err)

# Test nginx config
stdin, stdout, stderr = client.exec_command('nginx -t 2>&1')
result = stdout.read().decode('utf-8', errors='replace') + stderr.read().decode('utf-8', errors='replace')
print("nginx -t:", result)

# Reload if ok
if 'successful' in result or 'ok' in result:
    stdin, stdout, stderr = client.exec_command('nginx -s reload')
    stdout.read()
    print("nginx reloaded OK")
else:
    print("nginx config test FAILED, not reloading")

client.close()
