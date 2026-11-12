"""Read-only public verification of the published App H5 entry and assets."""
import hashlib
import re
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
expected = (root / 'miniprogram' / 'dist' / 'index.html').read_bytes()
url = 'https://app.joinwehealth.com/mobile-preview/'
body = urllib.request.urlopen(url, timeout=20).read()
assert hashlib.sha256(body).digest() == hashlib.sha256(expected).digest(), 'Public entry differs from release'
assets = re.findall(rb'/mobile-preview/(?:js|css)/[^"\']+', body)
assert len(assets) >= 3
for raw in assets[:3]:
    asset = raw.decode()
    with urllib.request.urlopen('https://app.joinwehealth.com' + asset, timeout=20) as response:
        assert response.status == 200
print(f'public_index_sha256={hashlib.sha256(body).hexdigest()} entry_assets_checked={min(3, len(assets))}')
