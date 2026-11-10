"""Publish a read-only diagnostic entry without changing the live Apple H5 entry."""
import argparse
import hashlib
import pathlib
import re

from ssh_config import connect

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILD = ROOT / 'miniprogram' / 'dist'
SITE = '/var/www/jiayicare-static/mobile-preview-joinwehealth'
LIVE_SHA = '11f40a8f3d049968f8513b08647d5bebbe0d65e4bdf161438149cf5844cdc2cb'
CANDIDATE_SHA = '7b47285ec9bddd727572f3c6a87a99523fb04660a116e79c1b477ecb863103d7'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def remote(client, code):
    stdin, stdout, stderr = client.exec_command('python3 -', timeout=60)
    stdin.write(code)
    stdin.channel.shutdown_write()
    output = stdout.read().decode()
    error = stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error or output)
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    original = (BUILD / 'index.html').read_bytes()
    assert sha(original) == CANDIDATE_SHA, 'Candidate build changed'
    html = original.decode('utf-8')
    assets = re.findall(r'(?:src|href)="(/mobile-preview/(?:js|css)/[^"]+)"', html)
    assert len(assets) >= 3
    diagnostic = '''<meta name="robots" content="noindex,nofollow"><script>
window.__h5DiagnosticErrors=[];
function showH5DiagnosticError(message){
  window.__h5DiagnosticErrors.push(String(message));
  var banner=document.getElementById('h5-diagnostic-banner');
  if(banner){banner.textContent='诊断版错误：'+String(message).slice(0,500);banner.style.background='#b42318';}
}
window.addEventListener('error',function(event){showH5DiagnosticError(event.message||event.target&&event.target.src||'资源加载失败')},true);
window.addEventListener('unhandledrejection',function(event){showH5DiagnosticError(event.reason&&event.reason.stack||event.reason||'请求或脚本失败')});
</script>'''
    html = html.replace('</head>', diagnostic + '</head>')
    html = html.replace('<body>', '<body><div id="h5-diagnostic-banner" style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#1e6b50;color:#fff;padding:5px 8px;font:12px/1.4 sans-serif">诊断版 · 正式 App 未更改</div>')
    payload = html.encode('utf-8')
    with connect() as client, client.open_sftp() as sftp:
        check = remote(client, f'''import hashlib,pathlib
site=pathlib.Path({SITE!r})
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(site/'index.html')=={LIVE_SHA!r},'Live entry changed'
assets={assets!r}
assert all((site / path.removeprefix('/mobile-preview/')).exists() for path in assets),'Candidate asset missing'
target=site/'diagnostic/index.html'
assert not target.exists() or sha(target)=={sha(payload)!r},'Different diagnostic entry exists'
print('diagnostic-ready')
''')
        print(check.strip(), 'sha=', sha(payload), 'publish=', args.publish)
        if not args.publish:
            return
        remote(client, f'''import pathlib
pathlib.Path({SITE!r},'diagnostic').mkdir(mode=0o755,exist_ok=True)
''')
        target = SITE + '/diagnostic/index.html'
        with sftp.open(target + '.tmp', 'wb') as handle:
            handle.write(payload)
        verify = remote(client, f'''import hashlib,os,pathlib
site=pathlib.Path({SITE!r})
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(site/'index.html')=={LIVE_SHA!r}
tmp=site/'diagnostic/index.html.tmp';target=site/'diagnostic/index.html'
assert sha(tmp)=={sha(payload)!r}
os.replace(tmp,target)
assert sha(target)=={sha(payload)!r}
print('diagnostic-published',sha(target))
''')
        print(verify.strip())


if __name__ == '__main__':
    main()
