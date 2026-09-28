#!/usr/bin/env bash
set -euo pipefail

stage_root=/tmp/jiayicare-corporate-site
site_root=/var/www/jiayicare-static/corporate
app_config=/etc/nginx/sites-enabled/jiayicare
www_config=/etc/nginx/sites-available/jiayicare-www
www_link=/etc/nginx/sites-enabled/jiayicare-www
backup_app=$(mktemp /tmp/jiayicare-nginx-app.XXXXXX)
backup_www=$(mktemp /tmp/jiayicare-nginx-www.XXXXXX)
had_www_config=0
had_www_link=0

cp "$app_config" "$backup_app"
if [ -e "$www_config" ]; then
  cp "$www_config" "$backup_www"
  had_www_config=1
fi
if [ -e "$www_link" ]; then
  had_www_link=1
fi

restore() {
  cp "$backup_app" "$app_config"
  if [ "$had_www_config" -eq 1 ]; then
    cp "$backup_www" "$www_config"
  else
    rm -f "$www_config"
  fi
  if [ "$had_www_link" -eq 0 ]; then
    rm -f "$www_link"
  fi
  nginx -t && systemctl reload nginx || true
}
trap restore ERR

grep -q 'server_name jiaycare.com www.jiaycare.com;' "$app_config"
sed -i '0,/server_name jiaycare\.com www\.jiaycare\.com;/s//server_name jiaycare.com;/' "$app_config"

install -d -m 755 "$site_root"
install -m 644 "$stage_root/index.html" "$site_root/index.html"
install -m 644 "$stage_root/styles.css" "$site_root/styles.css"
install -m 644 "$stage_root/nginx.www.conf" "$www_config"
ln -sfn "$www_config" "$www_link"

nginx -t
systemctl reload nginx
curl -fsS --resolve www.jiaycare.com:443:127.0.0.1 https://www.jiaycare.com/ >/dev/null

trap - ERR
rm -f "$backup_app" "$backup_www"
echo "Corporate website published successfully."
