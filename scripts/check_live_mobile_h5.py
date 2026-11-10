from pathlib import Path
import re

site = Path('/var/www/jiayicare-static/mobile-preview-joinwehealth')
html = (site / 'index.html').read_text()
print('assets:', re.findall(r'(?:src|href)="([^"]+\.(?:js|css))"', html)[:20])
files = [site / path.removeprefix('/mobile-preview/') for path in re.findall(r'(?:src|href)="([^"]+\.js)"', html)]
print('entry_js:', [path.name for path in files])
data = b''.join(path.read_bytes() for path in files)
for marker in ['左臂', '右臂', '收缩压', '舒张压', 'jy_language', 'English']:
    print(marker, marker.encode() in data)
